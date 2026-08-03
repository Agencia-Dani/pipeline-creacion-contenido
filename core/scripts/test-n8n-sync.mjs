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

  console.log('\n▸ fail-closed: un placeholder que no se puede aprender aborta');
  // Se rompe el Config de la copia para que ninguna alineación funcione, y se apunta TODOS los
  // alias a la copia para que no pueda aprender <<WEBHOOK_URL_*>> de ningún otro workflow.
  const rotoCfg = restaurado.nodes.map((n) =>
    n.name === 'Config' ? { ...n, parameters: { assignments: { assignments: [] } } } : n);
  await api('PUT', `/workflows/${copiaId}`, {
    name: restaurado.name, nodes: rotoCfg, connections: restaurado.connections, settings: { executionOrder: 'v1' },
  });
  const ff = limpio(sync(['push', 'dispatcher', '--nodos', 'Config', '--apply'],
    { N8N_WF_DISPATCHER: copiaId, N8N_WF_MOTOR: copiaId, N8N_WF_ARCHIVADO: copiaId, N8N_WF_DESCUBRIMIENTO: copiaId }));
  check('aborta con placeholders sin resolver', /placeholders sin resolver/.test(ff), ff.slice(-400));
  const finalCfg = JSON.stringify((await leer()).nodes.find((n) => n.name === 'Config').parameters);
  check('NO escribió el placeholder literal en producción', !/<<WEBHOOK_URL/.test(finalCfg));
} finally {
  if (copiaId) {
    const del = await api('DELETE', `/workflows/${copiaId}`);
    const chk = await api('GET', `/workflows/${copiaId}`);
    console.log(`\n🧹 copia borrada → DELETE ${del.status} · GET ${chk.status} (404 = limpio)`);
  }
  console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${ok} ok · ${fail} fallidos\x1b[0m`);
  process.exit(fail ? 1 : 0);
}
