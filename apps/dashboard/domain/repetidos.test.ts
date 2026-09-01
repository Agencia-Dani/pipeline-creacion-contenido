import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarRepetidos, huellaDe, MIN_HUELLA, type FilaHuella } from "./repetidos.ts";

const fila = (p: Partial<FilaHuella> & { id: string }): FilaHuella => ({
  referente: "the.pocket.psychologist",
  texto: "Stress isn't the problem. A full nervous system is. Watch this first.",
  calificacion: null,
  ...p,
});

test("huellaDe: colapsa acentos en vez de borrar la vocal", () => {
  assert.equal(huellaDe("Psicología"), "psicologia");
  assert.equal(huellaDe("emoción"), "emocion");
});

test("huellaDe: los emoji y la puntuación no hacen distintos a dos videos", () => {
  assert.equal(huellaDe("🍎 Your self talk is leaving bruises."), huellaDe("Your self talk, is leaving bruises 🍎"));
});

test("huellaDe: tolera null", () => {
  assert.equal(huellaDe(null), "");
  assert.equal(huellaDe(undefined), "");
});

test("marca el sin calificar cuyo gemelo del mismo referente ya se calificó", () => {
  const r = detectarRepetidos([
    fila({ id: "a", calificacion: "👍" }),
    fila({ id: "b" }),
  ]);
  assert.deepEqual(r.get("b"), { id: "a", calificacion: "👍" });
  // El ya calificado no se marca a sí mismo.
  assert.equal(r.has("a"), false);
});

test("no marca cuando el gemelo es de OTRO referente: el caption genérico no prueba nada", () => {
  const r = detectarRepetidos([
    fila({ id: "a", referente: "drjulie", calificacion: "👍" }),
    fila({ id: "b", referente: "the.pocket.psychologist" }),
  ]);
  assert.equal(r.size, 0);
});

test("no marca sin referente: un dato roto no es una coincidencia", () => {
  const r = detectarRepetidos([
    fila({ id: "a", referente: null, calificacion: "👍" }),
    fila({ id: "b", referente: null }),
  ]);
  assert.equal(r.size, 0);
});

test(`no marca con huella de menos de ${MIN_HUELLA} caracteres útiles`, () => {
  const r = detectarRepetidos([
    fila({ id: "a", texto: "Reels 🔥", calificacion: "👍" }),
    fila({ id: "b", texto: "Reels 🔥" }),
  ]);
  assert.equal(r.size, 0);
});

test("dos sin calificar entre sí NO se marcan: el aviso es contra algo ya juzgado", () => {
  const r = detectarRepetidos([fila({ id: "a" }), fila({ id: "b" })]);
  assert.equal(r.size, 0);
});

test("el gemelo elegido es estable aunque cambie el orden de entrada", () => {
  const filas = [
    fila({ id: "c1", calificacion: "👍" }),
    fila({ id: "a1", calificacion: "👎" }),
    fila({ id: "z9" }),
  ];
  const directo = detectarRepetidos(filas);
  const alReves = detectarRepetidos([...filas].reverse());
  assert.deepEqual(directo.get("z9"), { id: "a1", calificacion: "👎" });
  assert.deepEqual(alReves.get("z9"), directo.get("z9"));
});

test("el caso real que lo motivó: mismo caption, distinto post, ya calificado", () => {
  // Medido en prod el 2026-09-01: `the.pocket.psychologist` subió el mismo reel dos veces.
  const r = detectarRepetidos([
    fila({ id: "7d3a5ca2", calificacion: "👍" }), // post 3956108894929106430, ya grabado
    fila({ id: "92079065" }), // post 3839389820758477933, volvió al Feed como nuevo
  ]);
  assert.deepEqual(r.get("92079065"), { id: "7d3a5ca2", calificacion: "👍" });
});
