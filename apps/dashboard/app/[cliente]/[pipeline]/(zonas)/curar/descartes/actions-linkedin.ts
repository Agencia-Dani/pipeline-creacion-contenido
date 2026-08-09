"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { esVeredicto } from "@/domain/feed";
import { exigirCockpitDePipeline } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { juzgarDescarteLinkedin } from "@/lib/candidatos-linkedin";

export type Resultado = { ok: boolean; mensaje: string };

// 🔒 La misma guardia de pipeline que el resto de LinkedIn (`exigirCockpitDePipeline`, `lib/auth.ts`).
const exigirCockpitLinkedin = (enRuta: CockpitEnRuta) =>
  exigirCockpitDePipeline("curar", "linkedin", enRuta.cliente, enRuta.pipeline);

/**
 * El veredicto sobre un descarte: si el filtro acertó (*bien descartado*) o se equivocó (*era
 * bueno*). Es lo que corrige los criterios, y lo que no se marca sigue esperando — la lista no se
 * borra.
 */
export async function juzgarLinkedin(
  enRuta: CockpitEnRuta,
  id: string,
  veredicto: string,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  if (!esVeredicto(veredicto)) return { ok: false, mensaje: "Ese veredicto no existe." };

  try {
    await juzgarDescarteLinkedin(ctx, id, veredicto);
    await registrarEvento(ctx, usuario.id, "descartes_linkedin.juzgar", { id, veredicto });
  } catch (e) {
    console.error("[descartes-linkedin] falló juzgar:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo guardar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/descartes"));
  return { ok: true, mensaje: "Listo." };
}
