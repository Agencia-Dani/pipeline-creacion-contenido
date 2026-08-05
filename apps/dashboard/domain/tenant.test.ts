import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarContexto,
  empresasAlcanzables,
  instanciasVisibles,
  puedeVerCliente,
  puedeVerInstancia,
  rolEn,
  ROL_DE_DUENO,
  type Alcance,
} from "./tenant.ts";

const EMPRESAS = ["30x", "estadox", "retia"];

// Los tres perfiles reales de ADR-051.
const jero: Alcance = { esDueno: false, membresias: [{ clientId: "retia", rol: "operador" }] };
const jefeDeEstadox: Alcance = { esDueno: false, membresias: [{ clientId: "estadox", rol: "sponsor" }] };
const mani: Alcance = { esDueno: true, membresias: [] };
const enDos: Alcance = {
  esDueno: false,
  membresias: [
    { clientId: "30x", rol: "operador" },
    { clientId: "estadox", rol: "sponsor" },
  ],
};

test("una membresía alcanza su empresa y ninguna otra", () => {
  assert.deepEqual(empresasAlcanzables(jero, EMPRESAS), ["retia"]);
  assert.equal(puedeVerCliente(jero, "retia"), true);
  assert.equal(puedeVerCliente(jero, "30x"), false);
  assert.equal(puedeVerCliente(jero, "estadox"), false);
});

test("una cuenta puede estar en varias empresas — el caso que mató a usuarios.client_id", () => {
  assert.deepEqual(empresasAlcanzables(enDos, EMPRESAS).sort(), ["30x", "estadox"]);
  assert.equal(puedeVerCliente(enDos, "retia"), false);
});

test("el dueño alcanza todas, INCLUIDAS las que se creen después", () => {
  assert.deepEqual(empresasAlcanzables(mani, EMPRESAS), EMPRESAS);
  // El punto entero del flag frente a tres membresías: una empresa nueva no hay que acordarse.
  assert.deepEqual(empresasAlcanzables(mani, [...EMPRESAS, "cliente-nuevo"]).at(-1), "cliente-nuevo");
  assert.equal(puedeVerCliente(mani, "cliente-nuevo"), true);
});

test("sin membresías y sin ser dueño no se alcanza nada", () => {
  const recienInvitado: Alcance = { esDueno: false, membresias: [] };
  assert.deepEqual(empresasAlcanzables(recienInvitado, EMPRESAS), []);
  assert.equal(puedeVerCliente(recienInvitado, "30x"), false);
  assert.equal(rolEn(recienInvitado, "30x"), null);
});

// ── El rol, que ahora es POR empresa

test("el rol depende de la empresa, no de la persona", () => {
  assert.equal(rolEn(enDos, "30x"), "operador");
  assert.equal(rolEn(enDos, "estadox"), "sponsor");
  assert.equal(rolEn(enDos, "retia"), null);
});

test("el dueño entra a cualquier empresa con el rol de la agencia", () => {
  assert.equal(rolEn(mani, "retia"), ROL_DE_DUENO);
  assert.equal(rolEn(mani, "cualquiera"), ROL_DE_DUENO);
});

test("si un dueño además tiene membresía, gana la membresía", () => {
  // No es teórico: es lo que pasa si alguien le crea una fila "por las dudas". Que gane la explícita
  // hace que bajarle el rol en una empresa concreta sea posible.
  const duenoConMembresia: Alcance = { esDueno: true, membresias: [{ clientId: "estadox", rol: "sponsor" }] };
  assert.equal(rolEn(duenoConMembresia, "estadox"), "sponsor");
  assert.equal(rolEn(duenoConMembresia, "30x"), ROL_DE_DUENO);
});

// ── Instancias y contexto

const instancias = [
  { id: "i-30x-reels", clientId: "30x" },
  { id: "i-estadox-reels", clientId: "estadox" },
  { id: "i-retia-reels", clientId: "retia" },
];

test("el selector solo lista los cockpits alcanzables", () => {
  assert.deepEqual(instanciasVisibles(jero, instancias).map((i) => i.id), ["i-retia-reels"]);
  assert.deepEqual(instanciasVisibles(enDos, instancias).map((i) => i.id), ["i-30x-reels", "i-estadox-reels"]);
  assert.equal(instanciasVisibles(mani, instancias).length, 3);
});

test("puedeVerInstancia pregunta por la empresa de la instancia, no por la abierta", () => {
  assert.equal(puedeVerInstancia(enDos, { id: "otra", clientId: "estadox" }), true);
  assert.equal(puedeVerInstancia(enDos, { id: "otra", clientId: "retia" }), false);
});

test("🔒 el contexto lleva la empresa DEL COCKPIT, no la del usuario", () => {
  // Es la línea que impide que una pantalla de EstadoX muestre los proyectos de 30X.
  const abierto = armarContexto(enDos, { id: "i-estadox-reels", clientId: "estadox" });
  assert.deepEqual(abierto?.ctx, {
    clientId: "estadox",
    instanceId: "i-estadox-reels",
    origen: "sesion",
  });
  assert.equal(abierto?.rol, "sponsor");
});

test("🔒 todo contexto que sale de armarContexto es de SESIÓN — nunca de fachada", () => {
  // El `origen` decide con qué credencial se consulta la base (`lib/supabase/scoped.ts`), así que
  // esto no es un detalle de forma: si un contexto de pantalla naciera `fachada`, esa pantalla
  // leería con `service_role` y **bypassaría RLS sin que nada avise** — la Capa 2 quedaría
  // decorativa justo por donde entra la gente. El único constructor que puede decir `fachada` es
  // `contextoDeFachada` en `lib/tenant.ts`, que es el camino sin usuario de ADR-028.
  //
  // Se prueba con los tres perfiles porque el que más riesgo tiene es el dueño: alcanza todo, así
  // que un `fachada` colado ahí no se notaría ni mirando los datos. Cada uno con un cockpit que sí
  // alcanza — si no, `armarContexto` devuelve `null` y el test pasaría sin probar nada.
  const casos = [
    { usuario: jero, instancia: { id: "i-retia-reels", clientId: "retia" } },
    { usuario: enDos, instancia: { id: "i-estadox-reels", clientId: "estadox" } },
    { usuario: mani, instancia: { id: "i-30x-reels", clientId: "30x" } },
  ];
  for (const { usuario, instancia } of casos) {
    const abierto = armarContexto(usuario, instancia);
    assert.notEqual(abierto, null, `${instancia.clientId} tenía que ser alcanzable`);
    assert.equal(abierto?.ctx.origen, "sesion");
  }
});

test("armarContexto RECHAZA un cockpit ajeno — es el 403 de la fachada y el redirect de las páginas", () => {
  assert.equal(armarContexto(jero, { id: "i-30x-reels", clientId: "30x" }), null);
  assert.equal(armarContexto(jefeDeEstadox, { id: "i-retia-reels", clientId: "retia" }), null);
});

test("el dueño arma contexto en cualquier cockpit", () => {
  const abierto = armarContexto(mani, { id: "i-estadox-reels", clientId: "estadox" });
  assert.equal(abierto?.ctx.clientId, "estadox");
  assert.equal(abierto?.rol, ROL_DE_DUENO);
});
