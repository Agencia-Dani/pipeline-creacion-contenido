import { z } from "zod";
import { claveDe, parsearEnlaces, type EnlaceVideo } from "@/domain/enlace";
import {
  camposDeCalificacion,
  condicionDeFiltro,
  esCalificacion,
  FILTROS,
  type Calificacion,
  type CandidatoFeed,
  type Estado,
  type Filtro,
  type TextosCandidato,
} from "@/domain/feed";
import type { TenantContext } from "@/domain/tenant";
import { fechaHora } from "@/lib/fechas";
import { scoped } from "@/lib/supabase/scoped";

// El feed de calificación. Desde D7 los candidatos viven **en Postgres**: los escribe el motor por
// PostgREST (ADR-035) y los lee el archivado por el mismo canal. Airtable ya no participa.
//
// Lo que el corte simplificó, y vale anotarlo porque era ruido puro:
//  · El proyecto se resuelve por **FK**, no cruzando record ids a mano. Un candidato no puede
//    apuntar a un proyecto inexistente: la base no lo deja. El grupo `(sin proyecto)` sigue
//    existiendo para `proyecto_id is null`, que sí es posible (el motor lo omite si no lo tiene).
//  · `thumbnail_url` es una columna de texto: se acabó el `urlDeMiniatura` sobre adjuntos.
//
// ⚠️ La contracara del thumbnail, ya medida (2026-08-01) y ya resuelta en `app/api/miniatura`:
// Airtable **descargaba y re-hosteaba** la imagen, y acá guardamos la URL cruda del CDN. Eso
// rompió las miniaturas por DOS razones, y la primera no era la que esperábamos:
//  1. El CDN de Instagram manda `cross-origin-resource-policy: same-origin`. El browser bloquea
//     el `<img>` cross-origin **siempre**, con la URL fresca o vencida. Era el bug de verdad.
//  2. La URL viene firmada con expiry de ~5 días, menos que la cadencia semanal.
// La pantalla no consume esta columna directo: la pasa por `/api/miniatura`, que sirve desde
// nuestro origen (resuelve 1) y copia a Supabase Storage en la primera vista (resuelve 2).
// Los 145 candidatos migrados de Airtable tienen `thumbnail_url` en null a propósito: eran
// adjuntos que murieron con el record, y no hay nada que proxear.

const filaCandidato = z.object({
  id: z.string(),
  titulo: z.string(),
  thumbnail_url: z.string().nullable(),
  referente: z.string().nullable(),
  url_referente: z.string().nullable(),
  heat_score: z.coerce.number().nullable(),
  relevancia_score: z.coerce.number().nullable(),
  idioma: z.string().nullable(),
  views: z.coerce.number().nullable(),
  likes: z.coerce.number().nullable(),
  seguidores: z.coerce.number().nullable(),
  engagement: z.coerce.number().nullable(),
  viral_por_tamano: z.boolean(),
  calificacion: z.string().nullable(),
  estado: z.string(),
  run_id: z.string().nullable(),
  proyectos: z.object({ nombre: z.string() }).nullable(),
  voces: z.object({ nombre: z.string() }).nullable(),
});

// Sin `script`, `relevancia_razon` ni `notas_equipo`: los pide `leerTextos` al abrir una tarjeta.
// El porqué —y los 240 KB de 337 que eso saca de la mesa— está en `CandidatoFeed`.
const COLUMNAS =
  "id, titulo, thumbnail_url, referente, url_referente, heat_score, relevancia_score, " +
  "idioma, views, likes, seguidores, engagement, viral_por_tamano, " +
  "calificacion, estado, run_id, proyectos(nombre), voces(nombre)";

/**
 * El feed **entero** de ESTE cockpit para un filtro, con el proyecto ya resuelto a nombre por la FK.
 *
 * 🔑 **El filtro va en la query, no en el cliente**, y sigue así aunque ya no haya paginación: es
 * lo que deja que `cargados` cambie solo cuando alguien le pide algo al server, y por lo tanto que
 * una tarjeta recién calificada **no se mueva de su lugar** (plan-cockpit §D6.4) sin necesidad de
 * un congelado que alguien tenga que mantener sincronizado.
 *
 * No pagina desde el 2026-08-06: el porqué, y el techo medido, están en `leerMazo`.
 *
 * El orden —heat desc, empates por id— es el mismo que `agrupar` aplica adentro de cada grupo.
 */
export async function leerFeed(
  ctx: TenantContext,
  filtro: Filtro,
): Promise<CandidatoFeed[]> {
  const { data, error } = await conFiltro(
    (await scoped(ctx)).select("app.candidatos", COLUMNAS),
    filtro,
  )
    .order("heat_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) throw new Error(`Supabase respondió con error leyendo el feed: ${error.message}`);

  const filas = z.array(filaCandidato).parse(data ?? []);
  const etiquetas = await etiquetasDeCorrida(
    ctx,
    [...new Set(filas.map((r) => r.run_id).filter((id): id is string => id !== null))],
  );

  return filas.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    thumbnail: r.thumbnail_url,
    proyecto: r.proyectos?.nombre ?? "",
    voz: r.voces?.nombre ?? null,
    referente: r.referente,
    urlReferente: r.url_referente,
    heat: r.heat_score,
    relevanciaScore: r.relevancia_score,
    idioma: r.idioma,
    views: r.views,
    likes: r.likes,
    seguidores: r.seguidores,
    engagement: r.engagement,
    viralPorTamano: r.viral_por_tamano,
    calificacion: esCalificacion(r.calificacion) ? r.calificacion : null,
    estado: (r.estado as Estado) ?? "nuevo",
    corrida: r.run_id ? (etiquetas.get(r.run_id)?.etiqueta ?? null) : null,
    corridaInicio: r.run_id ? (etiquetas.get(r.run_id)?.inicio ?? null) : null,
  } satisfies CandidatoFeed));
}

/**
 * `run_id` → su etiqueta legible **y su ISO**, para las corridas que aparecen en estas filas y
 * ninguna más.
 *
 * ⚠️ **Los dos, y no solo la etiqueta.** La etiqueta es texto para humanos (`"31 ago, 22:50"`) y
 * ordenar por ella pone *"1 sep"* antes de *"31 ago"* — el modo "agrupar por corrida" quedaría con
 * las corridas mezcladas sin que nada falle. El ISO ya venía en esta misma query; lo único que
 * cambiaba era tirarlo.
 *
 * 🔑 **Va acá y no en un embed de PostgREST.** `app.candidatos` está en el esquema `app` y `runs` en
 * `public`: un `runs(inicio)` sería un embed cruzando esquemas, que depende de cómo esté expuesto
 * PostgREST y falla en tiempo de ejecución, no de compilación. Una segunda query contra
 * `public.runs` —que ya está en el mapa de `scoped`, con grano instancia— usa el camino que el
 * resto del cockpit ya usa.
 *
 * **Es sumidero: si falla, devuelve el mapa vacío y el feed se dibuja sin corridas.** Saber de qué
 * corrida salió un video no puede impedir calificarlo, que es a lo que la pantalla existe.
 *
 * ⚠️ La etiqueta es la fecha de inicio, no el uuid (ADR-081): dos corridas del mismo minuto
 * colisionarían. El guard single-flight (ADR-023 C.3) lo hace imposible mientras exista.
 */
async function etiquetasDeCorrida(
  ctx: TenantContext,
  ids: readonly string[],
): Promise<Map<string, { etiqueta: string; inicio: string }>> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await (await scoped(ctx))
      .select("public.runs", "id, inicio")
      .in("id", [...ids]);
    if (error) throw new Error(error.message);
    return new Map(
      z.array(z.object({ id: z.string(), inicio: z.string() }))
        .parse(data ?? [])
        .map((r) => [r.id, { etiqueta: fechaHora(r.inicio), inicio: r.inicio }] as const),
    );
  } catch (e) {
    console.error("[candidatos] no se pudieron leer las corridas del feed (ADR-081):", e);
    return new Map();
  }
}

/** El lado PostgREST de `condicionDeFiltro`, aplicado al builder. */
function conFiltro<Q extends {
  is(c: string, v: null): Q;
  eq(c: string, v: string): Q;
  in(c: string, v: string[]): Q;
}>(q: Q, filtro: Filtro): Q {
  const cond = condicionDeFiltro(filtro);
  if (cond === null) return q;
  if (cond.op === "is") return q.is("calificacion", cond.valor);
  if (cond.op === "eq") return q.eq("calificacion", cond.valor);
  return q.in("calificacion", [...cond.valor]);
}

/**
 * Los cuatro contadores de los chips, sobre la tabla entera y no sobre la página.
 *
 * Son `head: true` + `count: exact`: cuatro conteos sin traer una sola fila. Es lo que deja que
 * los chips sigan diciendo el avance real ("quedan 140 sin calificar") en vez del tamaño de la
 * página, que es lo que se perdería al paginar sin esto.
 */
export async function contarFeed(ctx: TenantContext): Promise<Record<Filtro, number>> {
  const s = await scoped(ctx);

  const entradas = await Promise.all(
    FILTROS.map(async (filtro) => {
      const { count, error } = await conFiltro(
        s.select("app.candidatos", "id", { count: "exact", head: true }),
        filtro,
      );
      if (error) {
        throw new Error(`Supabase respondió con error contando el feed: ${error.message}`);
      }
      return [filtro, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entradas) as Record<Filtro, number>;
}

/**
 * Qué haría el archivado si se disparara **ahora mismo**: cuántos manda al histórico y cuántos borra.
 *
 * 🔴 **Existe porque el botón sin números no alcanza.** La confirmación de `<BotonArchivar>` ya
 * decía que descarta lo que quedó sin calificar hace más de 20 días, y aun así es una frase: medido
 * contra prod el 2026-08-21, apretarlo archivaba **2** y borraba **67** — dos tercios del feed. La
 * diferencia entre *"descarta lo viejo"* y *"borra 67"* es si alguien lee la advertencia.
 *
 * ⚠️ **`DIAS_ANTES_DE_BARRER` es la MISMA regla que el nodo `Barrer candidatos sin calificar` de
 * `Workflows/workflow-archivado/workflow.json`, escrita dos veces.** Es la única forma que hay de
 * anticipar lo que va a hacer n8n desde acá —no hay a quién preguntarle— y por eso la duplicación es
 * consciente, no un descuido. **Si alguien cambia el `days: 20` del nodo y no cambia esto, el botón
 * pasa a mentir con precisión**, que es peor que la frase vaga que reemplazó. Quien toque uno tiene
 * que tocar el otro.
 *
 * Se cuenta **en el momento de apretar** y no se cachea: los 67 de hoy son los que cumplieron 20
 * días hoy. *Medir el martes no autoriza a borrar el jueves.*
 */
export const DIAS_ANTES_DE_BARRER = 20;

export async function queHariaArchivar(
  ctx: TenantContext,
): Promise<{ aprobados: number; aBorrar: number }> {
  const s = await scoped(ctx);
  const corte = new Date(Date.now() - DIAS_ANTES_DE_BARRER * 24 * 60 * 60 * 1000).toISOString();

  const [decididos, viejos] = await Promise.all([
    s.select("app.candidatos", "id", { count: "exact", head: true }).neq("estado", "nuevo"),
    s
      .select("app.candidatos", "id", { count: "exact", head: true })
      .eq("estado", "nuevo")
      .lt("creado_en", corte),
  ]);

  if (decididos.error || viejos.error) {
    throw new Error(
      `Supabase respondió con error mirando qué haría el archivado: ${
        decididos.error?.message ?? viejos.error?.message
      }`,
    );
  }
  // `neq("estado","nuevo")` y no `eq("estado","aprobado")`: es literalmente lo que lee el nodo
  // `Leer Candidatos calificados`, que se lleva los descartados también.
  return { aprobados: decididos.count ?? 0, aBorrar: viejos.count ?? 0 };
}

/**
 * Los tres campos largos de UN candidato, para cuando alguien abre su tarjeta.
 *
 * Fail-loud si ya no está, igual que `actualizar` y por lo mismo: el barrido del domingo pudo
 * habérselo llevado, y desde ADR-047 "no está" también significa "no es de este cockpit".
 */
export async function leerTextos(ctx: TenantContext, id: string): Promise<TextosCandidato> {
  const { data, error } = await (await scoped(ctx))
    .select("app.candidatos", "script, relevancia_razon, notas_equipo")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Supabase respondió con error leyendo el candidato: ${error.message}`);
  if (!data) throw new Error("Ese candidato ya no está en el feed.");

  const fila = z
    .object({
      script: z.string().nullable(),
      relevancia_razon: z.string().nullable(),
      notas_equipo: z.string().nullable(),
    })
    .parse(data);

  return {
    script: fila.script,
    relevanciaRazon: fila.relevancia_razon,
    notas: fila.notas_equipo,
  };
}

/**
 * Calificar: los TRES campos, siempre juntos (ADR-034 + el hallazgo de D7 sobre
 * `fecha_calificacion`, que en Airtable se calculaba sola y en Postgres no tiene autor).
 * Escribir solo `calificacion` dejaría al candidato en `nuevo` — invisible para el archivado y
 * purgado a los 20 días sin pasar por el histórico.
 */
export async function calificar(
  ctx: TenantContext,
  id: string,
  calificacion: Calificacion,
): Promise<void> {
  await actualizar(ctx, id, camposDeCalificacion(calificacion));
}

/**
 * Agrupar es aprobar (ADR-075): los videos que entran a una colección y **están sin calificar**
 * quedan en 👍.
 *
 * 🩸 **Tapa un hueco que se descubre a los 20 días y no antes.** El archivado manda a `outputs` lo
 * que tiene `estado <> nuevo`, y su nodo `Barrer candidatos sin calificar` **borra** lo que sigue en
 * `nuevo` pasados 20 días. Un video sin calificar metido a una colección cae justo en el medio: la
 * colección sobrevive (apunta a la llave del video, ADR-073) pero **su guion crudo desaparece** —
 * `leerCrudo` busca en `transcripciones → candidatos → outputs` y ya no queda ninguno de los tres.
 * Un aprobado, en cambio, llega a `outputs` y su guion vive para siempre.
 *
 * 👍 y **no** 🔥: `Destilar criterios` (ADR-022) le pasa los 🔥 a Haiku como los ejemplos con los
 * que redefine el criterio de búsqueda del proyecto. Agrupar 40 videos para bajarlos en un Word le
 * reescribiría el norte al motor. Agrupar es una señal positiva **débil** y se registra como tal.
 *
 * 🔒 **Nunca pisa un juicio que ya estaba.** El filtro es `estado = nuevo`, así que un 👎 metido a
 * una colección sigue siendo 👎 — que es un caso legítimo ("guardá los malos para mostrarlos").
 *
 * Devuelve cuántos aprobó. **Es sumidero: no tira.** Aprobar es el efecto secundario de agregar, y
 * fallar acá no puede impedir lo que la persona pidió (invariante #1 de PLAN §2.5).
 */
export async function aprobarSiEstanSinCalificar(
  ctx: TenantContext,
  enlaces: readonly EnlaceVideo[],
): Promise<number> {
  if (enlaces.length === 0) return 0;
  const buscadas = new Set(enlaces.map(claveDe));

  try {
    const s = await scoped(ctx);
    // `external_id` alcanza para acotar la lectura, pero **no** para decidir: `app.candidatos` no
    // tiene columna `plataforma`, y un id de Instagram y uno de TikTok son los dos enteros de 19
    // dígitos (ver `claveDe`). La plataforma se deriva de `url_referente`, que es la misma
    // derivación que usa todo el resto — no una segunda.
    const { data, error } = await s
      .select("app.candidatos", "id, url_referente")
      .eq("estado", "nuevo")
      .in("external_id", [...new Set(enlaces.map((e) => e.external_id))]);
    if (error) throw new Error(error.message);

    const ids: string[] = [];
    for (const fila of z.array(filaParaAprobar).parse(data ?? [])) {
      const { validos } = parsearEnlaces(fila.url_referente ?? "");
      if (validos.length === 1 && buscadas.has(claveDe(validos[0]))) ids.push(fila.id);
    }
    if (ids.length === 0) return 0;

    const { data: tocados, error: errorUpdate } = await s
      .update("app.candidatos", camposDeCalificacion("👍"))
      .in("id", ids)
      .select("id");
    if (errorUpdate) throw new Error(errorUpdate.message);
    return (tocados ?? []).length;
  } catch (e) {
    console.error("[candidatos] no se pudo aprobar lo agrupado (ADR-075):", e);
    return 0;
  }
}

const filaParaAprobar = z.object({ id: z.string(), url_referente: z.string().nullable() });

/**
 * Calificar en lote: los mismos tres campos, un solo UPDATE.
 *
 * Un bucle sobre `calificar()` habría sido más corto de escribir y son N viajes a Postgres: Jero
 * calificó 80 videos en un día, de a uno, y ese es exactamente el caso que esto acelera.
 *
 * Devuelve cuántos tocó. Puede ser **menos** que los ids pedidos sin que sea un error: el barrido
 * pudo llevarse alguno, o el id puede no ser de este cockpit (el filtro de `scoped` entra en el
 * `update`, ADR-047). Quien llama decide si esa diferencia le importa.
 */
export async function calificarMuchos(
  ctx: TenantContext,
  ids: readonly string[],
  calificacion: Calificacion,
): Promise<number> {
  if (ids.length === 0) return 0;
  let tocados = 0;
  // De a 200, como `marcarMuchos` y `agregarMiembros`: una URL de PostgREST muy larga da 414 en
  // prod, y seleccionar el feed entero es un caso real.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (await scoped(ctx))
      .update("app.candidatos", camposDeCalificacion(calificacion))
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (error) throw new Error(`Supabase respondió con error calificando el lote: ${error.message}`);
    tocados += (data ?? []).length;
  }
  return tocados;
}

/**
 * Las notas son la válvula de escape de ADR-034: "buen video pero no lo quiero" dejó de ser
 * expresable con el emoji. No se pierden — el archivado las lleva a `outputs.metadata`.
 */
export async function guardarNotas(ctx: TenantContext, id: string, notas: string): Promise<void> {
  await actualizar(ctx, id, { notas_equipo: notas });
}

/**
 * Fail-loud si el candidato ya no existe: el barrido del domingo pudo habérselo llevado.
 *
 * Y desde ADR-047, "no existe" incluye "no es de este cockpit": el filtro de `scoped` entra en el
 * `update`, así que calificar un id de otra empresa no lo toca — devuelve 0 filas y tira. Ese
 * mensaje es el mismo a propósito: no confirma que el id exista en otro lado.
 */
async function actualizar(
  ctx: TenantContext,
  id: string,
  campos: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.candidatos", campos)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el candidato: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese candidato ya no está en el feed.");
}
