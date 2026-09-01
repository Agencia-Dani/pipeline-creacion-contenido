#!/usr/bin/env node
// auditar-workflows.mjs — audit estructural de los `workflow.json` de n8n. SOLO LEE.
//
//   node Workflows/auditar-workflows.mjs
//
// Exit 0 = limpio · Exit 1 = hallazgos. Sin dependencias: node pelado, igual que test-nodos.mjs.
//
// Por qué existe: estos chequeos se escribieron a mano en un scratchpad y se tiraron dos veces
// (cierres 67 y 69). La tercera fue el cierre 70, donde el #3 —el que mira si un `$('X')` apunta a
// un ancestro— habría cazado el hallazgo del dedup el día que se escribió el ADR-029, en vez de
// tres corridas después.
//
// Los 5 chequeos:
//   1. Conexiones rotas      — todo destino existe como nodo.
//   2. Inalcanzables         — todo nodo se alcanza desde algún trigger.
//   3. Refs a no-ancestros   — todo `$('X')` apunta a un nodo que puede haber corrido antes.
//                              Incluye las refs INDIRECTAS (`g('Nodo', fn)` con `g` llamando a
//                              `$(nombre)`): ese hueco dejó pasar un nodo muerto 1 mes (cierre 130).
//   4. Code nodes            — compilan como AsyncFunction (los `await` de nivel superior hacen
//                              que un `new Function()` pelado dé falsos positivos).
//   5. Placeholders          — inventario de lo que hay que rellenar tras cada re-import (informativo).
//   6. Invariante #1         — todo nodo HTTP de registro lleva `onError: continueRegularOutput`; los
//                              fail-closed son una lista explícita (FAIL_CLOSED) con su porqué.
//
// ⚠️ Límite conocido del #3: "ancestro" es alcanzabilidad en el grafo, o sea ancestro POSIBLE, no
// garantizado. Una rama de IF que no se toma sigue contando como ancestro. Eso es a propósito: el
// chequeo caza lo IMPOSIBLE (referenciar algo que nunca pudo correr), que es la clase de bug del
// cierre 70. Lo condicional se cubre con try/catch en el code node, como ya hace `Resumen del run`
// con los dos nodos de Apify.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Los únicos nodos HTTP que PUEDEN tumbar una corrida. Todo lo demás es registro y va
// continue-on-fail (invariante #1 de PLAN §2.5). La lista es explícita a propósito: el default es
// "sos sumidero", así que un nodo HTTP nuevo entra pidiendo su `onError` y quien lo quiera
// fail-closed tiene que escribir acá por qué. Es el reemplazo de V6 — el simulacro que pedía romper
// una credencial NO se puede montar: los 31 nodos comparten `Config.supabase_url`, así que romper el
// registro rompe también la entrega. Lo que V6 quería probar se lee del JSON, y se lee en cada commit.
const FAIL_CLOSED = {
  "workflow-short-form-content": {
    "Leer plan (fachada)": "sin config el run tiene que abortar (ADR-028)",
    "Leer procesados": "sin memoria de dedup el run aborta en vez de re-entregar todo (ADR-029 exc. 1)",
    "POST Candidatos": "es LA entrega, no el registro",
  },
  "workflow-archivado": {
    "Leer plan (fachada)": "sin config el run tiene que abortar (ADR-028)",
    "Leer Candidatos calificados": "es el insumo de la entrega, no un sumidero",
    "Borrar candidatos": "reintenta 3× y si igual falla corta: el candidato queda y la corrida siguiente lo re-toma sin duplicar (upsert por instance_id+external_id)",
  },
  "workflow-descubrimiento-referentes": {
    "Leer plan (fachada)": "sin config el run tiene que abortar (ADR-028)",
    "POST Propuestos": "es LA entrega del descubrimiento",
  },
  "workflow-dispatcher": {
    "Leer instancias (fachada)": "sin la lista de instancias no hay a quién disparar (ADR-028 + ADR-050)",
  },
  "workflow-linkedin": {
    "Leer plan (fachada)": "sin config el run tiene que abortar (ADR-028)",
    "POST Candidatos": "es LA entrega, no el registro",
  },
};

const WF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

let hallazgos = 0;
const fail = (wf, msg) => { hallazgos++; console.log(`  ✗ ${msg}`); };

/** Aristas del grafo: n8n agrupa por tipo de conexión (`main`, `ai_tool`, …). Las miramos todas. */
function aristas(wf) {
  const out = [];
  for (const [src, tipos] of Object.entries(wf.connections || {})) {
    for (const salidas of Object.values(tipos)) {
      for (const conns of salidas || []) {
        for (const c of conns || []) out.push([src, c.node]);
      }
    }
  }
  return out;
}

const esTrigger = (n) =>
  /Trigger$/.test(n.type) || n.type === "n8n-nodes-base.webhook" || n.type === "n8n-nodes-base.formTrigger";

/** Nodos alcanzables desde `desde`, siguiendo las aristas en la dirección dada. */
/**
 * Nombres de nodo que llegan a `$()` de forma INDIRECTA, por un helper.
 *
 * 🩸 El punto ciego que esto tapa, medido el 2026-08-31: `Cerrar run en el registro` del
 * descubrimiento hace `g('Preparar promoción', fn)` donde `g(nombre, fn)` llama a `$(nombre)`
 * adentro. Ese nodo no existe desde que la promoción salió del workflow (ADR-020), pero el literal
 * nunca aparece pegado a `$(`, así que el regex del chequeo #3 no lo veía: el audit decía
 * "✓ Sin hallazgos" mientras la métrica `promovidos` valía 0 en todas las corridas y el cockpit
 * la pintaba como una alarma permanente.
 *
 * Se resuelve en dos pasos y a propósito NO con heurística de "string que parece nombre de nodo":
 * eso daría falsos positivos con cada `console.log`. Acá se exige la evidencia estructural —
 * que exista un helper cuyo cuerpo llame `$(<su primer parámetro>)`.
 */
function refsIndirectas(js) {
  const out = new Set();
  if (typeof js !== "string" || !js.includes("$(")) return out;

  // Helpers cuyo primer parámetro termina adentro de un `$(...)`:
  //   function g(nombre, ...) {...}  ·  const g = (nombre, ...) => {...}  ·  var g = function(nombre, ...)
  const defs = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(\s*([A-Za-z_$][\w$]*))/g;
  const indirectos = new Set();
  for (const m of js.matchAll(defs)) {
    const nombre = m[1] ?? m[3];
    const param = m[2] ?? m[4];
    if (!nombre || !param) continue;
    if (new RegExp("\\$\\(\\s*" + param + "\\s*\\)").test(js)) indirectos.add(nombre);
  }

  // Y las llamadas a esos helpers con un string literal como primer argumento.
  for (const h of indirectos) {
    for (const m of js.matchAll(new RegExp("\\b" + h + "\\s*\\(\\s*['\"]([^'\"]+)['\"]", "g"))) {
      out.add(m[1]);
    }
  }
  return out;
}

function alcanzables(desde, adyacencia) {
  const visto = new Set(desde);
  const pila = [...desde];
  while (pila.length) {
    for (const sig of adyacencia.get(pila.pop()) || []) {
      if (!visto.has(sig)) { visto.add(sig); pila.push(sig); }
    }
  }
  return visto;
}

function auditar(dir) {
  const ruta = join(WF_ROOT, dir, "workflow.json");
  const wf = JSON.parse(readFileSync(ruta, "utf8"));
  const nombres = new Set(wf.nodes.map((n) => n.name));
  const triggers = wf.nodes.filter(esTrigger).map((n) => n.name);

  console.log(`\n▸ ${dir} — ${wf.nodes.length} nodos · ${triggers.length} triggers · executionOrder ${wf.settings?.executionOrder ?? "(sin definir)"}`);

  const todas = aristas(wf);
  const sucesores = new Map();
  const predecesores = new Map();
  for (const [a, b] of todas) {
    if (!nombres.has(b)) fail(dir, `conexión rota: ${a} → "${b}" (ese nodo no existe)`);
    if (!nombres.has(a)) fail(dir, `conexión rota: "${a}" (origen inexistente) → ${b}`);
    if (!sucesores.has(a)) sucesores.set(a, []);
    if (!predecesores.has(b)) predecesores.set(b, []);
    sucesores.get(a).push(b);
    predecesores.get(b).push(a);
  }

  // 2. Inalcanzables
  const vivos = alcanzables(triggers, sucesores);
  for (const n of wf.nodes) {
    if (!vivos.has(n.name)) fail(dir, `inalcanzable desde cualquier trigger: ${n.name}`);
  }

  // 3. Refs a no-ancestros
  for (const nodo of wf.nodes) {
    const texto = JSON.stringify(nodo.parameters ?? {});
    const refs = new Set([...texto.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]));
    // Las que pasan por un helper (ver refsIndirectas): mismo trato, el nodo tiene que existir
    // y tiene que ser ancestro. Se miran los dos campos donde vive JS en n8n.
    for (const js of [nodo.parameters?.jsCode, nodo.parameters?.jsonBody]) {
      for (const r of refsIndirectas(js)) refs.add(r);
    }
    if (!refs.size) continue;
    const ancestros = alcanzables([nodo.name], predecesores);
    for (const ref of refs) {
      if (ref === nodo.name) continue;
      if (!nombres.has(ref)) fail(dir, `${nodo.name} referencia $('${ref}'), que no existe`);
      else if (!ancestros.has(ref)) fail(dir, `${nodo.name} referencia $('${ref}'), que NO es ancestro suyo — puede no haber corrido todavía`);
    }
  }

  // 4. Code nodes
  let code = 0;
  for (const nodo of wf.nodes) {
    const js = nodo.parameters?.jsCode;
    if (typeof js !== "string") continue;
    code++;
    try {
      new AsyncFn("$", "$input", "$json", "$now", "console", js);
    } catch (e) {
      fail(dir, `${nodo.name}: el jsCode no compila — ${e.message}`);
    }
  }
  console.log(`  · ${code} code nodes compilan como AsyncFunction`);

  // 5. Placeholders (informativo: no son hallazgos, son la checklist del re-import)
  const ph = [...new Set(readFileSync(ruta, "utf8").match(/<<?[A-ZÁÉÍÓÚÑ][^>"]*>>?/g) || [])].sort();
  if (ph.length) console.log(`  · placeholders a rellenar tras el re-import: ${ph.join(" ")}`);

  // 6. Invariante #1 — el registro es sumidero, jamás dependencia de ejecución
  const excepciones = FAIL_CLOSED[dir] ?? {};
  let sumidero = 0;
  for (const nodo of wf.nodes) {
    if (nodo.type !== "n8n-nodes-base.httpRequest") continue;
    const declarado = nodo.onError === "continueRegularOutput";
    const exceptuado = Object.hasOwn(excepciones, nodo.name);
    if (exceptuado && declarado) {
      fail(dir, `${nodo.name} está en FAIL_CLOSED pero tiene onError: continue — la lista quedó vieja, sacalo de ahí`);
    } else if (!exceptuado && !declarado) {
      fail(dir, `${nodo.name} no tiene onError: continueRegularOutput — si es registro, es el invariante #1 roto; si de verdad tiene que abortar la corrida, agregalo a FAIL_CLOSED con su porqué`);
    }
    if (!exceptuado) sumidero++;
  }
  for (const nombre of Object.keys(excepciones)) {
    if (!nombres.has(nombre)) fail(dir, `FAIL_CLOSED nombra "${nombre}", que ya no existe en el workflow`);
  }
  console.log(`  · invariante #1: ${sumidero} nodos de registro continue-on-fail · ${Object.keys(excepciones).length} fail-closed con porqué`);
}

console.log("═══ AUDIT ESTRUCTURAL DE LOS WORKFLOWS ═══");
const dirs = readdirSync(WF_ROOT).sort().filter((d) => d.startsWith("workflow-"));
const conMotor = dirs.filter((d) => existsSync(join(WF_ROOT, d, "workflow.json")));
for (const dir of conMotor) auditar(dir);

// Los que no tienen `workflow.json` se saltean —no hay nada que auditar— pero **se nombran**.
// Un audit que termina en "✓ Sin hallazgos" habiendo mirado 5 de 7 dice algo más fuerte de lo que
// midió, y es el mismo modo de falla que el validador tenía con `linkedin`: verde por ausencia.
// El cuántos-de-cuántos es lo único que distingue "está todo bien" de "no había nada que mirar".
const salteados = dirs.filter((d) => !conMotor.includes(d));
console.log(`\n▸ auditados ${conMotor.length} de ${dirs.length} workflows del repo`);
if (salteados.length) {
  console.log(`  · sin workflow.json, nada que auditar: ${salteados.join(" · ")}`);
}

console.log(hallazgos === 0 ? "\n✓ Sin hallazgos.\n" : `\n✗ ${hallazgos} hallazgo(s).\n`);
process.exit(hallazgos === 0 ? 0 : 1);
