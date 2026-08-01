import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// El proxy de miniaturas. Existe por una razón concreta y medida: **Instagram sirve sus imágenes
// con `cross-origin-resource-policy: same-origin`**, así que un `<img src="https://…cdninstagram
// .com/…">` desde nuestro dominio lo bloquea el browser SIEMPRE — no importa si la URL está
// fresca. Hasta D7 no se notaba porque Airtable re-hosteaba la imagen; al guardar la URL cruda,
// el feed entero quedó sin miniaturas. Servirla desde nuestro origen es lo único que lo arregla.
//
// Y de paso resuelve el segundo problema, que el proxy solo no resolvería: la URL viene **firmada
// y con expiry de ~5 días** (medido: `oe=6A7407DD` → 2026-08-06 sobre un scrape del 01-08), o sea
// menos que la cadencia semanal. Por eso la primera vez que alguien mira una miniatura se copia a
// Supabase Storage, y de ahí en adelante ya no depende del CDN de nadie.
//
// 🔒 Auth: esta ruta la cubre `proxy.ts` (solo `/api/engine` es pública), así que sin sesión
// devuelve un redirect a /login y la tarjeta cae a su placeholder. Si algún día se agrega
// `/api/miniatura` a `esRutaPublica`, esto pasa a ser un endpoint anónimo — no hacerlo.

export const dynamic = "force-dynamic";

const BUCKET = "miniaturas";

// Allowlist por sufijo de host. **No es cosmética: es lo que impide que esto sea un SSRF.** Sin
// ella, cualquiera con sesión pediría `?u=http://169.254.169.254/…` y el server lo buscaría.
const HOSTS_PERMITIDOS = [
  ".cdninstagram.com",
  ".fbcdn.net",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
];

function urlPermitida(cruda: string): URL | null {
  let url: URL;
  try {
    url = new URL(cruda);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return HOSTS_PERMITIDOS.some((sufijo) => url.hostname.endsWith(sufijo)) ? url : null;
}

/**
 * La clave en Storage sale del **pathname**, no de la URL entera.
 *
 * El pathname trae el id estable del asset (`/v/t51.82787-15/763618283_…_n.jpg`); la query es la
 * firma, y cambia cada vez que el motor vuelve a scrapear el mismo video. Hasheando la URL
 * completa, cada re-scrape guardaría una copia nueva de la misma imagen.
 */
const claveDe = (url: URL) => `${createHash("sha256").update(url.pathname).digest("hex")}.jpg`;

export async function GET(request: Request) {
  const cruda = new URL(request.url).searchParams.get("u");
  if (!cruda) return new Response("falta ?u", { status: 400 });

  const url = urlPermitida(cruda);
  if (!url) return new Response("origen no permitido", { status: 400 });

  const supabase = createAdminClient();
  const clave = claveDe(url);
  const publica = supabase.storage.from(BUCKET).getPublicUrl(clave).data.publicUrl;

  // Camino rápido: ya está copiada. Se redirige en vez de pasar los bytes por acá, así la
  // siguiente carga va directo a Storage y esta función no vuelve a ejecutarse.
  const enStorage = await fetch(publica, { method: "HEAD" }).catch(() => null);
  if (enStorage?.ok) return Response.redirect(publica, 302);

  // Primera vez: se busca en el CDN. El UA de browser importa — sin él algunos edges responden 403.
  const origen = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  }).catch(() => null);

  if (!origen?.ok) {
    // URL vencida o caída: la tarjeta ya sabe caer a su placeholder con el `onError`.
    return new Response("no disponible en el origen", { status: 404 });
  }

  const bytes = await origen.arrayBuffer();
  const tipo = origen.headers.get("content-type") ?? "image/jpeg";

  // La copia es best-effort: si Storage falla, igual devolvemos la imagen. Vale más un feed que
  // se ve hoy que un cache perfecto — y el próximo intento la vuelve a subir.
  const { error } = await supabase.storage.from(BUCKET).upload(clave, bytes, {
    contentType: tipo,
    upsert: true,
    // Sin esto Storage sirve el objeto con `no-cache` y el browser lo vuelve a pedir en cada
    // carga del feed: 147 requests por pantalla para imágenes que no cambian nunca.
    cacheControl: "31536000",
  });
  if (error) console.error(`[miniatura] no se pudo cachear ${clave}: ${error.message}`);

  return new Response(bytes, {
    headers: {
      "Content-Type": tipo,
      // `immutable` es honesto acá: la clave sale del contenido (el path del asset), así que esta
      // respuesta nunca cambia de significado.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
