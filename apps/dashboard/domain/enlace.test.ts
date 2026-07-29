import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parsearEnlaces, shortcodeAExternalId } from "./enlace.ts";

// Pares reales sacados de processed_items en la base viva (2026-07-28). Cuando se corrió el
// chequeo completo dio 381/381 en Instagram y 27/27 en TikTok, cero mismatches sobre 408 filas.
// Estos 8 son la alarma en miniatura: si alguien cambia cómo el motor arma el external_id de IG,
// acá se prende en rojo antes de que el dedup se rompa mudo en producción (ADR-031).
const PARES_REALES: ReadonlyArray<readonly [string, string]> = [
  ["DZkEokwy4jN", "3919277956157638861"],
  ["DakyC2Tx5_B", "3937492072307072961"],
  ["DZUR7GISvkw", "3914832803913201968"],
  ["DaDTnyBRkDr", "3928069596648980715"],
  ["DZutGjlN05U", "3922270688101486164"],
  ["DaqKZXnNOk4", "3939006547894790456"],
  ["DaLDv0TvX1w", "3930251579931590000"],
  ["Da57syZm7_N", "3943445511257440205"],
];

describe("shortcodeAExternalId", () => {
  it("reproduce el external_id que el motor grabó para cada shortcode real", () => {
    for (const [shortcode, esperado] of PARES_REALES) {
      assert.equal(shortcodeAExternalId(shortcode), esperado, `falló ${shortcode}`);
    }
  });

  it("no pierde precisión en los 19 dígitos (si usara Number, esto se redondea)", () => {
    const id = shortcodeAExternalId("DZkEokwy4jN");
    assert.equal(id, "3919277956157638861");
    assert.notEqual(id, String(Number(id)));
  });

  it("devuelve vacío si el shortcode tiene un caracter fuera del alfabeto base64", () => {
    assert.equal(shortcodeAExternalId("DZkEo$wy4jN"), "");
  });
});

describe("parsearEnlaces — Instagram", () => {
  it("acepta /reel/ y lo canoniza a /p/, la forma que graba el motor", () => {
    const { validos } = parsearEnlaces("https://www.instagram.com/reel/DZkEokwy4jN/");
    assert.deepEqual(validos, [
      {
        plataforma: "instagram",
        external_id: "3919277956157638861",
        url: "https://www.instagram.com/p/DZkEokwy4jN/",
      },
    ]);
  });

  it("descarta la cola ?igsh= que agrega el botón de compartir de la app", () => {
    const { validos } = parsearEnlaces(
      "https://www.instagram.com/reel/DZkEokwy4jN/?igsh=MWx0eGZ5NnBrZDBnbQ==",
    );
    assert.equal(validos[0]?.external_id, "3919277956157638861");
    assert.equal(validos[0]?.url, "https://www.instagram.com/p/DZkEokwy4jN/");
  });

  it("/p/, /reel/ y /reels/ del mismo video son un solo enlace", () => {
    const { validos } = parsearEnlaces(`
      https://www.instagram.com/p/DZkEokwy4jN/
      https://www.instagram.com/reel/DZkEokwy4jN/
      https://instagram.com/reels/DZkEokwy4jN/
    `);
    assert.equal(validos.length, 1);
  });

  it("acepta la forma con el usuario adelante (instagram.com/<user>/reel/<sc>)", () => {
    const { validos } = parsearEnlaces("https://www.instagram.com/varisthetrader/reel/DakyC2Tx5_B/");
    assert.equal(validos[0]?.external_id, "3937492072307072961");
  });

  it("un perfil de Instagram no es un video y se reporta como inválido", () => {
    const { validos, invalidos } = parsearEnlaces("https://www.instagram.com/varisthetrader/");
    assert.equal(validos.length, 0);
    assert.equal(invalidos.length, 1);
    assert.match(invalidos[0].razon, /no es de un reel|no de un reel/i);
  });
});

describe("parsearEnlaces — TikTok", () => {
  it("toma el id de la URL tal cual: en TikTok ya es el external_id", () => {
    const { validos } = parsearEnlaces(
      "https://www.tiktok.com/@varisthetrader/video/7647224957767830805",
    );
    assert.deepEqual(validos, [
      {
        plataforma: "tiktok",
        external_id: "7647224957767830805",
        url: "https://www.tiktok.com/@varisthetrader/video/7647224957767830805",
      },
    ]);
  });

  it("descarta la cola ?is_from_webapp=", () => {
    const { validos } = parsearEnlaces(
      "https://www.tiktok.com/@amntrading1/video/7647615255484435734?is_from_webapp=1&sender_device=pc",
    );
    assert.equal(validos[0]?.external_id, "7647615255484435734");
  });

  it("el link corto de TikTok se rechaza con instrucción, porque no se puede resolver sin red", () => {
    const { validos, invalidos } = parsearEnlaces("https://vm.tiktok.com/ZMhqA8Kj9/");
    assert.equal(validos.length, 0);
    assert.match(invalidos[0].razon, /link largo/i);
  });
});

describe("parsearEnlaces — el pegote real que manda el equipo", () => {
  it("saca los links de un chat de WhatsApp pegado entero e ignora el texto suelto", () => {
    const { validos, invalidos } = parsearEnlaces(`
      [28/7 09:12] Majo: mirá estos que me pasó el cliente
      [28/7 09:12] Majo: https://www.instagram.com/reel/DZkEokwy4jN/?igsh=abc
      [28/7 09:13] Jero: este también https://www.tiktok.com/@dailycharts6/video/7649338987793992974
      [28/7 09:14] Majo: dale, los transcribo
    `);
    assert.equal(validos.length, 2);
    assert.deepEqual(
      validos.map((v) => v.plataforma),
      ["instagram", "tiktok"],
    );
    assert.deepEqual(invalidos, []);
  });

  it("tolera comas, viñetas y puntos pegados al final del link", () => {
    const { validos } = parsearEnlaces(
      "- https://www.instagram.com/reel/DZUR7GISvkw/, y https://www.instagram.com/p/DaDTnyBRkDr/.",
    );
    assert.deepEqual(
      validos.map((v) => v.external_id),
      ["3914832803913201968", "3928069596648980715"],
    );
  });

  it("un texto sin ningún link no produce ni válidos ni inválidos", () => {
    assert.deepEqual(parsearEnlaces("hola, mandame los videos cuando puedas"), {
      validos: [],
      invalidos: [],
    });
  });

  it("un link de otra plataforma se reporta, pero una sola vez aunque se repita", () => {
    const { invalidos } = parsearEnlaces(`
      https://www.youtube.com/watch?v=abc123
      https://www.youtube.com/watch?v=abc123
    `);
    assert.equal(invalidos.length, 1);
  });
});
