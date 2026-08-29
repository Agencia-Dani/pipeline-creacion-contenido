import assert from "node:assert/strict";
import { test } from "node:test";
import { cabeceraDeDescarga, urlDeCdnPermitida } from "./cdn.ts";

// Los tests del guard de SSRF. Cada uno de estos es una request que alguien con sesión podría
// mandar a mano: lo que se prueba no es el happy path, es lo que tiene que rebotar.

test("deja pasar el CDN de las miniaturas", () => {
  const u = urlDeCdnPermitida("https://scontent-lhr11-1.cdninstagram.com/v/t51.82787-15/x.jpg");
  assert.equal(u?.hostname, "scontent-lhr11-1.cdninstagram.com");
});

test("deja pasar el CDN de los mp4, que es el mismo sufijo (medido el 29/08)", () => {
  const u = urlDeCdnPermitida("https://scontent-lhr11-1.cdninstagram.com/o1/v/t2/f2/m86/AQN.mp4?oe=6A94F4CF");
  assert.ok(u !== null);
});

test("la metadata de la red interna de la nube rebota", () => {
  // El ataque concreto: sin allowlist, esto le pide las credenciales de la instancia al server.
  assert.equal(urlDeCdnPermitida("http://169.254.169.254/latest/meta-data/"), null);
});

test("un host que solo TERMINA pareciéndose no entra", () => {
  // Por eso se compara por sufijo con el punto adelante y no con `includes`.
  assert.equal(urlDeCdnPermitida("https://evil-cdninstagram.com/x.jpg"), null);
  assert.equal(urlDeCdnPermitida("https://cdninstagram.com.attacker.net/x.jpg"), null);
});

test("http pelado rebota aunque el host esté permitido", () => {
  assert.equal(urlDeCdnPermitida("http://scontent.cdninstagram.com/x.jpg"), null);
});

test("basura que no es una URL devuelve null en vez de tirar", () => {
  assert.equal(urlDeCdnPermitida("no soy una url"), null);
  assert.equal(urlDeCdnPermitida(""), null);
});

// ── cabeceraDeDescarga ───────────────────────────────────────────────────────
//
// 🩸 Todos estos son el mismo 500 del 29/08 visto desde ángulos distintos: una cabecera HTTP no
// puede llevar nada fuera de latin-1, y el nombre viene de un caption de Instagram.

test("un emoji en el nombre no rompe la cabecera (el 500 medido)", () => {
  const c = cabeceraDeDescarga("julias.algos - the stock market?\u{1F4C8}");
  // Lo que tiraba `new Headers()`: cualquier code unit por encima de 255 en la parte `filename=`.
  const plano = c.match(/filename="([^"]+)"/)![1];
  assert.ok([...plano].every((ch) => ch.charCodeAt(0) <= 255), `no representable: ${plano}`);
  // El `?` también se va: es de los que un sistema de archivos rechaza.
  assert.equal(plano, "julias.algos - the stock market.mp4");
});

test("el nombre completo viaja igual, en filename*", () => {
  const c = cabeceraDeDescarga("cuánto vale \u{1F4C8}");
  assert.match(c, /filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(c.split("filename*=UTF-8''")[1]), "cuánto vale \u{1F4C8}.mp4");
});

test("un nombre entero no-ASCII no deja un archivo llamado solo .mp4", () => {
  assert.match(cabeceraDeDescarga("\u{1F4C8}\u{1F4C9}\u{1F525}"), /filename="video\.mp4"/);
});

test("sin nombre cae a video.mp4", () => {
  assert.match(cabeceraDeDescarga(null), /filename="video\.mp4"/);
  assert.match(cabeceraDeDescarga("   "), /filename="video\.mp4"/);
});

test("las comillas y las barras se van: cerrarían la cabecera o el path", () => {
  const c = cabeceraDeDescarga('un "titulo" con /barras/');
  // La barra del final se vuelve espacio y el `trim` se lo come: sin espacio antes del punto.
  assert.equal(c.match(/filename="([^"]+)"/)![1], "un titulo con barras.mp4");
});
