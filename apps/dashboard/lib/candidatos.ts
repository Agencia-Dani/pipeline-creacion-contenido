import { camposDeCalificacion, esCalificacion, type Calificacion, type CandidatoFeed, type Estado } from "@/domain/feed";
import { leerTabla, parchearRegistro, urlDeMiniatura } from "@/lib/airtable";
import { leerProyectos } from "@/lib/referentes";

// El feed de calificación (D6). Los candidatos siguen viviendo **en Airtable**, y eso es a
// propósito: los escribe el motor y los lee el archivado en 7 nodos (archivar a `outputs`,
// contar métricas de la semana, destilar criterios, barrer los viejos). D6 cambia la
// SUPERFICIE, no el dueño — el corte de estas tablas es D7, con su re-import.
//
// Por eso `Candidatos` y `Descartes del gate` SIGUEN en el catálogo de sombra
// (`scripts/comun.ts`), al revés de lo que manda el procedimiento del corte 1/4: ahí la regla
// era "la tabla cortada sale del catálogo", y acá no hay corte, así que Postgres sigue siendo
// un espejo de solo lectura y el `sombra:diff` tiene que seguir dando cero.
//
// ⚠️ Las URLs de `thumbnail` son attachments de Airtable y **vencen a las ~2 h**. Nunca se
// cachean: `leerTabla` va con `cache: "no-store"` y la página es `force-dynamic`. Si alguna vez
// se cachea la página o las URLs pasan por el optimizador de imágenes de Next, las tarjetas
// quedan rotas y el bug parece intermitente.

export const TABLA = "Candidatos";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

function primerLink(v: unknown): string | null {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
}

/**
 * Todo lo que hay en el feed, con el proyecto ya resuelto a nombre.
 *
 * El cruce va por record id de Airtable porque el motor escribe `Candidatos.proyecto` como
 * *link* (ADR-033 §3: eso muere recién en D7). Un candidato cuyo proyecto no exista de este
 * lado no se esconde — cae en el grupo `(sin proyecto)`, que es visible y raro a propósito:
 * esconderlo sería perder trabajo sin avisar.
 */
export async function leerFeed(): Promise<CandidatoFeed[]> {
  const [registros, proyectos] = await Promise.all([leerTabla(TABLA, ""), leerProyectos()]);
  const nombrePorAirtableId = new Map(
    proyectos.filter((p) => p.airtableId).map((p) => [p.airtableId!, p.nombre]),
  );

  return registros.map((r) => {
    const f = r.fields;
    const calificacion = esCalificacion(f.calificacion) ? f.calificacion : null;
    const estadoCrudo = texto(f.estado);
    const proyectoId = primerLink(f.proyecto);

    return {
      id: r.id,
      titulo: texto(f.titulo) ?? "(sin título)",
      script: texto(f.script),
      thumbnail: urlDeMiniatura(f.thumbnail),
      proyecto: (proyectoId && nombrePorAirtableId.get(proyectoId)) ?? "",
      referente: texto(f.referente),
      urlReferente: texto(f.url_referente),
      heat: numero(f.heat_score),
      relevanciaScore: numero(f.relevancia_score),
      relevanciaRazon: texto(f.relevancia_razon),
      idioma: texto(f.idioma),
      views: numero(f.views),
      likes: numero(f.likes),
      seguidores: numero(f.seguidores),
      viralPorTamano: f.viral_por_tamano === true,
      calificacion,
      estado: (estadoCrudo as Estado | null) ?? "nuevo",
      notas: texto(f.notas_equipo),
    } satisfies CandidatoFeed;
  });
}

/**
 * Calificar: los DOS campos, siempre juntos (ADR-034). Escribir solo `calificacion` dejaría al
 * candidato en `nuevo`, o sea invisible para el archivado y purgado a los 20 días sin pasar por
 * el histórico — el agujero del 14% medido sobre `outputs`.
 */
export async function calificar(id: string, calificacion: Calificacion): Promise<void> {
  await parchearRegistro(TABLA, id, camposDeCalificacion(calificacion));
}

/**
 * Las notas son la válvula de escape de ADR-034: la combinación "buen video pero no lo quiero"
 * dejó de ser expresable con el emoji, así que vive acá. No se pierden — desde D.3(b) el
 * archivado las lleva a `outputs.metadata`.
 */
export async function guardarNotas(id: string, notas: string): Promise<void> {
  await parchearRegistro(TABLA, id, { notas_equipo: notas });
}
