import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esRol,
  puedeVerZona,
  ROLES,
  ZONAS,
  zonaInicial,
  zonasDe,
} from "./roles.ts";

test("el operador opera, cura y transcribe, pero no entra a entender (la zona dev/sponsor)", () => {
  assert.equal(puedeVerZona("operador", "operar"), true);
  assert.equal(puedeVerZona("operador", "curar"), true);
  assert.equal(puedeVerZona("operador", "transcribir"), true);
  assert.equal(puedeVerZona("operador", "entender"), false);
});

test("el sponsor solo entiende", () => {
  assert.deepEqual(zonasDe("sponsor"), ["entender"]);
  assert.equal(puedeVerZona("sponsor", "operar"), false);
  assert.equal(puedeVerZona("sponsor", "curar"), false);
  // Transcribir es una herramienta del equipo, no un reporte: el sponsor no la ve (ADR-031).
  assert.equal(puedeVerZona("sponsor", "transcribir"), false);
});

test("el dev ve las cuatro zonas", () => {
  assert.deepEqual(zonasDe("dev"), ZONAS);
});

test("cada rol tiene zona inicial y es una que puede ver", () => {
  for (const rol of ROLES) {
    assert.equal(puedeVerZona(rol, zonaInicial(rol)), true);
  }
});

test("esRol valida strings contra los 3 roles reales", () => {
  assert.equal(esRol("operador"), true);
  assert.equal(esRol("admin"), false);
  assert.equal(esRol(null), false);
});
