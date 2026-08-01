import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  agrupar,
  camposDeCalificacion,
  contarPorFiltro,
  esCalificacion,
  esVeredicto,
  estadoDe,
  ordenarDescartes,
  pasaFiltro,
  SIN_PROYECTO,
  type Calificacion,
  type Veredicto,
} from "./feed.ts";

const cand = (id: string, extra: Partial<{ proyecto: string; heat: number | null; calificacion: Calificacion | null }> = {}) => ({
  id,
  proyecto: extra.proyecto ?? "Ventas",
  heat: extra.heat === undefined ? 0.5 : extra.heat,
  calificacion: extra.calificacion ?? null,
});

describe("estadoDe — la derivación de ADR-034", () => {
  it("🔥 y 👍 son los dos aprobado", () => {
    assert.equal(estadoDe("🔥"), "aprobado");
    assert.equal(estadoDe("👍"), "aprobado");
  });

  it("👎 es descartado", () => {
    assert.equal(estadoDe("👎"), "descartado");
  });

  it("nunca deriva a `nuevo`: calificar ES decidir", () => {
    for (const c of ["🔥", "👍", "👎"] as const) {
      assert.notEqual(estadoDe(c), "nuevo");
    }
  });

  it("camposDeCalificacion manda SIEMPRE los dos campos juntos", () => {
    // Si alguna vez se escribiera solo `calificacion`, el archivado no levantaría el candidato
    // (filtra `NOT estado='nuevo'`) y el barrido de 20 días lo purgaría sin archivar: es
    // exactamente el agujero del 14% que ADR-034 vino a cerrar.
    assert.deepEqual(camposDeCalificacion("🔥"), { calificacion: "🔥", estado: "aprobado" });
    assert.deepEqual(camposDeCalificacion("👎"), { calificacion: "👎", estado: "descartado" });
  });

  it("esCalificacion rechaza lo que no es un emoji del vocabulario", () => {
    assert.ok(esCalificacion("👍"));
    assert.ok(!esCalificacion("aprobado"));
    assert.ok(!esCalificacion("👌"));
    assert.ok(!esCalificacion(null));
  });
});

describe("pasaFiltro", () => {
  it("sin-calificar es exactamente lo que no tiene emoji", () => {
    assert.ok(pasaFiltro({ calificacion: null }, "sin-calificar"));
    assert.ok(!pasaFiltro({ calificacion: "👎" }, "sin-calificar"));
  });

  it("🔥 vive DENTRO de aprobados: es un aprobado ejemplar, no una tercera clase", () => {
    assert.ok(pasaFiltro({ calificacion: "🔥" }, "aprobados"));
    assert.ok(pasaFiltro({ calificacion: "👍" }, "aprobados"));
    assert.ok(!pasaFiltro({ calificacion: "👎" }, "aprobados"));
  });

  it("el filtro 🔥 es solo los ejemplares", () => {
    assert.ok(pasaFiltro({ calificacion: "🔥" }, "fuego"));
    assert.ok(!pasaFiltro({ calificacion: "👍" }, "fuego"));
  });

  it("todos incluye lo no calificado", () => {
    assert.ok(pasaFiltro({ calificacion: null }, "todos"));
  });

  it("contarPorFiltro cuenta el 🔥 dos veces: en fuego y en aprobados", () => {
    const cuenta = contarPorFiltro([
      { calificacion: null },
      { calificacion: "🔥" },
      { calificacion: "👍" },
      { calificacion: "👎" },
    ]);
    assert.deepEqual(cuenta, { "sin-calificar": 1, fuego: 1, aprobados: 2, todos: 4 });
  });
});

describe("agrupar", () => {
  it("agrupa por proyecto y ordena por heat descendente adentro", () => {
    const grupos = agrupar([
      cand("a", { proyecto: "Ventas", heat: 0.3 }),
      cand("b", { proyecto: "Ventas", heat: 0.9 }),
      cand("c", { proyecto: "Comunicación", heat: 0.5 }),
    ]);
    assert.deepEqual(
      grupos.map((g) => g.proyecto),
      ["Comunicación", "Ventas"],
    );
    assert.deepEqual(grupos[1].candidatos.map((c) => c.id), ["b", "a"]);
  });

  it("el orden es estable: los empates de heat se rompen por id, no por azar", () => {
    // La lección del corte 3/4: un orden que depende de cómo vino la lista cambia solo.
    const entrada = [
      cand("z", { heat: 0.5 }),
      cand("a", { heat: 0.5 }),
      cand("m", { heat: 0.5 }),
    ];
    const primera = agrupar(entrada)[0].candidatos.map((c) => c.id);
    const segunda = agrupar([...entrada].reverse())[0].candidatos.map((c) => c.id);
    assert.deepEqual(primera, ["a", "m", "z"]);
    assert.deepEqual(primera, segunda);
  });

  it("un heat nulo no se cuela arriba", () => {
    const grupo = agrupar([cand("a", { heat: null }), cand("b", { heat: 0.1 })])[0];
    assert.deepEqual(grupo.candidatos.map((c) => c.id), ["b", "a"]);
  });

  it("(sin proyecto) va último: es un dato roto, no una categoría", () => {
    const grupos = agrupar([
      cand("a", { proyecto: "" }),
      cand("b", { proyecto: "Ventas" }),
      cand("c", { proyecto: "Comunicación" }),
    ]);
    assert.deepEqual(
      grupos.map((g) => g.proyecto),
      ["Comunicación", "Ventas", SIN_PROYECTO],
    );
  });

  it("no muta la lista que recibe", () => {
    const entrada = [cand("z", { heat: 0.1 }), cand("a", { heat: 0.9 })];
    const copia = entrada.map((c) => c.id);
    agrupar(entrada);
    assert.deepEqual(entrada.map((c) => c.id), copia);
  });
});

describe("descartes", () => {
  const desc = (id: string, relevanciaScore: number | null, veredicto: Veredicto | null = null) => ({
    id,
    relevanciaScore,
    veredicto,
  });

  it("lo sin auditar va primero: es lo que se pierde el domingo", () => {
    const orden = ordenarDescartes([
      desc("a", 0.9, "bien descartado"),
      desc("b", 0.2),
      desc("c", 0.5),
    ]).map((d) => d.id);
    assert.deepEqual(orden, ["c", "b", "a"]);
  });

  it("entre pendientes gana el near-miss (score más alto)", () => {
    const orden = ordenarDescartes([desc("a", 0.1), desc("b", 0.58), desc("c", 0.3)]).map((d) => d.id);
    assert.deepEqual(orden, ["b", "c", "a"]);
  });

  it("esVeredicto solo acepta el vocabulario que el archivado cuenta", () => {
    assert.ok(esVeredicto("era bueno"));
    assert.ok(esVeredicto("bien descartado"));
    assert.ok(!esVeredicto("falso negativo"));
    assert.ok(!esVeredicto(""));
  });

  it("no muta la lista que recibe", () => {
    const entrada = [desc("a", 0.1), desc("b", 0.9)];
    ordenarDescartes(entrada);
    assert.deepEqual(entrada.map((d) => d.id), ["a", "b"]);
  });
});
