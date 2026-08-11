#!/usr/bin/env node
// test-nodos.mjs — ejercita los code nodes de la máquina de LinkedIn FUERA de n8n.
//
//   node Workflows/workflow-linkedin/test-nodos.mjs
//
// Hermano del de reels y por el mismo motivo: el motor corre en n8n, así que sin esto la lógica se
// verifica recién en producción. Acá pesa todavía más, porque este workflow está INACTIVO y sin
// cron: no hay ninguna corrida real que lo desmienta. Un bug puede dormir meses.
//
// Lo que de verdad cubre es `Calidad`, que es la única pieza con reglas de negocio: R-1 y R-2
// (ADR-055 §4). Los dos modos de falla que persigue son mudos —un gancho roto entrega un post que
// LinkedIn esconde detrás del "ver más", y una firma faltante entrega un post que viola la regla de
// la casa—, y ninguno produce un error en ningún lado.
//
// Sin dependencias: node pelado.

import { readFileSync } from 'node:fs';

const w = JSON.parse(readFileSync(new URL('./workflow.json', import.meta.url), 'utf8'));
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

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

/**
 * Corre un code node con `$`, `$input` y `console` mockeados.
 * `nodos` es el mapa nombre → json que devuelve `$('nombre').first()`.
 */
const correr = async (nombre, { nodos = {}, entrada = {} } = {}) => {
  const $ = (n) => {
    if (!(n in nodos)) throw new Error('nodo no mockeado: ' + n);
    return { first: () => ({ json: nodos[n] }), all: () => [{ json: nodos[n] }] };
  };
  const $input = { first: () => ({ json: entrada }), all: () => [{ json: entrada }] };
  const logs = [];
  const out = await new AsyncFn('$', '$input', 'console', jsCode(nombre))($, $input, {
    log: (m) => logs.push(String(m)),
  });
  // `json` cae a `{}` y nunca a null. No es cosmético: cuando un nodo se rompe y devuelve [], un
  // `json` nulo hace que el PRIMER check que lo toque tire un TypeError y se lleve puesta la suite
  // entera — o sea que romper una guarda esconde el resto de las guardas. Con `{}` cada check falla
  // por su cuenta y el reporte queda completo. Lo encontró un control negativo, no un review.
  return { out, json: (out && out[0] ? out[0].json : null) || {}, logs };
};

// Un plan como el que sirve la fachada (ADR-068). `configurada` es el interruptor de LinkedIn:
// existe el perfil, no `voces.activo` (ADR-067).
const FIRMA = 'Fernando Benites · Head of Content · Hago que las marcas suenen a alguien.';
const voz = (id, nombre, extra = {}) => ({
  id,
  fields: Object.assign({ nombre, configurada: true, firma: FIRMA, perfil: 'habla corto' }, extra),
});
const plan = ({ pipeline = 'linkedin', voces = [], referentes = [] } = {}) => ({
  version: 2,
  pipeline,
  generado_en: '2026-08-11T12:00:00.000Z',
  voces,
  referentes,
});

// ════════════════════════════════════════════════════════════════════════════
// Verificar plan (ADR-068) — la afirmación que ningún otro nodo puede hacer
// ════════════════════════════════════════════════════════════════════════════
seccion('Verificar plan (ADR-068)');
{
  const { json, logs } = await correr('Verificar plan (ADR-068)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [voz('v1', 'Fer')], referentes: [{ id: 'r1', fields: {} }] }) },
  });
  check('cuenta voces con perfil y referentes activos', json.conteo.voces_con_perfil === 1 && json.conteo.referentes_activos === 1, JSON.stringify(json.conteo));
  check('sin avisos cuando hay insumos', json.avisos.length === 0, JSON.stringify(json.avisos));
  check('lo deja en el log', logs.some((l) => /\[Verificar plan\]/.test(l)), JSON.stringify(logs));
}
{
  // El fallo que este nodo existe para cazar: un plan BIEN FORMADO del pipeline equivocado. No
  // llega como error de red ni como 4xx — llega con voces y referentes de reels adentro.
  let lanzo = null;
  try {
    await correr('Verificar plan (ADR-068)', {
      nodos: { 'Leer plan (fachada)': plan({ pipeline: 'short-form-content', voces: [voz('v1', 'Fer')] }) },
    });
  } catch (e) {
    lanzo = e.message;
  }
  check('un plan de REELS aborta la corrida (ADR-068)', lanzo !== null, 'no lanzó');
  check('y el error nombra el pipeline que vino', /short-form-content/.test(lanzo || ''), String(lanzo));
}
{
  const { json } = await correr('Verificar plan (ADR-068)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [voz('v1', 'Fer', { configurada: false, firma: null })] }) },
  });
  check('una voz SIN perfil no cuenta como configurada', json.conteo.voces === 1 && json.conteo.voces_con_perfil === 0, JSON.stringify(json.conteo));
  check('0 voces y 0 referentes avisan, no fallan (es el estado de hoy)', json.avisos.length === 2, JSON.stringify(json.avisos));
}

// ════════════════════════════════════════════════════════════════════════════
// Colectar (stub personal) — Fase 1.1
// ════════════════════════════════════════════════════════════════════════════
seccion('Colectar (stub personal)');
{
  const { out, json, logs } = await correr('Colectar (stub personal)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [] }) },
  });
  // 🔴 La regresión más cara posible de este nodo: devolver [] deja al run `en_curso` para siempre.
  check('con 0 voces devuelve UN item igual (si devolviera [] el run nunca cerraría)', out.length === 1, JSON.stringify(out));
  check('…con piezas vacías y su motivo', (json.piezas || []).length === 0 && /sin voces/.test(String(json.motivo)), JSON.stringify(json));
  check('y lo dice en el log', logs.some((l) => /0 voces con perfil/.test(l)), JSON.stringify(logs));
}
{
  const { json } = await correr('Colectar (stub personal)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [voz('v1', 'Fer')] }) },
  });
  check('emite 2 piezas fijas', json.piezas.length === 2, String(json.piezas.length));
  check('las dos llevan la firma DEL PLAN, no una inventada', json.piezas.every((p) => p.firma === FIRMA), JSON.stringify(json.piezas.map((p) => p.firma)));
  check('las dos llevan el voz_id', json.piezas.every((p) => p.voz_id === 'v1'), JSON.stringify(json.piezas.map((p) => p.voz_id)));
  check('carril personal + fuente archivo', json.piezas.every((p) => p.carril === 'personal' && p.fuente === 'archivo'), JSON.stringify(json.piezas.map((p) => [p.carril, p.fuente])));
  // external_id fijo = correrlo dos veces deja UNA fila (unique + ignore-duplicates).
  check('los external_id son fijos (el stub no duplica al recorrer dos veces)', json.piezas.map((p) => p.external_id).join(',') === 'stub-personal-ok,stub-personal-r1', JSON.stringify(json.piezas.map((p) => p.external_id)));
}
{
  const { json, logs } = await correr('Colectar (stub personal)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [voz('v1', 'Fer'), voz('v2', 'Otra')] }) },
  });
  check('con 2 voces usa la primera', json.voz_id === 'v1', json.voz_id);
  check('y AVISA que ignoró las demás', logs.some((l) => /el stub usa la primera/.test(l)), JSON.stringify(logs));
}
{
  const { json } = await correr('Colectar (stub personal)', {
    nodos: { 'Leer plan (fachada)': plan({ voces: [voz('v1', 'Fer', { configurada: false })] }) },
  });
  // Si esto se rompe, el stub firmaría con `null` y `Calidad` rechazaría todo por `voz_sin_firma`.
  check('una voz sin perfil no alcanza para colectar', (json.piezas || []).length === 0, JSON.stringify(json.piezas));
}

// ════════════════════════════════════════════════════════════════════════════
// Calidad (R-1 + R-2) — ADR-055 §4. La única pieza con reglas de negocio.
// ════════════════════════════════════════════════════════════════════════════
seccion('Calidad — R-1: el gancho es un bloque continuo de 2–3 líneas');

const evaluar = async (texto, firma = FIRMA) => {
  const { json } = await correr('Calidad (R-1 + R-2)', {
    entrada: { piezas: [{ external_id: 'x', texto, firma }] },
  });
  return {
    aprobada: json.calidad.aprobadas === 1,
    motivo: json.calidad.rechazos.length ? json.calidad.rechazos[0].motivo : null,
    texto: json.piezas.length ? json.piezas[0].texto : null,
    estado: json.piezas.length ? json.piezas[0].calidad : 'rechazada',
    calidad: json.calidad,
  };
};

const cuerpo = '\n\nEl cuerpo del post, que puede tener\nlos bloques que quiera.\n\n' + FIRMA;

{
  const dos = await evaluar('Primera línea del gancho.\nSegunda línea.' + cuerpo);
  check('gancho de 2 líneas pasa', dos.aprobada, dos.motivo);
  const tres = await evaluar('Uno.\nDos.\nTres.' + cuerpo);
  check('gancho de 3 líneas pasa', tres.aprobada, tres.motivo);
}
{
  // El caso literal de la entrevista: un \n\n antes de la línea 2 esconde el post detrás del
  // "ver más". Es el modo de falla que R-1 existe para matar, y no produce ningún error.
  const una = await evaluar('Un gancho de una sola línea.' + cuerpo);
  check('gancho de 1 línea se RECHAZA (el \\n\\n antes de la línea 2)', !una.aprobada, 'pasó');
  check('…y el motivo lo nombra', /gancho_de_1_lineas/.test(una.motivo || ''), String(una.motivo));
}
{
  const cuatro = await evaluar('Uno.\nDos.\nTres.\nCuatro.' + cuerpo);
  check('gancho de 4 líneas se RECHAZA', !cuatro.aprobada, 'pasó');
  check('…y el motivo lo nombra', /gancho_de_4_lineas/.test(cuatro.motivo || ''), String(cuatro.motivo));
}
{
  // Una "línea en blanco" con espacios adentro la ve el ojo como en blanco y LinkedIn también.
  const conEspacios = await evaluar('Un gancho de una sola línea.\n   \nCuerpo.\n\n' + FIRMA);
  check('una línea con SOLO espacios cuenta como línea en blanco', !conEspacios.aprobada, 'pasó');
}
{
  const crlf = await evaluar('Uno.\r\nDos.\r\n\r\nCuerpo.\r\n\r\n' + FIRMA);
  check('\\r\\n se normaliza (el texto pegado de Windows no rompe R-1)', crlf.aprobada, crlf.motivo);
}
{
  const vacio = await evaluar('   \n  \n ');
  check('texto vacío se rechaza y no revienta', !vacio.aprobada && vacio.motivo === 'sin_texto', String(vacio.motivo));
}

seccion('Calidad — R-2: firma obligatoria al cierre');
{
  const sinFirma = await evaluar('Uno.\nDos.\n\nCuerpo sin firma.');
  check('sin firma NO se rechaza: se REPARA (el texto es de la casa)', sinFirma.aprobada && sinFirma.estado === 'reparada', sinFirma.motivo + ' / ' + sinFirma.estado);
  check('…y la firma queda de verdad al cierre', (sinFirma.texto || '').trimEnd().endsWith(FIRMA), JSON.stringify(sinFirma.texto));
}
{
  // Reparar dos veces no duplica: el resultado de la reparación vuelve a pasar como `ok`.
  const reparado = await evaluar('Uno.\nDos.\n\nCuerpo sin firma.');
  const otraVez = await evaluar(reparado.texto);
  check('la reparación es idempotente (no apila firmas)', otraVez.aprobada && otraVez.estado === 'ok', otraVez.estado + ' / ' + otraVez.motivo);
}
{
  const enElMedio = await evaluar('Uno.\nDos.\n\n' + FIRMA + '\n\nY después sigue hablando.');
  check('firma en el MEDIO se rechaza (agregarla la duplicaría, moverla es reescribir)', !enElMedio.aprobada, 'pasó');
  check('…y el motivo lo nombra', /firma_fuera_del_cierre/.test(enElMedio.motivo || ''), String(enElMedio.motivo));
}
{
  // El LLM puede reflowear la firma sin cambiar una palabra. Eso no es violar R-2.
  const reflow = await evaluar('Uno.\nDos.\n\nCuerpo.\n\nFernando Benites · Head of Content ·\nHago que las marcas suenen a alguien.');
  check('la firma con otros saltos de línea sigue siendo la firma', reflow.aprobada && reflow.estado === 'ok', reflow.estado + ' / ' + reflow.motivo);
}
{
  const sinConfig = await evaluar('Uno.\nDos.\n\nCuerpo.', null);
  check('voz sin firma se rechaza (no se inventa una)', !sinConfig.aprobada && /voz_sin_firma/.test(sinConfig.motivo || ''), String(sinConfig.motivo));
}
{
  const corto = await evaluar('Uno.\nDos.\n\nHola.', 'Una firma mucho más larga que el post entero, imposible de contener.');
  check('un texto MÁS CORTO que la firma no revienta el slice', !corto.aprobada || corto.estado === 'reparada', corto.estado + ' / ' + corto.motivo);
}

seccion('Calidad — la contabilidad no pierde piezas');
{
  const { json } = await correr('Calidad (R-1 + R-2)', {
    entrada: {
      piezas: [
        { external_id: 'ok', texto: 'Uno.\nDos.' + cuerpo, firma: FIRMA },
        { external_id: 'rep', texto: 'Uno.\nDos.\n\nSin firma.', firma: FIRMA },
        { external_id: 'r1', texto: 'Una sola.' + cuerpo, firma: FIRMA },
      ],
    },
  });
  const c = json.calidad;
  check('evaluadas = aprobadas + rechazadas', c.evaluadas === c.aprobadas + c.rechazadas && c.evaluadas === 3, JSON.stringify(c));
  check('las reparadas cuentan como aprobadas, no como una tercera categoría', c.aprobadas === 2 && c.reparadas === 1, JSON.stringify(c));
  check('el rechazo viaja con su external_id (sin eso no se audita nada)', (c.rechazos[0] || {}).external_id === 'r1', JSON.stringify(c.rechazos));
}
{
  const { out, json } = await correr('Calidad (R-1 + R-2)', { entrada: { piezas: [] } });
  check('sin piezas devuelve UN item igual (no corta la cadena)', out.length === 1 && json.piezas.length === 0, JSON.stringify(out));
}

// ════════════════════════════════════════════════════════════════════════════
// Preparar candidatos — la escritura por PostgREST (ADR-035)
// ════════════════════════════════════════════════════════════════════════════
seccion('Preparar candidatos');
const CFG = { instance_id: 'inst-linkedin-uuid', supabase_url: 'https://x.supabase.co' };
{
  const { json } = await correr('Preparar candidatos', {
    nodos: { Config: CFG },
    entrada: { piezas: [{ external_id: 'a', carril: 'personal', fuente: 'archivo', titulo: 'T', texto: 'X', voz_id: 'v1' }] },
  });
  const fila = json.filas[0] || {};
  check('cada fila lleva el instance_id del payload (la 020 lo exige not null y sin default)', fila.instance_id === 'inst-linkedin-uuid', JSON.stringify(fila));
  check('nace en estado nuevo', fila.estado === 'nuevo', String(fila.estado));
  check('los opcionales van null, no undefined (PostgREST rechaza claves que no existen, no nulls)', fila.url === null && fila.proyecto_id === null, JSON.stringify(fila));
  const claves = Object.keys(fila).sort().join(',');
  check('no manda ninguna columna que la 020 §4 no tenga', claves === 'autor,carril,estado,external_id,fuente,idioma,imagen_url,instance_id,proyecto_id,referente_id,texto,titulo,url,voz_id', claves);
}
{
  const { out } = await correr('Preparar candidatos', { nodos: { Config: CFG }, entrada: { piezas: [] } });
  check('sin piezas devuelve [] (no hay POST vacío contra un nodo fail-closed)', out.length === 0, JSON.stringify(out));
}

// ════════════════════════════════════════════════════════════════════════════
// Resumen del run
// ════════════════════════════════════════════════════════════════════════════
seccion('Resumen del run');
{
  const { json } = await correr('Resumen del run', {
    nodos: {
      'Verificar plan (ADR-068)': { conteo: { pipeline: 'linkedin', voces_con_perfil: 1, referentes_activos: 0 }, avisos: ['0 referentes activos: el banco está vacío (Fase 0.5)'] },
      'Colectar (stub personal)': { stub: true, piezas: [] },
    },
    entrada: { calidad: { evaluadas: 2, aprobadas: 1, reparadas: 0, rechazadas: 1, rechazos: [{ external_id: 'stub-personal-r1', motivo: 'gancho_de_1_lineas (R-1: entre 2 y 3)' }] } },
  });
  check('el embudo llega a runs.metricas', json.metricas.colectadas === 2 && json.metricas.entregadas === 1, JSON.stringify(json.metricas));
  check('arrastra los avisos del plan (el banco vacío no se pierde)', json.metricas.avisos.length === 1, JSON.stringify(json.metricas.avisos));
  check('dice que la etapa es un stub, no un motor', /stub/.test(json.metricas.etapa), json.metricas.etapa);
}
{
  // La guarda que prueba que `Calidad` está CABLEADA, no sólo presente: el stub emite una pieza
  // rota a propósito, así que 0 rechazos con el stub puesto significa que el validador no corrió.
  const { json } = await correr('Resumen del run', {
    nodos: {
      'Verificar plan (ADR-068)': { conteo: { pipeline: 'linkedin' }, avisos: [] },
      'Colectar (stub personal)': { stub: true, piezas: [] },
    },
    entrada: { calidad: { evaluadas: 2, aprobadas: 2, reparadas: 0, rechazadas: 0, rechazos: [] } },
  });
  check('avisa si el stub entró entero (Calidad no está cableada)', json.metricas.avisos.some((a) => /Calidad esté cableada/.test(a)), JSON.stringify(json.metricas.avisos));
}

// ════════════════════════════════════════════════════════════════════════════
// La espina entera: plan → colectar → calidad → filas
// ════════════════════════════════════════════════════════════════════════════
seccion('La espina entera (Fase 1.1 + 1.2), con la salida real de cada nodo');
{
  const p = plan({ voces: [voz('v1', 'Fer')], referentes: [] });
  const verificado = await correr('Verificar plan (ADR-068)', { nodos: { 'Leer plan (fachada)': p } });
  const colectado = await correr('Colectar (stub personal)', { nodos: { 'Leer plan (fachada)': p } });
  const validado = await correr('Calidad (R-1 + R-2)', { entrada: colectado.json });
  const preparado = await correr('Preparar candidatos', { nodos: { Config: CFG }, entrada: validado.json });
  const resumen = await correr('Resumen del run', {
    nodos: { 'Verificar plan (ADR-068)': verificado.json, 'Colectar (stub personal)': colectado.json },
    entrada: validado.json,
  });

  const filas = (preparado.json || {}).filas || [];
  const entregada = filas[0] || {};
  check('de las 2 piezas del stub entrega EXACTAMENTE 1', filas.length === 1, JSON.stringify(filas.map((f) => f.external_id)));
  check('la que entra es la buena', entregada.external_id === 'stub-personal-ok', String(entregada.external_id));
  check('la rota queda afuera por R-1', (validado.json.calidad.rechazos[0] || {}).external_id === 'stub-personal-r1', JSON.stringify(validado.json.calidad.rechazos));
  check('el resumen no dispara la alarma de cableado', !resumen.json.metricas.avisos.some((a) => /Calidad esté cableada/.test(a)), JSON.stringify(resumen.json.metricas.avisos));
  check('la fila entregada lleva la firma en su texto', /Hago que las marcas suenen a alguien\.$/.test(String(entregada.texto || '').trimEnd()), JSON.stringify(entregada.texto));
}

console.log(fail === 0 ? '\n✓ Todo verde.\n' : '\n✗ ' + fail + ' fallo(s).\n');
process.exit(fail === 0 ? 0 : 1);
