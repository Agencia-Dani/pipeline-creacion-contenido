import assert from "node:assert/strict";
import { test } from "node:test";
import {
  armarRegistro,
  claveDeUrl,
  contarRegistro,
  estaGrabada,
  esFiltroRegistro,
  fechaDeFila,
  filtrarRegistro,
  type GuionDelRegistro,
  type MarcaGrabado,
} from "./grabados.ts";

// Los tests del registro de grabados (ADR-070). Lo que se protege acá es lo que ADR-069 no podía
// hacer: marcar un guion que vino del Feed, y ver un link que se grabó por fuera de la herramienta.

const guion = (
  id: string,
  urlReferente: string | null,
  calificadoEn: string | null = "2026-08-01T00:00:00Z",
): GuionDelRegistro => ({ id, urlReferente, calificadoEn });

const marca = (clave: string, url: string, grabadoEn = "2026-08-20T00:00:00Z"): MarcaGrabado => ({
  clave,
  url,
  grabadoEn,
});

// ── claveDeUrl ────────────────────────────────────────────────────────────────

test("claveDeUrl deriva la clave de un link de Instagram", () => {
  // El par real que usa `enlace.test.ts`: el shortcode leído como base64 da el id de Apify.
  assert.equal(
    claveDeUrl("https://www.instagram.com/p/DAOqPTANXG-/"),
    "instagram:3462890932644704702",
  );
});

test("claveDeUrl deriva la clave de un link de TikTok", () => {
  assert.equal(
    claveDeUrl("https://www.tiktok.com/@alguien/video/7300000000000000000"),
    "tiktok:7300000000000000000",
  );
});

test("claveDeUrl da la MISMA clave para /p/ y /reel/ del mismo video", () => {
  // Es la propiedad que hace que un guion del Feed (que guarda `/p/`) y un link pegado a mano por
  // el equipo (que suele venir como `/reel/…?igsh=`) se reconozcan como el mismo video. Sin esto,
  // marcar desde el histórico y marcar desde Transcribir crearían dos marcas distintas.
  assert.equal(
    claveDeUrl("https://www.instagram.com/p/DAOqPTANXG-/"),
    claveDeUrl("https://www.instagram.com/reel/DAOqPTANXG-/?igsh=abc123"),
  );
});

test("claveDeUrl devuelve null cuando no hay link de video", () => {
  assert.equal(claveDeUrl(null), null);
  assert.equal(claveDeUrl(""), null);
  assert.equal(claveDeUrl("https://www.instagram.com/algunacuenta/"), null);
  assert.equal(claveDeUrl("un texto cualquiera"), null);
});

test("claveDeUrl devuelve null si el campo trae más de un link", () => {
  // No se elige uno: la fila no se puede cruzar por video y eso se dice, no se adivina.
  assert.equal(
    claveDeUrl("https://www.instagram.com/p/DAOqPTANXG-/ y https://www.instagram.com/p/DEKrF2ryWJE/"),
    null,
  );
});

// ── armarRegistro ─────────────────────────────────────────────────────────────

test("un guion sin marca queda sin grabar", () => {
  const filas = armarRegistro([guion("a", "https://www.instagram.com/p/DAOqPTANXG-/")], new Map());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo, "guion");
  assert.equal(estaGrabada(filas[0]), false);
});

test("un guion con marca queda grabado, cruzando por VIDEO y no por id", () => {
  // 🔑 El corazón de ADR-070: `outputs` no tiene columna con la clave del video, se deriva de su
  // URL. Si este test se cae, los 55 guiones del Feed vuelven a no tener dónde marcarse.
  const filas = armarRegistro(
    [guion("a", "https://www.instagram.com/p/DAOqPTANXG-/")],
    new Map([["instagram:3462890932644704702", marca("instagram:3462890932644704702", "u")]]),
  );
  assert.equal(estaGrabada(filas[0]), true);
  assert.equal(filas[0].tipo === "guion" && filas[0].grabadoEn, "2026-08-20T00:00:00Z");
});

test("una marca sin guion aparece como huérfana", () => {
  // El caso que ninguna columna podía representar: el equipo grabó algo por fuera de la
  // herramienta. Si esto no aparece, el link desaparece de la pantalla donde se acaba de cargar.
  const filas = armarRegistro(
    [],
    new Map([["tiktok:7300000000000000000", marca("tiktok:7300000000000000000", "https://t/")]]),
  );
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo, "huerfana");
  assert.equal(estaGrabada(filas[0]), true);
});

test("una marca que SÍ tiene guion no se duplica como huérfana", () => {
  const filas = armarRegistro(
    [guion("a", "https://www.instagram.com/p/DAOqPTANXG-/")],
    new Map([["instagram:3462890932644704702", marca("instagram:3462890932644704702", "u")]]),
  );
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo, "guion");
});

test("un guion con URL ilegible entra igual, pero sin clave", () => {
  // Se ve, se lee y se descarga; lo único que no se puede es marcarlo. Dejarlo afuera sería perder
  // una fila del histórico por un problema de parseo.
  const filas = armarRegistro([guion("a", null)], new Map());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo === "guion" && filas[0].clave, null);
});

test("ordena por la fecha que cada fila tiene, mezclando guiones y huérfanas", () => {
  // Una huérfana no tiene `calificadoEn`: se ordena por cuándo se marcó, que es su único momento.
  // Sin esto se irían todas al fondo con fecha vacía, justo después de cargarlas.
  const filas = armarRegistro(
    [
      guion("viejo", "https://www.instagram.com/p/DAOqPTANXG-/", "2026-08-01T00:00:00Z"),
      guion("nuevo", "https://www.instagram.com/p/DEKrF2ryWJE/", "2026-08-19T00:00:00Z"),
    ],
    new Map([["tiktok:7300000000000000000", marca("tiktok:7300000000000000000", "u", "2026-08-10T00:00:00Z")]]),
  );
  assert.deepEqual(
    filas.map(fechaDeFila),
    ["2026-08-19T00:00:00Z", "2026-08-10T00:00:00Z", "2026-08-01T00:00:00Z"],
  );
});

// ── filtro y cuentas ──────────────────────────────────────────────────────────

const mixto = () =>
  armarRegistro(
    [
      guion("marcado", "https://www.instagram.com/p/DAOqPTANXG-/"),
      guion("sin-marcar", "https://www.instagram.com/p/DEKrF2ryWJE/"),
    ],
    new Map([
      ["instagram:3462890932644704702", marca("instagram:3462890932644704702", "u")],
      ["tiktok:7300000000000000000", marca("tiktok:7300000000000000000", "v")],
    ]),
  );

test("el filtro parte el registro en grabados y sin grabar", () => {
  const filas = mixto();
  assert.equal(filtrarRegistro(filas, "todos").length, 3);
  assert.equal(filtrarRegistro(filas, "grabados").length, 2); // el guion marcado + la huérfana
  assert.equal(filtrarRegistro(filas, "sin-grabar").length, 1);
});

test("las huérfanas cuentan como grabadas: son marcas, no candidatas", () => {
  assert.deepEqual(contarRegistro(mixto()), { "sin-grabar": 1, grabados: 2, todos: 3 });
});

test("las cuentas de los tres filtros cierran contra el total", () => {
  const c = contarRegistro(mixto());
  assert.equal(c["sin-grabar"] + c.grabados, c.todos);
});

test("esFiltroRegistro rechaza lo que no es un filtro", () => {
  assert.equal(esFiltroRegistro("grabados"), true);
  assert.equal(esFiltroRegistro("aprobados"), false);
  assert.equal(esFiltroRegistro(null), false);
});
