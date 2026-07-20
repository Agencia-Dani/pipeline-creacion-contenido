import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { diagnosticoCriterio } from "./entender.ts";

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
