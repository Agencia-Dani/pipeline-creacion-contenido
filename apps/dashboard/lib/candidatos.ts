import { z } from "zod";
import {
  camposDeCalificacion,
  esCalificacion,
  type Calificacion,
  type CandidatoFeed,
  type Estado,
} from "@/domain/feed";
import { createAdminClient } from "@/lib/supabase/admin";

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
  script: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  referente: z.string().nullable(),
  url_referente: z.string().nullable(),
  heat_score: z.coerce.number().nullable(),
  relevancia_score: z.coerce.number().nullable(),
  relevancia_razon: z.string().nullable(),
  idioma: z.string().nullable(),
  views: z.coerce.number().nullable(),
  likes: z.coerce.number().nullable(),
  seguidores: z.coerce.number().nullable(),
  viral_por_tamano: z.boolean(),
  calificacion: z.string().nullable(),
  estado: z.string(),
  notas_equipo: z.string().nullable(),
  proyectos: z.object({ nombre: z.string() }).nullable(),
});

const COLUMNAS =
  "id, titulo, script, thumbnail_url, referente, url_referente, heat_score, relevancia_score, " +
  "relevancia_razon, idioma, views, likes, seguidores, viral_por_tamano, calificacion, estado, " +
  "notas_equipo, proyectos(nombre)";

/** Todo lo que hay en el feed, con el proyecto ya resuelto a nombre por la FK. */
export async function leerFeed(): Promise<CandidatoFeed[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.schema("app").from("candidatos").select(COLUMNAS);
  if (error) throw new Error(`Supabase respondió con error leyendo el feed: ${error.message}`);

  return z.array(filaCandidato).parse(data).map((r) => ({
    id: r.id,
    titulo: r.titulo,
    script: r.script,
    thumbnail: r.thumbnail_url,
    proyecto: r.proyectos?.nombre ?? "",
    referente: r.referente,
    urlReferente: r.url_referente,
    heat: r.heat_score,
    relevanciaScore: r.relevancia_score,
    relevanciaRazon: r.relevancia_razon,
    idioma: r.idioma,
    views: r.views,
    likes: r.likes,
    seguidores: r.seguidores,
    viralPorTamano: r.viral_por_tamano,
    calificacion: esCalificacion(r.calificacion) ? r.calificacion : null,
    estado: (r.estado as Estado) ?? "nuevo",
    notas: r.notas_equipo,
  } satisfies CandidatoFeed));
}

/**
 * Calificar: los TRES campos, siempre juntos (ADR-034 + el hallazgo de D7 sobre
 * `fecha_calificacion`, que en Airtable se calculaba sola y en Postgres no tiene autor).
 * Escribir solo `calificacion` dejaría al candidato en `nuevo` — invisible para el archivado y
 * purgado a los 20 días sin pasar por el histórico.
 */
export async function calificar(id: string, calificacion: Calificacion): Promise<void> {
  await actualizar(id, camposDeCalificacion(calificacion));
}

/**
 * Las notas son la válvula de escape de ADR-034: "buen video pero no lo quiero" dejó de ser
 * expresable con el emoji. No se pierden — el archivado las lleva a `outputs.metadata`.
 */
export async function guardarNotas(id: string, notas: string): Promise<void> {
  await actualizar(id, { notas_equipo: notas });
}

/** Fail-loud si el candidato ya no existe: el barrido del domingo pudo habérselo llevado. */
async function actualizar(id: string, campos: Record<string, unknown>): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("candidatos")
    .update(campos)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el candidato: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese candidato ya no está en el feed.");
}
