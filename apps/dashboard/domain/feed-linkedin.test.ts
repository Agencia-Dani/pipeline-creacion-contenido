import { test } from "node:test";
import assert from "node:assert/strict";
import { CALIFICACIONES, VEREDICTOS } from "./feed.ts";
import {
  estadoDe,
  ordenarDescartesLinkedin,
  ordenarMazo,
  sinCalificar,
  sinVeredicto,
  type CandidatoLinkedin,
  type DescarteLinkedin,
} from "./feed-linkedin.ts";

const cand = (
  id: string,
  extra: Partial<CandidatoLinkedin> = {},
): CandidatoLinkedin => ({
  id,
  externalId: `ext-${id}`,
  carril: "copiable",
  fuente: "pinterest",
  titulo: `Pieza ${id}`,
  idioma: "en",
  url: null,
  autor: null,
  imagenUrl: null,
  reacciones: null,
  comentarios: null,
  heatScore: null,
  relevanciaScore: null,
  proyectoId: null,
  vozId: null,
  calificacion: null,
  estado: "nuevo",
  ...extra,
});

const desc = (id: string, extra: Partial<DescarteLinkedin> = {}): DescarteLinkedin => ({
  id,
  carril: "copiable",
  fuente: "pinterest",
  titulo: `Descarte ${id}`,
  url: null,
  autor: null,
  relevanciaScore: null,
  relevanciaRazon: null,
  veredicto: null,
  ...extra,
});

test("🔑 el vocabulario NO se duplica: LinkedIn reusa el de reels", () => {
  // La `020` §4 usa el mismo `check` que la tabla de reels a propósito — "el equipo de redes no
  // aprende dos idiomas". Este test es el que avisa si alguien replica el enum en vez de importarlo.
  assert.deepEqual([...CALIFICACIONES], ["🔥", "👍", "👎"]);
  assert.deepEqual([...VEREDICTOS], ["bien descartado", "era bueno"]);
  // Y la derivación de ADR-034 es literalmente la misma función, no una copia que se le parece.
  assert.equal(estadoDe("🔥"), "aprobado");
  assert.equal(estadoDe("👍"), "aprobado");
  assert.equal(estadoDe("👎"), "descartado");
});

test("el mazo pone lo sin calificar primero, sin importar la señal", () => {
  // Aunque el calificado tenga mejor score: lo que espera decisión va arriba.
  const orden = ordenarMazo([
    cand("a", { calificacion: "🔥", heatScore: 99 }),
    cand("b", { heatScore: 1 }),
  ]);
  assert.deepEqual(orden.map((c) => c.id), ["b", "a"]);
});

test("dentro de cada grupo manda la señal, y heat le gana a relevancia", () => {
  const orden = ordenarMazo([
    cand("bajo", { heatScore: 10 }),
    cand("alto", { heatScore: 90 }),
    cand("solo-relevancia", { relevanciaScore: 50 }),
  ]);
  assert.deepEqual(orden.map((c) => c.id), ["alto", "solo-relevancia", "bajo"]);
});

test("🩸 el orden es ESTABLE cuando todo empata — la lección del corte 3/4", () => {
  // Sin desempate por id, el orden depende de cómo vino la lista: una fila salta de lugar entre dos
  // clicks mientras alguien la recorre. Se comprueba con la misma lista barajada.
  const iguales = [cand("c"), cand("a"), cand("b")];
  assert.deepEqual(ordenarMazo(iguales).map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(ordenarMazo([...iguales].reverse()).map((c) => c.id), ["a", "b", "c"]);
});

test("sin señal no rompe: un candidato sin scores va al fondo de su grupo", () => {
  const orden = ordenarMazo([cand("sin"), cand("con", { relevanciaScore: 0 })]);
  assert.deepEqual(orden.map((c) => c.id), ["con", "sin"]);
});

test("los descartes ponen primero los que todavía pueden enseñar algo", () => {
  // Con veredicto ya cumplieron su función (corregir los criterios). Y entre los pendientes,
  // primero los de score más alto: son los que el filtro mató por menos.
  const orden = ordenarDescartesLinkedin([
    desc("juzgado", { veredicto: "era bueno", relevanciaScore: 99 }),
    desc("lejos", { relevanciaScore: 10 }),
    desc("cerca", { relevanciaScore: 80 }),
  ]);
  assert.deepEqual(orden.map((d) => d.id), ["cerca", "lejos", "juzgado"]);
});

test("los contadores cuentan lo que espera una decisión, no el total", () => {
  assert.equal(sinCalificar([cand("a"), cand("b", { calificacion: "👎" })]), 1);
  assert.equal(sinVeredicto([desc("a"), desc("b", { veredicto: "bien descartado" })]), 1);
  assert.equal(sinCalificar([]), 0);
  assert.equal(sinVeredicto([]), 0);
});

test("las dos listas aguantan el estado real de hoy: vacías", () => {
  // Las 4 tablas de LinkedIn tienen 0 filas y su motor no existe. La pantalla abre en ese estado.
  assert.deepEqual(ordenarMazo([]), []);
  assert.deepEqual(ordenarDescartesLinkedin([]), []);
});
