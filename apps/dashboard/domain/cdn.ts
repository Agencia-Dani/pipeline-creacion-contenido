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
