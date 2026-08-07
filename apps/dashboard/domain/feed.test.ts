import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  agrupar,
  ajustarCuentas,
  camposDeCalificacion,
  condicionDeFiltro,
  esCalificacion,
  esFiltro,
  esVeredicto,
  estadoDe,
  FILTROS,
  ordenarDescartes,
  pasaFiltro,
  SIN_PROYECTO,
  type Calificacion,
  type Filtro,
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

  it("camposDeCalificacion manda SIEMPRE los tres campos juntos", () => {
    // Si alguna vez se escribiera solo `calificacion`, el archivado no levantaría el candidato
    // (filtra `NOT estado='nuevo'`) y el barrido de 20 días lo purgaría sin archivar: es
    // exactamente el agujero del 14% que ADR-034 vino a cerrar.
    const ahora = new Date("2026-08-01T15:04:05.000Z");
    assert.deepEqual(camposDeCalificacion("🔥", ahora), {
      calificacion: "🔥",
      estado: "aprobado",
      fecha_calificacion: "2026-08-01T15:04:05.000Z",
    });
    assert.deepEqual(camposDeCalificacion("👎", ahora), {
      calificacion: "👎",
      estado: "descartado",
      fecha_calificacion: "2026-08-01T15:04:05.000Z",
    });
  });

  it("camposDeCalificacion NUNCA deja fecha_calificacion sin llenar", () => {
    // Este test existe por un hallazgo de D7, no por paranoia. En Airtable la fecha era un campo
    // `lastModified` que se calculaba solo: ningún código la escribía. Al pasar a Postgres la
    // columna se queda sin autor, y de ella cuelga `outputs.calificado_en` → `v_metricas_calidad`,
    // que filtra `calificado_en is not null`. En NULL, la vista devuelve cero filas y la
    // precisión de entrega —la métrica norte de ADR-021— desaparece sin que nada falle.
    const campos = camposDeCalificacion("👍");
    assert.ok(campos.fecha_calificacion, "sin fecha, la analítica de calidad queda muda");
    assert.ok(!Number.isNaN(Date.parse(campos.fecha_calificacion)));
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

  it("los dos lados de cada filtro existen y no se contradicen", () => {
    // El punto del Record exhaustivo: un filtro nuevo tiene que traer sus DOS lados. Sin
    // condición solo puede quedarse "todos", que es el que a propósito no filtra nada.
    for (const f of FILTROS) {
      assert.equal(condicionDeFiltro(f) === null, f === "todos", `${f} sin decidir su condición`);
    }
  });

  it("esFiltro rechaza lo que no es un filtro — es la guardia del server action", () => {
    assert.ok(esFiltro("sin-calificar"));
    assert.ok(!esFiltro("aprobado"));
    assert.ok(!esFiltro(null));
  });
});

describe("ajustarCuentas — los contadores siguen siendo el avance, no la página", () => {
  const base: Record<Filtro, number> = {
    "sin-calificar": 165,
    fuego: 0,
    aprobados: 0,
    todos: 165,
  };

  it("aprobar con 🔥 lo saca de sin-calificar y lo suma a fuego Y a aprobados", () => {
    assert.deepEqual(ajustarCuentas(base, [{ antes: null, despues: "🔥" }]), {
      "sin-calificar": 164,
      fuego: 1,
      aprobados: 1,
      todos: 165,
    });
  });

  it("`todos` no se mueve nunca: calificar no crea ni borra candidatos", () => {
    const cambios = [
      { antes: null, despues: "👎" },
      { antes: null, despues: "👍" },
      { antes: "👍", despues: "🔥" },
    ] as const;
    assert.equal(ajustarCuentas(base, [...cambios]).todos, 165);
  });

  it("corregir un misclick 🔥→👎 devuelve las cuentas a donde estaban", () => {
    // El re-click ES el deshacer (plan-cockpit §D6.4), así que los contadores tienen que
    // acompañarlo. Un solo cambio por tarjeta, siempre desde la calificación ORIGINAL.
    assert.deepEqual(ajustarCuentas(base, [{ antes: null, despues: "👎" }]), {
      "sin-calificar": 164,
      fuego: 0,
      aprobados: 0,
      todos: 165,
    });
  });

  it("no muta la base que recibe", () => {
    const copia = { ...base };
    ajustarCuentas(base, [{ antes: null, despues: "🔥" }]);
    assert.deepEqual(base, copia);
  });
});

// 🗑️ Acá vivían los 5 tests del keyset (`cursorDe`/`despuesDe`), borrados el 2026-08-06 con la
// paginación: el mazo trae todo de una (ver `leerMazo`). No se pierde ningún invariante vivo —
// probaban una función que ya no existe.
//
// `contarPorFiltro` se había borrado antes, por lo contrario: contaba sobre la lista cargada
// cuando esa lista era una página. Su invariante —el 🔥 se cuenta dos veces, en `fuego` y en
// `aprobados`— sí sigue vivo, y lo sostienen `pasaFiltro` y el primer test de `ajustarCuentas`.

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
