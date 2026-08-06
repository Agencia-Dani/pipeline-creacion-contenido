"use server";

import { z } from "zod";
import { comoRuta, rutaDe } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import {
  esCalificacion,
  esFiltro,
  estadoDe,
  type CandidatoFeed,
  type TextosCandidato,
} from "@/domain/feed";
import { exigirTenant } from "@/lib/auth";
import { calificar, guardarNotas, leerFeed, leerTextos } from "@/lib/candidatos";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// Calificar un candidato. Escribe en Postgres, que desde D7 es el dueño de la tabla
// (D6 cambia la superficie, no la propiedad).
//
// No se revalida la ruta a propósito: la tarjeta calificada tiene que **quedarse marcada en su
// lugar** hasta que alguien recargue o cambie de filtro (plan-cockpit §D6.4). Un
// `revalidatePath` acá la haría desaparecer de abajo del cursor y convertiría el misclick en
// algo irrecuperable desde la pantalla. El estado visible lo lleva el cliente; la verdad ya
// está escrita.

export async function calificarCandidato(id: string, calificacion: string): Promise<Resultado> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar");

  if (!esCalificacion(calificacion)) {
    return { ok: false, mensaje: "Esa calificación no existe." };
  }

  try {
    await calificar(ctx, id, calificacion);
    await registrarEvento(ctx, usuario.id, "candidatos.calificar", {
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
  const { usuario, ctx, cockpit } = await exigirTenant("curar");

  const limpias = notas.trim();
  if (limpias.length > 2000) {
    return { ok: false, mensaje: "La nota es muy larga (máximo 2000 caracteres)." };
  }

  try {
    await guardarNotas(ctx, id, limpias);
    await registrarEvento(ctx, usuario.id, "candidatos.notas", { candidato: id, largo: limpias.length });
  } catch (e) {
    console.error(`[feed] falló guardar notas de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar la nota. Probá de nuevo." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/feed"));
  return { ok: true, mensaje: "Nota guardada." };
}

/**
 * 🔒 El cursor da la vuelta por el browser, así que entra como **input no confiable** y termina
 * dentro de la condición `or()` que arma `despuesDe`. Validarlo acá no es ceremonia: sin el
 * `uuid()`, un `id` con una coma corta la condición y le agrega cláusulas a la query.
 *
 * Lo que NO puede hacer, ni siquiera roto: salirse del tenant. El `.eq()` de `scoped` va como AND
 * al tope de la query y ningún `or` puede aflojarlo (ADR-047 Capa 1), y desde el flip las 17
 * policies lo evalúan otra vez contra la sesión (Capa 2). Esto cierra el escalón de arriba.
 */
const cursorSchema = z.object({
  heat: z.number().finite().nullable(),
  id: z.string().uuid(),
});

/** Una página más del mazo, con el filtro activo y el cursor de la última tarjeta en pantalla. */
export async function cargarMasFeed(
  filtro: string,
  cursor: unknown,
): Promise<
  { ok: true; candidatos: CandidatoFeed[]; hayMas: boolean } | { ok: false; mensaje: string }
> {
  const { ctx } = await exigirTenant("curar");

  if (!esFiltro(filtro)) return { ok: false, mensaje: "Ese filtro no existe." };

  // `null` es legítimo: es "dame la primera página", que es lo que pide un cambio de filtro.
  const validado = cursor === null ? { success: true as const, data: null } : cursorSchema.safeParse(cursor);
  if (!validado.success) return { ok: false, mensaje: "No se pudo continuar la lista. Recargá la página." };

  try {
    const { candidatos, hayMas } = await leerFeed(ctx, filtro, validado.data);
    return { ok: true, candidatos, hayMas };
  } catch (e) {
    console.error(`[feed] falló cargar más (${filtro}):`, e);
    return { ok: false, mensaje: "No se pudo cargar más. Probá de nuevo." };
  }
}

/**
 * Los tres campos largos de un candidato, cuando alguien abre su tarjeta.
 *
 * Existe porque mandarlos con el listado costaba **240 KB de los 337** por carga para dibujar
 * tarjetas que no los muestran (ver `CandidatoFeed`). Es un ida y vuelta por tarjeta abierta, y
 * abrir ya era el gesto excepcional: *"abrí la tarjeta solo si el título no te alcanza"*.
 */
export async function textosDeCandidato(
  id: string,
): Promise<{ ok: true; textos: TextosCandidato } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar");

  try {
    return { ok: true, textos: await leerTextos(ctx, id) };
  } catch (e) {
    console.error(`[feed] falló leer los textos de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo cargar el guion. Probá de nuevo." };
  }
}
