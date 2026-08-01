import { esCalificacion, type Calificacion } from "@/domain/feed";
import { createAdminClient } from "@/lib/supabase/admin";

// Todo lo aprobado, de todas las semanas. A diferencia del feed, esto **no** sale de Airtable:
// el archivado archiva lo calificado a `outputs` y después borra el record, así que en Airtable
// solo vive lo de la semana en curso. `outputs` es el histórico canónico (ADR-014).
//
// Que lea Postgres tiene un segundo efecto que conviene saber: esta pantalla **no muere en D7**.
// Ya está leyendo la fuente definitiva; cuando el motor deje de escribir en Airtable, acá no
// cambia nada.
//
// ⚠️ No hay thumbnail: el `thumbnail` de un candidato es un attachment de Airtable que muere
// con el record y nunca se archivó (mapa-campos §4.3). El histórico es texto.

export const POR_PAGINA = 25;

export type Historico = {
  id: string;
  titulo: string;
  script: string | null;
  proyecto: string | null;
  voz: string | null;
  referente: string | null;
  urlReferente: string | null;
  calificacion: Calificacion | null;
  calificadoEn: string | null;
  views: number | null;
  likes: number | null;
  heat: number | null;
  relevanciaScore: number | null;
  relevanciaRazon: string | null;
  notas: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Una página de aprobados, de a `POR_PAGINA`. Devuelve también si queda más, para que el botón
 * "Cargar más" exista solo cuando sirve.
 *
 * El orden es por fecha de calificación descendente (lo último que el equipo decidió arriba),
 * con `id` como desempate para que la paginación sea estable: sin desempate, dos filas con el
 * mismo `calificado_en` pueden repetirse o saltearse entre páginas.
 */
export async function leerAprobados(
  pagina: number,
): Promise<{ filas: Historico[]; hayMas: boolean; total: number }> {
  const desde = pagina * POR_PAGINA;
  const supabase = createAdminClient();

  const { data, error, count } = await supabase
    .from("outputs")
    .select("id, titulo, contenido_o_link, metadata, calificado_en", { count: "exact" })
    .eq("estado", "aprobado")
    .order("calificado_en", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + POR_PAGINA - 1);

  if (error) throw new Error(`Supabase respondió con error leyendo el histórico: ${error.message}`);

  const filas = (data ?? []).map((row) => {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      titulo: texto(row.titulo) ?? "(sin título)",
      script: texto(row.contenido_o_link),
      proyecto: texto(m.proyecto),
      voz: texto(m.voz),
      referente: texto(m.referente),
      urlReferente: texto(m.url_referente),
      calificacion: esCalificacion(m.calificacion) ? m.calificacion : null,
      calificadoEn: texto(row.calificado_en),
      views: numero(m.views),
      likes: numero(m.likes),
      heat: numero(m.heat_score),
      relevanciaScore: numero(m.relevancia_score),
      relevanciaRazon: texto(m.relevancia_razon),
      notas: texto(m.notas_equipo),
    } satisfies Historico;
  });

  const total = count ?? filas.length;
  return { filas, hayMas: desde + filas.length < total, total };
}
