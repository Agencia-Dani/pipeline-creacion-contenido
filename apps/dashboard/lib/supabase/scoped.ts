import type { TenantContext } from "@/domain/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// La Capa 1 de ADR-047, y la pieza que de verdad protege: **no se puede construir una query sin
// `TenantContext`.** Convierte "acordate de filtrar" en un error de compilación.
//
// Por qué hace falta algo tan terco: el modo de falla real no es un atacante, es un `.eq()`
// olvidado en una de las ~60 funciones de `lib/`. Y ese bug **no falla, no avisa, y devuelve datos
// verosímiles de otra empresa** — la misma familia que la vista que daba 18 filas para 17
// referentes (migración `015`) y la hora corrida 5 h por `toLocaleString` sin `timeZone`.
//
// Un helper *opcional* no habría servido: el problema nunca fue que no existiera la función, es
// que se puede no llamarla. Por eso acá no hay forma de obtener el query builder crudo.
//
// ⚠️ **Esto no reemplaza a RLS, y RLS no reemplaza a esto** (ADR-047). RLS filtra por el usuario de
// la sesión, y hay dos caminos que no tienen sesión: la fachada de ADR-028 y las escrituras de n8n
// (ADR-035). Cubren superficies distintas.
//
// Y desde el flip de la Capa 2 hay que decirlo con números, porque es la línea que alguien va a
// querer "simplificar": **RLS acota a TODAS las empresas del usuario** —es lo máximo que puede saber
// la base, que no tiene forma de enterarse de qué cockpit hay abierto en el browser— mientras que el
// `.eq()` de acá abajo acota **al cockpit abierto**, que es más angosto. Borrar el filtro porque "ya
// está RLS" haría que, apenas alguien alcance dos empresas, una pantalla de EstadoX muestre también
// los proyectos de 30X. Sin error y sin aviso. Está escrito igual en la `021` §3.
//
// ⚠️ **Depende de la migración `016`.** Si esto se deploya antes de aplicarla, las queries piden
// columnas que en prod no existen. El orden está en plan-multi-tenant §11.3: primero la `016`.

// ── El mapa tabla → grano: la única lista, y por eso vive acá ──────────────────────────────
//
// El grano sale de la decisión B de ADR-046 y no se decide por tabla en cada archivo:
//   · **cliente**   → es de la EMPRESA y cruza pipelines (voces, proyectos, referentes, usuarios).
//   · **instancia** → es de UN PIPELINE de esa empresa (knobs, feed, descartes, eventos, corridas).
//   · **heredado**  → tabla puente: no lleva columna, cuelga por FK con `on delete cascade`.
//   · **global**    → no es de nadie: `tarifas` es lo que nos cobra el proveedor, no un dato de la
//                     empresa. Si algún día una empresa negocia su tarifa, eso es una decisión con
//                     ADR, no una columna que aparece.
//
// 🔒 **Una tabla nueva sin entrada acá NO COMPILA**, porque `Tabla` se deriva de este objeto. Ese
// es el punto: agregar una tabla obliga a decir de quién es.
//
// 🚫 `clients`, `instances` y `workflows` NO están, a propósito: son el registro con el que se
// RESUELVE el tenant, así que scoparlas sería circular. Las lee `lib/tenant.ts` con el cliente
// admin, y es el único lugar del código que puede.
//
// 🚫 **`app.usuarios` tampoco está, y hasta el 2026-08-06 estaba MINTIENDO.** Declaraba grano
// `"cliente"` ⇒ `filtrar()` le habría puesto `.eq("client_id", …)`, **una columna que la `019`
// dropeó** (`019:59`). Nadie lo ejercía porque el único lector es `lib/auth.ts`, que lee la fila
// propia con `createClient()` directo; la pantalla de equipo habría sido la primera en tocarlo, y
// el síntoma habría sido un error de PostgREST sobre una columna inexistente.
//
// No se corrige el grano: se saca. **Una persona no pertenece a una empresa, pertenece a una
// membresía** (ADR-051), así que la tabla no tiene ni puede tener columna de tenant. El equipo se
// lee entrando por `app.usuarios_clientes` —que sí la tiene— con embedding a `usuarios`: la Capa 1
// filtra el `client_id` de siempre y la Capa 2 (policy de la `025`) filtra el embed. Pedir
// `scoped().select("app.usuarios")` ahora **no compila**, que es la respuesta correcta.

type Grano = "cliente" | "instancia" | "heredado" | "global";

const TABLAS = {
  // Grano empresa
  // `app.usuarios_clientes` es el equipo: quién trabaja en esta empresa y con qué rol (ADR-051).
  // Entra con grano empresa porque **tiene `client_id`** y filtra exacto al cockpit abierto.
  //
  // 🔑 **La misma tabla se lee de dos formas distintas, y no es una inconsistencia.** Acá es un
  // DATO ("¿quiénes entran a mi empresa?", la pantalla de ADR-060) y se lee scopeada, con la sesión.
  // En `lib/tenant.ts` es el REGISTRO ("¿qué empresas alcanzo yo?") y se lee con el admin y sin
  // scopear, porque scopear la tabla con la que se decide el scope es circular. Dos preguntas, dos
  // autoridades; el que se confunda que lea la nota de allá.
  "app.usuarios_clientes": { esquema: "app", grano: "cliente" },
  "app.voces": { esquema: "app", grano: "cliente" },
  "app.proyectos": { esquema: "app", grano: "cliente" },
  "app.referentes": { esquema: "app", grano: "cliente" },
  "app.v_salud_referentes": { esquema: "app", grano: "cliente" },

  // Grano instancia
  "app.ajustes": { esquema: "app", grano: "instancia" },
  "app.candidatos": { esquema: "app", grano: "instancia" },
  "app.descartes": { esquema: "app", grano: "instancia" },
  "app.referentes_propuestos": { esquema: "app", grano: "instancia" },
  "app.eventos": { esquema: "app", grano: "instancia" },
  "app.transcripciones": { esquema: "app", grano: "instancia" },
  // La tanda es del cockpit, como las transcripciones que agrupa (ADR-064). `v_tandas` es su
  // cabecera con los contadores: la pantalla carga ESO y no las filas, que es lo que mató el techo
  // de 50 (la lista vieja traía 50 de 110 y no lo decía).
  "app.tandas": { esquema: "app", grano: "instancia" },
  "app.v_tandas": { esquema: "app", grano: "instancia" },
  "app.v_metricas_calidad": { esquema: "app", grano: "instancia" },
  "app.v_embudo_semana": { esquema: "app", grano: "instancia" },
  "app.v_embudo_descubrimiento": { esquema: "app", grano: "instancia" },
  "app.v_costos_semana": { esquema: "app", grano: "instancia" },
  "app.v_auditoria_descartes": { esquema: "app", grano: "instancia" },
  "public.runs": { esquema: "public", grano: "instancia" },
  "public.outputs": { esquema: "public", grano: "instancia" },
  "public.processed_items": { esquema: "public", grano: "instancia" },
  "public.v_senal_seleccion": { esquema: "public", grano: "instancia" },

  // Las 4 de LinkedIn (`020`, ADR-049/ADR-055). **Grano instancia las cuatro, y ojo con la
  // asimetría contra reels, que es a propósito**: `app.referentes` es de grano EMPRESA porque el
  // banco de cuentas es el mismo para toda la empresa, mientras que un filtro de Pinterest es del
  // PIPELINE. La regla que decide es ADR-049 §5: ¿el dato tiene sentido sin saber de qué pipeline
  // vino? Sus policies son la `024`, y llegaron tarde: nacieron sin ninguna (§14.6).
  "app.referentes_linkedin": { esquema: "app", grano: "instancia" },
  "app.voces_linkedin": { esquema: "app", grano: "instancia" },
  "app.candidatos_linkedin": { esquema: "app", grano: "instancia" },
  "app.descartes_linkedin": { esquema: "app", grano: "instancia" },
  // `v_corpus_aprobados` y `v_historico_seleccionados` estaban acá y las dropeó la `022`
  // (ADR-059). Vivían en este mapa sin que nadie las leyera: **estar en la whitelist no es ser
  // consumidor**, y esa confusión las hizo pasar por vivas en el primer inventario de la balde 2.

  // Puentes: heredan por FK (migraciones `012` y `013`).
  // ⚠️ Leerlas trae los pares de todos los tenants. Está bien porque el llamador las cruza contra
  // ids que YA vienen scopeados (`leerPares` intersecta contra el banco del tenant), pero si
  // alguna vez se leen solas hay que filtrarlas por su padre a mano.
  "app.referentes_proyectos": { esquema: "app", grano: "heredado" },
  "app.referentes_propuestos_proyectos": { esquema: "app", grano: "heredado" },

  // De nadie
  "app.tarifas": { esquema: "app", grano: "global" },
} as const satisfies Record<string, { esquema: "app" | "public"; grano: Grano }>;

export type Tabla = keyof typeof TABLAS;

/** La columna que scopea cada grano. `null` = no se filtra (y el mapa dice por qué). */
function columnaDe(tabla: Tabla): "client_id" | "instance_id" | null {
  const { grano } = TABLAS[tabla];
  if (grano === "cliente") return "client_id";
  if (grano === "instancia") return "instance_id";
  return null;
}

/** `"app.voces"` → `"voces"`: el prefijo es del mapa, PostgREST recibe el nombre pelado. */
function fisico(tabla: Tabla): string {
  return tabla.slice(tabla.indexOf(".") + 1);
}

/**
 * La forma mínima que necesita `filtrar`. Es un tipo plano —no genérico recursivo— a propósito:
 * un `Q extends Filtrable<Q>` sobre el builder de supabase-js hace que tsc se rinda con TS2589.
 */
type ConFiltros = {
  in(columna: string, valores: string[]): unknown;
  eq(columna: string, valor: string): unknown;
};

/** Devuelve el mismo builder que recibió, con el filtro de tenant ya aplicado. */
function filtrar<Q>(q: Q, tabla: Tabla, ctx: TenantContext): Q {
  const columna = columnaDe(tabla);
  if (columna === null) return q;
  const builder = q as ConFiltros;
  // 🔒 Los dos granos filtran por **el cockpit abierto**, nunca por "las empresas del usuario"
  // (ADR-051). Acá hubo un `in (visibles)` que parecía inofensivo con un tenant y no lo era: apenas
  // alguien alcanzara dos empresas, una pantalla de EstadoX habría mostrado también los proyectos
  // de 30X — sin error, sin aviso. La membresía decide a qué cockpit entrás; adentro manda el
  // cockpit.
  const filtrado =
    columna === "client_id"
      ? builder.eq("client_id", ctx.clientId)
      : builder.eq("instance_id", ctx.instanceId);
  return filtrado as Q;
}

/** Le pone el tenant a cada fila que entra. Sin esto, un insert nace huérfano. */
function conTenant<T extends Record<string, unknown>>(tabla: Tabla, filas: T[], ctx: TenantContext) {
  const columna = columnaDe(tabla);
  if (columna === null) return filas;
  const valor = columna === "client_id" ? ctx.clientId : ctx.instanceId;
  return filas.map((f) => ({ ...f, [columna]: valor }));
}

/**
 * El acceso a Supabase, con el tenant ya puesto.
 *
 * ```ts
 * const { data, error } = await (await scoped(ctx)).select("app.proyectos", COLUMNAS).order("nombre");
 * ```
 *
 * No devuelve el query builder crudo en ningún camino: se entra por `select`, `insert`, `upsert`,
 * `update` o `borrar`, y los cinco aplican el filtro o inyectan la columna. Lo que sale sí es un
 * builder de supabase-js, así que `.order()`, `.limit()`, `.single()` y el resto siguen igual.
 *
 * ⚠️ **Es `async` desde el flip de la Capa 2, y el doble `await` es feo a propósito.** El cliente de
 * sesión necesita `await cookies()`, así que no hay forma de que esto siga siendo síncrono sin
 * cachear el cliente entre requests — que es exactamente el bug que no queremos: un cliente cacheado
 * es la sesión de otra persona. El primer `await` resuelve la credencial, el segundo la query.
 */
export async function scoped(ctx: TenantContext) {
  // 🔒 La bifurcación de ADR-047 Capa 2, y la única línea del sistema que elige credencial.
  //
  // `fachada` NO es un escape hatch: es el camino de ADR-028/ADR-035, donde la autoridad es el
  // header compartido y no hay `auth.uid()` contra el que evaluar una policy. Su aislamiento es el
  // `.eq()` de `filtrar()` (Capa 1) más el 403 de `contextoDeFachada` — y el contexto solo puede
  // nacer `fachada` en ESE constructor, así que ninguna pantalla puede pedirlo por accidente.
  //
  // `sesion` lee con la clave anon ⇒ las 17 policies de la `021` se evalúan de verdad. Acá es donde
  // el aislamiento entre empresas deja de ser TypeScript y pasa a ser la base.
  const cliente = ctx.origen === "fachada" ? createAdminClient() : await createClient();
  // El `as string` no afloja nada real: este proyecto no genera `database.types.ts`, así que los
  // genéricos de supabase-js ya colapsan a `any` y el literal del schema no compra tipado. Lo que
  // sí hace es evitar que tsc arme la unión de (2 schemas × 24 tablas) y se rinda con un
  // TS2589 "type instantiation is excessively deep". El nombre del schema lo decide el mapa.
  const de = (tabla: Tabla) => cliente.schema(TABLAS[tabla].esquema as string).from(fisico(tabla));

  return {
    select(tabla: Tabla, columnas = "*", opciones?: { count?: "exact"; head?: boolean }) {
      return filtrar(de(tabla).select(columnas, opciones), tabla, ctx);
    },

    insert(tabla: Tabla, filas: Record<string, unknown>[]) {
      return de(tabla).insert(conTenant(tabla, filas, ctx));
    },

    /**
     * ⚠️ `onConflict` tiene que nombrar el unique **de la `016`**, o sea con la columna de tenant
     * adentro (`instance_id,plataforma,external_id`). PostgREST exige que el arbiter coincida con
     * un unique existente: si no, tira `42P10` y el insert muere entero.
     */
    upsert(
      tabla: Tabla,
      filas: Record<string, unknown>[],
      opciones: { onConflict: string; ignoreDuplicates?: boolean },
    ) {
      return de(tabla).upsert(conTenant(tabla, filas, ctx), opciones);
    },

    update(tabla: Tabla, cambios: Record<string, unknown>) {
      return filtrar(de(tabla).update(cambios), tabla, ctx);
    },

    /** `borrar` y no `delete`: es palabra reservada como nombre de método en un object literal. */
    borrar(tabla: Tabla) {
      return filtrar(de(tabla).delete(), tabla, ctx);
    },
  };
}

/**
 * Cuántas filas de `tabla` apuntan a `id`, dentro del tenant.
 *
 * Vive acá porque es el conteo que alimenta la regla de borrado de ADR-045 y era el último lugar
 * de `lib/` que armaba su propio `.select(..., { head: true })`.
 */
export async function contarEn(
  ctx: TenantContext,
  tabla: Tabla,
  columna: string,
  id: string,
): Promise<number> {
  const { count, error } = await (await scoped(ctx))
    .select(tabla, "id", { count: "exact", head: true })
    .eq(columna, id);
  if (error) throw new Error(`Supabase respondió con error contando ${tabla}: ${error.message}`);
  return count ?? 0;
}
