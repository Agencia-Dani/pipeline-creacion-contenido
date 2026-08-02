import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { calidadGlobal, diagnosticoCriterio } from "./entender.ts";

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
