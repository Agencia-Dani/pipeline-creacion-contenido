// Dominio puro de las colecciones (ADR-073).
//
// Dos reglas viven acá, y las dos cuestan plata o la ahorran:
//  1. Qué nombre es válido (espejo del check de la `031`, para contestar sin ir a la base).
//  2. **Qué videos hay que enriquecer**, que es la que decide cuánto se le paga a Apify.
//
// Y desde el 2026-08-24, la tercera: la **tabla** de la colección, o sea la mitad planilla de lo
// que el `.docx` cuenta en prosa.

import type { GuionParaDocumento } from "./formatos/docx.ts";
import type { Video } from "./video.ts";

export const NOMBRE_MIN = 1;
export const NOMBRE_MAX = 80;

export type NombreValidado =
  | { ok: true; nombre: string }
  | { ok: false; motivo: string };

/**
 * Valida y normaliza el nombre de una colección.
 *
 * Es el espejo exacto del `check (length(trim(nombre)) between 1 and 80)` de la `031`. Se duplica a
 * propósito y **la base sigue siendo la autoridad**: acá está para contestar sin un viaje de red y
 * con un mensaje en castellano, no para reemplazarla. Si los dos se separaran, gana la base y esto
 * queda mostrando un error tarde — que es el modo de falla barato.
 *
 * Devuelve el nombre **ya trimmeado**: guardar `"  Milena  "` haría que el unique
 * `(instance_id, nombre)` deje pasar dos colecciones visualmente idénticas.
 */
export function validarNombre(crudo: string): NombreValidado {
  const nombre = crudo.trim();
  if (nombre.length < NOMBRE_MIN) return { ok: false, motivo: "Ponele un nombre a la colección." };
  if (nombre.length > NOMBRE_MAX) {
    return { ok: false, motivo: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres.` };
  }
  return { ok: true, nombre };
}

/**
 * ¿Hay que comprarle metadata a este video?
 *
 * 🔴 **Esta función ES la factura de Apify.** Cada `true` es una llamada que se paga.
 *
 * 🔑 **El criterio es "no se puede identificar", no "le falta algo".** Un video sin título Y sin
 * referente es un link pelado: no hay forma de saber qué es sin abrirlo, y son los 130 de
 * Transcribir y los 291 links cargados a mano (medido el 2026-08-21). Un video que tiene título y
 * referente **ya se identifica**, y pagar por completarle la miniatura sería comprar cosmética: la
 * tarjeta ya sabe dibujar la inicial del referente cuando no hay imagen.
 *
 * Eso deja a propósito sin miniatura a las 55 filas `guion_reel` del histórico, que tienen título y
 * referente y ninguna imagen (`outputs` nunca la guardó). **Es una decisión de costo, no un olvido:**
 * son 55 llamadas por una imagen que no cambia ninguna decisión. Hacia adelante el arreglo del
 * archivado (ADR-072 §6) las trae gratis.
 */
export function necesitaEnriquecer(video: Video): boolean {
  return video.titulo === null && video.referente === null;
}

/** Los que hay que mandar a scrapear, sin repetidos. El resto ya se identifica y no se toca. */
export function queFaltaEnriquecer(videos: readonly Video[]): Video[] {
  const vistos = new Set<string>();
  return videos.filter((v) => {
    if (!necesitaEnriquecer(v) || vistos.has(v.clave)) return false;
    vistos.add(v.clave);
    return true;
  });
}


// ── Borrar la colección ──────────────────────────────────────────────────────

/**
 * Lo que hay que saber **antes** de decir que sí.
 *
 * 🔑 **Vive acá porque lo dicen DOS pantallas** (el índice y el detalle), y dos frases distintas
 * para el mismo acto es cómo alguien aprende que una es otra cosa. Es el mismo criterio con el que
 * este repo trata cualquier regla duplicada: *dos implementaciones serían dos verdades*.
 *
 * Dice la verdad completa de ADR-073 y por eso **tranquiliza en vez de asustar**: la bolsa es
 * descartable, lo que se pagó no. El `on delete cascade` llega hasta `colecciones_videos`;
 * `app.videos_meta` y los guiones limpios se quedan donde están.
 */
export function advertenciaDeBorrado(videos: number): string {
  return videos === 0
    ? "Está vacía."
    : `Se va la lista de ${videos}. Los guiones limpios y la metadata comprada se quedan.`;
}

// ── La colección como tabla (el `.xlsx`) ─────────────────────────────────────
//
// 🔑 **Por qué existe además del Word.** El `.docx` es para *leer* un guion; esto es para *operar*
// con la lista: filtrar, ordenar, pegar los links en otro lado, repartir quién graba qué. Son dos
// consumidores distintos del mismo pedido, no dos formatos del mismo archivo — por eso las columnas
// no son "el documento en celdas" sino lo que identifica cada video.
//
// 📋 **El guion viaja igual, en su columna**, aunque el comentario de `docx.ts` diga que en una
// celda se lee mal. Sigue siendo cierto para leerlo; lo que cambia es el uso. El histórico ya baja
// `SCRIPT` en una celda desde ADR-071 y nadie lo abre para leerlo: se abre para cruzarlo. Quien
// quiera leer, tiene el Word al lado.
//
// 🔢 **La primera columna es el número de orden**, el mismo que el Word imprime en cada título. Es
// lo que deja decir *"grabá del 3 al 7"* mirando cualquiera de los dos archivos.

export const COLUMNAS_COLECCION = [
  "#", "TITULO", "REFERENTE", "LINK", "GUION", "LIMPIEZA",
] as const;

/**
 * Los videos de una colección → las filas de su `.xlsx`.
 *
 * Recibe exactamente lo que ya arma la descarga del Word: una consulta, dos archivos. Duplicar el
 * viaje al server para las mismas filas sería pagar dos veces `leerCrudo` por video.
 *
 * Un video **sin guion entra igual**, con la celda vacía y `SIN GUION` en la columna de limpieza —
 * misma regla que el documento. Sacarlo haría que la numeración de los dos archivos no coincida, y
 * que la planilla mienta sobre cuántos videos tiene la colección.
 */
export function tablaDeColeccion(guiones: readonly GuionParaDocumento[]): unknown[][] {
  return guiones.map((g, i) => [
    i + 1,
    g.titulo,
    g.referente,
    g.url,
    g.texto,
    g.texto === null ? "SIN GUION" : g.limpio ? "LIMPIO" : "ORIGINAL",
  ]);
}

/**
 * Deja `items` en el orden exacto de `claves`, y **solo los que están ahí**.
 *
 * Existe por el pedido de Majo del 28/08: *"Poner de mayor a menor vistas en el documento que se
 * descarga de colecciones"*. El documento tenía su propio orden —el de inserción que devuelve
 * `leerMiembros`— y la barra de ADR-076 ordenaba únicamente la pantalla, así que lo que se veía y
 * lo que se bajaba eran dos listas distintas.
 *
 * 🔑 **El orden lo decide el cliente y lo aplica el SERVER, y eso no es un rodeo.** La descarga
 * corta por presupuesto de tiempo (`PRESUPUESTO_DESCARGA_MS`) y avisa que quedó cortada. Si el
 * cliente reordenara el resultado, lo que se corta seguiría siendo la cola del orden de inserción:
 * un documento truncado traería *los primeros agregados, ordenados por vistas* y diría, en silencio,
 * que esos son los más vistos. Aplicando el orden antes del corte, lo que se pierde es la cola de lo
 * que la persona eligió ver.
 *
 * `claves === null` = nadie pidió nada: la lista pasa tal cual. Es lo que hace que un llamador viejo
 * siga comportándose igual.
 *
 * Tres cosas que pasan de verdad y por eso están contempladas:
 *  · una clave que ya no existe (alguien sacó el video en otra pestaña) **se ignora**, no rompe;
 *  · una clave repetida entrega el video **una sola vez** — un guion duplicado en el documento
 *    desalinearía la numeración contra la pantalla;
 *  · un miembro que no está en `claves` **queda afuera**, que es cómo el filtro de facetas llega al
 *    archivo: se baja lo que se ve.
 */
export function enElOrdenPedido<T extends { clave: string }>(
  items: readonly T[],
  claves: readonly string[] | null,
): T[] {
  if (claves === null) return [...items];

  const porClave = new Map(items.map((item) => [item.clave, item]));
  const salida: T[] = [];
  const puestos = new Set<string>();

  for (const clave of claves) {
    if (puestos.has(clave)) continue;
    const item = porClave.get(clave);
    if (item === undefined) continue;
    puestos.add(clave);
    salida.push(item);
  }

  return salida;
}
