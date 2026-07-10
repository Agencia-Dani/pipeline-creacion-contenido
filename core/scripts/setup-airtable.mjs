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
  { name: "Proyectos", description: "Unidad de búsqueda (qué se busca). Resultados aislados por proyecto. dias_recencia/top_n/toggles salieron a Ajustes globales (ADR-016).",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia"), check("activo")] },
  { name: "Voces", description: "Eje organizativo (para quién se selecciona). Separado del proyecto.",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia")] },
  { name: "Referentes", description: "Banco de perfiles referentes (la única fuente de descubrimiento — ADR-019).",
    fields: [txt("handle"), sel("plataforma", "instagram", "tiktok"),
             check("activo"), long("notas")] },
  { name: "Candidatos", description: "Scripts (transcripción/traducción literal — ADR-009) a calificar por el equipo.",
    fields: [txt("titulo"), long("script"), sel("idioma", "es", "en", "pt", "it", "fr", "otro"),
             attach("thumbnail"), txt("referente"), url("url_referente"),
             num("views"), num("likes"), num("seguidores"), num("engagement", 1),
             num("heat_score", 1), num("relevancia_score", 2), long("relevancia_razon"),
             check("viral_por_tamano"),
             sel("calificacion", "🔥", "👍", "👎"),
             sel("estado", "nuevo", "aprobado", "descartado"),
             long("notas_equipo")] },
  { name: "Ajustes", description: "Knobs del scoring (clave→valor) que el equipo edita sin tocar n8n — ADR-011. El motor los lee y caen sobre los defaults de Config; tabla vacía = motor con defaults.",
    fields: [txt("clave"), num("valor", 2), long("descripcion"), check("Mostrar al equipo")] },
];

// Semillas de Ajustes: los knobs que el equipo edita en español claro. El motor (nodo "Armar plan")
// mapea cada `clave` amigable → su key interna (AJUSTE_MAP) y la aplica sobre los defaults de Config.
// Si renombrás una clave acá, actualizá también AJUSTE_MAP en el workflow.
const ajustesSeed = [
  { clave: "Peso de vistas",                  valor: 0.4,    descripcion: "Cuánto pesan las vistas en el orden por métricas (0 a 1)." },
  { clave: "Peso de likes",                   valor: 0.4,    descripcion: "Cuánto pesan los likes en el orden por métricas (0 a 1)." },
  { clave: "Peso de interacción",             valor: 0.2,    descripcion: "Cuánto pesa la interacción (likes+comentarios / seguidores) en el orden (0 a 1)." },
  { clave: "Peso de relevancia",              valor: 0.7,    descripcion: "Cuánto pesa el juicio de relevancia (IA) vs. las métricas en el orden final (0 a 1)." },
  { clave: "Bonus idioma extranjero",         valor: 0.3,    descripcion: "Empujón extra a los videos que NO están en español." },
  { clave: "Seguidores para marcar viral",    valor: 700000, descripcion: "A partir de cuántos seguidores se marca el video como viral (solo marca, no descarta)." },
  { clave: "Mínimo de vistas",                valor: 0,      descripcion: "Descarta los videos con menos vistas que esto. 0 = no descarta nada." },
  { clave: "Mínimo de likes",                 valor: 0,      descripcion: "Descarta los videos con menos likes que esto. 0 = no descarta nada." },
  { clave: "Relevancia mínima",               valor: 0,      descripcion: "Descarta candidatos con relevancia por debajo de esto (0 a 1). 0 = no descarta nada." },
  // Knobs de ejecución globales (ADR-016) — visibles al equipo en la "página Global" del dashboard
  // ("Mostrar al equipo": true filtra esa página; sin el flag van solo a "Ajustes Dev-Only").
  { clave: "Candidatos por corrida",          valor: 100,    descripcion: "Cuántos videos distintos trae la corrida en total (no por proyecto). El corte va por el score final.", "Mostrar al equipo": true },
  { clave: "Días de recencia",                valor: 7,      descripcion: "Ventana de búsqueda: solo videos publicados en los últimos N días.", "Mostrar al equipo": true },
  { clave: "Resultados por cuenta de referente", valor: 20,  descripcion: "Cuántos videos baja por cada cuenta de referente (más = más costo). Tope dev: 30.", "Mostrar al equipo": true },
  // Toggles de eje (ADR-017; el eje keyword se removió — ADR-019) — también en la "página Global".
  { clave: "Buscar por referentes en Instagram", valor: 1,   descripcion: "Activa la búsqueda por cuentas de referente en Instagram. 1 = sí, 0 = no.", "Mostrar al equipo": true },
  { clave: "Buscar por referentes en TikTok",    valor: 1,   descripcion: "Activa la búsqueda por cuentas de referente en TikTok. 1 = sí, 0 = no.", "Mostrar al equipo": true },
];

const run = async () => {
  console.log("→ Creando base 'Reels Cockpit'…");
  const base = await api("POST", "/bases", { name: "Reels Cockpit", workspaceId: WORKSPACE, tables });
  const baseId = base.id;
  const id = (t) => base.tables.find((x) => x.name === t).id;

  // ── links (se agregan después: referencian ids que no existían al crear) ──
  const links = [
    ["Proyectos", "voz_default", "Voces"],
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
  console.log("   → Cargá los datos semilla: Proyectos, Voces y Referentes iniciales");
  console.log("     (incluí referentes en EN/PT/IT/FR — prioridad del jefe, ADR-009).");
  console.log("   → Creá a mano en Candidatos el campo 'fecha' tipo 'Created time' (cuándo llegó");
  console.log("     el candidato — la API no crea campos computados).");
  console.log("   → Creá a mano la vista '🔥 Seleccionados' en Candidatos: filtro estado=aprobado,");
  console.log("     orden heat_score desc (el re-rank de seleccionados).");
};

run().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
