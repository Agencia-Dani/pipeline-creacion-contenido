"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import type { TenantContext } from "@/domain/tenant";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsearEnlaces, repartirEnlaces } from "@/domain/enlace";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { transcribir, traducir } from "@/lib/transcribir";
import {
  contarPendientes,
  cualesEnCola,
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

  await registrarEvento(ctx, usuario.id, "transcribir.pegar", {
    detectados: validos.length,
    nuevos: encolados.nuevos,
    ya_estaban: encolados.yaEstaban,
    no_reconocidos: invalidos.length,
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
  yaVistosPorElMotor: number;
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
    const [enCola, vistos] = await Promise.all([
      cualesEnCola(ctx, ids),
      cualesVistosPorElMotor(ctx, ids),
    ]);
    const reparto = repartirEnlaces(validos, enCola, vistos);

    return {
      ok: true,
      revision: {
        nuevos: reparto.nuevos.map((e) => e.url),
        yaEnCola: reparto.enCola.length,
        yaVistosPorElMotor: reparto.vistosPorElMotor.length,
        noReconocidos: invalidos.length,
      },
    };
  } catch (e) {
    console.error("[transcribir] falló la revisión previa:", e);
    return { ok: false, mensaje: "No se pudo revisar la lista. Probá de nuevo." };
  }
}

/** Devuelve a la cola un enlace que falló o volvió sin voz. El servidor comprueba el estado. */
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

  // 🔑 Reclama en vez de solo leer: dos pestañas abiertas (y la pantalla arranca sola) recibían el
  // MISMO lote de 64 y lo pagaban dos veces. El porqué y el vencimiento, en `reclamarPendientes`.
  // Si otro ya se los llevó, esto vuelve vacío y el bucle del cliente corta solo.
  const pendientes = await reclamarPendientes(ctx, LOTE);
  if (pendientes.length === 0) return { procesados: 0, quedan: await contarPendientes(ctx) };

  const inicio = Date.now();
  let siguiente = 0;
  let procesados = 0;

  const trabajador = async () => {
    while (Date.now() - inicio < PRESUPUESTO_MS) {
      const i = siguiente++;
      if (i >= pendientes.length) return;
      await procesarUno(ctx, pendientes[i]);
      procesados++;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador),
  );

  revalidatePath(rutaDe(comoRuta(cockpit), "transcribir"));
  return { procesados, quedan: await contarPendientes(ctx) };
}

async function procesarUno(ctx: TenantContext, fila: Transcripcion): Promise<void> {
  try {
    const { texto, idioma } = await transcribir(fila.url);

    if (!texto) {
      // Sin voz o Supadata no pudo. No entra al dedup (decisión de Mani): si el motor lo trae
      // después, el gate lo descarta duro por sin_guion igual (ADR-030).
      await marcarResultado(ctx, fila.id, {
        estado: "sin_transcript",
        error: "El video no tiene voz o no se pudo transcribir.",
      });
      return;
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
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[transcribir] falló ${fila.url}:`, mensaje);
    await marcarResultado(ctx, fila.id, { estado: "fallo", error: mensaje }).catch(() => {});
  }
}
