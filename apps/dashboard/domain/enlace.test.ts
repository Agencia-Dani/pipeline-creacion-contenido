import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  claveDe,
  parsearEnlaces,
  repartirEnlaces,
  shortcodeAExternalId,
  type EnlaceVideo,
} from "./enlace.ts";

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

describe("repartirEnlaces", () => {
  const ig = (id: string): EnlaceVideo => ({
    plataforma: "instagram",
    external_id: id,
    url: `https://www.instagram.com/p/x${id}/`,
  });
  const tt = (id: string): EnlaceVideo => ({
    plataforma: "tiktok",
    external_id: id,
    url: `https://www.tiktok.com/@a/video/${id}`,
  });

  it("lo que no conocemos va a nuevos", () => {
    const r = repartirEnlaces([ig("1"), ig("2")], new Set(), new Set());
    assert.deepEqual(r.nuevos.map((e) => e.external_id), ["1", "2"]);
    assert.deepEqual(r.enCola, []);
    assert.deepEqual(r.vistosPorElMotor, []);
  });

  it("separa los dos montones, porque no significan lo mismo", () => {
    const r = repartirEnlaces(
      [ig("1"), ig("2"), ig("3")],
      new Set([claveDe(ig("2"))]),
      new Set([claveDe(ig("3"))]),
    );
    assert.deepEqual(r.nuevos.map((e) => e.external_id), ["1"]);
    assert.deepEqual(r.enCola.map((e) => e.external_id), ["2"]);
    assert.deepEqual(r.vistosPorElMotor.map((e) => e.external_id), ["3"]);
  });

  it("estar en la cola gana sobre estar en la memoria del motor", () => {
    // Pasa siempre que la herramienta ya transcribió ese link: escribe en las DOS tablas. Si
    // ganara el motor, el aviso diría "lo vio el motor" sobre algo cuyo guion tenemos acá abajo.
    const e = ig("7");
    const r = repartirEnlaces([e], new Set([claveDe(e)]), new Set([claveDe(e)]));
    assert.deepEqual(r.enCola.map((x) => x.external_id), ["7"]);
    assert.deepEqual(r.vistosPorElMotor, []);
  });

  it("🩸 la clave lleva la plataforma: el mismo id en IG y TikTok NO es el mismo video", () => {
    // Los dos ids son enteros largos, así que una clave sin plataforma los confundiría y la
    // pantalla ofrecería quitar un video que nadie transcribió nunca.
    const r = repartirEnlaces([tt("42")], new Set([claveDe(ig("42"))]), new Set());
    assert.deepEqual(r.nuevos.map((e) => e.external_id), ["42"]);
    assert.deepEqual(r.enCola, []);
  });

  it("sin links no rompe", () => {
    assert.deepEqual(repartirEnlaces([], new Set(), new Set()), {
      nuevos: [],
      enCola: [],
      vistosPorElMotor: [],
    });
  });
});
