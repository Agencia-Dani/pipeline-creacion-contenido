import { cabeceraDeDescarga, urlDeCdnPermitida } from "@/domain/cdn";

// El proxy de videos. Sirve el mp4 de un reel desde nuestro origen para que el browser lo BAJE.
//
// 🔑 **Por qué un proxy y no un link directo al CDN.** El atributo `download` de un `<a>` **lo
// ignora el browser cuando el href es de otro origen**: un link a `cdninstagram.com` abriría el
// video en una pestaña en vez de bajarlo, y el editor terminaría haciendo "guardar como" a mano —
// que es justo el paso manual que esto viene a sacar. Sirviéndolo desde acá, el
// `Content-Disposition` manda y el archivo cae con su nombre.
//
// 📏 **Y la razón NO es la misma que la de `/api/miniatura`, aunque el proxy se parezca.** Medido el
// 2026-08-29: el CDN sirve los mp4 con `cross-origin-resource-policy: cross-origin`, al revés que
// las imágenes (`same-origin`). O sea que el browser SÍ dejaría cargar el video desde otro origen —
// lo que no deja es bajarlo con nombre. Vale saberlo antes de "simplificar" esto de más.
//
// 🔴 **Y NO se copia a Storage, al revés que `/api/miniatura`.** Allá el archivo pesa kilobytes y
// la URL dura ~5 días, así que cachear sale barato y arregla el vencimiento. Acá son ~33 MB por
// video (medido: 32,9 MB un reel de 93 s) y la decisión del 29/08 fue **bajar al disco, sin
// guardar**: el respaldo vive en la máquina del editor, como hoy con savefrom.net, y el cockpit no
// se vuelve un depósito de video que alguien tiene que pagar y podar.
//
// 📡 **La respuesta se hace streaming** (`origen.body` tal cual, sin `arrayBuffer`): 33 MB en
// memoria por request es lo que convierte esto en un problema de la función, y además el límite de
// tamaño de respuesta de Vercel aplica al body materializado, no al que pasa de largo.
//
// 🔒 Auth: la cubre `proxy.ts` (solo `/api/engine` es pública), así que sin sesión esto redirige a
// /login. Si algún día alguien agrega `/api/video` a `esRutaPublica`, pasa a ser un endpoint
// anónimo que baja archivos de 33 MB a cuenta nuestra — no hacerlo.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cruda = params.get("u");
  if (!cruda) return new Response("falta ?u", { status: 400 });

  const url = urlDeCdnPermitida(cruda);
  if (!url) return new Response("origen no permitido", { status: 400 });

  // El mismo UA de browser que la miniatura: sin él algunos edges del CDN responden 403.
  const origen = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  }).catch(() => null);

  if (!origen?.ok || origen.body === null) {
    // Lo más probable acá es que la firma haya vencido (~38 h). Quien llame vuelve a pedirla.
    return new Response("no disponible en el origen", { status: 404 });
  }

  const cabeceras = new Headers({
    "Content-Type": origen.headers.get("content-type") ?? "video/mp4",
    "Content-Disposition": cabeceraDeDescarga(params.get("nombre")),
    // Sin cache: la URL firmada cambia en cada compra, así que cachear guardaría una copia por
    // firma de un archivo que ya está en el disco de quien lo bajó.
    "Cache-Control": "no-store",
  });
  const largo = origen.headers.get("content-length");
  if (largo) cabeceras.set("Content-Length", largo);

  return new Response(origen.body, { headers: cabeceras });
}
