import assert from "node:assert/strict";
import { unzipSync } from "node:zlib";

// El lector de ZIP de los tests, compartido por el `.xlsx` (ADR-071) y el `.docx` (Fase 5 de
// colecciones), que son el mismo contenedor con otro XML adentro.
//
// 🔑 **Los tests de estos formatos leen el ZIP de verdad y no strings**, porque acá el modo de falla
// es binario: el archivo abre o no abre. Es `node:zlib`, o sea el mismo unzip del sistema.
//
// No termina en `.test.ts` a propósito: `npm test` corre ese glob, y un archivo de helpers sin
// tests adentro haría fallar la corrida por "suite vacía".

/** Saca los archivos de un ZIP sin comprimir, leyendo su directorio central. */
export function leerZip(bytes: Uint8Array): Map<string, string> {
  const b = Buffer.from(bytes);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, "no hay End Of Central Directory: el ZIP está incompleto");

  const cantidad = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const archivos = new Map<string, string>();

  for (let i = 0; i < cantidad; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50, "firma del directorio central rota");
    const metodo = b.readUInt16LE(p + 10);
    const tamano = b.readUInt32LE(p + 24);
    const largoNombre = b.readUInt16LE(p + 28);
    const offset = b.readUInt32LE(p + 42);
    const nombre = b.subarray(p + 46, p + 46 + largoNombre).toString("utf8");

    assert.equal(b.readUInt32LE(offset), 0x04034b50, `firma local rota en ${nombre}`);
    const nombreLocal = b.readUInt16LE(offset + 26);
    const extraLocal = b.readUInt16LE(offset + 28);
    const datos = b.subarray(
      offset + 30 + nombreLocal + extraLocal,
      offset + 30 + nombreLocal + extraLocal + tamano,
    );
    archivos.set(nombre, metodo === 0 ? datos.toString("utf8") : unzipSync(datos).toString("utf8"));
    p += 46 + largoNombre + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return archivos;
}
