import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  armarRunPlan,
  armarRunPlanCompleto,
  RUN_PLAN_VERSION,
  type Registro,
} from "./run-plan.ts";

const ahora = new Date("2026-07-20T08:00:00Z");
const reg = (id: string, fields: Registro["fields"]): Registro => ({ id, fields });

describe("armarRunPlan (ADR-028)", () => {
  it("proyecto activo de voz apagada NO entra; N vacía o 0 se resuelve con el ajuste global", () => {
    const plan = armarRunPlan(
      {
        voces: [reg("vozA", { nombre: "Cora", activo: true })],
        proyectos: [
          reg("p1", { nombre: "TP", voz_default: ["vozA"], N: 20 }),
          reg("p2", { nombre: "TfT", voz_default: ["vozA"] }),
          reg("p3", { nombre: "N cero", voz_default: ["vozA"], N: 0 }),
          reg("p4", { nombre: "voz apagada", voz_default: ["vozMuerta"], N: 5 }),
          reg("p5", { nombre: "sin voz", N: 5 }),
        ],
        referentes: [reg("r1", { handle: "@a", activo: true })],
        ajustes: [reg("a1", { clave: "Candidatos por corrida", valor: 30 })],
      },
      ahora,
    );
    assert.deepEqual(
      plan.proyectos.map((p) => [p.fields.nombre, p.fields.N]),
      [["TP", 20], ["TfT", 30], ["N cero", 30]],
    );
    assert.equal(plan.version, RUN_PLAN_VERSION);
    assert.equal(plan.generado_en, "2026-07-20T08:00:00.000Z");
  });

  it("sin fila de ajuste (o valor no numérico) la N default es 100, fail-open como el AJUSTE_MAP", () => {
    const plan = armarRunPlan(
      {
        voces: [reg("vozA", { nombre: "Cora" })],
        proyectos: [reg("p1", { nombre: "TP", voz_default: ["vozA"] })],
        referentes: [],
        ajustes: [reg("a1", { clave: "Candidatos por corrida" })],
      },
      ahora,
    );
    assert.equal(plan.proyectos[0].fields.N, 100);
  });

  it("ambito completo: pass-through total, sin gate de voz y con N tal cual", () => {
    const entrada = {
      voces: [reg("vozA", { nombre: "Apagada", activo: false })],
      proyectos: [reg("p1", { nombre: "Sin voz ni N" })],
      referentes: [reg("r1", { handle: "@inactivo" })],
      ajustes: [reg("a1", { clave: "Candidatos por corrida", valor: 30 })],
    };
    const plan = armarRunPlanCompleto(entrada, ahora);
    assert.equal(plan.version, RUN_PLAN_VERSION);
    assert.deepEqual(plan.proyectos, entrada.proyectos); // ni filtrado ni N resuelta
    assert.deepEqual(plan.voces, entrada.voces);
  });

  it("voces, referentes y ajustes pasan tal cual (el motor traduce claves con su AJUSTE_MAP)", () => {
    const voces = [reg("vozA", { nombre: "Cora", criterios_relevancia: "fit" })];
    const referentes = [reg("r1", { handle: "@a", plataforma: "instagram" })];
    const ajustes = [reg("a1", { clave: "Relevancia mínima", valor: 0.5 })];
    const plan = armarRunPlan({ voces, proyectos: [], referentes, ajustes }, ahora);
    assert.deepEqual(plan.voces, voces);
    assert.deepEqual(plan.referentes, referentes);
    assert.deepEqual(plan.ajustes, ajustes);
  });
});
