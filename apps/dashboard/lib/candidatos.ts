import { z } from "zod";
import {
  camposDeCalificacion,
  condicionDeFiltro,
  despuesDe,
  esCalificacion,
  FILTROS,
  type Calificacion,
  type CandidatoFeed,
  type Cursor,
  type Estado,
  type Filtro,
  type TextosCandidato,
} from "@/domain/feed";
import type { TenantContext } from "@/domain/tenant";
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
  proyectos: z.object({ nombre: z.string() }).nullable(),
  voces: z.object({ nombre: z.string() }).nullable(),
});

// Sin `script`, `relevancia_razon` ni `notas_equipo`: los pide `leerTextos` al abrir una tarjeta.
// El porqué —y los 240 KB de 337 que eso saca de la mesa— está en `CandidatoFeed`.
const COLUMNAS =
  "id, titulo, thumbnail_url, referente, url_referente, heat_score, relevancia_score, " +
  "idioma, views, likes, seguidores, engagement, viral_por_tamano, " +
  "calificacion, estado, proyectos(nombre), voces(nombre)";

/**
 * Cuántas tarjetas trae una página.
 *
 * 25 como el histórico, pero por otro motivo: allá es "nadie lee 500 tarjetas", acá es que el
 * mazo se recorre entero y lo que importa es que la primera pantalla llegue rápido. Con la grilla
 * de hasta 5 columnas, 25 son ~5 filas: más de un scroll de trabajo antes de tener que pedir más.
 */
export const POR_PAGINA = 25;

/**
 * Una página del feed de ESTE cockpit, con el proyecto ya resuelto a nombre por la FK.
 *
 * 🔑 **El filtro va en la query, no en el cliente.** Con paginación, filtrar en memoria mostraría
 * "los sin calificar *de estas 25*" en vez de "las 25 primeras sin calificar" — que es otra cosa,
 * y que con el mazo entero por calificar (165 de 165 al 06/08) se vería como una pantalla medio
 * vacía sin explicación.
 *
 * El orden es el mismo que `agrupar` aplica adentro de cada grupo —heat desc, empates por id— y
 * eso no es una coincidencia: es lo que deja que el cursor de `despuesDe` sea estable.
 */
export async function leerFeed(
  ctx: TenantContext,
  filtro: Filtro,
  cursor: Cursor | null = null,
): Promise<{ candidatos: CandidatoFeed[]; hayMas: boolean }> {
  let q = conFiltro((await scoped(ctx)).select("app.candidatos", COLUMNAS), filtro);
  if (cursor) q = q.or(despuesDe(cursor));

  // Se pide UNA de más para saber si hay página siguiente. Es más barato que un `count` aparte, y
  // el count real de cada filtro ya lo da `contarFeed` para los chips.
  const { data, error } = await q
    .order("heat_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(POR_PAGINA + 1);

  if (error) throw new Error(`Supabase respondió con error leyendo el feed: ${error.message}`);

  const filas = z.array(filaCandidato).parse(data ?? []);
  const hayMas = filas.length > POR_PAGINA;

  return {
    hayMas,
    candidatos: filas.slice(0, POR_PAGINA).map((r) => ({
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
    } satisfies CandidatoFeed)),
  };
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
