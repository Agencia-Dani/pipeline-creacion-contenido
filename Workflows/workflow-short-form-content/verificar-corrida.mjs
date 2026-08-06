// Verificación post-corrida del motor: embudo, dedup, sin-guion y el feed. SOLO LEE.
//
// ✅ **Corre entero otra vez desde el 2026-08-05.** Estuvo medio muerto desde D7: el bloque del feed
// leía `api.airtable.com`, y Airtable salió del sistema (ADR-035) con su PAT revocado. Ahora el feed
// se lee de `app.candidatos` por PostgREST, que es donde vive desde D7. **No le devuelvas la
// credencial de Airtable a nada de acá.**
//
//   set -a && source .env && set +a && node Workflows/workflow-short-form-content/verificar-corrida.mjs [n]
//
// Chequea lo que piden las corridas de fuego (cierre 66/67): intersección de external_id
// entre las 2 últimas = ∅, cero `⚠️ SIN GUION` en el feed (ADR-030), `external_id` escrito
// en todos los candidatos y cero urls repetidas (ADR-029).
//
// El chequeo de dedup cruza por `run_id`. Las corridas ANTERIORES al re-import de la enmienda
// 2026-07-31 de ADR-029 lo tienen `null`, así que para esas se cae a la ventana de `primera_vez`
// (entre `inicio` y `fin` del run) — si no, la intersección daría ∅ por vacío y no por dedup.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
const N = Number(process.argv[2] || 2);

// `esquema` es `public` por defecto; el feed y todo lo del cockpit viven en `app`, que PostgREST
// solo sirve si se lo pedís por `Accept-Profile` (está en *Exposed schemas* desde D0).
const sb = async (path, esquema) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      ...(esquema ? { "Accept-Profile": esquema } : {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} en ${path}`);
  return r.json();
};
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");

const runs = await sb(`runs?select=id,instance_id,inicio,fin,estado,trigger_type,metricas,error&params->>workflow=eq.motor&order=inicio.desc&limit=${N}`);

console.log("═══ CORRIDAS ═══");
for (const r of runs) {
  const dur = r.fin ? ((new Date(r.fin) - new Date(r.inicio)) / 60000).toFixed(1) + " min" : "sin cerrar";
  console.log(`\n▸ ${r.inicio.slice(0, 16)} · ${r.estado} · ${r.trigger_type} · ${dur}`);
  if (r.error) console.log(`   error: ${r.error.slice(0, 160)}`);
  const m = r.metricas;
  if (!m) { console.log("   (sin métricas)"); continue; }

  // Las claves son las que emite `Resumen del run`, no las del embudo conceptual: `pretrim` es lo
  // que sobrevivió al pre-trim, `filtrados` la salida del heat-score (= lo que se transcribe) y
  // `gate` los que pasaron el gate (solo los NO-_descarte).
  console.log(`   embudo: colectados=${m.colectados ?? "?"} → asignados=${m.asignados ?? "?"} → pretrim=${m.pretrim ?? "?"} → filtrados=${m.filtrados ?? "?"} → gate=${m.gate ?? "?"} → outputs=${m.outputs ?? "?"}`);
  // ADR-030: sin_guion ahora = DESCARTADOS. >0 es lo esperado, no un problema.
  console.log(`   sin_guion (descartados, ADR-030): ${m.sin_guion ?? "?"}`);
  // El denominador de las vacías son los videos DISTINTOS que se mandaron a Supadata.
  const tv = m.transcripciones_vacias, tot = m.llamadas?.supadata;
  console.log(`   transcripciones_vacias: ${tv ?? "?"}${tv != null && tot ? ` (${pct(tv, tot)} · baseline 23/07 = 41%)` : ""}`);
  // `no_corrio` ya no es el estado por defecto: desde la enmienda 2026-07-31 de ADR-029 la memoria
  // se graba en serie aguas arriba, así que verlo significa que el motor todavía corre el JSON viejo.
  const rd = m.registro_dedup;
  const nota = rd === "ok" ? "✓" : rd === "no_corrio" ? "⚠️ el motor corre el workflow SIN el fix de la enmienda 2026-07-31 (falta re-import)" : "⚠️";
  console.log(`   registro_dedup: ${rd ?? "(ausente)"} ${nota}`);
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
// La memoria de una corrida son sus filas de `processed_items`. Se piden por `run_id`; si esa
// corrida es anterior al fix del hallazgo 3 (run_id null), se cae a la ventana de `primera_vez`.
//
// La ventana NO puede cerrar en `fin`: antes del fix del hallazgo 1 la memoria se grababa DESPUÉS de
// `Cerrar run` (en la corrida del 31/07, 2 segundos después). El techo es el arranque de la corrida
// siguiente — todo lo escrito entre dos arranques pertenece a la primera.
// Ojo con lo que la ventana NO puede distinguir: `processed_items` tiene DOS escritores desde
// ADR-031 (el motor y el transcriptor a pedido de la app), así que puede sumar de más algún enlace
// que el equipo pegó a mano entre dos corridas. Por `run_id` no pasa: ahí la atribución es exacta.
const memoriaDe = async (r, hasta) => {
  const porRun = await sb(`processed_items?select=external_id&run_id=eq.${r.id}`);
  if (porRun.length) return { filas: porRun, via: "run_id" };
  const porVentana = await sb(
    `processed_items?select=external_id&primera_vez=gte.${encodeURIComponent(r.inicio)}&primera_vez=lt.${encodeURIComponent(hasta)}`,
  );
  return { filas: porVentana, via: "ventana primera_vez (run_id null: corrida previa al fix)" };
};

if (runs.length >= 2 && runs.every((r) => r.estado === "ok")) {
  console.log("\n═══ DEDUP ENTRE LAS 2 ÚLTIMAS ═══");
  const ids = [];
  for (const [i, r] of runs.slice(0, 2).entries()) {
    // techo = arranque de la corrida siguiente (la de índice i-1, más nueva); para la última, ahora
    const hasta = i === 0 ? new Date().toISOString() : runs[i - 1].inicio;
    const { filas, via } = await memoriaDe(r, hasta);
    ids.push(new Set(filas.map((f) => f.external_id)));
    console.log(`   ${r.inicio.slice(0, 16)}: ${filas.length} processed_items · por ${via}`);
  }
  const inter = [...ids[0]].filter((x) => ids[1].has(x));
  console.log(`   intersección: ${inter.length} ${inter.length === 0 ? "✓ (∅, el dedup funciona)" : "✖ HAY SOLAPE: " + inter.slice(0, 5)}`);
}

// ── El feed: ni un solo ⚠️ SIN GUION (ADR-030) ──────────────────────────────────
// Se lee de `app.candidatos`, el feed vivo desde D7. Se acota a la instancia de la corrida más
// reciente: desde la Fase 4 hay varias instancias y sumarlas daría un reparto que no es de nadie.
const instancia = runs[0]?.instance_id;
if (!instancia) {
  console.log("\n═══ FEED ═══\n   (sin corridas del motor: nada que mirar)");
} else {
  console.log(`\n═══ FEED (app.candidatos · instancia ${instancia.slice(0, 8)}…) ═══`);
  const cands = await sb(
    `candidatos?select=titulo,external_id,url_referente,proyecto_id&instance_id=eq.${instancia}`,
    "app",
  );
  const proys = await sb(`proyectos?select=id,nombre`, "app");
  const nombreDe = new Map(proys.map((p) => [p.id, p.nombre]));

  const sinGuion = cands.filter((c) => String(c.titulo || "").includes("SIN GUION"));
  const porProy = {};
  for (const c of cands) {
    // `(sin proyecto)` es visible y raro a propósito: un candidato sin proyecto resoluble existe
    // (`Preparar candidatos` lo deja viajar) y tiene que verse, no perderse en un `?`.
    const p = c.proyecto_id ? (nombreDe.get(c.proyecto_id) ?? c.proyecto_id.slice(0, 8)) : "(sin proyecto)";
    porProy[p] = (porProy[p] || 0) + 1;
  }
  console.log(`   ${cands.length} candidatos · ${sinGuion.length} con ⚠️ SIN GUION ${sinGuion.length === 0 ? "✓" : "✖ (ADR-030 dice que deben descartarse)"}`);
  const conEid = cands.filter((c) => c.external_id).length;
  console.log(`   con external_id escrito (ADR-029): ${conEid}/${cands.length} ${conEid === cands.length ? "✓" : "⚠️"}`);
  const dupes = Object.entries(
    cands.reduce((a, c) => { const k = c.url_referente; if (k) a[k] = (a[k] || 0) + 1; return a; }, {}),
  ).filter(([, n]) => n > 1);
  console.log(`   urls duplicadas en el feed: ${dupes.length} ${dupes.length === 0 ? "✓" : "✖ " + JSON.stringify(dupes.slice(0, 3))}`);
  console.log(`   reparto: ${JSON.stringify(porProy)}`);
}
