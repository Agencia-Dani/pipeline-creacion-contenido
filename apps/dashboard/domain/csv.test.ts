import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { aCsv, aUtf16le, celda } from "./csv.ts";

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

  it("separa columnas con TAB y no con coma — con coma, Excel en región CO lo mete todo en la columna A", () => {
    const csv = aCsv(["A", "B"], [["1", "2"]]);
    assert.equal(csv, '﻿"A"\t"B"\r\n"1"\t"2"\r\n');
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
    assert.equal(aCsv(["A", "B"], []), '﻿"A"\t"B"\r\n');
  });
});

describe("aUtf16le", () => {
  // Es la mitad de la decisión que `aCsv` documenta: sin estos bytes, Excel no reconoce el archivo
  // como UTF-16, vuelve a preguntarle el delimitador al locale y todo cae en la columna A.

  it("abre con ff fe — el BOM que le dice a Excel 'esto es UTF-16'", () => {
    const b = aUtf16le(aCsv(["A"], []));
    assert.equal(b[0], 0xff);
    assert.equal(b[1], 0xfe);
  });

  it("es little-endian: la 'A' es 41 00 y no 00 41", () => {
    assert.deepEqual([...aUtf16le("A")], [0x41, 0x00]);
  });

  it("un acento sobrevive — es la mitad que rompía sep=,", () => {
    // é = U+00E9 ⇒ e9 00 en UTF-16LE. Si esto sale como c3 a9 (UTF-8), Excel muestra M√©tricas.
    assert.deepEqual([...aUtf16le("é")], [0xe9, 0x00]);
  });

  it("un emoji NO se mutila — ADR-057 los verificó contra prod", () => {
    // 🔥 = U+1F525, fuera del BMP: son DOS unidades de código (par suplente), y recorrerlas de a
    // una es justo lo que las preserva. Un bucle por "carácter" habría escrito basura.
    assert.deepEqual([...aUtf16le("🔥")], [0x3d, 0xd8, 0x25, 0xdd]);
  });

  it("da la vuelta completa: los bytes releídos como utf16le son el texto original", () => {
    const csv = aCsv(["TÍTULO"], [["Comunicación 🔥"]]);
    assert.equal(Buffer.from(aUtf16le(csv)).toString("utf16le"), csv);
  });
});
