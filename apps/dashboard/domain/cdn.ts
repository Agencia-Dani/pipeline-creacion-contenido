// Dominio puro: qué URLs de terceros tiene permitido buscar el server.
//
// 🔒 **Esto NO es cosmético: es lo que impide que los proxies del cockpit sean un SSRF.** Sin
// allowlist, cualquiera con sesión pediría `?u=http://169.254.169.254/…` y el server lo iría a
// buscar desde adentro de la red de Vercel.
//
// Vive acá y no dentro de una route porque **dos routes lo usan** (`/api/miniatura` y
// `/api/video`), y un control de seguridad duplicado es el que alguien endurece en un lado y no en
// el otro. Un archivo, un dueño, con test.

/**
 * Los CDN de los que se sirven las miniaturas y los mp4 de Instagram y TikTok.
 *
 * 📏 **Medido, no supuesto** (2026-08-29): el `videoUrl` que devuelve `apify~instagram-scraper` sale
 * de `scontent-*.cdninstagram.com`, o sea del mismo sufijo que ya servía las miniaturas. La lista no
 * cambió al sumar los videos.
 *
 * Se compara por **sufijo de host**, así que `evil-cdninstagram.com` NO entra (no termina en
 * `.cdninstagram.com`) y `scontent-lhr11-1.cdninstagram.com` sí.
 */
export const HOSTS_CDN_PERMITIDOS = [
  ".cdninstagram.com",
  ".fbcdn.net",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
] as const;

/** La URL parseada si se puede ir a buscar, `null` si no. Solo `https`. */
export function urlDeCdnPermitida(cruda: string): URL | null {
  let url: URL;
  try {
    url = new URL(cruda);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return HOSTS_CDN_PERMITIDOS.some((sufijo) => url.hostname.endsWith(sufijo)) ? url : null;
}

/**
 * El `Content-Disposition` de una descarga, a partir de un nombre cualquiera.
 *
 * 🩸 **Existe por un 500 medido en vivo el 2026-08-29, y ningún test lo hubiera encontrado.** El
 * nombre sale del caption del video, y un caption trae emojis: *"Who are the people behind the
 * scenes of the stock market?📈"*. Las cabeceras HTTP son **ByteStrings latin-1**, así que
 * `new Headers()` tira `TypeError: character at index 94 has a value of 55357` y la descarga
 * devuelve 500. Los tests usaban títulos ASCII y pasaban en verde.
 *
 * La salida lleva **las dos formas**, que es lo que dice la RFC 6266:
 *  · `filename=` con el nombre pelado a ASCII, para que la cabecera sea representable siempre;
 *  · `filename*=UTF-8''…` con el nombre completo, que es el que usa cualquier browser moderno.
 *
 * Si al sacar lo no-ASCII no queda nada (un título entero en japonés, o solo emojis), el fallback es
 * `video`: un `.mp4` pelado sin nombre confunde más que un nombre genérico.
 */
export function cabeceraDeDescarga(crudo: string | null | undefined, extension = "mp4"): string {
  const base = (crudo ?? "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  const completo = `${base || "video"}.${extension}`;
  // Solo imprimibles ASCII. `\x7F` (DEL) también se va: es representable pero no es un nombre.
  const ascii = base.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
  const seguro = `${ascii || "video"}.${extension}`;

  return `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(completo)}`;
}
