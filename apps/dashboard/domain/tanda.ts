// La tanda: el pegote de enlaces como unidad del usuario (ADR-064).
//
// 🔑 **Una tanda NO es un run**, y confundirlas era la trampa que la ADR vino a cerrar: el run es el
// *procesamiento* (de a 64 enlaces, corte a los 45 s), así que una tanda de 100 links produce dos o
// tres, y una tanda que se procesa hoy a medias y mañana el resto produce runs de días distintos.
// La tanda nace cuando alguien aprieta el botón.
//
// Acá vive solo lo puro: cómo se llama y cómo se resume. El IO está en `lib/tandas.ts`.

export type ContadoresTanda = {
  total: number;
  pendientes: number;
  listos: number;
  fallidas: number;
  abandonadas: number;
};

/**
 * Cómo se llama una tanda en la pantalla.
 *
 * 🔑 **El default no se guarda, se dibuja** (y por eso vive acá y no en la migración). Es una
 * proyección de dos columnas que ya están en la fila —cuántos links y cuándo— y guardarla sería
 * congelarla: la respuesta que este repo ya le dio a esta misma pregunta en ADR-041.
 *
 * `cuando` llega ya formateado porque `domain/` es puro y la zona horaria vive en `lib/fechas.ts`,
 * que es el único lugar del cockpit que sabe escribir una fecha (sin eso salen corridas 5 h en
 * Vercel, que es un bug que este repo ya pagó).
 */
export function tituloDeTanda(titulo: string | null, total: number, cuando: string): string {
  const propio = titulo?.trim();
  if (propio) return propio;
  return `${total} ${total === 1 ? "link" : "links"} · ${cuando}`;
}

/**
 * Lo que la cabecera dice de un vistazo, **sin los ceros**.
 *
 * Una tanda sana dice `"48 listos"` y nada más. Enumerar los estados en cero llenaría la pantalla de
 * ruido justo donde el equipo escanea buscando lo que necesita atención — que es lo contrario de lo
 * que la agrupación vino a hacer.
 */
export function resumenDeTanda(c: ContadoresTanda): string {
  const partes: string[] = [];
  if (c.listos > 0) partes.push(`${c.listos} ${c.listos === 1 ? "listo" : "listos"}`);
  if (c.pendientes > 0) partes.push(`${c.pendientes} en cola`);
  if (c.fallidas > 0) partes.push(`${c.fallidas} sin guion`);
  if (c.abandonadas > 0) partes.push(`${c.abandonadas} ${c.abandonadas === 1 ? "abandonado" : "abandonados"}`);
  // Una tanda con 0 filas es posible en el esquema (nada lo impide) aunque la app no la cree: mejor
  // decirlo que dibujar una cabecera muda.
  return partes.length > 0 ? partes.join(" · ") : "sin enlaces";
}

/**
 * Qué se guarda cuando alguien renombra.
 *
 * Vaciar el campo **vuelve al default**, no deja una tanda sin nombre: `null` en la base significa
 * *"nadie la renombró"* y la pantalla la dibuja igual. Sin esto, borrar el texto dejaría una fila
 * con `""` que se ve como una cabecera en blanco y no hay forma de recuperar el default.
 */
export function tituloParaGuardar(texto: string): string | null {
  const limpio = texto.trim();
  return limpio.length > 0 ? limpio : null;
}

/** Techo del título. Es una etiqueta para reconocer un pegote, no un campo de notas. */
export const LARGO_MAX_TITULO = 120;
