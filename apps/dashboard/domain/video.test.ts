import assert from "node:assert/strict";
import { test } from "node:test";
import { esTituloDeVerdad, fusionar, nombreDeArchivo, type ParteVideo } from "./video.ts";

// Cada test nombra la PROPIEDAD que se sostiene, no la función que llama, y lleva el porqué del
// caso: casi todos son un bug real medido contra prod el 2026-08-21.

const parte = (p: Partial<ParteVideo> = {}): ParteVideo => ({
  plataforma: "instagram",
  external_id: "abc123",
  url: "https://www.instagram.com/p/DEKrF2ryWJE/",
  ...p,
});

// ── El título disfrazado de URL ──────────────────────────────────────────────

test("una URL no es un título, aunque venga en el campo titulo", () => {
  // 🩸 `outputs` guarda la url en `titulo` en 129 filas (tipo = transcripcion_a_pedido). Ese
  // disfraz produjo el falso positivo del 21/08: un cruce contó 129 de 130 matches que eran filas
  // matcheando consigo mismas.
  assert.equal(esTituloDeVerdad("https://www.instagram.com/p/DEKrF2ryWJE/"), false);
  assert.equal(esTituloDeVerdad("http://tiktok.com/@x/video/1"), false);
  assert.equal(esTituloDeVerdad("Discipline over motivation."), true);
});

test("titulo vacío o en blanco no es título", () => {
  assert.equal(esTituloDeVerdad(""), false);
  assert.equal(esTituloDeVerdad("   "), false);
  assert.equal(esTituloDeVerdad(null), false);
  assert.equal(esTituloDeVerdad(undefined), false);
});

test("un título-URL NO tapa al título de verdad que viene después", () => {
  // Es el caso exacto de un video que está en Transcribir (su output tiene la url como título) y
  // además en el histórico del Feed (que sí tiene el título real).
  const [v] = fusionar([
    parte({ titulo: "https://www.instagram.com/p/DEKrF2ryWJE/" }),
    parte({ titulo: "Instead of talking about points, talk about points of view." }),
  ]);
  assert.equal(v.titulo, "Instead of talking about points, talk about points of view.");
});

test("si el ÚNICO título es una URL, el video queda sin título en vez de mentir", () => {
  const [v] = fusionar([parte({ titulo: "https://www.instagram.com/p/DEKrF2ryWJE/" })]);
  assert.equal(v.titulo, null);
});

// ── La fusión ────────────────────────────────────────────────────────────────

test("gana campo a campo, no objeto a objeto", () => {
  // 🔑 La propiedad que hace posible estandarizar la tarjeta. Ninguna fuente está completa: el Feed
  // tiene métricas y solo 34 de 101 tienen miniatura; el histórico tiene título y referente y 0 de
  // 172 tienen miniatura; videos_meta tiene la miniatura. Si ganara el objeto entero, el primero
  // taparía con sus null lo que el siguiente sí sabía.
  const [v] = fusionar([
    parte({ views: 5000, likes: 200, thumbnail: null }),
    parte({ titulo: "Un título real", referente: "@milena" }),
    parte({ thumbnail: "https://cdn/x.jpg" }),
  ]);
  assert.equal(v.views, 5000);
  assert.equal(v.titulo, "Un título real");
  assert.equal(v.referente, "@milena");
  assert.equal(v.thumbnail, "https://cdn/x.jpg");
});

test("la precedencia es el orden del arreglo: el primero que sabe, gana", () => {
  // La política de precedencia vive en quien llama (lib/videos.ts). Si esto dejara de ser cierto,
  // cambiarla ahí no tendría efecto y nadie se enteraría.
  const [v] = fusionar([
    parte({ titulo: "el del Feed" }),
    parte({ titulo: "el del histórico" }),
  ]);
  assert.equal(v.titulo, "el del Feed");
});

test("undefined y null son lo mismo: 'esta fuente no sabe'", () => {
  const [v] = fusionar([parte({ referente: undefined }), parte({ referente: "@rochi" })]);
  assert.equal(v.referente, "@rochi");
});

test("un 0 real NO se pisa: es un dato, no un hueco", () => {
  // Un reel con 0 likes existe. Si `0` se tratara como falsy, lo taparía la fuente siguiente y el
  // número mostrado sería el de otro momento.
  const [v] = fusionar([parte({ likes: 0 }), parte({ likes: 999 })]);
  assert.equal(v.likes, 0);
});

// ── La identidad ─────────────────────────────────────────────────────────────

test("dos videos distintos no se mezclan", () => {
  const vs = fusionar([
    parte({ external_id: "aaa", titulo: "uno" }),
    parte({ external_id: "bbb", titulo: "dos" }),
  ]);
  assert.equal(vs.length, 2);
  assert.deepEqual(vs.map((v) => v.titulo), ["uno", "dos"]);
});

test("el mismo external_id en plataformas distintas son dos videos", () => {
  // La llave de ADR-070 es la dupla, no el id solo. Un id de TikTok y uno de Instagram pueden
  // coincidir como texto y no son el mismo video.
  const vs = fusionar([
    parte({ plataforma: "instagram", external_id: "123" }),
    parte({ plataforma: "tiktok", external_id: "123", url: "https://www.tiktok.com/@x/video/123" }),
  ]);
  assert.equal(vs.length, 2);
});

test("el orden de salida es el de primera aparición, estable", () => {
  // Misma lección que el mazo del Feed: una grilla que se reacomoda sola mientras alguien la
  // recorre convierte un misclick en algo irrecuperable.
  const vs = fusionar([
    parte({ external_id: "ccc" }),
    parte({ external_id: "aaa" }),
    parte({ external_id: "ccc", titulo: "vuelve el primero" }),
    parte({ external_id: "bbb" }),
  ]);
  assert.deepEqual(vs.map((v) => v.external_id), ["ccc", "aaa", "bbb"]);
});

test("la primera URL que aparece es la que queda", () => {
  const [v] = fusionar([
    parte({ url: "https://www.instagram.com/p/AAA/" }),
    parte({ url: "https://www.instagram.com/reel/AAA/" }),
  ]);
  assert.equal(v.url, "https://www.instagram.com/p/AAA/");
});

test("un video sin URL se cae de la lista en vez de dibujar una tarjeta muerta", () => {
  const vs = fusionar([
    { plataforma: "instagram", external_id: "sinurl", titulo: "no lleva a ningún lado" },
    parte({ external_id: "conurl" }),
  ]);
  assert.deepEqual(vs.map((v) => v.external_id), ["conurl"]);
});

test("sin partes, lista vacía", () => {
  assert.deepEqual(fusionar([]), []);
});

test("un video del que no se sabe nada sale entero en null, no a medias", () => {
  // La tarjeta tiene que poder dibujar esto: son los 130 de Transcribir y los 291 links cargados a
  // mano. Si algún campo saliera undefined en vez de null, el fallback de la tarjeta no dispararía.
  const [v] = fusionar([parte()]);
  assert.deepEqual(
    { ...v, clave: undefined, url: undefined },
    {
      clave: undefined, url: undefined,
      plataforma: "instagram", external_id: "abc123",
      titulo: null, referente: null, thumbnail: null,
      views: null, likes: null, seguidores: null, idioma: null, heat: null,
    },
  );
});

// ── nombreDeArchivo ──────────────────────────────────────────────────────────

test("junta referente y título", () => {
  const [v] = fusionar([parte({ referente: "@nicholascrown", titulo: "Qué es el VIX" })]);
  assert.equal(nombreDeArchivo(v), "@nicholascrown - Qué es el VIX");
});

test("un título que en realidad es una url no se usa: quedaría un nombre ilegible", () => {
  const [v] = fusionar([
    parte({ referente: "@alguien", titulo: "https://www.instagram.com/p/DcRC0RQkb03/" }),
  ]);
  assert.equal(nombreDeArchivo(v), "@alguien");
});

test("sin nada que decir cae a la identidad, no a un nombre repetido", () => {
  // 20 videos sin título bajando todos como `video.mp4` es el modo de falla que esto evita.
  const [v] = fusionar([parte({ referente: null, titulo: null })]);
  assert.equal(nombreDeArchivo(v), "instagram-abc123");
});

test("un caption largo se recorta: el título ya viene cortado a 200 y eso no es un nombre", () => {
  const [v] = fusionar([parte({ referente: null, titulo: "x".repeat(200) })]);
  assert.equal(nombreDeArchivo(v).length, 60);
});
