import type { TenantContext } from "@/domain/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

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

type Grano = "cliente" | "instancia" | "heredado" | "global";

const TABLAS = {
  // Grano empresa
  "app.usuarios": { esquema: "app", grano: "cliente" },
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
  "app.v_metricas_calidad": { esquema: "app", grano: "instancia" },
  "app.v_embudo_semana": { esquema: "app", grano: "instancia" },
  "app.v_embudo_descubrimiento": { esquema: "app", grano: "instancia" },
  "app.v_costos_semana": { esquema: "app", grano: "instancia" },
  "app.v_auditoria_descartes": { esquema: "app", grano: "instancia" },
  "public.runs": { esquema: "public", grano: "instancia" },
  "public.outputs": { esquema: "public", grano: "instancia" },
  "public.processed_items": { esquema: "public", grano: "instancia" },
  "public.v_senal_seleccion": { esquema: "public", grano: "instancia" },
  "public.v_corpus_aprobados": { esquema: "public", grano: "instancia" },
  "public.v_historico_seleccionados": { esquema: "public", grano: "instancia" },

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
 * const { data, error } = await scoped(ctx).select("app.proyectos", COLUMNAS).order("nombre");
 * ```
 *
 * No devuelve el query builder crudo en ningún camino: se entra por `select`, `insert`, `upsert`,
 * `update` o `borrar`, y los cinco aplican el filtro o inyectan la columna. Lo que sale sí es un
 * builder de supabase-js, así que `.order()`, `.limit()`, `.single()` y el resto siguen igual.
 */
export function scoped(ctx: TenantContext) {
  const cliente = createAdminClient();
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
  const { count, error } = await scoped(ctx)
    .select(tabla, "id", { count: "exact", head: true })
    .eq(columna, id);
  if (error) throw new Error(`Supabase respondió con error contando ${tabla}: ${error.message}`);
  return count ?? 0;
}
