import { z } from "zod";
import {
  armarContexto,
  instanciasVisibles,
  visiblesDesde,
  type InstanciaVisible,
  type NodoCliente,
  type TenantContext,
} from "@/domain/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

// De dónde sale el `TenantContext`. Es el ÚNICO archivo que lee el registro de tenants
// (`clients`, `instances`) sin scopear, y tiene que serlo: scopear la tabla con la que se resuelve
// el scope sería circular. Por eso esas tres tablas no están en el mapa de `scoped.ts`.
//
// Desde la Fase 3 las rutas traen `[cliente]/[pipeline]` y `resolverContexto` los recibe; sin
// segmentos (la raíz, o una acción que no los conoce) sigue cayendo al cockpit por defecto del
// usuario. La forma del contexto no cambió en ninguna de las dos fases, que era la apuesta.

const filaCliente = z.object({ id: z.string(), parent_id: z.string().nullable() });
const filaInstancia = z.object({
  id: z.string(),
  client_id: z.string(),
  workflow_id: z.string(),
  slug: z.string(),
  nombre: z.string().nullable(),
});

export type Instancia = InstanciaVisible & {
  workflowId: string;
  slug: string;
  nombre: string | null;
};

/** El árbol entero. Es chico (una fila por empresa) y la regla de visibilidad lo necesita completo. */
async function leerArbolClientes(): Promise<NodoCliente[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("clients").select("id, parent_id");
  if (error) throw new Error(`Supabase respondió con error leyendo clientes: ${error.message}`);
  return z.array(filaCliente).parse(data).map((c) => ({ id: c.id, parentId: c.parent_id }));
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

/** El cockpit abierto: con qué scopear (`ctx`) y cuál es (`cockpit`, que además arma la URL). */
export type Sesion = { ctx: TenantContext; cockpit: Instancia };

/**
 * El contexto de un usuario para el cockpit que está mirando.
 *
 * `cliente` y `pipeline` son los dos segmentos de la URL (`/30x/reels/...`). Si no vienen —la raíz,
 * o una acción que no los conoce— se cae al cockpit por defecto del usuario.
 *
 * Devuelve `null` si el usuario no puede ver eso: no distingue "no existe" de "no es tuyo", **a
 * propósito**. Decirle a alguien que el cliente `estadox` existe pero no es suyo ya es filtrar algo.
 * Qué hacer con el `null` lo decide el llamador: `redirect` en una página, 403 en la fachada.
 */
export async function resolverContexto(
  usuario: { clientId: string },
  cliente?: string,
  pipeline?: string,
): Promise<Sesion | null> {
  const [clientes, instancias] = await Promise.all([leerArbolClientes(), leerInstancias()]);
  const visibles = visiblesDesde(usuario.clientId, clientes);
  const suyas = instancias.filter((i) => visibles.includes(i.clientId));

  const elegida =
    cliente !== undefined || pipeline !== undefined
      ? suyas.find((i) => (cliente === undefined || i.clientId === cliente) && (pipeline === undefined || i.slug === pipeline))
      : // Sin segmentos en la URL (pre-Fase 3): el cockpit del propio cliente, y si no hay, el primero
        // visible. `leerInstancias` viene ordenado, así que la elección es estable entre requests —
        // un default que cambia de request en request sería un bug de caché esperando.
        (suyas.find((i) => i.clientId === usuario.clientId) ?? suyas[0]);

  if (!elegida) return null;
  const ctx = armarContexto(usuario.clientId, elegida, clientes);
  return ctx ? { ctx, cockpit: elegida } : null;
}

/** Las instancias que este usuario puede abrir: lo que alimenta el selector de la Fase 3. */
export async function cockpitsDe(ctx: TenantContext): Promise<Instancia[]> {
  return instanciasVisibles(ctx, await leerInstancias());
}

/** Lo que puede salir mal al resolver el tenant de la fachada. Cada caso tiene su status. */
export type ResultadoFachada =
  | { ok: true; ctx: TenantContext }
  | { ok: false; motivo: "instancia_ausente" | "instancia_desconocida" };

/**
 * El contexto de la fachada de ADR-028. **No hay usuario acá**: el motor se autentica con el header
 * compartido, así que la autoridad no es una sesión sino la instancia que dice ser.
 *
 * `visibles` queda en `[clientId]` a secas, sin bajar por el árbol: un workflow corre para UNA
 * instancia y su config es la de esa empresa. Que el humano de Retia vea a sus clientes no
 * significa que el motor de Retia deba traerse los referentes de ellos.
 *
 * **La instancia es OBLIGATORIA desde ADR-048 (`version: 2`).** No hay caída a "la única activa":
 * ese default se sostenía solo mientras existiera exactamente una, y su modo de falla el día que
 * hubiera dos era mudo — el dispatcher se olvida del payload y la corrida escribe en el tenant
 * equivocado, en verde. Es el fail-closed de ADR-028 §4 llevado hasta el final: *"una corrida sin
 * config entrega ruido; no entregar es mejor"*, y una corrida con la config de OTRA empresa es
 * peor que ruido.
 */
export async function contextoDeFachada(instanciaPedida?: string): Promise<ResultadoFachada> {
  if (!instanciaPedida) return { ok: false, motivo: "instancia_ausente" };

  const instancias = await leerInstancias();
  const elegida = instancias.find((i) => i.id === instanciaPedida);
  if (!elegida) return { ok: false, motivo: "instancia_desconocida" };
  return { ok: true, ctx: { clientId: elegida.clientId, visibles: [elegida.clientId], instanceId: elegida.id } };
}

/**
 * Las instancias activas de un pipeline: lo que consume el dispatcher de ADR-050 por
 * `GET /api/engine/instancias?workflow=<slug>`.
 *
 * Sin `TenantContext` a propósito, y es la misma razón por la que este archivo entero vive fuera de
 * `scoped.ts`: el dispatcher pregunta **quiénes corren**, o sea justo lo que todavía no puede
 * scopear. Su autoridad es el header compartido, igual que la de `run-plan`.
 */
export async function instanciasDePipeline(workflowId: string): Promise<Instancia[]> {
  return (await leerInstancias()).filter((i) => i.workflowId === workflowId);
}
