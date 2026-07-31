import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  diffTabla,
  esFilaFantasma,
  mapearCandidato,
  mapearProyecto,
  mapearReferente,
  normalizar,
  proyectosDeReferente,
  sinDiferencias,
  type Fila,
} from "./sombra.ts";

describe("mapeos Airtable → app", () => {
  it("proyecto: mapea N y voz; falla con nombre claro si falta la voz o los criterios", () => {
    const fila = mapearProyecto({
      id: "recP",
      fields: {
        nombre: "Trading",
        criterios_relevancia: "qué sí y qué no",
        voz_default: ["recV"],
        activo: true,
        N: 20,
      },
    });
    assert.equal(fila._voz, "recV");
    assert.equal(fila.n, 20);
    assert.equal(fila.activo, true);

    assert.throws(
      () => mapearProyecto({ id: "r", fields: { nombre: "Huérfano", criterios_relevancia: "x" } }),
      /1 proyecto = 1 voz/,
    );
    assert.throws(
      () => mapearProyecto({ id: "r", fields: { nombre: "Vacío", voz_default: ["recV"] } }),
      /sin criterios_relevancia/,
    );
  });

  it("candidato: checkbox ausente = false, estado default nuevo, thumbnail y fecha", () => {
    const fila = mapearCandidato({
      id: "recC",
      createdTime: "2026-07-20T08:30:00.000Z",
      fields: {
        titulo: "Video",
        thumbnail: [{ url: "https://cdn/x.jpg" }],
        proyecto: ["recP"],
        voz: ["recV"],
        views: 1000,
      },
    });
    assert.equal(fila.viral_por_tamano, false);
    assert.equal(fila.estado, "nuevo");
    assert.equal(fila.calificacion, null);
    assert.equal(fila.thumbnail_url, "https://cdn/x.jpg");
    assert.equal(fila.creado_en, "2026-07-20T08:30:00.000Z");
  });

});

describe("referentes: N:M y filas a medio cargar (ADR-032)", () => {
  const referente = (fields: Record<string, unknown>) => ({ id: "recR", fields });

  it("los proyectos NO se truncan a uno: es la regresión que motivó el ADR", () => {
    // Con `link()` (el mapeo viejo) esto devolvía solo recA, y el corte apagaba proyectos
    // enteros: 35 pares vivos → 16.
    assert.deepEqual(proyectosDeReferente(referente({ proyecto: ["recA", "recB", "recC"] })), [
      "recA",
      "recB",
      "recC",
    ]);
  });

  it("sin proyectos linkeados devuelve lista vacía, no null", () => {
    assert.deepEqual(proyectosDeReferente(referente({})), []);
  });

  it("un referente sin handle falla loud, no se guarda con un placeholder", () => {
    // En Airtable el campo viene ausente y el motor hace `if (!handle) return;` — la ignora
    // sin gastar. Guardarla como "(sin handle)" la volvería un handle válido y el motor le
    // pediría esa cuenta a Apify. Hay 1 fila así en la base viva, activa y con 2 proyectos.
    assert.throws(() => mapearReferente(referente({ plataforma: "instagram", activo: true })), /sin handle/);
  });

  it("el handle se guarda como Airtable lo tenía, con su arroba", () => {
    const fila = mapearReferente(referente({ handle: "@simonsinek", plataforma: "instagram" }));
    assert.equal(fila.handle, "@simonsinek");
    assert.equal(fila.proyecto_id, undefined); // el vínculo ya no es columna de esta fila
  });
});

describe("diff esperado ↔ actual", () => {
  const fila = (extra: Fila): Fila => ({ airtable_id: "rec1", nombre: "Cora", ...extra });

  it("normaliza entre mundos: vacío≡null, timestamps por instante, numeric como string", () => {
    assert.equal(normalizar(""), null);
    assert.equal(normalizar(undefined), null);
    assert.equal(
      normalizar("2026-07-20T08:00:00.000Z"),
      normalizar("2026-07-20T08:00:00+00:00"),
    );
    assert.equal(normalizar("0.75"), 0.75);
    assert.equal(normalizar("@handle"), "@handle");
  });

  it("detecta faltantes, sobrantes y campos distintos; igual tras normalizar no es diff", () => {
    const esperado = new Map([
      ["rec1", fila({ activo: true, creado_en: "2026-07-20T08:00:00.000Z", notas: null })],
      ["rec2", fila({ airtable_id: "rec2", activo: false })],
    ]);
    const actual = new Map([
      ["rec1", fila({ activo: false, creado_en: "2026-07-20T08:00:00+00:00", notas: "" })],
      ["rec3", fila({ airtable_id: "rec3" })],
    ]);
    const d = diffTabla(esperado, actual);
    assert.deepEqual(d.faltan, ["rec2"]);
    assert.deepEqual(d.sobran, ["rec3"]);
    assert.deepEqual(d.distintos, [
      { airtableId: "rec1", campo: "activo", esperado: true, actual: false },
    ]);
    assert.equal(sinDiferencias(d), false);

    const iguales = diffTabla(
      new Map([["rec1", fila({ creado_en: "2026-07-20T08:00:00.000Z" })]]),
      new Map([["rec1", fila({ creado_en: "2026-07-20T08:00:00+00:00" })]]),
    );
    assert.equal(sinDiferencias(iguales), true);
  });
});

// Las filas fantasma son el ruido estructural de la grilla de Airtable: reaparecen
// solas, así que el espejo tiene que ignorarlas o el diff nunca da cero (D3).
describe("esFilaFantasma", () => {
  it("una fila sin ningún campo cargado no es un registro", () => {
    assert.equal(esFilaFantasma({ id: "rec1", fields: {} }), true);
  });

  it("tampoco lo es la que solo trae campos vacíos (string vacío, null, link sin nada)", () => {
    assert.equal(
      esFilaFantasma({ id: "rec1", fields: { handle: "", proyecto: [], notas: null } }),
      true,
    );
  });

  it("una fila a medio cargar SÍ es un registro: tiene que fallar loud, no desaparecer", () => {
    // El caso real que rompió el import: '@' y un referente con handle pero sin plataforma.
    assert.equal(esFilaFantasma({ id: "rec1", fields: { handle: "@" } }), false);
    assert.equal(esFilaFantasma({ id: "rec2", fields: { handle: "@the.rumers" } }), false);
  });

  it("un checkbox destildado no salva a la fila: Airtable lo omite del payload", () => {
    assert.equal(esFilaFantasma({ id: "rec1", fields: { activo: false } }), false);
  });

  it("la salud que escribe el archivado no cuenta como contenido: la escribió la máquina", () => {
    // Caso real: un referente vaciado a mano que conservó su salud computada.
    assert.equal(
      esFilaFantasma({ id: "rec1", fields: { tasa_gate: 0.12, videos_evaluados: 26 } }),
      true,
    );
    // Pero con un campo humano encima, vuelve a ser un registro.
    assert.equal(
      esFilaFantasma({ id: "rec2", fields: { tasa_gate: 0.12, handle: "@alguien" } }),
      false,
    );
  });
});
