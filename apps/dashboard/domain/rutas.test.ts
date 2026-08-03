import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDe, esSegmentoValido, rutaDe, rutaZona } from "./rutas.ts";
import { ZONAS } from "./roles.ts";

const cockpit = { cliente: "30x", pipeline: "reels" };

test("la base es el prefijo del cockpit", () => {
  assert.equal(baseDe(cockpit), "/30x/reels");
  assert.equal(rutaDe(cockpit), "/30x/reels");
});

test("rutaDe arma la ruta completa", () => {
  assert.equal(rutaDe(cockpit, "curar/feed"), "/30x/reels/curar/feed");
  assert.equal(rutaDe(cockpit, "operar"), "/30x/reels/operar");
});

test("tolera la barra de más, que es la que se escribe sola", () => {
  assert.equal(rutaDe(cockpit, "/curar/feed"), "/30x/reels/curar/feed");
  assert.equal(rutaDe(cockpit, "curar/feed/"), "/30x/reels/curar/feed");
  assert.equal(rutaDe(cockpit, "/"), "/30x/reels");
});

test("las cuatro zonas arman ruta y ninguna queda con doble barra", () => {
  for (const zona of ZONAS) {
    const ruta = rutaZona(cockpit, zona);
    assert.equal(ruta, `/30x/reels/${zona}`);
    assert.ok(!ruta.includes("//"));
  }
});

test("dos cockpits distintos nunca comparten ruta — es lo que hace que el caché keyee bien", () => {
  const a = rutaDe({ cliente: "30x", pipeline: "reels" }, "curar/feed");
  const b = rutaDe({ cliente: "estadox", pipeline: "reels" }, "curar/feed");
  const c = rutaDe({ cliente: "30x", pipeline: "linkedin" }, "curar/feed");
  assert.equal(new Set([a, b, c]).size, 3);
});

test("esSegmentoValido acepta slugs y rechaza lo que rompería la ruta", () => {
  assert.equal(esSegmentoValido("30x"), true);
  assert.equal(esSegmentoValido("short-form-content"), true);
  assert.equal(esSegmentoValido(".."), false);
  assert.equal(esSegmentoValido("con/barra"), false);
  assert.equal(esSegmentoValido("Con Mayúscula"), false);
  assert.equal(esSegmentoValido(""), false);
  assert.equal(esSegmentoValido("-empieza-con-guion"), false);
});
