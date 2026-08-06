import { z } from "zod";
import { esRol, type Rol } from "@/domain/roles";
import type { TenantContext } from "@/domain/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { scoped } from "@/lib/supabase/scoped";

// IO de la pantalla de equipo (ADR-060). **Este archivo tiene las dos autoridades del sistema en
// la misma pared, y conviene saber cuál es cuál antes de tocarlo:**
//
//   · **LEER va con la sesión** (`scoped`, y el RPC con `createClient()`): las policies de la `025`
//     se evalúan de verdad, y la agencia queda fuera de la lista porque lo dice la base, no un
//     `.filter()` de React (ADR-051 §3).
//   · **ESCRIBIR va con `service_role`**, y no por comodidad: `inviteUserByEmail` es la Admin API y
//     no existe con la clave anon; invitar crea una fila en `auth.users`, que ninguna policy de
//     `app` puede autorizar. La `021` §2 dejó estas dos tablas fuera de los `grant insert/update/
//     delete` a propósito y se mantiene.
//
// 🔴 **Por eso cada escritura de acá filtra por `clientId` a mano.** El admin bypassa RLS, así que
// la base ya no es la red: si un `client_id` llegara equivocado, escribiría en la empresa de otro
// sin un solo error. Es el riesgo que ADR-060 §4 asume por escrito, y la mitigación es que el
// `clientId` **siempre sale del `ctx`** —el cockpit abierto— y nunca de un formulario.

const filaEquipo = z.object({
  usuario_id: z.string(),
  rol: z.string(),
  creado_en: z.string(),
  // El embed de PostgREST por la FK `usuarios_clientes.usuario_id → app.usuarios.id`.
  usuarios: z.object({ nombre: z.string() }).nullable(),
});

export type Miembro = {
  usuarioId: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  desde: string;
};

/**
 * El equipo del cockpit abierto.
 *
 * 🔑 **Dos consultas y no una, porque el mail no está en `app.usuarios`** (sus columnas son `id`,
 * `nombre`, `creado_en`, `es_dueno`): vive en `auth.users`, a la que nunca se le da `select` a
 * `authenticated`. Sale por `app.emails_visibles()`, la función `security definer` de la `025`.
 *
 * ⚠️ **Los dos lados tienen grano distinto, y por eso el cruce es una intersección y no un merge:**
 * el RPC devuelve a toda la gente con la que compartís *alguna* empresa (RLS no sabe qué cockpit
 * hay abierto — la asimetría de la `021` §3), mientras que la lista scopeada es la de *esta*
 * empresa. Manda la lista scopeada: un mail que no matchee ninguna fila se descarta solo.
 */
export async function leerEquipo(ctx: TenantContext): Promise<Miembro[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.usuarios_clientes", "usuario_id, rol, creado_en, usuarios(nombre)")
    .order("creado_en");
  if (error) throw new Error(`Supabase respondió con error leyendo el equipo: ${error.message}`);

  const filas = z.array(filaEquipo).parse(data);
  const emails = await leerEmails();

  return filas.flatMap((f) => {
    // Un rol fuera del enum es dato corrupto, no un caso a tolerar: se descarta la fila entera,
    // igual que en `leerMembresias`. Fallar hacia "no aparece" es la dirección segura.
    if (!esRol(f.rol)) return [];
    return [{
      usuarioId: f.usuario_id,
      // `usuarios` viene `null` si la policy de la `025` no dejó ver esa fila — o sea un dueño, que
      // no debería estar acá porque la policy de `usuarios_clientes` también los excluye. Si
      // aparece, es que una de las dos mitades no está: se muestra y se nota.
      nombre: f.usuarios?.nombre ?? "(sin acceso a la ficha)",
      email: emails.get(f.usuario_id) ?? null,
      rol: f.rol,
      desde: f.creado_en,
    }];
  });
}

const filaEmail = z.object({ usuario_id: z.string(), email: z.string().nullable() });

/**
 * Los mails, por RPC y con la sesión.
 *
 * No pasa por `scoped()` a propósito: `scoped` existe para ponerle el filtro de tenant a una tabla,
 * y una función que **se filtra sola** (por `usuarios_visibles()`) no tiene columna que filtrar.
 * Meterle un `rpc` al helper sería abrirle una puerta sin filtro justo al que existe para que no
 * las haya.
 */
async function leerEmails(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("emails_visibles");
  if (error) {
    // Sumidero, como `registrarEvento`: sin mails la pantalla sigue siendo útil (nombre, rol,
    // desde cuándo). Caerse entera por la columna decorativa sería peor.
    console.error("[equipo] no se pudieron leer los mails:", error.message);
    return new Map();
  }
  return new Map(
    z.array(filaEmail).parse(data).flatMap((f) => (f.email ? [[f.usuario_id, f.email] as const] : [])),
  );
}

export type ResultadoAlta =
  | { ok: true; yaTeniaCuenta: boolean }
  | { ok: false; mensaje: string };

/**
 * El alta completa: los tres pasos manuales de ADR-051 en un acto.
 *
 * 🩸 **El caso de la persona con dos membresías es el camino normal, no el borde** — ya existe en
 * prod. Si el mail ya está en `auth.users`, `inviteUserByEmail` falla y lo único que hay que hacer
 * es sumarle la membresía nueva. Tratarlo como error dejaría al sistema sin poder expresar
 * *"esta persona también trabaja acá"*, que es exactamente lo que el multi-tenant habilitó.
 */
export async function darDeAlta(
  clientId: string,
  email: string,
  nombre: string,
  rol: Rol,
): Promise<ResultadoAlta> {
  const admin = createAdminClient();

  const invitacion = await admin.auth.admin.inviteUserByEmail(email);
  let usuarioId = invitacion.data?.user?.id ?? null;
  const yaTeniaCuenta = usuarioId === null;

  if (!usuarioId) {
    usuarioId = await buscarPorEmail(admin, email);
    if (!usuarioId) {
      console.error("[equipo] la invitación falló y el mail no está en auth:", invitacion.error?.message);
      return { ok: false, mensaje: "No se pudo invitar a esa dirección. Revisá el mail y probá de nuevo." };
    }
  }

  // La ficha puede existir de antes (persona con otra membresía). `upsert` y no `insert`: el alta
  // tiene que ser repetible sin romperse, que es la misma razón por la que la `025` es idempotente.
  const ficha = await admin
    .schema("app")
    .from("usuarios")
    .upsert({ id: usuarioId, nombre }, { onConflict: "id", ignoreDuplicates: true });
  if (ficha.error) {
    console.error("[equipo] no se pudo crear la ficha:", ficha.error.message);
    return { ok: false, mensaje: "Se envió la invitación pero no se pudo crear la ficha. Avisale a un dev." };
  }

  const membresia = await admin
    .schema("app")
    .from("usuarios_clientes")
    .upsert({ usuario_id: usuarioId, client_id: clientId, rol }, { onConflict: "usuario_id,client_id" });
  if (membresia.error) {
    console.error("[equipo] no se pudo crear la membresía:", membresia.error.message);
    return { ok: false, mensaje: "Se envió la invitación pero no se pudo dar el acceso. Avisale a un dev." };
  }

  return { ok: true, yaTeniaCuenta };
}

/**
 * El id de una cuenta que ya existe, por su mail.
 *
 * La Admin API no tiene «buscar por email», así que se pagina. **El techo está medido: hoy hay 8
 * cuentas**, o sea una página. Si algún día son miles, el reemplazo es una función `security
 * definer` que consulte `auth.users` — y ojo con eso, porque una función así, si se le da `execute`
 * a `authenticated`, es un oráculo de enumeración de mails. Por eso hoy vive del lado del admin.
 */
async function buscarPorEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const buscado = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === buscado);
    if (encontrado) return encontrado.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Cambiar el rol de alguien EN ESTA empresa. El `client_id` acota: la persona puede estar en otras. */
export async function cambiarRolEnEmpresa(
  clientId: string,
  usuarioId: string,
  rol: Rol,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .schema("app")
    .from("usuarios_clientes")
    .update({ rol })
    .eq("client_id", clientId)
    .eq("usuario_id", usuarioId)
    .select("usuario_id");
  if (error) {
    console.error("[equipo] no se pudo cambiar el rol:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Quitar el acceso a ESTA empresa.
 *
 * Se borra la membresía, no la persona: su ficha y sus otras membresías quedan intactas, y sus
 * eventos en `app.eventos` siguen apuntando a un usuario que existe. Borrar la cuenta sería
 * destruir la auditoría de lo que hizo mientras estuvo.
 */
export async function quitarDeEmpresa(clientId: string, usuarioId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .schema("app")
    .from("usuarios_clientes")
    .delete()
    .eq("client_id", clientId)
    .eq("usuario_id", usuarioId)
    .select("usuario_id");
  if (error) {
    console.error("[equipo] no se pudo quitar el acceso:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
