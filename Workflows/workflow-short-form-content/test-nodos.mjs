#!/usr/bin/env node
// test-nodos.mjs — ejercita los code nodes del motor FUERA de n8n, con un `$` mockeado.
//
//   node Workflows/workflow-short-form-content/test-nodos.mjs
//
// Por qué existe: el motor corre en n8n, así que la única forma de probar la lógica sin re-importar y
// gastar una corrida real (Apify/Supadata/Haiku cuestan) es sacar el `jsCode` del nodo del JSON y
// correrlo con `new Function`, inyectándole un `$` falso. Sin esto, un cambio en el corte o en el plan
// se verifica recién en producción, una semana después.
//
// Cubre la semántica que NO se ve leyendo el código de a un nodo: N por proyecto y su fallback
// (ADR-024), el orden dedup→corte, el gate por `Voces.activo` (C.2), el piso por cuenta (ADR-017), y
// las regresiones que ya nos mordieron (`normLang` cierre 34, ⚠️ SIN GUION decisión #6, los `_descarte`
// de ADR-021).
//
// Si tocás `Armar plan de corrida` o `Armar candidato`, corré esto ANTES de re-importar.
// (El chequeo de contrato/manifest es otra cosa y vive en `core/scripts`: `npm run validate`.)

import { readFileSync } from 'node:fs';

const w = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
const jsCode = (n) => {
  const x = w.nodes.find((y) => y.name === n);
  if (!x || !x.parameters.jsCode) throw new Error('sin code node: ' + n);
  return x.parameters.jsCode;
};

let fail = 0;
const check = (nombre, cond, detalle) => {
  console.log((cond ? '✅' : '❌') + ' ' + nombre + (cond ? '' : '\n     → ' + detalle));
  if (!cond) fail++;
};
const seccion = (t) => console.log('\n── ' + t);

// ════════════════════════════════════════════════════════════════════════════
// Armar plan de corrida — C.1 (N por proyecto) + C.2 (gate por Voces.activo)
// ════════════════════════════════════════════════════════════════════════════
const CFG_PLAN = { top_n: 100, dias_recencia: 7, resultados_referente: 20, cap_resultados_referente: 50, cap_top_n: 100, buscar_referente_ig: 1, buscar_referente_tiktok: 1 };

// OJO: 'Leer Voces' viene filtrado por {activo} server-side (C.2), así que el mock recibe SOLO las
// voces activas — igual que en n8n. Una voz apagada = una voz que no está en la lista.
const runPlan = ({ proyectos = [], vocesActivas = [], referentes = [], ajustes = [], cfg = {} } = {}) => {
  const wrap = (recs) => [{ json: { records: recs } }];
  const tablas = { 'Leer Proyectos': proyectos, 'Leer Voces': vocesActivas, 'Leer Referentes': referentes, 'Leer Ajustes': ajustes };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: Object.assign({}, CFG_PLAN, cfg) }) };
    if (tablas[n]) return { all: () => wrap(tablas[n]) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const logs = [];
  const out = new Function('$', 'console', jsCode('Armar plan de corrida'))($, { log: (m) => logs.push(m) });
  return { plan: out[0].json, logs };
};
const P = (id, nombre, vozIds, extra = {}) => ({ id, fields: Object.assign({ nombre, voz_default: vozIds }, extra) });
const V = (id, nombre) => ({ id, fields: { nombre, criterios_relevancia: 'crit de ' + nombre } });

seccion('C.2 — el gate por Voces.activo');
{
  const { plan, logs } = runPlan({
    proyectos: [P('p1', 'Vive', ['v1']), P('p2', 'Muere', ['v2'])],
    vocesActivas: [V('v1', 'Voz ON')], // v2 no vino → apagada
  });
  check('proyecto con voz ENCENDIDA corre', !!plan.projects.p1, JSON.stringify(Object.keys(plan.projects)));
  check('proyecto con voz APAGADA no corre (aunque el proyecto esté activo)', !plan.projects.p2, JSON.stringify(Object.keys(plan.projects)));
  check('lo dice en el log, no lo hace en silencio', logs.some((l) => /salteado \(voz apagada\): Muere/.test(l)), JSON.stringify(logs));
  check('active_project_ids refleja el gate', JSON.stringify(plan.active_project_ids) === '["p1"]', JSON.stringify(plan.active_project_ids));
}
{
  const { plan } = runPlan({ proyectos: [P('p1', 'Sin voz', [])], vocesActivas: [] });
  check('proyecto SIN voz corre (no hay voz que lo apague)', !!plan.projects.p1, JSON.stringify(Object.keys(plan.projects)));
}
{
  const { plan } = runPlan({
    proyectos: [P('p1', 'Vive', ['v1']), P('p2', 'Muere', ['v2'])],
    vocesActivas: [V('v1', 'ON')],
    referentes: [
      { id: 'r1', fields: { handle: '@vive', plataforma: 'instagram', proyecto: ['p1'] } },
      { id: 'r2', fields: { handle: '@muere', plataforma: 'instagram', proyecto: ['p2'] } },
    ],
  });
  check('no se paga Apify por un proyecto salteado', plan.ig_urls.length === 1 && /vive/.test(plan.ig_urls[0]), JSON.stringify(plan.ig_urls));
}

seccion('La anomalía de dato: un proyecto con 2 voces linkeadas (existe en la base viva)');
{
  const { plan, logs } = runPlan({
    proyectos: [P('p1', 'Comunicación para lideres', ['v1', 'v2'])],
    vocesActivas: [V('v1', 'Milena'), V('v2', 'Rosario')],
  });
  check('con 2 voces usa la PRIMERA', plan.projects.p1.voz_nombre === 'Milena', plan.projects.p1.voz_nombre);
  check('y AVISA que ignoró la otra (no se lo traga)', logs.some((l) => /2 voces linkeadas/.test(l)), JSON.stringify(logs));
}
{
  const { plan } = runPlan({ proyectos: [P('p1', 'Ambiguo', ['v1', 'v2'])], vocesActivas: [V('v2', 'Rosario')] });
  check('2 voces con la PRIMERA apagada → se saltea (gate por [0], consistente con criterios/nombre)', !plan.projects.p1, JSON.stringify(Object.keys(plan.projects)));
}

seccion('El referente que cruza voces (4 de 12 en la base viva: @howtoconvince y 3 más)');
{
  const { plan, logs } = runPlan({
    proyectos: [P('p1', 'Storytelling', ['v1']), P('p2', 'Comunicación en empresas', ['v2'])],
    vocesActivas: [V('v1', 'Rosario'), V('v2', 'Milena')],
    referentes: [{ id: 'r1', fields: { handle: '@howtoconvince', plataforma: 'instagram', proyecto: ['p1', 'p2'] } }],
  });
  check('cruza voces: se PERMITE (sigue alimentando los 2 proyectos)', (plan.ig_owner_to_proj['howtoconvince'] || []).length === 2, JSON.stringify(plan.ig_owner_to_proj));
  check('y AVISA, nombrando las voces', logs.some((l) => /referente @howtoconvince alimenta proyectos de 2 voces \(Rosario, Milena\)/.test(l)), JSON.stringify(logs));
  check('el handle se scrapea UNA vez igual (no se paga Apify doble)', plan.ig_urls.length === 1, JSON.stringify(plan.ig_urls));
}
{
  const { logs } = runPlan({
    proyectos: [P('p1', 'Trading Psychology', ['v1']), P('p2', 'Trading fast tips', ['v1'])],
    vocesActivas: [V('v1', 'Juan Pablo')],
    referentes: [{ id: 'r1', fields: { handle: '@nicholascrown', plataforma: 'instagram', proyecto: ['p1', 'p2'] } }],
  });
  check('2 proyectos de la MISMA voz no avisan (es el caso normal: los 5 referentes activos de hoy)', !logs.some((l) => /alimenta proyectos de/.test(l)), JSON.stringify(logs));
}
{
  const { logs } = runPlan({
    proyectos: [P('p1', 'Storytelling', ['v1']), P('p2', 'Comunicación en empresas', ['v2'])],
    vocesActivas: [V('v1', 'Rosario')], // Milena apagada → p2 no corre
    referentes: [{ id: 'r1', fields: { handle: '@howtoconvince', plataforma: 'instagram', proyecto: ['p1', 'p2'] } }],
  });
  check('con una de las 2 voces apagada NO avisa (no hay ambigüedad viva en esta corrida)', !logs.some((l) => /alimenta proyectos de/.test(l)), JSON.stringify(logs));
}

seccion('C.1 — N por proyecto (ADR-024)');
{
  const { plan } = runPlan({
    proyectos: [P('p1', 'ConN', ['v1'], { N: 20 }), P('p2', 'SinN', ['v1'])],
    vocesActivas: [V('v1', 'Voz')],
  });
  check('la N del proyecto manda', plan.projects.p1.n === 20, String(plan.projects.p1.n));
  check('proyecto sin N cae al global', plan.projects.p2.n === 100, String(plan.projects.p2.n));
}
{
  const { plan } = runPlan({ proyectos: [P('p1', 'x', ['v1'], { N: 0 })], vocesActivas: [V('v1', 'V')] });
  check('N=0 cae al global (no entrega cero)', plan.projects.p1.n === 100, String(plan.projects.p1.n));
}
{
  const { plan } = runPlan({
    proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Candidatos por corrida', valor: 33 } }],
  });
  check('el global de Ajustes pisa el default de Config', plan.projects.p1.n === 33, String(plan.projects.p1.n));
}

// ════════════════════════════════════════════════════════════════════════════
// Armar candidato — el corte final por proyecto (C.1) + dedup (ADR-018) + piso (ADR-017)
// ════════════════════════════════════════════════════════════════════════════
const CFG_CAND = { top_n: 100, piso_referente: 0 };
const runCorte = (items, plan, cfg = {}) => {
  const $ = (n) => {
    if (n === 'Armar plan de corrida') return { first: () => ({ json: plan }) };
    if (n === 'Config') return { first: () => ({ json: Object.assign({}, CFG_CAND, cfg) }) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => items.map((j) => ({ json: j })) };
  const logs = [];
  const out = new Function('$', '$input', 'console', jsCode('Armar candidato'))($, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs };
};
const vid = (id, pid, heat, extra = {}) => Object.assign(
  { external_id: id, proyecto_id: pid, heat_score: heat, username: 'ref1', descripcion: 'v' + id, script: 'txt', url: '', plataforma: 'ig' }, extra);

seccion('C.1 — el corte final va por proyecto');
{
  const items = [];
  for (let i = 0; i < 10; i++) items.push(vid('a' + i, 'P1', 1 - i / 100));
  for (let i = 0; i < 10; i++) items.push(vid('b' + i, 'P2', 1 - i / 100));
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 3 }, P2: { nombre: 'P2', n: 5 } } });
  const n1 = out.filter((o) => o.proyecto_id === 'P1').length;
  const n2 = out.filter((o) => o.proyecto_id === 'P2').length;
  check('cada proyecto entrega su N (3 y 5)', n1 === 3 && n2 === 5, `P1=${n1} P2=${n2}`);
}
{
  const items = [];
  for (let i = 0; i < 10; i++) items.push(vid('c' + i, 'P3', 1 - i / 100));
  const { out } = runCorte(items, { top_n: 4, projects: { P3: { nombre: 'P3' } } }); // sin n
  check('proyecto sin N usa el global como default (4)', out.length === 4, 'entregó ' + out.length);
}
{
  const items = [];
  for (let i = 0; i < 3; i++) items.push(vid('z' + i, 'P1', 0.5));
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 999 } } });
  check('N no inventa candidatos: entrega lo disponible', out.length === 3, 'entregó ' + out.length);
}

seccion('El orden dedup→corte (lo que motivó invertirlo)');
// v1 lo reclaman P1 (relevancia .9) y P2 (relevancia .3), N=2 cada uno. Con dedup primero, P1 se lleva
// v1 y P2 rellena con su siguiente → los DOS entregan 2. Cortando primero, P2 quedaba en 1.
{
  const items = [
    vid('v1', 'P1', 0.99, { relevancia_score: 0.9 }),
    vid('v1', 'P2', 0.99, { relevancia_score: 0.3 }), // misma pieza, fan-out
    vid('v2', 'P1', 0.80, { relevancia_score: 0.8 }),
    vid('v3', 'P1', 0.70, { relevancia_score: 0.8 }),
    vid('v4', 'P2', 0.60, { relevancia_score: 0.8 }),
    vid('v5', 'P2', 0.50, { relevancia_score: 0.8 }),
  ];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 2 }, P2: { nombre: 'P2', n: 2 } } });
  const v1s = out.filter((o) => o.external_id === 'v1');
  check('el video disputado va UNA sola vez (ADR-018)', v1s.length === 1, v1s.length + ' copias');
  check('gana el proyecto que lo juzgó más relevante (P1)', v1s[0] && v1s[0].proyecto_id === 'P1', v1s[0] && v1s[0].proyecto_id);
  check('el proyecto que lo perdió NO queda corto: rellena a su N',
    out.filter((o) => o.proyecto_id === 'P1').length === 2 && out.filter((o) => o.proyecto_id === 'P2').length === 2,
    `P1=${out.filter((o) => o.proyecto_id === 'P1').length} P2=${out.filter((o) => o.proyecto_id === 'P2').length}`);
}

seccion('Spillover (enmienda ADR-024, decisión Mani 2026-07-17): los sobrantes van al proyecto con cupo');
// El caso de la V-run del 07-17: 2 proyectos comparten referentes, el dedup concentra el pool
// compartido en el de mayor relevancia y, si está lleno, los sobrantes se tiraban enteros aunque el
// otro proyecto (hambriento, bajo su N) también los hubiera gateado.
{
  const items = [
    vid('s1', 'TFT', 0.99, { relevancia_score: 0.9 }),
    vid('s2', 'TFT', 0.98, { relevancia_score: 0.9 }), // gana TfT... pero TfT (N=1) ya está lleno con s1
    vid('s2', 'TP', 0.98, { relevancia_score: 0.7 }),  // la copia de TP: pasó SU gate → spillover
    vid('s3', 'TP', 0.50, { relevancia_score: 0.8 }),
  ];
  const { out, logs } = runCorte(items, { top_n: 100, projects: { TFT: { nombre: 'TfT', n: 1 }, TP: { nombre: 'TP', n: 5 } } });
  const s2 = out.filter((o) => o.external_id === 's2');
  check('el sobrante se entrega al proyecto hambriento que también lo gateó', s2.length === 1 && s2[0].proyecto_id === 'TP', JSON.stringify(s2.map((o) => o.proyecto_id)));
  check('con LA COPIA de ese proyecto (su relevancia, no la del ganador)', s2[0] && s2[0].relevancia_score === 0.7, s2[0] && String(s2[0].relevancia_score));
  check('N sigue siendo techo: TfT no se pasa de 1', out.filter((o) => o.proyecto_id === 'TFT').length === 1, String(out.filter((o) => o.proyecto_id === 'TFT').length));
  check('y lo dice en el log', logs.some((l) => /\[Spillover\] s2/.test(l)), JSON.stringify(logs));
  check('GARANTÍA: ningún video sale en 2 proyectos', new Set(out.map((o) => o.external_id)).size === out.length, JSON.stringify(out.map((o) => o.external_id)));
}
{
  // La garantía pedida por Mani, por el lado opuesto: un video YA entregado a su proyecto ganador
  // jamás se re-asigna a otro, aunque el otro tenga cupo de sobra.
  const items = [
    vid('w1', 'P1', 0.9, { relevancia_score: 0.9 }),
    vid('w1', 'P2', 0.9, { relevancia_score: 0.8 }),
  ];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 }, P2: { nombre: 'P2', n: 5 } } });
  check('un video entregado NO se duplica a otro proyecto con cupo', out.length === 1 && out[0].proyecto_id === 'P1', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
}
{
  // Sobrante sin proyecto con cupo → se descarta (no se inventa dónde ponerlo).
  const items = [
    vid('x1', 'P1', 0.90, { relevancia_score: 0.9 }),
    vid('x2', 'P1', 0.80, { relevancia_score: 0.9 }), // pierde el corte de P1 (N=1)
    vid('x2', 'P2', 0.80, { relevancia_score: 0.5 }), // su alternativa: P2... también lleno
    vid('x3', 'P2', 0.70, { relevancia_score: 0.9 }),
  ];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: { nombre: 'P2', n: 1 } } });
  check('sobrante con TODOS los proyectos llenos se descarta (N techo en ambos)', out.length === 2 && !out.some((o) => o.external_id === 'x2'), JSON.stringify(out.map((o) => o.external_id)));
}
{
  // Un proyecto cuyo pool entero perdió el dedup (0 ganadores) igual recibe por spillover.
  const items = [
    vid('y1', 'P1', 0.90, { relevancia_score: 0.9 }),
    vid('y2', 'P1', 0.80, { relevancia_score: 0.9 }),
    vid('y2', 'P2', 0.80, { relevancia_score: 0.6 }), // lo único de P2 es la copia perdedora de y2
  ];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: { nombre: 'P2', n: 3 } } });
  const p2 = out.filter((o) => o.proyecto_id === 'P2');
  check('proyecto sin ganadores propios igual recibe spillover', p2.length === 1 && p2[0].external_id === 'y2', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
}

seccion('Invariantes que no se tocan');
{
  const items = [];
  for (let i = 0; i < 5; i++) items.push(vid('h' + i, 'P1', 0.9 - i / 100, { username: 'hog' })); // una cuenta acapara
  for (let i = 0; i < 5; i++) items.push(vid('o' + i, 'P1', 0.5 - i / 100, { username: 'otra' }));
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 4 } } }, { piso_referente: 2 });
  const otra = out.filter((o) => o.referente === 'otra').length;
  check('PISO reparte dentro del proyecto (ADR-017)', out.length === 4 && otra >= 2, `otra=${otra} total=${out.length}`);
}
{
  const items = [vid('d1', 'P1', 0.99, { _descarte: true }), vid('e1', 'P1', 0.50), vid('e2', 'P1', 0.40)];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 2 } } });
  check('los _descarte no entran ni consumen N (ADR-021)', out.length === 2 && !out.some((o) => o.external_id === 'd1'), JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = [vid('l1', 'P1', 0.5, { idioma: 'ingles' }), vid('l2', 'P1', 0.4, { idioma: 'ru' })];
  const { out } = runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } });
  check('normLang canoniza el idioma (ingles→en, ru→otro) — cierre 34', out[0].idioma === 'en' && out[1].idioma === 'otro', out.map((o) => o.idioma).join(','));
}
{
  const { out } = runCorte([vid('s1', 'P1', 0.5, { script: '' })], { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } });
  check('sin transcript pasa igual, con marca visible (fail-open, decisión #6)', out.length === 1 && out[0].titulo.startsWith('⚠️ SIN GUION'), out[0] && out[0].titulo);
}

// ════════════════════════════════════════════════════════════════════════════
// Transcribir (Supadata) — pool de concurrencia (cierre 55) + dedup + fail-open + presupuesto
// (jsCode async con this.helpers.httpRequest → se compila como AsyncFunction y se corre con un
// `this` mockeado; el mock cuenta llamadas y concurrencia en vuelo)
// ════════════════════════════════════════════════════════════════════════════
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const runTranscribir = async (items, { presupuesto = 0, delayMs = 5, respuesta, falla } = {}) => {
  const llamadas = [];
  let enVuelo = 0, maxEnVuelo = 0;
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas.push(opts.url);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((r) => setTimeout(r, delayMs));
    enVuelo--;
    if (falla) throw new Error('supadata caída (mock)');
    return respuesta || { content: 'transcript de prueba', lang: 'en' };
  } } };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { presupuesto_transcribir_s: presupuesto } }) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => items.map((j) => ({ json: j })) };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode('Transcribir (Supadata)'))
    .call(thisMock, $, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas, maxEnVuelo: () => maxEnVuelo };
};
const tvid = (id, extra = {}) => Object.assign({ external_id: id, video_url: 'https://v/' + id, idioma_guess: 'es' }, extra);

seccion('Transcribir — pool de 8 (cierre 55, plan pago Supadata 10 req/s)');
await (async () => {
  {
    const items = []; for (let i = 0; i < 20; i++) items.push(tvid('t' + i));
    const { out, llamadas, maxEnVuelo } = await runTranscribir(items, { delayMs: 15 });
    check('con 20 videos hay hasta 8 llamadas EN VUELO a la vez (antes: 1)', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
    check('cada video distinto se llama UNA vez (dedup intacto con el pool)', llamadas.length === 20, llamadas.length + ' llamadas');
    check('todos salen con transcript', out.every((o) => o.transcripcion === 'transcript de prueba'), JSON.stringify(out.filter((o) => !o.transcripcion).length + ' sin transcript'));
  }
  {
    // fan-out: 3 copias de 2 videos → 2 llamadas, el transcript se reparte a las copias
    const items = [tvid('a'), tvid('a'), tvid('b')];
    const { out, llamadas } = await runTranscribir(items);
    check('el fan-out no paga doble: 3 items / 2 únicos = 2 llamadas (cierre 31 intacto)', llamadas.length === 2, llamadas.length + ' llamadas');
    check('las copias del fan-out comparten el transcript', out.length === 3 && out.every((o) => o.transcripcion), out.length + ' items');
  }
  {
    const { out } = await runTranscribir([tvid('x')], { falla: true });
    check('Supadata caída ⇒ fail-open (transcripcion vacía, el item sigue)', out.length === 1 && out[0].transcripcion === '', JSON.stringify(out[0] && out[0].transcripcion));
    check('y el idioma cae al guess del item', out[0].idioma_detectado === 'es', out[0] && out[0].idioma_detectado);
  }
  {
    // presupuesto agotado: budget ínfimo + llamadas lentas ⇒ no se ARRANCAN videos nuevos; el resto
    // pasa sin transcript y lo dice en el log (la degradación del 07-17, ahora visible y probada)
    const items = []; for (let i = 0; i < 30; i++) items.push(tvid('p' + i));
    const { out, logs, llamadas } = await runTranscribir(items, { presupuesto: 0.04, delayMs: 25 });
    check('el presupuesto corta: no se llaman los 30', llamadas.length < 30, llamadas.length + ' llamadas');
    check('los cortados salen igual, sin transcript (fail-open)', out.length === 30, out.length + ' items');
    check('y avisa cuántos quedaron sin transcript', logs.some((l) => /PRESUPUESTO agotado .*sin transcript/.test(l)), JSON.stringify(logs.slice(-2)));
  }
  {
    const { out } = await runTranscribir([tvid('l1')], { respuesta: { content: 'the and you for with this', lang: '' } });
    check('sin lang de Supadata, adivina sobre el transcript (en)', out[0].idioma_detectado === 'en', out[0].idioma_detectado);
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// Heat-score v1 — dedup blindado (ADR-029): processed_items (primaria, fail-closed) ∪ feed vivo
// (secundaria, fail-open) + cap_top_n. Cubre la ruta que explica los duplicados del run 20→21/07,
// que antes no tenía red de regresión.
// ════════════════════════════════════════════════════════════════════════════
const CFG_HEAT = { peso_views: 0.4, peso_likes: 0.4, peso_eng: 0.2, boost_idioma: 0.3, umbral_viral: 700000, min_views: 0, min_likes: 0, cap_top_n: 0 };
const runHeat = ({ items = [], procesados = [], feed = [], senal = [], cfg = {}, ajustes = {} } = {}) => {
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: Object.assign({}, CFG_HEAT, cfg) }) };
    if (n === 'Armar plan de corrida') return { first: () => ({ json: { ajustes } }) };
    if (n === 'Pre-trim relevancia') return { all: () => items.map((j) => ({ json: j })) };
    if (n === 'Leer procesados') return { all: () => procesados.map((j) => ({ json: j })) };
    if (n === 'Leer señal selección') return { all: () => senal.map((j) => ({ json: j })) };
    if (n === 'Leer feed vivo') return { all: () => feed.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const logs = [];
  const out = new Function('$', 'console', jsCode('Heat-score v1'))($, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs };
};
// el shape del feed vivo = una página de Airtable: { records: [{ fields: { external_id } }] }
const feedPage = (...ids) => ({ records: ids.map((id) => ({ fields: { external_id: id } })) });
const hvid = (id, pid = 'P1', extra = {}) => Object.assign({ external_id: id, proyecto_id: pid, reproducciones: 100, likes: 10, engagement_rate: 0.1, descripcion: 'hola ' + id, username: 'ref' }, extra);

seccion('Heat-score v1 — dedup blindado (ADR-029)');
{
  const { out } = runHeat({ items: [hvid('a'), hvid('b')], procesados: [{ external_id: 'a', platform: 'instagram' }] });
  check('un video ya en processed_items no vuelve a salir', out.length === 1 && out[0].external_id === 'b', JSON.stringify(out.map((o) => o.external_id)));
}
{
  const { out } = runHeat({ items: [hvid('a'), hvid('b')], feed: [feedPage('a')] });
  check('un video ya en el feed vivo no vuelve a salir (última línea ADR-029)', out.length === 1 && out[0].external_id === 'b', JSON.stringify(out.map((o) => o.external_id)));
}
{
  const { out } = runHeat({ items: [hvid('a'), hvid('b'), hvid('c')], procesados: [{ external_id: 'a', platform: 'ig' }], feed: [feedPage('b')] });
  check('procesados ∪ feed: caen los dos, sale solo el fresco', out.length === 1 && out[0].external_id === 'c', JSON.stringify(out.map((o) => o.external_id)));
}
{
  let threw = false, msg = '';
  try { runHeat({ items: [hvid('a')], procesados: [{ error: 'supabase 500' }] }); } catch (e) { threw = true; msg = e.message; }
  check('processed_items caído aborta el run (fail-closed, ADR-029)', threw && /\[Dedup\]/.test(msg), 'threw=' + threw + ' msg=' + msg);
}
{
  const { out } = runHeat({ items: [hvid('a'), hvid('b')], procesados: [{ external_id: 'a', platform: 'ig' }], feed: [{ error: 'airtable 500' }] });
  check('feed vivo caído NO aborta (fail-open); processed_items sigue dedupeando', out.length === 1 && out[0].external_id === 'b', JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = []; for (let i = 0; i < 5; i++) items.push(hvid('c' + i, 'P1', { reproducciones: 100 - i, likes: 100 - i }));
  const { out } = runHeat({ items, cfg: { cap_top_n: 2 } });
  check('cap_top_n corta a 2 videos distintos (regresión)', out.length === 2, 'entregó ' + out.length);
}

console.log(fail ? `\n${fail} test(s) en rojo` : '\nTodo en verde');
process.exit(fail ? 1 : 0);
