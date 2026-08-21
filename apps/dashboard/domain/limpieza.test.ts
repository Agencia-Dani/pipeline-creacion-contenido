import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { armarPrompt, BASE, estaAlDia, huellaDeCriterios } from "./limpieza.ts";

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
