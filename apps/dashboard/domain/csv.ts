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
 * Filas + encabezados → un CSV completo, listo para descargar.
 *
 * **CRLF** y no `\n`: es lo que pide RFC 4180 y lo que Excel espera dentro de un campo citado.
 *
 * **BOM al principio.** Sin él, Excel abre el archivo en la codificación local y *Comunicación*
 * llega como *ComunicaciÃ³n*. Es el detalle que decide si el reemplazo del Sheet se siente igual
 * de bueno o peor, y cuesta tres bytes.
 */
export function aCsv(encabezados: readonly string[], filas: readonly unknown[][]): string {
  const lineas = [encabezados.map(celda).join(","), ...filas.map((f) => f.map(celda).join(","))];
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
