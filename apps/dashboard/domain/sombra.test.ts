import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  diffTabla,
  mapearAjuste,
  mapearCandidato,
  mapearProyecto,
  normalizar,
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

  it("ajuste: 'Mostrar al equipo' tildado = visibilidad equipo; sin tildar = dev", () => {
    const base = { clave: "Candidatos por corrida", valor: 100 };
    assert.equal(
      mapearAjuste({ id: "r1", fields: { ...base, "Mostrar al equipo": true } }).visibilidad,
      "equipo",
    );
    assert.equal(mapearAjuste({ id: "r2", fields: base }).visibilidad, "dev");
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
