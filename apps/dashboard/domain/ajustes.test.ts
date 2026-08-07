import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { CATALOGO, ajustesVisibles, validarAjuste } from "./ajustes.ts";

describe("CATALOGO", () => {
  it("tiene los 18 knobs del check de la migración 009", () => {
    assert.equal(Object.keys(CATALOGO).length, 18);
  });

  it("los 4 del descubrimiento están separados de los del motor", () => {
    const desc = Object.entries(CATALOGO).filter(([, k]) => k.consume === "descubrimiento");
    assert.deepEqual(desc.map(([c]) => c).sort(), [
      "Afinidad mínima de propuesta",
      "Descubrir en Instagram",
      "Descubrir en TikTok",
      "Propuestas por corrida",
    ]);
  });
});

describe("validarAjuste", () => {
  it("una clave inventada no pasa (el typo no degrada en silencio)", () => {
    const r = validarAjuste("Peso de vistaz", 0.4);
    assert.equal(r.ok, false);
  });

  it("acepta el valor real que hay hoy en la base", () => {
    assert.deepEqual(validarAjuste("Peso de relevancia", 0.7), { ok: true, valor: 0.7 });
    assert.deepEqual(validarAjuste("Seguidores para marcar viral", 700000), { ok: true, valor: 700000 });
    assert.deepEqual(validarAjuste("Buscar por referentes en TikTok", 1), { ok: true, valor: 1 });
  });

  it("el caso que motivó el módulo: una proporción fuera de 0–1", () => {
    // Airtable dejaba escribir esto y el motor ordenaba raro sin avisar.
    const r = validarAjuste("Peso de relevancia", 5);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /0 a 1/);
  });

  it("los bordes de una proporción SÍ son válidos (0 y 1)", () => {
    assert.equal(validarAjuste("Peso de likes", 0).ok, true);
    assert.equal(validarAjuste("Peso de likes", 1).ok, true);
  });

  it("un toggle solo admite 0 o 1, no cualquier verdadero", () => {
    assert.equal(validarAjuste("Descubrir en Instagram", 0).ok, true);
    assert.equal(validarAjuste("Descubrir en Instagram", 2).ok, false);
    assert.equal(validarAjuste("Descubrir en Instagram", 0.5).ok, false);
  });

  it("un contador no admite decimales ni negativos", () => {
    assert.equal(validarAjuste("Mínimo de vistas", 0).ok, true);
    assert.equal(validarAjuste("Mínimo de vistas", 10.5).ok, false);
    assert.equal(validarAjuste("Mínimo de vistas", -1).ok, false);
  });

  it("los que arrancan en 1 rechazan el 0: 'Propuestas por corrida = 0' es una búsqueda vacía", () => {
    assert.equal(validarAjuste("Propuestas por corrida", 0).ok, false);
    assert.equal(validarAjuste("Propuestas por corrida", 1).ok, true);
  });

  // ADR-042: el techo de gasto es `entero` y no `entero_positivo` a propósito. El motor trata el 0
  // como "sin techo" (`if (CAP > 0)`), así que prohibirlo mataría esa salida sin querer.
  it("el techo de gasto admite 0, que en el motor significa 'sin techo'", () => {
    assert.equal(validarAjuste("Videos a transcribir por corrida", 0).ok, true);
    assert.equal(validarAjuste("Videos a transcribir por corrida", 250).ok, true);
    assert.equal(validarAjuste("Videos a transcribir por corrida", -1).ok, false);
    assert.equal(validarAjuste("Videos a transcribir por corrida", 10.5).ok, false);
  });

  it("una clave que ya no existe no valida: 'Candidatos por corrida' murió con ADR-042", () => {
    assert.equal(validarAjuste("Candidatos por corrida", 100).ok, false);
  });

  it("normaliza el string del input HTML, que es como va a llegar siempre", () => {
    assert.deepEqual(validarAjuste("Días de recencia", " 7 "), { ok: true, valor: 7 });
    assert.equal(validarAjuste("Días de recencia", "").ok, false);
    assert.equal(validarAjuste("Días de recencia", "siete").ok, false);
    assert.equal(validarAjuste("Días de recencia", null).ok, false);
  });

  it("NO valida los topes: son dev-only del Config del motor (ADR-016), no de la app", () => {
    // 500 > cap_resultados_referente (50). Se acepta acá y el motor lo clampea; el tope
    // vive en un solo lado. Si algún día la app lo valida, es porque el tope se mudó.
    assert.equal(validarAjuste("Resultados por cuenta de referente", 500).ok, true);
  });
});

describe("ajustesVisibles", () => {
  const filas = [
    { clave: "Mínimo de vistas", visibilidad: "equipo" },
    { clave: "Peso de relevancia", visibilidad: "dev" },
    { clave: "Knob viejo de Airtable", visibilidad: "equipo" },
  ];

  it("el operador solo ve los de equipo", () => {
    assert.deepEqual(ajustesVisibles(filas, "operador").map((f) => f.clave), ["Mínimo de vistas"]);
  });

  it("el dev ve todos los del catálogo", () => {
    assert.deepEqual(ajustesVisibles(filas, "dev").map((f) => f.clave), [
      "Mínimo de vistas",
      "Peso de relevancia",
    ]);
  });

  it("una clave que no está en el catálogo no se muestra a nadie, ni al dev", () => {
    // Un knob suelto de Airtable no puede aparecer como editable: nadie lo consume.
    assert.equal(ajustesVisibles(filas, "dev").some((f) => f.clave === "Knob viejo de Airtable"), false);
  });

  it("el sponsor ve los mismos knobs que el operador: ahora opera", () => {
    // Cambió el 2026-08-07 con las zonas. Los avanzados (los que mueven plata y techos del motor)
    // siguen siendo solo de dev — lo que se le abre son las 8 de `visibilidad: equipo`.
    assert.deepEqual(ajustesVisibles(filas, "sponsor"), ajustesVisibles(filas, "operador"));
    assert.equal(ajustesVisibles(filas, "sponsor").every((f) => f.visibilidad === "equipo"), true);
  });
});
