// Dominio puro: serializar filas a CSV. Sin IO.
//
// Existe por [ADR-057](../../../docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md):
// el Google Sheet Histórico se muere porque `outputs` ya es el histórico canónico (ADR-014), pero
// el onboarding le promete al equipo *"el archivo de lo ya elegido"* y el one-pager le promete al
// jefe un **descargable a Excel**. Esto es lo que reemplaza esa promesa — y por eso el orden del
// ADR es *export primero, nodos después*: sin esto, matar el Sheet sería romper la promesa.

/**
 * Un valor de celda, escapado según RFC 4180.
 *
 * Se cita **siempre** en vez de solo cuando hace falta, y es a propósito: la columna que más
 * importa es `SCRIPT`, que trae transcripciones enteras con saltos de línea, comas y comillas.
 * Un escapado condicional acierta en las 14 columnas fáciles y falla justo en la que rompe el
 * archivo entero — y falla corriendo las columnas, que es la clase de error que se ve recién
 * cuando alguien abre el Excel.
 *
 * `null`/`undefined` van como celda vacía, no como el string "null".
 */
export function celda(v: unknown): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

/**
 * El delimitador es **TAB**, no coma, y el archivo se entrega en **UTF-16LE** (ver `aUtf16le`).
 * Los dos van juntos: son una sola decisión, y separarlos rompe el archivo.
 *
 * **El porqué, medido en el Excel de Mani el 2026-08-08** (región Colombia, la misma de Majo y
 * Jero, que son quienes lo abren):
 *
 * | qué se probó | columnas | acentos |
 * |---|---|---|
 * | BOM UTF-8 + coma | ❌ todo en la columna A | ✅ |
 * | BOM UTF-8 + `sep=,` | ✅ | ❌ *M√©tricas* |
 * | BOM UTF-8 + tab | ❌ todo en la columna A | ✅ |
 * | **UTF-16LE + tab** | ✅ | ✅ |
 *
 * Excel **no detecta el delimitador**: lo toma del ajuste regional, y en región CO el separador de
 * lista es `;`, así que un CSV con comas le cae entero en la columna A — con las comillas de
 * escape a la vista y el `SCRIPT` partiendo la fila en dos. La directiva propietaria `sep=,` sí le
 * fija el delimitador, **pero al leerla Excel deja de mirar el BOM** y cae a MacRoman: arregla las
 * columnas y rompe los acentos. UTF-16LE es la única combinación que pasa las dos, porque a un
 * archivo UTF-16 Excel lo trata como tab-delimited sin preguntarle al locale.
 *
 * **El costo, elegido a sabiendas:** el archivo ya no es un CSV de manual — se sigue llamando
 * `.csv` y la UI sigue diciendo *Descargar CSV* (es el nombre del entregable, ADR-057), pero un
 * parser que asuma coma y UTF-8 necesita `encoding="utf-16"` y `sep="\t"`. Y pesa el doble. Se
 * acepta porque el consumidor declarado es Excel y hoy no hay ningún consumidor máquina.
 *
 * **CRLF** y no `\n`: es lo que pide RFC 4180 y lo que Excel espera dentro de un campo citado.
 *
 * El `﻿` del principio es el BOM. En UTF-16LE se convierte en los bytes `ff fe`, que son los
 * que le dicen a Excel *"esto es UTF-16"* — o sea, es lo que dispara todo lo de arriba, no un
 * detalle heredado.
 */
export function aCsv(encabezados: readonly string[], filas: readonly unknown[][]): string {
  const lineas = [encabezados.map(celda).join("\t"), ...filas.map((f) => f.map(celda).join("\t"))];
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

/**
 * El texto → sus bytes en UTF-16LE, que es como tiene que viajar el archivo (ver `aCsv`).
 *
 * Existe porque **no hay forma nativa de hacerlo**: `TextEncoder` solo emite UTF-8, así que un
 * `new Blob([texto])` mandaría UTF-8 y perdería lo único que hace que Excel abra bien el archivo.
 *
 * Recorre **unidades de código**, no caracteres, y es a propósito: `charCodeAt` devuelve las dos
 * mitades de un par suplente por separado, así que los emoji de calificación —que ADR-057 verificó
 * contra prod— se copian tal cual en vez de mutilarse.
 */
// El `<ArrayBuffer>` no es adorno: sin él TS infiere `ArrayBufferLike`, que incluye
// `SharedArrayBuffer`, y `new Blob([...])` no lo acepta como `BlobPart`.
export function aUtf16le(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(texto.length * 2);
  const vista = new DataView(bytes.buffer);
  for (let i = 0; i < texto.length; i++) vista.setUint16(i * 2, texto.charCodeAt(i), true);
  return bytes;
}
