#!/usr/bin/env node
// setup-airtable.mjs — crea el cockpit del equipo de redes en Airtable de un solo comando.
// Modelo: core/contracts/airtable-cockpit.md (ADR-008). Requiere Node 18+ (fetch global).
//
// Uso:
//   export AIRTABLE_PAT='pat...'            # PAT con scopes schema.bases:write + data.records:read/write
//   export AIRTABLE_WORKSPACE_ID='wsp...'   # del URL del workspace en airtable.com
//   node core/scripts/setup-airtable.mjs
//
// El PAT es un SECRETO: vive en el entorno y en n8n + gestor, JAMÁS en git.
// Crea una base nueva cada vez que se corre — guardá el baseId que imprime y no lo re-corras.

const PAT = process.env.AIRTABLE_PAT;
const WORKSPACE = process.env.AIRTABLE_WORKSPACE_ID;
if (!PAT || !WORKSPACE) {
  console.error("✗ Falta AIRTABLE_PAT y/o AIRTABLE_WORKSPACE_ID en el entorno.");
  console.error("  export AIRTABLE_PAT='pat...'; export AIRTABLE_WORKSPACE_ID='wsp...'");
  process.exit(1);
}

const META = "https://api.airtable.com/v0/meta";
async function api(method, path, body) {
  const res = await fetch(META + path, {
    method,
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// ── helpers de campos ──
const txt = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const url = (name) => ({ name, type: "url" });
const num = (name, precision = 0) => ({ name, type: "number", options: { precision } });
const check = (name) => ({ name, type: "checkbox", options: { color: "greenBright", icon: "check" } });
const sel = (name, ...opts) => ({ name, type: "singleSelect", options: { choices: opts.map((o) => ({ name: o })) } });
const date = (name) => ({
  name, type: "dateTime",
  options: { dateFormat: { name: "iso" }, timeFormat: { name: "24hour" }, timeZone: "America/Bogota" },
});

// ── las 5 tablas (campos NO-link al crear; los links se agregan después) ──
const tables = [
  { name: "Proyectos", description: "Unidad de búsqueda (qué se busca). Resultados aislados por proyecto.",
    fields: [txt("nombre"), long("descripcion"), num("min_likes"), num("min_views"),
             num("dias_recencia"), num("top_n"), check("activo")] },
  { name: "Voces", description: "Eje de generación (cómo suena). Separado del proyecto.",
    fields: [txt("nombre"), long("descripcion"), txt("frase_credencial"), long("few_shot"),
             sel("tratamiento", "tú", "usted"), sel("registro", "coloquial", "formal"),
             txt("cta"), txt("pais_acento")] },
  { name: "Keywords", description: "Banco de palabras clave por proyecto (acumula).",
    fields: [txt("termino"), check("activo")] },
  { name: "Referentes", description: "Banco de perfiles referentes (fuente propia).",
    fields: [txt("handle"), sel("plataforma", "instagram", "tiktok"), num("seguidores"),
             check("flag_viral"), check("activo"), long("notas")] },
  { name: "Candidatos", description: "Guiones generados a calificar por el equipo.",
    fields: [txt("titulo"), long("script"), txt("referente"), url("url_referente"),
             num("views"), num("likes"), num("seguidores"), num("engagement", 1), num("heat_score", 1),
             check("viral_por_tamano"), sel("categoria", "Tutorial", "Caso de uso", "Noticia", "Tip", "Reflexion"),
             sel("calificacion", "🔥", "👍", "👎"),
             sel("estado", "nuevo", "aprobado", "descartado", "publicado"),
             long("notas_equipo"), date("fecha")] },
];

const run = async () => {
  console.log("→ Creando base 'Reels Cockpit'…");
  const base = await api("POST", "/bases", { name: "Reels Cockpit", workspaceId: WORKSPACE, tables });
  const baseId = base.id;
  const id = (t) => base.tables.find((x) => x.name === t).id;

  // ── links (se agregan después: referencian ids que no existían al crear) ──
  const links = [
    ["Proyectos", "voz_default", "Voces"],
    ["Keywords", "proyecto", "Proyectos"],
    ["Referentes", "proyecto", "Proyectos"],
    ["Candidatos", "proyecto", "Proyectos"],
    ["Candidatos", "voz", "Voces"],
  ];
  for (const [tabla, campo, destino] of links) {
    console.log(`→ Link ${tabla}.${campo} → ${destino}`);
    await api("POST", `/bases/${baseId}/tables/${id(tabla)}/fields`, {
      name: campo, type: "multipleRecordLinks", options: { linkedTableId: id(destino) },
    });
  }

  console.log(`\n✅ Cockpit creado.\n   baseId: ${baseId}`);
  console.log("   → Pegá ese baseId en la credencial de Airtable de n8n.");
  console.log("   → Dale acceso de editor a Mamo y Jero (Share → hasta 5 en el plan free).");
  console.log("   → Cargá los datos semilla: Proyectos, Voces, Keywords y Referentes iniciales.");
};

run().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
