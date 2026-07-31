// Verificación post-corrida del motor: embudo, dedup, sin-guion y el feed. SOLO LEE.
//
//   set -a && source .env && set +a && node Workflows/workflow-short-form-content/verificar-corrida.mjs [n]
//
// Chequea lo que piden las corridas de fuego (cierre 66/67): intersección de external_id
// entre las 2 últimas = ∅, cero `⚠️ SIN GUION` en el feed (ADR-030), `external_id` escrito
// en todos los candidatos y cero urls repetidas (ADR-029).
//
// ⚠️ El chequeo de dedup cruza por `run_id`, que HOY VIENE NULL (`Preparar procesados` no lo
// setea — hallazgo 3 del cierre 70). Hasta que se arregle, va a decir 0 processed_items por
// corrida aunque se hayan escrito: verificá por ventana de `primera_vez` en su lugar.
// ⚠️ `registro_dedup` dice `no_corrio` SIEMPRE por el hallazgo 1 (orden de ramas por posición
// de canvas, no por el array). No lo leas como fallo hasta que ese fix esté re-importado.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, AIRTABLE_PAT, AIRTABLE_BASE_ID } = process.env;
const N = Number(process.argv[2] || 2);

const sb = async (path) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} en ${path}`);
  return r.json();
};
const air = async (tabla) => {
  const out = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tabla)}`);
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } });
    const p = await r.json();
    out.push(...(p.records || []));
    offset = p.offset;
  } while (offset);
  return out;
};
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");

const runs = await sb(`runs?select=id,inicio,fin,estado,trigger_type,metricas,error&params->>workflow=eq.motor&order=inicio.desc&limit=${N}`);

console.log("═══ CORRIDAS ═══");
for (const r of runs) {
  const dur = r.fin ? ((new Date(r.fin) - new Date(r.inicio)) / 60000).toFixed(1) + " min" : "sin cerrar";
  console.log(`\n▸ ${r.inicio.slice(0, 16)} · ${r.estado} · ${r.trigger_type} · ${dur}`);
  if (r.error) console.log(`   error: ${r.error.slice(0, 160)}`);
  const m = r.metricas;
  if (!m) { console.log("   (sin métricas)"); continue; }

  console.log(`   embudo: colectados=${m.colectados ?? "?"} · unicos=${m.unicos ?? "?"} · transcritos=${m.transcritos ?? "?"} · gate_pass=${m.gate_pass ?? "?"} · outputs=${m.outputs ?? "?"}`);
  // ADR-030: sin_guion ahora = DESCARTADOS. >0 es lo esperado, no un problema.
  console.log(`   sin_guion (descartados, ADR-030): ${m.sin_guion ?? "?"}`);
  const tv = m.transcripciones_vacias, tot = m.transcritos ?? m.unicos;
  console.log(`   transcripciones_vacias: ${tv ?? "?"}${tv != null && tot ? ` (${pct(tv, tot)} · baseline 23/07 = 41%)` : ""}`);
  console.log(`   registro_dedup: ${m.registro_dedup ?? "(ausente)"} ${m.registro_dedup === "ok" ? "✓" : "⚠️"}`);
  if (m.avisos?.length) console.log(`   avisos: ${JSON.stringify(m.avisos).slice(0, 220)}`);

  const pp = m.por_proyecto;
  if (pp) {
    console.log("   por proyecto:");
    for (const [k, v] of Object.entries(pp)) {
      console.log(`     ${k}: eval=${v.evaluados} gate=${v.gate_pass} (tasa ${v.tasa_gate}) entregados=${v.entregados}${v.razon_faltante ? ` · falta: ${v.razon_faltante}` : ""}`);
    }
  }
}

// ── Dedup entre las 2 últimas: la intersección tiene que ser ∅ ──────────────────
if (runs.length >= 2 && runs.every((r) => r.estado === "ok")) {
  console.log("\n═══ DEDUP ENTRE LAS 2 ÚLTIMAS ═══");
  const ids = [];
  for (const r of runs.slice(0, 2)) {
    const filas = await sb(`processed_items?select=external_id&run_id=eq.${r.id}`);
    ids.push(new Set(filas.map((f) => f.external_id)));
    console.log(`   ${r.inicio.slice(0, 16)}: ${filas.length} processed_items`);
  }
  const inter = [...ids[0]].filter((x) => ids[1].has(x));
  console.log(`   intersección: ${inter.length} ${inter.length === 0 ? "✓ (∅, el dedup funciona)" : "✖ HAY SOLAPE: " + inter.slice(0, 5)}`);
}

// ── El feed: ni un solo ⚠️ SIN GUION (ADR-030) ──────────────────────────────────
console.log("\n═══ FEED (Airtable Candidatos) ═══");
const cands = await air("Candidatos");
const sinGuion = cands.filter((c) => String(c.fields.titulo || "").includes("SIN GUION"));
const porProy = {};
for (const c of cands) {
  const p = (c.fields.proyecto || ["?"])[0];
  porProy[p] = (porProy[p] || 0) + 1;
}
console.log(`   ${cands.length} candidatos · ${sinGuion.length} con ⚠️ SIN GUION ${sinGuion.length === 0 ? "✓" : "✖ (ADR-030 dice que deben descartarse)"}`);
const conEid = cands.filter((c) => c.fields.external_id).length;
console.log(`   con external_id escrito (ADR-029): ${conEid}/${cands.length} ${conEid === cands.length ? "✓" : "⚠️"}`);
const dupes = Object.entries(
  cands.reduce((a, c) => { const k = c.fields.url_referente; if (k) a[k] = (a[k] || 0) + 1; return a; }, {}),
).filter(([, n]) => n > 1);
console.log(`   urls duplicadas en el feed: ${dupes.length} ${dupes.length === 0 ? "✓" : "✖ " + JSON.stringify(dupes.slice(0, 3))}`);
console.log(`   reparto: ${JSON.stringify(porProy)}`);
