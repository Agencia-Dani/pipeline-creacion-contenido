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
  // `entender` y `ajustes` van últimas a propósito: `zonaInicial` devuelve el primer elemento, así
  // que meterlas antes cambiaría a dónde cae el equipo al loguearse. Es el tipo de regresión que no
  // rompe nada y que se nota como "la app me manda a otro lado".
  assert.equal(zonaInicial("operador"), "operar");
  assert.deepEqual(zonasDe("operador"), ["operar", "curar", "transcribir", "entender", "ajustes"]);
});

test("⚙️ el operador SÍ ve la zona ajustes — ahí viven 8 de los 18 knobs que usa", () => {
  // El plan la daba como "dev y sponsor". Medido contra prod: 8 de los 18 knobs son de visibilidad
  // `equipo`, así que excluir al operador le sacaba perillas que usa (ADR-060 §1). Lo que se gatea
  // son las PANTALLAS de la zona, no la zona: `ajustes/equipo` es dev|sponsor (`domain/permisos.ts`).
  assert.equal(puedeVerZona("operador", "ajustes"), true);
  assert.equal(puedeVerZona("dev", "ajustes"), true);
  assert.equal(puedeVerZona("sponsor", "ajustes"), true);
});

test("el sponsor opera Y administra su equipo: es el jefe del equipo de su empresa", () => {
  // Cambió el 2026-08-07. Antes era "el jefe que mira" (solo entender+ajustes) y eso dejaba a cada
  // empresa sin nadie que pudiera usar la herramienta Y dar accesos: el operador no invita, el dev
  // es de la agencia. Medido el 06/08: cero sponsors en las 3 empresas — la figura no servía.
  assert.deepEqual(zonasDe("sponsor"), ZONAS);
  assert.equal(zonaInicial("sponsor"), "operar");
  assert.equal(puedeVerZona("sponsor", "operar"), true);
  assert.equal(puedeVerZona("sponsor", "curar"), true);
  assert.equal(puedeVerZona("sponsor", "transcribir"), true);
});

test("💰 pero el sponsor NO ve costos: es de la empresa cliente y eso es el margen de la agencia", () => {
  // La línea que no se movió al darle las zonas. `v_costos_semana` es consumo × `app.tarifas`;
  // "ver métricas" y "ver lo que le cuesta a la agencia" son cosas distintas. La `025` lo sostiene
  // también en la base, así que este test cuida la mitad de UI de una regla que tiene dos.
  assert.equal(veCostos("sponsor"), false);
  assert.equal(veCostos("operador"), false);
  assert.equal(veCostos("dev"), true);
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
