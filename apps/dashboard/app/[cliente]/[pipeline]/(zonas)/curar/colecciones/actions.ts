"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queFaltaEnriquecer, validarNombre } from "@/domain/colecciones";
import { parsearEnlaces, type EnlaceVideo } from "@/domain/enlace";
import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { traerMetadata, TOPE_POR_LOTE } from "@/lib/apify";
import { exigirTenant } from "@/lib/auth";
import {
  agregarMiembros,
  borrarColeccion,
  crearColeccion,
  leerMiembros,
  quitarMiembro,
} from "@/lib/colecciones";
import { registrarEvento } from "@/lib/eventos";
import { guardarMeta, leerLoQueSeSabe } from "@/lib/videos";

// Las acciones de Colecciones (ADR-073).
//
// ⚠️ **Todas reciben `enRuta` como primer parámetro.** Una server action no recibe los `params` de
// la ruta, así que sin esto `exigirTenant` resuelve el cockpit por el default de `resolverContexto`
// —*el primero que alcance*— y para todo `es_dueno` escribe en el tenant equivocado, sin error. El
// porqué largo (un bug de 3 días en prod) está en `lib/auth.ts`.

export type ResultadoAccion = { ok: boolean; mensaje: string };

/** Mismo tope que el pegote de Transcribir: 20k caracteres son ~400 links. */
const textoPegado = z.string().trim().min(1).max(20_000);
const uuid = z.string().uuid();

// ─────────────────────────────── La colección ───────────────────────────────

export async function crear(enRuta: CockpitEnRuta, nombre: string): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  const validado = validarNombre(nombre);
  if (!validado.ok) return { ok: false, mensaje: validado.motivo };

  try {
    const id = await crearColeccion(ctx, validado.nombre, usuario.id);
    await registrarEvento(ctx, usuario.id, "colecciones.crear", { id, nombre: validado.nombre });
  } catch (e) {
    if (e instanceof Error && e.message === "YA_EXISTE") {
      return { ok: false, mensaje: `Ya tenés una colección que se llama "${validado.nombre}".` };
    }
    console.error("[colecciones] falló crear:", e);
    return { ok: false, mensaje: "No se pudo crear la colección. Probá de nuevo." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/colecciones"));
  return { ok: true, mensaje: `Colección "${validado.nombre}" creada.` };
}

/**
 * Borra la colección entera.
 *
 * 🔑 **Lo que se pagó NO se va con ella.** El `on delete cascade` llega hasta `colecciones_videos`;
 * `app.videos_meta` y el guion limpio se quedan. La bolsa es descartable, la metadata comprada no.
 */
export async function borrar(enRuta: CockpitEnRuta, id: string): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(id).success) return { ok: false, mensaje: "Esa colección no existe." };

  try {
    await borrarColeccion(ctx, id);
  } catch (e) {
    console.error(`[colecciones] falló borrar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo borrar la colección. Probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "colecciones.borrar", { id });
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/colecciones"));
  return { ok: true, mensaje: "Colección borrada. Los guiones y la metadata siguen donde estaban." };
}

// ─────────────────────────────── Los miembros ───────────────────────────────

/**
 * Agrega videos pegando links, que es el idioma que esta app ya usa para *"hacer algo con muchos
 * ítems"* (el pegote de Transcribir, la carga masiva de Históricos).
 *
 * 🔴 **El orden importa: primero entran, después se enriquecen.** Si Apify se cae, los videos ya
 * están en la colección. Enriquecer es el adorno; agrupar es el trabajo (ADR-073 §5).
 */
export async function agregarPegados(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  texto: string,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) return { ok: false, mensaje: "Esa colección no existe." };

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

  let resultado;
  try {
    resultado = await agregarMiembros(ctx, coleccionId, validos);
  } catch (e) {
    console.error("[colecciones] falló agregar miembros:", e);
    return { ok: false, mensaje: "No se pudieron agregar los videos. Probá de nuevo." };
  }

  const traidos = await enriquecerLote(ctx, validos);

  await registrarEvento(ctx, usuario.id, "colecciones.agregar", {
    coleccion: coleccionId,
    detectados: validos.length,
    nuevos: resultado.nuevos,
    ya_estaban: resultado.yaEstaban,
    no_reconocidos: invalidos.length,
    enriquecidos: traidos,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));

  const partes = [`${resultado.nuevos} agregados`];
  if (resultado.yaEstaban > 0) partes.push(`${resultado.yaEstaban} ya estaban`);
  if (invalidos.length > 0) partes.push(`${invalidos.length} no reconocidos`);
  if (traidos > 0) partes.push(`${traidos} identificados`);
  return { ok: true, mensaje: partes.join(" · ") + "." };
}

export async function quitar(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  plataforma: "instagram" | "tiktok",
  externalId: string,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  const ok =
    uuid.safeParse(coleccionId).success && z.string().min(1).max(30).safeParse(externalId).success;
  if (!ok) return { ok: false, mensaje: "Ese video no se pudo identificar." };

  try {
    await quitarMiembro(ctx, coleccionId, plataforma, externalId);
  } catch (e) {
    console.error("[colecciones] falló quitar:", e);
    return { ok: false, mensaje: "No se pudo sacar el video. Probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "colecciones.quitar", {
    coleccion: coleccionId,
    video: `${plataforma}:${externalId}`,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));
  return { ok: true, mensaje: "Sacado de la colección." };
}

/**
 * Vuelve a intentar identificar los videos que quedaron pelados.
 *
 * Existe porque el enriquecimiento es **best-effort con presupuesto**: si Apify tardó, si el lote
 * era más grande que `TOPE_POR_LOTE`, o si estaba caído, quedan videos sin identificar. Sin este
 * botón la única salida sería sacarlos y volver a agregarlos.
 */
export async function identificarFaltantes(
  enRuta: CockpitEnRuta,
  coleccionId: string,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) return { ok: false, mensaje: "Esa colección no existe." };

  let miembros;
  try {
    miembros = await leerMiembros(ctx, coleccionId);
  } catch (e) {
    console.error("[colecciones] falló leer para identificar:", e);
    return { ok: false, mensaje: "No se pudo leer la colección. Probá de nuevo." };
  }

  const traidos = await enriquecerLote(ctx, miembros);
  await registrarEvento(ctx, usuario.id, "colecciones.identificar", {
    coleccion: coleccionId,
    enriquecidos: traidos,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));

  if (traidos === 0) {
    return { ok: false, mensaje: "No se pudo identificar ninguno. Probá de nuevo en un rato." };
  }
  return { ok: true, mensaje: `${traidos} identificados.` };
}

/**
 * Le compra a Apify solo lo que hace falta, y devuelve cuántos se llenaron.
 *
 * 🔴 **Es la única función del cockpit que gasta plata por su cuenta**, así que las tres guardias
 * están acá y no repartidas: se cruza contra lo que ya se sabe (`leerLoQueSeSabe`), se filtra por
 * *"no se puede identificar"* (`queFaltaEnriquecer`) y se corta en `TOPE_POR_LOTE`. Fail-open
 * entero: cualquier problema devuelve 0 y el llamador sigue.
 */
async function enriquecerLote(
  ctx: Awaited<ReturnType<typeof exigirTenant>>["ctx"],
  enlaces: readonly (EnlaceVideo | { url: string; plataforma: "instagram" | "tiktok"; external_id: string })[],
): Promise<number> {
  try {
    const seSabe = await leerLoQueSeSabe(ctx);
    const comoVideos = enlaces.map(
      (e) =>
        seSabe.get(`${e.plataforma}:${e.external_id}`) ?? {
          clave: `${e.plataforma}:${e.external_id}`,
          plataforma: e.plataforma,
          external_id: e.external_id,
          url: e.url,
          titulo: null, referente: null, thumbnail: null,
          views: null, likes: null, seguidores: null, idioma: null, heat: null,
        },
    );

    const faltan = queFaltaEnriquecer(comoVideos).slice(0, TOPE_POR_LOTE);
    if (faltan.length === 0) return 0;

    const metas = await traerMetadata(faltan.map((v) => v.url));
    await guardarMeta(ctx, metas);
    return metas.length;
  } catch (e) {
    console.error("[colecciones] el enriquecimiento falló entero:", e);
    return 0;
  }
}
