import { z } from "zod";
import { esRol, type Rol } from "@/domain/roles";
import {
  armarContexto,
  instanciasVisibles,
  type Alcance,
  type InstanciaVisible,
  type Membresia,
  type TenantContext,
} from "@/domain/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

// De dónde sale el `TenantContext`. Es el ÚNICO archivo que lee el registro de tenants
// (`clients`, `instances`, `usuarios_clientes`) sin scopear, y tiene que serlo: scopear la tabla
// con la que se resuelve el scope sería circular. Por eso no están en el mapa de `scoped.ts`.
//
// Desde ADR-051 el acceso son **membresías**, no un recorrido del árbol: `clients.parent_id` se
// quedó como linaje (de quién es este cliente) y no lo lee nadie desde acá. Si algún día hace falta
// agrupar el selector por casa matriz, ese es su uso — no el permiso.

const filaInstancia = z.object({
  id: z.string(),
  client_id: z.string(),
  workflow_id: z.string(),
  slug: z.string(),
  nombre: z.string().nullable(),
});

const filaMembresia = z.object({ client_id: z.string(), rol: z.string() });

export type Instancia = InstanciaVisible & {
  workflowId: string;
  slug: string;
  nombre: string | null;
};

/**
 * Las membresías de una persona.
 *
 * Con el cliente admin y no con la sesión: `app.usuarios_clientes` tiene RLS sin policies (el
 * patrón del schema `app`), así que el browser no la alcanza ni por accidente. Quien decide qué
 * puede ver alguien no puede ser una tabla que ese alguien pueda leer desde el navegador.
 */
export async function leerMembresias(usuarioId: string): Promise<Membresia[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("usuarios_clientes")
    .select("client_id, rol")
    .eq("usuario_id", usuarioId);
  if (error) throw new Error(`Supabase respondió con error leyendo membresías: ${error.message}`);

  return z.array(filaMembresia).parse(data).flatMap((m) =>
    // Un rol que no está en el enum es dato corrupto, no un caso a tolerar: se descarta la
    // membresía entera. Fallar hacia "no ve nada" es la única dirección segura acá.
    esRol(m.rol) ? [{ clientId: m.client_id, rol: m.rol as Rol }] : [],
  );
}

/** Los ids de todas las empresas. Lo necesita el dueño, que alcanza las que existan. */
async function leerEmpresas(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("clients").select("id");
  if (error) throw new Error(`Supabase respondió con error leyendo clientes: ${error.message}`);
  return z.array(z.object({ id: z.string() })).parse(data).map((c) => c.id);
}

/** Las instancias activas. Una instancia = un cockpit = (empresa × pipeline). */
export async function leerInstancias(): Promise<Instancia[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("instances")
    .select("id, client_id, workflow_id, slug, nombre")
    .eq("estado", "active")
    .order("client_id")
    .order("slug");
  if (error) throw new Error(`Supabase respondió con error leyendo instancias: ${error.message}`);
  return z.array(filaInstancia).parse(data).map((i) => ({
    id: i.id,
    clientId: i.client_id,
    workflowId: i.workflow_id,
    slug: i.slug,
    nombre: i.nombre,
  }));
}

/** El cockpit abierto: con qué scopear (`ctx`), cuál es (`cockpit`) y con qué permisos (`rol`). */
export type Sesion = { ctx: TenantContext; cockpit: Instancia; rol: Rol };

/**
 * El contexto de un usuario para el cockpit que está mirando.
 *
 * `cliente` y `pipeline` son los dos segmentos de la URL (`/retia/reels/...`). Si no vienen —la
 * raíz, o una acción que no los conoce— se cae al primero que alcance.
 *
 * Devuelve `null` si no puede ver eso: **no distingue "no existe" de "no es tuyo"**, a propósito.
 * Decirle a alguien que el cliente `estadox` existe pero no es suyo ya es filtrar algo. Qué hacer
 * con el `null` lo decide el llamador: `redirect` en una página, 403 en la fachada.
 */
export async function resolverContexto(
  usuario: Alcance,
  cliente?: string,
  pipeline?: string,
): Promise<Sesion | null> {
  const instancias = await leerInstancias();
  const suyas = instanciasVisibles(usuario, instancias);

  const elegida =
    cliente !== undefined || pipeline !== undefined
      ? suyas.find(
          (i) =>
            (cliente === undefined || i.clientId === cliente) &&
            (pipeline === undefined || i.slug === pipeline),
        )
      : // Sin segmentos: el primero que alcance. `leerInstancias` viene ordenado, así que la
        // elección es estable entre requests — un default que cambia de request en request sería
        // un bug de caché esperando.
        suyas[0];

  if (!elegida) return null;
  const armado = armarContexto(usuario, elegida);
  return armado ? { ...armado, cockpit: elegida } : null;
}

/** Los cockpits que este usuario puede abrir: lo que alimenta el selector del nav. */
export async function cockpitsDe(usuario: Alcance): Promise<Instancia[]> {
  return instanciasVisibles(usuario, await leerInstancias());
}

/** Las empresas que alcanza, para las pantallas que necesitan enumerarlas. */
export async function empresasDe(usuario: Alcance): Promise<string[]> {
  return usuario.esDueno ? leerEmpresas() : usuario.membresias.map((m) => m.clientId);
}

/** Lo que puede salir mal al resolver el tenant de la fachada. Cada caso tiene su status. */
export type ResultadoFachada =
  | { ok: true; ctx: TenantContext }
  | { ok: false; motivo: "instancia_ausente" | "instancia_desconocida" };

/**
 * El contexto de la fachada de ADR-028. **No hay usuario acá**: el motor se autentica con el header
 * compartido, así que la autoridad no es una sesión sino la instancia que dice ser.
 *
 * **La instancia es OBLIGATORIA desde ADR-048 (`version: 2`).** No hay caída a "la única activa":
 * ese default se sostenía solo mientras existiera exactamente una, y su modo de falla el día que
 * hubiera dos era mudo — el dispatcher se olvida del payload y la corrida escribe en el tenant
 * equivocado, en verde. Es el fail-closed de ADR-028 §4 llevado hasta el final.
 */
export async function contextoDeFachada(instanciaPedida?: string): Promise<ResultadoFachada> {
  if (!instanciaPedida) return { ok: false, motivo: "instancia_ausente" };

  const instancias = await leerInstancias();
  const elegida = instancias.find((i) => i.id === instanciaPedida);
  if (!elegida) return { ok: false, motivo: "instancia_desconocida" };
  // 🔑 `origen: "fachada"` es lo que mantiene al motor corriendo después del flip de la Capa 2.
  // Acá no hay sesión —la autoridad es el header compartido, no un usuario—, así que `auth.uid()`
  // es null y las policies de la `021` no tendrían contra qué evaluar: con la clave anon esto sería
  // `42501 permission denied for schema app` y `run-plan` moriría en 500.
  //
  // No es una excepción que se cuela: es lo que ADR-028 y ADR-035 ya decían (la fachada y las
  // escrituras de n8n van con `service_role`), dicho ahora en un lugar donde `scoped()` puede verlo.
  // El aislamiento de este camino es la Capa 1 —el `.eq()` que `scoped` inyecta— más el 403 de
  // `contextoDeFachada` cuando la instancia pedida no existe.
  return { ok: true, ctx: { clientId: elegida.clientId, instanceId: elegida.id, origen: "fachada" } };
}

/**
 * Las instancias activas de un pipeline: lo que consume el dispatcher de ADR-050 por
 * `GET /api/engine/instancias?workflow=<slug>`.
 *
 * Sin contexto de tenant a propósito, y es la misma razón por la que este archivo entero vive fuera
 * de `scoped.ts`: el dispatcher pregunta **quiénes corren**, o sea justo lo que todavía no puede
 * scopear. Su autoridad es el header compartido, igual que la de `run-plan`.
 */
export async function instanciasDePipeline(workflowId: string): Promise<Instancia[]> {
  return (await leerInstancias()).filter((i) => i.workflowId === workflowId);
}
