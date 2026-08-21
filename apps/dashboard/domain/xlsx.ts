// Dominio puro: filas → un archivo `.xlsx` de verdad. Sin IO, sin dependencias.
//
// Existe por [ADR-071](../../../docs/adr/ADR-071-el-export-es-un-xlsx-de-verdad.md), que enmienda
// [ADR-057](../../../docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md).
//
// 🩸 **De dónde sale.** El export era un CSV en UTF-16LE con TAB, y esa combinación no se eligió por
// gusto: era **la única** de cuatro que abría bien en el Excel de región Colombia (columnas Y
// acentos). Su costo estaba escrito desde el día uno — *"un parser que asuma coma y UTF-8 necesita
// `encoding='utf-16'` y `sep='\t'`"* — y el 2026-08-20 lo cobró: el archivo se veía con **una línea
// vacía entre cada fila**.
//
// 🔬 **Y el diagnóstico importa porque el archivo NO estaba roto.** Se midió: de los 183 guiones,
// **0** traen saltos de línea, **0** traen tabs. El texto que salía era correcto. Lo que produce la
// línea vacía es leer los bytes UTF-16LE como si fueran de un byte: cada carácter queda como
// `X\0`, y el `\0` que sigue al `\n` **es** la línea vacía. O sea que el síntoma no dependía del
// contenido sino de quién abría el archivo — y por eso no se arregla escapando mejor.
//
// 🔑 **La decisión: dejar de pelear con el formato de texto.** Un `.xlsx` no tiene encoding que
// adivinar ni separador que negociar: es un ZIP con XML adentro, y el XML declara UTF-8. Las cuatro
// filas de aquella tabla de pruebas dejan de existir como problema, no como una quinta opción que
// gana por poco.
//
// 🧱 **Sin dependencia, y no por ahorrar.** Un `.xlsx` mínimo son cinco XML dentro de un ZIP sin
// comprimir; lo único que no es texto es el CRC32 y los offsets del contenedor, que están abajo.
// Traer SheetJS o ExcelJS para esto sería meter cientos de KB —y una superficie de actualización—
// para escribir cinco archivos que no cambian nunca. Si algún día hace falta leer un xlsx, formato
// condicional o varias hojas, ahí sí la librería gana y esto se tira.
//
// Corre igual en el server y en el browser (solo `Uint8Array` y aritmética), así que el archivo se
// arma **en el cliente**, igual que antes: el server manda las filas y acá se vuelven bytes.
//
// 📦 El contenedor (el ZIP store, el CRC32, el escape de XML) se mudó a `domain/zip.ts` el
// 2026-08-21, cuando el `.docx` de las colecciones pasó a ser el segundo consumidor de lo mismo.

// ── XML ──────────────────────────────────────────────────────────────────────

import { escaparXml as xml, zip } from "./zip.ts";

/** `0 → "A"`, `25 → "Z"`, `26 → "AA"`. Excel nombra las columnas en base 26 sin cero. */
export function letraDeColumna(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Una celda.
 *
 * 🔑 **Los números salen como números y no como texto**, que es una mejora concreta sobre el CSV:
 * en el archivo viejo `VIEWS` llegaba como `"66436"` entrecomillado y Excel lo trataba como texto,
 * así que no se podía ordenar ni sumar sin convertir la columna a mano.
 *
 * `null`/`undefined` → celda **ausente**, no una celda vacía: en xlsx una fila puede saltearse
 * columnas y es lo que hace que las filas huérfanas (casi todas vacías) no pesen.
 */
function celdaXml(ref: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

function hojaXml(encabezados: readonly string[], filas: readonly unknown[][]): string {
  const fila = (celdas: readonly unknown[], n: number) =>
    `<row r="${n}">${celdas.map((v, i) => celdaXml(`${letraDeColumna(i)}${n}`, v)).join("")}</row>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    // Congela la fila de títulos: con 183 filas y 17 columnas, perder los encabezados al scrollear
    // es la diferencia entre leer el archivo y contar columnas con el dedo.
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetData>` +
    fila(encabezados, 1) +
    filas.map((f, i) => fila(f, i + 2)).join("") +
    `</sheetData></worksheet>`
  );
}

// ── ZIP ──────────────────────────────────────────────────────────────────────

// ── La función que se usa ────────────────────────────────────────────────────

/**
 * Filas → los bytes de un `.xlsx` con una hoja.
 *
 * Los cinco XML son el mínimo que Excel acepta; ninguno depende de los datos salvo la hoja, así que
 * están inline en vez de en archivos aparte.
 */
export function aXlsx(
  encabezados: readonly string[],
  filas: readonly unknown[][],
  nombreHoja = "Histórico",
): Uint8Array<ArrayBuffer> {
  return zip([
    {
      nombre: "[Content_Types].xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    },
    {
      nombre: "_rels/.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nombre: "xl/workbook.xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        // El nombre de hoja tiene un límite duro de 31 caracteres y no puede traer `[]:*?/\`;
        // pasarse de eso es otro archivo que Excel se niega a abrir.
        `<sheets><sheet name="${xml(nombreHoja.replace(/[[\]:*?/\\]/g, " ").slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    },
    { nombre: "xl/worksheets/sheet1.xml", contenido: hojaXml(encabezados, filas) },
  ]);
}

/** El MIME de un `.xlsx`. Vive acá para que no se escriba a mano en cada `Blob`. */
export const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
