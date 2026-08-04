import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { aCsv, celda } from "./csv.ts";

// El CSV reemplaza al Google Sheet Histórico (ADR-057), así que lo que se prueba acá no es
// "serializa bien" en abstracto: es que **un guion real no rompa el archivo**. Un script trae
// saltos de línea, comillas y comas, y si el escapado falla las columnas se corren y el error
// aparece recién cuando alguien abre el Excel.

const GUION_REAL = `Esto es lo que pasa cuando dices "no".
La otra persona, en ese momento, decide.`;

describe("celda", () => {
  it("duplica las comillas, que es como RFC 4180 las escapa", () => {
    assert.equal(celda('dice "no"'), '"dice ""no"""');
  });

  it("deja pasar comas y saltos de línea adentro de las comillas, sin tocarlos", () => {
    assert.equal(celda("a,b"), '"a,b"');
    assert.equal(celda("a\nb"), '"a\nb"');
  });

  it("null y undefined son celda vacía, no el texto 'null'", () => {
    assert.equal(celda(null), '""');
    assert.equal(celda(undefined), '""');
  });

  it("un 0 es un 0, no una celda vacía", () => {
    // `!v` habría tirado los ceros: 0 vistas y 0 likes son datos, no ausencia.
    assert.equal(celda(0), '"0"');
  });
});

describe("aCsv", () => {
  it("abre con BOM — sin él Excel muestra ComunicaciÃ³n", () => {
    assert.ok(aCsv(["A"], []).startsWith("﻿"));
  });

  it("separa filas con CRLF, que es lo que pide RFC 4180", () => {
    const csv = aCsv(["A", "B"], [["1", "2"]]);
    assert.equal(csv, '﻿"A","B"\r\n"1","2"\r\n');
  });

  it("un guion con saltos y comillas NO corre las columnas", () => {
    const csv = aCsv(["TITULO", "SCRIPT", "VIEWS"], [["Un título", GUION_REAL, 1234]]);

    // Contar comillas es la forma barata de ver que nada se escapó de más ni de menos, sin
    // escribir un parser: 6 celdas × 2 comillas de apertura/cierre = 12, más 4 por las DOS
    // comillas del guion, que se duplican una a una.
    const comillas = (csv.match(/"/g) ?? []).length;
    assert.equal(comillas, 16);
    assert.ok(csv.includes('"Esto es lo que pasa cuando dices ""no"".'));
    assert.ok(csv.endsWith('"1234"\r\n'));
  });

  it("sin filas devuelve solo los encabezados — un CSV vacío sigue siendo un CSV válido", () => {
    assert.equal(aCsv(["A", "B"], []), '﻿"A","B"\r\n');
  });
});
