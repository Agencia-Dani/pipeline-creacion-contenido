import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filtrarPor,
  opcionesDe,
  ordenar,
  type CriterioOrden,
  type Faceta,
} from "./orden.ts";

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
  // El caso real de Título A-Z en Colecciones: 0 de 57 tienen título.
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

// ── Facetas ───────────────────────────────────────────────────────────────────

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
