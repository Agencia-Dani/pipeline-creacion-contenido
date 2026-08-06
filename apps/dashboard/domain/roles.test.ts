import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esRol,
  puedeVerZona,
  ROLES,
  veCostos,
  ZONAS,
  zonaInicial,
  zonasDe,
} from "./roles.ts";

test("el operador opera, cura, transcribe Y entiende", () => {
  assert.equal(puedeVerZona("operador", "operar"), true);
  assert.equal(puedeVerZona("operador", "curar"), true);
  assert.equal(puedeVerZona("operador", "transcribir"), true);
  // Entró el 2026-08-05: Entender le mide su propio trabajo (precisión de entrega, separación del
  // gate). La exclusión anterior venía de la tabla de zonas de plan-cockpit §2.1 y era la única
  // sin motivo escrito.
  assert.equal(puedeVerZona("operador", "entender"), true);
});

test("🚪 el operador entra por Operar, no por Entender — el orden del array es prioridad", () => {
  // `entender` va última a propósito: `zonaInicial` devuelve el primer elemento, así que meterla
  // antes cambiaría a dónde cae el equipo al loguearse. Es el tipo de regresión que no rompe nada
  // y que se nota como "la app me manda a otro lado".
  assert.equal(zonaInicial("operador"), "operar");
  assert.deepEqual(zonasDe("operador"), ["operar", "curar", "transcribir", "entender"]);
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

test("💰 solo el dev ve los costos de proveedor — ni el operador ni el sponsor", () => {
  assert.equal(veCostos("dev"), true);
  // El caso que motivó el cambio (2026-08-06): gente de Retia con rol `operador`. El gate viejo
  // decía `rol !== "sponsor"` y les publicaba el margen de la agencia sin un solo error.
  assert.equal(veCostos("operador"), false);
  assert.equal(veCostos("sponsor"), false);
});

test("💰 el gate de costos falla hacia ESCONDER: un rol nuevo no ve costos por defecto", () => {
  // La propiedad, no los tres casos: exactamente un rol de los que existen ve costos. Si mañana
  // aparece un cuarto rol y alguien lo agrega a ROLES sin pensar en esto, este test lo caza.
  assert.deepEqual(ROLES.filter(veCostos), ["dev"]);
});

test("esRol valida strings contra los 3 roles reales", () => {
  assert.equal(esRol("operador"), true);
  assert.equal(esRol("admin"), false);
  assert.equal(esRol(null), false);
});
