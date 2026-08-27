import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advertenciaDeBorrado,
  COLUMNAS_COLECCION,
  necesitaEnriquecer,
  queFaltaEnriquecer,
  tablaDeColeccion,
  validarNombre,
} from "./colecciones.ts";
import type { GuionParaDocumento } from "./docx.ts";
import type { Video } from "./video.ts";

const video = (p: Partial<Video> = {}): Video => ({
  clave: "instagram:abc",
  plataforma: "instagram",
  external_id: "abc",
  url: "https://www.instagram.com/p/AAA/",
  titulo: null, referente: null, thumbnail: null,
  views: null, likes: null, seguidores: null, idioma: null, heat: null,
  ...p,
});

// ── El nombre ────────────────────────────────────────────────────────────────

test("el nombre se guarda trimmeado", () => {
  // Sin esto el unique (instance_id, nombre) deja pasar dos colecciones visualmente idénticas.
  const r = validarNombre("   Guiones de Milena   ");
  assert.deepEqual(r, { ok: true, nombre: "Guiones de Milena" });
});

test("un nombre en blanco no es un nombre", () => {
  assert.equal(validarNombre("     ").ok, false);
  assert.equal(validarNombre("").ok, false);
});

test("el tope es 80, igual que el check de la 031", () => {
  assert.equal(validarNombre("x".repeat(80)).ok, true);
  assert.equal(validarNombre("x".repeat(81)).ok, false);
});

// ── La factura de Apify ──────────────────────────────────────────────────────

test("un link pelado se enriquece: son los 130 de Transcribir", () => {
  assert.equal(necesitaEnriquecer(video()), true);
});

test("con título Y referente NO se paga: ya se identifica", () => {
  assert.equal(necesitaEnriquecer(video({ titulo: "Un título", referente: "@milena" })), false);
});

test("con título pero sin referente TAMPOCO se paga", () => {
  // Basta con poder saber qué es sin abrirlo. Pagar por completar es comprar cosmética.
  assert.equal(necesitaEnriquecer(video({ titulo: "Un título" })), false);
});

test("con referente pero sin título tampoco", () => {
  assert.equal(necesitaEnriquecer(video({ referente: "@rochi" })), false);
});

test("la miniatura sola NO justifica pagar", () => {
  // 🔑 Es la decisión de costo de las 55 filas guion_reel del histórico: tienen título y referente
  // y ninguna imagen, porque outputs nunca la guardó. Serían 55 llamadas por una imagen que no
  // cambia ninguna decisión — la tarjeta ya dibuja la inicial del referente.
  const conIdentidadSinFoto = video({ titulo: "Un título", referente: "@milena", thumbnail: null });
  assert.equal(necesitaEnriquecer(conIdentidadSinFoto), false);
});

test("el mismo video repetido se paga UNA vez", () => {
  // Agregar el mismo link dos veces en el mismo lote no puede costar doble.
  const falta = queFaltaEnriquecer([video(), video(), video()]);
  assert.equal(falta.length, 1);
});

test("solo se manda lo que falta, y en orden", () => {
  const falta = queFaltaEnriquecer([
    video({ clave: "instagram:a", external_id: "a" }),
    video({ clave: "instagram:b", external_id: "b", titulo: "ya se sabe", referente: "@x" }),
    video({ clave: "instagram:c", external_id: "c" }),
  ]);
  assert.deepEqual(falta.map((v) => v.external_id), ["a", "c"]);
});

test("sin nada que enriquecer, no se llama a nadie", () => {
  const todos = [video({ titulo: "t", referente: "@r" })];
  assert.deepEqual(queFaltaEnriquecer(todos), []);
});

// ── La tabla (el `.xlsx` de la colección) ────────────────────────────────────

const guion = (p: Partial<GuionParaDocumento> = {}): GuionParaDocumento => ({
  titulo: "Un título",
  referente: "@milena",
  url: "https://www.instagram.com/p/AAA/",
  texto: "Hola.",
  limpio: false,
  ...p,
});

test("la tabla numera desde 1, igual que el Word", () => {
  // Los dos archivos se leen juntos: si la numeración no coincide, "grabá del 3 al 7" deja de
  // significar lo mismo en cada uno.
  const filas = tablaDeColeccion([guion(), guion(), guion()]);
  assert.deepEqual(filas.map((f) => f[0]), [1, 2, 3]);
});

test("cada fila tiene tantas celdas como columnas", () => {
  const [fila] = tablaDeColeccion([guion()]);
  assert.equal(fila.length, COLUMNAS_COLECCION.length);
});

test("la limpieza dice cuál de los dos guiones es", () => {
  // ADR-074: el limpio y el crudo conviven, y quien graba tiene que saber cuál está leyendo.
  const filas = tablaDeColeccion([guion({ limpio: true }), guion({ limpio: false })]);
  assert.deepEqual(filas.map((f) => f[5]), ["LIMPIO", "ORIGINAL"]);
});

test("un video sin guion entra igual y no se saltea el número", () => {
  // Misma regla que el documento. Sacarlo desalinearía la numeración de los dos archivos y haría
  // que la planilla mienta sobre cuántos videos tiene la colección.
  const filas = tablaDeColeccion([guion(), guion({ texto: null }), guion()]);
  assert.equal(filas.length, 3);
  assert.deepEqual(filas.map((f) => f[0]), [1, 2, 3]);
  assert.equal(filas[1][4], null);
  assert.equal(filas[1][5], "SIN GUION");
});

test("lo que no se sabe va vacío, no inventado", () => {
  const [fila] = tablaDeColeccion([guion({ titulo: null, referente: null })]);
  assert.equal(fila[1], null);
  assert.equal(fila[2], null);
  // El link siempre está: es lo único que un miembro de la colección sabe de sí mismo con certeza.
  assert.equal(fila[3], "https://www.instagram.com/p/AAA/");
});

test("una colección vacía da una tabla vacía, no una fila fantasma", () => {
  assert.deepEqual(tablaDeColeccion([]), []);
});

// ── advertenciaDeBorrado ─────────────────────────────────────────────────────

test("una colección vacía no advierte nada que perder", () => {
  assert.equal(advertenciaDeBorrado(0), "Está vacía.");
});

test("con videos dice cuántos se van Y qué se queda", () => {
  // Las dos mitades importan: el número es lo que se pierde, la segunda frase es lo que NO —
  // y sin esa mitad la advertencia asusta de más (ADR-073: la bolsa es descartable, lo pagado no).
  const a = advertenciaDeBorrado(57);
  assert.match(a, /57/);
  assert.match(a, /guiones limpios y la metadata comprada se quedan/);
});

test("un solo video no rompe la frase", () => {
  assert.equal(
    advertenciaDeBorrado(1),
    "Se va la lista de 1. Los guiones limpios y la metadata comprada se quedan.",
  );
});
