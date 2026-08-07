import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resumenDeTanda,
  tituloDeTanda,
  tituloParaGuardar,
  type ContadoresTanda,
} from "./tanda.ts";

const CERO: ContadoresTanda = { total: 0, pendientes: 0, listos: 0, fallidas: 0, abandonadas: 0 };

describe("tituloDeTanda", () => {
  it("sin título, arma el default con la cantidad y el momento", () => {
    assert.equal(tituloDeTanda(null, 20, "7 ago, 02:32 p. m."), "20 links · 7 ago, 02:32 p. m.");
  });

  it("un solo link no dice 'links'", () => {
    assert.equal(tituloDeTanda(null, 1, "7 ago, 02:32 p. m."), "1 link · 7 ago, 02:32 p. m.");
  });

  it("el título propio gana sobre el default", () => {
    assert.equal(tituloDeTanda("Referentes de fitness", 20, "7 ago"), "Referentes de fitness");
  });

  // Las 9 del backfill nacen sin título, y una tanda renombrada a espacios no puede quedar muda:
  // en los dos casos lo correcto es volver a mostrar el default.
  it("un título de solo espacios cae al default", () => {
    assert.equal(tituloDeTanda("   ", 3, "7 ago"), "3 links · 7 ago");
  });
});

describe("resumenDeTanda", () => {
  it("una tanda sana dice solo lo que tiene", () => {
    assert.equal(resumenDeTanda({ ...CERO, total: 48, listos: 48 }), "48 listos");
  });

  it("omite los ceros y respeta el orden", () => {
    assert.equal(
      resumenDeTanda({ total: 52, listos: 48, pendientes: 2, fallidas: 1, abandonadas: 1 }),
      "48 listos · 2 en cola · 1 sin guion · 1 abandonado",
    );
  });

  it("singulariza donde corresponde", () => {
    assert.equal(resumenDeTanda({ ...CERO, total: 1, listos: 1 }), "1 listo");
    assert.equal(resumenDeTanda({ ...CERO, total: 2, abandonadas: 2 }), "2 abandonados");
  });

  it("una tanda sin filas lo dice en vez de quedar muda", () => {
    assert.equal(resumenDeTanda(CERO), "sin enlaces");
  });
});

describe("tituloParaGuardar", () => {
  it("guarda el texto sin los bordes", () => {
    assert.equal(tituloParaGuardar("  Fitness  "), "Fitness");
  });

  // 🔑 Vaciar el campo vuelve al default. Guardar `""` dejaría una cabecera en blanco sin forma de
  // recuperarlo.
  it("vaciar el campo devuelve null, no cadena vacía", () => {
    assert.equal(tituloParaGuardar(""), null);
    assert.equal(tituloParaGuardar("   \n "), null);
  });
});
