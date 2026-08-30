import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  armarPrompt,
  BASE,
  clasificarLimpios,
  estaAlDia,
  estadoDelLimpio,
  huellaDeCriterios,
} from "./limpieza.ts";

// ── El invariante que importa ────────────────────────────────────────────────

test("BASE está sincronizado con docs/prompts/limpieza-guion.md", () => {
  // 🔑 **Este test es la razón de ser del archivo.** `limpieza.ts` dice que BASE "es una copia" del
  // doc, y una copia que nadie verifica se desincroniza el primer día que alguien afine el prompt
  // en un solo lado. Entonces el equipo recibiría dos limpiezas distintas del mismo guion según por
  // dónde entró — la misma clase de bug que `lib/transcribir.ts` previene contra los nodos de n8n,
  // ahí escrita como invariante y acá además medida.
  const doc = readFileSync(
    fileURLToPath(new URL("../../../docs/prompts/limpieza-guion.md", import.meta.url)),
    "utf8",
  );
  const desdeBase = doc.slice(doc.indexOf("## BASE"));
  const bloque = desdeBase.match(/```\n([\s\S]*?)\n```/);
  assert.ok(bloque, "no encontré el bloque BASE en el doc");
  assert.equal(
    bloque[1].trim(),
    BASE.trim(),
    "BASE y el doc se separaron: sincronizalos antes de seguir.",
  );
});

// ── El prompt ────────────────────────────────────────────────────────────────

test("sin perfil de voz se limpia igual, solo con los criterios de la casa", () => {
  // No es un caso degradado: exigir el perfil dejaría la feature detrás de un formulario vacío.
  assert.equal(armarPrompt(null), BASE);
  assert.equal(armarPrompt(undefined), BASE);
});

test("un perfil en blanco es como no tener perfil", () => {
  assert.equal(armarPrompt("   \n  "), BASE);
});

test("el perfil se suma a la base, no la reemplaza", () => {
  const p = armarPrompt("Habla en segunda persona, sin diminutivos.");
  assert.ok(p.startsWith(BASE), "la base tiene que seguir entera adelante");
  assert.ok(p.includes("Habla en segunda persona, sin diminutivos."));
});

// ── La huella ────────────────────────────────────────────────────────────────

test("la misma entrada da la misma huella", () => {
  assert.equal(huellaDeCriterios("un perfil"), huellaDeCriterios("un perfil"));
});

test("cambiar el perfil cambia la huella", () => {
  // Es lo único que hace posible avisar que un guion limpio quedó viejo.
  assert.notEqual(huellaDeCriterios("perfil A"), huellaDeCriterios("perfil B"));
});

test("null y vacío dan la misma huella, porque dan el mismo prompt", () => {
  assert.equal(huellaDeCriterios(null), huellaDeCriterios("  "));
});

test("la huella es de 8 caracteres hex, estable como columna", () => {
  assert.match(huellaDeCriterios("x"), /^[0-9a-f]{8}$/);
});

// ── Quedó viejo o no ─────────────────────────────────────────────────────────

test("un guion sin huella se considera al día", () => {
  // Marcarlo viejo empujaría a re-limpiar y pagar de nuevo por algo que probablemente está bien.
  assert.equal(estaAlDia(null, "cualquier perfil"), true);
});

test("un guion limpiado con el perfil de hoy está al día", () => {
  const perfil = "Tuteo, frases cortas.";
  assert.equal(estaAlDia(huellaDeCriterios(perfil), perfil), true);
});

test("si el perfil cambió después, el guion quedó viejo", () => {
  const huellaVieja = huellaDeCriterios("Tuteo, frases cortas.");
  assert.equal(estaAlDia(huellaVieja, "Usted, frases largas."), false);
});

// ── Al día, viejo, o re-limpiarlo lo empeoraría ──────────────────────────────

test("limpiado sin voz cuando hoy su video sí tiene perfil: quedó viejo", () => {
  // El modo de falla #1 de ADR-080, el que ya ocurrió 27 veces: salieron neutros pudiendo sonar a
  // la creadora, y nadie podía notarlo.
  assert.equal(estadoDelLimpio(huellaDeCriterios(null), "Tuteo, frases cortas."), "viejo");
});

test("limpiado con perfil y hoy su video ya no tiene voz: re-limpiarlo lo empeoraría", () => {
  // 🔑 Se despeja de las huellas solas, sin consultar voces: si la de hoy es la BASE y la guardada
  // no lo es, la pasada perdería el perfil. Es el guion 28 de ADR-080, cuyo candidato se archivó.
  assert.equal(estadoDelLimpio(huellaDeCriterios("Tuteo, frases cortas."), null), "degradaria");
});

// ── Clasificar los limpios de una pantalla ───────────────────────────────────

test("un video con limpio viejo sale en la lista de viejos", () => {
  const r = clasificarLimpios(
    [{ clave: "instagram:1", vozId: "jp" }],
    new Map([["instagram:1", huellaDeCriterios(null)]]),
    new Map([["jp", "Tuteo, frases cortas."]]),
  );
  assert.deepEqual(r.viejos, ["instagram:1"]);
  assert.deepEqual(r.degradarian, []);
});

test("un video sin limpio no entra en ninguna lista", () => {
  // De los que faltan se ocupa *Limpiar*. Meterlos acá haría que el botón de re-limpiar cobrara
  // por trabajo que el otro botón ya hace más barato.
  const r = clasificarLimpios([{ clave: "instagram:1", vozId: "jp" }], new Map(), new Map());
  assert.deepEqual(r, { viejos: [], degradarian: [] });
});

test("si la voz del video ya no existe, se trata como sin perfil", () => {
  // Pasa al borrar o renombrar una voz. Degrada a los criterios de la casa y nunca a la voz
  // equivocada, que es el único error que costaría plata y saldría mal escrito (ADR-080).
  const r = clasificarLimpios(
    [{ clave: "instagram:1", vozId: "borrada" }],
    new Map([["instagram:1", huellaDeCriterios("Tuteo, frases cortas.")]]),
    new Map(),
  );
  assert.deepEqual(r.degradarian, ["instagram:1"]);
});

test("solo clasifica los videos que recibe, no toda la tabla de limpios", () => {
  // Las huellas llegan del cockpit entero (8 de los 65 no están en ninguna colección): el botón de
  // esta pantalla no puede ofrecerse a re-limpiar guiones que no se ven acá.
  const r = clasificarLimpios(
    [{ clave: "instagram:1", vozId: "jp" }],
    new Map([
      ["instagram:1", huellaDeCriterios(null)],
      ["instagram:2", huellaDeCriterios(null)],
    ]),
    new Map([["jp", "Tuteo, frases cortas."]]),
  );
  assert.deepEqual(r.viejos, ["instagram:1"]);
});

test("dos videos de voces distintas se clasifican por su propia voz", () => {
  // El modo de falla #2 de ADR-080, del lado de la lectura: una colección mezclada no puede tener
  // un solo veredicto para todos.
  const r = clasificarLimpios(
    [
      { clave: "instagram:1", vozId: "jp" },
      { clave: "instagram:2", vozId: "rosario" },
    ],
    new Map([
      ["instagram:1", huellaDeCriterios(null)],
      ["instagram:2", huellaDeCriterios(null)],
    ]),
    // Rosario no tiene perfil cargado: su guion sin voz está al día y no hay nada que re-limpiar.
    new Map([
      ["jp", "Tuteo, frases cortas."],
      ["rosario", null],
    ]),
  );
  assert.deepEqual(r.viejos, ["instagram:1"]);
  assert.deepEqual(r.degradarian, []);
});
