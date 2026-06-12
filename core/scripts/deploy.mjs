#!/usr/bin/env node
// Deploy del workflow short-form-content: resuelve los <<placeholders>> del template
// desde la config del cliente → JSON importable en n8n (runbook F2, Parte C).
//
// Uso:  node core/scripts/deploy.mjs <cliente>
// Lee:  clients/<cliente>/short-form-content.yaml + Workflows/workflow-short-form-content/workflow.json
// Deja: Workflows/workflow-short-form-content/dist/<cliente>.workflow.json (gitignored)
//
// NO toca secretos: las API keys (<APIFY_TOKEN>, <ANTHROPIC_API_KEY>, <SUPADATA_API_KEY>)
// quedan como están — se pegan en n8n después de importar, jamás viven en archivos.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(REPO, "Workflows", "workflow-short-form-content");

const cliente = process.argv[2];
if (!cliente) {
  console.error("Uso: node core/scripts/deploy.mjs <cliente>   (carpeta en clients/)");
  process.exit(1);
}
const cfgPath = join(REPO, "clients", cliente, "short-form-content.yaml");
if (!existsSync(cfgPath)) {
  console.error(`✗ no existe ${cfgPath}`);
  process.exit(1);
}
const cfg = YAML.parse(readFileSync(cfgPath, "utf8"));
const w = JSON.parse(readFileSync(join(WF_DIR, "workflow.json"), "utf8"));

let errors = [];
const fail = (m) => errors.push("✗ " + m);

// ---------- validar la config ----------
const reqStr = ["nombre_cliente", "descripcion_credenciales", "frase_credencial", "guiones_ejemplo",
  "tratamiento", "registro", "pais_acento", "cta", "nombre_agencia",
  "google_sheet_id", "sheet_nombre", "sheet_pestana", "nombre_editor", "email_destinatario"];
for (const k of reqStr) {
  if (typeof cfg?.[k] !== "string" || !cfg[k].trim()) fail(`config: falta '${k}' (string no vacío)`);
}
const reqNum = ["min_likes", "min_views", "min_seguidores", "top_n", "dias_recencia",
  "ig_results_limit", "tt_results_limit"];
for (const k of reqNum) {
  if (!Number.isFinite(Number(cfg?.[k]))) fail(`config: '${k}' debe ser numérico`);
}
const listas = { cuentas_ig: [1, 10], hashtags_tiktok: [1, 10], temas: [1, 5], categorias: [5, 5] };
for (const [k, [min, max]] of Object.entries(listas)) {
  const v = cfg?.[k];
  if (!Array.isArray(v) || v.length < min || v.length > max || v.some(x => typeof x !== "string" || !x.trim()))
    fail(`config: '${k}' debe ser lista de ${min === max ? "exactamente " + min : min + " a " + max} strings no vacíos`);
}
for (const t of cfg?.temas ?? []) {
  if (/[,'"<>]/.test(t)) fail(`config: tema '${t}' no puede llevar comas, comillas ni <>`);
}
if (cfg?.email_destinatario && !cfg.email_destinatario.includes("@")) fail("config: email_destinatario inválido");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

// ---------- mapa placeholder → valor ----------
const joinO = (v, vacio) => (Array.isArray(v) && v.length ? v.join(", ") : vacio);
const MAP = {
  "NOMBRE_DEL_CLIENTE": cfg.nombre_cliente,
  "DESCRIPCION_Y_CREDENCIALES_DEL_CLIENTE": cfg.descripcion_credenciales,
  "FRASE_DE_CREDENCIAL_DEL_CLIENTE": cfg.frase_credencial,
  "PEGAR_AQUI_2_A_4_GUIONES_REALES_DEL_CLIENTE": cfg.guiones_ejemplo,
  "TRATAMIENTO: vos / tú / ustedes": cfg.tratamiento,
  "COLOQUIAL_O_FORMAL": cfg.registro,
  "PAIS_O_ACENTO": cfg.pais_acento,
  "MULETILLAS_PERMITIDAS": joinO(cfg.muletillas_permitidas, "ninguna"),
  "CLICHES_A_EVITAR": joinO(cfg.cliches_a_evitar, "ninguno"),
  "PALABRAS_O_EXPRESIONES_PROPIAS_DEL_CLIENTE": joinO(cfg.palabras_propias, "las naturales del cliente"),
  "CTA_DEL_CLIENTE": cfg.cta,
  "NOMBRE_AGENCIA": cfg.nombre_agencia,
  "MIN_LIKES": String(cfg.min_likes),
  "MIN_VIEWS": String(cfg.min_views),
  "MIN_SEGUIDORES": String(cfg.min_seguidores),
  "TOP_N": String(cfg.top_n),
  "DIAS_RECENCIA": String(cfg.dias_recencia),
  "IG_RESULTS_LIMIT": String(cfg.ig_results_limit),
  "TT_RESULTS_LIMIT": String(cfg.tt_results_limit),
  "GOOGLE_SHEET_ID": cfg.google_sheet_id,
  "NOMBRE_DEL_SHEET": cfg.sheet_nombre,
  "PESTAÑA_DEL_SHEET": cfg.sheet_pestana,
  "NOMBRE_DEL_EDITOR": cfg.nombre_editor,
  "EMAIL_DESTINATARIO": cfg.email_destinatario,
};
cfg.categorias.forEach((c, i) => { MAP["CATEGORIA_" + (i + 1)] = c; });

// Opcionales del registro central: sin ellos el workflow corre igual (Continue On Fail),
// pero no reporta a Supabase.
const sinResolver = ["CREDENCIAL_GOOGLE_SHEETS", "CREDENCIAL_GMAIL"]; // se remapean al importar
const warnings = [];
if (cfg.supabase_url) MAP["SUPABASE_URL"] = String(cfg.supabase_url).replace(/\/+$/, "");
else { sinResolver.push("SUPABASE_URL"); warnings.push("supabase_url vacío → la ingesta al registro NO reportará (el workflow corre igual)"); }
if (cfg.instance_id) MAP["INSTANCE_ID"] = String(cfg.instance_id);
else { sinResolver.push("INSTANCE_ID"); warnings.push("instance_id vacío → llenarlo tras insertar la instancia en Supabase (runbook F2 Parte C)"); }

// ---------- mutaciones estructurales (listas de largo variable) ----------
const node = (name) => {
  const n = w.nodes.find(n => n.name === name);
  if (!n) throw new Error("nodo no encontrado: " + name);
  return n;
};

const ig = node("Apify — Scrape IG Reels");
const urls = cfg.cuentas_ig.map(c => "https://www.instagram.com/" + c.trim().replace(/^@/, "").replace(/\/+$/, "") + "/");
if (!/"directUrls": \[[^\]]*\]/.test(ig.parameters.jsonBody)) { console.error("✗ no encontré directUrls en el nodo IG"); process.exit(1); }
ig.parameters.jsonBody = ig.parameters.jsonBody.replace(/"directUrls": \[[^\]]*\]/,
  '"directUrls": [\n    ' + urls.map(u => JSON.stringify(u)).join(",\n    ") + "\n  ]");

const tt = node("Apify — Scrape TikTok");
const tags = cfg.hashtags_tiktok.map(h => h.trim().replace(/^#/, ""));
if (!/"hashtags": \[[^\]]*\]/.test(tt.parameters.jsonBody)) { console.error("✗ no encontré hashtags en el nodo TikTok"); process.exit(1); }
tt.parameters.jsonBody = tt.parameters.jsonBody.replace(/"hashtags": \[[^\]]*\]/,
  '"hashtags": [\n    ' + tags.map(t => JSON.stringify(t)).join(",\n    ") + "\n  ]");

const params = node("Parámetros de corrida");
const temasLit = "lista('<<TEMA_1>>,<<TEMA_2>>,<<TEMA_3>>,<<TEMA_4>>,<<TEMA_5>>')";
if (!params.parameters.jsCode.includes(temasLit)) { console.error("✗ no encontré el literal de temas en 'Parámetros de corrida'"); process.exit(1); }
params.parameters.jsCode = params.parameters.jsCode.replace(temasLit, "lista(" + JSON.stringify(cfg.temas.join(",")) + ")");

// ---------- reemplazo de placeholders ----------
// Dos contextos: dentro de código JS (jsCode de nodos Code y la expresión ={{...}} del nodo
// Claude) el valor va escapado para no romper string literals (guiones few-shot multilínea,
// comillas); en el resto (URLs, textos de email, JSON plano) va crudo.
const jsEscape = (v) => String(v)
  .replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"')
  .replace(/`/g, "\\`").replace(/\$\{/g, "\\${").replace(/\r/g, "").replace(/\n/g, "\\n");
const replacePh = (s, esc) => {
  for (const [ph, val] of Object.entries(MAP)) s = s.split("<<" + ph + ">>").join(esc ? jsEscape(val) : val);
  return s;
};
for (const n of w.nodes) {
  if (typeof n.parameters?.jsCode === "string") n.parameters.jsCode = replacePh(n.parameters.jsCode, true);
}
const clNode = node("Claude — Agente escritor voz cliente");
clNode.parameters.jsonBody = replacePh(clNode.parameters.jsonBody, true);
const walk = (o) => {
  if (typeof o === "string") return replacePh(o, false);
  if (Array.isArray(o)) return o.map(walk);
  if (o && typeof o === "object") { for (const k of Object.keys(o)) o[k] = walk(o[k]); return o; }
  return o;
};
walk(w);

// ---------- validaciones del resultado ----------
const texto = JSON.stringify(w);
const restantes = [...new Set(texto.match(/<<[A-ZÁÉÍÓÚÑ][^>]*>>/g) ?? [])]
  .filter(ph => !sinResolver.includes(ph.slice(2, -2)));
if (restantes.length) fail("placeholders sin resolver: " + restantes.join(", "));

const cl = node("Claude — Agente escritor voz cliente");
try {
  const inner = cl.parameters.jsonBody.slice(3, -2);
  const r = new Function("$json", "return (" + inner + ")")(
    { plataforma: "x", url: "u", autor: "a", likes: 1, vistas: 2, duracion_seg: 3, caption: "c", transcripcion: "t" });
  if (!r.model || !r.messages) fail("la expresión del nodo Claude no produce un request válido");
} catch (e) { fail("la expresión del nodo Claude no evalúa: " + e.message); }

const parserCode = node("Parsear respuesta Claude → columnas Sheet").parameters.jsCode;
for (const c of cfg.categorias) {
  if (!cl.parameters.jsonBody.includes(c)) fail(`categoría '${c}' no quedó en el prompt de Claude`);
  if (!parserCode.includes(c)) fail(`categoría '${c}' no quedó en el parser`);
}
if (JSON.stringify(w.pinData ?? {}) !== "{}") fail("pinData no está vacío");

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

// ---------- escribir ----------
w.name = w.name + " · " + cliente;
const outDir = join(WF_DIR, "dist");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, cliente + ".workflow.json");
writeFileSync(outPath, JSON.stringify(w, null, 2) + "\n");

console.log(`✅ deploy listo: ${outPath.replace(REPO + "/", "")}`);
console.log(`   cliente: ${cliente} · cuentas IG: ${urls.length} · hashtags TT: ${tags.length} · temas: ${cfg.temas.length}`);
for (const wmsg of warnings) console.log("   ⚠️  " + wmsg);
console.log(`
Pasos manuales tras importar en n8n (no van en archivos, JAMÁS en git):
  1. Pegar API keys en los nodos HTTP: <APIFY_TOKEN> (x2), <ANTHROPIC_API_KEY>, <SUPADATA_API_KEY>.
  2. Remapear credenciales OAuth de Google Sheets y Gmail.
  3. Crear credencial 'Supabase Registro' (tipo Supabase API: host + service_role key) para los nodos de ingesta.
  4. Importar core/n8n/error-workflow-registro.json y fijarlo como Error Workflow (Settings del workflow).`);
