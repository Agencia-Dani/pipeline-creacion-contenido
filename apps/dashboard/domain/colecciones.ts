// Dominio puro de las colecciones (ADR-073).
//
// Dos reglas viven acá, y las dos cuestan plata o la ahorran:
//  1. Qué nombre es válido (espejo del check de la `031`, para contestar sin ir a la base).
//  2. **Qué videos hay que enriquecer**, que es la que decide cuánto se le paga a Apify.

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
