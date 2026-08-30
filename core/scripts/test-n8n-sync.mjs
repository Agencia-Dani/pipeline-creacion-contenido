// Test end-to-end de n8n-sync (ADR-053) contra una COPIA desechable del dispatcher.
//
//   node test-n8n-sync.mjs
//
// ⚠️ ESTE TEST ESCRIBE EN LA INSTANCIA DE n8n. Crea un workflow llamado
// "ZZ TEST n8n-sync — copia dispatcher (borrar)", INACTIVO (no tiene cron ni webhook
// registrado, no se dispara solo, no gasta un peso), lo usa de banco de pruebas y lo borra en el
// `finally` verificando el 404. Los workflows de producción NO se tocan: el alias `dispatcher`
// se reapunta a la copia con una env var, que gana sobre el .env (verificado).
//
// Lo que cubre, que es exactamente lo que no puede romperse sin que nos enteremos:
//   · dry-run por defecto (push sin --apply no escribe)
//   · el push deja el nodo igual al repo y no toca los demás
//   · los placeholders salen resueltos, nunca literales
//   · `settings` mergea: timezone y errorWorkflow sobreviven a un push
//   · restore vuelve atrás desde el snapshot
//   · FAIL-CLOSED: si un placeholder no se puede aprender, aborta sin escribir
//   · TOPOLOGÍA (ADR-053 §Enmienda): crea un nodo, lo cablea con las conexiones del repo, borra el
//     que sobra, y se NIEGA sin --nodos, sin --borrar, o si dejaría un nodo inalcanzable
//   · el "hecho cuando" de §14.2: el mismo push sobre un workflow ACTIVO (copia del error handler,
//     cuyo errorTrigger no lo apunta nadie, así que activarla es inerte)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.loadEnvFile(path.join(RAIZ, '.env'));
const { N8N_BASE_URL: BASE, N8N_API_KEY: KEY, N8N_WF_DISPATCHER: REAL } = process.env;

const api = async (m, p, b) => {
  const r = await fetch(`${BASE}/api/v1${p}`, {
    method: m, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })(), text: t };
};

const sync = (args, env = {}) => {
  try {
    return execFileSync('node', ['n8n-sync.mjs', ...args], {
      cwd: path.join(RAIZ, 'core/scripts'), encoding: 'utf8',
      env: { ...process.env, ...env, FORCE_COLOR: '0' },
    });
  } catch (e) { return (e.stdout || '') + (e.stderr || ''); }
};

const limpio = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'} ${nombre}\x1b[0m${detalle && !cond ? `\n      ${detalle}` : ''}`);
  cond ? ok++ : fail++;
};

let copiaId = null;
let copiaActivaId = null;
try {
  const real = (await api('GET', `/workflows/${REAL}`)).json;

  // La copia arranca con el nodo "Resumen" ROTO, para que push tenga algo real que arreglar.
  const nodos = real.nodes.map((n) =>
    n.name === 'Resumen' ? { ...n, parameters: { ...n.parameters, jsCode: '// ROTO POR EL TEST\nreturn [];' } } : n);
  const campos = ['id', 'name', 'type', 'typeVersion', 'position', 'parameters', 'credentials', 'webhookId',
    'disabled', 'notes', 'notesInFlow', 'executeOnce', 'alwaysOutputData', 'retryOnFail', 'maxTries',
    'waitBetweenTries', 'continueOnFail', 'onError'];
  const creado = await api('POST', '/workflows', {
    name: 'ZZ TEST n8n-sync — copia dispatcher (borrar)',
    nodes: nodos.map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => campos.includes(k)))),
    connections: real.connections,
    settings: { executionOrder: 'v1' },
  });
  copiaId = creado.json?.id;
  if (!copiaId) { console.log('no se pudo crear la copia:', creado.text.slice(0, 300)); process.exit(1); }
  console.log(`copia creada: ${copiaId} (inactiva)\n`);
  const E = { N8N_WF_DISPATCHER: copiaId };
  const leer = async () => (await api('GET', `/workflows/${copiaId}`)).json;

  console.log('▸ diff detecta el nodo roto');
  const d = limpio(sync(['diff', 'dispatcher'], E));
  check('reporta drift en "Resumen"', /\[drift\].*Resumen/.test(d), d.slice(0, 400));

  console.log('\n▸ push es dry-run por defecto');
  const dry = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen'], E));
  check('dice dry-run', /dry-run/.test(dry));
  const trasDry = await leer();
  check('NO escribió nada', trasDry.nodes.find((n) => n.name === 'Resumen').parameters.jsCode.includes('ROTO'));

  console.log('\n▸ push --apply');
  const ap = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen', '--apply'], E));
  const tras = await leer();
  const repo = JSON.parse((await import('node:fs')).readFileSync(
    path.join(RAIZ, 'Workflows/workflow-dispatcher/workflow.json'), 'utf8'));
  check('aplicó y verificó', /✓ aplicado/.test(ap), ap.slice(-500));
  check('el jsCode quedó igual al del repo',
    tras.nodes.find((n) => n.name === 'Resumen').parameters.jsCode ===
    repo.nodes.find((n) => n.name === 'Resumen').parameters.jsCode);
  check('guardó snapshot de rollback', /\.n8n-snapshots/.test(ap));
  check('no tocó los otros nodos', tras.nodes.length === real.nodes.length);

  console.log('\n▸ los placeholders se resolvieron con valores reales, no literales');
  const cfg = JSON.stringify(tras.nodes.find((n) => n.name === 'Config').parameters);
  check('Config no quedó con <<PLACEHOLDER>>', !/<<[A-Z_]+>>/.test(cfg));
  const cfgPush = limpio(sync(['push', 'dispatcher', '--nodos', 'Config', '--apply'], E));
  const cfg2 = JSON.stringify((await leer()).nodes.find((n) => n.name === 'Config').parameters);
  check('empujar Config resuelve los 3 placeholders (no escribe literales)', !/<<[A-Z_]+>>/.test(cfg2), cfgPush.slice(-400));
  check('la URL del webhook del motor quedó resuelta', cfg2.includes('/webhook/'));

  console.log('\n▸ settings: lo que no mandamos sobrevive');
  await api('PUT', `/workflows/${copiaId}`, {
    name: tras.name, nodes: tras.nodes, connections: tras.connections,
    settings: { executionOrder: 'v1', timezone: 'America/Bogota', errorWorkflow: 'zU8UUzY1P83VRtj0' },
  });
  sync(['push', 'dispatcher', '--nodos', 'Resumen', '--apply'], E);
  const s = (await leer()).settings;
  check('timezone sobrevive al push', s.timezone === 'America/Bogota', JSON.stringify(s));
  check('errorWorkflow sobrevive al push', s.errorWorkflow === 'zU8UUzY1P83VRtj0', JSON.stringify(s));

  console.log('\n▸ restore');
  const snapDir = path.join(RAIZ, '.n8n-snapshots');
  const fs = await import('node:fs');
  const snaps = fs.readdirSync(snapDir).filter((f) => f.startsWith('dispatcher-')).sort();
  const primero = path.join('.n8n-snapshots', snaps[0]);
  const rs = limpio(sync(['restore', 'dispatcher', primero, '--apply'], E));
  const restaurado = await leer();
  check('restore vuelve al estado roto del snapshot',
    restaurado.nodes.find((n) => n.name === 'Resumen').parameters.jsCode.includes('ROTO'), rs.slice(-300));

  console.log('\n▸ TOPOLOGÍA (ADR-053 §Enmienda) — la copia arranca SIN "Resumen" y con un huérfano');
  // Se rearma la copia: se le saca el nodo final del repo (para que el push tenga que CREARLO) y se
  // le agrega uno que el repo no tiene, colgado de "Disparar por instancia" (para que el push tenga
  // que BORRARLO y para que "Disparar por instancia" pierda cableado de salida).
  const base = await leer();
  const sinResumen = base.nodes.filter((n) => n.name !== 'Resumen');
  const intruso = { name: 'ZZ Intruso', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [2000, 400], parameters: {} };
  const connsRotas = { ...base.connections, 'Disparar por instancia': { main: [[{ node: 'ZZ Intruso', type: 'main', index: 0 }]] } };
  await api('PUT', `/workflows/${copiaId}`, {
    name: base.name, nodes: [...sinResumen, intruso], connections: connsRotas, settings: { executionOrder: 'v1' },
  });

  const sinFlags = limpio(sync(['push', 'dispatcher', '--apply'], E));
  check('sin --nodos se niega y nombra lo que crearía', /--nodos/.test(sinFlags) && /Resumen/.test(sinFlags), sinFlags.slice(-400));
  check('y NO escribió', (await leer()).nodes.some((n) => n.name === 'ZZ Intruso'));

  const sinBorrar = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen', '--apply'], E));
  check('sin --borrar se niega y nombra lo que desaparece', /ZZ Intruso/.test(sinBorrar) && /--borrar/.test(sinBorrar), sinBorrar.slice(-400));
  check('y nombra el ORIGEN que pierde cableado', /Disparar por instancia/.test(sinBorrar), sinBorrar.slice(-400));
  check('sigue sin escribir', (await leer()).nodes.some((n) => n.name === 'ZZ Intruso'));

  const deMas = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen', '--borrar', 'ZZ Intruso,Disparar por instancia,Config', '--apply'], E));
  check('--borrar rechaza nombres que no pierden nada', /no pierden nada/.test(deMas), deMas.slice(-300));

  console.log('\n▸ y el huérfano: si el push dejaría un nodo inalcanzable, se niega');
  const soloIntruso = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen', '--borrar', 'Disparar por instancia', '--apply'], E));
  check('exige autorizar TODO lo que pierde, no una parte', /no está autorizado/.test(soloIntruso), soloIntruso.slice(-400));

  console.log('\n▸ el push bueno: crea "Resumen", borra el intruso y trae las conexiones del repo');
  const topo = limpio(sync(['push', 'dispatcher', '--nodos', 'Resumen', '--borrar', 'ZZ Intruso,Disparar por instancia', '--apply'], E));
  const trasTopo = await leer();
  check('aplicó', /✓ aplicado/.test(topo), topo.slice(-600));
  check('el nodo nuevo existe', trasTopo.nodes.some((n) => n.name === 'Resumen'));
  check('el intruso se fue', !trasTopo.nodes.some((n) => n.name === 'ZZ Intruso'));
  check('el nodo nuevo trae el jsCode del repo',
    trasTopo.nodes.find((n) => n.name === 'Resumen')?.parameters?.jsCode ===
    repo.nodes.find((n) => n.name === 'Resumen').parameters.jsCode);
  check('el nodo nuevo trae la position del repo (= el orden de ejecución)',
    JSON.stringify(trasTopo.nodes.find((n) => n.name === 'Resumen')?.position) ===
    JSON.stringify(repo.nodes.find((n) => n.name === 'Resumen').position));
  check('quedó CABLEADO: las conexiones son las del repo',
    JSON.stringify(trasTopo.connections) === JSON.stringify(repo.connections),
    JSON.stringify(trasTopo.connections).slice(0, 300));
  const dTopo = limpio(sync(['diff', 'dispatcher'], E));
  check('diff queda limpio después', /live corre lo que dice el repo/.test(dTopo), dTopo.slice(0, 500));

  console.log('\n▸ las credenciales del nodo nuevo se aprendieron de la instancia');
  const credNodo = trasTopo.nodes.find((n) => n.credentials && Object.keys(n.credentials).length);
  check('algún nodo tiene credencial con id real',
    !!credNodo && Object.values(credNodo.credentials).every((v) => v.id && /^[A-Za-z0-9]+$/.test(v.id)),
    JSON.stringify(credNodo?.credentials));

  console.log('\n▸ restore saca el nodo nuevo');
  const snapsTopo = (await import('node:fs')).readdirSync(path.join(RAIZ, '.n8n-snapshots')).filter((f) => f.startsWith('dispatcher-')).sort();
  const rt = limpio(sync(['restore', 'dispatcher', path.join('.n8n-snapshots', snapsTopo.at(-1)), '--apply'], E));
  const trasRestore = await leer();
  check('restore devuelve el grafo de antes del push de topología',
    !trasRestore.nodes.some((n) => n.name === 'Resumen') && trasRestore.nodes.some((n) => n.name === 'ZZ Intruso'), rt.slice(-300));

  // Se deja la copia con la forma del repo otra vez: el bloque de abajo prueba el fail-closed de
  // PLACEHOLDERS, y con topología pendiente chocaría antes contra el freno de topología.
  sync(['push', 'dispatcher', '--nodos', 'Resumen', '--borrar', 'ZZ Intruso,Disparar por instancia', '--apply'], E);

  console.log('\n▸ fail-closed: un placeholder que no se puede aprender aborta');
  // Se rompe el Config de la copia para que ninguna alineación funcione, y se apunta TODOS los
  // alias a la copia para que no pueda aprender <<WEBHOOK_URL_*>> de ningún otro workflow.
  const rotoCfg = (await leer()).nodes.map((n) =>
    n.name === 'Config' ? { ...n, parameters: { assignments: { assignments: [] } } } : n);
  const antesFF = await leer();
  await api('PUT', `/workflows/${copiaId}`, {
    name: antesFF.name, nodes: rotoCfg, connections: antesFF.connections, settings: { executionOrder: 'v1' },
  });
  const ff = limpio(sync(['push', 'dispatcher', '--nodos', 'Config', '--apply'],
    { N8N_WF_DISPATCHER: copiaId, N8N_WF_MOTOR: copiaId, N8N_WF_ARCHIVADO: copiaId, N8N_WF_DESCUBRIMIENTO: copiaId }));
  check('aborta con placeholders sin resolver', /placeholders sin resolver/.test(ff), ff.slice(-400));
  const finalCfg = JSON.stringify((await leer()).nodes.find((n) => n.name === 'Config').parameters);
  check('NO escribió el placeholder literal en producción', !/<<WEBHOOK_URL/.test(finalCfg));
  // ── el "hecho cuando" de plan-multi-tenant §14.2: un workflow ACTIVO ──────────────────
  //
  // ⚠️ Se copia el ERROR HANDLER y no el dispatcher, y la razón es de seguridad, no de comodidad:
  // el dispatcher tiene dos schedule triggers, así que activar su copia dispararía corridas reales
  // (y una de ellas es "domingo 6pm"). El error handler arranca en un `errorTrigger`, que SOLO
  // corre cuando otro workflow lo declara en `settings.errorWorkflow` — y una copia recién creada
  // no la apunta nadie. Activarla es inerte, y aun así es un workflow activo de verdad.
  console.log('\n▸ TOPOLOGÍA sobre un workflow ACTIVO');
  const errReal = (await api('GET', `/workflows/${process.env.N8N_WF_ERRORES}`)).json;
  const FALTA = 'Marcar run como fallo';
  const creadaAct = await api('POST', '/workflows', {
    name: 'ZZ TEST n8n-sync — copia errores ACTIVA (borrar)',
    nodes: errReal.nodes.filter((n) => n.name !== FALTA)
      .map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => campos.includes(k)))),
    connections: Object.fromEntries(Object.entries(errReal.connections).filter(([k]) => k !== 'Preparar datos del fallo')),
    settings: { executionOrder: 'v1' },
  });
  copiaActivaId = creadaAct.json?.id;
  const act = await api('POST', `/workflows/${copiaActivaId}/activate`);
  const EA = { N8N_WF_ERRORES: copiaActivaId };
  const leerAct = async () => (await api('GET', `/workflows/${copiaActivaId}`)).json;
  check('la copia quedó ACTIVA', (await leerAct()).active === true, `activate → ${act.status}`);

  const pushAct = limpio(sync(['push', 'errores', '--nodos', FALTA, '--apply'], EA));
  const trasAct = await leerAct();
  check('el nodo nuevo entró en el workflow activo', trasAct.nodes.some((n) => n.name === FALTA), pushAct.slice(-600));
  check('y el workflow SIGUE activo', trasAct.active === true);
  check('quedó cableado desde "Preparar datos del fallo"',
    JSON.stringify(trasAct.connections) === JSON.stringify(errReal.connections),
    JSON.stringify(trasAct.connections));
  const dAct = limpio(sync(['diff', 'errores'], EA));
  check('n8n:diff queda limpio después', /live corre lo que dice el repo/.test(dAct), dAct.slice(0, 400));

  const snapsAct = (await import('node:fs')).readdirSync(path.join(RAIZ, '.n8n-snapshots')).filter((f) => f.startsWith('errores-')).sort();
  const rAct = limpio(sync(['restore', 'errores', path.join('.n8n-snapshots', snapsAct.at(-1)), '--apply'], EA));
  const trasRAct = await leerAct();
  check('n8n:restore lo saca', !trasRAct.nodes.some((n) => n.name === FALTA), rAct.slice(-300));
  check('y el workflow sigue activo tras el restore', trasRAct.active === true);
} finally {
  if (copiaActivaId) {
    await api('POST', `/workflows/${copiaActivaId}/deactivate`);
    const d2 = await api('DELETE', `/workflows/${copiaActivaId}`);
    const c2 = await api('GET', `/workflows/${copiaActivaId}`);
    console.log(`\n🧹 copia ACTIVA borrada → DELETE ${d2.status} · GET ${c2.status} (404 = limpio)`);
  }
  if (copiaId) {
    const del = await api('DELETE', `/workflows/${copiaId}`);
    const chk = await api('GET', `/workflows/${copiaId}`);
    console.log(`\n🧹 copia borrada → DELETE ${del.status} · GET ${chk.status} (404 = limpio)`);
  }
  console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${ok} ok · ${fail} fallidos\x1b[0m`);
  process.exit(fail ? 1 : 0);
}
