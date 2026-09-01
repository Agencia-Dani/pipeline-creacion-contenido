/**
 * Concordancia de número en español, para los textos que interpolan un conteo.
 *
 * 🩸 **Por qué existe.** Es la clase de bug más reincidente de este cockpit: se encontraron **seis
 * plurales rotos en dos días** con toda la suite en verde, y una auditoría del 2026-08-31 encontró
 * **ocho más**. Ninguna prueba los caza — un `assert` no lee castellano — así que la defensa no
 * puede ser un test sobre las pantallas: tiene que ser que escribir el texto *obligue* a decidir
 * qué pasa con `n === 1`.
 *
 * Por eso la firma pide las dos formas y no adivina agregando una "s": en español lo que cambia no
 * es solo el sustantivo (*marcado/marcados*), es el **verbo** (*tenían/tenía*, *quedaron/quedó*,
 * *estaban/estaba*, *faltan/falta*) y a veces el **artículo** (*los/el*). Una función que solo
 * pegara una "s" habría arreglado 3 de los 8 casos y dejado los otros 5 igual de rotos, que es peor
 * que no tenerla: daría la sensación de que el problema está resuelto.
 *
 * @example
 * `${n} ${plural(n, "video", "videos")}`                    // 1 video · 2 videos
 * `${n} ${plural(n, "quedó", "quedaron")} sin guion`        // 1 quedó · 2 quedaron
 * `Reintentar ${plural(n, "el que falta", "los que faltan")}`
 */
export function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * El caso más común: sustantivo regular que solo suma "s". Azúcar sobre `plural`, para no escribir
 * `plural(n, "video", "videos")` cuarenta veces.
 *
 * ⚠️ **Solo para plurales regulares.** Si la palabra termina en consonante (*mes → meses*) o el
 * texto lleva un verbo al lado, va `plural()` con las dos formas escritas a mano.
 */
export function pluralS(n: number, singular: string): string {
  return n === 1 ? singular : `${singular}s`;
}
