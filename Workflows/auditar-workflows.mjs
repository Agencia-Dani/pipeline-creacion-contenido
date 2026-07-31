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
//   4. Code nodes            — compilan como AsyncFunction (los `await` de nivel superior hacen
//                              que un `new Function()` pelado dé falsos positivos).
//   5. Placeholders          — inventario de lo que hay que rellenar tras cada re-import (informativo).
//
// ⚠️ Límite conocido del #3: "ancestro" es alcanzabilidad en el grafo, o sea ancestro POSIBLE, no
// garantizado. Una rama de IF que no se toma sigue contando como ancestro. Eso es a propósito: el
// chequeo caza lo IMPOSIBLE (referenciar algo que nunca pudo correr), que es la clase de bug del
// cierre 70. Lo condicional se cubre con try/catch en el code node, como ya hace `Resumen del run`
// con los dos nodos de Apify.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
}

console.log("═══ AUDIT ESTRUCTURAL DE LOS WORKFLOWS ═══");
for (const dir of readdirSync(WF_ROOT).sort()) {
  if (dir.startsWith("workflow-") && existsSync(join(WF_ROOT, dir, "workflow.json"))) auditar(dir);
}

console.log(hallazgos === 0 ? "\n✓ Sin hallazgos.\n" : `\n✗ ${hallazgos} hallazgo(s).\n`);
process.exit(hallazgos === 0 ? 0 : 1);
