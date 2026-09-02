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
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

// ════════════════════════════════════════════════════════════════════════════
// Armar plan de corrida — C.1 (N por proyecto) + C.2 (gate por Voces.activo)
// ════════════════════════════════════════════════════════════════════════════
// Espeja el nodo `Config` del workflow.json vivo. `cap_top_n` decía 100 acá y 250 allá: el drift
// que ADR-042 resolvió a favor del que está corriendo.
const CFG_PLAN = { top_n: 100, dias_recencia: 7, resultados_referente: 20, cap_resultados_referente: 50, cap_top_n: 250, buscar_referente_ig: 1, buscar_referente_tiktok: 1 };

// OJO: las voces vienen filtradas por {activo} — antes lo hacía Airtable server-side, ahora la
// fachada con ?ambito=motor (D4). Igual que en n8n: una voz apagada = una voz que no está en la
// lista. El mock devuelve la respuesta del run-plan (ADR-028), no las 4 lecturas de Airtable.
const runPlan = ({ proyectos = [], vocesActivas = [], referentes = [], ajustes = [], cfg = {} } = {}) => {
  const fachada = { version: 1, voces: vocesActivas, proyectos, referentes, ajustes };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: Object.assign({}, CFG_PLAN, cfg) }) };
    if (n === 'Leer plan (fachada)') return { first: () => ({ json: fachada }) };
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
  // ADR-042: 'Candidatos por corrida' se borró del catálogo y del AJUSTE_MAP. Ya no hay ningún
  // ajuste que pueda mover la N por defecto — el 100 que queda es la red del Config, no una perilla.
  const { plan } = runPlan({
    proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Candidatos por corrida', valor: 33 } }],
  });
  check('el knob global murió: un ajuste con esa clave ya no mueve la N (ADR-042)', plan.projects.p1.n === 100, String(plan.projects.p1.n));
}

seccion('El tope de resultados por cuenta AVISA cuando recorta (era mudo)');
{
  // El 31/08 el ajuste estaba en 50 y `cap_resultados_referente` también: el equipo ya estaba
  // apoyado contra el techo sin enterarse, porque escribir 200 en la pantalla guardaba 200 en la
  // base y el motor usaba 50 sin decir nada. El tope se queda (es la red contra un 5000 de dedo);
  // lo que se arregla es el silencio.
  const { plan, logs } = runPlan({
    proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Resultados por cuenta de referente', valor: 200 } }],
    cfg: { cap_resultados_referente: 50 },
  });
  check('sigue recortando al tope (la red no se tocó)', plan.resultados_referente === 50, String(plan.resultados_referente));
  check('🔊 y ahora lo dice: el aviso nombra los DOS números', plan.avisos.length === 1 && plan.avisos[0].includes('200') && plan.avisos[0].includes('50'), JSON.stringify(plan.avisos));
  check('y también queda en el log del nodo', logs.some((l) => l.includes('Resultados por cuenta')), JSON.stringify(logs));
}
{
  const { plan } = runPlan({
    proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Resultados por cuenta de referente', valor: 30 } }],
    cfg: { cap_resultados_referente: 500 },
  });
  check('bajo el tope no avisa nada (un aviso que sale siempre no es un aviso)', plan.resultados_referente === 30 && plan.avisos.length === 0, `rr=${plan.resultados_referente} avisos=${JSON.stringify(plan.avisos)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Armar candidato — el corte final por proyecto (C.1) + dedup (ADR-018) + piso (ADR-017)
// ════════════════════════════════════════════════════════════════════════════
const CFG_CAND = { top_n: 100, piso_referente: 0 };
// ADR-091: el nodo pasa a ser ASYNC y puede llamar a Haiku (escalón 2). Los proyectos del mock no
// traen `criterios`, así que por defecto el escalón NO corre y no gasta una llamada — igual que en
// producción con un proyecto sin rúbrica. Los tests que sí lo ejercitan pasan `criterios`.
const runCorte = async (items, plan, cfg = {}, { juicio2 = null, falla2 = false } = {}) => {
  const llamadas2 = [];
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas2.push(opts);
    if (falla2) throw new Error('haiku caído (mock)');
    const usr = (((opts.body || {}).messages || [])[0] || {}).content || '';
    const tema = (usr.match(/^TEMA: (.*)$/m) || [])[1] || '';
    let ids = [];
    try { ids = JSON.parse(usr.slice(usr.indexOf('VIDEOS:\n') + 8)).map((v) => v.id); } catch (e) {}
    const j = ids.map((id) => (juicio2 ? juicio2(id, tema) : { id, relevante: false, score: 0, razon: 'no' }));
    return { content: [{ text: JSON.stringify({ juicio: j.filter(Boolean) }) }] };
  } } };
  const $ = (n) => {
    if (n === 'Armar plan de corrida') return { first: () => ({ json: plan }) };
    if (n === 'Config') return { first: () => ({ json: Object.assign({}, CFG_CAND, cfg) }) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => items.map((j) => ({ json: j })) };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode('Armar candidato')).call(thisMock, $, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas2 };
};
const vid = (id, pid, heat, extra = {}) => Object.assign(
  { external_id: id, proyecto_id: pid, heat_score: heat, username: 'ref1', descripcion: 'v' + id, script: 'txt', url: '', plataforma: 'ig' }, extra);

seccion('C.1 — el techo de gasto sale de Ajustes (ADR-042)');
{
  // La precedencia que estrena el re-import. Si esto se rompe, la corrida NO falla: transcribe
  // 250 y la factura llega el mes que viene. Por eso se fija acá y no solo en producción.
  const { plan } = runPlan({
    proyectos: [P('p1', 'x', ['v1'], { N: 5 })], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Videos a transcribir por corrida', valor: 10 } }],
  });
  check('el ajuste pisa el cap_top_n del Config', plan.cap_top_n === 10, String(plan.cap_top_n));
}
{
  const { plan } = runPlan({ proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')], ajustes: [] });
  check('sin el ajuste cae al Config (250), no a 0 = sin techo', plan.cap_top_n === 250, String(plan.cap_top_n));
}
{
  // 0 es legal y significa "sin techo": el validador de la app lo permite a propósito.
  const { plan } = runPlan({
    proyectos: [P('p1', 'x', ['v1'])], vocesActivas: [V('v1', 'V')],
    ajustes: [{ id: 'a1', fields: { clave: 'Videos a transcribir por corrida', valor: 0 } }],
  });
  check('un 0 explícito llega como 0 (sin techo), no se confunde con "vacío"', plan.cap_top_n === 0, String(plan.cap_top_n));
}

seccion('C.1 — el corte final va por proyecto');
{
  const items = [];
  for (let i = 0; i < 10; i++) items.push(vid('a' + i, 'P1', 1 - i / 100));
  for (let i = 0; i < 10; i++) items.push(vid('b' + i, 'P2', 1 - i / 100));
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 3 }, P2: { nombre: 'P2', n: 5 } } });
  const n1 = out.filter((o) => o.proyecto_id === 'P1').length;
  const n2 = out.filter((o) => o.proyecto_id === 'P2').length;
  check('cada proyecto entrega su N (3 y 5)', n1 === 3 && n2 === 5, `P1=${n1} P2=${n2}`);
}
{
  const items = [];
  for (let i = 0; i < 10; i++) items.push(vid('c' + i, 'P3', 1 - i / 100));
  const { out } = await runCorte(items, { top_n: 4, projects: { P3: { nombre: 'P3' } } }); // sin n
  check('proyecto sin N usa el global como default (4)', out.length === 4, 'entregó ' + out.length);
}
{
  const items = [];
  for (let i = 0; i < 3; i++) items.push(vid('z' + i, 'P1', 0.5));
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 999 } } });
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
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 2 }, P2: { nombre: 'P2', n: 2 } } });
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
  const { out, logs } = await runCorte(items, { top_n: 100, projects: { TFT: { nombre: 'TfT', n: 1 }, TP: { nombre: 'TP', n: 5 } } });
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
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 }, P2: { nombre: 'P2', n: 5 } } });
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
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: { nombre: 'P2', n: 1 } } });
  check('sobrante con TODOS los proyectos llenos se descarta (N techo en ambos)', out.length === 2 && !out.some((o) => o.external_id === 'x2'), JSON.stringify(out.map((o) => o.external_id)));
}
{
  // Un proyecto cuyo pool entero perdió el dedup (0 ganadores) igual recibe por spillover.
  const items = [
    vid('y1', 'P1', 0.90, { relevancia_score: 0.9 }),
    vid('y2', 'P1', 0.80, { relevancia_score: 0.9 }),
    vid('y2', 'P2', 0.80, { relevancia_score: 0.6 }), // lo único de P2 es la copia perdedora de y2
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: { nombre: 'P2', n: 3 } } });
  const p2 = out.filter((o) => o.proyecto_id === 'P2');
  check('proyecto sin ganadores propios igual recibe spillover', p2.length === 1 && p2[0].external_id === 'y2', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
}

seccion('Escalón 5 (ADR-088 §Enmienda): el bajo-umbral rellena, no compite');
// El bug que arregla: ADR-088 dejó de vetar en `Gate de relevancia`, pero el gate NO SABE cuánto
// falta para N —ese número vive acá— así que los bajo-umbral entraban SIEMPRE. Mani: "eso de
// entregar los 6 rechazados no debe ser". Acá se prueba el "sólo si N quedó corto".
{
  const items = [
    vid('a1', 'P1', 0.30), vid('a2', 'P1', 0.20), vid('a3', 'P1', 0.10),
    vid('b1', 'P1', 0.99, { _bajo_umbral: true }), // heat altísimo y NO debe entrar
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 2 } } });
  check('con aprobados de sobra, el bajo-umbral NO entra aunque tenga más heat',
    out.length === 2 && !out.some((o) => o.external_id === 'b1'), JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = [
    // a2 tiene MENOS heat que la reserva a propósito: sin la prioridad, el corte por heat se
    // llevaba b1 y b2 y dejaba afuera un aprobado. Con ella, a2 entra y sólo se rellena 1.
    vid('a1', 'P1', 0.90), vid('a2', 'P1', 0.40),
    vid('b1', 'P1', 0.70, { _bajo_umbral: true }),
    vid('b2', 'P1', 0.60, { _bajo_umbral: true }),
    vid('b3', 'P1', 0.50, { _bajo_umbral: true }),
  ];
  const { out, logs } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 3 } } });
  const bu = out.filter((o) => o.external_id[0] === 'b');
  check('si N queda corto, entra SÓLO lo que falta (1 de 3), y el mejor por heat',
    out.length === 3 && bu.length === 1 && bu[0].external_id === 'b1', JSON.stringify(out.map((o) => o.external_id)));
  check('y el log dice que rellenó bajo umbral (sin eso, un Feed ruidoso no tiene explicación)',
    logs.some((l) => /\[Corte\].*1 BAJO UMBRAL/.test(l)), JSON.stringify(logs));
  check('la marca viaja a la salida (es lo que cuenta `metricas.bajo_umbral_entregados`)',
    bu[0]._bajo_umbral === true && out.filter((o) => o.external_id === 'a1')[0]._bajo_umbral === false,
    JSON.stringify(out.map((o) => [o.external_id, o._bajo_umbral])));
}
{
  const items = [vid('b1', 'P1', 0.9, { _bajo_umbral: true }), vid('b2', 'P1', 0.8, { _bajo_umbral: true })];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } });
  check('un proyecto sin NINGÚN aprobado entrega su reserva entera (no se queda en cero)',
    out.length === 2, JSON.stringify(out.map((o) => o.external_id)));
}
{
  // La puerta de atrás del dedup: `relevante` y `score` los devuelve Haiku POR SEPARADO, así que un
  // bajo-umbral con score alto existe. Si ganara el fan-out, el video caería en la RESERVA de P1 en
  // vez del cupo de P2 —que sí lo quería— y la prioridad del corte quedaba anulada un paso antes.
  const items = [
    vid('v1', 'P1', 0.9, { relevancia_score: 0.9, _bajo_umbral: true }),
    vid('v1', 'P2', 0.9, { relevancia_score: 0.5 }),
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 }, P2: { nombre: 'P2', n: 5 } } });
  check('del fan-out gana el proyecto que lo APROBÓ, aunque el otro le puso más score',
    out.length === 1 && out[0].proyecto_id === 'P2', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
}
{
  // Y la misma prioridad en el spillover: si dos sobrantes se pelean el último cupo de otro
  // proyecto, primero el aprobado. Sin esto el escalón 5 gana un cupo por la puerta de atrás.
  const items = [
    vid('t1', 'TFT', 1.00, { relevancia_score: 0.9 }),
    vid('t2', 'TFT', 0.90, { relevancia_score: 0.9 }),
    vid('t2', 'TP', 0.90, { relevancia_score: 0.5 }),
    vid('t3', 'TFT', 0.99, { relevancia_score: 0.95, _bajo_umbral: true }),
    vid('t3', 'TP', 0.99, { relevancia_score: 0.5, _bajo_umbral: true }),
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { TFT: { nombre: 'TfT', n: 1 }, TP: { nombre: 'TP', n: 1 } } });
  const tp = out.filter((o) => o.proyecto_id === 'TP');
  check('el spillover también prefiere al aprobado (t2) sobre el bajo-umbral de más heat (t3)',
    tp.length === 1 && tp[0].external_id === 't2', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
}
{
  // El PISO no re-aplica sobre la reserva, mismo criterio que el spillover: es relleno marginal.
  // Lo que sí tiene que seguir valiendo es que el PISO reparta los APROBADOS.
  const items = [
    vid('h1', 'P1', 0.90, { username: 'hog' }), vid('h2', 'P1', 0.85, { username: 'hog' }),
    vid('o1', 'P1', 0.50, { username: 'otra' }),
    vid('b1', 'P1', 0.99, { username: 'hog', _bajo_umbral: true }),
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 3 } } }, { piso_referente: 1 });
  check('el PISO sigue repartiendo los aprobados y la reserva no se cuela en su lugar',
    out.length === 3 && !out.some((o) => o.external_id === 'b1'), JSON.stringify(out.map((o) => o.external_id)));
}

seccion('ADR-092 — la métrica desempata PASIVO: nunca invierte una diferencia de relevancia');
{
  // Mani: "el heat_score es una etiqueta que sirve como desempate pasivo... no es la voz final".
  // Es lexicográfico y no un peso: ADR-090 midió que NO existe peso que desempate sin rankear
  // (haría falta > 0,990 contra un paso de relevancia de 0,01).
  const items = [
    vid('empate-metrica-baja', 'P1', 0.80, { prescore_metrico: 0.10 }),
    vid('empate-metrica-alta', 'P1', 0.80, { prescore_metrico: 0.99 }),
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 } } });
  check('con relevancia empatada, la métrica decide', out.length === 1 && out[0].external_id === 'empate-metrica-alta', JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = [
    vid('rel-alta', 'P1', 0.81, { prescore_metrico: 0.00 }),
    vid('rel-baja', 'P1', 0.80, { prescore_metrico: 1.00 }),
  ];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 } } });
  check('un paso de relevancia (0,01) le gana a TODA la métrica: no puede invertirla nunca',
    out.length === 1 && out[0].external_id === 'rel-alta', JSON.stringify(out.map((o) => o.external_id)));
  check('y la etiqueta viaja a la salida (antes moría acá: es un percentil de SU corrida, no se recomputa)',
    out[0].prescore_metrico === 0, JSON.stringify(out.map((o) => o.prescore_metrico)));
}

seccion('ADR-091 — Escalón 2: la segunda oportunidad cross-proyecto');
const P2 = (extra = {}) => Object.assign({ nombre: 'P2', n: 5, criterios: 'tema de P2' }, extra);
{
  // El caso central: un video que P1 no se llevó (N lleno) y que P2 NUNCA VIO porque su referente
  // no está en la lista de P2. Hoy se perdía; el escalón se lo ofrece.
  const items = [
    vid('gana', 'P1', 0.90, { relevancia_score: 0.9 }),
    vid('huerfano', 'P1', 0.80, { relevancia_score: 0.8 }),
  ];
  const { out, logs, llamadas2 } = await runCorte(
    items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2() } },
    {}, { juicio2: (id) => ({ id, relevante: true, score: 0.77, razon: 'calza en P2' }) });
  const h = out.find((o) => o.external_id === 'huerfano');
  check('el huérfano entra al proyecto que nunca lo había visto', !!h && h.proyecto_id === 'P2', JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
  check('con la identidad del proyecto NUEVO (nombre y score suyos, no los del que lo descartó)',
    h && h.proyecto_nombre === 'P2' && h.relevancia_score === 0.77, JSON.stringify([h && h.proyecto_nombre, h && h.relevancia_score]));
  check('y la razón lleva el prefijo con el que se mide sin migración (ADR-089)',
    h && /^\[2da oportunidad\] /.test(h.relevancia_razon), h && h.relevancia_razon);
  check('solo se preguntó por el huérfano, no por el entregado', llamadas2.length === 1, llamadas2.length + ' llamadas');
  check('y lo dice en el log', logs.some((l) => /\[2da oportunidad\] huerfano/.test(l)), JSON.stringify(logs.filter((l) => /2da/.test(l))));
}
{
  // No se le vuelve a preguntar al proyecto que YA lo juzgó: eso ya lo resolvió el spillover.
  const items = [
    vid('g', 'P1', 0.90, { relevancia_score: 0.9 }),
    vid('h', 'P1', 0.80, { relevancia_score: 0.8 }),
    vid('h', 'P2', 0.80, { relevancia_score: 0.3 }), // P2 YA lo vio
  ];
  const { llamadas2 } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2({ n: 0 }) } },
    {}, { juicio2: (id) => ({ id, relevante: true, score: 0.9, razon: 'x' }) });
  check('a un proyecto que ya lo vio NO se le vuelve a preguntar (ni se le paga)', llamadas2.length === 0, llamadas2.length + ' llamadas');
}
{
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('b', 'P1', 0.8, { relevancia_score: 0.8 })];
  const { llamadas2 } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2({ criterios: '' }) } });
  check('un proyecto sin rúbrica no se pregunta (igual que el gate)', llamadas2.length === 0, llamadas2.length + ' llamadas');
}
{
  // ⚠️ `n: 0` NO sirve para esto: `_nDe` lo lee como "usá el N global" y el proyecto queda con 100 de
  // cupo. Para que P2 esté lleno de verdad hay que llenarlo con lo suyo.
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('b', 'P1', 0.8, { relevancia_score: 0.8 }),
                 vid('c', 'P2', 0.7, { relevancia_score: 0.7 })];
  const { llamadas2, out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2({ n: 1 }) } });
  check('con TODOS los proyectos llenos no se gasta un centavo', llamadas2.length === 0 && out.length === 2, llamadas2.length + ' llamadas, ' + out.length + ' entregados');
}
{
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('h1', 'P1', 0.8), vid('h2', 'P1', 0.7)];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2({ n: 1 }) } },
    {}, { juicio2: (id) => ({ id, relevante: true, score: 0.9, razon: 'x' }) });
  check('N sigue siendo techo exacto: P2 toma 1, no los 2 huérfanos', out.filter((o) => o.proyecto_id === 'P2').length === 1, JSON.stringify(out.map((o) => [o.external_id, o.proyecto_id])));
  check('GARANTÍA: ningún video sale en 2 proyectos', new Set(out.map((o) => o.external_id)).size === out.length, JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('singuion', 'P1', 0.8, { script: '' })];
  const { llamadas2 } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2() } },
    {}, { juicio2: (id) => ({ id, relevante: true, score: 0.9, razon: 'x' }) });
  check('un huérfano SIN GUION no se ofrece (ADR-030: no hay qué juzgar)', llamadas2.length === 0, llamadas2.length + ' llamadas');
}
{
  // FAIL-OPEN duro: el escalón es relleno y jamás puede tumbar una entrega ya decidida.
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('h', 'P1', 0.8, { relevancia_score: 0.8 })];
  const { out, logs } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2() } }, {}, { falla2: true });
  check('si Haiku se cae, la corrida entrega igual lo que ya tenía (invariante #1)',
    out.length === 1 && out[0].external_id === 'a', JSON.stringify(out.map((o) => o.external_id)));
  check('y el fallo queda en el log, no en silencio', logs.some((l) => /2da oportunidad/.test(l)), JSON.stringify(logs.filter((l) => /2da/.test(l))));
}
{
  // El que Haiku rechaza en la segunda vuelta no entra — y no se quema (ADR-087): vuelve gratis.
  const items = [vid('a', 'P1', 0.9, { relevancia_score: 0.9 }), vid('h', 'P1', 0.8, { relevancia_score: 0.8 })];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 1 }, P2: P2() } },
    {}, { juicio2: (id) => ({ id, relevante: false, score: 0.1, razon: 'no calza' }) });
  check('si ningún proyecto lo quiere, no entra (y al no entregarse, no se quema)', out.length === 1, JSON.stringify(out.map((o) => o.external_id)));
}

seccion('Invariantes que no se tocan');
{
  const items = [];
  for (let i = 0; i < 5; i++) items.push(vid('h' + i, 'P1', 0.9 - i / 100, { username: 'hog' })); // una cuenta acapara
  for (let i = 0; i < 5; i++) items.push(vid('o' + i, 'P1', 0.5 - i / 100, { username: 'otra' }));
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 4 } } }, { piso_referente: 2 });
  const otra = out.filter((o) => o.referente === 'otra').length;
  check('PISO reparte dentro del proyecto (ADR-017)', out.length === 4 && otra >= 2, `otra=${otra} total=${out.length}`);
}
{
  const items = [vid('d1', 'P1', 0.99, { _descarte: true }), vid('e1', 'P1', 0.50), vid('e2', 'P1', 0.40)];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 2 } } });
  check('los _descarte no entran ni consumen N (ADR-021)', out.length === 2 && !out.some((o) => o.external_id === 'd1'), JSON.stringify(out.map((o) => o.external_id)));
}
{
  const items = [vid('l1', 'P1', 0.5, { idioma: 'ingles' }), vid('l2', 'P1', 0.4, { idioma: 'ru' })];
  const { out } = await runCorte(items, { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } });
  check('normLang canoniza el idioma (ingles→en, ru→otro) — cierre 34', out[0].idioma === 'en' && out[1].idioma === 'otro', out.map((o) => o.idioma).join(','));
}
{
  const { out } = await runCorte([vid('s1', 'P1', 0.5, { script: '' })], { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } });
  check('sin transcript pasa igual, con marca visible (fail-open, decisión #6)', out.length === 1 && out[0].titulo.startsWith('⚠️ SIN GUION'), out[0] && out[0].titulo);
}

// ════════════════════════════════════════════════════════════════════════════
// Transcribir (Supadata) — pool de concurrencia (cierre 55) + dedup + fail-open + presupuesto
// (jsCode async con this.helpers.httpRequest → se compila como AsyncFunction y se corre con un
// `this` mockeado; el mock cuenta llamadas y concurrencia en vuelo)
// ════════════════════════════════════════════════════════════════════════════
const runTranscribir = async (items, { presupuesto = 0, delayMs = 5, concurrencia, respuesta, falla, secuencia, backoff = 1, arranque = 0, cache = null } = {}) => {
  const llamadas = [];
  let enVuelo = 0, maxEnVuelo = 0;
  const t0Mock = Date.now();
  const sellos = [];
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas.push(opts.url);
    sellos.push(Date.now() - t0Mock);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((r) => setTimeout(r, delayMs));
    enVuelo--;
    if (falla) throw new Error('supadata caída (mock)');
    if (secuencia) {
      // respuestas en orden (para probar el retry). `_throw` simula un status de error: n8n
      // rechaza la promesa en un 429, no devuelve cuerpo — que es justo lo que hay que distinguir
      // del 206 `transcript-unavailable`, que SÍ resuelve con cuerpo.
      const r = secuencia[Math.min(llamadas.length - 1, secuencia.length - 1)];
      if (r && r._throw) throw new Error(r._throw);
      return r;
    }
    return respuesta || { content: 'transcript de prueba', lang: 'en' };
  } } };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { presupuesto_transcribir_s: presupuesto, concurrencia_transcribir: concurrencia, backoff_transcribir_ms: backoff, arranque_transcribir_ms: arranque } }) };
    if (n === 'Heat-score v1') return { all: () => items.map((j) => ({ json: j })) };
    // ADR-087. `cache: null` simula que la RPC no corrió o se cayó: el nodo tiene que hacer
    // fail-open y transcribir todo, porque esto es plata y no memoria.
    if (n === 'Leer caché de transcripts') {
      if (cache === null) throw new Error('nodo sin ejecutar (mock)');
      return { all: () => cache.map((j) => ({ json: j })) };
    }
    throw new Error('nodo no mockeado: ' + n);
  };
  // El nodo lee sus videos POR NOMBRE (`$('Heat-score v1')`), nunca por `$input`. Eso importa más
  // que antes: desde ADR-029 §Enmienda la memoria se graba DESPUÉS de transcribir, así que este nodo
  // volvió a colgar directo de Heat-score. El mock deja `$input` vacío a propósito — si alguien lo
  // cambia por `$input.all()`, los casos de abajo se quedan sin videos y fallan fuerte.
  const $input = { all: () => [{ json: {} }] };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode('Transcribir (Supadata)'))
    .call(thisMock, $, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas, maxEnVuelo: () => maxEnVuelo, sellos: () => sellos };
};
const tvid = (id, extra = {}) => Object.assign({ external_id: id, video_url: 'https://v/' + id, idioma_guess: 'es' }, extra);

seccion('Transcribir — pool paralelo (plan pago Supadata 10 req/s)');
await (async () => {
  {
    const items = []; for (let i = 0; i < 40; i++) items.push(tvid('t' + i));
    const { out, llamadas, maxEnVuelo } = await runTranscribir(items, { delayMs: 15, concurrencia: 24 });
    check('la concurrencia sale de Config: con 24 hay hasta 24 EN VUELO a la vez (antes: 1)', maxEnVuelo() === 24, 'max en vuelo = ' + maxEnVuelo());
    check('cada video distinto se llama UNA vez (dedup intacto con el pool)', llamadas.length === 40, llamadas.length + ' llamadas');
    check('todos salen con transcript', out.every((o) => o.transcripcion === 'transcript de prueba'), JSON.stringify(out.filter((o) => !o.transcripcion).length + ' sin transcript'));
  }
  {
    // Config viejo (sin la clave) ⇒ cae al default del código, no a 1: un re-import a medias no
    // puede devolver el nodo al throughput serial en silencio. El default bajó 24 → 8 el 30/08:
    // 24 en vuelo es la ráfaga que Supadata contesta con 429 (ADR-030 §Enmienda), así que dejarlo
    // de default era dejar armada la trampa para el que re-importe sin Config.
    const items = []; for (let i = 0; i < 30; i++) items.push(tvid('d' + i));
    const { maxEnVuelo } = await runTranscribir(items, { delayMs: 15 });
    check('sin la clave en Config cae al default 8, no a 1', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
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
    // La concurrencia va fija y baja acá: lo que se prueba es el presupuesto, y con el pool en 24 los
    // 30 videos arrancan en dos vueltas y ningún budget razonable llega a morder.
    const items = []; for (let i = 0; i < 30; i++) items.push(tvid('p' + i));
    const { out, logs, llamadas } = await runTranscribir(items, { presupuesto: 0.04, delayMs: 25, concurrencia: 2 });
    check('el presupuesto corta: no se llaman los 30', llamadas.length < 30, llamadas.length + ' llamadas');
    check('los cortados salen igual, sin transcript (fail-open)', out.length === 30, out.length + ' items');
    check('y avisa cuántos quedaron sin transcript', logs.some((l) => /PRESUPUESTO agotado .*sin transcript/.test(l)), JSON.stringify(logs.slice(-2)));
  }
  {
    const { out } = await runTranscribir([tvid('l1')], { respuesta: { content: 'the and you for with this', lang: '' } });
    check('sin lang de Supadata, adivina sobre el transcript (en)', out[0].idioma_detectado === 'en', out[0].idioma_detectado);
  }
  // 🩸 El fallo mudo del idioma (arreglado el 26/08). Estos tres casos son el arreglo entero:
  // el default de `idioma_detectado` dejó de ser 'es', porque a esa rama sólo se llega cuando
  // `guessLang` ya descartó los cinco idiomas que conoce — español incluido.
  {
    const { out } = await runTranscribir([tvid('jp', { idioma_guess: '' })], {
      respuesta: { content: 'これはテストです。日本語の動画です。', lang: '' },
    });
    check(
      '🔴 sin lang y sin coincidencias en el diccionario NO cae a "es" (si no, no se traduce nunca)',
      out[0].idioma_detectado === 'otro',
      out[0].idioma_detectado,
    );
  }
  {
    // La otra mitad: 'otro' tiene que pasar el gate de Traducir, que es `idioma !== 'es'`.
    const { out } = await runTranscribir([tvid('jp2', { idioma_guess: '' })], {
      respuesta: { content: 'Guten Tag, das ist ein Test.', lang: '' },
    });
    check('y por eso Traducir lo va a agarrar (su gate es idioma !== "es")', out[0].idioma_detectado !== 'es', out[0].idioma_detectado);
  }
  {
    // 🔒 Y el contraejemplo, que es lo que hace que el arreglo no sea un cheque en blanco: un
    // transcript español SIN lang de Supadata lo sigue cazando `guessLang`, así que NO se traduce
    // ni se paga Haiku por convertir español en español.
    const { out } = await runTranscribir([tvid('es1', { idioma_guess: '' })], {
      respuesta: { content: 'esto es una prueba para que el que lo lea entienda de que se trata', lang: '' },
    });
    check('🔒 pero un transcript español sin lang SIGUE siendo "es" (no se paga traducirlo)', out[0].idioma_detectado === 'es', out[0].idioma_detectado);
  }
  // ADR-030: retry cuando la primera respuesta vuelve vacía
  {
    const { out, llamadas } = await runTranscribir([tvid('r1')], { secuencia: [{ content: '', lang: '' }, { content: 'recuperado al reintentar', lang: 'en' }] });
    check('retry: primera vacía → reintenta y recupera (2 llamadas)', out[0].transcripcion === 'recuperado al reintentar' && llamadas.length === 2, `tx='${out[0].transcripcion}' llamadas=${llamadas.length}`);
  }
  {
    const { out, llamadas } = await runTranscribir([tvid('r2')], { secuencia: [{ content: '', lang: '' }, { content: '', lang: '' }] });
    check('vacía sin motivo: agota los 5 intentos y hace fail-open', out[0].transcripcion === '' && llamadas.length === 5, `tx='${out[0].transcripcion}' llamadas=${llamadas.length}`);
  }
  // ─────────────────────────────────────────────────────────────────────────
  // ADR-030 §Enmienda (2026-08-31): "sin voz" y "Supadata saturada" dejan de tratarse igual.
  // Los tres casos de abajo SON la enmienda. Medido contra los 27 videos que la corrida 146 dio
  // por vacíos: a 24 en vuelo, 17 volvieron 429 `limit-exceeded` y UNO solo no tenía transcript
  // de verdad; los mismos 27 a 4 en vuelo trajeron 24 guiones.
  {
    const { out, llamadas } = await runTranscribir([tvid('u1')], { respuesta: { error: 'transcript-unavailable', message: 'Transcript Unavailable' } });
    check('sin voz (transcript-unavailable) NO se reintenta: 1 sola llamada', out[0].transcripcion === '' && llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    const { out, llamadas } = await runTranscribir([tvid('t429')], { secuencia: [{ _throw: '429 - {"error":"limit-exceeded"}' }, { content: 'recuperado tras el 429', lang: 'en' }] });
    check('429 (saturada) SÍ se reintenta y recupera el guion', out[0].transcripcion === 'recuperado tras el 429' && llamadas.length === 2, `tx='${out[0].transcripcion}' llamadas=${llamadas.length}`);
  }
  {
    // El caso que costó 27 videos: 4 rechazos seguidos y recién al quinto entra. Con RETRIES=1
    // este video se perdía, y como `POST processed_items` ya corrió (ADR-029), se perdía PARA SIEMPRE.
    const s = [{ _throw: '429' }, { _throw: '429' }, { _throw: '429' }, { _throw: '429' }, { content: 'entró al quinto', lang: 'en' }];
    const { out, llamadas } = await runTranscribir([tvid('t429b')], { secuencia: s });
    check('aguanta 4 rechazos seguidos y entra al quinto (antes se quemaba en el 2º)', out[0].transcripcion === 'entró al quinto' && llamadas.length === 5, `tx='${out[0].transcripcion}' llamadas=${llamadas.length}`);
  }
  {
    // El backoff no puede pisar el presupuesto: si el tiempo se acabó, no espera ni reintenta.
    const items = []; for (let i = 0; i < 12; i++) items.push(tvid('b' + i));
    const { llamadas } = await runTranscribir(items, { presupuesto: 0.05, delayMs: 25, concurrencia: 2, falla: true, backoff: 200 });
    check('con el presupuesto agotado el backoff no reintenta (no se cuelga el nodo)', llamadas.length < 12 * 5, llamadas.length + ' llamadas de 60 posibles');
  }

    // ── CACHÉ DE ASR (ADR-087): lo que ya se pagó no se vuelve a pagar ──
  // Es la pieza que hace posible dejar de quemar lo que no se entrega. Sin ella, un video que el
  // gate rechazó volvería en cada corrida y se re-transcribiría en cada corrida, para siempre.
  {
    const { out, llamadas } = await runTranscribir([tvid('c1')], {
      cache: [{ external_id: 'c1', estado: 'listo', script: 'guion cacheado', idioma: 'en' }],
    });
    check('🟢 cache hit: CERO llamadas a Supadata y el guion sale de la tabla',
      llamadas.length === 0 && out[0].transcripcion === 'guion cacheado', `llamadas=${llamadas.length} tx='${out[0].transcripcion}'`);
  }
  {
    const { out } = await runTranscribir([tvid('c1')], {
      cache: [{ external_id: 'c1', estado: 'listo', script: 'guion cacheado', idioma: 'en' }],
    });
    check('y viaja marcado como cache (para que no se re-escriba en la tabla)', out[0]._tx_origen === 'cache', String(out[0]._tx_origen));
  }
  {
    // Un mudo cacheado vale tanto como un guion: evita pagarle a Supadata para que vuelva a decir
    // que el video no tiene audio.
    const { out, llamadas } = await runTranscribir([tvid('c2')], {
      cache: [{ external_id: 'c2', estado: 'sin_transcript', script: null }],
    });
    check('🟢 mudo cacheado tampoco se re-pide (0 llamadas) y queda resuelto',
      llamadas.length === 0 && out[0]._tx_resuelta === true, `llamadas=${llamadas.length} resuelta=${out[0]._tx_resuelta}`);
  }
  {
    const { llamadas } = await runTranscribir([tvid('c3')], {
      cache: [{ external_id: 'OTRO', estado: 'listo', script: 'no es de esta corrida' }],
    });
    check('un id que no es de esta corrida NO se aplica (sí se llama a Supadata)', llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    // Los estados que NO son respuesta definitiva no cachean: hay que ir a preguntar.
    const { llamadas } = await runTranscribir([tvid('c4')], {
      cache: [{ external_id: 'c4', estado: 'pendiente', script: null }],
    });
    check('un `pendiente` no es respuesta: se transcribe igual', llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    const { llamadas } = await runTranscribir([tvid('c5')], {
      cache: [{ external_id: 'c5', estado: 'listo', script: '   ' }],
    });
    check('un `listo` con script vacío no cuenta como hit (se transcribe)', llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    // 🔒 El caso que decide que esto sea sumidero y no dependencia: un 42501 por el grant faltante
    // viaja como {error:...}. Si el nodo lo tomara por bueno, cachearía un vacío y el video saldría
    // sin guion — el gate lo mataría como sin_guion y se perdería POR SIEMPRE.
    const { llamadas } = await runTranscribir([tvid('c6')], {
      cache: [{ error: 'permission denied for function cache_transcripts' }],
    });
    check('🔒 un error de la RPC no cachea nada: se transcribe (se paga de más, no se pierde)', llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    const { llamadas } = await runTranscribir([tvid('c7')], { cache: null });
    check('🔒 y si la RPC ni corrió, fail-open igual (cache es plata, no memoria)', llamadas.length === 1, `llamadas=${llamadas.length}`);
  }
  {
    // El ahorro real, mezclado: 2 cacheados y 1 nuevo ⇒ una sola llamada.
    const { llamadas, out } = await runTranscribir([tvid('m1'), tvid('m2'), tvid('m3')], {
      cache: [{ external_id: 'm1', estado: 'listo', script: 'g1', idioma: 'en' },
              { external_id: 'm3', estado: 'sin_transcript', script: null }],
    });
    check('lote mixto: solo el no-cacheado va a Supadata (1 de 3)', llamadas.length === 1, `llamadas=${llamadas.length}`);
    check('y los tres salen con transcripción resuelta', out.every((o) => o._tx_resuelta === true), JSON.stringify(out.map((o) => o._tx_resuelta)));
  }

// ── `_tx_resuelta`: la bandera con la que se decide QUÉ se quema (ADR-029 §Enmienda) ──
  // Es la línea entre "Supadata contestó" y "no llegué a preguntar". Antes no existía y el
  // presupuesto quemaba: la corrida del 26/08 perdió 144 videos de 250 por una caída de Supadata.
  {
    const { out } = await runTranscribir([tvid('r1')]);
    check('con guion ⇒ resuelta (se quema: no hay que volver a pagarla)', out[0]._tx_resuelta === true, String(out[0]._tx_resuelta));
  }
  {
    const { out } = await runTranscribir([tvid('r2')], { respuesta: { error: 'transcript-unavailable' } });
    check('sin voz (definitivo) ⇒ resuelta igual (reintentarlo mil veces da lo mismo)', out[0]._tx_resuelta === true, String(out[0]._tx_resuelta));
  }
  {
    const { out } = await runTranscribir([tvid('r3')], { falla: true, backoff: 0 });
    check('🔴 429/timeout que agota los reintentos ⇒ NO resuelta (vuelve la próxima corrida)', out[0]._tx_resuelta === false, String(out[0]._tx_resuelta));
  }

  // ── `_tx_429`: cuánto aire queda antes del techo de Supadata ──
  // "0 videos perdidos" y "0 rate limiting" son DOS preguntas, y hasta hoy solo se podía contestar
  // la primera: un 429 que el backoff recupera sale con guion y no deja rastro en ningún lado.
  // Medido en la ejecución 156 (288 videos a 8 en vuelo): 0 perdidos — pero sin este contador no se
  // sabía si eso era aire de sobra o el borde justo, y de eso depende cuánto se puede subir la
  // concurrencia.
  {
    const { out } = await runTranscribir([tvid('a1')]);
    check('sin rechazos, el contador va en 0 (no en undefined)', out[0]._tx_429 === 0, String(out[0]._tx_429));
  }
  {
    const s = [{ _throw: '429 - {"error":"limit-exceeded"}' }, { content: 'entró al segundo', lang: 'en' }];
    const { out } = await runTranscribir([tvid('a2')], { secuencia: s });
    check('🔑 un 429 que el backoff RECUPERA igual se cuenta (si no, es invisible)', out[0]._tx_429 === 1 && out[0].transcripcion === 'entró al segundo', `429=${out[0]._tx_429} tx='${out[0].transcripcion}'`);
  }
  {
    const s = [{ _throw: '429' }, { _throw: '429' }, { _throw: '429' }, { content: 'al cuarto', lang: 'en' }];
    const { out } = await runTranscribir([tvid('a3')], { secuencia: s });
    check('cuenta los tres rechazos, no solo el último', out[0]._tx_429 === 3, String(out[0]._tx_429));
  }
  {
    // Un timeout de red NO es el techo de Supadata. Contarlos juntos haría bajar la concurrencia
    // por un problema que no es de concurrencia.
    const { out } = await runTranscribir([tvid('a4')], { secuencia: [{ _throw: 'ETIMEDOUT socket hang up' }, { content: 'ok', lang: 'en' }] });
    check('un timeout de red NO cuenta como rechazo por límite', out[0]._tx_429 === 0, String(out[0]._tx_429));
  }
  {
    const { out, logs } = await runTranscribir([tvid('a5')], { secuencia: [{ _throw: '429' }, { content: 'ok', lang: 'en' }] });
    check('y el nodo lo dice en el log, con la concurrencia al lado', logs.some((l) => /rechazos por limite/.test(l)), JSON.stringify(logs.filter((l) => /limite/.test(l))));
    check('el 0 también se dice (saber que hay aire es el dato que habilita subirla)', out.length === 1, 'ok');
  }
  {
    const { logs } = await runTranscribir([tvid('a6')]);
    check('sin rechazos el log dice que hay aire', logs.some((l) => /0 rechazos por limite/.test(l)), JSON.stringify(logs.slice(-1)));
  }

  // ── Arranque escalonado: lo que desacopla la concurrencia del rate limit ──
  // 🩸 `Promise.all(Array.from({length:N}, _worker))` largaba los N workers en el MISMO tick: N
  // pedidos en el mismo milisegundo. Con el plan de Supadata en 10 req/s, la concurrencia estaba
  // topada en 10 por el ARRANQUE y no por el trabajo — a 8 la ráfaga entraba (8 < 10) y a 12 no.
  // En régimen nunca hubo problema: 12 en vuelo a ~19 s de latencia son 0,62 req/s contra un techo
  // de 10. Lo único que hacía falta era no largarlos juntos. Lo cazó Mani preguntando.
  {
    const items = []; for (let i = 0; i < 12; i++) items.push(tvid('s' + i));
    const { sellos } = await runTranscribir(items, { concurrencia: 12, delayMs: 200, arranque: 0 });
    const primeros = sellos().slice(0, 12);
    check('🩸 sin escalonar, los 12 salen juntos (la ráfaga que se come el 429)', primeros[11] - primeros[0] < 50, `${primeros[11] - primeros[0]}ms entre el 1º y el 12º`);
  }
  {
    const items = []; for (let i = 0; i < 12; i++) items.push(tvid('e' + i));
    const { sellos, maxEnVuelo } = await runTranscribir(items, { concurrencia: 12, delayMs: 400, arranque: 30 });
    const primeros = sellos().slice(0, 12);
    const brecha = primeros[11] - primeros[0];
    check('🔑 escalonado, los 12 se reparten en el tiempo', brecha >= 11 * 30 * 0.7, `${brecha}ms entre el 1º y el 12º (esperado ~${11 * 30})`);
    check('y siguen llegando a estar los 12 en vuelo (no baja la concurrencia real)', maxEnVuelo() === 12, 'max en vuelo = ' + maxEnVuelo());
  }
  {
    // El escalonado NO puede costar una llamada ni un video: solo mueve CUÁNDO arranca cada worker.
    const items = []; for (let i = 0; i < 9; i++) items.push(tvid('f' + i));
    const { out, llamadas } = await runTranscribir(items, { concurrencia: 4, arranque: 10 });
    check('no cambia cuántas llamadas se hacen ni cuántos videos salen', llamadas.length === 9 && out.length === 9, `llamadas=${llamadas.length} out=${out.length}`);
  }
  {
    const items = []; for (let i = 0; i < 6; i++) items.push(tvid('g' + i));
    const { llamadas } = await runTranscribir(items, { concurrencia: 3, arranque: 0 });
    check('con arranque en 0 se comporta como antes (el knob apagado no hace nada)', llamadas.length === 6, llamadas.length + ' llamadas');
  }
  {
    // El caso que da nombre al arreglo: el presupuesto deja videos sin arrancar siquiera.
    const items = []; for (let i = 0; i < 30; i++) items.push(tvid('p' + i));
    const { out } = await runTranscribir(items, { presupuesto: 0.04, delayMs: 25, concurrencia: 2 });
    const sinResolver = out.filter((o) => o._tx_resuelta !== true).length;
    check('🔴 los que el presupuesto dejó afuera NO quedan resueltos (antes se quemaban)', sinResolver > 0, sinResolver + ' de 30 sin resolver');
    check('y los que sí alcanzó a mirar quedan resueltos', out.some((o) => o._tx_resuelta === true), 'ninguno resuelto');
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// Traducir (Claude Haiku) — pool + presupuesto (espejo de Transcribir)
// ════════════════════════════════════════════════════════════════════════════
// Era el ÚNICO nodo caro serial y sin presupuesto: 1 llamada + sleep(1000) por video no-español, y
// los referentes son casi todos ingleses (170 traducciones sobre 191 transcritos el 31/07). Sin
// presupuesto, el watchdog del task runner mata el nodo y la corrida no entrega nada — el modo de
// falla más caro que tiene el motor. Lo que se prueba acá es la diferencia con Transcribir: este
// presupuesto DEGRADA (el video sale en su idioma original y el gate lo juzga igual), no quema.
const runTraducir = async (items, { presupuesto = 0, concurrencia, delayMs = 5, respuesta, falla } = {}) => {
  const llamadas = [];
  let enVuelo = 0, maxEnVuelo = 0;
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas.push(opts.body && opts.body.messages[0].content);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((r) => setTimeout(r, delayMs));
    enVuelo--;
    if (falla) throw new Error('anthropic caída (mock)');
    return respuesta || { content: [{ text: 'traducido' }] };
  } } };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { presupuesto_traducir_s: presupuesto, concurrencia_traducir: concurrencia } }) };
    if (n === 'Transcribir (Supadata)') return { all: () => items.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  // Espejo del mock de Transcribir, y por la misma razón: desde ADR-029 §Enmienda entre los dos se
  // intercaló `Preparar procesados` → `POST processed_items`, así que el input directo de este nodo
  // es la respuesta del POST y los videos entran por nombre.
  const $input = { all: () => [{ json: {} }] };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode('Traducir (Claude Haiku)'))
    .call(thisMock, $, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas, maxEnVuelo: () => maxEnVuelo };
};
const xvid = (id, idioma = 'en', extra = {}) => Object.assign({ external_id: id, transcripcion: 'text of ' + id, idioma_detectado: idioma }, extra);

seccion('Traducir — pool + presupuesto (el nodo que mataba la corrida)');
await (async () => {
  {
    const items = []; for (let i = 0; i < 20; i++) items.push(xvid('x' + i));
    const { out, llamadas, maxEnVuelo } = await runTraducir(items, { delayMs: 15 });
    check('hay hasta 8 llamadas EN VUELO a la vez (antes: 1, serial con sleep de 1s)', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
    check('cada video distinto se traduce UNA vez (dedup del cierre 31 intacto)', llamadas.length === 20, llamadas.length + ' llamadas');
    check('todos salen con el script traducido', out.every((o) => o.script === 'traducido'), JSON.stringify(out.filter((o) => o.script !== 'traducido').length + ' sin traducir'));
  }
  {
    const items = []; for (let i = 0; i < 30; i++) items.push(xvid('c' + i));
    const { maxEnVuelo } = await runTraducir(items, { delayMs: 15, concurrencia: 16 });
    check('la concurrencia sale de Config (16 ⇒ 16 en vuelo)', maxEnVuelo() === 16, 'max en vuelo = ' + maxEnVuelo());
  }
  {
    // El español no se traduce: sigue siendo lo que ahorra la mitad de las llamadas.
    const { llamadas, out } = await runTraducir([xvid('e1', 'es'), xvid('e2', 'en')]);
    check('el español no gasta una llamada', llamadas.length === 1, llamadas.length + ' llamadas');
    check('y su script queda como el transcript original', out[0].script === 'text of e1', out[0].script);
  }
  {
    // fan-out: 3 copias de 2 videos → 2 llamadas
    const { llamadas, out } = await runTraducir([xvid('a'), xvid('a'), xvid('b')]);
    check('el fan-out no paga doble: 3 items / 2 únicos = 2 llamadas', llamadas.length === 2, llamadas.length + ' llamadas');
    check('las copias del fan-out comparten la traducción', out.length === 3 && out.every((o) => o.script === 'traducido'), out.length + ' items');
  }
  {
    const { out, logs } = await runTraducir([xvid('f1')], { falla: true });
    check('Haiku caído ⇒ fail-open: el script queda en el idioma original', out[0].script === 'text of f1', out[0].script);
    check('y deja de ser silencioso: lo dice en el log', logs.some((l) => /ERROR id=f1/.test(l)), JSON.stringify(logs));
  }
  {
    // presupuesto agotado: budget ínfimo + llamadas lentas ⇒ no se ARRANCAN traducciones nuevas.
    // La diferencia con Transcribir: acá el video SIGUE VIVO, solo que sin traducir.
    const items = []; for (let i = 0; i < 40; i++) items.push(xvid('p' + i));
    const { out, logs, llamadas } = await runTraducir(items, { presupuesto: 0.04, delayMs: 25, concurrencia: 2 });
    check('el presupuesto corta: no se llaman los 40', llamadas.length < 40, llamadas.length + ' llamadas');
    check('los cortados NO se pierden: salen con el transcript original', out.length === 40 && out.every((o) => o.script), out.length + ' items');
    check('y avisa cuántos quedaron sin traducir', logs.some((l) => /PRESUPUESTO agotado .*idioma original/.test(l)), JSON.stringify(logs.slice(-3)));
  }
  {
    const { out, logs } = await runTraducir([xvid('v1')], { respuesta: { content: [{ text: '   ' }] } });
    check('respuesta vacía ⇒ fail-open al transcript original', out[0].script === 'text of v1', out[0].script);
    check('y se cuenta como fallida', logs.some((l) => /1 traducciones fallaron/.test(l)), JSON.stringify(logs));
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// Pre-trim relevancia — chunks + pool, y el fail-open que dejó de ser invisible
// ════════════════════════════════════════════════════════════════════════════
// Mandaba UNA llamada por proyecto con TODOS sus captions y `max_tokens: 1000` para la lista de ids
// a descartar. Medido sobre la ejecución 150 (31/08): 465 videos = ~40k tokens de prompt, y el peor
// proyecto usó ~469 tokens de respuesta = **47% del techo** ⇒ a 2x está en 94% y a 4x TRUNCA. Los dos
// extremos terminan en el MISMO síntoma, que es el peor posible: el regex no matchea el JSON cortado,
// el catch se lo traga y el nodo descarta CERO, sin un error y sin una línea en el log.
const runPretrim = async ({ items = [], projects = {}, cfg = {}, delayMs = 0, descartarFn, respuesta, falla = false } = {}) => {
  const llamadas = [];
  let enVuelo = 0, maxEnVuelo = 0;
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas.push(opts);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    enVuelo--;
    if (falla) throw new Error('haiku caído (mock)');
    if (respuesta !== undefined) return respuesta;
    const usr = (((opts.body || {}).messages || [])[0] || {}).content || '';
    let ids = [];
    try { ids = JSON.parse(usr.slice(usr.indexOf('VIDEOS:\n') + 8)).map((v) => v.id); } catch (e) {}
    return { content: [{ text: JSON.stringify({ descartar: descartarFn ? ids.filter(descartarFn) : [] }) }] };
  } } };
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: cfg }) };
    if (n === 'Armar plan de corrida') return { first: () => ({ json: { projects } }) };
    if (n === 'Asignar proyecto+voz') return { all: () => items.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const logs = [];
  const out = await new AsyncFn('$', 'console', jsCode('Pre-trim relevancia')).call(thisMock, $, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas, maxEnVuelo: () => maxEnVuelo };
};
// caption largo a propósito: el filtro de "caption pobre" (<25 chars de señal) exime del juicio
const qvid = (id, pid = 'P1') => ({ external_id: id, proyecto_id: pid, descripcion: 'un caption con texto real y suficiente senal para juzgar ' + id, hashtags: '#algo' });

seccion('Pre-trim — chunks de 100 (una sola llamada por proyecto se pasaba de ventana)');
await (async () => {
  const P1 = { P1: { nombre: 'P1', criterios: 'trading' } };
  const muchos = (n, pid = 'P1') => { const a = []; for (let i = 0; i < n; i++) a.push(qvid(pid + '-v' + i, pid)); return a; };
  {
    const { llamadas } = await runPretrim({ items: muchos(450), projects: P1 });
    check('450 videos se parten en 5 chunks (antes: 1 llamada de ~40k tokens)', llamadas.length === 5, llamadas.length + ' llamadas');
    check('y cada chunk manda como mucho 100 videos', llamadas.every((l) => JSON.parse(l.body.messages[0].content.split('VIDEOS:\n')[1]).length <= 100), 'algún chunk se pasó de 100');
  }
  {
    const { maxEnVuelo } = await runPretrim({ items: muchos(800), projects: P1, delayMs: 15 });
    check('los chunks van en paralelo', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
  }
  {
    const items = muchos(100, 'P1').concat(muchos(700, 'P2'));
    const projects = { P1: { nombre: 'P1', criterios: 'trading' }, P2: { nombre: 'P2', criterios: 'psico' } };
    const { maxEnVuelo } = await runPretrim({ items, projects, delayMs: 15 });
    check('el pool cruza proyectos (1 chunk + 7 chunks corren juntos)', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
  }
  {
    const { llamadas } = await runPretrim({ items: muchos(50), projects: P1 });
    check('🔑 max_tokens sube a 2000: 100 ids descartados entran con colchón', llamadas[0].body.max_tokens === 2000, String(llamadas[0].body.max_tokens));
  }
  {
    const { out } = await runPretrim({ items: muchos(30), projects: P1, descartarFn: (id) => id.endsWith('0') });
    check('sigue descartando lo que Haiku marca (el trabajo del nodo no cambió)', out.length === 27, out.length + ' de 30');
  }
  {
    const { out } = await runPretrim({ items: muchos(30), projects: P1 });
    check('y sin descartes pasa todo', out.length === 30, out.length + ' de 30');
  }

  // ── El fail-open dejó de ser invisible ──
  // Medido el 31/08: dos proyectos de 465 videos descartaron CERO, y no había forma de saber si el
  // tema estaba limpio o la llamada se había roto. Ahora se distinguen.
  {
    const { out, logs } = await runPretrim({ items: muchos(30), projects: P1, falla: true });
    check('🔴 Haiku caído: pasa todo (fail-open intacto)', out.length === 30, out.length + ' de 30');
    check('🔊 pero los items quedan marcados _pretrim_fallo', out.every((o) => o._pretrim_fallo === true), 'alguno sin marcar');
    check('y el nodo lo grita en el log', logs.some((l) => l.includes('chunks sin juicio')), JSON.stringify(logs));
  }
  {
    // El caso que da nombre al arreglo: respuesta TRUNCADA. No es un error, es un JSON cortado —
    // antes era indistinguible de "no había nada que descartar".
    const { out, logs } = await runPretrim({ items: muchos(30), projects: P1, respuesta: { content: [{ text: '{"descartar":["a","b","c' }] } });
    check('🔴 respuesta truncada: pasa todo, igual que antes', out.length === 30, out.length + ' de 30');
    check('🔊 pero AHORA se distingue de "no había nada off-topic"', out.every((o) => o._pretrim_fallo === true), 'no se marcó: volvió a ser invisible');
    check('y también grita', logs.some((l) => l.includes('truncada')), JSON.stringify(logs.slice(-1)));
  }
  {
    const { out } = await runPretrim({ items: muchos(30), projects: P1 });
    check('un chunk sano NO se marca (una marca que sale siempre no marca nada)', out.every((o) => o._pretrim_fallo === false), 'hay marcados de más');
  }
  {
    const { out, llamadas } = await runPretrim({ items: muchos(30), projects: { P1: { nombre: 'P1' } } });
    check('sin criterios sigue sin llamar a Haiku y pasa todo', llamadas.length === 0 && out.length === 30, `llamadas=${llamadas.length} out=${out.length}`);
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
// D7: el feed vivo es PostgREST, o sea filas planas — { external_id } — y no la página de
// Airtable { records: [{ fields }] } de antes. El nodo lo lee con el helper `rows()`, que
// tolera tanto un array por item como un item por fila.
const feedPage = (...ids) => ids.map((id) => ({ external_id: id }));
const hvid = (id, pid = 'P1', extra = {}) => Object.assign({ external_id: id, proyecto_id: pid, reproducciones: 100, likes: 10, engagement_rate: 0.1, descripcion: 'hola ' + id, username: 'ref' }, extra);

seccion('Heat-score v1 — el desglose de por qué murió cada video (pendiente #9 del audit)');
{
  // Hasta hoy los 3 filtros compartían `metricas.filtrados`, un solo número. Medido el 01/09: la
  // corrida de las 14:17 pasó de 3.306 pares a 42 acá (98,7%) y era imposible decidir si sobraba
  // memoria o si el piso estaba muy alto. Un número que no distingue causas no habilita ninguna
  // decisión.
  const items = [
    hvid('vivo', 'P1', { reproducciones: 500000, likes: 900 }),
    hvid('ya-visto', 'P1', { reproducciones: 500000, likes: 900 }),
    hvid('pocas-vistas', 'P1', { reproducciones: 50, likes: 900 }),
    hvid('pocos-likes', 'P1', { reproducciones: 500000, likes: 1 }),
  ];
  const { out, logs } = runHeat({
    items, procesados: [{ external_id: 'ya-visto' }],
    cfg: { min_views: 100000, min_likes: 10 },
  });
  const m = out[0] && out[0]._muertos;
  check('solo pasa el que sobrevive los tres filtros', out.length === 1 && out[0].external_id === 'vivo', JSON.stringify(out.map((o) => o.external_id)));
  check('y cada motivo se cuenta por separado (era UN número para TRES filtros)',
    m && m.dedup === 1 && m.min_views === 1 && m.min_likes === 1, JSON.stringify(m));
  check('los pisos vigentes viajan con el número (sin ellos no se puede interpretar después)',
    m && m.piso_views === 100000 && m.piso_likes === 10, JSON.stringify(m));
  check('y sale por log', logs.some((l) => /\[Filtros\] muertos por motivo/.test(l)), JSON.stringify(logs));
}
{
  // El orden importa: un video que está ya visto Y bajo el piso cuenta UNA vez, como dedup. Si
  // contara en los dos, la suma pasaría el total y nadie podría sumar el embudo.
  const items = [hvid('ambos', 'P1', { reproducciones: 5, likes: 0 })];
  const { out } = runHeat({ items, procesados: [{ external_id: 'ambos' }], cfg: { min_views: 100000, min_likes: 10 } });
  const { out: o2 } = runHeat({ items: [hvid('x', 'P1', { reproducciones: 500000, likes: 900 })], procesados: [{ external_id: 'ambos' }], cfg: { min_views: 100000 } });
  check('un video que cae por dos motivos cuenta una sola vez (la memoria manda)',
    out.length === 0 && o2[0]._muertos.dedup === 0 && o2[0]._muertos.min_views === 0, JSON.stringify(o2[0]._muertos));
}
{
  // El fan-out repite el mismo video una vez por proyecto: si se contaran FILAS, los tres números
  // se inflarían por igual y el desglose diría 3 donde hay 1.
  const items = [hvid('dup', 'P1', { reproducciones: 5 }), hvid('dup', 'P2', { reproducciones: 5 }), hvid('dup', 'P3', { reproducciones: 5 }),
                 hvid('ok', 'P1', { reproducciones: 500000, likes: 900 })];
  const { out } = runHeat({ items, cfg: { min_views: 100000 } });
  check('cuenta VIDEOS distintos, no filas del fan-out', out[0]._muertos.min_views === 1, JSON.stringify(out[0]._muertos));
}

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
// ── El feed vivo también tiene guard, y por qué eso no contradice su fail-open ──
// ADR-029 la eligió como línea SECUNDARIA y best-effort; su §Enmienda midió que hacía el **100%**
// del dedup (la primaria aportó 0). Y hasta hoy se cortaba en 1.000 igual que la otra, sin paginar.
// La distinción que sostiene los dos comportamientos: un servicio CAÍDO devuelve 0 filas o revienta
// (fail-open, la corrida sigue); una PAGINACIÓN ROTA devuelve exactamente 1.000, y ahí el motor está
// ciego sin saberlo.
{
  const mil = []; for (let i = 0; i < 1000; i++) mil.push('f' + i);
  let msg = '';
  try { runHeat({ items: [hvid('a')], feed: [feedPage(...mil)] }); } catch (e) { msg = e.message; }
  check('🔒 exactamente 1000 filas del feed vivo = una sola página ⇒ aborta', msg.includes('Leer feed vivo') && msg.includes('paginacion'), msg || 'no tiró');
}
{
  const casi = []; for (let i = 0; i < 999; i++) casi.push('f' + i);
  const { out } = runHeat({ items: [hvid('a')], feed: [feedPage(...casi)] });
  check('999 no dispara nada (el guard es el número exacto, no "muchas")', out.length === 1, out.length + ' items');
}
{
  // El fail-open de siempre sigue en pie: que el feed se caiga NO puede abortar la corrida.
  const $roto = { all: () => { throw new Error('supabase caído (mock)'); } };
  const out = (() => {
    const $ = (n) => {
      if (n === 'Config') return { first: () => ({ json: CFG_HEAT }) };
      if (n === 'Armar plan de corrida') return { first: () => ({ json: { ajustes: {} } }) };
      if (n === 'Pre-trim relevancia') return { all: () => [{ json: hvid('a') }] };
      if (n === 'Leer procesados') return { all: () => [] };
      if (n === 'Leer señal selección') return { all: () => [] };
      if (n === 'Leer feed vivo') return $roto;
      throw new Error('nodo no mockeado: ' + n);
    };
    return new Function('$', 'console', jsCode('Heat-score v1'))($, { log: () => {} });
  })();
  check('y el feed caído sigue siendo fail-open: la corrida entrega igual', out.length === 1, out.length + ' items');
}
{
  let threw = false, msg = '';
  try { runHeat({ items: [hvid('a')], procesados: [{ error: 'supabase 500' }] }); } catch (e) { threw = true; msg = e.message; }
  check('processed_items caído aborta el run (fail-closed, ADR-029)', threw && /\[Dedup\]/.test(msg), 'threw=' + threw + ' msg=' + msg);
}
{
  // La lectura trae la tabla entera PAGINANDO por offset (50 páginas × 1000). Si algún día toca ese
  // techo, la memoria llega incompleta y los duplicados vuelven en silencio -> abortar.
  const procesados = []; for (let i = 0; i < 50000; i++) procesados.push({ external_id: 'p' + i, platform: 'ig' });
  let threw = false, msg = '';
  try { runHeat({ items: [hvid('a')], procesados }); } catch (e) { threw = true; msg = e.message; }
  check('processed_items en el techo de 50.000 aborta el run', threw && /50\.000/.test(msg), 'threw=' + threw + ' msg=' + msg);
}
{
  // 🩸 EL TEST QUE FALTABA, y por eso el bug vivió meses. El guard de arriba comparaba contra 50.000
  // mientras el techo REAL era el `max-rows` de PostgREST, que es 1000: la URL pedía limit=50000 y la
  // base devolvía 1000 filas de 1547, o sea que el motor quedaba ciego al 35% de su propia memoria y
  // el fail-closed nunca disparaba (medido el 2026-08-31, ADR-029 §Enmienda).
  // 1000 EXACTO = una sola página. Con la paginación andando no puede pasar; si pasa, se apagó.
  const procesados = []; for (let i = 0; i < 1000; i++) procesados.push({ external_id: 'p' + i, platform: 'ig' });
  let threw = false, msg = '';
  try { runHeat({ items: [hvid('a')], procesados }); } catch (e) { threw = true; msg = e.message; }
  check('exactamente 1000 filas = una sola página de PostgREST -> aborta', threw && /UNA sola pagina/.test(msg), 'threw=' + threw + ' msg=' + msg);
}
{
  // Y el contraejemplo, que es lo que hace que el guard de arriba sea un guard y no un estorbo: 999 y
  // 1001 son lecturas sanas y NO pueden abortar. Sin esto, "abortá si hay muchas filas" pasaría igual.
  const mk = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ external_id: 'p' + i, platform: 'ig' }); return a; };
  let ok999 = false, ok1001 = false;
  try { runHeat({ items: [hvid('z')], procesados: mk(999) }); ok999 = true; } catch { /* no debe */ }
  try { runHeat({ items: [hvid('z')], procesados: mk(1001) }); ok1001 = true; } catch { /* no debe */ }
  check('999 y 1001 filas NO abortan (el guard mira 1000 exacto, no "muchas")', ok999 && ok1001, '999=' + ok999 + ' 1001=' + ok1001);
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

// ════════════════════════════════════════════════════════════════════════════
// Preparar procesados — la fila que se graba en la memoria del dedup (ADR-029).
// `run_id` es FK a runs(id): si el run no se pudo abrir, tiene que viajar NULL. Un uuid de relleno
// haría fallar el INSERT del batch entero, o sea la corrida entregaría sin memorizar (cierre 70, H3).
// ════════════════════════════════════════════════════════════════════════════
const runPreparar = ({ videos, runId, abrirRunFalla = false }) => {
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { instance_id: '<<INSTANCE_ID>>' } }) };
    if (n === 'Abrir run en el registro') {
      if (abrirRunFalla) throw new Error('nodo sin ejecutar (mock)');
      return { first: () => ({ json: runId ? { id: runId } : {} }) };
    }
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => videos.map((j) => ({ json: j })) };
  const out = new Function('$', '$input', jsCode('Preparar procesados'))($, $input);
  return out[0].json.batch;
};
const pvid = (id, extra = {}) => Object.assign({ external_id: id, plataforma: 'instagram', url: 'https://v/' + id, _entregado: true }, extra);

seccion('Preparar procesados — atribuir la memoria a su corrida (H3, cierre 70)');
{
  const batch = runPreparar({ videos: [pvid('a'), pvid('b')], runId: 'r-1' });
  check('cada fila viaja con el run_id de la corrida', batch.length === 2 && batch.every((r) => r.run_id === 'r-1'), JSON.stringify(batch.map((r) => r.run_id)));
}
{
  const batch = runPreparar({ videos: [pvid('a')], abrirRunFalla: true });
  check('si Abrir run no corrió, run_id va NULL y no un uuid de relleno (FK a runs)', batch[0].run_id === null, JSON.stringify(batch[0].run_id));
}
{
  const batch = runPreparar({ videos: [pvid('a')], runId: null });
  check('Abrir run sin id (continue-on-fail) también da NULL', batch[0].run_id === null, JSON.stringify(batch[0].run_id));
}
{
  const batch = runPreparar({ videos: [pvid('a'), { url: 'https://v/x' }], runId: 'r-1' });
  check('sigue filtrando lo que no tiene external_id (la clave del dedup)', batch.length === 1, 'quedaron ' + batch.length);
}
{
  // Guard de la `023` (ADR-059). La fila escribe EXACTAMENTE estas 4 columnas: las otras 4 que
  // mandaba (url/seguidores/flag_viral/idioma) no las leía nadie y la migración las dropea. Si
  // alguien las devuelve acá, el insert entero se muere con PGRST204 — y `POST processed_items` es
  // `onError: continue`, así que la corrida cerraría EN VERDE sin memoria de dedup y la siguiente
  // re-traería y re-pagaría los mismos videos. Este test es lo que hace ruidoso ese fallo mudo.
  const batch = runPreparar({ videos: [pvid('a', { seguidores: 999, idioma_guess: 'en', viral_por_tamano: true })], runId: 'r-1' });
  const cols = Object.keys(batch[0]).sort().join(',');
  check('la fila del dedup lleva solo instance_id/run_id/platform/external_id (guard de la 023)',
    cols === 'external_id,instance_id,platform,run_id', cols);
}

seccion('Preparar procesados — solo se quema lo ENTREGADO al Feed (ADR-087)');
{
  // El arreglo entero, en un test. Medido el 2026-09-01: de 1.952 filas de processed_items, 1.401
  // (71,8%) eran de videos que NUNCA se le mostraron a nadie — los mataba el gate o el corte por N
  // después de haberlos pagado, y no volvían nunca. Ahora lo que no llega al Feed no se quema.
  const batch = runPreparar({ videos: [pvid('ok'), pvid('rechazado', { _entregado: false })], runId: 'r-1' });
  check('🔴 lo que NO se entregó al Feed NO se quema (vuelve la próxima corrida)', batch.length === 1 && batch[0].external_id === 'ok', JSON.stringify(batch.map((r) => r.external_id)));
}
{
  const batch = runPreparar({ videos: [pvid('a'), pvid('b')], runId: 'r-1' });
  check('y lo entregado se quema igual que siempre (el camino normal no cambió)', batch.length === 2, 'quedaron ' + batch.length);
}
{
  const batch = runPreparar({ videos: [pvid('x', { _entregado: false })], runId: 'r-1' });
  check('si NINGUNO se entregó, el batch va vacío y no rompe', batch.length === 0, JSON.stringify(batch));
}
{
  // El guard del cableado. Sin él, colgar este nodo del lugar equivocado deja al motor sin memoria
  // de dedup y la corrida siguiente re-trae y re-paga TODO, en verde. ADR-029 ya eligió abortar
  // ruidoso antes que re-pagar callado: es el mismo criterio de los dos guards de `Heat-score v1`.
  let msg = '';
  try { runPreparar({ videos: [{ external_id: 'z', plataforma: 'instagram' }], runId: 'r-1' }); }
  catch (e) { msg = e.message; }
  check('🔒 sin la bandera aborta ruidoso (mal cableado ⇒ corrida verde sin dedup)', msg.includes('_entregado'), msg || 'no tiró');
}
{
  const batch = runPreparar({ videos: [], runId: 'r-1' });
  check('pero una entrada VACÍA no es un cableado roto: batch vacío, sin abortar', batch.length === 0, JSON.stringify(batch));
}

// ════════════════════════════════════════════════════════════════════════════
// Preparar transcripciones — el libro del ASR (ADR-087). Lo que esta corrida le pagó a Supadata
// queda guardado para que NINGUNA corrida futura lo vuelva a pagar. Es la pieza que hace seguro
// dejar de quemar lo no entregado: sin ella, un rechazado del gate volvería y se re-transcribiría
// en cada corrida, para siempre.
// ════════════════════════════════════════════════════════════════════════════
const runPrepTx = (videos, iid = 'inst-42') => {
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { instance_id: iid } }) };
    if (n === 'Transcribir (Supadata)') return { all: () => videos.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const out = new Function('$', '$input', 'console', jsCode('Preparar transcripciones'))(
    $, { all: () => [] }, { log: () => {} });
  return out[0].json.filas;
};
const txvid = (id, extra = {}) => Object.assign(
  { external_id: id, plataforma: 'instagram', url: 'https://v/' + id,
    transcripcion: 'guion de ' + id, idioma_detectado: 'en',
    _tx_resuelta: true, _tx_origen: 'supadata' }, extra);

seccion('Preparar transcripciones — la caché de ASR (ADR-087)');
{
  const filas = runPrepTx([txvid('a')]);
  check('un video transcrito se guarda como listo, con su guion', filas.length === 1 && filas[0].estado === 'listo' && filas[0].script === 'guion de a', JSON.stringify(filas));
}
{
  const filas = runPrepTx([txvid('a')]);
  check('y va marcado origen=motor (sin eso inunda la pantalla del equipo)', filas[0].origen === 'motor', String(filas[0].origen));
}
{
  // Un mudo se guarda IGUAL, y ahí está medio ahorro: sin esta fila, cada corrida futura le paga a
  // Supadata para que vuelva a contestar que el video no tiene audio.
  const filas = runPrepTx([txvid('mudo', { transcripcion: '' })]);
  check('🟢 el mudo se guarda como sin_transcript (no se le vuelve a preguntar nunca)', filas.length === 1 && filas[0].estado === 'sin_transcript' && filas[0].script === null, JSON.stringify(filas));
}
{
  const filas = runPrepTx([txvid('cacheado', { _tx_origen: 'cache' })]);
  check('lo que YA vino de la caché no se re-escribe (tráfico al pedo)', filas.length === 0, JSON.stringify(filas));
}
{
  // Mismo criterio que ADR-084: un 429 o un presupuesto agotado NO son una respuesta. Cachear ese
  // vacío sería peor que no cachear: le clavaría "sin guion" al video para siempre.
  const filas = runPrepTx([txvid('ppto', { _tx_resuelta: false, transcripcion: '' })]);
  check('🔴 lo NO resuelto no se cachea (un 429 no es una respuesta)', filas.length === 0, JSON.stringify(filas));
}
{
  const filas = runPrepTx([txvid('a'), txvid('a'), txvid('b')]);
  check('el fan-out no duplica: una fila por video distinto', filas.length === 2, 'quedaron ' + filas.length);
}
{
  // `plataforma`, `external_id`, `url` e `instance_id` son NOT NULL y plataforma es un enum. Una
  // fila incompleta NO rebota sola: PostgREST manda el array en una transacción y se lleva puesto
  // el lote entero. Se filtra acá.
  const filas = runPrepTx([txvid('ok'), txvid('malo', { plataforma: '' }), txvid('malo2', { url: '' })]);
  check('🔒 filtra las filas incompletas en vez de perder el lote entero', filas.length === 1 && filas[0].external_id === 'ok', JSON.stringify(filas.map((f) => f.external_id)));
}
{
  const filas = runPrepTx([txvid('x', { plataforma: 'youtube' })]);
  check('🔒 y una plataforma fuera del enum tampoco pasa', filas.length === 0, JSON.stringify(filas));
}
{
  const filas = runPrepTx([]);
  check('sin nada que guardar devuelve un item vacío y no corta la cadena', Array.isArray(filas) && filas.length === 0, JSON.stringify(filas));
}

// ════════════════════════════════════════════════════════════════════════════
// Gate de relevancia — descarte duro de sin-guion (ADR-030): sin transcript = _descarte, sin gastar
// Haiku ni consumir N; el juicio de los con-guion sigue fail-open. (async, this.helpers.httpRequest)
// ════════════════════════════════════════════════════════════════════════════
const runGate = async ({ items = [], projects = {}, cfg = {}, haikuFalla = false, juicioFn, delayMs = 0 } = {}) => {
  const llamadas = [];
  let enVuelo = 0, maxEnVuelo = 0;
  const thisMock = { helpers: { httpRequest: async (opts) => {
    llamadas.push(opts);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    enVuelo--;
    if (haikuFalla) throw new Error('haiku caído (mock)');
    const usr = (((opts.body || {}).messages || [])[0] || {}).content || '';
    let ids = [];
    try { ids = JSON.parse(usr.slice(usr.indexOf('VIDEOS:\n') + 8)).map((v) => v.id); } catch (e) {}
    const juicio = ids.map((id) => (juicioFn ? juicioFn(id) : { id, relevante: true, score: 0.8, razon: 'ok' }));
    return { content: [{ text: JSON.stringify({ juicio }) }] };
  } } };
  const $ = (n) => {
    // ⚠️ Espeja el `Config` del workflow.json vivo. Decía 0.7 y allá dice 1 desde ADR-090; el mismo
    // drift que ya se pagó con `cap_top_n` (100 acá, 250 allá). Si allá cambia, acá también.
    if (n === 'Config') return { first: () => ({ json: Object.assign({ peso_relevancia: 1, min_relevancia: 0, cap_descartes: 10 }, cfg) }) };
    if (n === 'Armar plan de corrida') return { first: () => ({ json: { projects, ajustes: {} } }) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => items.map((j) => ({ json: j })) };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode('Gate de relevancia')).call(thisMock, $, $input, { log: (m) => logs.push(m) });
  return { out: out.map((i) => i.json), logs, llamadas, maxEnVuelo: () => maxEnVuelo };
};
const gvid = (id, pid = 'P1', extra = {}) => Object.assign({ external_id: id, proyecto_id: pid, heat_score: 0.5, descripcion: 'caption ' + id, script: 'guion de ' + id, username: 'ref' }, extra);

// Los mocks de arriba ESPEJAN el nodo `Config` a mano, y un espejo desincronizado miente en verde.
// Ya pasó con `cap_top_n` (100 acá, 250 allá) y el arreglo fue un comentario, que no verifica nada.
//
// 🔑 Lo que NO se verifica: que el mock valga lo mismo que producción. Un fixture difiere a
// propósito — `piso_referente` es 0 acá y 5 en el live justamente para probar el corte sin piso, y
// `cap_resultados_referente` es 50 para que el clamp muerda. Exigir igualdad daría falsas alarmas y
// empujaría a alinear fixtures con prod, que es al revés de lo que sirve.
// Lo que SÍ es invariante: que la clave EXISTA (un mock de un knob renombrado prueba nada), y que
// el valor de los knobs cuyo default es una DECISIÓN esté donde la decisión dice.
seccion('Los mocks de Config apuntan a knobs que existen, y los defaults decididos están puestos');
{
  const cfgVivo = {};
  for (const a of (w.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments || [])) cfgVivo[a.name] = a.value;
  // Solo los que ESPEJAN Config. `min_relevancia` y `cap_descartes` no viven ahí: llegan por
  // `plan.ajustes` (knobs del cockpit) y el gate cae a `|| 0` / `|| 10`. Que el único veto que dejó
  // ADR-088 no tenga default en Config es correcto — su default es "no vetar".
  const mockeadas = [...Object.keys(CFG_PLAN), ...Object.keys(CFG_CAND), 'peso_relevancia'];
  const fantasmas = mockeadas.filter((k) => !(k in cfgVivo));
  check('cada knob mockeado existe en el Config real', fantasmas.length === 0, 'no están en Config: ' + fantasmas.join(', '));
  // ADR-090: el 30% métrico no rankea videos y ni siquiera alcanza para desempatar (paso 0,01 de
  // relevancia exigiría peso > 0,990). Si esto vuelve a 0,7 sin ADR, el orden vuelve a la moneda.
  check('ADR-090: peso_relevancia = 1 en el Config que corre', Number(cfgVivo.peso_relevancia) === 1, String(cfgVivo.peso_relevancia));
}

seccion('ADR-090 — la métrica no rankea: el composite es relevancia pura, salvo sin juicio');
await (async () => {
  {
    // El caso que decide: dos videos con relevancia DISTINTA por el paso mínimo medido (0,01) y
    // métricas invertidas. Con peso 0,7 el percentil métrico daba vuelta el orden; con 1 no puede.
    const items = [gvid('bajo-rel-alta-metrica', 'P1', { heat_score: 0.99 }), gvid('alta-rel-baja-metrica', 'P1', { heat_score: 0.01 })];
    const { out } = await runGate({
      items, projects: { P1: { nombre: 'P1', criterios: 'x' } },
      juicioFn: (id) => ({ id, relevante: true, score: id === 'alta-rel-baja-metrica' ? 0.81 : 0.80, razon: 'r' }),
    });
    const k = out.filter((o) => !o._descarte).sort((a, b) => b.heat_score - a.heat_score);
    check('un 0,01 más de relevancia le gana a TODO el percentil métrico (era al revés con 0,7)',
      k[0].external_id === 'alta-rel-baja-metrica', JSON.stringify(k.map((o) => [o.external_id, o.heat_score])));
    check('y el heat_score ES la relevancia, sin diluir', k[0].heat_score === 0.81 && k[1].heat_score === 0.8,
      JSON.stringify(k.map((o) => o.heat_score)));
  }
  {
    // La única parte donde la métrica sigue mandando, y es correcta: sin juicio no hay relevancia.
    const { out } = await runGate({
      items: [gvid('sin-juicio', 'P1', { heat_score: 0.42 })],
      projects: { P1: { nombre: 'P1', criterios: 'x' } }, haikuFalla: true,
    });
    const k = out.find((o) => o.external_id === 'sin-juicio');
    check('lo que se quedó sin juicio sigue ordenando por su percentil métrico (fail-open, ADR-044)',
      k && k.relevancia_score === null && k.heat_score === 1, JSON.stringify([k && k.relevancia_score, k && k.heat_score]));
  }
  {
    // El knob sigue siendo knob: el cockpit lo puede bajar sin deploy si esto sale mal.
    const items = [gvid('m1', 'P1', { heat_score: 0.99 }), gvid('m2', 'P1', { heat_score: 0.01 })];
    const { out } = await runGate({
      items, projects: { P1: { nombre: 'P1', criterios: 'x' } }, cfg: { peso_relevancia: 0.7 },
      juicioFn: (id) => ({ id, relevante: true, score: id === 'm2' ? 0.81 : 0.80, razon: 'r' }),
    });
    const k = out.filter((o) => !o._descarte).sort((a, b) => b.heat_score - a.heat_score);
    check('bajando el knob a 0,7 vuelve el comportamiento viejo (la métrica da vuelta el orden)',
      k[0].external_id === 'm1', JSON.stringify(k.map((o) => [o.external_id, o.heat_score])));
  }
})();

seccion('Gate de relevancia — descarte duro de sin-guion (ADR-030)');
await (async () => {
  {
    const { out, llamadas } = await runGate({ items: [gvid('a', 'P1', { script: '' })], projects: { P1: { nombre: 'P1', criterios: 'trading' } } });
    const d = out.find((o) => o.external_id === 'a');
    check('item sin guion sale _descarte con razón sin_guion', !!d && d._descarte === true && d.descarte_razon === 'sin_guion', JSON.stringify(d));
    check('y NO gasta una llamada a Haiku por él', llamadas.length === 0, llamadas.length + ' llamadas');
  }
  {
    const { out, llamadas } = await runGate({ items: [gvid('b')], projects: { P1: { nombre: 'P1', criterios: 'trading' } } });
    check('item con guion se juzga (Haiku llamado)', llamadas.length === 1, llamadas.length + ' llamadas');
    check('y pasa si el juicio es relevante (no _descarte)', out.some((o) => o.external_id === 'b' && !o._descarte), JSON.stringify(out.map((o) => [o.external_id, !!o._descarte])));
  }
  {
    const { out } = await runGate({ items: [gvid('c')], projects: { P1: { nombre: 'P1', criterios: 'trading' } }, haikuFalla: true });
    const d = out.find((o) => o.external_id === 'c' && !o._descarte);
    check('Haiku caído: el con-guion pasa igual, sin score (fail-open del juicio intacto)', !!d && d.relevancia_score == null, JSON.stringify(d && d.relevancia_score));
  }
  {
    const { out, llamadas } = await runGate({ items: [gvid('d'), gvid('e')], projects: { P1: { nombre: 'P1' } } }); // sin criterios
    check('sin criterios: pasa todo sin llamar a Haiku', llamadas.length === 0 && out.filter((o) => !o._descarte).length === 2, `llamadas=${llamadas.length} pasaron=${out.filter((o) => !o._descarte).length}`);
  }
  {
    // mezcla: un sin-guion + un con-guion; el sin-guion no cuenta como borderline de auditoría
    const { out } = await runGate({ items: [gvid('f', 'P1', { script: '' }), gvid('g')], projects: { P1: { nombre: 'P1', criterios: 'trading' } }, juicioFn: (id) => ({ id, relevante: false, score: 0.9, razon: 'no' }) });
    const sinG = out.find((o) => o.external_id === 'f');
    const bordG = out.find((o) => o.external_id === 'g' && o._descarte);
    check('el sin-guion se marca por sin_guion, no por el gate', sinG && sinG.descarte_razon === 'sin_guion', JSON.stringify(sinG));
    // ADR-088: el con-guion rechazado por Haiku YA NO es un descarte — entra al Feed marcado.
    check('🟢 el con-guion rechazado ya NO se descarta (ADR-088)', !bordG, JSON.stringify(bordG && bordG.descarte_razon));
  }
  // ── ADR-088: EL GATE ORDENA, NO VETA ──
  // El gate corre después de pagar la transcripción, así que vetar no ahorra nada: solo achica la
  // entrega. Medido sobre 12 corridas: 417 → 649 videos (+56%) entregando los top-N en vez de vetar.
  {
    const { out } = await runGate({
      items: [gvid('r1'), gvid('r2')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      juicioFn: (id) => ({ id, relevante: false, score: 0.2, razon: 'off-topic' }),
    });
    const vivos = out.filter((o) => !o._descarte);
    check('🟢 Haiku dice que NO a todo y los dos entran igual al Feed', vivos.length === 2, 'entraron ' + vivos.length);
  }
  {
    const { out } = await runGate({
      items: [gvid('b1')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      juicioFn: (id) => ({ id, relevante: false, score: 0.2, razon: 'off-topic' }),
    });
    check('y viaja marcado _bajo_umbral (es LA métrica que decide si el veto servía)', out[0]._bajo_umbral === true, String(out[0]._bajo_umbral));
  }
  {
    const { out } = await runGate({
      items: [gvid('ok1')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      juicioFn: (id) => ({ id, relevante: true, score: 0.9, razon: 'sí' }),
    });
    check('un aprobado NO se marca bajo umbral', out[0]._bajo_umbral === false, String(out[0]._bajo_umbral));
  }
  {
    // El score sigue mandando en el ORDEN: es lo único que hace el gate ahora.
    const { out } = await runGate({
      items: [gvid('lo'), gvid('hi')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      juicioFn: (id) => ({ id, relevante: id === 'hi', score: id === 'hi' ? 0.95 : 0.1, razon: '' }),
    });
    const hi = out.find((o) => o.external_id === 'hi'), lo = out.find((o) => o.external_id === 'lo');
    check('el score sigue ordenando: el bueno queda arriba del dudoso', hi.heat_score > lo.heat_score, `hi=${hi.heat_score} lo=${lo.heat_score}`);
  }
  {
    // 🔧 `Relevancia mínima` deja de ser un knob inerte: pasa a ser el ÚNICO veto, y por eso ahora
    // su nombre dice la verdad. Es la válvula de escape si el Feed queda muy ruidoso.
    const { out } = await runGate({
      items: [gvid('bajo'), gvid('alto')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      cfg: { min_relevancia: 0.5 },
      juicioFn: (id) => ({ id, relevante: true, score: id === 'alto' ? 0.9 : 0.1, razon: '' }),
    });
    const vivos = out.filter((o) => !o._descarte).map((o) => o.external_id);
    check('🔧 `Relevancia mínima` YA NO es inerte: en 0.5 sí veta al de score 0.1', vivos.length === 1 && vivos[0] === 'alto', JSON.stringify(vivos));
  }
  {
    const { out } = await runGate({
      items: [gvid('z')], projects: { P1: { nombre: 'P1', criterios: 'trading' } },
      cfg: { min_relevancia: 0 },
      juicioFn: (id) => ({ id, relevante: false, score: 0, razon: '' }),
    });
    check('🔒 y en 0 (el default) no veta ni al peor: el default es NO vetar', out.filter((o) => !o._descarte).length === 1, JSON.stringify(out.map((o) => o._descarte)));
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// Gate de relevancia — pool + presupuesto (el nodo más lento de la corrida)
// ════════════════════════════════════════════════════════════════════════════
// Era el último caro que quedaba SERIAL: chunks de 25 uno atrás del otro con `sleep(1000)` entre
// medio. Medido en la ejecución 150 (31/08) fue el nodo MÁS LENTO de todos —492.7s sobre 26 chunks,
// más que Apify (456.8s) y el doble que Transcribir (239.0s)—, así que a ~1.8x del volumen de hoy el
// watchdog del task runner (900s) mata el nodo y la corrida no entrega NADA después de haber pagado
// Apify, Supadata y las traducciones. El mismo modo de falla que Traducir tenía antes del cierre 31.
seccion('Gate — pool + presupuesto (a 1.8x del volumen de hoy, el serial moría)');
await (async () => {
  const muchos = (n, pid = 'P1') => { const a = []; for (let i = 0; i < n; i++) a.push(gvid(pid + '-v' + i, pid)); return a; };
  const P1 = { P1: { nombre: 'P1', criterios: 'trading' } };
  {
    // 200 videos = 8 chunks de 25. Serial serían 8 llamadas en fila; con el pool van todas juntas.
    const { llamadas, maxEnVuelo } = await runGate({ items: muchos(200), projects: P1, delayMs: 15 });
    check('los chunks van EN PARALELO (antes: 1, serial con sleep de 1s)', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
    check('y se sigue mandando un chunk por cada 25 videos', llamadas.length === 8, llamadas.length + ' llamadas');
  }
  {
    // El pool es CROSS-PROYECTO: un proyecto con 1 chunk no puede dejar 7 workers parados mientras
    // el de al lado tiene 7. Con la versión por-proyecto el máximo en vuelo habría sido 1.
    const items = muchos(25, 'P1').concat(muchos(175, 'P2'));
    const projects = { P1: { nombre: 'P1', criterios: 'trading' }, P2: { nombre: 'P2', criterios: 'psico' } };
    const { maxEnVuelo, llamadas } = await runGate({ items, projects, delayMs: 15 });
    check('el pool cruza proyectos (1 chunk + 7 chunks corren juntos)', maxEnVuelo() === 8, 'max en vuelo = ' + maxEnVuelo());
    check('y cada chunk se juzga con la rúbrica de SU proyecto', llamadas.some((l) => l.body.messages[0].content.includes('TEMA: P1')) && llamadas.some((l) => l.body.messages[0].content.includes('TEMA: P2')), 'faltó una de las dos rúbricas');
  }
  {
    const { llamadas, maxEnVuelo } = await runGate({ items: muchos(100), projects: P1, cfg: { concurrencia_gate: 2 }, delayMs: 15 });
    check('la concurrencia sale de Config (se tunea sin re-importar)', maxEnVuelo() === 2, 'max en vuelo = ' + maxEnVuelo());
    check('y no cambia cuántos chunks se mandan, solo cuándo', llamadas.length === 4, llamadas.length + ' llamadas');
  }
  {
    // El presupuesto acá DEGRADA, no pierde: el chunk que no corre deja a sus videos sin juicio y
    // pasan igual, ordenados por prescore métrico. Lo que no puede pasar es que sea invisible.
    const { out, llamadas, logs } = await runGate({ items: muchos(500), projects: P1, cfg: { presupuesto_gate_s: 0.04, concurrencia_gate: 2 }, delayMs: 25 });
    check('el presupuesto corta: no se mandan los 20 chunks', llamadas.length < 20, llamadas.length + ' llamadas de 20');
    const sinPpto = out.filter((o) => o._gate_sin_presupuesto === true);
    check('🔴 los que quedaron sin juzgar PASAN igual (fail-open, no se pierden)', sinPpto.length > 0 && sinPpto.every((o) => !o._descarte), sinPpto.length + ' marcados');
    check('y quedan marcados para que el Resumen lo pueda avisar', sinPpto.every((o) => o.relevancia_score == null), 'alguno salió con score');
    check('el nodo lo grita en el log', logs.some((l) => l.includes('PRESUPUESTO agotado')), JSON.stringify(logs.slice(-2)));
  }
  {
    const { out } = await runGate({ items: muchos(50), projects: P1 });
    check('sin presupuesto configurado nadie queda marcado (0 = sin techo)', out.filter((o) => o._gate_sin_presupuesto === true).length === 0, 'hay marcados de más');
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// Preparar candidatos / Preparar descartes — de quién es cada fila (Fase 4, ADR-048)
// ════════════════════════════════════════════════════════════════════════════
// Estos dos nodos escriben las tablas del cockpit, y la Fase 4 les tocó lo mismo a los dos: la
// instancia entra en cada fila y el mapa `uuidDe` se fue con `fields.uuid`. Los dos cambios fallan
// callados si salen mal — una fila sin `instance_id` cae en el tenant del default puente (o sea la
// empresa equivocada) y un `proyecto_id` perdido manda todo al grupo `(sin proyecto)` del feed.
// Ninguno tira error: entregan, en verde, mal.
const IID = 'inst-42';
const RUN_ID = 'run-7';
// `run` es lo que devolvió `Abrir run en el registro`. El default trae el id; el caso interesante es
// pasarle `{}`, que es lo que deja un registro caído — ese nodo es SUMIDERO (invariante #1).
// 🔑 Desde ADR-087 este nodo lee `$('Armar candidato')` por NOMBRE y ya no `$input`: le metieron
// `Preparar procesados` → `POST processed_items` delante, así que su entrada directa pasó a ser la
// respuesta del POST. El mock refleja eso — `$input` va vacío a propósito, para que el test falle
// si alguien vuelve a leer la entrada directa.
const runPrepCandidatos = (videos, run = { id: RUN_ID }) => {
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { instance_id: IID } }) };
    if (n === 'Abrir run en el registro') return { first: () => ({ json: run }) };
    if (n === 'Armar candidato') return { all: () => videos.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const $input = { all: () => [] };
  const out = new Function('$', '$input', 'console', jsCode('Preparar candidatos'))($, $input, { log: () => {} });
  return out.length ? out[0].json.filas : [];
};
const cvid = (id, extra = {}) => Object.assign({ external_id: id, titulo: 't' + id, script: 'g', proyecto_id: 'P1', voz_id: 'V1' }, extra);

seccion('Armar candidato — el título se corta sin partir un emoji (ejecución 136)');
{
  // 🩸 REGRESIÓN de una corrida real que costó 33 minutos, 814 transcripciones y 814 traducciones.
  // `.slice(0, 80)` corta por code units UTF-16: si el carácter 80 es la primera mitad de un emoji,
  // queda un surrogate suelto. Eso NO es UTF-8 válido, así que PostgREST contesta
  // 400 `Empty or invalid json` y **la corrida entera muere después de haber pagado todo**
  // (`POST processed_items` ya corrió, así que los videos quedan quemados y no vuelven).
  //
  // El caso se construye igual que el que explotó: relleno hasta que el emoji quede justo en el borde.
  const relleno = 'a'.repeat(79);
  const conEmoji = relleno + '😀' + ' cola que se descarta';
  const { out } = await runCorte([vid('e1', 'p1', 0.9, { descripcion: conEmoji })], { projects: { p1: { n: 10 } } });
  const t = out[0].titulo;

  // ⚠️ Se recorre por CODE UNITS y no con `[...t]`: el spread itera puntos de código, así que un
  // emoji **entero** sale como un solo carácter cuyo `charCodeAt(0)` ya es su surrogate alto — y un
  // chequeo ingenuo marcaría como roto un emoji sano. Lo que importa es si el par está DESAPAREADO.
  let sueltos = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { // alto: tiene que venir un bajo detrás
      const sig = t.charCodeAt(i + 1);
      if (!(sig >= 0xdc00 && sig <= 0xdfff)) sueltos++; else i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) sueltos++; // bajo sin alto adelante
  }
  check('el título no deja surrogates sueltos', sueltos === 0,
    'quedó ' + JSON.stringify(t.slice(-6)) + ' — es lo que rompió la ejecución 136');

  // La prueba que de verdad importa: que se pueda serializar y mandar. `Buffer.from` explota con un
  // surrogate suelto igual que explota PostgREST, así que reproduce el fallo real y no una proxy.
  let serializa = true;
  try { Buffer.from(JSON.stringify(out[0]), 'utf8'); } catch { serializa = false; }
  check('la fila entera serializa a UTF-8', serializa, 'JSON.stringify + Buffer.from falló, que es exactamente el 400 de PostgREST');

  check('sigue cortando (no se pasa del tope)', [...t].length <= 80, 'largo ' + [...t].length);

  // Y que el corte no se haya vuelto tonto: un título sin emoji tiene que seguir midiendo 80.
  const { out: out2 } = await runCorte([vid('e2', 'p1', 0.9, { descripcion: 'b'.repeat(200) })], { projects: { p1: { n: 10 } } });
  check('un título largo sin emoji sigue cortando en 80', [...out2[0].titulo].length === 80, 'midió ' + [...out2[0].titulo].length);
}

seccion('Preparar candidatos — la instancia viaja en cada fila (ADR-048)');
{
  const filas = runPrepCandidatos([cvid('a'), cvid('b')]);
  check('cada candidato lleva su instance_id', filas.length === 2 && filas.every((f) => f.instance_id === IID), JSON.stringify(filas.map((f) => f.instance_id)));
  check('proyecto_id y voz_id sobreviven a la muerte de uuidDe (eran identidad)', filas[0].proyecto_id === 'P1' && filas[0].voz_id === 'V1', JSON.stringify([filas[0].proyecto_id, filas[0].voz_id]));
}
{
  // El caso que antes resolvía `uuidDe[...] || null`: un video sin proyecto asignado sigue viajando
  // sin él, no con un string vacío que la FK rechace.
  const filas = runPrepCandidatos([cvid('c', { proyecto_id: '', voz_id: undefined })]);
  check('sin proyecto resoluble la fila va con null, no con "" (la FK lo rechazaría)', filas[0].proyecto_id === null && filas[0].voz_id === null, JSON.stringify([filas[0].proyecto_id, filas[0].voz_id]));
}

seccion('Preparar candidatos — la corrida de origen viaja en cada fila (ADR-081)');
{
  const filas = runPrepCandidatos([cvid('r1'), cvid('r2')]);
  check('cada candidato lleva su run_id', filas.length === 2 && filas.every((f) => f.run_id === RUN_ID), JSON.stringify(filas.map((f) => f.run_id)));

  // 🔴 El caso que decide si esto respeta el invariante #1: `Abrir run en el registro` es sumidero,
  // así que puede devolver un error en vez de la fila. La corrida TIENE que entregar igual, con el
  // candidato sin corrida — nunca reventar acá y perder la entrega ya pagada.
  const sinRun = runPrepCandidatos([cvid('r3')], {});
  check('con el registro caído la fila sale igual, con run_id null', sinRun.length === 1 && sinRun[0].run_id === null, JSON.stringify(sinRun[0] && sinRun[0].run_id));

  // Y que el `|| null` no deje pasar un string vacío, que la FK rechazaría con 23503 y tumbaría el
  // POST entero — o sea toda la entrega, no una fila.
  const vacio = runPrepCandidatos([cvid('r4')], { id: '' });
  check('un id vacío viaja como null, no como "" (la FK lo rechazaría)', vacio[0].run_id === null, JSON.stringify(vacio[0].run_id));
}

seccion('Armar candidato — la huella de contenido y la duración (ADR-086)');
{
  // 🩸 Dani, 2026-09-01: *"me están apareciendo en el feed videos que ya había calificado y que
  // grabamos ayer"*. Tenía razón: el dedup compara el pk del POST, y una re-subida del mismo reel
  // trae un pk nuevo. Estos dos campos son lo único con lo que se puede reconocer el contenido, y
  // hasta hoy `Armar candidato` los tiraba — es el único nodo de la cadena que reconstruye el
  // objeto desde cero.
  const { out } = await runCorte(
    [vid('h1', 'P1', 0.9, { transcripcion: 'Hola, ¿cómo estás?  Muy bien.', duracion_video: 47.8 })],
    { top_n: 100, projects: { P1: { nombre: 'P1', n: 5 } } },
  );
  check('la duración de Apify por fin llega a la fila', out[0].duracion_seg === 47.8, String(out[0].duracion_seg));
  check('la huella normaliza (minúsculas, sin acentos ni puntuación, espacios colapsados)', out[0].huella_guion === 'hola como estas muy bien', JSON.stringify(out[0].huella_guion));

  // 🔑 EL check que decide si esto sirve: la huella sale del transcript ORIGINAL de Supadata, no
  // del `script` que ya pasó por Haiku. Haiku traduce el MISMO audio distinto cada vez ("cuando
  // llega el estrés" / "cuando golpea el estrés"), y por eso el hash del traducido caza 1 de 17
  // pares. Si alguien cambia `d.transcripcion` por `d.script`, esto se rompe acá y no en producción
  // tres semanas después.
  const a = await runCorte([vid('h2', 'P1', 0.9, { transcripcion: 'same audio here', script: 'cuando llega el estres' })], { top_n: 100, projects: { P1: { n: 5 } } });
  const b = await runCorte([vid('h3', 'P1', 0.9, { transcripcion: 'same audio here', script: 'cuando golpea el estres' })], { top_n: 100, projects: { P1: { n: 5 } } });
  check('dos traducciones distintas del mismo audio dan LA MISMA huella', a.out[0].huella_guion === b.out[0].huella_guion && a.out[0].huella_guion === 'same audio here', `${a.out[0].huella_guion} | ${b.out[0].huella_guion}`);
}
{
  // Los dos son datos de MEDICIÓN, así que su ausencia viaja como null y no como '' ni 0: una
  // huella '' haría match con cualquier otra huella vacía y el aviso marcaría videos al azar.
  const { out } = await runCorte([vid('h4', 'P1', 0.9)], { top_n: 100, projects: { P1: { n: 5 } } });
  check('sin transcripción la huella va null, no "" (una huella vacía matchea con cualquiera)', out[0].huella_guion === null, JSON.stringify(out[0].huella_guion));
  check('sin duración va null, no 0 (0 sería una duración que colisiona con todo)', out[0].duracion_seg === null, JSON.stringify(out[0].duracion_seg));
}
{
  const { out } = await runCorte([vid('h5', 'P1', 0.9, { transcripcion: 'x'.repeat(500) })], { top_n: 100, projects: { P1: { n: 5 } } });
  check('la huella se corta a 200: es una llave, no una copia del guion', out[0].huella_guion.length === 200, String(out[0].huella_guion.length));
}

seccion('Preparar candidatos — los dos datos de medición llegan a la fila (ADR-086)');
{
  const filas = runPrepCandidatos([cvid('m1', { duracion_seg: 47.8, huella_guion: 'hola como estas' })]);
  check('la huella y la duración viajan a PostgREST', filas[0].huella_guion === 'hola como estas' && filas[0].duracion_seg === 47.8, JSON.stringify([filas[0].huella_guion, filas[0].duracion_seg]));
}
{
  // Sin ellos la fila sale igual: son datos para medir, no pueden tumbar una entrega ya pagada
  // (invariante #1 de PLAN §2.5). Misma forma que `run_id`.
  const filas = runPrepCandidatos([cvid('m2')]);
  check('sin ellos la fila sale igual, con null (no tumban la entrega)', filas.length === 1 && filas[0].huella_guion === null && filas[0].duracion_seg === null, JSON.stringify([filas[0].huella_guion, filas[0].duracion_seg]));
}

seccion('Preparar descartes — misma regla, misma instancia');
{
  const items = [
    { external_id: 'd1', _descarte: true, descarte_razon: 'no_relevante', proyecto_id: 'P1', username: 'ref', script: 'g' },
    { external_id: 'd2', _descarte: true, descarte_razon: 'sin_guion', proyecto_id: 'P1', username: 'ref' },
  ];
  const $ = (n) => {
    if (n === 'Config') return { first: () => ({ json: { instance_id: IID } }) };
    if (n === 'Gate de relevancia') return { all: () => items.map((j) => ({ json: j })) };
    throw new Error('nodo no mockeado: ' + n);
  };
  const out = new Function('$', 'console', jsCode('Preparar descartes'))($, { log: () => {} });
  const filas = out.length ? out[0].json.filas : [];
  check('el descarte auditable lleva su instance_id', filas.length === 1 && filas[0].instance_id === IID, JSON.stringify(filas));
  check('sin_guion sigue sin subir (ADR-030 intacto)', filas.length === 1, 'subieron ' + filas.length);
}
{
  // ADR-087. Hasta hoy un descarte no se podía volver a encontrar: `rescatar-huerfanos.mjs` tenía
  // que decodificar el shortcode de Instagram desde `url_referente` para reconstruirlo. Todo video
  // en la herramienta se identifica por (plataforma, external_id) — ésta era la única superficie
  // que no lo hacía.
  const corr = (items) => {
    const $ = (n) => {
      if (n === 'Config') return { first: () => ({ json: { instance_id: IID } }) };
      if (n === 'Gate de relevancia') return { all: () => items.map((j) => ({ json: j })) };
      throw new Error('nodo no mockeado: ' + n);
    };
    const out = new Function('$', 'console', jsCode('Preparar descartes'))($, { log: () => {} });
    return out.length ? out[0].json.filas : [];
  };
  const base = { _descarte: true, descarte_razon: 'no_relevante', proyecto_id: 'P1', username: 'ref', script: 'g' };
  const conId = corr([Object.assign({}, base, { external_id: 'EXT-1' })]);
  check('el descarte viaja con su external_id (ya no hay que decodificar la URL)', conId[0].external_id === 'EXT-1', JSON.stringify(conId[0].external_id));
  const sinId = corr([Object.assign({}, base)]);
  check('y sin él la fila sale igual, con null (no tumba el POST del lote)', sinId[0].external_id === null, JSON.stringify(sinId[0].external_id));
}

console.log(fail ? `\n${fail} test(s) en rojo` : '\nTodo en verde');
process.exit(fail ? 1 : 0);
