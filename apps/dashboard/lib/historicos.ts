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

/**
 * Un guion del histórico, **sin su script**.
 *
 * 🔑 **El script salió del tipo a propósito** (ADR-070). La pantalla pasó de paginar de a 25 a traer
 * el histórico entero —lo necesita para cruzarlo con las marcas de grabado y filtrar por ellas— y
 * con los guiones adentro eso serían ~1,5 MB. Sin ellos son ~110 KB, el mismo orden que el feed
 * aceptó en el cierre 98 cuando hizo exactamente este movimiento (405 KB → 16 KB).
 *
 * Que el campo **no exista** en el tipo, en vez de venir `null`, es la parte que importa: un `null`
 * se dibujaría como *"Sin transcripción"* y estaría mintiendo sobre un guion que sí existe. Quien lo
 * quiera lo pide con `textoDeHistorico`, que es un viaje por fila abierta.
 */
export type Historico = {
  id: string;
  titulo: string;
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
  /** De dónde vino el guion: el feed de calificación o un enlace pegado (ADR-062). */
  origen: "feed" | "transcribir";
};

/** Con el guion adentro. Solo lo usa el CSV, que es justamente el artefacto que va a buscar texto. */
export type HistoricoConScript = Historico & { script: string | null };

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

// La fila cruda de `outputs`. Antes se leía sin esquema porque el cliente tipado devolvía `any`;
// con `scoped` el builder ya no infiere la forma, así que se declara — que es lo que hace el resto
// de `lib/` igual. `metadata` queda como bolsa a propósito: su contenido lo escribe el motor y se
// interpreta abajo con `texto`/`numero`, tolerando lo que falte.
const filaOutput = z.object({
  id: z.string(),
  titulo: z.string().nullable(),
  // `.optional()` porque la lista NO lo pide (ADR-070): cuando la query no nombra la columna,
  // PostgREST no la manda, y sin esto el parse se caería justo en el camino barato.
  contenido_o_link: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  calificado_en: z.string().nullable(),
});

// El tope existe para que esto no pueda convertirse en una query sin fondo el día que el histórico
// crezca: **corta y avisa** en vez de tumbar el request en silencio. Con 183 filas hoy y ~60
// aprobados por semana, 5.000 son ~18 meses — cuando muerda, la respuesta es paginar por fecha, no
// subir el número.
const TOPE_EXPORT = 5000;

/**
 * Una página de aprobados, de a `POR_PAGINA`. Devuelve también si queda más.
 *
 * El orden es por fecha de calificación descendente (lo último que el equipo decidió arriba),
 * con `id` como desempate para que la paginación sea estable: sin desempate, dos filas con el
 * mismo `calificado_en` pueden repetirse o saltearse entre páginas.
 *
 * `conScript` decide si viaja `contenido_o_link`, que es el campo gordo. Hoy solo lo pide el CSV.
 */
async function leerPagina(
  ctx: TenantContext,
  pagina: number,
  conScript: boolean,
): Promise<{ filas: HistoricoConScript[]; hayMas: boolean; total: number }> {
  const desde = pagina * POR_PAGINA;
  const columnas = conScript
    ? "id, titulo, contenido_o_link, metadata, calificado_en"
    : "id, titulo, metadata, calificado_en";

  const { data, error, count } = await (await scoped(ctx))
    .select("public.outputs", columnas, { count: "exact" })
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
      // Se deriva de `metadata.origen` y no de `tipo`, que no se lee en esta query. Lo que escribe
      // el archivado no trae la marca, y su ausencia significa "vino del feed": es el caso viejo y
      // el mayoritario, así que el default correcto es ese y no un "(desconocido)".
      origen: m.origen === "transcribir" ? "transcribir" : "feed",
    } satisfies HistoricoConScript;
  });

  const total = count ?? filas.length;
  return { filas, hayMas: desde + filas.length < total, total };
}

/**
 * **El histórico entero, sin guiones.** Es lo que carga la pantalla desde ADR-070.
 *
 * 🩸 **Por qué se dejó de paginar de a 25.** La pantalla ahora cruza cada guion con las marcas de
 * `app.grabados` y filtra por *sin grabar / grabados*. Ese cruce **no se puede empujar a la query**:
 * `outputs` no tiene columna con la clave del video —se deriva de `metadata.url_referente` en
 * memoria (ADR-070)— así que filtrar sobre una página de 25 daría "3 grabados" cuando hay 40, y el
 * contador mentiría sin que nada avise. O baja todo, o el filtro es falso.
 *
 * Lo que lo vuelve barato es que el `script` ya no viaja. **Medido contra prod el 2026-08-20, las
 * 183 filas aprobadas:** sin guion **74.888 bytes**, con guion **299.508**. El campo gordo era el
 * 75% del payload. Es el mismo trueque que hizo el feed en el cierre 98 (405 KB → 16 KB).
 *
 * ponytail: techo declarado. A partir de unos pocos miles de `outputs` esto pide una columna
 * `video_key` en la tabla (con su backfill y el nodo del archivado escribiéndola), y ahí el filtro
 * vuelve a la query y la paginación vuelve. Con ~60 aprobados por semana, eso es más de un año.
 */
export async function leerHistoricoCompleto(
  ctx: TenantContext,
): Promise<{ filas: Historico[]; truncado: boolean }> {
  const todas: Historico[] = [];

  for (let pagina = 0; todas.length < TOPE_EXPORT; pagina++) {
    const { filas, hayMas } = await leerPagina(ctx, pagina, false);
    todas.push(...filas);
    if (!hayMas || filas.length === 0) return { filas: todas, truncado: false };
  }
  return { filas: todas.slice(0, TOPE_EXPORT), truncado: true };
}

/**
 * El guion de UNA fila, cuando alguien la abre.
 *
 * El otro lado de haber sacado el script de la lista: se paga el texto de lo que alguien miró a
 * propósito. Mismo patrón que `leerTextos` en el feed y que `cargarTanda` en Transcribir.
 */
export async function textoDeHistorico(
  ctx: TenantContext,
  id: string,
): Promise<string | null> {
  const { data, error } = await (await scoped(ctx))
    .select("public.outputs", "contenido_o_link")
    .eq("id", id)
    .eq("estado", "aprobado")
    .maybeSingle();
  if (error)
    throw new Error(`Supabase respondió con error leyendo el guion: ${error.message}`);
  return texto(z.object({ contenido_o_link: z.string().nullable() }).nullable().parse(data ?? null)?.contenido_o_link);
}

// El histórico entero **con sus guiones**, para el CSV que reemplaza al Google Sheet (ADR-057).
// Es el único camino que paga el `contenido_o_link` de todas las filas, y tiene sentido: un
// descargable sin la columna SCRIPT no sirve para nada.
export async function leerTodosLosAprobados(
  ctx: TenantContext,
): Promise<{ filas: HistoricoConScript[]; truncado: boolean }> {
  const todas: HistoricoConScript[] = [];

  for (let pagina = 0; todas.length < TOPE_EXPORT; pagina++) {
    const { filas, hayMas } = await leerPagina(ctx, pagina, true);
    todas.push(...filas);
    if (!hayMas || filas.length === 0) return { filas: todas, truncado: false };
  }

  return { filas: todas.slice(0, TOPE_EXPORT), truncado: true };
}

// ── Lo que el transcriptor manda al histórico (ADR-062) ──────────────────────
//
// 🔑 **Histórico dejó de ser "lo que el equipo aprobó" y pasó a ser "lo que el equipo quiso
// guardar".** Una transcripción a pedido nunca se calificó —el glosario es explícito: *no es un
// Candidato*— así que meterla bajo la palabra *aprobó* habría sido mentir con el término. El
// significado nuevo es el que hace que esta función no sea un parche.
//
// Entra sola al quedar `listo`, sin botón de confirmación: si el histórico es lo que el equipo
// quiso guardar, **pegar el link ya es quererlo**.
//
// `estado: 'aprobado'` no dice que alguien lo aprobó: es el valor que `leerAprobados` filtra, o sea
// "está en el histórico". El origen real lo dice `tipo`, que es lo que separa estas filas de las
// del feed en las métricas — y `v_metricas_calidad` y las 5 vistas de `016` filtran por
// `tipo = 'guion_reel'`, así que **nada de esto ensucia una sola métrica**. Fue el hallazgo que
// volvió barata toda la decisión.
export const TIPO_TRANSCRIPCION = "transcripcion_a_pedido";

export async function registrarEnHistorico(
  ctx: TenantContext,
  runId: string,
  fila: { url: string; script: string; idioma: string; externalId: string; plataforma: string },
): Promise<void> {
  const { error } = await (await scoped(ctx)).upsert(
    "public.outputs",
    [
      {
        run_id: runId,
        tipo: TIPO_TRANSCRIPCION,
        // El título de un enlace pegado es su URL: nadie le puso nombre, y el video no trae uno
        // que podamos leer sin pagarle a alguien. Mejor la URL que un "(sin título)" que no ayuda.
        titulo: fila.url,
        contenido_o_link: fila.script,
        estado: "aprobado",
        external_id: fila.externalId,
        calificado_en: new Date().toISOString(),
        metadata: { origen: "transcribir", url_referente: fila.url, idioma: fila.idioma, plataforma: fila.plataforma },
      },
    ],
    // El mismo arbiter que usa el archivado (`016`): si alguien vuelve a transcribir el mismo link
    // en otra tanda, el histórico no gana una fila duplicada.
    { onConflict: "instance_id,external_id", ignoreDuplicates: true },
  );
  // Sumidero: si esto falla, el guion existe igual en `app.transcripciones` y lo único que se
  // pierde es su copia en el histórico. No se tira la transcripción por la que ya se pagó.
  if (error) console.error("[transcriptor] no se pudo registrar en el histórico:", error.message);
}
