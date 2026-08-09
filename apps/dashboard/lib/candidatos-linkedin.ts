import { z } from "zod";
import { camposDeCalificacion, esCalificacion, esVeredicto, type Calificacion, type Veredicto } from "@/domain/feed";
import {
  ordenarDescartesLinkedin,
  ordenarMazo,
  type CandidatoLinkedin,
  type DescarteLinkedin,
} from "@/domain/feed-linkedin";
import { esFuente, type Carril, type Fuente } from "@/domain/linkedin";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// El material que la máquina de LinkedIn trae, para curar (`020` §4 y §5).
//
// 🩸 **Las dos tablas están VACÍAS y su motor no existe** (ADR-055: sin definición de "funcionó",
// sin banco de referentes y sin few-shot). Estas pantallas se construyen igual porque son el destino
// de lo que el motor va a producir, y porque sembrando 3 o 4 filas a mano se puede ejercitar la RLS
// de la `024`, que nunca se probó con datos.
//
// 🔑 **El techo es EXPLÍCITO y se reporta**, y esa es la lección de ADR-064 aplicada antes de que
// muerda: `leerTranscripciones` traía "las últimas 50 y punto" con 110 filas en la base, así que la
// pantalla ocultaba más de la mitad **sin avisar** y una fila fallada quedó inalcanzable. Acá se
// pide el total con `count: "exact"` y la pantalla dice "mostrando N de M" cuando difieren. Un techo
// que se ve no es una ventana muda.

/** Cuántas filas trae la lista. Generoso porque las tablas nacen vacías; visible porque existe. */
export const TECHO = 200;

const filaCandidato = z.object({
  id: z.string(),
  external_id: z.string(),
  carril: z.string(),
  fuente: z.string(),
  titulo: z.string(),
  idioma: z.string().nullable(),
  url: z.string().nullable(),
  autor: z.string().nullable(),
  imagen_url: z.string().nullable(),
  reacciones: z.number().nullable(),
  comentarios: z.number().nullable(),
  heat_score: z.number().nullable(),
  relevancia_score: z.number().nullable(),
  proyecto_id: z.string().nullable(),
  voz_id: z.string().nullable(),
  calificacion: z.string().nullable(),
  estado: z.string(),
});

// Sin `texto` ni `relevancia_razon`: son los campos gordos y la lista no los dibuja. Es la línea que
// llevó el feed de reels de ~405 KB a ~16 KB por carga, trazada acá antes de tener una sola fila.
const COLUMNAS =
  "id, external_id, carril, fuente, titulo, idioma, url, autor, imagen_url, reacciones, comentarios, heat_score, relevancia_score, proyecto_id, voz_id, calificacion, estado";

const filaDescarte = z.object({
  id: z.string(),
  carril: z.string(),
  fuente: z.string(),
  titulo: z.string(),
  url: z.string().nullable(),
  autor: z.string().nullable(),
  relevancia_score: z.number().nullable(),
  relevancia_razon: z.string().nullable(),
  veredicto: z.string().nullable(),
});

const COLUMNAS_DESCARTE =
  "id, carril, fuente, titulo, url, autor, relevancia_score, relevancia_razon, veredicto";

/** Lo que la lista devuelve: las filas y **cuántas hay de verdad**. */
export type Listado<T> = { filas: T[]; total: number };

export async function leerFeedLinkedin(
  ctx: TenantContext,
): Promise<Listado<CandidatoLinkedin>> {
  const { data, error, count } = await (await scoped(ctx))
    .select("app.candidatos_linkedin", COLUMNAS, { count: "exact" })
    // El orden fino lo pone el dominio, pero el `order` de la query igual hace falta: sin él, el
    // `limit` corta un conjunto **arbitrario** y el techo dejaría afuera filas al azar en vez de
    // las de menos señal. Ordenar en la base decide QUÉ 200 llegan; ordenar en el dominio decide
    // cómo se dibujan esas 200.
    .order("heat_score", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(TECHO);

  if (error) {
    throw new Error(`Supabase respondió con error leyendo el feed de LinkedIn: ${error.message}`);
  }

  const filas = z.array(filaCandidato).parse(data ?? []).map((c) => ({
    id: c.id,
    externalId: c.external_id,
    carril: (c.carril === "personal" ? "personal" : "copiable") as Carril,
    fuente: esFuente(c.fuente) ? c.fuente : ("web" as Fuente),
    titulo: c.titulo,
    idioma: c.idioma,
    url: c.url,
    autor: c.autor,
    imagenUrl: c.imagen_url,
    reacciones: c.reacciones,
    comentarios: c.comentarios,
    heatScore: c.heat_score,
    relevanciaScore: c.relevancia_score,
    proyectoId: c.proyecto_id,
    vozId: c.voz_id,
    // Una calificación fuera del vocabulario sería alguien escribiendo por fuera de la app: se lee
    // como "sin calificar" en vez de romper el render entero por una fila.
    calificacion: esCalificacion(c.calificacion) ? c.calificacion : null,
    estado: (c.estado === "aprobado" || c.estado === "descartado" ? c.estado : "nuevo") as
      | "nuevo"
      | "aprobado"
      | "descartado",
  } satisfies CandidatoLinkedin));

  return { filas: ordenarMazo(filas), total: count ?? filas.length };
}

/**
 * Califica una pieza. Escribe **los tres campos juntos** con `camposDeCalificacion`, que es la misma
 * función que usa reels.
 *
 * 🔑 `fecha_calificacion` va incluida y no es decorativa: en reels su ausencia dejaba
 * `v_metricas_calidad` en cero **sin fallar**. Acá todavía no hay vista que la lea, y justamente por
 * eso conviene escribirla desde el día uno — la columna existe y el día que alguien la mire, va a
 * tener historia en vez de nulls.
 *
 * ⚠️ **Calificar en LinkedIn NO archiva.** En reels, aprobar alimenta al archivado que escribe
 * `outputs` y llena `output_id`; acá no hay archivador todavía, así que esto mueve el estado y nada
 * más. La pantalla lo dice con todas las letras para que el equipo no espere un CSV que no viene.
 */
export async function calificarLinkedin(
  ctx: TenantContext,
  id: string,
  calificacion: Calificacion,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.candidatos_linkedin", camposDeCalificacion(calificacion, new Date()))
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error calificando: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Esa pieza ya no existe. Recargá la página.");
}

/** El texto completo de una pieza. Se pide al abrirla, que es la otra mitad de por qué la lista no lo trae. */
export async function leerTextoLinkedin(ctx: TenantContext, id: string): Promise<string | null> {
  const { data, error } = await (await scoped(ctx))
    .select("app.candidatos_linkedin", "texto")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase respondió con error leyendo la pieza: ${error.message}`);
  return z.object({ texto: z.string().nullable() }).nullable().parse(data)?.texto ?? null;
}

// ─────────────────────────── Descartes ───────────────────────────

export async function leerDescartesLinkedin(
  ctx: TenantContext,
): Promise<Listado<DescarteLinkedin>> {
  const { data, error, count } = await (await scoped(ctx))
    .select("app.descartes_linkedin", COLUMNAS_DESCARTE, { count: "exact" })
    .order("relevancia_score", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(TECHO);

  if (error) {
    throw new Error(`Supabase respondió con error leyendo los descartes de LinkedIn: ${error.message}`);
  }

  const filas = z.array(filaDescarte).parse(data ?? []).map((d) => ({
    id: d.id,
    carril: (d.carril === "personal" ? "personal" : "copiable") as Carril,
    fuente: esFuente(d.fuente) ? d.fuente : ("web" as Fuente),
    titulo: d.titulo,
    url: d.url,
    autor: d.autor,
    relevanciaScore: d.relevancia_score,
    relevanciaRazon: d.relevancia_razon,
    veredicto: esVeredicto(d.veredicto) ? d.veredicto : null,
  } satisfies DescarteLinkedin));

  return { filas: ordenarDescartesLinkedin(filas), total: count ?? filas.length };
}

/**
 * El veredicto sobre un descarte: si el filtro acertó o se equivocó.
 *
 * Es lo que corrige los criterios. **Se puede cambiar de opinión** (no hay guarda de "ya tiene
 * veredicto") porque el juicio es del equipo y revisarlo es parte del trabajo, no un error.
 */
export async function juzgarDescarteLinkedin(
  ctx: TenantContext,
  id: string,
  veredicto: Veredicto,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.descartes_linkedin", { veredicto })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el veredicto: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese descarte ya no existe. Recargá la página.");
}
