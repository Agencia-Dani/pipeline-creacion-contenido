import assert from "node:assert/strict";
import { test } from "node:test";
import { urlDeCdnPermitida } from "./cdn.ts";

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
