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
const attach = (name) => ({ name, type: "multipleAttachments" });
const sel = (name, ...opts) => ({ name, type: "singleSelect", options: { choices: opts.map((o) => ({ name: o })) } });

// ── las 5 tablas (campos NO-link al crear; los links se agregan después) ──
const tables = [
  { name: "Proyectos", description: "Unidad de búsqueda (qué se busca). Resultados aislados por proyecto.",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia"),
             num("dias_recencia"), num("top_n"), check("activo")] },
  { name: "Voces", description: "Eje organizativo (para quién se selecciona). Separado del proyecto.",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia")] },
  { name: "Keywords", description: "Banco de palabras clave por proyecto (acumula).",
    fields: [txt("termino"), check("activo")] },
  { name: "Referentes", description: "Banco de perfiles referentes (fuente propia).",
    fields: [txt("handle"), sel("plataforma", "instagram", "tiktok"), num("seguidores"),
             check("flag_viral"), check("activo"), long("notas")] },
  { name: "Candidatos", description: "Scripts (transcripción/traducción literal — ADR-009) a calificar por el equipo.",
    fields: [txt("titulo"), long("script"), sel("idioma", "es", "en", "pt", "it", "fr", "otro"),
             attach("thumbnail"), txt("referente"), txt("tema"), url("url_referente"),
             num("views"), num("likes"), num("seguidores"), num("engagement", 1),
             num("heat_score", 1), num("relevancia_score", 2), long("relevancia_razon"),
             check("viral_por_tamano"),
             sel("calificacion", "🔥", "👍", "👎"),
             sel("estado", "nuevo", "aprobado", "descartado", "publicado"),
             long("notas_equipo")] },
  { name: "Ajustes", description: "Knobs del scoring (clave→valor) que el equipo edita sin tocar n8n — ADR-011. El motor los lee y caen sobre los defaults de Config; tabla vacía = motor con defaults.",
    fields: [txt("clave"), num("valor", 2), long("descripcion")] },
];

// Semillas de Ajustes: defaults del motor (nombres = keys del nodo Config → merge transparente).
// El motor cae a estos mismos valores si la tabla está vacía; sembrarlos hace los knobs visibles al equipo.
const ajustesSeed = [
  { clave: "peso_views",      valor: 0.4,    descripcion: "Peso de las views en el prescore métrico (0..1)." },
  { clave: "peso_likes",      valor: 0.4,    descripcion: "Peso de los likes en el prescore métrico (0..1)." },
  { clave: "peso_eng",        valor: 0.2,    descripcion: "Peso del engagement_rate en el prescore métrico (0..1)." },
  { clave: "peso_relevancia", valor: 0.7,    descripcion: "Peso del juicio semántico (Haiku) en el heat_score final vs. el percentil métrico (0..1)." },
  { clave: "boost_idioma",    valor: 0.3,    descripcion: "Boost al prescore de contenido NO-español (premia idiomas extranjeros — ADR-009)." },
  { clave: "umbral_viral",    valor: 700000, descripcion: "Seguidores a partir de los cuales se marca viral_por_tamano (proxy, no filtra)." },
  { clave: "top_n_fallback",  valor: 25,     descripcion: "Cuántos candidatos por proyecto cuando el Proyecto no define top_n propio." },
  { clave: "min_views",       valor: 0,      descripcion: "Piso duro: descarta antes del top_n los reels con menos views. 0 = nada corta." },
  { clave: "min_likes",       valor: 0,      descripcion: "Piso duro: descarta antes del top_n los reels con menos likes. 0 = nada corta." },
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

  // fecha_calificacion: cuándo calificó el equipo (tracking de selecciones — ADR-009).
  // lastModifiedTime atado SOLO al campo 'calificacion'. Si la API lo rechaza, se crea a mano.
  try {
    const cand = base.tables.find((t) => t.name === "Candidatos");
    const calif = cand.fields.find((f) => f.name === "calificacion");
    await api("POST", `/bases/${baseId}/tables/${cand.id}/fields`, {
      name: "fecha_calificacion", type: "lastModifiedTime",
      options: { referencedFieldIds: [calif.id] },
    });
    console.log("→ Campo Candidatos.fecha_calificacion (last modified de 'calificacion')");
  } catch (e) {
    console.warn("⚠ No se pudo crear 'fecha_calificacion' por API — crealo a mano en Candidatos:");
    console.warn("  tipo 'Last modified time' → track solo el campo 'calificacion'. (" + e.message + ")");
  }

  // ── semillas de Ajustes (API de datos, no meta) ──
  console.log("→ Sembrando defaults en Ajustes…");
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/Ajustes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: ajustesSeed.map((fields) => ({ fields })), typecast: true }),
  });
  if (!res.ok) console.warn("⚠ No se pudo sembrar Ajustes: " + (await res.text()));

  console.log(`\n✅ Cockpit creado.\n   baseId: ${baseId}`);
  console.log("   → Pegá ese baseId en la credencial de Airtable de n8n.");
  console.log("   → Dale acceso de editor a Majo y Jero (Share → hasta 5 en el plan free).");
  console.log("   → Cargá los datos semilla: Proyectos, Voces, Keywords y Referentes iniciales");
  console.log("     (incluí referentes en EN/PT/IT/FR — prioridad del jefe, ADR-009).");
  console.log("   → Creá a mano en Candidatos el campo 'fecha' tipo 'Created time' (cuándo llegó");
  console.log("     el candidato — la API no crea campos computados).");
  console.log("   → Creá a mano la vista '🔥 Seleccionados' en Candidatos: filtro estado=aprobado,");
  console.log("     orden heat_score desc (el re-rank de seleccionados).");
};

run().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
