// Dominio puro (C3): de un pegote de texto a enlaces de video identificados. Sin IO, sin React.
//
// ─────────────────────────── LA INVARIANTE (ADR-031) ───────────────────────────
// Para Instagram, `processed_items.external_id` (el id numérico que Apify devuelve en `item.id`)
// es EXACTAMENTE el shortcode de la URL leído como base64. Verificado 381/381 contra la base viva.
// Para TikTok el id ya viaja crudo en la URL (`/video/<id>`), 27/27.
//
// De esa igualdad cuelga toda la herramienta: es lo que deja que un link pegado a mano entre al
// dedup del motor con un INSERT plano en `processed_items`, sin tocar un solo nodo de n8n.
//
// ⚠️ Si algún día `Normalizar IG` (Workflows/workflow-short-form-content/workflow.json) pasa a
// preferir `item.shortCode` sobre `item.id`, esta igualdad se rompe y el dedup entre las dos
// herramientas se cae EN SILENCIO. Los 8 pares reales de enlace.test.ts son la alarma.

export type Plataforma = "instagram" | "tiktok";

export type EnlaceVideo = {
  plataforma: Plataforma;
  external_id: string;
  url: string; // canónica, la misma forma que graba el motor — no la que pegaron
};

export type EnlaceInvalido = { texto: string; razon: string };

export type LoteDeEnlaces = {
  validos: EnlaceVideo[];
  invalidos: EnlaceInvalido[];
};

/**
 * La identidad de un video para comparar contra lo que ya tenemos.
 *
 * Lleva la plataforma adentro y no es paranoia: el `external_id` de Instagram es un entero de 19
 * dígitos y el de TikTok también, así que dos ids de plataformas distintas pueden coincidir sin
 * que nada avise. Es una sola función porque hay **tres** lugares que la calculan (el dedup del
 * pegote, la cola y la memoria del motor) y tres formatos distintos serían tres bugs mudos.
 */
export function claveDe(e: { plataforma: Plataforma; external_id: string }): string {
  return `${e.plataforma}:${e.external_id}`;
}

// Alfabeto base64 de Instagram (el estándar url-safe).
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// El shortcode leído como base64 big-endian. BigInt y no Number a propósito: los ids son de 19
// dígitos y float64 solo tiene 15 de precisión — con Number, 3919277956157638861 se redondea y el
// dedup falla justo en los casos que importan.
// (`BigInt(0)` y no `0n`: el tsconfig apunta a ES2017 y los literales bigint piden ES2020.)
export function shortcodeAExternalId(shortcode: string): string {
  let n = BigInt(0);
  const base = BigInt(64);
  for (const c of shortcode) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) return "";
    n = n * base + BigInt(i);
  }
  return n.toString();
}

// Cualquier cosa con pinta de link dentro de texto libre: un chat de WhatsApp pegado entero, una
// lista con guiones, uno por línea o separados por comas tienen que funcionar igual.
const TOKEN_LINK = /https?:\/\/[^\s<>"']+|(?:www\.)?(?:instagram|tiktok)\.com\/[^\s<>"']+/gi;

const IG_VIDEO = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,30})/i;
const TT_VIDEO = /tiktok\.com\/@([\w.-]+)\/video\/(\d{5,25})/i;
const TT_CORTO = /(?:vm\.tiktok\.com\/|tiktok\.com\/t\/)/i;

// Los links compartidos desde las apps traen cola (`?igsh=…`, `?is_from_webapp=…`) y a veces
// puntuación pegada del texto que los rodeaba.
function limpiar(token: string): string {
  return token.split(/[?#]/)[0].replace(/[.,;:!)\]}>]+$/, "");
}

function clasificar(token: string): EnlaceVideo | EnlaceInvalido {
  const url = limpiar(token);

  const ig = IG_VIDEO.exec(url);
  if (ig) {
    const shortcode = ig[1];
    const external_id = shortcodeAExternalId(shortcode);
    if (!external_id) return { texto: token, razon: "El código del reel tiene caracteres raros." };
    // `/p/` y no `/reel/`: es la forma que Apify guarda en processed_items.url.
    return {
      plataforma: "instagram",
      external_id,
      url: `https://www.instagram.com/p/${shortcode}/`,
    };
  }

  const tt = TT_VIDEO.exec(url);
  if (tt) {
    return {
      plataforma: "tiktok",
      external_id: tt[2],
      url: `https://www.tiktok.com/@${tt[1]}/video/${tt[2]}`,
    };
  }

  if (TT_CORTO.test(url)) {
    return {
      texto: token,
      razon: "Es un link corto de TikTok. Abrilo y copiá el link largo (el que tiene /video/).",
    };
  }

  if (/instagram\.com/i.test(url)) {
    return { texto: token, razon: "Es un link de Instagram pero no de un reel o post." };
  }
  if (/tiktok\.com/i.test(url)) {
    return { texto: token, razon: "Es un link de TikTok pero no de un video." };
  }
  return { texto: token, razon: "No es un link de Instagram ni de TikTok." };
}

function esValido(e: EnlaceVideo | EnlaceInvalido): e is EnlaceVideo {
  return "external_id" in e;
}

// Solo se reportan como inválidos los tokens que YA parecían un link: si pegan un chat entero, las
// palabras sueltas se ignoran en silencio en vez de llenar la pantalla de ruido.
export function parsearEnlaces(texto: string): LoteDeEnlaces {
  const validos: EnlaceVideo[] = [];
  const invalidos: EnlaceInvalido[] = [];
  const vistos = new Set<string>();

  for (const token of texto.match(TOKEN_LINK) ?? []) {
    const resultado = clasificar(token);
    if (esValido(resultado)) {
      const clave = claveDe(resultado);
      if (vistos.has(clave)) continue; // pegar el mismo link dos veces en el lote no lo duplica
      vistos.add(clave);
      validos.push(resultado);
    } else if (!invalidos.some((i) => i.texto === resultado.texto)) {
      invalidos.push(resultado);
    }
  }

  return { validos, invalidos };
}

/**
 * Reparte los links válidos en los tres montones que decide la pantalla: los que se van a
 * transcribir y los dos que **ya no hace falta pagar**.
 *
 * Existe porque hasta el 2026-08-07 el aviso era un número al final (*"2 ya estaban"*) y llegaba
 * **después** de encolar. Dos problemas: no decía cuáles, y no miraba la memoria del motor.
 *
 * 🩸 **Los dos montones no significan lo mismo, y por eso están separados:**
 *  · `enCola` — ya se pidió en ESTE cockpit. El `ignoreDuplicates` del upsert lo iba a descartar
 *    igual, así que no había gasto: lo que faltaba era decirlo antes y por su nombre.
 *  · `vistosPorElMotor` — está en `processed_items`. Acá **sí había gasto silencioso**: el upsert
 *    no consulta esa tabla, así que se transcribía y se pagaba de nuevo sin una palabra.
 *    Y no siempre es un error querer transcribirlo: el motor escribe en `processed_items` todo lo
 *    que *consideró*, aunque el pre-trim o el gate lo hayan matado antes de transcribirlo, así que
 *    puede no existir el guion en ningún lado. Por eso se ofrece quitarlos y no se quitan solos.
 *
 * Precedencia: estar en la cola gana, porque es el montón donde el guion o está o viene en camino.
 */
export type Reparto = {
  nuevos: EnlaceVideo[];
  enCola: EnlaceVideo[];
  vistosPorElMotor: EnlaceVideo[];
};

export function repartirEnlaces(
  validos: readonly EnlaceVideo[],
  enCola: ReadonlySet<string>,
  vistosPorElMotor: ReadonlySet<string>,
): Reparto {
  const reparto: Reparto = { nuevos: [], enCola: [], vistosPorElMotor: [] };
  for (const e of validos) {
    const clave = claveDe(e);
    if (enCola.has(clave)) reparto.enCola.push(e);
    else if (vistosPorElMotor.has(clave)) reparto.vistosPorElMotor.push(e);
    else reparto.nuevos.push(e);
  }
  return reparto;
}
