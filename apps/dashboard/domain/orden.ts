// Dominio puro (ADR-076): ordenar y filtrar las listas de video que las pantallas ya tienen en
// memoria. Sin IO, sin React.
//
// 🔑 **Por qué en memoria y no en la query.** En Colecciones es lo único posible: `likes` no es
// columna de `app.colecciones_videos`, sale de fusionar tres fuentes con `fusionar()` (ADR-072 §2).
// Un `.order("likes")` de PostgREST obligaría a re-implementar esa fusión en SQL, que es justo lo
// que el repo prohíbe por escrito: *"dos derivaciones de la misma identidad serían dos bugs mudos
// el día que una cambie"* (`domain/grabados.ts`). En las otras tres tampoco compra nada: no hay
// paginación (ninguno de los 4 lectores tiene `limit`), así que sería un viaje al server por click
// sobre datos que ya están en el browser.

/** Hacia dónde ordena el control. */
export type Direccion = "asc" | "desc";

/**
 * Un eje por el que se puede ordenar una pantalla.
 *
 * Es un descriptor y no un `switch` a propósito: **cada pantalla declara los suyos**, porque las
 * cuatro dibujan tipos distintos y no comparten atributos. `app.descartes`, por ejemplo, tiene 12
 * columnas y **ninguna es una métrica** — ofrecerle "ordenar por likes" sería un control que no
 * hace nada. Sin lista global, no hay de dónde copiar de más (ADR-076 §5).
 */
export type CriterioOrden<T> = {
  /** Identificador estable para el `<select>` y el estado. */
  clave: string;
  /** Lo que lee la persona. */
  etiqueta: string;
  /** El valor por el que se compara. `null` = esta fila no lo tiene. */
  valor: (item: T) => number | string | null;
};

/**
 * Ordena una copia de `items`.
 *
 * 🔴 **Dos invariantes, y las dos son contraintuitivas:**
 *
 * 1. **Los nulos van al final en las DOS direcciones**, y nunca valen `0`. Un `null` significa *no
 *    lo sé*: son 129 filas del histórico (las `transcripcion_a_pedido`, que entraron por un link
 *    pegado y nunca tuvieron métricas). Decir que tienen cero likes es la misma mentira que la
 *    tarjeta se niega a decir en ADR-072 §4, y subirlas en `asc` abriría la pantalla con 129
 *    incógnitas arriba de todo. El precedente ya se pagó: ordenar el histórico por heat dejaba esas
 *    mismas filas desempatando por uuid, *"un orden sin significado"*.
 *
 * 2. **Un empate NO reordena.** `criterio === null` devuelve la lista tal cual, y un empate devuelve
 *    `0` — como `Array.prototype.sort` es estable por especificación desde ES2019, el orden que
 *    queda es el que traía. Eso **es** el desempate: el near-miss de ADR-021 en Descartes, la fecha
 *    en Históricos, el orden de inserción en Colecciones. Mejor que un `id.localeCompare`, que
 *    mandaría el empate a un uuid.
 */
export function ordenar<T>(
  items: readonly T[],
  criterio: CriterioOrden<T> | null,
  direccion: Direccion,
): T[] {
  if (criterio === null) return [...items];

  return [...items].sort((x, y) => {
    const a = criterio.valor(x);
    const b = criterio.valor(y);

    // Los nulos se resuelven ANTES de mirar la dirección: por eso quedan al final en las dos.
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    const cmp =
      typeof a === "string" || typeof b === "string"
        ? String(a).localeCompare(String(b), "es", { sensitivity: "base" })
        : Number(a) - Number(b);

    return direccion === "asc" ? cmp : -cmp;
  });
}
