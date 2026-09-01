/**
 * Dominio puro: **el mismo video, subido dos veces** (ADR-086).
 *
 * 🩸 **Por qué existe.** El dedup del motor (ADR-029) recuerda el **id del post**, no el video.
 * Cuando un creador vuelve a subir el mismo reel, Instagram le da un id nuevo, así que para el
 * motor es un video que nunca vio: lo re-transcribe, lo re-paga y lo deja en el Feed como nuevo.
 * Quien califica lo ve por segunda vez y no tiene forma de saberlo.
 *
 * 📏 Medido contra prod el 2026-09-01, sobre 422 candidatos: **17 pares** son el mismo video dos
 * veces (parecido de guion 0,58 a 0,93 por solapamiento de palabras), **11 estaban en el Feed sin
 * calificar con su gemelo ya calificado**, **3 de esos 11 tenían el gemelo ya grabado**, y **4
 * pares se juzgaron dos veces — 2 con nota distinta cada vez** (🔥 una, 👍 la otra), que es lo que
 * envenena a `Destilar criterios` (ADR-022). Hay **18 pares más en `app.descartes`**.
 *
 * 🔑 **Esto AVISA, no bloquea, y la diferencia es la decisión de ADR-086.** Ninguna llave
 * disponible hoy es lo bastante precisa para tirar un video sin que lo vea nadie: el caption
 * exacto —la única señal que la pantalla ya tiene— caza 7 de los 17 pares y se equivoca en la
 * mitad de los que marca (los creadores repiten el caption en una serie: `philipp_humm` y
 * `francescapsychology` tienen videos DISTINTOS con caption idéntico). Un bloqueo con esa
 * precisión perdería videos buenos en silencio, que es exactamente el modo de falla que ADR-029 ya
 * decidió no aceptar. **Un aviso con 50% de precisión cuesta una mirada; un bloqueo con 50% cuesta
 * un video que nadie vuelve a ver.**
 *
 * 🪜 **La huella entra como dato, no se calcula acá.** Hoy la pantalla solo tiene el caption, así
 * que la huella ES el caption normalizado. Cuando la `036` persista la huella del guion (que caza
 * los 17), cambia de dónde sale la huella y **esta regla no se toca** — que es el punto de que
 * entre como parámetro y no la derive este módulo.
 */

/** Cuántos caracteres útiles necesita una huella para que valga como evidencia. */
export const MIN_HUELLA = 20;

/**
 * Normaliza un texto a huella: minúsculas, sin acentos, solo alfanumérico.
 *
 * Los emoji y la puntuación se van a propósito: dos subidas del mismo reel suelen diferir en un
 * emoji del caption (`"🍎 Your self talk…"` vs `"Your self talk… 🍎"`) y eso no las hace videos
 * distintos.
 */
export function huellaDe(texto: string | null | undefined): string {
  return (texto ?? "")
    .toLowerCase()
    // NFD + el filtro de abajo: "psicología" queda "psicologia" y no "psicologa" — el acento se
    // separa de la letra y se lo lleva el filtro, en vez de borrarse la vocal entera.
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

/** Una fila con lo mínimo para decidir si es repetida. */
export type FilaHuella = {
  id: string;
  referente: string | null;
  /** El texto del que sale la huella (hoy el título/caption). */
  texto: string | null;
  /** `null` = sin calificar. */
  calificacion: string | null;
};

/** El gemelo que ya se calificó, para poder nombrarlo en el aviso. */
export type Gemelo = {
  id: string;
  calificacion: string;
};

/**
 * De las filas SIN calificar, cuáles tienen un gemelo ya calificado.
 *
 * La llave es `referente + huella`: el referente entra porque dos creadores distintos pueden usar
 * el mismo caption genérico (`"Comment RESET"`), y ahí no hay ninguna evidencia de que sea el mismo
 * video. Sin referente no se compara — un dato roto no es una coincidencia.
 *
 * Si hay varios gemelos posibles gana el primero por id, para que el aviso sea **estable**: el mazo
 * no se puede reacomodar ni cambiar de texto mientras alguien lo recorre (misma razón que el orden
 * estable de `agrupar`).
 */
export function detectarRepetidos(filas: readonly FilaHuella[]): Map<string, Gemelo> {
  const decididos = new Map<string, Gemelo>();
  for (const f of [...filas].sort((a, b) => a.id.localeCompare(b.id))) {
    if (f.calificacion === null) continue;
    const clave = claveDe(f);
    if (clave === null || decididos.has(clave)) continue;
    decididos.set(clave, { id: f.id, calificacion: f.calificacion });
  }

  const repetidos = new Map<string, Gemelo>();
  for (const f of filas) {
    if (f.calificacion !== null) continue;
    const clave = claveDe(f);
    if (clave === null) continue;
    const gemelo = decididos.get(clave);
    if (gemelo) repetidos.set(f.id, gemelo);
  }
  return repetidos;
}

/** `null` cuando la fila no da evidencia suficiente: sin referente, o huella demasiado corta. */
function claveDe(f: FilaHuella): string | null {
  const referente = huellaDe(f.referente);
  const huella = huellaDe(f.texto);
  if (!referente || huella.length < MIN_HUELLA) return null;
  return `${referente}|${huella}`;
}
