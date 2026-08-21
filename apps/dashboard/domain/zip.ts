// Dominio puro: el contenedor de los formatos Office. Sin IO, sin dependencias.
//
// Salió de `domain/xlsx.ts` cuando apareció el segundo consumidor: un `.docx` **es el mismo ZIP con
// otro XML adentro** (ADR-071 §"sin dependencia", Fase 5 del plan de colecciones). Acá vive lo que
// los dos comparten y nada más — el contenedor y el escape que su contenido pide. Lo que cada
// formato tiene de propio (las hojas, los párrafos) se queda en su archivo.
//
// Corre igual en el server y en el browser (solo `Uint8Array` y aritmética), que es lo que permite
// armar el archivo **en el cliente**: el server manda datos y acá se vuelven bytes.

/**
 * Escapa un texto para meterlo en XML.
 *
 * 🔒 **También saca los caracteres de control, y eso no es paranoia.** XML 1.0 prohíbe casi todos
 * (menos tab, LF y CR), y un solo byte de esos vuelve el archivo **ilegible para Excel** — no lo
 * muestra mal: se niega a abrirlo. Los `script` vienen de una transcripción automática, o sea de
 * texto que nadie revisó, que es exactamente de donde salen esos bytes.
 */
export function escaparXml(v: string): string {
  return v
    // Los unicos caracteres de control que XML 1.0 admite son tab (09), LF (0A) y CR (0D). El resto
    // del rango C0 hace que Excel SE NIEGUE A ABRIR el archivo (no lo muestra mal: no lo abre), y
    // los `script` vienen de transcripcion automatica, que es justo de donde salen esos bytes.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


const tablaCrc = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tablaCrc[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** UTF-8 sin `TextEncoder`, para que esto corra igual en cualquier lado. */
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let punto = s.codePointAt(i) as number;
    if (punto > 0xffff) i++; // el par suplente ya se consumió entero
    if (punto < 0x80) out.push(punto);
    else if (punto < 0x800) out.push(0xc0 | (punto >> 6), 0x80 | (punto & 63));
    else if (punto < 0x10000)
      out.push(0xe0 | (punto >> 12), 0x80 | ((punto >> 6) & 63), 0x80 | (punto & 63));
    else
      out.push(
        0xf0 | (punto >> 18),
        0x80 | ((punto >> 12) & 63),
        0x80 | ((punto >> 6) & 63),
        0x80 | (punto & 63),
      );
  }
  return new Uint8Array(out);
}

type Entrada = { nombre: string; datos: Uint8Array; crc: number; offset: number };

/**
 * Un ZIP con los archivos **guardados sin comprimir** (método 0, "store").
 *
 * Sin deflate a propósito: comprimir pediría `zlib` (que no existe en el browser, donde esto corre)
 * o una implementación propia, y el archivo resultante son ~1 MB que se bajan una vez. El formato
 * acepta store perfectamente y Excel no distingue.
 *
 * Todo little-endian, que es lo que manda el formato ZIP.
 */
export function zip(archivos: readonly { nombre: string; contenido: string }[]): Uint8Array<ArrayBuffer> {
  const entradas: Entrada[] = [];
  const trozos: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  const empujar = (bytes: number[] | Uint8Array) => {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    trozos.push(b);
    offset += b.length;
  };

  for (const { nombre, contenido } of archivos) {
    const datos = utf8(contenido);
    const nombreBytes = utf8(nombre);
    const crc = crc32(datos);
    const inicio = offset;

    empujar([
      ...u32(0x04034b50), // firma del encabezado local
      ...u16(20), // versión mínima
      ...u16(0x0800), // bandera: los nombres van en UTF-8
      ...u16(0), // método 0 = store
      ...u16(0), ...u16(0), // hora y fecha: 0, no las lee nadie
      ...u32(crc),
      ...u32(datos.length), // comprimido == original, porque no se comprime
      ...u32(datos.length),
      ...u16(nombreBytes.length),
      ...u16(0), // sin campo extra
    ]);
    empujar(nombreBytes);
    empujar(datos);

    entradas.push({ nombre, datos, crc, offset: inicio });
  }

  const inicioDirectorio = offset;
  for (const e of entradas) {
    const nombreBytes = utf8(e.nombre);
    empujar([
      ...u32(0x02014b50), // firma del directorio central
      ...u16(20), ...u16(20),
      ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(e.crc),
      ...u32(e.datos.length), ...u32(e.datos.length),
      ...u16(nombreBytes.length),
      ...u16(0), ...u16(0), // sin extra, sin comentario
      ...u16(0), ...u16(0), // disco 0, atributos internos
      ...u32(0), // atributos externos
      ...u32(e.offset),
    ]);
    empujar(nombreBytes);
  }

  empujar([
    ...u32(0x06054b50), // fin del directorio central
    ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(offset - inicioDirectorio),
    ...u32(inicioDirectorio),
    ...u16(0), // sin comentario
  ]);

  const total = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(new ArrayBuffer(total));
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.length;
  }
  return salida as Uint8Array<ArrayBuffer>;
}
