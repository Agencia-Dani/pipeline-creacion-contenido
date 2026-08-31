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
  admiteVeredictoIA,
  conUnidad,
  cuentasSinAporte,
  disparoLegible,
  ejecucionN8n,
  fallo,
  lineasPorProyecto,
  pasosDe,
  resumenCorto,
  veredicto,
  veredictoIA,
  workflowDe,
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
  params: { workflow: "motor" },
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

// ── La pantalla de corridas ───────────────────────────────────────────────────
//
// Los fixtures son **payloads reales de prod** (medidos el 2026-08-31 contra `public.runs`), no
// inventados: la corrida `ok` del motor del 31/08 04:30, la que falló el 21/08 y las de las otras
// tres máquinas. Es lo que hace que estos tests digan algo — la forma de `metricas` no está
// declarada en ningún schema (es jsonb libre), así que un fixture inventado testearía la forma que
// yo imaginé y no la que el motor escribe.

const METRICAS_MOTOR_31_08 = {
  gate: 63,
  avisos: [],
  outputs: 32,
  pretrim: 1682,
  apify_ig: 520,
  apify_tt: 1,
  llamadas: { supadata: 90, haiku_lotes_gate: 15, haiku_traducciones: 69, haiku_lotes_pretrim: 4 },
  asignados: 1737,
  filtrados: 336,
  sin_guion: 18,
  colectados: 520,
  por_proyecto: {
    a: { nombre: "Ansiedad", evaluados: 90, gate_pass: 8, sin_guion: 18, tasa_gate: 0.11, entregados: 1, n_objetivo: 20, razon_faltante: "mixta" },
    b: { nombre: "Psicología", evaluados: 70, gate_pass: 32, sin_guion: 13, tasa_gate: 0.56, entregados: 20, n_objetivo: 20, razon_faltante: null },
  },
  por_referente: {
    "the.holistic.psychologist": { evaluados: 10, gate_pass: 9 },
    "modern.day.psychologist": { evaluados: 15, gate_pass: 0 },
    jenniferanncounseling: { evaluados: 10, gate_pass: 0 },
  },
  registro_dedup: "ok",
  descartes_expuestos: 10,
  transcripciones_vacias: 18,
};

const corridaOk = corrida({
  id: "r-ok",
  estado: "ok",
  fin: "2026-08-31T04:43:11Z",
  trigger_type: "on_demand",
  metricas: METRICAS_MOTOR_31_08,
  params: { workflow: "motor", execution_id: "151" },
});

describe("workflowDe / ejecucionN8n", () => {
  it("saca la máquina y la ejecución de params", () => {
    assert.equal(workflowDe(corridaOk), "motor");
    assert.equal(ejecucionN8n(corridaOk), "151");
  });

  it("una corrida vieja sin execution_id no inventa una", () => {
    const vieja = corrida({ params: { workflow: "motor" } });
    assert.equal(ejecucionN8n(vieja), null);
  });

  it("un workflow que no es de los cuatro no pasa por workflow válido", () => {
    assert.equal(workflowDe(corrida({ params: { workflow: "inventado" } })), null);
    assert.equal(workflowDe(corrida({ params: null })), null);
  });
});

describe("pasosDe", () => {
  it("el motor cuenta videos y revisiones, y lo DICE", () => {
    const pasos = pasosDe("motor", corridaOk);
    const bajo = pasos.find((p) => p.etiqueta.startsWith("Bajó"));
    const reparto = pasos.find((p) => p.etiqueta.startsWith("Los repartió"));
    // Es el corazón de por qué el embudo global se veía "de dev": 1.682 sale de 520 sin que
    // nadie haya bajado más videos, porque un video se evalúa en cada proyecto que lo reclama.
    assert.deepEqual([bajo?.valor, bajo?.unidad], [520, "videos"]);
    assert.deepEqual([reparto?.valor, reparto?.unidad], [1682, "revisiones"]);
  });

  it("marca las transcripciones vacías como nota del paso que las produjo", () => {
    const escuchar = pasosDe("motor", corridaOk).find((p) => p.etiqueta.startsWith("Alcanzó"));
    assert.equal(escuchar?.valor, 90);
    assert.match(escuchar?.nota ?? "", /18/);
  });

  it("cada máquina tiene sus propios pasos, no una plantilla común", () => {
    const arch = pasosDe("archivado", corrida({ metricas: { archivados: 67 } }));
    assert.deepEqual(arch.map((p) => [p.etiqueta, p.valor]), [["Mandó a Históricos", 67]]);

    const desc = pasosDe(
      "descubrimiento",
      corrida({ metricas: { semillas: 8, sugeridos_unicos: 71, detalle: 20, propuestos: 7, promovidos: 0 } }),
    );
    assert.deepEqual(desc.map((p) => p.valor), [8, 71, 20, 7, 0]);
  });

  it("una corrida sin métricas no dibuja pasos inventados", () => {
    assert.deepEqual(pasosDe("motor", corrida({ metricas: null })), []);
  });

  it("un paso que la corrida no registró no aparece, y no aparece como cero", () => {
    // "no se registró" y "fue cero" son cosas distintas: un cero fabricado se lee como un hecho.
    const parcial = pasosDe("motor", corrida({ metricas: { colectados: 100 } }));
    assert.deepEqual(parcial.map((p) => p.etiqueta), ["Bajó de las cuentas"]);
  });
});

describe("lineasPorProyecto", () => {
  it("redacta el diagnóstico a partir de razon_faltante, sin re-diagnosticar", () => {
    const lineas = lineasPorProyecto(corridaOk);
    const ansiedad = lineas.find((l) => l.nombre === "Ansiedad");
    assert.deepEqual([ansiedad?.miro, ansiedad?.gustaron, ansiedad?.entrego, ansiedad?.pide], [90, 8, 1, 20]);
    assert.match(ansiedad?.diagnostico ?? "", /Faltan cuentas y además el criterio/);
    assert.equal(ansiedad?.tono, "aviso");
  });

  it("el que llenó su pedido queda en bien y sin sermón", () => {
    const psico = lineasPorProyecto(corridaOk).find((l) => l.nombre === "Psicología");
    assert.equal(psico?.tono, "bien");
    assert.equal(psico?.diagnostico, "Completo.");
  });

  it("entregar CERO es peor que entregar poco, y se pinta distinto", () => {
    const enCero = corrida({
      metricas: {
        por_proyecto: {
          x: { nombre: "Depresión", evaluados: 87, gate_pass: 4, entregados: 0, n_objetivo: 20, razon_faltante: "mixta" },
        },
      },
    });
    assert.equal(lineasPorProyecto(enCero)[0].tono, "malo");
  });
});

describe("cuentasSinAporte", () => {
  it("nombra las cuentas que miró y de las que no le sirvió nada, la peor primero", () => {
    assert.deepEqual(cuentasSinAporte(corridaOk), [
      { handle: "modern.day.psychologist", miro: 15 },
      { handle: "jenniferanncounseling", miro: 10 },
    ]);
  });

  it("una cuenta con cero videos evaluados NO es una cuenta que no aportó", () => {
    // No aportó porque la corrida ni llegó a mirarla: es otro problema y otra palanca.
    const c = corrida({ metricas: { por_referente: { nadie: { evaluados: 0, gate_pass: 0 } } } });
    assert.deepEqual(cuentasSinAporte(c), []);
  });
});

describe("fallo", () => {
  // El string real que escribió el error handler el 2026-08-21, tal cual está en prod.
  const CRUDO =
    "[Workflow - Shortform Content] Bad request - please check your parameters · nodo: POST Candidatos · https://ejemplo.app/workflow/K7T1/executions/136";

  it("desarma el string del error handler en sus tres partes", () => {
    const f = fallo(corrida({ estado: "fallo", error: CRUDO }));
    assert.equal(f?.nodo, "POST Candidatos");
    assert.equal(f?.url, "https://ejemplo.app/workflow/K7T1/executions/136");
    assert.equal(f?.mensaje, "[Workflow - Shortform Content] Bad request - please check your parameters");
  });

  it("un error del barrido de zombies no tiene nodo ni URL, y no se los inventa", () => {
    const f = fallo(
      corrida({ estado: "fallo", error: "run de motor sin cerrar (fallo antes de Cerrar run); barrido por corrida posterior" }),
    );
    assert.equal(f?.nodo, null);
    assert.equal(f?.url, null);
    assert.match(f?.mensaje ?? "", /sin cerrar/);
  });

  it("un fallo sin mensaje lo dice en vez de dibujar un vacío", () => {
    assert.equal(fallo(corrida({ estado: "fallo", error: null }))?.mensaje, "Se cayó sin dejar mensaje.");
  });

  it("una corrida que salió bien no tiene fallo", () => {
    assert.equal(fallo(corridaOk), null);
  });
});

describe("veredicto", () => {
  it("nombra el cuello cuando el corte lo puso la transcripción y no el criterio", () => {
    // 336 calientes → 90 escuchados es 27%: por debajo de la mitad, así que la palanca no es
    // aflojar criterios. Es la lectura que la pantalla vieja no daba.
    const frases = veredicto("motor", corridaOk).join(" ");
    assert.match(frases, /Entregó 32 de 40 pedidos/);
    assert.match(frases, /solo alcanzó a escuchar 90/);
    assert.match(frases, /2 de las cuentas/);
  });

  it("una corrida fallida dice que no queda registro, en vez de dibujar ceros", () => {
    // 🩸 Las 12 corridas fallidas de prod tienen `metricas` en NULL, las 12: `Resumen del run` es
    // el último nodo, así que morir antes es no anotar nada.
    const frases = veredicto("motor", corrida({ estado: "fallo", metricas: null }));
    assert.match(frases.join(" "), /se cayó antes de poder anotar/i);
  });

  it("arrastra los avisos que el propio motor se dejó escritos", () => {
    const c = corrida({ estado: "ok", metricas: { outputs: 1, avisos: ["posible caida de Supadata"] } });
    assert.ok(veredicto("motor", c).some((f) => f.includes("Supadata")));
  });
});

describe("veredictoIA", () => {
  it("lee el texto guardado dentro de metricas", () => {
    const c = corrida({ estado: "ok", metricas: { veredicto_ia: { texto: "Le fue bien.", cuando: "2026-08-31T10:00:00Z" } } });
    assert.equal(veredictoIA(c)?.texto, "Le fue bien.");
  });

  it("un texto vacío es lo mismo que no tenerlo", () => {
    assert.equal(veredictoIA(corrida({ metricas: { veredicto_ia: { texto: "   " } } })), null);
    assert.equal(veredictoIA(corridaOk), null);
  });

  it("no se le pide veredicto a una corrida viva: su metricas todavía la escribe el motor", () => {
    assert.equal(admiteVeredictoIA(corrida({ estado: "en_curso" })), false);
    assert.equal(admiteVeredictoIA(corridaOk), true);
    assert.equal(admiteVeredictoIA(corrida({ estado: "fallo" })), true);
  });
});

describe("resumenCorto", () => {
  it("cada máquina resume con su propia unidad", () => {
    assert.equal(resumenCorto("motor", corridaOk), "32 al feed");
    assert.equal(resumenCorto("archivado", corrida({ metricas: { archivados: 67 } })), "67 archivados");
    assert.equal(resumenCorto("descubrimiento", corrida({ metricas: { propuestos: 7 } })), "7 propuestas");
    assert.equal(resumenCorto("transcriptor", corrida({ metricas: { listos: 1 } })), "1 guion");
  });

  it("sin métricas no resume nada, en vez de decir cero", () => {
    assert.equal(resumenCorto("motor", corrida({ metricas: null })), null);
  });
});

describe("conUnidad / disparoLegible", () => {
  it("una unidad en singular cuando hay uno solo", () => {
    assert.equal(conUnidad(1, "enlaces"), "1 enlace");
    assert.equal(conUnidad(2, "enlaces"), "2 enlaces");
    assert.equal(conUnidad(1, "videos"), "1 video");
    assert.equal(conUnidad(0, "videos"), "0 videos");
    assert.equal(conUnidad(5, null), "5");
  });

  it("🩸 el transcriptor NO corre en n8n, así que no puede decir 'manual (n8n)'", () => {
    // `DISPARO_LEGIBLE` nació cuando toda corrida era de n8n. El transcriptor corre en el propio
    // cockpit (ADR-062): la etiqueta correcta depende de qué máquina es.
    assert.equal(disparoLegible("transcriptor", "manual"), "pegando enlaces");
    assert.equal(disparoLegible("motor", "manual"), "manual (n8n)");
    assert.equal(disparoLegible("motor", "cron"), "cron semanal");
  });

  it("un disparo desconocido se muestra crudo en vez de desaparecer", () => {
    assert.equal(disparoLegible("motor", "inventado"), "inventado");
  });

  it("un guion es un guion, no 'guiones'", () => {
    assert.equal(resumenCorto("transcriptor", corrida({ metricas: { listos: 1 } })), "1 guion");
    assert.equal(resumenCorto("transcriptor", corrida({ metricas: { listos: 3 } })), "3 guiones");
  });
});
