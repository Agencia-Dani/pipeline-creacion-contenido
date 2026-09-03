import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { calidadGlobal, diagnosticoCriterio, norteDeCorrida, norteHistorico } from "./entender.ts";
import type { Corrida, EmbudoProyecto } from "./corrida.ts";

// Los umbrales son los del nodo `Computar métricas semana` del archivado (ADR-021):
// null → sin datos · <0 invertido · <0.10 flojo · <0.20 mejorable · resto sano,
// + apéndice de ruido si separa (≥0.10) pero precision < 0.4.
describe("diagnosticoCriterio", () => {
  it("umbrales del archivado, 1:1", () => {
    assert.equal(diagnosticoCriterio(null, 0.9).nivel, "sin_datos");
    assert.equal(diagnosticoCriterio(-0.05, 0.9).nivel, "invertido");
    assert.equal(diagnosticoCriterio(0.05, 0.9).nivel, "flojo");
    assert.equal(diagnosticoCriterio(0.15, 0.9).nivel, "mejorable");
    assert.equal(diagnosticoCriterio(0.25, 0.9).nivel, "sano");
    // bordes exactos
    assert.equal(diagnosticoCriterio(0, 0.9).nivel, "flojo");
    assert.equal(diagnosticoCriterio(0.1, 0.9).nivel, "mejorable");
    assert.equal(diagnosticoCriterio(0.2, 0.9).nivel, "sano");
  });

  it("apéndice de ruido: solo si separa (≥0.10) y precision < 0.4", () => {
    const conRuido = diagnosticoCriterio(0.25, 0.3);
    assert.equal(conRuido.nivel, "sano");
    assert.match(conRuido.texto, /ruido \(precisión 30%\)/);

    // criterio flojo: el ruido no se agrega (el problema es otro)
    assert.doesNotMatch(diagnosticoCriterio(0.05, 0.1).texto, /ruido/);
    // precisión sana: sin apéndice
    assert.doesNotMatch(diagnosticoCriterio(0.25, 0.4).texto, /ruido/);
    // sin precisión no hay juicio de ruido
    assert.doesNotMatch(diagnosticoCriterio(0.25, null).texto, /ruido/);
  });
});

// El agregado semanal que Airtable tenía en la fila GLOBAL y el corte se había llevado.
describe("calidadGlobal", () => {
  const filas = [
    { calificados: 10, aprobados: 8, descartados: 2 },
    { calificados: 90, aprobados: 27, descartados: 63 },
  ];

  it("suma los conteos de todos los proyectos", () => {
    const g = calidadGlobal(filas);
    assert.equal(g.calificados, 100);
    assert.equal(g.aprobados, 35);
    assert.equal(g.descartados, 65);
  });

  // La razón por la que esta función existe en vez de un promedio en el JSX: las precisiones por
  // proyecto son 80% y 30%, cuyo promedio da 55%. La precisión real del total es 35%. Promediar
  // proporciones de volúmenes distintos da un número creíble y equivocado.
  it("recalcula la precisión desde las sumas, no promediando precisiones", () => {
    assert.equal(calidadGlobal(filas).precision, 0.35);
  });

  it("sin nada juzgado la precisión es null, que no es lo mismo que 0%", () => {
    assert.equal(calidadGlobal([{ calificados: 0, aprobados: 0, descartados: 0 }]).precision, null);
    assert.equal(calidadGlobal([]).precision, null);
  });
});

// ADR-089 (cierre 140): aprobados / N pedido, con calificados/entregados al lado para saber si el
// número es resultado o piso. Los casos son los medidos contra prod el 02/09 (handoff §cierre 140).
describe("norteDeCorrida", () => {
  const fila = (extra: Partial<EmbudoProyecto>): EmbudoProyecto => ({
    nombre: "Comunicación en empresas",
    nObjetivo: 15,
    evaluados: 350,
    sinGuion: 90,
    gatePass: 260,
    tasaGate: 1,
    entregados: 15,
    razonFaltante: null,
    ...extra,
  });

  it("cobertura alta (100%): es resultado, no piso — 02/09 14:14, 80,0%", () => {
    const [n] = norteDeCorrida([fila({})], new Map([
      ["Comunicación en empresas", { vistos: 15, calificados: 15, aprobados: 12 }],
    ]));
    assert.equal(n.norte, 0.8);
    assert.equal(n.coberturaCalificacion, 1);
    assert.equal(n.estado, "resultado");
  });

  it("cobertura baja (<80%): se marca PISO aunque los calificados sean todos aprobados — 02/09 16:11, 46,7%", () => {
    const [n] = norteDeCorrida([fila({})], new Map([
      ["Comunicación en empresas", { vistos: 7, calificados: 7, aprobados: 7 }],
    ]));
    assert.equal(Math.round(n.norte! * 1000) / 1000, 0.467);
    assert.equal(n.coberturaCalificacion, 7 / 15);
    assert.equal(n.estado, "piso");
  });

  it("cobertura exactamente en el umbral (80%) ya cuenta como resultado, no como piso", () => {
    const [n] = norteDeCorrida([fila({ entregados: 10 })], new Map([
      ["Comunicación en empresas", { vistos: 8, calificados: 8, aprobados: 8 }],
    ]));
    assert.equal(n.coberturaCalificacion, 0.8);
    assert.equal(n.estado, "resultado");
  });

  it("sin ninguna fila en app.candidatos pero con entrega: sin_dato, no 0% (probable archivado)", () => {
    const [n] = norteDeCorrida([fila({})], new Map());
    assert.equal(n.estado, "sin_dato");
    assert.equal(n.calificados, 0);
    // el norte SÍ se calcula (queda en 0) — es el `estado` el que avisa que no hay que leerlo así
    assert.equal(n.norte, 0);
  });

  it("sin entrega: no hay norte que leer, no se confunde con piso ni con sin_dato", () => {
    const [n] = norteDeCorrida([fila({ entregados: 0 })], new Map());
    assert.equal(n.estado, "sin_entrega");
    assert.equal(n.coberturaCalificacion, null);
  });

  it("proyecto que no pidió nada esa corrida (nObjetivo 0): norte null, no división por cero", () => {
    const [n] = norteDeCorrida(
      [fila({ nObjetivo: 0, entregados: 3 })],
      new Map([["Comunicación en empresas", { vistos: 3, calificados: 3, aprobados: 1 }]]),
    );
    assert.equal(n.norte, null);
  });
});

describe("norteHistorico", () => {
  const corrida = (extra: Partial<Corrida>): Corrida => ({
    id: "r1",
    inicio: "2026-09-02T14:14:11Z",
    fin: "2026-09-02T14:43:24Z",
    estado: "ok",
    trigger_type: "on_demand",
    metricas: null,
    error: null,
    params: { workflow: "motor" },
    ...extra,
  });

  const conEmbudo = corrida({
    id: "r-nueva",
    metricas: { por_proyecto: { p1: { nombre: "Comunicación en empresas", n_objetivo: 15, entregados: 15 } } },
  });
  const vieja = corrida({ id: "r-vieja", metricas: { outputs: 3 } }); // sin por_proyecto

  it("saltea corridas sin por_proyecto (anteriores a ADR-030), como ultimoEmbudo", () => {
    const historico = norteHistorico([vieja, conEmbudo], new Map());
    assert.equal(historico.length, 1);
    assert.equal(historico[0].corrida.id, "r-nueva");
  });

  it("respeta el límite sin contar las corridas salteadas contra él", () => {
    const historico = norteHistorico([vieja, conEmbudo, vieja, conEmbudo], new Map(), 1);
    assert.equal(historico.length, 1);
    assert.equal(historico[0].corrida.id, "r-nueva");
  });

  it("le pasa a cada corrida sus propios conteos, no los de otra", () => {
    const otraConEmbudo = corrida({
      id: "r-otra",
      metricas: { por_proyecto: { p1: { nombre: "Comunicación en empresas", n_objetivo: 15, entregados: 15 } } },
    });
    const conteos = new Map([
      ["r-nueva", new Map([["Comunicación en empresas", { vistos: 15, calificados: 15, aprobados: 12 }]])],
      ["r-otra", new Map([["Comunicación en empresas", { vistos: 7, calificados: 7, aprobados: 7 }]])],
    ]);
    const historico = norteHistorico([conEmbudo, otraConEmbudo], conteos);
    assert.equal(historico[0].filas[0].estado, "resultado");
    assert.equal(historico[1].filas[0].estado, "piso");
  });
});
