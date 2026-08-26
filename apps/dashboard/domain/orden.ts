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

// ── Facetas ───────────────────────────────────────────────────────────────────
//
// 🔴 **La línea que no se cruza (ADR-076 §4): el filtro que EDITA no es el filtro que MIRA.**
//
// Los chips que ya existen filtran por un atributo **mutable desde la pantalla**:
//  · `FILTROS` de `domain/feed.ts` filtra por calificación, y **se aplica en la query** (`leerMazo`).
//    Eso es lo que sostiene *"una tarjeta calificada no se va del mazo"* (ADR-034 /
//    plan-cockpit §D6.4): si filtrara acá en el cliente, calificar haría desaparecer la tarjeta de
//    abajo del cursor y un misclick sobre 209 tarjetas sería irrecuperable desde la pantalla.
//  · `FILTROS_REGISTRO` de `domain/grabados.ts` filtra por grabado, y ya vive en el cliente.
//
// Estas facetas son de otra especie: **nadie edita `idioma` ni `plataforma` desde la pantalla**, así
// que un `.filter()` vivo no puede hacer desaparecer nada y no necesitan congelado.
//
// ⚠️ **Los dos sistemas conviven en la misma barra y NO se unifican.** Meter el chip de calificación
// acá adentro reintroduce el bug que ADR-034 ya resolvió.

/** Un eje categórico por el que se puede filtrar. `null` = esta fila no lo tiene. */
export type Faceta<T> = {
  clave: string;
  etiqueta: string;
  valor: (item: T) => string | null;
};

/** Un valor presente en los datos, con cuántas filas lo tienen. */
export type OpcionFaceta = { valor: string; cuantos: number };

/**
 * Los valores que esta faceta tiene **en lo que está cargado**, del más poblado al menos.
 *
 * 🔑 **Los nulos no se listan.** *"No lo sé"* no es una categoría: es la misma regla que la tarjeta
 * aplica al dibujar la falta como falta y no como un dato (ADR-072 §4). La consecuencia hay que
 * saberla: con algo elegido, las filas sin valor quedan afuera y se recuperan apagando la faceta.
 *
 * El largo de esto es lo que decide si la faceta se dibuja: con menos de 2 opciones es un control
 * que no hace nada, y un control que no hace nada se lee como mobiliario (ADR-076 §7).
 */
export function opcionesDe<T>(items: readonly T[], faceta: Faceta<T>): OpcionFaceta[] {
  const cuenta = new Map<string, number>();
  for (const item of items) {
    const valor = faceta.valor(item);
    if (valor === null || valor === "") continue;
    cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
  }

  return [...cuenta.entries()]
    .map(([valor, cuantos]) => ({ valor, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos || a.valor.localeCompare(b.valor, "es"));
}

/**
 * Deja pasar las filas cuyo valor está entre los elegidos.
 *
 * **Sin nada elegido pasa todo**, que es el estado de reposo: montar una faceta no cambia lo que la
 * pantalla venía mostrando. Varios elegidos son un OR. **No reordena** — filtrar y ordenar son dos
 * actos y el orden de entrada se respeta.
 */
export function filtrarPor<T>(
  items: readonly T[],
  faceta: Faceta<T>,
  elegidos: readonly string[],
): T[] {
  if (elegidos.length === 0) return [...items];
  const quiero = new Set(elegidos);
  return items.filter((item) => {
    const valor = faceta.valor(item);
    return valor !== null && quiero.has(valor);
  });
}
