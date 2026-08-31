#!/usr/bin/env node
// n8n-sync — compara y parchea los workflows live por la API pública de n8n (ADR-053).
//
// El principio: EL REPO ES LA FORMA, EL LIVE ES EL ESTADO. Nunca se empuja el repo entero.
// Se toma el live como base (que ya tiene credenciales, ids de Apify, settings de instancia y
// los placeholders resueltos) y se le aplican los parameters del repo, con los placeholders
// sustituidos por valores APRENDIDOS del propio live.
//
//   node n8n-sync.mjs diff [alias]            compara repo↔live (no escribe nada)
//   node n8n-sync.mjs pull <alias>            baja el live a .n8n-snapshots/
//   node n8n-sync.mjs push <alias> [--nodos "A,B"] [--apply]
//   node n8n-sync.mjs restore <alias> <archivo-de-snapshot> --apply
//
// `push` sin --apply es dry-run: muestra exactamente qué cambiaría y no toca nada.
// Semántica del PUT verificada contra la instancia (ADR-053 §contexto): `settings` MERGEA
// (por eso no mandamos binaryMode/timezone/errorWorkflow y sobreviven), `nodes` REEMPLAZA
// (por eso siempre va el array completo), y un PUT sobre un workflow activo lo deja activo
// con el webhookId y el path intactos.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const SNAPS = path.join(RAIZ, '.n8n-snapshots');

// alias → carpeta del repo. El id de n8n NO vive acá: va al .env como N8N_WF_<ALIAS>,
// por la convención del repo (ni credenciales ni IDs en git).
//
// Los cinco de abajo son APODOS y por eso se escriben: `motor` no se deriva de
// `workflow-short-form-content`, y renombrarlos rompería la memoria muscular de quien los usa
// todos los días.
const APODOS = {
  motor: 'workflow-short-form-content',
  descubrimiento: 'workflow-descubrimiento-referentes',
  dispatcher: 'workflow-dispatcher',
  archivado: 'workflow-archivado',
  errores: 'workflow-registro-fallos',
};

// 🩸 **Y el resto se descubre solo, que es lo que faltaba.** Con la lista literal, un pipeline nuevo
// era invisible para `n8n:diff` y `n8n:push` hasta que alguien se acordara de agregarlo acá — y el
// síntoma de olvidarse no es un error, es que el comando pasa en verde sin haber mirado ese
// workflow. Un dir con `workflow.json` ya tiene, por definición, algo que comparar contra el live.
//
// Se pide el `workflow.json` y no el manifest a propósito: `workflow-linkedin` y `workflow-substack`
// tienen `workflow.yaml` y ningún motor, así que aparecer acá solo produciría un alias que muere al
// leerlo. Entran el día que tengan el archivo, sin que nadie toque este script.
function descubrirAlias() {
  const dirs = fs.readdirSync(path.join(RAIZ, 'Workflows'))
    .filter((d) => d.startsWith('workflow-')
      && fs.existsSync(path.join(RAIZ, 'Workflows', d, 'workflow.json')));
  const mapa = { ...APODOS };
  const conApodo = new Set(Object.values(APODOS));
  for (const d of dirs) if (!conApodo.has(d)) mapa[d.replace(/^workflow-/, '')] = d;
  return mapa;
}

const ALIAS = descubrirAlias();

// Un placeholder es <<ASI>> o <ASI>. Se exige mayúsculas y ≥3 caracteres para no confundirlo
// con un `<div>` o un genérico dentro de un jsCode.
const PLACEHOLDER = /<<[A-Z][A-Z0-9_]{2,}>>|<[A-Z][A-Z0-9_]{2,}>/g;

const c = { rojo: '\x1b[31m', verde: '\x1b[32m', amar: '\x1b[33m', gris: '\x1b[90m', neg: '\x1b[1m', off: '\x1b[0m' };
const die = (msg) => { console.error(`${c.rojo}✖ ${msg}${c.off}`); process.exit(1); };

// ── entorno ──────────────────────────────────────────────────────────────────────────────
try { process.loadEnvFile(path.join(RAIZ, '.env')); } catch { /* puede venir ya exportado */ }
const BASE = process.env.N8N_BASE_URL?.replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;

async function api(method, ruta, body) {
  if (!BASE || !KEY) die('faltan N8N_BASE_URL o N8N_API_KEY en el .env de la raíz.');
  const r = await fetch(`${BASE}/api/v1${ruta}`, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* n8n devuelve texto en algunos errores */ }
  if (!r.ok) die(`${method} ${ruta} → ${r.status}: ${txt.slice(0, 400)}`);
  return json;
}

const idDe = (alias) => idDeOpcional(alias)
  || die(`falta N8N_WF_${alias.toUpperCase()} en el .env (el id del workflow en n8n).`);

// La versión que NO mata el proceso, para los barridos. Un alias descubierto puede tener su
// `workflow.json` en el repo y todavía no estar importado en n8n: eso no es un error del barrido, es
// el estado normal el día que alguien empieza a construir un pipeline. Se saltea con aviso —
// silenciarlo sería el "verde sin haber mirado" que este descubrimiento existe para evitar.
const idDeOpcional = (alias) => process.env[`N8N_WF_${alias.toUpperCase()}`];

const repoDe = (alias) => {
  const f = ALIAS[alias] || die(`alias desconocido: "${alias}". Conocidos: ${Object.keys(ALIAS).join(', ')}`);
  return JSON.parse(fs.readFileSync(path.join(RAIZ, 'Workflows', f, 'workflow.json'), 'utf8'));
};

// ── el cuerpo del PUT: el GET devuelve 20 campos y el PUT acepta 9 (additionalProperties:false).
// Los campos permitidos se leen del OpenAPI DE LA INSTANCIA, no de una copia: si n8n cambia el
// schema, esto se entera solo en vez de romper con un 400 opaco.
let _schema = null;
async function permitidos() {
  if (_schema) return _schema;
  const r = await fetch(`${BASE}/api/v1/openapi.yml`, { headers: { 'X-N8N-API-KEY': KEY } });
  const spec = YAML.parse(await r.text());
  const props = (n) => {
    const s = spec.components?.schemas?.[n]?.properties || {};
    return new Set(Object.entries(s).filter(([, v]) => !v.readOnly).map(([k]) => k));
  };
  _schema = { wf: props('workflow'), settings: props('workflowSettings'), node: props('node') };
  return _schema;
}

// ── credenciales: el mapa nombre→id se APRENDE de la instancia ───────────────────────────
//
// Los `workflow.json` referencian credenciales por NOMBRE y sin id (medido: 4 nombres distintos en
// los 6 workflows, los 4 existentes en la instancia). ADR-053 daba eso como razón para no empujar
// nodos nuevos; su §Enmienda lo cierra: `GET /credentials` responde 200 con `{id, name, type}`, así
// que se aprende igual que los placeholders y por la misma razón — una tabla en el `.env` sería una
// segunda verdad, y el día que alguien renombre una credencial la pisaría hacia atrás.
let _creds = null;
async function credencialesDeLaInstancia() {
  if (_creds) return _creds;
  const r = await api('GET', '/credentials?limit=250');
  const porNombre = new Map();
  for (const cr of r.data || []) {
    // Nombre repetido = el mapa es ambiguo y elegir sería adivinar. Se marca y se niega al usarlo.
    if (porNombre.has(cr.name)) porNombre.set(cr.name, null);
    else porNombre.set(cr.name, cr.id);
  }
  _creds = porNombre;
  return _creds;
}

/**
 * Resuelve los `credentials` de un nodo NUEVO contra la instancia.
 *
 * FAIL-CLOSED igual que los placeholders: un nodo empujado con la credencial desbindeada corre y
 * falla a mitad de corrida, que es el modo de falla silencioso que este script existe para matar.
 * Y es la causa raíz medida de los DOS re-imports fallidos del 03/08, los dos por elegir mal en un
 * desplegable.
 */
async function resolverCredenciales(nodo, sinResolver) {
  if (!nodo.credentials) return undefined;
  const mapa = await credencialesDeLaInstancia();
  const out = {};
  for (const [tipo, ref] of Object.entries(nodo.credentials)) {
    const nombre = ref?.name;
    const id = nombre ? mapa.get(nombre) : undefined;
    if (!id) { sinResolver.push(`"${nodo.name}" · ${tipo} → ${nombre ?? '(sin nombre)'}${mapa.get(nombre) === null ? ' (nombre repetido en la instancia)' : ''}`); continue; }
    out[tipo] = { id, name: nombre };
  }
  return out;
}

// ── alcanzabilidad ──────────────────────────────────────────────────────────────────────
//
// 🔑 **La definición NO se inventa acá**: es la de `Workflows/auditar-workflows.mjs` §2, que audita
// este mismo invariante sobre el repo. Acá se aplica al grafo que va a QUEDAR en la instancia.
const esTrigger = (n) =>
  /Trigger$/.test(n.type) || n.type === 'n8n-nodes-base.webhook' || n.type === 'n8n-nodes-base.formTrigger';

/** Nombres alcanzables desde algún trigger, siguiendo `connections` hacia adelante. */
function alcanzablesDesdeTriggers(nodes, connections) {
  const vivos = new Set(nodes.filter(esTrigger).map((n) => n.name));
  const cola = [...vivos];
  while (cola.length) {
    const actual = cola.pop();
    for (const salidas of Object.values(connections?.[actual] || {})) {
      for (const rama of salidas || []) {
        for (const x of rama || []) {
          if (x?.node && !vivos.has(x.node)) { vivos.add(x.node); cola.push(x.node); }
        }
      }
    }
  }
  return vivos;
}

async function cuerpoPut(live, nodes, conexiones = null) {
  const ok = await permitidos();
  const filtrar = (obj, permitidas) =>
    Object.fromEntries(Object.entries(obj || {}).filter(([k]) => permitidas.has(k)));
  const body = {
    name: live.name,
    nodes: nodes.map((n) => filtrar(n, ok.node)),
    // Por defecto las del LIVE: un push de `parameters` no tiene por qué tocar la forma del grafo.
    // Cuando el push lleva topología llegan las del repo (ADR-053 §Enmienda 1) — enteras, porque una
    // conexión es un PAR y "solo las aristas del nodo nombrado" dejaría el grafo a medio cablear.
    connections: conexiones ?? live.connections,
    // settings MERGEA: mandamos solo lo que el schema admite y lo demás (binaryMode,
    // timeSavedMode) sobrevive intacto en la instancia. Verificado, no asumido.
    settings: filtrar(live.settings, ok.settings),
  };
  if (live.staticData) body.staticData = live.staticData;   // el dispatcher guarda acá sus crons
  if (live.pinData && Object.keys(live.pinData).length) body.pinData = live.pinData;
  return body;
}

// ── placeholders: se APRENDEN alineando cada string del repo con su gemelo en live ───────────
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Ojo: PLACEHOLDER es /g y .test() sería stateful. Este es el chequeo sin estado.
const tienePlaceholder = (s) => /<<[A-Z][A-Z0-9_]{2,}>>|<[A-Z][A-Z0-9_]{2,}>/.test(s);

function aprenderDeStrings(repoStr, liveStr, mapa, conflictos) {
  const hits = repoStr.match(PLACEHOLDER);
  if (!hits || typeof liveStr !== 'string') return;
  // El string del repo se vuelve un regex: todo escapado, cada placeholder un grupo de captura.
  const patron = repoStr.split(PLACEHOLDER).map(esc).join('([\\s\\S]*?)');
  const m = liveStr.match(new RegExp(`^${patron}$`));
  if (!m) return;                                   // el nodo cambió demasiado: no alinea, no pasa nada
  hits.forEach((ph, i) => {
    const valor = m[i + 1];
    if (valor === undefined) return;
    // Un placeholder NUNCA es el valor de otro. Si live todavía tiene el `<<X>>` literal (un
    // re-import que quedó a medias, como el del error workflow), alinear contra sí mismo
    // "aprendería" <<X>> → <<X>>, chocaría con el valor real que enseñan los otros workflows y
    // los dos se descartarían por conflicto: un nodo mal configurado en live rompería el mapa
    // de todos. Se ignora la captura y el diff lo reporta como drift, que es lo que es.
    if (tienePlaceholder(valor)) return;
    if (mapa.has(ph) && mapa.get(ph) !== valor) conflictos.add(ph);
    else mapa.set(ph, valor);
  });
}

// Recorre dos objetos en paralelo y aprende de cada par de strings en la misma ruta.
function alinear(a, b, mapa, conflictos) {
  if (typeof a === 'string') return aprenderDeStrings(a, b, mapa, conflictos);
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return;
  for (const k of Object.keys(a)) alinear(a[k], b[k], mapa, conflictos);
}

// El mapa se aprende de TODOS los workflows a la vez: un placeholder que aparece en 6 nodos
// se aprende si UNO solo alinea, aunque el nodo que estás cambiando ya no alinee.
async function aprenderMapa() {
  const mapa = new Map(), conflictos = new Set();
  for (const alias of Object.keys(ALIAS)) {
    const id = idDeOpcional(alias);
    if (!id) continue;                                // no importado todavía: cmdDiff ya lo avisa
    let repo, live;
    try { repo = repoDe(alias); live = await api('GET', `/workflows/${id}`); } catch { continue; }
    for (const rn of repo.nodes || []) {
      const ln = (live.nodes || []).find((x) => x.name === rn.name);
      if (ln) alinear(rn.parameters, ln.parameters, mapa, conflictos);
    }
  }
  for (const k of conflictos) mapa.delete(k);       // valores distintos en dos lados: no adivinamos
  return { mapa, conflictos };
}

function sustituir(valor, mapa, pendientes) {
  if (typeof valor === 'string') {
    return valor.replace(PLACEHOLDER, (ph) => {
      if (mapa.has(ph)) return mapa.get(ph);
      pendientes.add(ph);
      return ph;
    });
  }
  if (Array.isArray(valor)) return valor.map((v) => sustituir(v, mapa, pendientes));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sustituir(v, mapa, pendientes)]));
  }
  return valor;
}

/**
 * Segunda fuente para los placeholders: el `.env` de la raíz.
 *
 * 🩸 **Por qué hizo falta** (ADR-077, 2026-08-26). Los placeholders se aprenden alineando el string
 * del repo con su gemelo del live, y para un `jsCode` ese string es **el nodo entero**. O sea que
 * editar el código rompe la alineación de ese nodo — y si el placeholder no aparece en ningún otro
 * (`<SUPADATA_API_KEY>`: **1 sola vez en todo el repo**), no queda de dónde aprenderlo. El nodo se
 * vuelve **imposible de empujar justo cuando lo querés cambiar**, que es el único momento en que
 * importa. Lo destapó el arreglo del idioma del nodo `Transcribir`.
 *
 * 🔒 **Sigue siendo fail-closed y el live sigue mandando.** Esto sólo mira los que quedaron
 * pendientes *después* de aprender; nunca pisa un valor del live. Si no está en ninguno de los dos,
 * el push muere igual.
 *
 * 🔑 **Y avisa cuáles, nunca el valor.** Un push que resuelve un secreto desde otra fuente tiene que
 * decirlo: si el `.env` estuviera desactualizado, esta línea es la que lo delata.
 */
function completarConEnv(mapa, pendientes) {
  const puestos = [];
  for (const ph of pendientes) {
    const valor = process.env[ph.replace(/^<+|>+$/g, '')];
    if (!valor) continue;
    mapa.set(ph, valor);
    puestos.push(ph);
  }
  return puestos;
}

// ── diff ─────────────────────────────────────────────────────────────────────────────────
// El problema del diff crudo es el ruido: n8n reescribe el JSON al guardar, así que un
// `JSON.stringify` distinto NO significa que live esté corriendo otro código. Cada campo se
// clasifica, y solo `drift` es accionable:
//
//   normalizacion — repo ⊆ live: n8n AGREGÓ campos suyos (`options.version`,
//                   `attemptToConvertTypes`). Mismo comportamiento.
//   default       — live ⊆ repo: n8n BORRÓ campos que ya eran el default (`method: GET`,
//                   `responseMode: onReceived`, `mode: append`). Mismo comportamiento.
//                   ⚠️ Acá cae también un campo que agregaste al repo y NO empujaste: por eso
//                   se listan los nombres en vez de esconderlos detrás de un contador.
//   binding       — repo tiene un slug y live un resourceLocator `__rl` con el id interno
//                   (los 3 nodos de Apify). Es identidad de la instancia: no se empuja nunca.
//   drift         — los dos lados tienen valor y son distintos. Esto sí es live corriendo
//                   otra cosa que el repo.
const subconjunto = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => subconjunto(v, b[i]));
  return Object.keys(a).every((k) => k in b && subconjunto(a[k], b[k]));
};

function clasificar(enRepo, enLive) {
  if (enLive && typeof enLive === 'object' && enLive.__rl === true) return 'binding';
  if (enLive === undefined) return 'default';          // live no guarda un campo que el repo sí tiene
  if (enRepo === undefined) return 'normalizacion';    // live guarda un campo que el repo no declara
  if (subconjunto(enRepo, enLive)) return 'normalizacion';
  if (subconjunto(enLive, enRepo)) return 'default';
  return 'drift';
}

function comparar(repo, live, mapa) {
  const hall = [];
  const L = new Map((live.nodes || []).map((n) => [n.name, n]));
  const R = new Map((repo.nodes || []).map((n) => [n.name, n]));

  for (const n of R.keys()) if (!L.has(n)) hall.push({ sev: 'topologia', txt: `nodo "${n}" está en el repo y no en live` });
  for (const n of L.keys()) if (!R.has(n)) hall.push({ sev: 'topologia', txt: `nodo "${n}" está en live y no en el repo` });

  for (const [nombre, r] of R) {
    const l = L.get(nombre);
    if (!l) continue;
    const pend = new Set();
    const esperado = sustituir(r.parameters ?? {}, mapa, pend);
    if (JSON.stringify(esperado) !== JSON.stringify(l.parameters ?? {})) {
      const keys = new Set([...Object.keys(esperado), ...Object.keys(l.parameters || {})]);
      const dif = [...keys].filter((k) => JSON.stringify(esperado[k]) !== JSON.stringify(l.parameters?.[k]));
      for (const k of dif) {
        const sev = clasificar(esperado[k], l.parameters?.[k]);
        hall.push({ sev, nodo: nombre, campo: k, txt: `"${nombre}" · ${k}` });
      }
    }
    if (pend.size) hall.push({ sev: 'placeholder', txt: `"${nombre}": placeholders sin aprender → ${[...pend].join(' ')}` });
    for (const campo of ['typeVersion', 'onError', 'retryOnFail', 'executeOnce', 'alwaysOutputData', 'disabled']) {
      const a = r[campo] ?? null, b = l[campo] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) hall.push({ sev: 'drift', nodo: nombre, campo, txt: `"${nombre}" · ${campo}: repo=${a} live=${b}` });
    }
  }

  for (const k of new Set([...Object.keys(repo.connections || {}), ...Object.keys(live.connections || {})])) {
    if (JSON.stringify(repo.connections?.[k]) !== JSON.stringify(live.connections?.[k]))
      hall.push({ sev: 'topologia', txt: `conexiones desde "${k}" difieren` });
  }

  // Orden de ramas: en n8n v1 las hermanas se ejecutan por posición en el canvas, no por el
  // array de conexiones. Es la clase de bug que dejó el dedup de ADR-029 sin efecto 3 corridas.
  const pos = (wf) => Object.fromEntries(wf.nodes.map((n) => [n.name, n.position]));
  const orden = (wf, ns) => {
    const P = pos(wf);
    return [...ns].filter((n) => P[n]).sort((a, b) => (P[a][1] - P[b][1]) || (P[a][0] - P[b][0])).join(' > ');
  };
  for (const [src, salidas] of Object.entries(repo.connections || {})) {
    (salidas.main || []).forEach((rama, i) => {
      if (!rama || rama.length < 2) return;
      const ns = rama.map((x) => x.node);
      const a = orden(repo, ns), b = orden(live, ns);
      if (a && b && a !== b) hall.push({ sev: 'orden', txt: `orden de ramas de "${src}" salida[${i}] — repo: ${a} · live: ${b}` });
    });
  }
  return hall;
}

// ── comandos ─────────────────────────────────────────────────────────────────────────────
const ACCIONABLE = new Set(['drift', 'topologia', 'orden', 'placeholder']);

async function cmdDiff(alias, opts) {
  const { mapa, conflictos } = await aprenderMapa();
  console.log(`${c.gris}${mapa.size} placeholder(s) aprendidos del live${c.off}`);
  if (conflictos.size) console.log(`${c.amar}⚠ con valores distintos entre workflows (no se usan): ${[...conflictos].join(' ')}${c.off}`);

  let accionables = 0;
  // Con alias explícito se revisa ese y `idDe` muere si no está en el .env (lo pediste por nombre).
  // En el barrido, en cambio, un alias descubierto sin id todavía no existe en n8n: se saltea CON
  // AVISO, porque un barrido que dice "✓ todo bien" habiendo mirado 5 de 6 es peor que uno que grita.
  const todos = alias ? [alias] : Object.keys(ALIAS);
  const revisados = alias ? todos : todos.filter((a) => idDeOpcional(a));
  const salteados = todos.filter((a) => !revisados.includes(a));
  if (salteados.length) {
    console.log(`${c.amar}⚠ sin revisar (hay workflow.json en el repo pero falta N8N_WF_<ALIAS> en el .env, o sea que no está importado): ${salteados.join(' ')}${c.off}`);
  }
  for (const a of revisados) {
    const repo = repoDe(a), live = await api('GET', `/workflows/${idDe(a)}`);
    const hall = comparar(repo, live, mapa);
    const grupo = (s) => hall.filter((h) => h.sev === s);
    const rojo = hall.filter((h) => ACCIONABLE.has(h.sev));
    accionables += rojo.length;

    console.log(`\n${c.neg}▸ ${a}${c.off} ${c.gris}(${live.name} · ${live.active ? 'activo' : 'inactivo'} · ${repo.nodes.length} nodos)${c.off}`);
    if (!rojo.length) console.log(`  ${c.verde}✓ live corre lo que dice el repo${c.off}`);
    for (const h of rojo) console.log(`  ${c.rojo}[${h.sev}]${c.off} ${h.txt}`);

    for (const [sev, etiqueta] of [['default', 'campos del repo que live no guarda (defaults de n8n, o cambios sin empujar)'],
                                   ['normalizacion', 'campos que n8n agregó al guardar'],
                                   ['binding', 'identidad de la instancia (resourceLocator) — nunca se empuja']]) {
      const g = grupo(sev);
      if (!g.length) continue;
      console.log(`  ${c.gris}· ${g.length} ${etiqueta}${c.off}`);
      if (opts?.todo) g.forEach((h) => console.log(`      ${c.gris}${h.txt}${c.off}`));
    }
  }
  if (!opts?.todo) console.log(`${c.gris}\n(--todo para ver los campos clasificados como benignos)${c.off}`);
  console.log(accionables
    ? `${c.amar}${accionables} diferencia(s) accionable(s).${c.off} Las de [drift] se aplican con ` +
      `push <alias> --nodos "…"; las de [orden] con orden <alias>. ` +
      // 🩸 Esta línea decía "[topologia] NO va por push: re-import (ADR-053)" y era falsa desde el
      // 30/08: ADR-053 §Enmienda le dio topología al push y el re-import quedó solo para crear un
      // workflow de cero. O sea que la herramienta mandaba al ritual que ella misma había matado.
      // *Un obstáculo escrito se re-mide, igual que un canario* — y el peor lugar donde envejece es
      // en la salida del comando que lo desmiente.
      `${c.gris}[topologia] también va por push (ADR-053 §Enmienda): nombrá los nodos en --nodos, ` +
      `y lo que desaparece o pierde cableado de salida en --borrar.${c.off}`
    : `${c.verde}✓ ${revisados.length === 1 ? revisados[0] : `Los ${revisados.length} workflows`} corre${revisados.length === 1 ? '' : 'n'} lo que dice el repo.${c.off}`);
}

async function cmdPull(alias) {
  const live = await api('GET', `/workflows/${idDe(alias)}`);
  fs.mkdirSync(SNAPS, { recursive: true });
  const f = path.join(SNAPS, `${alias}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(f, JSON.stringify(live, null, 2));
  console.log(`${c.verde}✓${c.off} snapshot → ${path.relative(RAIZ, f)}`);
  return f;
}

async function cmdPush(alias, opts) {
  const repo = repoDe(alias);
  const live = await api('GET', `/workflows/${idDe(alias)}`);
  const { mapa } = await aprenderMapa();

  const hall = comparar(repo, live, mapa);

  // ── topología (ADR-053 §Enmienda) ─────────────────────────────────────────────────────
  // `nodes` REEMPLAZA: el push que crea nodos también puede borrarlos. Por eso acá hay cuatro
  // frenos y ninguno es un prompt — los 5 comandos del repo son dry-run + `--apply`, y eso tiene
  // que seguir sirviendo sin TTY.
  const enRepo = new Map(repo.nodes.map((n) => [n.name, n]));
  const enLive = new Map(live.nodes.map((n) => [n.name, n]));
  const nuevos = repo.nodes.filter((n) => !enLive.has(n.name)).map((n) => n.name);
  const sobran = live.nodes.filter((n) => !enRepo.has(n.name)).map((n) => n.name);

  // Un recableado que NO borra ningún nodo igual puede dejar a alguien sin recibir nada: el nodo
  // corre y termina en verde. Se listan los ORÍGENES cuyo cableado de salida pierde algo.
  const aristas = (conns, src) => new Set(
    Object.values(conns?.[src] || {}).flat(2).filter(Boolean).map((x) => x.node));
  const origenesQuePierden = [...new Set([...Object.keys(live.connections || {})])].filter((src) => {
    const antes = aristas(live.connections, src), desp = aristas(repo.connections, src);
    return [...antes].some((d) => !desp.has(d));
  });

  const hayTopologia = nuevos.length || sobran.length || hall.some((h) => h.sev === 'topologia');

  if (hayTopologia) {
    console.log(`${c.neg}▸ topología${c.off}`);
    nuevos.forEach((n) => console.log(`  ${c.verde}+ nodo "${n}"${c.off}`));
    sobran.forEach((n) => console.log(`  ${c.rojo}- nodo "${n}"${c.off} ${c.gris}(está en live y no en el repo)${c.off}`));
    origenesQuePierden.forEach((n) => console.log(`  ${c.rojo}~ "${n}" pierde cableado de salida${c.off}`));

    // Freno 1 — `--nodos` obligatorio, pero SOLO acá. Cambiar un jsCode sigue costando
    // `n8n:push -- motor` a secas, que es lo que ADR-053 vino a abaratar.
    //
    // 🔑 **Cada bandera nombra su propio acto**: `--nodos` lo que se crea o cambia, `--borrar` lo
    // que desaparece o pierde cableado. Pedir el mismo nombre en las dos sería tipearlo dos veces
    // — y peor: un borrado autorizado en `--borrar` pero olvidado en `--nodos` no pasaría, en
    // silencio, que es justo la clase de falla que estos frenos existen para evitar.
    if (nuevos.length && !opts.nodos) {
      die(`el delta crea nodos: nombralos con --nodos ${JSON.stringify(nuevos.join(','))}.\n` +
          '  `nodes` reemplaza, así que un push sin lista podría tocar lo que no miraste.');
    }

    // Freno 2 — nombrar lo que PIERDE algo es el consentimiento. Una bandera booleana no sirve: se
    // copia de un comando anterior sin releerla, y ahí autoriza el borrado de hoy con la decisión
    // de ayer.
    const pierden = [...new Set([...sobran, ...origenesQuePierden])];
    const autorizados = opts.borrar ? opts.borrar.split(',').map((x) => x.trim()).filter(Boolean) : [];
    const sinAutorizar = pierden.filter((n) => !autorizados.includes(n));
    const deMas = autorizados.filter((n) => !pierden.includes(n));
    if (sinAutorizar.length) {
      die(`esto pierde cableado o desaparece y no está autorizado: ${sinAutorizar.map((n) => `"${n}"`).join(', ')}\n` +
          `  Repetí con --borrar ${JSON.stringify(pierden.join(','))} si es lo que querés.`);
    }
    if (deMas.length) die(`--borrar nombra cosas que no pierden nada: ${deMas.join(', ')}`);
  } else if (hall.some((h) => h.sev === 'topologia')) {
    die('hay diferencias de conexiones que no se pudieron clasificar. Corré `diff` y mirá.');
  }

  const candidatos = [...new Set(hall.filter((h) => h.nodo).map((h) => h.nodo))];
  const objetivo = opts.nodos ? opts.nodos.split(',').map((s) => s.trim()) : candidatos;

  // Los borrados NO pasan por `--nodos`: ya se autorizaron por nombre en `--borrar`, y por
  // definición no están en el repo, así que no hay nada que empujarles.
  const aBorrar = new Set(sobran);
  if (!objetivo.length && !aBorrar.size && !hayTopologia) {
    console.log(`${c.verde}✓ nada que empujar: ${alias} ya está en sync.${c.off}`); return;
  }

  const desconocidos = objetivo.filter((n) => !enRepo.has(n));
  if (desconocidos.length) die(`estos nodos no existen en el repo: ${desconocidos.join(', ')}`);

  // El array de nodos va COMPLETO (nodes reemplaza, verificado). Del repo se toman los
  // parameters y los campos de comportamiento; jamás id, credentials, webhookId ni position:
  // eso es identidad y layout de la instancia.
  const pendientes = new Set();
  const sinCredencial = [];
  const armarNodos = async () => {
    sinCredencial.length = 0;
    const patchados = live.nodes
      // Un nodo nombrado que no está en el repo se está BORRANDO: se cae del array, y como `nodes`
      // reemplaza, eso lo borra en la instancia.
      .filter((ln) => !aBorrar.has(ln.name))
      .map((ln) => {
        if (!objetivo.includes(ln.name)) return ln;
        const rn = enRepo.get(ln.name);
        const nuevo = { ...ln, parameters: sustituir(rn.parameters ?? {}, mapa, pendientes) };
        for (const campo of ['typeVersion', 'onError', 'retryOnFail', 'executeOnce', 'alwaysOutputData', 'disabled']) {
          if (rn[campo] !== undefined) nuevo[campo] = rn[campo];
        }
        return nuevo;
      });

    // 🔑 **Un nodo NUEVO viene entero del repo** (ADR-053 §Enmienda 2): no hay gemelo en live del
    // que proteger identidad ni layout, así que el repo es la única fuente que tiene. `position`
    // VIAJA, y eso es lo contraintuitivo: en n8n v1 la posición en el canvas ES el orden de
    // ejecución de las ramas hermanas, así que dejar que n8n lo ubique sería dejar que n8n elija la
    // semántica. Dos excepciones: `credentials` se resuelve contra la instancia, y `webhookId` se
    // omite para que n8n lo emita — el del repo salió de otra instancia y podría chocar.
    for (const nombre of objetivo.filter((n) => nuevos.includes(n))) {
      const rn = enRepo.get(nombre);
      const { webhookId, credentials, ...resto } = rn;
      const nodo = { ...resto, parameters: sustituir(rn.parameters ?? {}, mapa, pendientes) };
      if (credentials) {
        const res = await resolverCredenciales(rn, sinCredencial);
        if (res && Object.keys(res).length) nodo.credentials = res;
      }
      patchados.push(nodo);
    }
    return patchados;
  };
  let nodos = await armarNodos();

  // El live no enseñó todo: probá el `.env` (ADR-077). Segunda pasada, no parche sobre la primera.
  if (pendientes.size) {
    const delEnv = completarConEnv(mapa, pendientes);
    if (delEnv.length) {
      console.log(`${c.amar}⚠ ${delEnv.length} placeholder(s) resueltos desde el .env y NO del live: ${delEnv.join(' ')}${c.off}`);
      pendientes.clear();
      nodos = await armarNodos();
    }
  }

  // FAIL-CLOSED: un <ANTHROPIC_API_KEY> literal empujado a producción es el modo de falla
  // silencioso que este script existe para matar.
  if (pendientes.size) {
    die(`placeholders sin resolver: ${[...pendientes].join(' ')}\n` +
        `  No se aprendieron del live. Poné el valor a mano en n8n una vez y volvé a correr, ` +
        `o revisá que el nodo gemelo exista en live.`);
  }

  // Freno 3 — FAIL-CLOSED en credenciales, misma regla que los placeholders y por la misma razón:
  // un nodo con la credencial desbindeada corre y falla a mitad de corrida. Es la causa raíz medida
  // de los DOS re-imports fallidos del 03/08, los dos por elegir mal en un desplegable.
  if (sinCredencial.length) {
    die(`credenciales que no resuelven contra la instancia:\n    ${sinCredencial.join('\n    ')}\n` +
        `  Creála en n8n con ese nombre exacto, o corregí el nombre en el workflow.json.`);
  }

  // Freno 4 — un push NO puede dejar nodos huérfanos. Si `--nodos` es parcial, el grafo resultante
  // puede tener un nodo que el repo ya no cablea y que nadie nombró: queda vivo, inalcanzable y
  // mudo. La definición de trigger/alcanzable es la de `Workflows/auditar-workflows.mjs` §2.
  const conexionesFinales = hayTopologia ? repo.connections : live.connections;
  if (hayTopologia) {
    const vivos = alcanzablesDesdeTriggers(nodos, conexionesFinales);
    const huerfanos = nodos.filter((n) => !vivos.has(n.name)).map((n) => n.name);
    if (huerfanos.length) {
      die(`el grafo resultante deja nodos inalcanzables desde todo trigger: ${huerfanos.map((n) => `"${n}"`).join(', ')}\n` +
          `  O se cablean en el workflow.json, o se sacan (y entonces van en --borrar).`);
    }
  }

  console.log(`${c.neg}▸ push ${alias}${c.off} ${c.gris}(${live.name})${c.off}`);
  for (const n of aBorrar) console.log(`  ${c.rojo}- "${n}"${c.off} ${c.gris}(se borra)${c.off}`);
  for (const n of objetivo) {
    const antes = live.nodes.find((x) => x.name === n)?.parameters ?? {};
    const desp = nodos.find((x) => x.name === n).parameters;
    if (nuevos.includes(n)) console.log(`  ${c.verde}+ "${n}"${c.off} ${c.gris}${nodos.find((x) => x.name === n).type}${c.off}`);
    const keys = [...new Set([...Object.keys(antes), ...Object.keys(desp)])]
      .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(desp[k]));
    console.log(`  ${keys.length ? c.amar + '~' : c.gris + '='} "${n}"${c.off} ${keys.length ? `campos: ${keys.join(', ')}` : '(sin cambios)'}`);
    for (const k of keys) {
      const a = JSON.stringify(antes[k]), b = JSON.stringify(desp[k]);
      if (a?.length > 220 || b?.length > 220) console.log(`      ${c.gris}${k}: ${a?.length ?? 0}b → ${b.length}b${c.off}`);
      else console.log(`      ${c.gris}${k}: ${a} → ${b}${c.off}`);
    }
  }

  if (!opts.apply) {
    console.log(`\n${c.amar}dry-run.${c.off} Repetí con ${c.neg}--apply${c.off} para escribirlo en n8n.`);
    return;
  }

  const snap = await cmdPull(alias);                       // rollback ANTES de tocar nada
  const body = await cuerpoPut(live, nodos, hayTopologia ? repo.connections : null);
  await api('PUT', `/workflows/${idDe(alias)}`, body);

  // Verificar contra la instancia, no confiar en el 200.
  const despues = await api('GET', `/workflows/${idDe(alias)}`);
  const malos = [
    // Un nodo que se borró tiene que NO estar. Verificarlo por su ausencia y no por el 200 es la
    // misma regla que rige las migraciones del repo: se mide el efecto, no el haber corrido.
    ...[...aBorrar].filter((n) => despues.nodes.some((x) => x.name === n)),
    ...objetivo.filter((n) => {
      const esperado = nodos.find((x) => x.name === n).parameters;
      return JSON.stringify(despues.nodes.find((x) => x.name === n)?.parameters) !== JSON.stringify(esperado);
    }),
  ];
  if (malos.length) die(`el PUT devolvió 200 pero estos nodos no quedaron como se esperaba: ${malos.join(', ')}\n  Rollback: restore ${alias} ${path.relative(RAIZ, snap)} --apply`);

  if (hayTopologia && JSON.stringify(despues.connections) !== JSON.stringify(repo.connections)) {
    die(`el PUT devolvió 200 pero las conexiones no quedaron como el repo.\n` +
        `  Rollback: restore ${alias} ${path.relative(RAIZ, snap)} --apply`);
  }

  console.log(`\n${c.verde}✓ aplicado${c.off} · ${objetivo.length} nodo(s)${aBorrar.size ? ` · ${aBorrar.size} borrado(s)` : ''}${hayTopologia ? ' · conexiones del repo' : ''} · workflow ${despues.active ? 'sigue activo' : 'inactivo'}`);
  console.log(`  ${c.gris}rollback: node n8n-sync.mjs restore ${alias} ${path.relative(RAIZ, snap)} --apply${c.off}`);
}

// ── orden ────────────────────────────────────────────────────────────────────────────────
// En n8n v1 las ramas hermanas se ejecutan por posición en el canvas: primero la de arriba
// (Y menor), desempatando por X. Medido contra la instancia, no asumido. O sea que el ORDEN DE
// EJECUCIÓN es un dato de layout, y arrastrar un nodo puede cambiar la semántica sin tocar una
// línea de código — es la clase de bug que dejó el dedup de ADR-029 sin efecto 3 corridas.
//
// Este comando reacomoda el live para que el orden coincida con el que declara el repo, y lo
// hace PERMUTANDO las posiciones que los hermanos ya ocupan: el dibujo no se mueve, se
// intercambian de lugar. Cada hermano se lleva su cadena exclusiva (los nodos que cuelgan solo
// de él) para que no queden líneas cruzadas.
function padresDe(wf) {
  const m = new Map();
  for (const [src, o] of Object.entries(wf.connections || {}))
    for (const rama of o.main || []) for (const con of rama || []) {
      if (!m.has(con.node)) m.set(con.node, new Set());
      m.get(con.node).add(src);
    }
  return m;
}

// Nodos que cuelgan SOLO de `raiz`: si un nodo tiene un padre fuera del subárbol, no es
// exclusivo y no se mueve (moverlo desordenaría la rama de ese otro padre).
function cadenaExclusiva(wf, raiz) {
  const padres = padresDe(wf);
  const hijos = (n) => ((wf.connections?.[n]?.main) || []).flat().filter(Boolean).map((x) => x.node);
  const dentro = new Set([raiz]);
  let creció = true;
  while (creció) {                                   // punto fijo: un nodo puede volverse elegible
    creció = false;                                  // recién cuando entra el último de sus padres
    for (const n of [...dentro]) for (const h of hijos(n)) {
      if (dentro.has(h)) continue;
      if ([...(padres.get(h) || [])].every((p) => dentro.has(p))) { dentro.add(h); creció = true; }
    }
  }
  dentro.delete(raiz);
  return dentro;
}

function planDeOrden(repo, live) {
  const pos = (wf) => Object.fromEntries(wf.nodes.map((n) => [n.name, n.position]));
  const P = pos(live), R = pos(repo);
  const porCanvas = (mapa) => (a, b) => (mapa[a][1] - mapa[b][1]) || (mapa[a][0] - mapa[b][0]);
  const movimientos = new Map();

  for (const [src, o] of Object.entries(repo.connections || {})) {
    (o.main || []).forEach((rama, i) => {
      if (!rama || rama.length < 2) return;
      const hermanos = rama.map((x) => x.node).filter((n) => P[n] && R[n]);
      if (hermanos.length < 2) return;
      const enLive = [...hermanos].sort(porCanvas(P));
      const enRepo = [...hermanos].sort(porCanvas(R));
      if (enLive.join() === enRepo.join()) return;

      // Los huecos que ya ocupan, en orden de canvas, se reparten según el orden del repo.
      const huecos = enLive.map((n) => P[n]);
      enRepo.forEach((nodo, k) => {
        const destino = huecos[k];
        const delta = [destino[0] - P[nodo][0], destino[1] - P[nodo][1]];
        if (!delta[0] && !delta[1]) return;
        movimientos.set(nodo, destino);
        for (const d of cadenaExclusiva(live, nodo))
          movimientos.set(d, [P[d][0] + delta[0], P[d][1] + delta[1]]);
      });
      console.log(`  ${c.amar}~${c.off} "${src}" salida[${i}]\n      live: ${enLive.join(' > ')}\n      repo: ${enRepo.join(' > ')}`);
    });
  }
  return movimientos;
}

async function cmdOrden(alias, opts) {
  const repo = repoDe(alias);
  const live = await api('GET', `/workflows/${idDe(alias)}`);
  console.log(`${c.neg}▸ orden ${alias}${c.off} ${c.gris}(${live.name})${c.off}`);

  const movimientos = planDeOrden(repo, live);
  if (!movimientos.size) { console.log(`  ${c.verde}✓ el orden de ramas ya coincide con el repo${c.off}`); return; }

  const nodos = live.nodes.map((n) => (movimientos.has(n.name) ? { ...n, position: movimientos.get(n.name) } : n));
  for (const [n, p] of movimientos) console.log(`      ${c.gris}${n}: ${JSON.stringify(live.nodes.find((x) => x.name === n).position)} → ${JSON.stringify(p)}${c.off}`);

  // Red de seguridad: ninguna OTRA ramificación puede cambiar de orden como efecto colateral.
  const ordenDe = (wf) => {
    const P = Object.fromEntries(wf.nodes.map((n) => [n.name, n.position]));
    const r = [];
    for (const [src, o] of Object.entries(wf.connections || {}))
      (o.main || []).forEach((rama, i) => {
        if (rama && rama.length > 1) r.push(`${src}[${i}]: ` +
          rama.map((x) => x.node).sort((a, b) => (P[a][1] - P[b][1]) || (P[a][0] - P[b][0])).join(' > '));
      });
    return r;
  };
  const antes = ordenDe(live), despues = ordenDe({ ...live, nodes: nodos });
  const esperados = new Set();
  for (const [src, o] of Object.entries(repo.connections || {}))
    (o.main || []).forEach((rama, i) => { if (rama && rama.length > 1) esperados.add(`${src}[${i}]`); });
  const colaterales = antes.filter((a, i) => a !== despues[i] && !esperados.has(a.split(':')[0]));
  if (colaterales.length) die(`el movimiento cambiaría ramificaciones que no debía:\n  ${colaterales.join('\n  ')}`);
  console.log(`  ${c.gris}(${antes.length} ramificaciones revisadas, ninguna colateral)${c.off}`);

  if (!opts.apply) { console.log(`\n${c.amar}dry-run.${c.off} Repetí con ${c.neg}--apply${c.off} para escribirlo en n8n.`); return; }

  const snap = await cmdPull(alias);
  await api('PUT', `/workflows/${idDe(alias)}`, await cuerpoPut(live, nodos));

  const verif = await api('GET', `/workflows/${idDe(alias)}`);
  const P = Object.fromEntries(verif.nodes.map((n) => [n.name, n.position]));
  const malos = [...movimientos].filter(([n, p]) => JSON.stringify(P[n]) !== JSON.stringify(p)).map(([n]) => n);
  if (malos.length) die(`el PUT devolvió 200 pero estos nodos no se movieron: ${malos.join(', ')}\n  Rollback: restore ${alias} ${path.relative(RAIZ, snap)} --apply`);

  console.log(`\n${c.verde}✓ aplicado${c.off} · ${movimientos.size} nodo(s) movidos · workflow ${verif.active ? 'sigue activo' : 'inactivo'}`);
  ordenDe(verif).forEach((l) => console.log(`   ${c.gris}${l}${c.off}`));
  console.log(`  ${c.gris}rollback: npm run n8n:restore -- ${alias} ${path.relative(RAIZ, snap)} --apply${c.off}`);
}

async function cmdRestore(alias, archivo, opts) {
  const snap = JSON.parse(fs.readFileSync(path.resolve(RAIZ, archivo), 'utf8'));
  const live = await api('GET', `/workflows/${idDe(alias)}`);
  console.log(`${c.neg}▸ restore ${alias}${c.off} desde ${archivo}`);
  console.log(`  nodos: live=${live.nodes.length} → snapshot=${snap.nodes.length}`);
  if (!opts.apply) { console.log(`\n${c.amar}dry-run.${c.off} Repetí con ${c.neg}--apply${c.off}.`); return; }
  await api('PUT', `/workflows/${idDe(alias)}`, await cuerpoPut(snap, snap.nodes));
  const d = await api('GET', `/workflows/${idDe(alias)}`);
  console.log(`${c.verde}✓ restaurado${c.off} · ${d.nodes.length} nodos · ${d.active ? 'activo' : 'inactivo'}`);
}

// ── cli ──────────────────────────────────────────────────────────────────────────────────
const [, , cmd, ...resto] = process.argv;
const opts = {
  apply: resto.includes("--apply"),
  todo: resto.includes("--todo"),
  nodos: (() => { const i = resto.indexOf('--nodos'); return i >= 0 ? resto[i + 1] : null; })(),
  borrar: (() => { const i = resto.indexOf('--borrar'); return i >= 0 ? resto[i + 1] : null; })(),
};
const libres = resto.filter((a, i) => !a.startsWith('--') && resto[i - 1] !== '--nodos' && resto[i - 1] !== '--borrar');

const uso = `n8n-sync — repo↔live por la API de n8n (ADR-053)

  diff [alias]                          compara (no escribe)
  pull <alias>                          snapshot del live → .n8n-snapshots/
  push <alias> [--nodos "A,B"] [--apply]  aplica los parameters del repo al live
       ... y topología (nodos y conexiones), ADR-053 §Enmienda:
       --nodos es OBLIGATORIO si el delta crea o borra nodos
       --borrar "A,B"  nombra lo que desaparece o pierde cableado de salida
  orden <alias> [--apply]               reacomoda el canvas para que el orden de ramas = el del repo
  restore <alias> <snapshot> --apply    vuelve atrás

  alias: ${Object.keys(ALIAS).join(' · ')}`;

try {
  if (cmd === 'diff') await cmdDiff(libres[0], opts);
  else if (cmd === 'pull') await cmdPull(libres[0] || die('falta el alias'));
  else if (cmd === 'push') await cmdPush(libres[0] || die('falta el alias'), opts);
  else if (cmd === 'orden') await cmdOrden(libres[0] || die('falta el alias'), opts);
  else if (cmd === 'restore') await cmdRestore(libres[0] || die('falta el alias'), libres[1] || die('falta el snapshot'), opts);
  else console.log(uso);
} catch (e) {
  die(e.stack || e.message);
}
