"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  esCalificacion,
  esFiltro,
  estadoDe,
  type CandidatoFeed,
  type TextosCandidato,
} from "@/domain/feed";
import { exigirTenant } from "@/lib/auth";
import { calificar, calificarMuchos, guardarNotas, leerFeed, leerTextos } from "@/lib/candidatos";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// 🩸 **Por qué todas estas acciones reciben `cockpit`** (2026-08-06). Una server action no recibe
// los `params` de la ruta, así que hasta hoy llamaban `exigirTenant("curar")` a secas y el cockpit
// se resolvía por el default de `resolverContexto`: *el primero que alcance*. Con `retia/reels`
// como única instancia activa eso acertaba siempre; desde que entraron las 3 de LinkedIn (03/08)
// el primero pasó a ser `30x/linkedin`, y para todo `es_dueno` **el feed de Retia escribía en el
// tenant de 30X**. Calificar dejó de funcionar sin decir una palabra: 175 candidatos, 0
// calificados, 0 eventos `candidatos.calificar` en 3 días.
//
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles, así que pedir uno ajeno rebota a `/`.
// El porqué largo está en `lib/auth.ts`.

// Calificar un candidato. Escribe en Postgres, que desde D7 es el dueño de la tabla
// (D6 cambia la superficie, no la propiedad).
//
// No se revalida la ruta a propósito: la tarjeta calificada tiene que **quedarse marcada en su
// lugar** hasta que alguien recargue o cambie de filtro (plan-cockpit §D6.4). Un
// `revalidatePath` acá la haría desaparecer de abajo del cursor y convertiría el misclick en
// algo irrecuperable desde la pantalla. El estado visible lo lleva el cliente; la verdad ya
// está escrita.

export async function calificarCandidato(
  enRuta: CockpitEnRuta,
  id: string,
  calificacion: string,
): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

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
 * Calificar en lote, desde el modo selección.
 *
 * 🔑 **Un solo evento y no N**, igual que `historicos.marcar_masivo`. Ochenta filas
 * `candidatos.calificar` idénticas al milisegundo no dicen nada que `{cuantos: 80}` no diga, y
 * arruinarían la única instrumentación que hoy contesta *¿alguien usa esto?* — que es cómo se supo
 * que las 288 marcas del 20/08 eran de Majo.
 *
 * ⚠️ **Calificar en lote es la acción con más filo de la barra**, y por eso es la única que la
 * pantalla confirma. Las otras tres se deshacen: quitar de una colección, desmarcar un grabado,
 * archivar (que ya pregunta). Un 👎 sobre 40 videos los manda a descartes en un clic.
 */
export async function calificarSeleccion(
  enRuta: CockpitEnRuta,
  ids: readonly string[],
  calificacion: string,
): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  if (!esCalificacion(calificacion)) return { ok: false, mensaje: "Esa calificación no existe." };
  const lista = z.array(z.string().uuid()).min(1).max(1_000).safeParse(ids);
  if (!lista.success) return { ok: false, mensaje: "No hay videos seleccionados." };

  let tocados: number;
  try {
    tocados = await calificarMuchos(ctx, lista.data, calificacion);
    await registrarEvento(ctx, usuario.id, "candidatos.calificar_masivo", {
      pedidos: lista.data.length,
      tocados,
      calificacion,
      estado: estadoDe(calificacion),
    });
  } catch (e) {
    console.error("[feed] falló calificar en lote:", e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
  }

  // Menos tocados que pedidos no es un error: el barrido pudo llevarse alguno mientras la pantalla
  // lo seguía mostrando. Se dice, no se esconde.
  const faltan = lista.data.length - tocados;
  return {
    ok: true,
    mensaje:
      faltan > 0
        ? `${tocados} calificados · ${faltan} ya no estaban en el feed.`
        : `${tocados} calificados.`,
  };
}

/**
 * Las notas del equipo: la válvula de escape de ADR-034 para lo que el emoji ya no distingue
 * ("buen video, pero no ahora"). Sobreviven al archivado en `outputs.metadata`.
 */
export async function guardarNotasCandidato(
  enRuta: CockpitEnRuta,
  id: string,
  notas: string,
): Promise<Resultado> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

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
 * El mazo entero de un filtro. **No pagina**, y eso es una decisión de producto de Mani (06/08):
 * el feed se recorre completo en una sentada, así que un botón de "cargar más" solo agrega un
 * click cada 25 tarjetas para llegar al mismo lugar.
 *
 * Lo que se borró con la paginación: el cursor keyset (`Cursor`/`despuesDe`/`cursorDe`), su
 * validación zod, `POR_PAGINA` y el `hayMas`. Nada de eso tenía otro consumidor.
 *
 * 📏 El techo: la respuesta entera son **175 filas = 103,7 KB** (06/08).
 * 🩸 **Este párrafo decía «no hay `db-max-rows` puesto, se verificó pidiéndolas sin `limit`», y es
 * FALSO.** Medido contra prod el 2026-08-31 sobre una tabla de 1.936 filas: `limit=1500`,
 * `limit=5000`, `limit=50000` y *sin* `limit` devuelven **las mismas 1.000**. El tope existe y es
 * 1.000. La verificación del 06/08 se hizo contra un conjunto de 175 filas, que está por debajo del
 * tope y por eso no lo podía detectar: *no probaba que no hubiera techo, probaba que no lo tocaba.*
 * Hoy el feed sigue muy por debajo (~408 candidatos vivos) así que el número está bien; lo que
 * estaba mal era el motivo, y el motivo es lo que sostiene la decisión de no paginar. Con un
 * archivado que barre cada domingo el estado estacionario es una semana de
 * supply (~145–175). El corte que hace que esto sea barato ya estaba hecho y es el que importa:
 * `CandidatoFeed` no lleva `script` ni las dos razones, que eran **240 KB de los 337**. Si algún
 * día el barrido se apaga o el supply se multiplica, el número a mirar es ese, no el de filas.
 *
 * 🔑 **El filtro sigue en la query, y por eso el mazo no necesita congelado.** `cargados` solo
 * cambia cuando se le pide algo al server —o sea al cambiar de filtro— y calificar no le pide
 * nada. Si el filtro volviera al cliente, una tarjeta recién calificada desaparecería de abajo del
 * cursor y habría que reponer el congelado de plan-cockpit §D6.4.
 */
export async function leerMazo(
  enRuta: CockpitEnRuta,
  filtro: string,
): Promise<{ ok: true; candidatos: CandidatoFeed[] } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  if (!esFiltro(filtro)) return { ok: false, mensaje: "Ese filtro no existe." };

  try {
    return { ok: true, candidatos: await leerFeed(ctx, filtro) };
  } catch (e) {
    console.error(`[feed] falló leer el mazo (${filtro}):`, e);
    return { ok: false, mensaje: "No se pudo cargar la lista. Probá de nuevo." };
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
  enRuta: CockpitEnRuta,
  id: string,
): Promise<{ ok: true; textos: TextosCandidato } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  try {
    return { ok: true, textos: await leerTextos(ctx, id) };
  } catch (e) {
    console.error(`[feed] falló leer los textos de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo cargar el guion. Probá de nuevo." };
  }
}
