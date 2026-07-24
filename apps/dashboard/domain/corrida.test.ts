import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  armarVistaOperar,
  duracionLegible,
  embudoPorProyecto,
  entregaLegible,
  haceCuanto,
  hayCorridaViva,
  ultimoEmbudo,
  type Corrida,
} from "./corrida.ts";

const voces = [
  { id: "vozA", nombre: "Cora" },
  { id: "vozB", nombre: "Alma" },
];

describe("armarVistaOperar", () => {
  it("agrupa por voz y resuelve N contra el default (vacío y 0 usan el global)", () => {
    const vista = armarVistaOperar(
      voces,
      [
        { id: "p1", nombre: "Trading Psychology", n: 20, vozId: "vozA" },
        { id: "p2", nombre: "Trading fast tips", n: null, vozId: "vozA" },
        { id: "p3", nombre: "Ventas", n: 0, vozId: "vozB" },
      ],
      100,
    );
    assert.equal(vista.porVoz.length, 2);
    const [cora, alma] = vista.porVoz;
    assert.deepEqual(
      cora.proyectos.map((p) => [p.nombre, p.n, p.nEsDefault]),
      [
        ["Trading Psychology", 20, false],
        ["Trading fast tips", 100, true],
      ],
    );
    assert.deepEqual(alma.proyectos.map((p) => [p.n, p.nEsDefault]), [[100, true]]);
  });

  it("un proyecto de voz apagada (o sin voz) NO corre y se reporta", () => {
    const vista = armarVistaOperar(
      [{ id: "vozA", nombre: "Cora" }], // vozB no vino: está apagada
      [
        { id: "p1", nombre: "Corre", n: 5, vozId: "vozA" },
        { id: "p2", nombre: "Voz apagada", n: 5, vozId: "vozB" },
        { id: "p3", nombre: "Sin voz", n: 5, vozId: null },
      ],
      100,
    );
    assert.deepEqual(vista.porVoz.map((g) => g.voz.nombre), ["Cora"]);
    assert.deepEqual(vista.noCorren, ["Voz apagada", "Sin voz"]);
  });

  it("una voz activa sin proyectos activos no aparece", () => {
    const vista = armarVistaOperar(voces, [
      { id: "p1", nombre: "Solo Cora", n: 5, vozId: "vozA" },
    ], 100);
    assert.deepEqual(vista.porVoz.map((g) => g.voz.nombre), ["Cora"]);
  });
});

const corrida = (extra: Partial<Corrida>): Corrida => ({
  id: "r1",
  inicio: "2026-07-20T08:00:00Z",
  fin: null,
  estado: "en_curso",
  trigger_type: "cron",
  metricas: null,
  error: null,
  ...extra,
});

describe("hayCorridaViva", () => {
  const ahora = new Date("2026-07-20T09:00:00Z");

  it("en_curso dentro de la ventana → viva", () => {
    assert.equal(hayCorridaViva([corrida({})], ahora), true);
  });

  it("en_curso más vieja que la ventana → colgada, no viva (misma regla que el guard)", () => {
    const vieja = corrida({ inicio: "2026-07-20T06:00:00Z" });
    assert.equal(hayCorridaViva([vieja], ahora), false);
  });

  it("terminadas no cuentan", () => {
    const ok = corrida({ estado: "ok", fin: "2026-07-20T08:30:00Z" });
    assert.equal(hayCorridaViva([ok], ahora), false);
  });
});

describe("lecturas legibles", () => {
  const ahora = new Date("2026-07-20T09:30:00Z");

  it("duración con fin, sin fin (usa ahora), y horas", () => {
    assert.equal(duracionLegible("2026-07-20T08:00:00Z", "2026-07-20T08:42:00Z", ahora), "42 min");
    assert.equal(duracionLegible("2026-07-20T09:00:00Z", null, ahora), "30 min");
    assert.equal(duracionLegible("2026-07-20T08:00:00Z", "2026-07-20T09:05:00Z", ahora), "1 h 5 min");
    assert.equal(duracionLegible("2026-07-20T09:29:30Z", null, ahora), "menos de 1 min");
  });

  it("haceCuanto", () => {
    assert.equal(haceCuanto("2026-07-20T09:29:40Z", ahora), "recién");
    assert.equal(haceCuanto("2026-07-20T09:00:00Z", ahora), "hace 30 min");
    assert.equal(haceCuanto("2026-07-20T06:30:00Z", ahora), "hace 3 h");
    assert.equal(haceCuanto("2026-07-17T09:30:00Z", ahora), "hace 3 días");
  });

  it("entrega sale de metricas.outputs; sin métricas no inventa", () => {
    assert.equal(entregaLegible(corrida({ metricas: { outputs: 16 } })), "entregó 16 candidatos");
    assert.equal(entregaLegible(corrida({ metricas: { outputs: 1 } })), "entregó 1 candidato");
    assert.equal(entregaLegible(corrida({})), null);
  });
});

describe("embudoPorProyecto", () => {
  const conEmbudo = corrida({
    metricas: {
      por_proyecto: {
        recTP: { nombre: "Trading Psychology", n_objetivo: 30, evaluados: 40, sin_guion: 5, gate_pass: 15, tasa_gate: 0.43, entregados: 15, razon_faltante: "supply" },
        recTFT: { nombre: "Trading fast tips", n_objetivo: 40, evaluados: 60, sin_guion: 3, gate_pass: 16, tasa_gate: 0.28, entregados: 16, razon_faltante: "mixta" },
      },
    },
  });

  it("parsea por_proyecto y devuelve una fila por proyecto", () => {
    const filas = embudoPorProyecto(conEmbudo);
    assert.equal(filas.length, 2);
    const tp = filas.find((f) => f.nombre === "Trading Psychology")!;
    assert.equal(tp.nObjetivo, 30);
    assert.equal(tp.entregados, 15);
    assert.equal(tp.tasaGate, 0.43);
    assert.equal(tp.razonFaltante, "supply");
  });

  it("una corrida sin por_proyecto (vieja) devuelve []", () => {
    assert.deepEqual(embudoPorProyecto(corrida({ metricas: { outputs: 10 } })), []);
    assert.deepEqual(embudoPorProyecto(corrida({})), []);
  });

  it("razon_faltante inválida cae a null; tasa_gate ausente cae a null", () => {
    const c = corrida({ metricas: { por_proyecto: { r1: { nombre: "X", razon_faltante: "otra", entregados: 5 } } } });
    const [fila] = embudoPorProyecto(c);
    assert.equal(fila.razonFaltante, null);
    assert.equal(fila.tasaGate, null);
  });

  it("ultimoEmbudo toma la corrida más reciente que trae embudo", () => {
    const vieja = corrida({ id: "vieja", metricas: { outputs: 3 } });
    const encontrado = ultimoEmbudo([vieja, conEmbudo]);
    assert.equal(encontrado?.corrida.id, conEmbudo.id);
    assert.equal(encontrado?.filas.length, 2);
    assert.equal(ultimoEmbudo([vieja]), null);
  });
});
