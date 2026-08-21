import { z } from "zod";
import { claveDe, type EnlaceVideo, type Plataforma } from "@/domain/enlace";
import type { MarcaGrabado } from "@/domain/grabados";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO de la marca "ya se grabó" (ADR-070, migración `029`).
//
// 🔑 **La presencia de la fila ES la marca.** No hay booleano ni timestamp nullable: marcar inserta,
// desmarcar borra. Un estado que se representa de una sola forma no se puede escribir mal, y no
// existe el caso "fila que dice que no" que después hay que acordarse de filtrar.
//
// 🩸 **Por qué esto no vive en `lib/transcripciones.ts`, que es de donde viene.** ADR-069 puso la
// marca como columna de `app.transcripciones`, o sea que solo alcanzaba a los links pegados a mano:
// medido el 2026-08-20, **128 de los 183 guiones del histórico**. Los otros 55 vinieron del Feed y
// no tenían dónde marcarse, y un link grabado por fuera de la herramienta no tiene fila en ninguna
// tabla. El hecho es del **video**, así que su tabla se llama por el video y no por el carril.
//
// ⚠️ `app.transcripciones.grabado_en` todavía existe en el esquema y ya **no la lee ni la escribe
// nadie**. Se dropea en una `030` aparte, después de que esto esté deployado y verificado
// (expand/contract): dropearla antes es `42703` en `COLUMNAS` de `lib/transcripciones.ts` y la zona
// Transcribir entera deja de cargar.

const filaGrabado = z.object({
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  url: z.string(),
  grabado_en: z.string(),
});

const COLUMNAS = "plataforma, external_id, url, grabado_en";

/** El arbiter del unique de la `029`. Con la instancia adentro, como manda `scoped.upsert`. */
const ARBITER = "instance_id,plataforma,external_id";

/**
 * Todas las marcas del cockpit, indexadas por clave de video.
 *
 * Se trae entero y no se filtra en la query porque **el llamador necesita el conjunto completo**:
 * cruza contra los guiones del histórico (que no tienen la clave en ninguna columna, se deriva de
 * su URL) y las que sobran son justamente las huérfanas, que hay que mostrar. Filtrar acá dejaría
 * fuera lo que la pantalla vino a buscar.
 *
 * ponytail: sin ventana ni paginado. Una marca son ~120 bytes y el techo real es "videos que el
 * equipo grabó", que crece de a decenas por mes — a 5.000 marcas esto son ~600 KB y ahí sí toca
 * paginar, pero paginar hoy costaría la unión completa por otro lado.
 */
export async function leerMarcas(ctx: TenantContext): Promise<Map<string, MarcaGrabado>> {
  const { data, error } = await (await scoped(ctx)).select("app.grabados", COLUMNAS);
  if (error)
    throw new Error(`Supabase respondió con error leyendo las marcas de grabado: ${error.message}`);

  const marcas = new Map<string, MarcaGrabado>();
  for (const f of z.array(filaGrabado).parse(data ?? [])) {
    marcas.set(claveDe(f), { clave: claveDe(f), url: f.url, grabadoEn: f.grabado_en });
  }
  return marcas;
}

/**
 * Marca uno. Idempotente: volver a marcar algo ya marcado no falla ni pisa la fecha original.
 *
 * `ignoreDuplicates` y no `merge`: la pregunta es *"¿cuándo se grabó?"*, y la respuesta correcta es
 * la primera vez que alguien lo dijo, no la última vez que alguien apretó el botón.
 */
export async function marcar(ctx: TenantContext, enlace: EnlaceVideo): Promise<void> {
  const { error } = await (await scoped(ctx)).upsert(
    "app.grabados",
    [{ plataforma: enlace.plataforma, external_id: enlace.external_id, url: enlace.url }],
    { onConflict: ARBITER, ignoreDuplicates: true },
  );
  if (error) throw new Error(`Supabase respondió con error marcando lo grabado: ${error.message}`);
}

/**
 * Marca un lote. Es la carga masiva del Excel (ADR-070 §6).
 *
 * Devuelve cuántas entraron de verdad: `.select()` sobre un upsert con `ignoreDuplicates` devuelve
 * **solo las filas nuevas**, así que la resta da las que ya estaban. Es el mismo truco que
 * `encolarEnlaces`, y por el mismo motivo — hasta que Postgres no responde nadie sabe cuántas eran
 * nuevas.
 *
 * Se trocea de a 200 por la misma razón que sus hermanas de `lib/transcripciones.ts`: un lote
 * grande arma un body de varios KB, y acá el equipo puede pegar la columna entera de un Excel.
 */
export async function marcarMuchos(
  ctx: TenantContext,
  enlaces: readonly EnlaceVideo[],
): Promise<{ nuevos: number; yaEstaban: number }> {
  if (enlaces.length === 0) return { nuevos: 0, yaEstaban: 0 };
  const s = await scoped(ctx);
  let nuevos = 0;

  for (let i = 0; i < enlaces.length; i += 200) {
    const lote = enlaces.slice(i, i + 200);
    const { data, error } = await s
      .upsert(
        "app.grabados",
        lote.map((e) => ({ plataforma: e.plataforma, external_id: e.external_id, url: e.url })),
        { onConflict: ARBITER, ignoreDuplicates: true },
      )
      .select("id");
    if (error)
      throw new Error(`Supabase respondió con error marcando el lote: ${error.message}`);
    nuevos += z.array(z.object({ id: z.string() })).parse(data ?? []).length;
  }

  return { nuevos, yaEstaban: enlaces.length - nuevos };
}

/**
 * Saca la marca. Devuelve `false` si no había nada que sacar (o no es de este cockpit — el filtro de
 * `scoped` entra en el `delete`). Ninguna de las dos es un error del servidor.
 *
 * 🔓 **Sin guardia**, igual que el toggle de ADR-069 §5 y por el mismo motivo: acá no hay nada que
 * destruir. Borrar la marca devuelve el estado exacto de antes y no toca un solo guion pagado.
 */
export async function desmarcar(
  ctx: TenantContext,
  plataforma: Plataforma,
  externalId: string,
): Promise<boolean> {
  const { data, error } = await (await scoped(ctx))
    .borrar("app.grabados")
    .eq("plataforma", plataforma)
    .eq("external_id", externalId)
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error sacando la marca: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Cuáles de esos links **ya se grabaron**. Es la pregunta que el pegote hace antes de cobrar.
 *
 * 🔑 **Se mudó acá desde `lib/transcripciones.ts` y en la mudanza se volvió más ancha**, que es el
 * punto entero de ADR-070: antes solo podía contestar por links que ya estaban en la cola del
 * transcriptor. Ahora contesta también por los que vinieron del **Feed** y por los que el equipo
 * **cargó a mano** — el caso que ADR-069 §2 dejó nombrado y sin cubrir.
 *
 * Se pregunta por `external_id` y la plataforma se compara después, en la clave: PostgREST no tiene
 * forma cómoda de filtrar por tuplas. Troceo de 200 por el 414 en producción, igual que sus
 * hermanas.
 */
export async function cualesGrabadas(ctx: TenantContext, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const s = await scoped(ctx);
  const claves = new Set<string>();

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await s
      .select("app.grabados", "plataforma, external_id")
      .in("external_id", ids.slice(i, i + 200));
    if (error)
      throw new Error(`Supabase respondió con error consultando las grabadas: ${error.message}`);
    for (const fila of z
      .array(z.object({ plataforma: z.string(), external_id: z.string() }))
      .parse(data ?? []))
      claves.add(`${fila.plataforma}:${fila.external_id}`);
  }
  return claves;
}
