import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  armarVistaBuscador,
  CAP_SEMILLAS,
  type ReferenteParaSembrar,
  type SenalPorReferente,
} from "./buscador.ts";

const EN_ALCANCE = new Set(["p1", "p2"]);

const ref = (extra: Partial<ReferenteParaSembrar> = {}): ReferenteParaSembrar => ({
  handle: "@cuenta",
  plataforma: "instagram",
  activo: true,
  proyectoIds: ["p1"],
  ...extra,
});

const KNOBS = { propuestasMax: 10, afinidadMinima: 0.6, descubrirEnInstagram: true };

const senal = (pares: Record<string, SenalPorReferente>) =>
  new Map(Object.entries(pares));

describe("armarVistaBuscador", () => {
  it("solo siembran los referentes activos de proyectos en alcance", () => {
    const vista = armarVistaBuscador(
      [
        ref({ handle: "@si" }),
        ref({ handle: "@apagado", activo: false }),
        ref({ handle: "@fueraDeAlcance", proyectoIds: ["p99"] }),
        ref({ handle: "@sinProyecto", proyectoIds: [] }),
      ],
      EN_ALCANCE,
      senal({}),
      KNOBS,
    );
    assert.deepEqual(
      vista.semillas.map((s) => s.handle),
      ["si"],
    );
  });

  it("TikTok no siembra, y se cuenta aparte en vez de desaparecer", () => {
    const vista = armarVistaBuscador(
      [ref({ handle: "@ig" }), ref({ handle: "@tt", plataforma: "tiktok" })],
      EN_ALCANCE,
      senal({}),
      KNOBS,
    );
    assert.deepEqual(
      vista.semillas.map((s) => s.handle),
      ["ig"],
    );
    assert.equal(vista.sinSembrarPorPlataforma, 1);
  });

  it("ordena por tasa de selección, y a igual tasa manda la muestra más grande", () => {
    const vista = armarVistaBuscador(
      [ref({ handle: "@floja" }), ref({ handle: "@buena" }), ref({ handle: "@empate" })],
      EN_ALCANCE,
      senal({
        floja: { tasa: 0.1, calificados: 30 },
        buena: { tasa: 0.8, calificados: 5 },
        empate: { tasa: 0.1, calificados: 40 },
      }),
      KNOBS,
    );
    assert.deepEqual(
      vista.semillas.map((s) => s.handle),
      ["buena", "empate", "floja"],
    );
  });

  it("una cuenta sin señal vale tasa 0 y cae al fondo, pero sigue siendo semilla", () => {
    const vista = armarVistaBuscador(
      [ref({ handle: "@virgen" }), ref({ handle: "@conHistoria" })],
      EN_ALCANCE,
      senal({ conhistoria: { tasa: 0.4, calificados: 10 } }),
      KNOBS,
    );
    assert.deepEqual(
      vista.semillas.map((s) => s.handle),
      ["conHistoria", "virgen"],
    );
    assert.equal(vista.semillas[1].tasa, null);
  });

  it("corta en el cap y dice cuántas quedaron afuera", () => {
    const muchos = Array.from({ length: CAP_SEMILLAS + 5 }, (_, i) =>
      ref({ handle: `@c${i}` }),
    );
    const vista = armarVistaBuscador(muchos, EN_ALCANCE, senal({}), KNOBS);
    assert.equal(vista.semillas.length, CAP_SEMILLAS);
    assert.equal(vista.elegibles, CAP_SEMILLAS + 5);
  });

  it("la misma cuenta cargada dos veces es UNA semilla", () => {
    const vista = armarVistaBuscador(
      [ref({ handle: "@Repetida" }), ref({ handle: "repetida", proyectoIds: ["p2"] })],
      EN_ALCANCE,
      senal({}),
      KNOBS,
    );
    assert.equal(vista.semillas.length, 1);
    assert.equal(vista.elegibles, 1);
  });

  it("con el descubrimiento de Instagram apagado no hay semillas, pero la vista existe igual", () => {
    const vista = armarVistaBuscador([ref()], EN_ALCANCE, senal({}), {
      ...KNOBS,
      descubrirEnInstagram: false,
    });
    assert.deepEqual(vista.semillas, []);
    assert.equal(vista.elegibles, 0);
    assert.equal(vista.propuestasMax, 10);
  });

  it("los knobs del equipo viajan tal cual a la vista", () => {
    const vista = armarVistaBuscador([ref()], EN_ALCANCE, senal({}), {
      propuestasMax: 25,
      afinidadMinima: 0.9,
      descubrirEnInstagram: true,
    });
    assert.equal(vista.propuestasMax, 25);
    assert.equal(vista.afinidadMinima, 0.9);
    assert.equal(vista.cap, CAP_SEMILLAS);
  });
});
