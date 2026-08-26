# Plan — Orden y filtro en las pantallas de video

> **Para agentes:** este plan se ejecuta tarea por tarea con
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`. Los pasos usan
> checkbox (`- [ ]`) para llevar la cuenta.

**Objetivo:** que las 4 pantallas que dibujan `TarjetaVideo` puedan ordenarse (asc/desc) y
filtrarse por facetas, sin una query nueva ni una migración.

**Arquitectura:** un módulo de dominio puro (`domain/orden.ts`) que ordena y filtra listas en
memoria, más un hook + barra compartida (`components/video/orden.tsx`) que copia el patrón exacto de
`usarSeleccion()` / `<BarraSeleccion>`. Cada pantalla declara **sus** criterios y **sus** facetas; el
orden por defecto de cada una es `null`, que significa *no reordenes* — el orden que ya trae la lista.

**Decisión que lo gobierna:** [ADR-076](../adr/ADR-076-ordenar-es-una-vista-no-una-consulta.md).
Leerlo antes de la Tarea 1. Contexto de la tarjeta compartida:
[ADR-072](../adr/ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md).

**Stack:** TypeScript, Next 16 (App Router), React 19, Tailwind 4. Tests con `node:test` corriendo
los `.ts` directo en Node 26 (sin transpilar).

## Restricciones globales

Aplican a **todas** las tareas:

- **No se toca `core/`.** Ni contratos, ni `core/schema/`, ni `core/scripts/`. Si una tarea parece
  necesitarlo, se para y se discute (CLAUDE.md §Convenciones).
- **Cero migraciones, cero n8n, cero re-import.** Ningún `workflow.json` cambia.
- **Cero queries nuevas.** Todo sale de lo que las pantallas ya cargan. Única excepción autorizada:
  la Tarea 7 agrega **una columna** a un `select` existente (`descartes.creado_en`).
- **`domain/` no importa React ni `@/`.** Imports relativos **con extensión `.ts`**, porque los
  tests corren los archivos directo en Node y `node --test` no resuelve el alias `@/`.
  Ver la nota al tope de `domain/grabados.ts`.
- **Los nulos van siempre al final**, en `asc` y en `desc`. Nunca se tratan como `0`.
- **Comandos de verificación**, desde `apps/dashboard/`:
  - `npm test` → corre `node --test "domain/**/*.test.ts"`
  - `npm run typecheck` → `tsc --noEmit`
  - `npm run build` → sólo cuando se tocan rutas o auth (acá no hace falta, pero es la red final)
- **Commits en español, concisos, directo a `main`.**

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `apps/dashboard/domain/orden.ts` | **Crear.** Ordenar y filtrar listas en memoria. Sin IO, sin React | 1, 2 |
| `apps/dashboard/domain/orden.test.ts` | **Crear.** Los invariantes: nulos al final, estabilidad, facetas | 1, 2 |
| `apps/dashboard/components/video/orden.tsx` | **Crear.** `usarOrden()` + `<BarraOrden>`. Espejo de `seleccion.tsx` | 3 |
| `.../curar/colecciones/[id]/detalle.tsx` | **Modificar.** Monta la barra. Es el pedido de Majo | 4 |
| `.../curar/feed/mazo.tsx` | **Modificar.** Ordena **dentro** de cada grupo | 5 |
| `.../curar/historicos/lista.tsx` | **Modificar.** Ordena dentro del grupo | 6 |
| `.../curar/descartes/lista.tsx` | **Modificar.** Monta la barra flaca | 7 |
| `apps/dashboard/lib/descartes.ts` | **Modificar.** Suma `creado_en` al select y al tipo | 7 |
| `apps/dashboard/domain/feed.ts` | **Modificar.** Suma `creadoEn` a `DescarteFeed` | 7 |

**Orden de las tareas:** 1 → 2 → 3 son los cimientos. **La 4 es la primera que entrega valor** (es
literalmente lo que pidió Majo) y por eso va antes que las otras tres pantallas. La 5, 6 y 7 son
independientes entre sí: se pueden hacer en cualquier orden o en paralelo.

---

## Tarea 1 — `ordenar()`: el orden en memoria

**Archivos:**
- Crear: `apps/dashboard/domain/orden.ts`
- Crear (test): `apps/dashboard/domain/orden.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `type Direccion`, `type CriterioOrden<T>`, `function ordenar<T>(...)`. Las tareas 3 a 7
  dependen de estos nombres exactos.

- [ ] **Paso 1 — Escribir el test que falla**

Crear `apps/dashboard/domain/orden.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ordenar, type CriterioOrden } from "./orden.ts";

// Los tests del orden en memoria (ADR-076). Lo que se protege acá son los dos invariantes que la
// pantalla no puede verificar sola: los nulos nunca suben, y un empate no reacomoda la lista.

type V = { id: string; likes: number | null; titulo: string | null };

const v = (id: string, likes: number | null, titulo: string | null = null): V => ({
  id,
  likes,
  titulo,
});

const porLikes: CriterioOrden<V> = {
  clave: "likes",
  etiqueta: "Likes",
  valor: (x) => x.likes,
};

const porTitulo: CriterioOrden<V> = {
  clave: "titulo",
  etiqueta: "Título A-Z",
  valor: (x) => x.titulo,
};

const ids = (xs: readonly V[]) => xs.map((x) => x.id).join(",");

test("ordenar con criterio null devuelve la lista tal cual", () => {
  // El default de las 4 pantallas. `agrupar`, `armarRegistro` y `ordenarDescartes` ya ordenaron;
  // el criterio por defecto tiene que NO tocar eso, no reproducirlo (ADR-076 §5).
  const lista = [v("a", 1), v("b", 3), v("c", 2)];
  assert.equal(ids(ordenar(lista, null, "desc")), "a,b,c");
});

test("ordenar no muta la lista que recibe", () => {
  const lista = [v("a", 1), v("b", 3)];
  ordenar(lista, porLikes, "desc");
  assert.equal(ids(lista), "a,b");
});

test("ordenar por número, descendente", () => {
  const lista = [v("a", 10), v("b", 300), v("c", 20)];
  assert.equal(ids(ordenar(lista, porLikes, "desc")), "b,c,a");
});

test("ordenar por número, ascendente", () => {
  const lista = [v("a", 10), v("b", 300), v("c", 20)];
  assert.equal(ids(ordenar(lista, porLikes, "asc")), "a,c,b");
});

test("los nulos van al final en DESC", () => {
  const lista = [v("a", null), v("b", 300), v("c", 20)];
  assert.equal(ids(ordenar(lista, porLikes, "desc")), "b,c,a");
});

test("🔴 los nulos van al final en ASC TAMBIÉN", () => {
  // El invariante que da vuelta la intuición y el que más fácil se rompe "arreglando" el signo.
  // Un `null` es "no lo sé", no "cero": son 129 filas del histórico. Si subieran en asc, la
  // pantalla abriría con 129 incógnitas arriba de todo (ADR-076 §2).
  const lista = [v("a", null), v("b", 300), v("c", 20)];
  assert.equal(ids(ordenar(lista, porLikes, "asc")), "c,b,a");
});

test("🔴 un empate conserva el orden que traía la lista", () => {
  // Esto ES el desempate estable (ADR-076 §5, corolario). `Array.prototype.sort` es estable por
  // especificación desde ES2019, así que devolver 0 en el empate deja el orden de entrada — que es
  // el near-miss de ADR-021 o la fecha del histórico, no un uuid.
  const lista = [v("z", 5), v("m", 5), v("a", 5)];
  assert.equal(ids(ordenar(lista, porLikes, "desc")), "z,m,a");
  assert.equal(ids(ordenar(lista, porLikes, "asc")), "z,m,a");
});

test("una lista toda de nulos queda tal cual", () => {
  // El caso real es Históricos: 129 de sus 377 filas no tienen métricas (las que entraron por un
  // link pegado). Ordenarlas por likes no puede reacomodarlas entre sí.
  const lista = [v("a", null), v("b", null), v("c", null)];
  assert.equal(ids(ordenar(lista, porTitulo, "asc")), "a,b,c");
});

test("ordenar por texto usa el alfabeto español", () => {
  // `localeCompare` con "es": sin él, "Ñ" cae después de "Z" por code point.
  const lista = [v("a", 0, "Zapato"), v("b", 0, "Ñandú"), v("c", 0, "Ancla")];
  assert.equal(ids(ordenar(lista, porTitulo, "asc")), "c,b,a");
});

test("ordenar por texto ignora mayúsculas y minúsculas", () => {
  const lista = [v("a", 0, "banana"), v("b", 0, "Ananá")];
  assert.equal(ids(ordenar(lista, porTitulo, "asc")), "b,a");
});
```

- [ ] **Paso 2 — Correr el test y verificar que falla**

```bash
cd apps/dashboard && npm test
```

Esperado: **FALLA** con `Cannot find module './orden.ts'`.

- [ ] **Paso 3 — Escribir `domain/orden.ts`**

Crear `apps/dashboard/domain/orden.ts`:

```ts
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
```

- [ ] **Paso 4 — Correr el test y verificar que pasa**

```bash
cd apps/dashboard && npm test
```

Esperado: **PASA**, 10 tests de `orden.test.ts` en verde. El resto de la suite sigue en verde.

- [ ] **Paso 5 — Typecheck**

```bash
cd apps/dashboard && npm run typecheck
```

Esperado: sin salida (0 errores).

- [ ] **Paso 6 — Commit**

```bash
git add apps/dashboard/domain/orden.ts apps/dashboard/domain/orden.test.ts
git commit -m "Orden en memoria: nulos siempre al final y el empate no reacomoda (ADR-076)"
```

---

## Tarea 2 — Las facetas: `opcionesDe()` y `filtrarPor()`

**Archivos:**
- Modificar: `apps/dashboard/domain/orden.ts` (se le agrega al final)
- Modificar: `apps/dashboard/domain/orden.test.ts` (se le agrega al final)

**Interfaces:**
- Consume: nada de la Tarea 1 (son funciones hermanas, no encadenadas).
- Produce: `type Faceta<T>`, `type OpcionFaceta`, `function opcionesDe<T>(...)`,
  `function filtrarPor<T>(...)`. Las tareas 3 a 7 dependen de estos nombres.

- [ ] **Paso 1 — Escribir el test que falla**

Agregar al final de `apps/dashboard/domain/orden.test.ts`:

```ts
// ── Facetas ───────────────────────────────────────────────────────────────────

import { filtrarPor, opcionesDe, type Faceta } from "./orden.ts";

type F = { id: string; idioma: string | null };

const f = (id: string, idioma: string | null): F => ({ id, idioma });

const porIdioma: Faceta<F> = {
  clave: "idioma",
  etiqueta: "Idioma",
  valor: (x) => x.idioma,
};

const idsF = (xs: readonly F[]) => xs.map((x) => x.id).join(",");

test("opcionesDe cuenta cada valor distinto", () => {
  const lista = [f("a", "en"), f("b", "es"), f("c", "en")];
  assert.deepEqual(opcionesDe(lista, porIdioma), [
    { valor: "en", cuantos: 2 },
    { valor: "es", cuantos: 1 },
  ]);
});

test("opcionesDe ordena por cantidad y desempata alfabético", () => {
  // El chip más poblado primero: en el Feed medido el 26/08 son 207 `en` contra 2 `otro`.
  const lista = [f("a", "pt"), f("b", "en"), f("c", "en"), f("d", "es")];
  assert.deepEqual(
    opcionesDe(lista, porIdioma).map((o) => o.valor),
    ["en", "es", "pt"],
  );
});

test("opcionesDe NO lista los nulos", () => {
  // "No lo sé" no es una categoría. Mismo criterio que la tarjeta, que dibuja la falta como falta.
  const lista = [f("a", "en"), f("b", null), f("c", null)];
  assert.deepEqual(opcionesDe(lista, porIdioma), [{ valor: "en", cuantos: 1 }]);
});

test("🔑 filtrarPor sin nada elegido devuelve TODO", () => {
  // El estado de reposo. Es lo que hace que la faceta sea aditiva: montarla no cambia la pantalla.
  const lista = [f("a", "en"), f("b", "es"), f("c", null)];
  assert.equal(idsF(filtrarPor(lista, porIdioma, [])), "a,b,c");
});

test("filtrarPor deja pasar los valores elegidos", () => {
  const lista = [f("a", "en"), f("b", "es"), f("c", "en")];
  assert.equal(idsF(filtrarPor(lista, porIdioma, ["en"])), "a,c");
});

test("filtrarPor con varios elegidos es un OR", () => {
  const lista = [f("a", "en"), f("b", "es"), f("c", "pt")];
  assert.equal(idsF(filtrarPor(lista, porIdioma, ["en", "pt"])), "a,c");
});

test("filtrarPor con algo elegido deja afuera los nulos", () => {
  // Consecuencia directa de que los nulos no se listan: no hay chip que los traiga de vuelta.
  // Se recuperan apagando la faceta, que es el único gesto que ofrece la barra.
  const lista = [f("a", "en"), f("b", null)];
  assert.equal(idsF(filtrarPor(lista, porIdioma, ["en"])), "a");
});

test("filtrarPor conserva el orden de entrada", () => {
  // Filtrar no es reordenar. Si esto se rompiera, el chip de idioma reacomodaría el mazo.
  const lista = [f("c", "en"), f("a", "en"), f("b", "en")];
  assert.equal(idsF(filtrarPor(lista, porIdioma, ["en"])), "c,a,b");
});
```

- [ ] **Paso 2 — Correr el test y verificar que falla**

```bash
cd apps/dashboard && npm test
```

Esperado: **FALLA** con `The requested module './orden.ts' does not provide an export named 'opcionesDe'`.

- [ ] **Paso 3 — Implementar las facetas**

Agregar al final de `apps/dashboard/domain/orden.ts`:

```ts
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
```

- [ ] **Paso 4 — Correr el test y verificar que pasa**

```bash
cd apps/dashboard && npm test
```

Esperado: **PASA**, los 18 tests de `orden.test.ts` en verde.

- [ ] **Paso 5 — Typecheck**

```bash
cd apps/dashboard && npm run typecheck
```

Esperado: sin salida.

- [ ] **Paso 6 — Commit**

```bash
git add apps/dashboard/domain/orden.ts apps/dashboard/domain/orden.test.ts
git commit -m "Facetas: opciones contadas, los nulos no son categoría y sin elegir pasa todo (ADR-076)"
```

---

## Tarea 3 — `usarOrden()` y `<BarraOrden>`

**Archivos:**
- Crear: `apps/dashboard/components/video/orden.tsx`

**Interfaces:**
- Consume: `ordenar`, `opcionesDe`, `filtrarPor`, `type CriterioOrden`, `type Faceta`,
  `type Direccion` de `@/domain/orden` (Tareas 1 y 2).
- Produce: `type Orden<T>`, `function usarOrden<T>(...)`, `function BarraOrden<T>(...)`. Las
  tareas 4 a 7 dependen de estos nombres.

> **Nota para quien implemente:** `npm test` sólo globea `domain/**/*.test.ts`, así que **este
> archivo no tiene test unitario y eso es correcto**: el repo no tiene infraestructura de tests de
> componentes y montarla no es parte de este plan. La red acá es `npm run typecheck` más la
> verificación en pantalla de la Tarea 4.

- [ ] **Paso 1 — Escribir el componente**

Crear `apps/dashboard/components/video/orden.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  filtrarPor,
  opcionesDe,
  ordenar,
  type CriterioOrden,
  type Direccion,
  type Faceta,
  type OpcionFaceta,
} from "@/domain/orden";
import { cn } from "@/lib/utils";

// El control de orden y filtro de las pantallas de video (ADR-076).
//
// 🎨 **Espejo deliberado de `seleccion.tsx`**: un hook que tiene el estado (`usarOrden`) y un
// componente que lo dibuja (`BarraOrden`). Mismo reparto, mismo lugar en la cabecera y la misma
// razón — la pantalla decide qué se puede ordenar y filtrar, el módulo no conoce ninguna pantalla.
//
// 🔑 **El default es `null`: no reordenar.** Las cuatro pantallas ya llegan ordenadas por alguien
// (`agrupar()`, `armarRegistro()`, `ordenarDescartes()`, el orden de inserción). El control por
// defecto tiene que NO tocar eso — reproducir esas reglas acá serían dos implementaciones de cada
// una, que es el error que ADR-072 §2 ya nombró.

export type Orden<T> = {
  /** Lo que la pantalla tiene que dibujar: filtrado y ordenado. */
  visibles: T[];
  /** Para el `<select>`. */
  criterios: readonly CriterioOrden<T>[];
  claveCriterio: string;
  elegirCriterio: (clave: string) => void;
  direccion: Direccion;
  alternarDireccion: () => void;
  /** Sólo las facetas que tienen 2+ valores distintos en lo cargado. */
  facetasVisibles: readonly { faceta: Faceta<T>; opciones: readonly OpcionFaceta[] }[];
  elegidos: Readonly<Record<string, string[]>>;
  alternarValor: (claveFaceta: string, valor: string) => void;
  /** ¿Hay alguna faceta activa? Es lo que decide si se dibuja el "Limpiar". */
  hayFiltro: boolean;
  limpiarFiltros: () => void;
};

/** El sentinel del `<select>` para "el orden que ya trae la lista". */
export const SIN_CRITERIO = "";

/**
 * El estado del control, más el cálculo de lo visible.
 *
 * ⚠️ **`criterios` y `facetas` tienen que ser estables entre renders** (declarados como constantes
 * a nivel de módulo, o memoizados). Si se arman inline en el cuerpo del componente, los `useMemo`
 * de acá se invalidan en cada render. Es la misma trampa que ya costó un bucle de fetch en
 * `colecciones/[id]/detalle.tsx`, donde `usarCockpit()` armaba un objeto nuevo por render.
 */
export function usarOrden<T>(
  items: readonly T[],
  criterios: readonly CriterioOrden<T>[],
  facetas: readonly Faceta<T>[] = [],
): Orden<T> {
  const [claveCriterio, setClaveCriterio] = useState<string>(SIN_CRITERIO);
  const [direccion, setDireccion] = useState<Direccion>("desc");
  const [elegidos, setElegidos] = useState<Record<string, string[]>>({});

  // Las opciones se cuentan sobre `items` ENTERO y no sobre lo ya filtrado: si se contaran sobre lo
  // filtrado, prender un chip haría desaparecer los otros y no habría cómo volver.
  const facetasVisibles = useMemo(
    () =>
      facetas
        .map((faceta) => ({ faceta, opciones: opcionesDe(items, faceta) }))
        .filter((f) => f.opciones.length >= 2),
    [items, facetas],
  );

  const visibles = useMemo(() => {
    let salida = [...items];
    for (const { faceta } of facetasVisibles) {
      salida = filtrarPor(salida, faceta, elegidos[faceta.clave] ?? []);
    }
    const criterio = criterios.find((c) => c.clave === claveCriterio) ?? null;
    return ordenar(salida, criterio, direccion);
  }, [items, facetasVisibles, elegidos, criterios, claveCriterio, direccion]);

  const hayFiltro = Object.values(elegidos).some((v) => v.length > 0);

  return {
    visibles,
    criterios,
    claveCriterio,
    elegirCriterio: setClaveCriterio,
    direccion,
    alternarDireccion: () => setDireccion((d) => (d === "desc" ? "asc" : "desc")),
    facetasVisibles,
    elegidos,
    alternarValor: (claveFaceta, valor) =>
      setElegidos((previo) => {
        const actuales = previo[claveFaceta] ?? [];
        return {
          ...previo,
          [claveFaceta]: actuales.includes(valor)
            ? actuales.filter((v) => v !== valor)
            : [...actuales, valor],
        };
      }),
    hayFiltro,
    limpiarFiltros: () => setElegidos({}),
  };
}

/**
 * La barra. Va en la cabecera, al lado de `<BotonSeleccionar>`.
 *
 * 🎨 `outline` en los chips y `ghost` en la flecha: en las cuatro pantallas este bloque convive con
 * los chips de filtro que ya existen y tiene que leerse como uno más de ellos, no competir. El
 * `default` de esas barras está reservado para la acción principal de la pantalla.
 *
 * Si la pantalla no tiene criterios ni facetas dibujables, no se dibuja nada.
 */
export function BarraOrden<T>({ orden }: { orden: Orden<T> }) {
  if (orden.criterios.length === 0 && orden.facetasVisibles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {orden.criterios.length > 0 && (
        <>
          <label htmlFor="orden-criterio" className="text-sm text-muted-foreground">
            Ordenar por
          </label>
          <select
            id="orden-criterio"
            value={orden.claveCriterio}
            onChange={(e) => orden.elegirCriterio(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {/* La primera opción es el default de la pantalla: no reordenar. */}
            <option value={SIN_CRITERIO}>Lo que muestra la pantalla</option>
            {orden.criterios.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // Sin criterio la flecha no significa nada: el orden lo puso la pantalla.
            disabled={orden.claveCriterio === SIN_CRITERIO}
            onClick={orden.alternarDireccion}
            aria-label={
              orden.direccion === "desc" ? "Ordenar de menor a mayor" : "Ordenar de mayor a menor"
            }
          >
            {orden.direccion === "desc" ? "↓" : "↑"}
          </Button>
        </>
      )}

      {orden.facetasVisibles.map(({ faceta, opciones }) => (
        <span key={faceta.clave} className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-muted-foreground">{faceta.etiqueta}</span>
          {opciones.map((o) => {
            const activo = (orden.elegidos[faceta.clave] ?? []).includes(o.valor);
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => orden.alternarValor(faceta.clave, o.valor)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  activo ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
                )}
              >
                {o.valor} <span className="text-muted-foreground">{o.cuantos}</span>
              </button>
            );
          })}
        </span>
      ))}

      {orden.hayFiltro && (
        <Button type="button" variant="ghost" size="sm" onClick={orden.limpiarFiltros}>
          Limpiar
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Paso 2 — Typecheck**

```bash
cd apps/dashboard && npm run typecheck
```

Esperado: sin salida. (Si `tsc` se queja de `useMemo` con `facetas` como dependencia siendo
`readonly`, es correcto y ya está contemplado: el llamador declara los arrays como constantes de
módulo.)

- [ ] **Paso 3 — Correr la suite entera para confirmar que nada se rompió**

```bash
cd apps/dashboard && npm test
```

Esperado: verde.

- [ ] **Paso 4 — Commit**

```bash
git add apps/dashboard/components/video/orden.tsx
git commit -m "La barra de orden y facetas, espejo de seleccion.tsx (ADR-076)"
```

---

## Tarea 4 — Colecciones: el pedido de Majo

**Archivos:**
- Modificar: `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/colecciones/[id]/detalle.tsx`

**Interfaces:**
- Consume: `usarOrden`, `BarraOrden` (Tarea 3); `type Video` de `@/domain/video` (ya existe).
- Produce: nada que otra tarea consuma.

> **Por qué esta pantalla va primera:** es literalmente lo que pidió Majo (*ordenar una colección
> por likes*), y es la única de las cuatro donde la barra se puede verificar contra datos reales hoy
> mismo — la colección *"Test"* tiene 57 miembros con **57/57** likes, views, seguidores y heat.

- [ ] **Paso 1 — Declarar los criterios y las facetas, a nivel de módulo**

Agregar cerca del tope de `detalle.tsx`, **fuera** del componente (esto es lo que hace que sean
estables entre renders, ver el aviso en `usarOrden`):

```tsx
import { BarraOrden, usarOrden } from "@/components/video/orden";
import type { CriterioOrden, Faceta } from "@/domain/orden";

// 🔑 A nivel de módulo y NO dentro del componente: `usarOrden` memoiza contra estos arrays, y
// armarlos inline daría una referencia nueva por render. Es la misma trampa que ya costó un bucle
// de fetch en este mismo archivo (las deps del `useEffect` de `vocesParaLimpiar`).
//
// ⚠️ **No hay `engagement` ni `relevancia`**: `domain/video.ts` no los transporta. El dato existe
// en las fuentes pero `fusionar()` no lo trae, y agregarlo sería una columna en `app.videos_meta`,
// o sea `core/`, o sea otro ADR (ADR-076 §5).
const CRITERIOS: readonly CriterioOrden<Video>[] = [
  { clave: "likes", etiqueta: "Likes", valor: (v) => v.likes },
  { clave: "views", etiqueta: "Vistas", valor: (v) => v.views },
  { clave: "seguidores", etiqueta: "Seguidores", valor: (v) => v.seguidores },
  { clave: "heat", etiqueta: "Heat", valor: (v) => v.heat },
  { clave: "titulo", etiqueta: "Título A-Z", valor: (v) => v.titulo },
];

// `plataforma` sale del tipo, no de un parseo nuevo: `Video` ya la tiene resuelta por `claveDe`.
const FACETAS: readonly Faceta<Video>[] = [
  { clave: "idioma", etiqueta: "Idioma", valor: (v) => v.idioma },
  { clave: "plataforma", etiqueta: "Plataforma", valor: (v) => v.plataforma },
];
```

- [ ] **Paso 2 — Enchufar el hook y cambiar lo que se recorre**

Dentro del componente `Detalle`, después de `const seleccion = usarSeleccion();`:

```tsx
const orden = usarOrden(videos, CRITERIOS, FACETAS);
```

Después, en el JSX, dos ediciones quirúrgicas sobre líneas que ya existen (referencias al archivo
tal como está hoy):

**(a)** Insertar la barra en la línea inmediatamente **anterior** a `<GrillaVideos>` (hoy `:287`):

```tsx
<BarraOrden orden={orden} />
<GrillaVideos>
```

**(b)** Cambiar **una sola palabra** en el `.map()` de la línea siguiente (hoy `:288`):

```tsx
// antes
{videos.map((v) => (
// después
{orden.visibles.map((v) => (
```

**El cuerpo de `<TarjetaVideo …>` no se toca.** La variable del callback sigue llamándose `v`, así
que ninguna de las ~35 líneas de adentro cambia.

> 🔴 **`sinIdentificar` y `sinLimpiar` siguen contándose sobre `videos`, no sobre
> `orden.visibles`.** Son los contadores de *"cuánto falta en esta colección"* y tienen que decir la
> verdad de la colección entera: con un chip de idioma prendido, un contador sobre lo visible diría
> que faltan menos videos por limpiar de los que faltan de verdad, y el botón de *Limpiar todos*
> pararía antes de tiempo. Es la misma distinción que `grupos.tsx` ya documenta entre *"cuántos hay
> cargados"* y *"cuántos existen"*.

- [ ] **Paso 3 — Typecheck y tests**

```bash
cd apps/dashboard && npm run typecheck && npm test
```

Esperado: sin salida de `tsc`, suite en verde.

- [ ] **Paso 4 — Verificar en pantalla, contra datos reales**

```bash
cd apps/dashboard && npm run dev
```

Abrir la colección *"Test"* (57 videos) y comprobar las cinco cosas:

1. Al entrar, el `<select>` dice **"Lo que muestra la pantalla"** y el orden es el de siempre.
2. Elegir **Likes** con la flecha en ↓ pone el de más likes primero.
3. La flecha en ↑ lo da vuelta, y **los videos sin likes siguen al final** (si en esta colección son
   57/57, forzar el caso agregando un link nuevo sin metadata antes de correr *Identificar*).
4. Elegir **Título A-Z** ordena alfabético de verdad: el título está en **57 de 57**.
5. **No aparece ninguna faceta**, y es correcto: los 57 son `idioma = en` y los 57 son de Instagram,
   o sea un solo valor en cada una (§7). *No verlas no es que estén rotas.*

- [ ] **Paso 5 — Commit**

```bash
git add "apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/colecciones/[id]/detalle.tsx"
git commit -m "Colecciones ordena por likes, vistas, seguidores y heat (ADR-076, pedido de Majo)"
```

---

## Tarea 5 — Feed: ordenar **dentro** del grupo

**Archivos:**
- Modificar: `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/feed/mazo.tsx`

**Interfaces:**
- Consume: `usarOrden`, `BarraOrden` (Tarea 3); `type CandidatoFeed` de `@/domain/feed` (ya existe).
- Produce: nada.

> 🔴 **La regla de esta tarea: ordenar NO aplana los grupos.** `domain/feed.ts` tiene escrito por
> qué se agrupa por proyecto — *"los criterios de relevancia son por proyecto, así que mezclarlos
> obliga a rotar de criterio en cada tarjeta y vuelve inconsistente el juicio"*. El control de orden
> no re-litiga eso (ADR-076 §6).
>
> 🔴 **Y el chip de calificación NO se toca.** Sigue yendo al server por `leerMazo`. Es lo que
> sostiene *"una tarjeta calificada no se va del mazo"* (ADR-034). Las facetas nuevas conviven al
> lado; no se unifican (ADR-076 §4).

- [ ] **Paso 1 — Declarar criterios y facetas a nivel de módulo**

Agregar cerca del tope de `mazo.tsx`, fuera del componente:

```tsx
import { BarraOrden, usarOrden } from "@/components/video/orden";
import type { CriterioOrden, Faceta } from "@/domain/orden";

// Fuera del componente: `usarOrden` memoiza contra estas referencias.
// El Feed es la única de las cuatro que tiene `engagement` y `relevanciaScore` en su tipo.
const CRITERIOS: readonly CriterioOrden<CandidatoFeed>[] = [
  { clave: "likes", etiqueta: "Likes", valor: (c) => c.likes },
  { clave: "views", etiqueta: "Vistas", valor: (c) => c.views },
  { clave: "seguidores", etiqueta: "Seguidores", valor: (c) => c.seguidores },
  { clave: "engagement", etiqueta: "Interacción", valor: (c) => c.engagement },
  { clave: "relevancia", etiqueta: "Relevancia", valor: (c) => c.relevanciaScore },
  { clave: "titulo", etiqueta: "Título A-Z", valor: (c) => c.titulo },
];

// Sin `heat`: el mazo ya viene ordenado por heat descendente y ese es el default de la pantalla
// ("Lo que muestra la pantalla"). Ofrecerlo otra vez sería el mismo orden con otro nombre.
const FACETAS: readonly Faceta<CandidatoFeed>[] = [
  { clave: "idioma", etiqueta: "Idioma", valor: (c) => c.idioma },
];
```

- [ ] **Paso 2 — Llamar el hook con los demás hooks**

⚠️ **El hook va ARRIBA, no donde se calcula `grupos`.** `const grupos = agrupar(cargados);` vive
justo antes del `return`, y meter un `usarOrden` ahí funciona hoy sólo porque no hay ningún early
return arriba. Es una trampa para el próximo que agregue uno. En el componente `Mazo`, después de
`const [cargando, startCargar] = useTransition();`:

```tsx
const orden = usarOrden(cargados, CRITERIOS, FACETAS);
```

- [ ] **Paso 3 — Ordenar dentro de cada grupo**

Reemplazar la línea `const grupos = agrupar(cargados);` por:

```tsx
// 🔑 Se filtra ANTES de agrupar (`orden.visibles`) y se re-ordena DESPUÉS, dentro de cada grupo.
// Son dos pasos y no uno porque `agrupar()` reordena por heat adentro de cada grupo — está en su
// contrato y las otras pantallas dependen de eso, así que pisaría el criterio elegido.
// Con el criterio en `null` (el default) este segundo `ordenar` no hace nada y el mazo queda
// exactamente como hoy.
const grupos = agrupar(orden.visibles).map((g) => ({
  ...g,
  candidatos: ordenar(
    g.candidatos,
    CRITERIOS.find((c) => c.clave === orden.claveCriterio) ?? null,
    orden.direccion,
  ),
}));
```

Y agregar el import de `ordenar` (del **dominio**, no del componente — `orden.tsx` no lo re-exporta):

```tsx
import { ordenar } from "@/domain/orden";
```

> 📌 **Por qué se ordena dos veces y no una.** `agrupar()` ordena por heat descendente adentro de
> cada grupo — está en su contrato y las otras pantallas dependen de eso. Filtrar antes es lo que
> saca del mazo lo que la faceta esconde; re-ordenar después es lo que hace ganar al criterio
> elegido sin tocar `agrupar()`. Con el criterio en `null` (el default) el segundo `ordenar` no hace
> nada y el mazo queda exactamente como hoy.

- [ ] **Paso 4 — Montar la barra**

En el JSX, dentro del `<div className="flex flex-wrap items-center gap-2">` que ya tiene los chips
de `FILTROS`, agregar `<BarraOrden orden={orden} />` **después** del `.map()` de los chips y
**antes** del `<span className="ml-auto ...">`.

- [ ] **Paso 5 — Confirmar que los contadores no se movieron**

`ajustadas`, `pendientes` y el pie (`cargados.length`) **siguen saliendo de `cargados` y de
`cuentas`, nunca de `orden.visibles`.** Los chips tienen que decir cuántos hay **en la tabla**, no
cuántos quedaron después de la faceta — es lo que el comentario del tope del archivo ya explica.
Revisar que ninguna de esas tres expresiones se haya cambiado.

- [ ] **Paso 6 — Typecheck y tests**

```bash
cd apps/dashboard && npm run typecheck && npm test
```

Esperado: sin salida de `tsc`, suite en verde.

- [ ] **Paso 7 — Verificar en pantalla**

Con `npm run dev`, en `/curar/feed`:

1. Al entrar: grupos por proyecto, heat ↓ adentro. **Idéntico a antes.**
2. Elegir **Likes ↓**: los grupos **siguen ahí**, y adentro de cada uno manda likes.
3. Calificar una tarjeta con un chip de faceta prendido: la tarjeta **no desaparece** (sigue siendo
   el comportamiento de ADR-034).
4. El chip **Sin calificar / 🔥 / Aprobados / Todos** sigue funcionando y sus números no cambian al
   prender una faceta.

- [ ] **Paso 8 — Commit**

```bash
git add "apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/feed/mazo.tsx"
git commit -m "El Feed ordena dentro del grupo, sin tocar el chip de calificación (ADR-076)"
```

---

## Tarea 6 — Históricos: ordenar dentro del grupo

**Archivos:**
- Modificar: `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/historicos/lista.tsx`

**Interfaces:**
- Consume: `usarOrden`, `BarraOrden`, `ordenar` (Tareas 1-3); `type Historico` de
  `@/lib/historicos` y `type FilaRegistro` de `@/domain/grabados` (ya existen).
- Produce: nada.

> Esta pantalla es la que tiene los nulos de verdad: **248 de 377 filas traen métricas**. Las 129
> que no son las `transcripcion_a_pedido`. Es el caso que hace visible el invariante de la Tarea 1.

- [ ] **Paso 1 — Declarar criterios y facetas a nivel de módulo**

La pantalla recorre `FilaRegistro<Historico>`, que tiene dos formas (`guion` y `huerfana`). Las
huérfanas **no tienen métricas de ninguna clase**, así que sus valores son `null` y caen al final —
que es exactamente lo correcto y lo que ya hace `ordenar`.

Agregar cerca del tope de `lista.tsx`, fuera del componente:

```tsx
import { BarraOrden, usarOrden } from "@/components/video/orden";
// 🔴 `ordenar` sale de `@/domain/orden`, NO del componente: `orden.tsx` no lo re-exporta.
import { ordenar, type CriterioOrden, type Faceta } from "@/domain/orden";

type Fila = FilaRegistro<Historico>;

/** Lo que `agrupar()` recibe y devuelve en esta pantalla. Se nombra para no spreadear a ciegas. */
type ItemGrupo = { id: string; proyecto: string; heat: null; fila: Fila };

/** Lo que la fila sabe, o `null` si es una huérfana (un link grabado por fuera, sin guion). */
const del = <K extends keyof Historico>(campo: K) => (f: Fila): Historico[K] | null =>
  f.tipo === "guion" ? f.guion[campo] : null;

// ⚠️ **Sin `engagement`**: el tipo `Historico` no lo tiene (ADR-076 §5).
const CRITERIOS: readonly CriterioOrden<Fila>[] = [
  { clave: "likes", etiqueta: "Likes", valor: del("likes") },
  { clave: "views", etiqueta: "Vistas", valor: del("views") },
  { clave: "seguidores", etiqueta: "Seguidores", valor: del("seguidores") },
  { clave: "heat", etiqueta: "Heat", valor: del("heat") },
  { clave: "relevancia", etiqueta: "Relevancia", valor: del("relevanciaScore") },
  { clave: "titulo", etiqueta: "Título A-Z", valor: del("titulo") },
];

// Sin criterio de fecha: el default de la pantalla YA es fecha descendente (`armarRegistro`), que
// es lo que muestra "Lo que muestra la pantalla".
const FACETAS: readonly Faceta<Fila>[] = [
  { clave: "idioma", etiqueta: "Idioma", valor: del("idioma") },
  { clave: "origen", etiqueta: "Origen", valor: del("origen") },
];
```

> 📌 **`origen` es la faceta que sólo esta pantalla puede ofrecer**, y contesta la pregunta que las
> 129 filas sin métricas hacen inevitable: *"¿esto vino del Feed o de un link que pegamos?"*. Está
> en el tipo `Historico` desde ADR-062 y no la lee nadie.

- [ ] **Paso 2 — Enchufar el hook sobre `visibles`**

`visibles` es lo que sale del chip de grabado (`filtrarRegistro`). El orden y las facetas van
**encima** de eso, no en su lugar: son los dos sistemas conviviendo (ADR-076 §4).

Reemplazar el `useMemo` de `grupos` por:

```tsx
const orden = usarOrden(visibles, CRITERIOS, FACETAS);

const grupos = useMemo(() => {
  const items = orden.visibles.map((fila) => ({
    id: fila.tipo === "huerfana" ? fila.marca.clave : fila.guion.id,
    proyecto: (fila.tipo === "huerfana" ? null : fila.guion.proyecto) ?? "",
    heat: null,
    fila,
  }));
  const elegido = CRITERIOS.find((c) => c.clave === orden.claveCriterio) ?? null;
  // El criterio se declara sobre `Fila`, pero acá se ordenan los items envueltos que `agrupar`
  // devuelve. Se adapta explícito y no con un spread: el spread compila igual y esconde qué tipo
  // quedó del otro lado.
  const criterio: CriterioOrden<ItemGrupo> | null =
    elegido === null
      ? null
      : { clave: elegido.clave, etiqueta: elegido.etiqueta, valor: (x) => elegido.valor(x.fila) };

  return agrupar(items).map((g) => ({
    ...g,
    // Sin criterio elegido se restaura el orden por fecha, que es el default histórico y la razón
    // escrita arriba: acá el heat es `null` en 129 de 377 filas, así que `agrupar` desempataría por
    // uuid. Con criterio elegido, manda el criterio.
    candidatos:
      criterio === null
        ? [...g.candidatos].sort((a, b) => fechaDeFila(b.fila).localeCompare(fechaDeFila(a.fila)))
        : ordenar(g.candidatos, criterio, orden.direccion),
  }));
}, [orden.visibles, orden.claveCriterio, orden.direccion]);
```

- [ ] **Paso 3 — Revisar los dos consumidores de `visibles`**

`datosPorId` sigue armándose desde **`visibles`** y no desde `orden.visibles`. Razón: la barra de
selección recibe claves marcadas y necesita poder resolver la url de cualquiera que se haya marcado,
incluso si después se prendió una faceta que la esconde. Es la misma lógica por la que `abierto` ya
busca en `registro` entero y no en `visibles` — el comentario 🩸 de ese bloque lo explica.

**No cambiar `cuentas`**: sale de `registro` entero y así tiene que quedarse.

- [ ] **Paso 4 — Montar la barra**

En el JSX, dentro del `<div className="flex flex-wrap gap-2">` que tiene los chips de
`FILTROS_REGISTRO`, agregar `<BarraOrden orden={orden} />` después del `.map()` de esos chips.

- [ ] **Paso 5 — Typecheck y tests**

```bash
cd apps/dashboard && npm run typecheck && npm test
```

Esperado: sin salida de `tsc`, suite en verde.

- [ ] **Paso 6 — Verificar en pantalla**

Con `npm run dev`, en `/curar/historicos`:

1. Al entrar: agrupado por proyecto, fecha ↓ adentro. **Idéntico a antes.**
2. Elegir **Likes ↑**: dentro de cada grupo, el de menos likes primero, y **las filas sin likes
   quedan al final igual** (es el grupo `(sin proyecto)` el que lo hace obvio: ahí caen las 129).
3. La faceta **Origen** muestra `feed` y `transcribir` con sus conteos; prender `transcribir` deja
   sólo las que vinieron de links pegados.
4. Los chips **Sin grabar / Grabados / Todos** y sus números no cambian al prender una faceta.
5. Marcar un grabado con una faceta prendida sigue funcionando y la fila no se va.

- [ ] **Paso 7 — Commit**

```bash
git add "apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/historicos/lista.tsx"
git commit -m "Históricos ordena dentro del grupo y filtra por idioma y origen (ADR-076)"
```

---

## Tarea 7 — Descartes: la barra flaca, y la fecha que faltaba

**Archivos:**
- Modificar: `apps/dashboard/domain/feed.ts` (el tipo `DescarteFeed`)
- Modificar: `apps/dashboard/lib/descartes.ts` (el `select` y el mapeo)
- Modificar: `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/descartes/lista.tsx`

**Interfaces:**
- Consume: `usarOrden`, `BarraOrden` (Tarea 3); `type DescarteFeed` de `@/domain/feed`.
- Produce: `DescarteFeed` gana el campo `creadoEn: string | null`.

> 🔴 **`app.descartes` tiene 12 columnas y ninguna es una métrica.** Se sondeó contra prod el
> 26/08: sin `likes`, `views`, `seguidores`, `engagement` ni `idioma` — el gate mata el video antes
> de que se archive nada de eso. Sus únicos ejes reales son `relevancia_score`, el título y
> `creado_en`. **Esta barra queda flaca a propósito**; una con seis criterios acá serían cuatro que
> no hacen nada (ADR-076 §5).
>
> 🔴 **Y el default es sagrado.** *"Near-miss primero, sin auditar antes"* es una regla de ADR-021,
> no un orden cualquiera: es donde viven los falsos negativos. `ordenarDescartes` lo aplica en el
> server y el criterio por defecto (`null`) **no lo toca**.

- [ ] **Paso 1 — Agregar `creadoEn` al tipo**

En `apps/dashboard/domain/feed.ts`, dentro de `export type DescarteFeed = {`, agregar:

```ts
  /** Cuándo el gate lo mató. Es el único eje temporal que esta tabla tiene. */
  creadoEn: string | null;
```

- [ ] **Paso 2 — Traerlo de la base**

En `apps/dashboard/lib/descartes.ts`, tres cambios:

En `filaDescarte`, agregar al objeto de zod:

```ts
  creado_en: z.string().nullable(),
```

En `COLUMNAS`, agregar la columna:

```ts
const COLUMNAS =
  "id, titulo, script, thumbnail_url, referente, url_referente, relevancia_score, " +
  "relevancia_razon, veredicto, creado_en, proyectos(nombre)";
```

En el mapeo de `leerDescartes`, agregar al objeto que se construye:

```ts
      creadoEn: r.creado_en,
```

- [ ] **Paso 3 — Typecheck para confirmar que el tipo se propagó**

```bash
cd apps/dashboard && npm run typecheck
```

Esperado: sin salida. Si `tsc` se queja en otro archivo, es que alguien más construye un
`DescarteFeed` a mano — arreglarlo ahí también.

- [ ] **Paso 4 — Declarar criterios a nivel de módulo**

Agregar cerca del tope de `descartes/lista.tsx`, fuera del componente:

```tsx
import { BarraOrden, usarOrden } from "@/components/video/orden";
import type { CriterioOrden } from "@/domain/orden";

// 🔴 Tres criterios y ninguna faceta, y es lo honesto: `app.descartes` no tiene una sola métrica ni
// `idioma` (sondeado contra prod el 26/08, 12 columnas). Un selector con likes y vistas acá serían
// dos controles que no hacen nada — la regla de ADR-076 §7 aplicada al orden.
const CRITERIOS: readonly CriterioOrden<DescarteFeed>[] = [
  { clave: "relevancia", etiqueta: "Relevancia", valor: (d) => d.relevanciaScore },
  { clave: "fecha", etiqueta: "Más reciente", valor: (d) => d.creadoEn },
  { clave: "titulo", etiqueta: "Título A-Z", valor: (d) => d.titulo },
];
```

- [ ] **Paso 5 — Enchufar el hook y montar la barra**

En el componente `Lista`, después de los `useState` que ya están:

```tsx
const orden = usarOrden(descartes, CRITERIOS);
```

Dos ediciones quirúrgicas sobre líneas que ya existen:

**(a)** Insertar la barra entre el `<p>` de pendientes y el `<div className="grid grid-cols-1 …">`:

```tsx
<BarraOrden orden={orden} />
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

**(b)** Cambiar **una palabra** en el `.map()` de la línea siguiente:

```tsx
// antes
{descartes.map((d) => {
// después
{orden.visibles.map((d) => {
```

> 🔴 **Estas dos líneas NO se tocan**, y las dos ya existen tal cual en el archivo:
>
> ```tsx
> const abierto = descartes.find((d) => d.id === abiertoId) ?? null;
> const pendientes = descartes.filter((d) => efectivo(d) === null).length;
> ```
>
> `pendientes` cuenta cuántos faltan **en la cola entera**, que es la pregunta que la pantalla
> contesta arriba de todo; sobre `orden.visibles` diría un número más chico cada vez que alguien
> ordena. Y `abierto` tiene que poder resolver un id aunque no esté en lo visible — es la misma
> lección 🩸 que `historicos/lista.tsx` ya tiene escrita: *"un botón que a veces funciona es peor que
> uno que no está"*.

- [ ] **Paso 6 — Typecheck y tests**

```bash
cd apps/dashboard && npm run typecheck && npm test
```

Esperado: sin salida de `tsc`, suite en verde.

- [ ] **Paso 7 — Verificar en pantalla**

Con `npm run dev`, en `/curar/descartes` (82 filas en prod al 26/08):

1. Al entrar, el orden es el near-miss de siempre: **sin veredicto arriba, y adentro por score
   descendente.** Esto es lo que **no puede** cambiar.
2. Elegir **Más reciente ↓** reordena; volver a *"Lo que muestra la pantalla"* restaura el near-miss.
3. **No aparece ningún chip de faceta.** Es correcto: la tabla no tiene con qué.
4. Marcar un veredicto con un orden elegido sigue funcionando.

- [ ] **Paso 8 — Commit**

```bash
git add apps/dashboard/domain/feed.ts apps/dashboard/lib/descartes.ts "apps/dashboard/app/[cliente]/[pipeline]/(zonas)/curar/descartes/lista.tsx"
git commit -m "Descartes ordena por relevancia, fecha y título sin pisar el near-miss (ADR-076)"
```

---

## Cierre

- [ ] **Correr la verificación completa del repo**

```bash
cd core/scripts && npm run validate
```

```bash
cd apps/dashboard && npm run typecheck && npm test && npm run build
```

Esperado: validador en verde, `tsc` sin salida, suite en verde, build sin errores.

- [ ] **Actualizar el estado del ADR**

En `docs/adr/ADR-076-ordenar-es-una-vista-no-una-consulta.md` y en su fila de
`docs/adr/README.md`, cambiar **`sin construir`** por **`construida`**.

- [ ] **Escribir el handoff**

Correr `/handoff` para que la sesión quede en `docs/agents/handoff.md`. Lo que tiene que quedar
anotado, porque es lo que un agente futuro no puede deducir del código:

1. Que el default de las cuatro pantallas es `null` = *no reordenar*, y que eso es lo que evita
   duplicar `ordenarDescartes`, `armarRegistro` y el orden de inserción.
2. Que el desempate se apoya en la estabilidad de `Array.prototype.sort`, garantizada por ES2019.
3. Que **`engagement` quedó afuera de Colecciones y de Históricos** porque los tipos no lo
   transportan, y que meterlo pide migración.
4. Que **Descartes no tiene métricas ni idioma**, medido, y que su barra flaca es correcta.
5. El techo de escala: esto funciona con 209 / 377 / 57 / 82 filas y sin paginación en ninguno de
   los cuatro lectores. **Si el Feed vuelve a paginar, el orden tiene que mudarse a la query** —
   salvo en Colecciones, donde no se puede sin materializar `fusionar()`.

## Lo que este plan NO hace

Escrito para que no se lea como que quedó a medias:

- **No monta la barra en Transcribir.** Su cola tiene 0 de 130 con título y ninguna métrica: sería un
  adorno. Ahí el orden útil es por estado y por tanda, que es otro set de criterios.
- **No monta la barra en el Feed de LinkedIn ni en sus descartes.** Su tabla está vacía y su motor no
  existe.
- **No agrega filtro por referente.** Alta cardinalidad: pide un selector con búsqueda, no chips.
  Decisión de Mani, y es lo primero que se va a pedir después.
- **No agrega la perilla `Agrupar por`.** Diferida en el ADR: dos controles que interactúan para una
  pregunta que nadie hizo todavía.
- **No pagina nada.** Es el techo declarado, no un olvido.
