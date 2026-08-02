import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarContexto,
  instanciasVisibles,
  PROFUNDIDAD_MAXIMA,
  puedeVerCliente,
  puedeVerInstancia,
  visiblesDesde,
  type NodoCliente,
  type TenantContext,
} from "./tenant.ts";

// El árbol del caso real de ADR-046: tres empresas sin padre y un cliente de Retia.
const ARBOL: NodoCliente[] = [
  { id: "30x", parentId: null },
  { id: "estadox", parentId: null },
  { id: "retia", parentId: null },
  { id: "viera", parentId: "retia" },
];

const ctx = (clientId: string, instanceId = "i-1"): TenantContext => ({
  clientId,
  visibles: visiblesDesde(clientId, ARBOL),
  instanceId,
});

test("sin padre, un cliente se ve solo a sí mismo", () => {
  assert.deepEqual(visiblesDesde("30x", ARBOL), ["30x"]);
  assert.deepEqual(visiblesDesde("estadox", ARBOL), ["estadox"]);
});

test("el padre ve al hijo — el segundo nivel es una fila, no una migración (ADR-046)", () => {
  assert.deepEqual(visiblesDesde("retia", ARBOL), ["retia", "viera"]);
});

test("la visibilidad BAJA, no sube: el hijo no ve al padre ni a sus tíos", () => {
  assert.deepEqual(visiblesDesde("viera", ARBOL), ["viera"]);
  assert.equal(puedeVerCliente(ctx("viera"), "retia"), false);
  assert.equal(puedeVerCliente(ctx("viera"), "30x"), false);
});

test("las empresas no se ven entre sí", () => {
  assert.equal(puedeVerCliente(ctx("30x"), "estadox"), false);
  assert.equal(puedeVerCliente(ctx("estadox"), "30x"), false);
  assert.equal(puedeVerCliente(ctx("30x"), "30x"), true);
});

test("baja varios niveles, no solo uno", () => {
  const cadena: NodoCliente[] = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: "c" },
  ];
  assert.deepEqual(visiblesDesde("a", cadena).sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(visiblesDesde("c", cadena).sort(), ["c", "d"]);
});

// ── Los ciclos: el trigger de la `016` los rechaza al escribir, pero si alguno entra por otra
// vía esto NO puede colgar el request (ADR-046, y por eso existe PROFUNDIDAD_MAXIMA).

test("un ciclo A→B→A no cuelga y no repite ids", () => {
  const ciclo: NodoCliente[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  const visibles = visiblesDesde("a", ciclo);
  assert.deepEqual(visibles.sort(), ["a", "b"]);
  assert.equal(new Set(visibles).size, visibles.length);
});

test("un cliente que es su propio padre no se duplica", () => {
  assert.deepEqual(visiblesDesde("x", [{ id: "x", parentId: "x" }]), ["x"]);
});

test("una cadena más profunda que el tope se corta en vez de colgar", () => {
  const larga: NodoCliente[] = Array.from({ length: PROFUNDIDAD_MAXIMA + 5 }, (_, i) => ({
    id: `n${i}`,
    parentId: i === 0 ? null : `n${i - 1}`,
  }));
  const visibles = visiblesDesde("n0", larga);
  assert.equal(visibles.length, PROFUNDIDAD_MAXIMA + 1);
  assert.equal(visibles[0], "n0");
});

// ── Instancias

test("puedeVerInstancia pregunta por el CLIENTE de la instancia, no por la que está abierta", () => {
  const c = ctx("retia", "i-reels-retia");
  // Otra instancia de la misma empresa: la puede abrir aunque no sea la que tiene abierta.
  assert.equal(puedeVerInstancia(c, { id: "i-linkedin-retia", clientId: "retia" }), true);
  // Una del hijo: también, porque la visibilidad baja.
  assert.equal(puedeVerInstancia(c, { id: "i-reels-viera", clientId: "viera" }), true);
  // Una de otra empresa: no.
  assert.equal(puedeVerInstancia(c, { id: "i-reels-30x", clientId: "30x" }), false);
});

test("instanciasVisibles filtra la lista del selector", () => {
  const todas = [
    { id: "i1", clientId: "retia" },
    { id: "i2", clientId: "viera" },
    { id: "i3", clientId: "30x" },
  ];
  assert.deepEqual(
    instanciasVisibles(ctx("retia"), todas).map((i) => i.id),
    ["i1", "i2"],
  );
  assert.deepEqual(instanciasVisibles(ctx("viera"), todas).map((i) => i.id), ["i2"]);
});

// ── armarContexto: el borde donde se rechaza una instancia ajena

test("armarContexto arma el contexto de una instancia propia", () => {
  const c = armarContexto("retia", { id: "i-1", clientId: "retia" }, ARBOL);
  assert.deepEqual(c, { clientId: "retia", visibles: ["retia", "viera"], instanceId: "i-1" });
});

test("armarContexto acepta una instancia de un descendiente", () => {
  const c = armarContexto("retia", { id: "i-2", clientId: "viera" }, ARBOL);
  assert.equal(c?.instanceId, "i-2");
});

test("armarContexto RECHAZA una instancia ajena — es el 403 de la fachada (ADR-048)", () => {
  assert.equal(armarContexto("30x", { id: "i-3", clientId: "estadox" }, ARBOL), null);
  // Y hacia arriba tampoco: el hijo no puede abrir el cockpit del padre.
  assert.equal(armarContexto("viera", { id: "i-4", clientId: "retia" }, ARBOL), null);
});
