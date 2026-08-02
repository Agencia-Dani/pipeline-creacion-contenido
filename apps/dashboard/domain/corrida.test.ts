import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  armarVistaOperar,
  pideMasQueElTecho,
  techoDeCrudos,
  duracionLegible,
  embudoPorProyecto,
  entregaLegible,
  haceCuanto,
  hayCorridaViva,
  ultimoEmbudo,
  VENTANA_CORRIDA_MIN,
  type Corrida,
} from "./corrida.ts";

const voces = [
  { id: "vozA", nombre: "Cora" },
  { id: "vozB", nombre: "Alma" },
];

describe("armarVistaOperar", () => {
  it("agrupa por voz; una fila vieja sin N muestra el número que el motor va a usar", () => {
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
      cora.proyectos.map((p) => [p.nombre, p.pide]),
      [
        ["Trading Psychology", 20],
        ["Trading fast tips", 100],
      ],
    );
    assert.deepEqual(alma.proyectos.map((p) => p.pide), [100]);
  });

  it("cruza el pedido con las cuentas que lo alimentan y con lo que entregó la última corrida", () => {
    const vista = armarVistaOperar(
      [{ id: "vozA", nombre: "Cora" }],
      [
        { id: "p1", nombre: "Comunicación de parejas", n: 15, vozId: "vozA" },
        { id: "p2", nombre: "Sin historia", n: 40, vozId: "vozA" },
      ],
      100,
      new Map([["p1", 3]]),
      [
        {
          nombre: "Comunicación de parejas",
          nObjetivo: 15,
          evaluados: 1,
          sinGuion: 0,
          gatePass: 1,
          tasaGate: 1,
          entregados: 1,
          razonFaltante: "supply",
        },
      ],
    );
    const [parejas, sinHistoria] = vista.porVoz[0].proyectos;
    assert.deepEqual(
      [parejas.pide, parejas.cuentas, parejas.ultimaEntrega, parejas.razonFaltante],
      [15, 3, 1, "supply"],
    );
    // Sin fila en el embudo, la entrega es `null` (todavía no hay historia) y NO 0: un cero
    // diría "corrió y no trajo nada", que es una afirmación distinta y podría ser falsa.
    assert.deepEqual(
      [sinHistoria.pide, sinHistoria.cuentas, sinHistoria.ultimaEntrega, sinHistoria.razonFaltante],
      [40, 0, null, null],
    );
  });

  it("el join con el embudo va por nombre: un proyecto renombrado queda sin historia, no con la ajena", () => {
    const vista = armarVistaOperar(
      [{ id: "vozA", nombre: "Cora" }],
      [{ id: "p1", nombre: "Nombre nuevo", n: 15, vozId: "vozA" }],
      100,
      new Map(),
      [
        {
          nombre: "Nombre viejo",
          nObjetivo: 15,
          evaluados: 80,
          sinGuion: 0,
          gatePass: 60,
          tasaGate: 0.75,
          entregados: 49,
          razonFaltante: null,
        },
      ],
    );
    assert.equal(vista.porVoz[0].proyectos[0].ultimaEntrega, null);
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
  // Los fixtures se derivan de la ventana, no de un hueco fijo: antes eran 60 min
  // contra una ventana de 120, y al bajarla a 45 el test se cayó por el fixture, no
  // por la regla. Así el caso sigue diciendo lo mismo cuando el número cambie.
  const haceMinutos = (m: number) =>
    corrida({ inicio: new Date(ahora.getTime() - m * 60_000).toISOString() });

  it("en_curso dentro de la ventana → viva", () => {
    assert.equal(hayCorridaViva([haceMinutos(VENTANA_CORRIDA_MIN - 1)], ahora), true);
  });

  it("en_curso más vieja que la ventana → colgada, no viva (misma regla que el guard)", () => {
    assert.equal(hayCorridaViva([haceMinutos(VENTANA_CORRIDA_MIN + 1)], ahora), false);
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

// ADR-043: el techo no es un pronóstico, es una multiplicación. La distinción importa porque
// `domain/corrida.ts` decidió a propósito NO estimar la entrega.
describe("techoDeCrudos", () => {
  it("es cuentas por resultados: 3 cuentas con el knob en 40 miran 120 videos", () => {
    assert.equal(techoDeCrudos(3, 40), 120);
  });

  it("sin cuentas el techo es 0, aunque el knob esté alto", () => {
    assert.equal(techoDeCrudos(0, 40), 0);
  });

  it("no devuelve negativos si algún dato viene roto", () => {
    assert.equal(techoDeCrudos(-2, 40), 0);
    assert.equal(techoDeCrudos(3, -40), 0);
  });
});

describe("pideMasQueElTecho", () => {
  it("pedir 50 con un techo de 120 no dispara el aviso", () => {
    assert.equal(pideMasQueElTecho(50, 120), false);
  });

  it("pedir 50 con un techo de 40 sí: no alcanza ni en el mejor caso", () => {
    assert.equal(pideMasQueElTecho(50, 40), true);
  });

  it("pedir exactamente el techo NO avisa: es alcanzable, aunque improbable", () => {
    assert.equal(pideMasQueElTecho(40, 40), false);
  });

  it("un proyecto sin cuentas siempre avisa", () => {
    assert.equal(pideMasQueElTecho(1, 0), true);
  });
});

describe("armarVistaOperar + techo", () => {
  it("calcula el techo de cada proyecto con sus propias cuentas", () => {
    const vista = armarVistaOperar(
      [{ id: "vozA", nombre: "Cora" }],
      [
        { id: "p1", nombre: "Con tres", n: 15, vozId: "vozA" },
        { id: "p2", nombre: "Sin cuentas", n: 15, vozId: "vozA" },
      ],
      40,
      new Map([["p1", 3]]),
    );
    assert.deepEqual(
      vista.porVoz[0].proyectos.map((p) => [p.nombre, p.cuentas, p.techo]),
      [
        ["Con tres", 3, 120],
        ["Sin cuentas", 0, 0],
      ],
    );
  });
});
