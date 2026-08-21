import type { Plataforma } from "@/domain/enlace";

// La compra de metadata (ADR-072 §5, ADR-073 §4). El BFF es el único portador de secretos.
//
// 🔑 **Por qué este actor y no otro.** `apify~instagram-scraper` **ya está en el motor** (nodo
// `Apify — IG Reels`) y ya se paga; verificado contra la API de Apify que acepta `directUrls`, o sea
// una lista de URLs de post. Traer un actor nuevo sería un proveedor más que auditar para el mismo
// dato.
//
// 📏 **Los nombres de campo están MEDIDOS, no adivinados** (2026-08-21, una llamada real):
// `caption · ownerUsername · ownerFullName · displayUrl · likesCount · videoPlayCount ·
// commentsCount · shortCode · id`.
// 🩸 **Y ahí hay una trampa que costaría un bug mudo: `videoViewCount` vuelve `null` y las
// reproducciones están en `videoPlayCount`.** El nombre "obvio" es el vacío. La cadena de fallback
// de abajo es **la misma** que usa `Normalizar IG` en el motor, letra por letra, para que el mismo
// video no muestre números distintos en el Feed y en una colección.
//
// ✅ **Y la llave cierra:** para `/p/DEKrF2ryWJE/`, `item.id` de Apify da `3533826375939613252` y
// `shortcodeAExternalId` de `domain/enlace.ts` da exactamente lo mismo. La metadata comprada
// aterriza en la fila que le corresponde y no en otra.

/** Lo que se compró de un video. `null` en un campo = el scrape no lo trajo, no "es cero". */
export type MetaDeVideo = {
  plataforma: Plataforma;
  external_id: string;
  url: string;
  titulo: string | null;
  referente: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  seguidores: number | null;
};

/**
 * Tope del título. El `caption` de Instagram es el copy entero del post: los hay de 2.000
 * caracteres con hashtags. La tarjeta muestra dos líneas, así que guardar más es pagar storage por
 * texto que nadie lee, y el corte en la primera línea es lo que más se parece a un título.
 */
const TOPE_TITULO = 200;

/**
 * Presupuesto de la llamada. Bajo a propósito: `transcribir/page.tsx` corre con `maxDuration = 60`,
 * así que un timeout más largo lo mata la función antes que el `AbortSignal` y el error que se ve
 * es el equivocado. Si no alcanza, **no pasa nada**: los videos ya entraron a la colección y lo que
 * falta se puede volver a pedir (ver `necesitaEnriquecer`).
 */
const PRESUPUESTO_MS = 45_000;

/** Cuántas URLs por llamada. El costo dominante del actor es arrancar, así que conviene un lote
 *  grande y una sola corrida, no muchas chicas. */
export const TOPE_POR_LOTE = 50;

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texto(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** El caption completo → algo que se pueda leer como título. */
function tituloDeCaption(caption: unknown): string | null {
  const s = texto(caption);
  if (!s) return null;
  const primeraLinea = s.split("\n")[0].trim() || s;
  return primeraLinea.slice(0, TOPE_TITULO);
}

/**
 * Le compra a Apify la metadata de estas URLs.
 *
 * 🔴 **Fail-open, sin excepciones.** Si Apify se cae, tarda o devuelve basura, esto devuelve `[]` y
 * el llamador sigue. Enriquecer es el adorno; agrupar es el trabajo, y el adorno no puede bloquear
 * el trabajo (invariante #1 de PLAN §2.5). Un `throw` acá dejaría a alguien sin poder armar una
 * colección porque un proveedor de terceros tuvo un mal día.
 */
export async function traerMetadata(urls: readonly string[]): Promise<MetaDeVideo[]> {
  if (urls.length === 0) return [];
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    // No se tira: es la misma política que el resto. Se avisa en el log del server y la colección
    // se arma igual, con los videos sin identificar.
    console.error("[apify] falta APIFY_TOKEN en las env vars: no se enriquece nada.");
    return [];
  }

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directUrls: urls.slice(0, TOPE_POR_LOTE),
          resultsType: "posts",
          // Uno por URL. Sin esto el actor puede traer el feed entero del perfil de cada link, que
          // es la diferencia entre pagar 50 items y pagar miles.
          resultsLimit: 1,
          addParentData: false,
        }),
        signal: AbortSignal.timeout(PRESUPUESTO_MS),
      },
    );
    if (!res.ok) {
      console.error(`[apify] respondió ${res.status} trayendo metadata de ${urls.length} videos.`);
      return [];
    }
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items.map(normalizar).filter((m): m is MetaDeVideo => m !== null);
  } catch (e) {
    console.error("[apify] no se pudo traer la metadata:", e);
    return [];
  }
}

/** Un item del dataset → nuestra forma. `null` si no se le puede sacar identidad. */
function normalizar(item: Record<string, unknown>): MetaDeVideo | null {
  // Mismo orden de preferencia que `Normalizar IG` del motor: primero `id` (el media id numérico),
  // que es el que `shortcodeAExternalId` produce desde una URL pegada.
  const external_id = String(item.id ?? item.shortCode ?? item.shortcode ?? "");
  const url = texto(item.url) ?? texto(item.inputUrl);
  if (!external_id || !url) return null;

  const usuario = texto(item.ownerUsername);

  return {
    plataforma: "instagram",
    external_id,
    url,
    titulo: tituloDeCaption(item.caption),
    // Con `@` adelante, que es como lo guarda el motor y como lo dibuja la tarjeta.
    referente: usuario ? `@${usuario.replace(/^@/, "")}` : null,
    thumbnail_url: texto(item.displayUrl),
    // ⚠️ La cadena exacta del motor. `videoViewCount` viene null y las reproducciones están en
    // `videoPlayCount`: medido, no supuesto.
    views: numero(item.videoViewCount) ?? numero(item.videoPlayCount) ?? numero(item.igPlayCount),
    likes: numero(item.likesCount),
    seguidores:
      numero(item.followersCount) ??
      numero(item.ownerFollowersCount) ??
      numero((item.metaData as Record<string, unknown> | undefined)?.followersCount),
  };
}
