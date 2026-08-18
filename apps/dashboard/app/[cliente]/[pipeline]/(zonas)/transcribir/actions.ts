"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import type { TenantContext } from "@/domain/tenant";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsearEnlaces, repartirEnlaces } from "@/domain/enlace";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { transcribir, traducir } from "@/lib/transcribir";
import { abrirRunTranscriptor, barrerRunsZombieTranscriptor, cerrarRunTranscriptor } from "@/lib/runs";
import { registrarEnHistorico } from "@/lib/historicos";
import { asignarTanda, crearTanda, renombrarTanda } from "@/lib/tandas";
import { LARGO_MAX_TITULO, tituloParaGuardar } from "@/domain/tanda";
import {
  abandonar,
  contarPendientes,
  marcarGrabado,
  leerFilasDeTanda,
  cualesEnCola,
  cualesFallidas,
  cualesGrabadas,
  cualesVistosPorElMotor,
  encolarEnlaces,
  marcarResultado,
  reclamarPendientes,
  reencolar,
  registrarEnDedup,
  type Transcripcion,
} from "@/lib/transcripciones";

export type ResultadoPegar = { ok: boolean; mensaje: string };

// Tope al pegote: 20k caracteres son ~400 links o un chat entero. Zod en todo input de usuario
// (plan-cockpit §5): un textarea abierto es exactamente el borde que el plan nombra.
const textoPegado = z.string().trim().min(1).max(20_000);

// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export async function pegarEnlaces(
  enRuta: CockpitEnRuta,
  texto: string,
): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  const parseo = textoPegado.safeParse(texto);
  if (!parseo.success) {
    return { ok: false, mensaje: "Pegá al menos un link (y menos de 20.000 caracteres)." };
  }

  const { validos, invalidos } = parsearEnlaces(parseo.data);
  if (validos.length === 0) {
    return {
      ok: false,
      mensaje:
        invalidos[0]?.razon ??
        "No encontré ningún link de Instagram o TikTok en eso que pegaste.",
    };
  }

  let encolados;
  try {
    encolados = await encolarEnlaces(ctx, validos);
  } catch (e) {
    console.error("[transcribir] falló el encolado:", e);
    return { ok: false, mensaje: "No se pudo guardar la lista. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // 🔑 **La tanda nace acá: este es el momento en que alguien apretó el botón** (ADR-064 §1). Y nace
  // DESPUÉS del encolado y solo si entró algo, porque el `ignoreDuplicates` es el que decide cuántos
  // eran nuevos: un pegote entero de repetidos dejaría si no una tanda vacía, y sin `delete` en el
  // grant de la `027` ahí se quedaría.
  //
  // Los dos pasos son best-effort (invariante #1 de PLAN §2.5): si fallan, los enlaces se
  // transcriben igual y lo único que se pierde es el agrupado. `leerSueltas` es el canario.
  let tandaId: string | null = null;
  if (encolados.ids.length > 0) {
    tandaId = await crearTanda(ctx, usuario.id);
    if (tandaId) await asignarTanda(ctx, tandaId, encolados.ids);
  }

  await registrarEvento(ctx, usuario.id, "transcribir.pegar", {
    detectados: validos.length,
    nuevos: encolados.nuevos,
    ya_estaban: encolados.yaEstaban,
    no_reconocidos: invalidos.length,
    tanda: tandaId,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));

  const partes = [`${encolados.nuevos} en cola`];
  if (encolados.yaEstaban > 0) partes.push(`${encolados.yaEstaban} ya estaban (no se vuelven a pagar)`);
  if (invalidos.length > 0) partes.push(`${invalidos.length} no reconocidos`);
  return { ok: true, mensaje: partes.join(" · ") + "." };
}

export type Revision = {
  /** Los que se van a transcribir, en su forma canónica: es lo que queda en el campo al aceptar. */
  nuevos: string[];
  yaEnCola: number;
  /** Están en la cola pero terminaron mal: el guion NO viene, hay que reintentarlos desde la lista. */
  fallados: number;
  yaVistosPorElMotor: number;
  /** El equipo ya grabó esos videos (ADR-069). El único montón que dice "no lo vuelvas a mandar". */
  yaGrabadas: number;
  noReconocidos: number;
};

/**
 * Mira el pegote **antes** de encolar y dice qué no hace falta transcribir.
 *
 * Es el paso que faltaba: hasta hoy el único aviso era un conteo al final del encolado
 * (*"2 ya estaban"*), o sea después, sin decir cuáles, y **sin mirar la memoria del motor** — que
 * era el caso donde de verdad se pagaba de más.
 *
 * No escribe nada y no cobra nada: dos `select` contra tablas que ya se consultan. Quién decide es
 * la pantalla, que ofrece quitarlos y deja seguir igual (ver `repartirEnlaces`: que el motor haya
 * visto un video no significa que exista su guion).
 */
export async function revisarPegote(
  enRuta: CockpitEnRuta,
  texto: string,
): Promise<{ ok: true; revision: Revision } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  const parseo = textoPegado.safeParse(texto);
  if (!parseo.success) {
    return { ok: false, mensaje: "Pegá al menos un link (y menos de 20.000 caracteres)." };
  }

  const { validos, invalidos } = parsearEnlaces(parseo.data);
  if (validos.length === 0) {
    return {
      ok: false,
      mensaje:
        invalidos[0]?.razon ?? "No encontré ningún link de Instagram o TikTok en eso que pegaste.",
    };
  }

  try {
    const ids = validos.map((e) => e.external_id);
    const [enCola, vistos, fallados, grabadas] = await Promise.all([
      cualesEnCola(ctx, ids),
      cualesVistosPorElMotor(ctx, ids),
      cualesFallidas(ctx, ids),
      cualesGrabadas(ctx, ids),
    ]);
    const reparto = repartirEnlaces(validos, enCola, vistos, fallados, grabadas);

    return {
      ok: true,
      revision: {
        nuevos: reparto.nuevos.map((e) => e.url),
        yaEnCola: reparto.enCola.length,
        fallados: reparto.fallados.length,
        yaVistosPorElMotor: reparto.vistosPorElMotor.length,
        yaGrabadas: reparto.grabadas.length,
        noReconocidos: invalidos.length,
      },
    };
  } catch (e) {
    console.error("[transcribir] falló la revisión previa:", e);
    return { ok: false, mensaje: "No se pudo revisar la lista. Probá de nuevo." };
  }
}

/**
 * Las filas de una tanda, cuando alguien la abre.
 *
 * 🔑 **Este es el otro lado del arreglo del techo de 50** (ADR-064 §3): la página carga cabeceras
 * —título y contadores, una fila por tanda— y los `script`, que son el peso, bajan solo cuando
 * alguien mira. Una tanda colapsada no necesita sus guiones. Es la misma forma con la que el feed
 * pasó de 405 KB a 16 KB en el cierre 98.
 */
export async function cargarTanda(
  enRuta: CockpitEnRuta,
  tandaId: string,
): Promise<{ ok: true; filas: Transcripcion[] } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);
  try {
    return { ok: true, filas: await leerFilasDeTanda(ctx, tandaId) };
  } catch (e) {
    console.error(`[transcribir] no se pudo cargar la tanda ${tandaId}:`, e);
    return { ok: false, mensaje: "No se pudieron cargar los enlaces. Probá de nuevo." };
  }
}

/**
 * Le pone nombre a una tanda. Vaciar el campo la devuelve al nombre por defecto.
 *
 * El título es opcional y aparece cuando la persona está apurada pegando 50 links, así que casi
 * toda tanda nace con el automático: **renombrar después es donde vive el valor** (ADR-064 §2).
 */
export async function ponerTituloATanda(
  enRuta: CockpitEnRuta,
  tandaId: string,
  texto: string,
): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  const parseo = z.string().max(LARGO_MAX_TITULO).safeParse(texto);
  if (!parseo.success) {
    return { ok: false, mensaje: `El nombre no puede pasar de ${LARGO_MAX_TITULO} caracteres.` };
  }
  const titulo = tituloParaGuardar(parseo.data);

  let renombrada: boolean;
  try {
    renombrada = await renombrarTanda(ctx, tandaId, titulo);
  } catch (e) {
    console.error(`[transcribir] falló renombrar la tanda ${tandaId}:`, e);
    return { ok: false, mensaje: "No se pudo guardar el nombre. Probá de nuevo." };
  }

  if (!renombrada) {
    return { ok: false, mensaje: "Esa tanda ya no existe. Recargá la página." };
  }

  await registrarEvento(ctx, usuario.id, "transcribir.renombrar_tanda", { tanda: tandaId, titulo });
  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return { ok: true, mensaje: titulo ? "Nombre guardado." : "Volvió al nombre por defecto." };
}

/** Devuelve a la cola un enlace que falló o volvió sin transcripción. El servidor comprueba el estado. */
export async function reintentarTranscripcion(
  enRuta: CockpitEnRuta,
  id: string,
): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  let reencolado: boolean;
  try {
    reencolado = await reencolar(ctx, id);
  } catch (e) {
    console.error(`[transcribir] falló reintentar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo reintentar. Probá de nuevo." };
  }

  if (!reencolado) {
    return { ok: false, mensaje: "Ese enlace ya no se puede reintentar. Recargá la página." };
  }

  await registrarEvento(ctx, usuario.id, "transcribir.reintentar", { transcripcion: id });
  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return { ok: true, mensaje: "De vuelta en la cola." };
}

/**
 * La otra salida de una fila fallada, y la que faltaba: cerrarla para siempre.
 *
 * El reintento sirve cuando el fallo fue transitorio. Cuando el video **no tiene voz**, reintentar
 * no puede ganar nunca y la fila queda ofreciendo un botón que no gana. Esto la cierra (ADR-062 §4).
 */
/**
 * Prende o apaga la marca de "ya se grabó" (ADR-069 §5).
 *
 * 🔓 **No pide confirmación, a diferencia de `abandonarTranscripcion`, que está justo abajo.** Esa
 * la pide porque no se deshace; esta se deshace con el mismo clic, así que un modal sería ruido
 * sobre un acto sin consecuencias. Es el criterio de plan-cockpit §3.3 aplicado en su otra
 * dirección: lo que no se puede deshacer se pregunta, lo que sí se deshace no.
 *
 * El evento SÍ se registra en las dos direcciones. Desmarcar es información: si alguien marca y
 * desmarca seguido, el hábito no cuajó y eso es lo que hay que saber para juzgar esta decisión
 * (ADR-069 §Consecuencias nombra el canario).
 */
export async function marcarComoGrabada(
  enRuta: CockpitEnRuta,
  id: string,
  grabado: boolean,
): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  let marcada: boolean;
  try {
    marcada = await marcarGrabado(ctx, id, grabado);
  } catch (e) {
    console.error(`[transcribir] falló marcar grabado ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar la marca. Probá de nuevo." };
  }

  if (!marcada) {
    return { ok: false, mensaje: "Ese enlace ya no está. Recargá la página." };
  }

  await registrarEvento(ctx, usuario.id, "transcribir.grabado", { transcripcion: id, grabado });
  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return {
    ok: true,
    mensaje: grabado
      ? "Marcado como grabado. Si alguien vuelve a pegar este link, la herramienta lo avisa."
      : "Marca sacada.",
  };
}

export async function abandonarTranscripcion(
  enRuta: CockpitEnRuta,
  id: string,
): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  let abandonada: boolean;
  try {
    abandonada = await abandonar(ctx, id);
  } catch (e) {
    console.error(`[transcribir] falló abandonar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo abandonar. Probá de nuevo." };
  }

  if (!abandonada) {
    return { ok: false, mensaje: "Ese enlace ya no se puede abandonar. Recargá la página." };
  }

  await registrarEvento(ctx, usuario.id, "transcribir.abandonar", { transcripcion: id });
  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return { ok: true, mensaje: "Listo, no se vuelve a intentar. El enlace queda registrado." };
}

// Pool de 8 en paralelo con presupuesto de tiempo, misma idea que el nodo `Transcribir (Supadata)`
// del motor: no se ARRANCAN videos nuevos pasado el límite, los en vuelo terminan. Cada enlace se
// marca apenas vuelve, así que si Vercel corta la función a mitad no se pierde nada — la pasada
// siguiente agarra los que quedaron pendientes. Eso hace la herramienta reanudable por
// construcción y vuelve irrelevante el techo de maxDuration.
const CONCURRENCIA = 8;
const PRESUPUESTO_MS = 45_000;
const LOTE = 64;

export type ResultadoProcesar = { procesados: number; quedan: number };

export async function procesarPendientes(enRuta: CockpitEnRuta): Promise<ResultadoProcesar> {
  const { ctx, cockpit } = await exigirTenant("transcribir", enRuta.cliente, enRuta.pipeline);

  // El barrido va PRIMERO, igual que en el motor: limpia los runs que quedaron `en_curso` porque su
  // pasada murió antes de cerrarlos. No puede depender de la que está por empezar.
  await barrerRunsZombieTranscriptor(ctx);

  // 🔑 Reclama en vez de solo leer: dos pestañas abiertas (y la pantalla arranca sola) recibían el
  // MISMO lote de 64 y lo pagaban dos veces. El porqué y el vencimiento, en `reclamarPendientes`.
  // Si otro ya se los llevó, esto vuelve vacío y el bucle del cliente corta solo.
  const pendientes = await reclamarPendientes(ctx, LOTE);
  if (pendientes.length === 0) return { procesados: 0, quedan: await contarPendientes(ctx) };

  // 🔑 Una tanda de enlaces pegados **es** una corrida del transcriptor (ADR-062 §3). Se abre acá y
  // no por enlace: es la unidad que la persona dispara, y es lo que hace que el gasto de Supadata
  // aparezca en Entender agrupado como el de las otras tres máquinas.
  //
  // `null` es un estado legítimo, no un error: si no se pudo abrir, la tanda se transcribe igual y
  // lo único que se pierde es que sus guiones lleguen al histórico. El registro es sumidero, jamás
  // dependencia de ejecución (invariante #1 de PLAN §2.5) — el mismo que audita el check #6.
  const runId = await abrirRunTranscriptor(ctx);

  const inicio = Date.now();
  let siguiente = 0;
  let procesados = 0;
  const cuenta = { listos: 0, sin_transcript: 0, fallos: 0 };

  const trabajador = async () => {
    while (Date.now() - inicio < PRESUPUESTO_MS) {
      const i = siguiente++;
      if (i >= pendientes.length) return;
      const salida = await procesarUno(ctx, pendientes[i], runId);
      cuenta[salida]++;
      procesados++;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador),
  );

  if (runId) await cerrarRunTranscriptor(ctx, runId, { pedidos: procesados, ...cuenta });

  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return { procesados, quedan: await contarPendientes(ctx) };
}

type Salida = "listos" | "sin_transcript" | "fallos";

async function procesarUno(
  ctx: TenantContext,
  fila: Transcripcion,
  runId: string | null,
): Promise<Salida> {
  try {
    const { texto, idioma } = await transcribir(fila.url);

    if (!texto) {
      // El video no tiene habla, o Supadata no pudo: el estado no los distingue, y por eso ni el
      // texto ni la etiqueta afirman cuál de los dos fue. No entra al dedup (decisión de Mani): si
      // el motor lo trae después, el gate lo descarta duro por sin_guion igual (ADR-030).
      await marcarResultado(ctx, fila.id, {
        estado: "sin_transcript",
        error: "No se pudo sacar el texto: el video no tiene habla, o Supadata no lo consiguió.",
      });
      return "sin_transcript";
    }

    // Script literal (ADR-009): el transcript tal cual, traducido solo si no venía en español.
    const script = idioma === "es" ? texto : await traducir(texto);

    await marcarResultado(ctx, fila.id, { estado: "listo", script, idioma: idioma || "es" });

    // Recién acá, con el script en la mano, el enlace entra a la memoria del dedup.
    await registrarEnDedup(ctx, {
      plataforma: fila.plataforma,
      external_id: fila.external_id,
      url: fila.url,
    });

    // Y al histórico, que es lo que ADR-062 vino a arreglar: hasta hoy el guion se quedaba en
    // `app.transcripciones` y no llegaba al CSV que lee el jefe. Va después del dedup y no antes
    // porque el dedup es la razón de ser de la herramienta; el histórico es la copia.
    if (runId) {
      await registrarEnHistorico(ctx, runId, {
        url: fila.url,
        script,
        idioma: idioma || "es",
        externalId: fila.external_id,
        plataforma: fila.plataforma,
      });
    }
    return "listos";
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[transcribir] falló ${fila.url}:`, mensaje);
    await marcarResultado(ctx, fila.id, { estado: "fallo", error: mensaje }).catch(() => {});
    return "fallos";
  }
}
