import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plural, pluralS } from "./plural.ts";

describe("concordancia de número", () => {
  it("n === 1 devuelve el singular; cualquier otra cosa, el plural", () => {
    assert.equal(plural(1, "video", "videos"), "video");
    assert.equal(plural(2, "video", "videos"), "videos");
  });

  it("🔑 el CERO va en plural, que es como se dice en español", () => {
    // "0 videos", no "0 video". Es el caso que más se olvida porque la guarda del llamador
    // suele ser `> 0` y nadie lo prueba.
    assert.equal(plural(0, "video", "videos"), "videos");
    assert.equal(pluralS(0, "descarte"), "descartes");
  });

  it("sirve para verbos y artículos, no solo para sustantivos", () => {
    // Ésta es la razón de que la firma pida las dos formas: pegar una "s" no arregla un verbo.
    assert.equal(plural(1, "quedó", "quedaron"), "quedó");
    assert.equal(plural(3, "quedó", "quedaron"), "quedaron");
    assert.equal(plural(1, "ya tenía", "ya tenían"), "ya tenía");
    assert.equal(plural(1, "el que falta", "los que faltan"), "el que falta");
    assert.equal(plural(2, "el que falta", "los que faltan"), "los que faltan");
  });

  it("pluralS cubre el sustantivo regular", () => {
    assert.equal(pluralS(1, "cuenta"), "cuenta");
    assert.equal(pluralS(4, "cuenta"), "cuentas");
  });

  it("los negativos no se tratan como singular", () => {
    // No debería llegar uno, pero si llega, "-1 videos" es menos raro que "-1 video".
    assert.equal(plural(-1, "video", "videos"), "videos");
  });
});
