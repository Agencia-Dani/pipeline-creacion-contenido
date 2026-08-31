// Rescate de los videos que la ráfaga contra Supadata quemó (plan-rescate-huerfanos.md).
//
//   set -a && source .env && set +a && node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs [flags]
//
//   (sin flags)              dry-run: calcula y reporta, NO escribe nada
//   --desde <YYYY-MM-DD>     acota por processed_items.primera_vez
//   --plataforma <p>         default: instagram
//   --apply                  escribe: guarda el JSON de evidencia y BORRA
//   --test                   prueba el decodificado de shortcode contra prod y sale
//   --verificar <a.json>     lee un rescate pasado y mide si los videos volvieron
//
// 🩸 **El problema que resuelve.** `POST processed_items` corre ANTES de `Transcribir` (ADR-029 §2).
// Un video que se comió un 429 ya está en la memoria del dedup: vuelve sin transcript, el gate lo
// descarta duro como `sin_guion` (ADR-030) y NINGUNA corrida futura lo vuelve a mirar. Medido el
// 2026-08-31: 593 transcripciones vacías sobre 1.755 videos mandados a Supadata en 29 corridas.
//
// **Lo único que hace este script es borrarle la fila de dedup a esos videos** para que la corrida
// siguiente los vuelva a ver como nuevos y los pase por el camino de siempre. No toca el motor, no
// toca la app, no toca el schema, y no le agrega ni una llamada a Apify: el scraper ya baja esos 50
// videos por cuenta en CADA corrida y hoy el dedup los tira.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE. Cargá el .env:");
  console.error("  set -a && source .env && set +a && node <este archivo>");
  process.exit(1);
}

// ─────────────────────────── flags ───────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const valor = (n, def) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const DESDE = valor("--desde", null);
const PLATAFORMA = valor("--plataforma", "instagram");
const APLICAR = flag("--apply");
const VERIFICAR = valor("--verificar", null);

// ─────────────────────────── PostgREST ───────────────────────────
// Misma forma que `verificar-corrida.mjs`, con paginado: acá se leen tablas de 1.800+ filas y
// PostgREST corta en 1.000 por defecto, así que sin paginar el cálculo de huérfanos daría de más
// (todo lo que no entró en la primera página se vería como "no es candidato").
const sb = async (path, esquema) => {
  const salida = [];
  for (let off = 0; ; off += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}${sep}limit=1000&offset=${off}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        ...(esquema ? { "Accept-Profile": esquema } : {}),
      },
    });
    if (!r.ok) throw new Error(`Supabase ${r.status} en ${path}: ${await r.text()}`);
    const pagina = await r.json();
    salida.push(...pagina);
    if (pagina.length < 1000) return salida;
  }
};

// ─────────────────── El decodificado de shortcode ───────────────────
//
// 🔑 **La pieza que sostiene todo el rescate.** `processed_items` guarda `platform + external_id` y
// nada más: la columna `url` se la llevó la migración `023`. Pero `outputs` y `app.descartes`
// guardan la URL y NO el id, así que sin convertir uno en el otro no hay forma de saber que un
// video ya está archivado o ya se auditó.
//
// El `external_id` de Instagram ES el shortcode de la URL en base64, con este alfabeto. No se
// asume: `--test` lo prueba contra los candidatos de prod, que tienen los dos campos al lado.
//
// ⚠️ Sin este cruce el borrado se llevaría la memoria de videos YA RESUELTOS, y la próxima corrida
// se los pondría al equipo en el feed para calificar lo que ya calificó.
const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IDX = new Map([...AL].map((c, i) => [c, i]));

export const shortcodeAId = (sc) => {
  let n = 0n;
  for (const c of sc) {
    const v = IDX.get(c);
    if (v === undefined) return null;
    n = n * 64n + BigInt(v);
  }
  return n > 0n ? n.toString() : null;
};

export const idDeUrl = (url) => {
  const ig = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(url || "");
  if (ig) return shortcodeAId(ig[1]);
  // TikTok no necesita decodificar nada: su external_id viaja literal en la URL. Está acá y no en
  // el rescate porque `outputs` y `app.descartes` mezclan las dos plataformas, y un archivado de
  // TikTok que no se reconozca queda SIN proteger aunque hoy el rescate no lo toque.
  const tt = /tiktok\.com\/[^/]*\/video\/(\d+)/.exec(url || "");
  return tt ? tt[1] : null;
};

// ─────────────────────────── --test ───────────────────────────
async function probarDecodificado() {
  const cand = await sb("candidatos?select=external_id,url_referente", "app");
  const pares = cand.filter(
    (c) => c.external_id && /^\d+$/.test(c.external_id) && /instagram\.com/.test(c.url_referente || ""),
  );
  let ok = 0;
  const fallas = [];
  for (const c of pares) {
    if (idDeUrl(c.url_referente) === c.external_id) ok++;
    else fallas.push(`${c.external_id} → ${idDeUrl(c.url_referente)} (url ${c.url_referente})`);
  }
  console.log(`shortcode: ${ok}/${pares.length} ${fallas.length ? "✗" : "✓"}`);
  for (const f of fallas.slice(0, 5)) console.log(`  falla: ${f}`);
  if (fallas.length || pares.length < 100) {
    console.error(
      fallas.length
        ? "\n⛔ El decodificado NO es exacto. NO se puede borrar: el borrado se llevaría videos ya resueltos."
        : "\n⛔ Muestra insuficiente (<100 pares). No alcanza para dar el decodificado por probado.",
    );
    process.exit(1);
  }
}

// ───────────────────── El cálculo de huérfanos ─────────────────────
//
// Un huérfano es una fila de `processed_items` que no es NINGUNA de estas tres cosas:
//   1. un candidato vivo      (match directo por external_id)
//   2. un archivado           (outputs.metadata->>'url_referente', decodificado)
//   3. un descarte auditable  (app.descartes.url_referente, decodificado)
//
// Se recalcula SIEMPRE al correr, nunca se lee de una lista guardada: entre que se mide y que se
// borra, el equipo puede haber calificado o archivado.
async function huerfanos() {
  const [pi, cand, outs, desc] = await Promise.all([
    sb("processed_items?select=id,external_id,platform,run_id,primera_vez,instance_id"),
    sb("candidatos?select=external_id", "app"),
    sb("outputs?select=metadata"),
    sb("descartes?select=url_referente", "app"),
  ]);

  const vivos = new Set();
  for (const c of cand) if (c.external_id) vivos.add(c.external_id);

  // Se cuentan las URLs que el decodificado NO pudo leer. Es la cobertura real de la protección:
  // una URL que no decodifica es un video resuelto que queda SIN proteger, y hay que saberlo.
  let sinDecodificar = 0;
  const sumar = (url) => {
    const id = idDeUrl(url);
    if (id) vivos.add(id);
    else if (url) sinDecodificar++;
  };
  for (const o of outs) sumar((o.metadata || {}).url_referente);
  for (const d of desc) sumar(d.url_referente);

  const ventana = pi.filter(
    (p) => p.platform === PLATAFORMA && (!DESDE || (p.primera_vez || "").slice(0, 10) >= DESDE),
  );
  const clasificar = (p) => vivos.has(p.external_id);

  return {
    total: pi.length,
    ventana,
    filas: ventana.filter((p) => !clasificar(p)),
    candidatos: cand.length,
    archivados: outs.length,
    descartes: desc.length,
    sinDecodificar,
  };
}

function reportar(r) {
  const enVentana = new Set(r.filas.map((f) => f.id));
  const resueltos = r.ventana.filter((p) => !enVentana.has(p.id)).length;
  console.log(`\n═══ HUÉRFANOS ${DESDE ? `desde ${DESDE}` : "(toda la historia)"} · ${PLATAFORMA} ═══`);
  console.log(`processed_items en total: ${r.total}`);
  console.log(`filas en la ventana:      ${r.ventana.length}`);
  console.log(`  ya resueltos (candidato vivo, archivado o descarte): ${resueltos}`);
  console.log(`  HUÉRFANOS:                                           ${r.filas.length}`);
  console.log(
    `\nvivos consultados: ${r.candidatos} candidatos · ${r.archivados} archivados · ${r.descartes} descartes`,
  );
  console.log(
    `urls que el decodificado no pudo leer: ${r.sinDecodificar}` +
      (r.sinDecodificar ? "  ⚠️ esos videos resueltos quedan SIN proteger" : " ✓"),
  );

  const porRun = new Map();
  for (const f of r.filas) porRun.set(f.run_id, (porRun.get(f.run_id) || 0) + 1);
  console.log("\nhuérfanos por corrida:");
  for (const [run, n] of [...porRun].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(run || "(sin corrida)").slice(0, 8)}  ${String(n).padStart(4)}`);
  }
}

// ───────────────────── Guardar, y recién después borrar ─────────────────────
//
// 🔒 **El orden es la regla, no una preferencia.** El borrado destruye la ÚNICA evidencia de qué se
// rescató: las filas dejan de existir y `runs.metricas` guarda contadores, no ids. Si el archivo no
// se puede escribir, no se borra nada — sin él, la pregunta "¿volvieron?" deja de tener respuesta.
async function aplicar(filas) {
  const { writeFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const sello = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
  const ruta = join(dirname(fileURLToPath(import.meta.url)), `rescate-${sello}.json`);
  const evidencia = {
    generado_en: new Date().toISOString(),
    desde: DESDE,
    plataforma: PLATAFORMA,
    ids: filas.map((f) => f.id),
    external_ids: filas.map((f) => f.external_id),
  };
  writeFileSync(ruta, JSON.stringify(evidencia, null, 2));
  console.log(`\n✓ evidencia guardada: ${ruta} (${filas.length} ids)`);

  // Se borra por la PRIMARY KEY y acotado por instancia, nunca por un filtro de fecha contra la
  // tabla: si el cálculo de arriba tuviera un bug, un filtro por fecha se llevaría también los
  // vivos. Con la PK, lo peor que puede pasar es borrar de menos.
  const porInstancia = new Map();
  for (const f of filas) {
    if (!porInstancia.has(f.instance_id)) porInstancia.set(f.instance_id, []);
    porInstancia.get(f.instance_id).push(f.id);
  }

  let borradas = 0;
  for (const [instancia, ids] of porInstancia) {
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/processed_items?id=in.(${lote.join(",")})` +
          `&instance_id=eq.${instancia}&platform=eq.${PLATAFORMA}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            Prefer: "return=representation",
          },
        },
      );
      if (!r.ok) throw new Error(`Supabase ${r.status} borrando: ${await r.text()}`);
      // Lo que se cuenta es lo que la base DEVOLVIÓ, no lo que se pidió. Son dos números distintos
      // y el que vale es el segundo.
      borradas += (await r.json()).length;
    }
  }
  console.log(`✓ filas borradas de processed_items: ${borradas} (pedidas: ${filas.length})`);
  if (borradas !== filas.length) console.log("⚠️ los dos números no coinciden: mirá antes de correr el motor");
  return { ruta, borradas };
}

// ───────────────────────── --verificar ─────────────────────────
//
// 🐤 Primer uso real de `candidatos.run_id` (ADR-081), cuyo canario nació en cero a propósito.
async function verificar(archivo) {
  const { readFileSync } = await import("node:fs");
  const ev = JSON.parse(readFileSync(archivo, "utf8"));
  const rescatados = new Set(ev.external_ids);

  const runs = (await sb("runs?select=id,inicio,estado,metricas&params->>workflow=eq.motor&order=inicio.desc")).filter(
    (r) => r.inicio > ev.generado_en,
  );
  if (!runs.length) {
    console.log(`Todavía no corrió el motor después del rescate (${ev.generado_en}). Nada que medir.`);
    return;
  }
  const idsRun = new Set(runs.map((r) => r.id));

  const [pi, cand] = await Promise.all([
    sb("processed_items?select=external_id,run_id"),
    sb("candidatos?select=external_id,run_id", "app"),
  ]);

  const revistos = pi.filter((p) => idsRun.has(p.run_id) && rescatados.has(p.external_id));
  const enFeed = cand.filter((c) => idsRun.has(c.run_id) && rescatados.has(c.external_id));
  const enFeedIds = new Set(enFeed.map((c) => c.external_id));
  const quemadosOtraVez = revistos.filter((p) => !enFeedIds.has(p.external_id));

  const n = ev.external_ids.length;
  const pct = (x) => `${Math.round((x / n) * 100)}%`;
  console.log(`\n═══ VERIFICACIÓN DEL RESCATE ${ev.generado_en.slice(0, 16)} ═══`);
  console.log(`rescatados: ${n}`);
  console.log(`corridas del motor posteriores: ${runs.map((r) => r.inicio.slice(0, 16)).join(", ")}`);
  console.log(`\n  el motor los volvió a ver: ${revistos.length} (${pct(revistos.length)})`);
  console.log(`  llegaron al feed:          ${enFeed.length} (${pct(enFeed.length)})`);
  console.log(`  vueltos a ver pero fuera del feed (gate o quemados): ${quemadosOtraVez.length}`);
  const v = revistos.length / n;
  console.log(
    `\nlectura: ${
      v > 0.6
        ? "el supuesto del top 50 se sostiene → soltar el resto por tandas"
        : v >= 0.2
          ? "vuelven algunos → soltar por tandas y medir cada una"
          : "el video ya se cayó del top 50 → el camino A no alcanza, se discute B"
    }`,
  );
}

// ─────────────────────────── main ───────────────────────────
if (VERIFICAR) {
  await verificar(VERIFICAR);
} else if (flag("--test")) {
  await probarDecodificado();
} else {
  await probarDecodificado(); // el decodificado se prueba SIEMPRE antes de calcular nada
  const r = await huerfanos();
  reportar(r);
  if (!APLICAR) {
    console.log(`\n(dry-run: no se escribió nada. Agregá --apply para guardar la evidencia y borrar.)`);
  } else {
    await aplicar(r.filas);
  }
}
