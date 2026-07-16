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
const fecha = (name) => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });

// ── las 9 tablas (campos NO-link al crear; los links se agregan después) ──
const tables = [
  { name: "Proyectos", description: "Unidad de búsqueda (qué se busca). Resultados aislados por proyecto. dias_recencia/toggles salieron a Ajustes globales (ADR-016); la N volvió al proyecto (ADR-024).",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia"),
             long("criterios_aprendidos"), long("advertencia_criterios"), check("activo"),
             num("N")] },
  { name: "Voces", description: "Eje organizativo (para quién se selecciona). Separado del proyecto.",
    fields: [txt("nombre"), long("descripcion"), long("criterios_relevancia")] },
  { name: "Referentes", description: "Banco de perfiles referentes (la única fuente de descubrimiento — ADR-019). Salud por referente (tasa_gate/tasa_aprobacion/videos_evaluados) la escribe el archivado — ADR-022/M2.",
    fields: [txt("handle"), sel("plataforma", "instagram", "tiktok"),
             check("activo"), long("notas"),
             num("tasa_gate", 2), num("tasa_aprobacion", 2), num("videos_evaluados")] },
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
  { name: "Referentes propuestos", description: "Cuentas candidatas a Referente que propone el workflow de descubrimiento (ADR-020). El equipo marca estado aprobado/descartado; los aprobados se promueven solos a Referentes en la corrida siguiente.",
    fields: [txt("handle"), sel("plataforma", "instagram", "tiktok"),
             num("afinidad", 2), long("razon"), num("seguidores"), long("bio"), url("url"),
             txt("semillas"),
             sel("estado", "propuesto", "aprobado", "descartado", "promovido")] },
  { name: "Descartes del gate", description: "Banda borderline de descartes del gate (ADR-021): el motor sube ~10 por corrida para auditar falsos negativos. El equipo marca veredicto; el archivado cuenta los 'era bueno' y limpia la tabla cada domingo.",
    fields: [txt("titulo"), long("script"), txt("referente"), url("url_referente"),
             num("relevancia_score", 2), long("relevancia_razon"), attach("thumbnail"),
             sel("veredicto", "bien descartado", "era bueno")] },
  // Métricas partida en 2 tablas (split 2026-07-15): calidad por proyecto vs salud+costos global.
  // Cada página del cockpit lee su tabla → dejan de compartir campos. La escribe SOLO el archivado
  // (routea por _tabla); proyección regenerable (la verdad cruda vive en Supabase). Solo-lectura.
  { name: "Métricas Proyectos", description: "Calidad semanal por proyecto (ADR-021, split 2026-07-15): una fila por semana×proyecto. La escribe SOLO el archivado; proyección regenerable. Solo-lectura. Salud + costos → tabla Métricas Global.",
    fields: [txt("clave"), fecha("semana"), txt("ambito"),
             num("calificados"), num("aprobados"), num("descartados"), num("precision", 2),
             num("score_aprobados", 2), num("score_descartados", 2), num("separacion_gate", 2),
             long("diagnostico")] },
  { name: "Métricas Global", description: "Salud del sistema + costos, semanal (ADR-021, split 2026-07-15): filas GLOBAL (motor) y DESCUBRIMIENTO (buscador). La escribe SOLO el archivado; proyección regenerable. Solo-lectura. Calidad por proyecto → tabla Métricas Proyectos.",
    fields: [txt("clave"), fecha("semana"), txt("ambito"),
             num("calificados"), num("aprobados"), num("descartados"), num("precision", 2),
             num("entregados"), num("colectados"), num("pretrim"), num("gate_pass"),
             num("apify_ig"), num("apify_tt"),
             num("sin_guion"), num("descartes_expuestos"), num("falsos_negativos"),
             num("runs_ok"), num("runs_fallo"), num("duracion_min", 1),
             num("semillas"), num("sugeridos_unicos"), num("propuestos"), num("promovidos"),
             num("perfiles_semilla"), num("detalle_sugeridos"), num("lookalikes_tt"),
             num("supadata_llamadas"), num("haiku_lotes"), num("haiku_traducciones")] },
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
  { clave: "Candidatos por corrida",          valor: 100,    descripcion: "Cuántos videos trae un proyecto que no tiene su propia N (es el default). Para cambiar uno solo, ponele N a ese proyecto. El corte va por el score final.", "Mostrar al equipo": true },
  { clave: "Días de recencia",                valor: 7,      descripcion: "Ventana de búsqueda: solo videos publicados en los últimos N días.", "Mostrar al equipo": true },
  { clave: "Resultados por cuenta de referente", valor: 20,  descripcion: "Cuántos videos baja por cada cuenta de referente (más = más costo). Tope dev: 30.", "Mostrar al equipo": true },
  // Toggles de eje (ADR-017; el eje keyword se removió — ADR-019) — también en la "página Global".
  { clave: "Buscar por referentes en Instagram", valor: 1,   descripcion: "Activa la búsqueda por cuentas de referente en Instagram. 1 = sí, 0 = no.", "Mostrar al equipo": true },
  { clave: "Buscar por referentes en TikTok",    valor: 1,   descripcion: "Activa la búsqueda por cuentas de referente en TikTok. 1 = sí, 0 = no.", "Mostrar al equipo": true },
  // Knobs del workflow de descubrimiento de referentes (ADR-020). Mapa propio en su "Armar plan de descubrimiento".
  { clave: "Propuestas por corrida",             valor: 10,  descripcion: "Cuántos referentes nuevos propone el descubrimiento por semana, como máximo.", "Mostrar al equipo": true },
  { clave: "Afinidad mínima de propuesta",       valor: 0.6, descripcion: "Qué tan afín a los criterios del proyecto debe ser una cuenta para proponerse (0 a 1).", "Mostrar al equipo": true },
  // Toggles de eje del descubrimiento (ADR-020 §8). Faltaban acá: la base viva los tiene creados a mano
  // (2026-07-13) pero una base nueva salía sin ellos y el equipo no podía apagar un eje. La lectura es
  // fail-open (defaults de Config = 1), así que la ausencia no rompía nada — solo quitaba el control.
  { clave: "Descubrir en Instagram",             valor: 1,   descripcion: "Activa el eje de descubrimiento por Instagram (cuentas relacionadas). 1 = sí, 0 = no.", "Mostrar al equipo": true },
  { clave: "Descubrir en TikTok",                valor: 1,   descripcion: "Activa el eje de descubrimiento por TikTok (lookalikes). 1 = sí, 0 = no.", "Mostrar al equipo": true },
];

const run = async () => {
  console.log("→ Creando base 'Reels Cockpit'…");
  const base = await api("POST", "/bases", { name: "Reels Cockpit", workspaceId: WORKSPACE, tables });
  const baseId = base.id;
  const id = (t) => base.tables.find((x) => x.name === t).id;
  const pendientes = []; // lo que la API no pudo crear y hay que hacer a mano; se lista fuerte al final

  // ── links (se agregan después: referencian ids que no existían al crear) ──
  const links = [
    ["Proyectos", "voz_default", "Voces"],
    ["Referentes", "proyecto", "Proyectos"],
    ["Referentes propuestos", "proyecto", "Proyectos"],
    ["Candidatos", "proyecto", "Proyectos"],
    ["Candidatos", "voz", "Voces"],
    ["Descartes del gate", "proyecto", "Proyectos"],
  ];
  for (const [tabla, campo, destino] of links) {
    console.log(`→ Link ${tabla}.${campo} → ${destino}`);
    await api("POST", `/bases/${baseId}/tables/${id(tabla)}/fields`, {
      name: campo, type: "multipleRecordLinks", options: { linkedTableId: id(destino) },
    });
  }

  // ── columnas de costo en Métricas (ADR-021 bis): fórmula tarifa × conteo, editable en la UI ──
  // La tarifa vive baked en la fórmula (aprox., editable sin re-import). Se crean después porque
  // referencian los campos de conteo por nombre. La precisión decimal ($ con 2 dígitos) NO se puede
  // fijar por API en campos-fórmula — ajustala a mano en la UI (Customize field → Formatting).
  // Tarifas confirmadas por Mani 2026-07-14 (ADR-021 bis). costo_total suma todo → correcto por fila
  // (GLOBAL suma motor: Supadata/Haiku/Apify IG+TT; DESCUBRIMIENTO suma su Apify).
  const costFormulas = [
    ["costo_supadata",             "{supadata_llamadas} * 0.009"],   // $/crédito Supadata (1 transcript = 1 crédito)
    ["costo_haiku_lotes",          "{haiku_lotes} * 0.004"],         // $/llamada de lote pre-trim/gate
    ["costo_haiku_traducciones",   "{haiku_traducciones} * 0.005"],  // $/traducción
    ["costo_apify_ig",             "{apify_ig} * 0.0023"],           // instagram-scraper (motor)
    ["costo_apify_tt",             "{apify_tt} * 0.005"],            // free-tiktok-scraper (motor)
    ["costo_perfiles_semilla",     "{perfiles_semilla} * 0.0023"],   // instagram-profile-scraper (descubrimiento)
    ["costo_detalle_sugeridos",    "{detalle_sugeridos} * 0.0023"],  // instagram-profile-scraper (descubrimiento)
    ["costo_lookalikes_tt",        "{lookalikes_tt} * 0.20"],        // tiktok-lookalike-search (descubrimiento)
    ["costo_total",                "{costo_supadata} + {costo_haiku_lotes} + {costo_haiku_traducciones} + {costo_apify_ig} + {costo_apify_tt} + {costo_perfiles_semilla} + {costo_detalle_sugeridos} + {costo_lookalikes_tt}"],
  ];
  for (const [name, formula] of costFormulas) {
    console.log(`→ Fórmula Métricas Global.${name}`);
    await api("POST", `/bases/${baseId}/tables/${id("Métricas Global")}/fields`, {
      name, type: "formula", options: { formula },
    });
  }

  // Los 2 campos de fecha de Candidatos. Ambos son computados; si la API los rechaza hay que crearlos
  // a mano, así que el warning tiene que ser fuerte: NO son cosméticos, el archivado depende de ellos.
  const cand = base.tables.find((t) => t.name === "Candidatos");

  // fecha_calificacion: cuándo calificó el equipo (tracking de selecciones — ADR-009).
  // lastModifiedTime atado SOLO al campo 'calificacion'. El archivado lo copia a outputs.calificado_en.
  try {
    const calif = cand.fields.find((f) => f.name === "calificacion");
    await api("POST", `/bases/${baseId}/tables/${cand.id}/fields`, {
      name: "fecha_calificacion", type: "lastModifiedTime",
      options: { referencedFieldIds: [calif.id] },
    });
    console.log("→ Campo Candidatos.fecha_calificacion (last modified de 'calificacion')");
  } catch (e) {
    pendientes.push("Candidatos.fecha_calificacion → tipo 'Last modified time', track SOLO el campo 'calificacion'. Sin él, outputs.calificado_en cae a la fecha del archivado (impreciso, no fatal). (" + e.message + ")");
  }

  // fecha: cuándo llegó el candidato (created time). LOAD-BEARING: el archivado barre los 'nuevo'
  // viejos con IS_BEFORE({fecha}, -20 días). Si el campo no existe, ese filterByFormula falla y los
  // candidatos sin calificar se acumulan para siempre — en silencio.
  try {
    await api("POST", `/bases/${baseId}/tables/${cand.id}/fields`, { name: "fecha", type: "createdTime" });
    console.log("→ Campo Candidatos.fecha (created time)");
  } catch (e) {
    pendientes.push("Candidatos.fecha → tipo 'Created time'. ⚠️ SIN ESTE CAMPO el archivado NO puede barrer los candidatos 'nuevo' viejos (filtra por {fecha}) y se acumulan en silencio. (" + e.message + ")");
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
  console.log("   → Creá a mano la vista '🔥 Seleccionados' en Candidatos: filtro estado=aprobado,");
  console.log("     orden heat_score desc (el re-rank de seleccionados — las vistas no salen por API).");
  if (pendientes.length) {
    console.warn(`\n🚨 ${pendientes.length} campo(s) que la API rechazó — CREALOS A MANO ANTES DE CORRER NADA:`);
    pendientes.forEach((p) => console.warn("   • " + p));
    process.exitCode = 1; // que no pase por verde en CI ni en un ojo distraído
  }
};

run().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
