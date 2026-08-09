"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { esCalificacion } from "@/domain/feed";
import { exigirCockpitDePipeline } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { calificarLinkedin, leerTextoLinkedin } from "@/lib/candidatos-linkedin";

export type Resultado = { ok: boolean; mensaje: string };

// 🔒 Misma guardia que las otras pantallas de LinkedIn, y por la misma razón: la zona `curar` existe
// en los dos pipelines, así que `exigirTenant` sola dejaría a un cockpit de reels escribir en
// `app.candidatos_linkedin`. El porqué largo está en `exigirCockpitDePipeline` (`lib/auth.ts`).
const exigirCockpitLinkedin = (enRuta: CockpitEnRuta) =>
  exigirCockpitDePipeline("curar", "linkedin", enRuta.cliente, enRuta.pipeline);

/**
 * Calificar: 🔥 y 👍 aprueban, 👎 descarta. Un click alcanza (ADR-034: de la calificación sale el
 * estado, no hay un segundo control).
 *
 * ⚠️ **Acá NO archiva.** En reels, aprobar alimenta al archivado que escribe `outputs`; el pipeline
 * de LinkedIn no tiene archivador todavía, así que esto mueve estado y calificación y nada más.
 * Está escrito también en la pantalla, porque la expectativa que crea el 🔥 en reels es "esto va a
 * aparecer en el histórico" y acá no va a aparecer.
 */
export async function calificarPiezaLinkedin(
  enRuta: CockpitEnRuta,
  id: string,
  calificacion: string,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  // Se revalida en el servidor aunque los botones solo ofrezcan las tres: un POST a mano no tiene
  // por qué respetar lo que la UI ofrecía, y el `check` de la `020` §4 lo rechazaría con un 23514
  // crudo que no le dice nada a nadie.
  if (!esCalificacion(calificacion)) {
    return { ok: false, mensaje: "Esa calificación no existe." };
  }

  try {
    await calificarLinkedin(ctx, id, calificacion);
    await registrarEvento(ctx, usuario.id, "candidatos_linkedin.calificar", {
      id,
      calificacion,
    });
  } catch (e) {
    console.error("[candidatos-linkedin] falló calificar:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo calificar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/feed"));
  return { ok: true, mensaje: "Listo." };
}

/**
 * El texto completo de una pieza, a pedido.
 *
 * Es la otra mitad de por qué la lista no lo trae: `texto` es el campo gordo, y mandarlo en el
 * listado es lo que hizo que el feed de reels pesara ~405 KB por carga. Se pide al abrir.
 */
export async function verTextoLinkedin(
  enRuta: CockpitEnRuta,
  id: string,
): Promise<{ ok: boolean; texto: string | null; mensaje?: string }> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return { ok: false, texto: null, mensaje: sesion.mensaje };

  try {
    return { ok: true, texto: await leerTextoLinkedin(sesion.ctx, id) };
  } catch (e) {
    console.error("[candidatos-linkedin] falló leer el texto:", e);
    return { ok: false, texto: null, mensaje: "No se pudo abrir la pieza." };
  }
}
