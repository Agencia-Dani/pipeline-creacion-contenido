"use server";

import { revalidatePath } from "next/cache";
import { esCalificacion, estadoDe } from "@/domain/feed";
import { exigirZona } from "@/lib/auth";
import { calificar, guardarNotas } from "@/lib/candidatos";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// Calificar un candidato. Escribe en Airtable, que sigue siendo el dueño de la tabla hasta D7
// (D6 cambia la superficie, no la propiedad).
//
// No se revalida la ruta a propósito: la tarjeta calificada tiene que **quedarse marcada en su
// lugar** hasta que alguien recargue o cambie de filtro (plan-cockpit §D6.4). Un
// `revalidatePath` acá la haría desaparecer de abajo del cursor y convertiría el misclick en
// algo irrecuperable desde la pantalla. El estado visible lo lleva el cliente; la verdad ya
// está escrita.

export async function calificarCandidato(id: string, calificacion: string): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  if (!esCalificacion(calificacion)) {
    return { ok: false, mensaje: "Esa calificación no existe." };
  }

  try {
    await calificar(id, calificacion);
    await registrarEvento(usuario.id, "candidatos.calificar", {
      candidato: id,
      calificacion,
      estado: estadoDe(calificacion),
    });
  } catch (e) {
    console.error(`[feed] falló calificar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
  }

  return { ok: true, mensaje: "Guardado." };
}

/**
 * Las notas del equipo: la válvula de escape de ADR-034 para lo que el emoji ya no distingue
 * ("buen video, pero no ahora"). Sobreviven al archivado en `outputs.metadata`.
 */
export async function guardarNotasCandidato(id: string, notas: string): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  const limpias = notas.trim();
  if (limpias.length > 2000) {
    return { ok: false, mensaje: "La nota es muy larga (máximo 2000 caracteres)." };
  }

  try {
    await guardarNotas(id, limpias);
    await registrarEvento(usuario.id, "candidatos.notas", { candidato: id, largo: limpias.length });
  } catch (e) {
    console.error(`[feed] falló guardar notas de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar la nota. Probá de nuevo." };
  }

  revalidatePath("/curar/feed");
  return { ok: true, mensaje: "Nota guardada." };
}
