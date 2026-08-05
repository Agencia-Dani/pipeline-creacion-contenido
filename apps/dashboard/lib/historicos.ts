import { z } from "zod";
import { esCalificacion, type Calificacion } from "@/domain/feed";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

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
  seguidores: number | null;
  idioma: string | null;
  heat: number | null;
  relevanciaScore: number | null;
  relevanciaRazon: string | null;
  notas: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

// La fila cruda de `outputs`. Antes se leía sin esquema porque el cliente tipado devolvía `any`;
// con `scoped` el builder ya no infiere la forma, así que se declara — que es lo que hace el resto
// de `lib/` igual. `metadata` queda como bolsa a propósito: su contenido lo escribe el motor y se
// interpreta abajo con `texto`/`numero`, tolerando lo que falte.
const filaOutput = z.object({
  id: z.string(),
  titulo: z.string().nullable(),
  contenido_o_link: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  calificado_en: z.string().nullable(),
});

/**
 * Una página de aprobados, de a `POR_PAGINA`. Devuelve también si queda más, para que el botón
 * "Cargar más" exista solo cuando sirve.
 *
 * El orden es por fecha de calificación descendente (lo último que el equipo decidió arriba),
 * con `id` como desempate para que la paginación sea estable: sin desempate, dos filas con el
 * mismo `calificado_en` pueden repetirse o saltearse entre páginas.
 */
export async function leerAprobados(
  ctx: TenantContext,
  pagina: number,
): Promise<{ filas: Historico[]; hayMas: boolean; total: number }> {
  const desde = pagina * POR_PAGINA;

  const { data, error, count } = await (await scoped(ctx))
    .select("public.outputs", "id, titulo, contenido_o_link, metadata, calificado_en", { count: "exact" })
    .eq("estado", "aprobado")
    .order("calificado_en", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + POR_PAGINA - 1);

  if (error) throw new Error(`Supabase respondió con error leyendo el histórico: ${error.message}`);

  const filas = z.array(filaOutput).parse(data ?? []).map((row) => {
    const m = row.metadata ?? {};
    return {
      id: row.id,
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
      seguidores: numero(m.seguidores),
      idioma: texto(m.idioma),
      heat: numero(m.heat_score),
      relevanciaScore: numero(m.relevancia_score),
      relevanciaRazon: texto(m.relevancia_razon),
      notas: texto(m.notas_equipo),
    } satisfies Historico;
  });

  const total = count ?? filas.length;
  return { filas, hayMas: desde + filas.length < total, total };
}

// El histórico entero, para el CSV que reemplaza al Google Sheet (ADR-057). La pantalla pagina
// de a 25 porque nadie lee 500 tarjetas; el archivo descargable es justamente lo contrario, así
// que acá se recorren todas las páginas.
//
// El tope existe para que esto no pueda convertirse en una query sin fondo el día que el
// histórico crezca: **corta y avisa** en vez de tumbar el request en silencio. Con 88 filas hoy
// y ~60 aprobados por semana, 5.000 son ~18 meses — cuando muerda, la respuesta es paginar el
// export por fecha, no subir el número.
const TOPE_EXPORT = 5000;

export async function leerTodosLosAprobados(
  ctx: TenantContext,
): Promise<{ filas: Historico[]; truncado: boolean }> {
  const todas: Historico[] = [];

  for (let pagina = 0; todas.length < TOPE_EXPORT; pagina++) {
    const { filas, hayMas } = await leerAprobados(ctx, pagina);
    todas.push(...filas);
    if (!hayMas || filas.length === 0) return { filas: todas, truncado: false };
  }

  return { filas: todas.slice(0, TOPE_EXPORT), truncado: true };
}
