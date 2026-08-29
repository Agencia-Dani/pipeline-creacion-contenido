"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enElOrdenPedido, queFaltaEnriquecer, validarNombre } from "@/domain/colecciones";
import type { GuionParaDocumento } from "@/domain/docx";
import { huellaDeCriterios } from "@/domain/limpieza";
import { parsearEnlaces, type EnlaceVideo } from "@/domain/enlace";
import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { traerMetadata, traerVideoUrls, TOPE_POR_LOTE } from "@/lib/apify";
import { exigirTenant } from "@/lib/auth";
import { aprobarSiEstanSinCalificar } from "@/lib/candidatos";
import {
  agregarMiembros,
  borrarColeccion,
  crearColeccion,
  leerColeccion,
  leerColecciones,
  leerMiembros,
  quitarMiembro,
  quitarMiembros,
} from "@/lib/colecciones";
import { registrarEvento } from "@/lib/eventos";
import { borrarLimpio, guardarLimpio, leerLimpios } from "@/lib/guiones-limpios";
import { leerCrudo } from "@/lib/guiones";
import { limpiar, MODELO } from "@/lib/limpiar";
import { leerVoces } from "@/lib/proyectos";
import { guardarMeta, leerLoQueSeSabe } from "@/lib/videos";

/** Presupuesto de una pasada de limpieza. Igual que el de Apify y por lo mismo: `maxDuration` es 60. */
const PRESUPUESTO_LIMPIEZA_MS = 45_000;

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
 * 🔴 **NO enriquece: solo agrega, y por eso es instantáneo.** El primer diseño llamaba a Apify acá
 * mismo, y medido contra el actor real eso tardó **~45 s con dos links** (el costo dominante es
 * arrancar el actor, no los items). Contra un presupuesto de 45 s y un `maxDuration` de 60, eso es
 * una carrera contra la plataforma que se pierde la mitad de las veces — y cuando se pierde, quien
 * pegó los links ve "0 identificados" sin entender por qué.
 *
 * El enriquecimiento se mudó a `identificarFaltantes`, que corre en pasadas con su propio
 * presupuesto y lo dispara solo `<Identificador>`. Es el mismo patrón que vacía la cola de
 * Transcribir (`procesador.tsx`), y por la misma razón.
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

  await registrarEvento(ctx, usuario.id, "colecciones.agregar", {
    coleccion: coleccionId,
    detectados: validos.length,
    nuevos: resultado.nuevos,
    ya_estaban: resultado.yaEstaban,
    no_reconocidos: invalidos.length,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));

  const partes = [`${resultado.nuevos} agregados`];
  if (resultado.yaEstaban > 0) partes.push(`${resultado.yaEstaban} ya estaban`);
  if (invalidos.length > 0) partes.push(`${invalidos.length} no reconocidos`);
  return { ok: true, mensaje: partes.join(" · ") + "." };
}

/**
 * Agregar a una colección lo que está **seleccionado en pantalla** (el modo selección).
 *
 * Es la puerta que faltaba: hasta el 2026-08-21 la única forma de armar una colección era pegar
 * links, así que agrupar un video que ya estaba a la vista costaba abrirlo, copiar su url, ir a
 * Colecciones y pegarla. Sirve a las cuatro pantallas que dibujan tarjetas, y por eso vive acá
 * —donde vive el sustantivo— y no repetida en cada zona.
 *
 * 🔒 **Recibe URLS, no llaves ya derivadas, y eso es deliberado.** El cliente podría mandar
 * `{plataforma, external_id}` armados, y sería una segunda derivación de la identidad viviendo en el
 * browser: confiable hasta que alguien edite el payload, y desincronizable de `parsearEnlaces` para
 * siempre. La identidad se calcula **acá**, con la misma función que usan el pegote, la cola y el
 * motor.
 *
 * `nombreNuevo` crea la colección en el mismo acto. Es lo que hace que agrupar desde el Feed sea un
 * gesto y no un trámite: quien está mirando un video no debería tener que irse a otra pantalla a
 * fabricar la bolsa antes de poder usarla.
 */
export async function agregarSeleccionados(
  enRuta: CockpitEnRuta,
  destino: { coleccionId: string } | { nombreNuevo: string },
  urls: readonly string[],
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  const lista = z.array(z.string().max(2_000)).max(1_000).safeParse(urls);
  if (!lista.success || lista.data.length === 0) {
    return { ok: false, mensaje: "No hay videos seleccionados." };
  }

  const { validos } = parsearEnlaces(lista.data.join("\n"));
  if (validos.length === 0) {
    return { ok: false, mensaje: "Ninguno de los videos seleccionados tiene un link reconocible." };
  }

  // Resolver el destino primero: crear y que después falle el agregado deja una colección vacía,
  // que es visible y se borra; agregar contra una colección que no existe no deja nada que arreglar.
  let coleccionId: string;
  let creada = false;
  if ("nombreNuevo" in destino) {
    const nombre = validarNombre(destino.nombreNuevo);
    if (!nombre.ok) return { ok: false, mensaje: nombre.motivo };
    try {
      coleccionId = await crearColeccion(ctx, nombre.nombre, usuario.id);
      creada = true;
    } catch (e) {
      if (e instanceof Error && e.message === "YA_EXISTE") {
        return { ok: false, mensaje: "Ya existe una colección con ese nombre." };
      }
      console.error("[colecciones] falló crear al agregar seleccionados:", e);
      return { ok: false, mensaje: "No se pudo crear la colección. Probá de nuevo." };
    }
    await registrarEvento(ctx, usuario.id, "colecciones.crear", { coleccion: coleccionId });
  } else {
    if (!uuid.safeParse(destino.coleccionId).success) {
      return { ok: false, mensaje: "Esa colección no existe." };
    }
    coleccionId = destino.coleccionId;
  }

  let resultado;
  try {
    resultado = await agregarMiembros(ctx, coleccionId, validos);
  } catch (e) {
    console.error("[colecciones] falló agregar seleccionados:", e);
    return { ok: false, mensaje: "No se pudieron agregar los videos. Probá de nuevo." };
  }

  // ADR-075: agrupar es aprobar. Va **después** del agregado y es sumidero — si esto falla, el
  // video ya está en la colección, que es lo que la persona pidió.
  const aprobados = await aprobarSiEstanSinCalificar(ctx, validos);

  await registrarEvento(ctx, usuario.id, "colecciones.agregar", {
    coleccion: coleccionId,
    origen: "seleccion",
    detectados: validos.length,
    nuevos: resultado.nuevos,
    ya_estaban: resultado.yaEstaban,
    aprobados,
  });

  const ruta = comoRuta(cockpit);
  revalidatePath(rutaDe(ruta, `curar/colecciones/${coleccionId}`));
  revalidatePath(rutaDe(ruta, "curar/colecciones"));
  // El Feed cambia si se aprobó algo: esas tarjetas salen del filtro "sin calificar".
  if (aprobados > 0) revalidatePath(rutaDe(ruta, "curar/feed"));

  const partes = [`${resultado.nuevos} agregados`];
  if (resultado.yaEstaban > 0) partes.push(`${resultado.yaEstaban} ya estaban`);
  if (aprobados > 0) partes.push(`${aprobados} quedaron en 👍`);
  return {
    ok: true,
    mensaje: (creada ? "Colección creada · " : "") + partes.join(" · ") + ".",
  };
}

/** Para el selector del modo selección: qué colecciones hay para elegir. */
export async function coleccionesParaElegir(
  enRuta: CockpitEnRuta,
): Promise<{ id: string; nombre: string }[]> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  try {
    return (await leerColecciones(ctx)).map((c) => ({ id: c.id, nombre: c.nombre }));
  } catch (e) {
    console.error("[colecciones] no se pudieron listar para elegir:", e);
    return [];
  }
}

/**
 * Saca de la colección lo que está seleccionado.
 *
 * 🔓 **Sin confirmación**, y es la decisión de ADR-073 aplicada: la bolsa es descartable. Sacar un
 * video de una colección no toca su guion, ni su limpio, ni la metadata que se le compró — se
 * deshace volviéndolo a agregar, y agregarlo no vuelve a pagar (la PK de `videos_meta` es la
 * guardia). Lo que no vuelve se pregunta; esto vuelve.
 *
 * Recibe **claves** (`plataforma:external_id`) y no urls: acá los videos ya están adentro, así que
 * su identidad ya se derivó al agregarlos. Se re-valida igual, porque viene del browser.
 */
export async function quitarSeleccionados(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  claves: readonly string[],
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) return { ok: false, mensaje: "Esa colección no existe." };

  const enlaces: { plataforma: "instagram" | "tiktok"; external_id: string }[] = [];
  for (const clave of claves.slice(0, 1_000)) {
    const [plataforma, externalId] = clave.split(":");
    if ((plataforma !== "instagram" && plataforma !== "tiktok") || !externalId) continue;
    if (!z.string().min(1).max(30).safeParse(externalId).success) continue;
    enlaces.push({ plataforma, external_id: externalId });
  }
  if (enlaces.length === 0) return { ok: false, mensaje: "No hay videos seleccionados." };

  let idas: number;
  try {
    idas = await quitarMiembros(ctx, coleccionId, enlaces);
  } catch (e) {
    console.error("[colecciones] falló quitar seleccionados:", e);
    return { ok: false, mensaje: "No se pudieron sacar los videos. Probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "colecciones.quitar", {
    coleccion: coleccionId,
    origen: "seleccion",
    pedidos: enlaces.length,
    idas,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));
  return { ok: true, mensaje: `${idas} ${idas === 1 ? "video sacado" : "videos sacados"} de la colección.` };
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
 * Una pasada de identificación: le compra a Apify hasta `TOPE_POR_LOTE` videos de los que están
 * pelados, y devuelve cuántos trajo y cuántos siguen faltando.
 *
 * 🔑 **Devuelve conteos y no solo un mensaje** porque quien la llama es un bucle
 * (`<Identificador>`): necesita saber si la pasada movió la aguja para decidir si sigue o corta.
 * Una pasada que trae 0 corta el bucle — mejor eso que girar en vacío gastando llamadas.
 */
export async function identificarFaltantes(
  enRuta: CockpitEnRuta,
  coleccionId: string,
): Promise<ResultadoAccion & { identificados: number; quedan: number }> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) {
    return { ok: false, mensaje: "Esa colección no existe.", identificados: 0, quedan: 0 };
  }

  let miembros;
  try {
    miembros = await leerMiembros(ctx, coleccionId);
  } catch (e) {
    console.error("[colecciones] falló leer para identificar:", e);
    return { ok: false, mensaje: "No se pudo leer la colección.", identificados: 0, quedan: 0 };
  }

  const { traidos, faltaban } = await enriquecerLote(ctx, miembros);
  const quedan = Math.max(0, faltaban - traidos);

  await registrarEvento(ctx, usuario.id, "colecciones.identificar", {
    coleccion: coleccionId,
    enriquecidos: traidos,
    quedan,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));

  if (traidos === 0) {
    return {
      ok: false,
      mensaje: "No se pudo identificar ninguno. Probá de nuevo en un rato.",
      identificados: 0,
      quedan,
    };
  }
  return { ok: true, mensaje: `${traidos} identificados.`, identificados: traidos, quedan };
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
): Promise<{ traidos: number; faltaban: number }> {
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

    const todosLosQueFaltan = queFaltaEnriquecer(comoVideos);
    if (todosLosQueFaltan.length === 0) return { traidos: 0, faltaban: 0 };

    const lote = todosLosQueFaltan.slice(0, TOPE_POR_LOTE);
    const metas = await traerMetadata(lote.map((v) => v.url));
    await guardarMeta(ctx, metas);
    return { traidos: metas.length, faltaban: todosLosQueFaltan.length };
  } catch (e) {
    console.error("[colecciones] el enriquecimiento falló entero:", e);
    return { traidos: 0, faltaban: 0 };
  }
}

// ─────────────────────────── La limpieza (ADR-074) ───────────────────────────

/**
 * Los dos guiones de un video, para el interruptor Crudo / Limpio.
 *
 * 🔑 **Se piden al abrir, no vienen con la grilla.** Es la regla del payload de `domain/feed.ts`,
 * medida en su momento: los textos largos eran 240 KB de los 337 que viajaban en cada carga, para
 * dibujar tarjetas que no los muestran. El limpio entra en el mismo saco.
 *
 * 🩸 **Devuelve `ok`, y no un par de `null`, porque los dos `null` MENTÍAN.** Hasta el 27/08 un
 * fallo leyendo Supabase salía por acá idéntico a un video sin guion, y la pantalla lo anunciaba
 * como *"El sistema no tiene el guion de este video"* — una afirmación sobre los datos hecha con
 * un error de lectura como única evidencia. El modo de falla no es que se rompa: es que **no se
 * rompe**, y alguien decide sobre un video creyendo que no tiene guion.
 *
 * La forma es la de `verGuion` de Históricos, que ya lo tenía resuelto: `{ ok }` discriminado, el
 * mensaje ya redactado para la pantalla, y el detalle técnico al log del servidor. Ausencia y
 * fallo son cosas distintas y desde acá se dicen distinto.
 */
export async function verGuiones(
  enRuta: CockpitEnRuta,
  plataforma: "instagram" | "tiktok",
  externalId: string,
): Promise<
  { ok: true; crudo: string | null; limpio: string | null } | { ok: false; mensaje: string }
> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  // Un id que no pasa el filtro no es un video sin guion: es un video que no existe.
  if (!z.string().min(1).max(30).safeParse(externalId).success) {
    return { ok: false, mensaje: "Ese video no existe." };
  }

  try {
    const [crudo, limpios] = await Promise.all([
      leerCrudo(ctx, plataforma, externalId),
      leerLimpios(ctx),
    ]);
    return { ok: true, crudo, limpio: limpios.get(`${plataforma}:${externalId}`)?.texto ?? null };
  } catch (e) {
    console.error("[colecciones] falló leer los guiones:", e);
    return { ok: false, mensaje: "No se pudo traer el guion. Probá de nuevo." };
  }
}

/** Las voces de la empresa, para elegir con cuál limpiar. */
export async function vocesParaLimpiar(
  enRuta: CockpitEnRuta,
): Promise<{ id: string; nombre: string; tienePerfil: boolean }[]> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  try {
    // 🔴 **Se listan TODAS, activas y apagadas.** `voces.activo` significa de facto "corre en
    // reels" y lo consume el plan del motor: filtrar por él acá escondería una voz perfectamente
    // válida para limpiar. Es la misma trampa que ADR-067 §2 documentó para LinkedIn.
    return (await leerVoces(ctx)).map((v) => ({
      id: v.id,
      nombre: v.nombre,
      tienePerfil: (v.perfil_limpieza ?? "").trim() !== "",
    }));
  } catch (e) {
    console.error("[colecciones] falló leer las voces:", e);
    return [];
  }
}

/**
 * Una pasada de limpieza sobre los videos de la colección que todavía no tienen guion limpio.
 *
 * 🔴 **Deliberada, no automática — al revés que `identificarFaltantes`.** Identificar es siempre
 * deseable y barato; limpiar es un acto con una decisión adentro (para qué voz) y un resultado que
 * alguien tiene que mirar. Por eso lo dispara un botón y no un `useEffect`.
 *
 * Corre con presupuesto y devuelve conteos, así que una colección grande se termina en varias
 * pasadas sin que la función de Vercel la corte por la mitad.
 */
export async function limpiarFaltantes(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  vozId: string | null,
): Promise<ResultadoAccion & { limpiados: number; quedan: number }> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) {
    return { ok: false, mensaje: "Esa colección no existe.", limpiados: 0, quedan: 0 };
  }
  if (vozId !== null && !uuid.safeParse(vozId).success) {
    return { ok: false, mensaje: "Esa voz no existe.", limpiados: 0, quedan: 0 };
  }

  let miembros;
  let yaLimpios;
  let perfil: string | null = null;
  try {
    [miembros, yaLimpios] = await Promise.all([leerMiembros(ctx, coleccionId), leerLimpios(ctx)]);
    if (vozId) {
      perfil = (await leerVoces(ctx)).find((v) => v.id === vozId)?.perfil_limpieza ?? null;
    }
  } catch (e) {
    console.error("[colecciones] falló preparar la limpieza:", e);
    return { ok: false, mensaje: "No se pudo leer la colección.", limpiados: 0, quedan: 0 };
  }

  const faltan = miembros.filter((m) => !yaLimpios.has(m.clave));
  if (faltan.length === 0) {
    return { ok: true, mensaje: "Ya están todos limpios.", limpiados: 0, quedan: 0 };
  }

  const huella = huellaDeCriterios(perfil);
  const hasta = Date.now() + PRESUPUESTO_LIMPIEZA_MS;
  let limpiados = 0;
  let sinGuion = 0;

  // Serial y no en pool: cada limpieza es una llamada larga a Haiku sobre un texto de hasta 6000
  // caracteres, y lo que se quiere acá no es throughput sino **no pasarse del presupuesto**. Una
  // pasada que hace 3 y devuelve el resto es mejor que una que arranca 8 y la corta Vercel a la
  // mitad, dejando llamadas pagadas cuyo resultado se tira.
  for (const m of faltan) {
    if (Date.now() > hasta) break;
    try {
      const crudo = await leerCrudo(ctx, m.plataforma, m.external_id);
      if (!crudo) {
        sinGuion++;
        continue;
      }
      const limpio = await limpiar(crudo, perfil);
      if (!limpio) continue;
      await guardarLimpio(ctx, m, {
        texto: limpio,
        modelo: MODELO,
        criteriosHash: huella,
        vozId,
        usuarioId: usuario.id,
      });
      limpiados++;
    } catch (e) {
      console.error(`[colecciones] falló limpiar ${m.clave}:`, e);
    }
  }

  await registrarEvento(ctx, usuario.id, "colecciones.limpiar", {
    coleccion: coleccionId,
    voz: vozId,
    limpiados,
    sin_guion: sinGuion,
    pedidos: faltan.length,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));

  // Los que no tienen guion NO cuentan como pendientes: volver a intentarlos no los va a hacer
  // aparecer. Sin esto el bucle del cliente giraría para siempre sobre los links cargados a mano.
  const quedan = Math.max(0, faltan.length - limpiados - sinGuion);

  if (limpiados === 0) {
    const motivo =
      sinGuion > 0
        ? `${sinGuion} de esos videos no tienen guion en el sistema: se cargaron a mano.`
        : "No se pudo limpiar ninguno. Probá de nuevo en un rato.";
    return { ok: false, mensaje: motivo, limpiados: 0, quedan };
  }

  const partes = [`${limpiados} limpiados`];
  if (sinGuion > 0) partes.push(`${sinGuion} sin guion`);
  if (quedan > 0) partes.push(`quedan ${quedan}`);
  return { ok: true, mensaje: partes.join(" · ") + ".", limpiados, quedan };
}

/** Tira el limpio de un video para poder rehacerlo. El crudo no se toca. */
export async function tirarLimpio(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  plataforma: "instagram" | "tiktok",
  externalId: string,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!z.string().min(1).max(30).safeParse(externalId).success) {
    return { ok: false, mensaje: "Ese video no se pudo identificar." };
  }
  try {
    await borrarLimpio(ctx, plataforma, externalId);
  } catch (e) {
    console.error("[colecciones] falló tirar el limpio:", e);
    return { ok: false, mensaje: "No se pudo borrar. Probá de nuevo." };
  }
  await registrarEvento(ctx, usuario.id, "colecciones.tirar_limpio", {
    video: `${plataforma}:${externalId}`,
  });
  revalidatePath(rutaDe(comoRuta(cockpit), `curar/colecciones/${coleccionId}`));
  return { ok: true, mensaje: "Limpio borrado. El guion original sigue igual." };
}


// ─────────────────────────── La descarga (Fase 5) ───────────────────────────

/** Mismo presupuesto que la limpieza, y por lo mismo: `maxDuration` es 60. */
const PRESUPUESTO_DESCARGA_MS = 45_000;

/**
 * Los guiones de una colección, listos para volverse un `.docx`.
 *
 * 🔑 **Devuelve DATOS, no un archivo**, que es el patrón de descarga que ya usa Históricos: el
 * `.docx` se arma en el cliente con `domain/docx.ts`. Así no viaja un blob por la red, no hace falta
 * una route nueva, y la descarga pasa por la misma guardia de tenant que todo lo demás.
 *
 * Prefiere el **limpio** cuando existe y cae al crudo cuando no, y el documento dice cuál es (ADR-074).
 * Buscar el limpio primero además ahorra trabajo: solo se va a buscar el crudo de lo que no se limpió.
 *
 * ⏳ **Con presupuesto, como la limpieza.** `leerCrudo` puede terminar barriendo `outputs` por cada
 * video sin transcripción propia, así que una colección grande podría pasarse del techo de Vercel.
 * Se corta y **se avisa** con `truncado`, en vez de tumbar el request en silencio.
 *
 * 📄 **`claves` es lo que la pantalla está mostrando, en su orden** (pedido de Majo, 28/08: el
 * documento salía en orden de inserción mientras la barra de ADR-076 ordenaba solo la pantalla).
 * Se aplica **antes** del presupuesto y no después, a propósito: si el cliente reordenara el
 * resultado, lo que el corte tira seguiría siendo la cola del orden de inserción y un documento
 * truncado diría en silencio que esos son los más vistos. `null` = el orden de siempre.
 */
export async function descargar(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  claves: readonly string[] | null = null,
): Promise<
  | { ok: true; nombre: string; guiones: GuionParaDocumento[]; truncado: boolean }
  | { ok: false; mensaje: string }
> {
  const { usuario, ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) return { ok: false, mensaje: "Esa colección no existe." };

  try {
    const coleccion = await leerColeccion(ctx, coleccionId);
    if (!coleccion) return { ok: false, mensaje: "Esa colección no existe." };

    const [miembros, seSabe, limpios] = await Promise.all([
      leerMiembros(ctx, coleccionId),
      leerLoQueSeSabe(ctx),
      leerLimpios(ctx),
    ]);

    const hasta = Date.now() + PRESUPUESTO_DESCARGA_MS;
    const guiones: GuionParaDocumento[] = [];
    let truncado = false;

    for (const m of enElOrdenPedido(miembros, claves)) {
      const video = seSabe.get(m.clave);
      const limpio = limpios.get(m.clave)?.texto ?? null;
      if (limpio === null && Date.now() > hasta) {
        truncado = true;
        break;
      }
      guiones.push({
        titulo: video?.titulo ?? null,
        referente: video?.referente ?? null,
        url: m.url,
        texto: limpio ?? (await leerCrudo(ctx, m.plataforma, m.external_id)),
        limpio: limpio !== null,
      });
    }

    await registrarEvento(ctx, usuario.id, "colecciones.descargar", {
      coleccion: coleccionId,
      videos: guiones.length,
      limpios: guiones.filter((g) => g.limpio).length,
      truncado,
    });

    return { ok: true, nombre: coleccion.nombre, guiones, truncado };
  } catch (e) {
    console.error("[colecciones] falló preparar la descarga:", e);
    return { ok: false, mensaje: "No se pudo preparar el documento. Probá de nuevo." };
  }
}


// ──────────────────── Bajar los videos (pedido de Majo / JP Vieira, 28/08) ────────────────────

/**
 * Las URLs de mp4 de los videos elegidos, listas para que el browser los baje.
 *
 * 🔑 **Por qué existe.** Un guion de referencia con explicaciones visuales (los de trading son el
 * caso que dio Majo) **no se sostiene solo con el texto**: si el creador baja el post, el editor
 * queda con un script sin fundamento. Hoy ella lo resuelve a mano con `savefrom.net` y
 * `sssinstagram.com`, un video por vez y fuera de la herramienta.
 *
 * ⚠️ **Esto NO es un respaldo del sistema.** La decisión del 29/08 fue *bajar al disco, sin
 * guardar*: el archivo queda en la máquina de quien lo baja, no en el cockpit. Un video que nadie
 * bajó antes del takedown se pierde igual. La alternativa —copiarlos a Storage, ~1,9 GB por
 * colección de 57— es otro producto y necesita su propia decisión de costo.
 *
 * 🔴 **Se compra cada vez, y no hay dónde guardarlo.** La URL firmada vence en ~38 h (medido), o
 * sea menos que la cadencia semanal: una columna en `app.videos_meta` guardaría links muertos.
 *
 * 📸 **Solo Instagram.** El actor es `apify~instagram-scraper`. TikTok se devuelve contado en
 * `sinVideo` para poder decirlo, en vez de dejar tarjetas que no responden.
 */
export async function linksDeVideo(
  enRuta: CockpitEnRuta,
  coleccionId: string,
  claves: readonly string[],
): Promise<
  | { ok: true; porClave: Record<string, string>; sinVideo: number; recortado: boolean }
  | { ok: false; mensaje: string }
> {
  const { usuario, ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!uuid.safeParse(coleccionId).success) return { ok: false, mensaje: "Esa colección no existe." };
  if (claves.length === 0) return { ok: false, mensaje: "No hay videos elegidos." };

  try {
    const miembros = await leerMiembros(ctx, coleccionId);
    const pedidos = enElOrdenPedido(miembros, claves).filter((m) => m.plataforma === "instagram");

    // El costo dominante del actor es arrancar, así que va una sola corrida. Lo que pase del tope
    // se recorta y **se dice**: un lote silenciosamente incompleto es peor que uno chico.
    const recortado = pedidos.length > TOPE_POR_LOTE;
    const lote = pedidos.slice(0, TOPE_POR_LOTE);

    const videoUrls = await traerVideoUrls(lote.map((m) => m.url));

    const porClave: Record<string, string> = {};
    for (const m of lote) {
      const video = videoUrls.get(m.url);
      if (video) porClave[m.clave] = video;
    }

    const encontrados = Object.keys(porClave).length;
    await registrarEvento(ctx, usuario.id, "colecciones.bajar_videos", {
      coleccion: coleccionId,
      pedidos: claves.length,
      encontrados,
    });

    return { ok: true, porClave, sinVideo: claves.length - encontrados, recortado };
  } catch (e) {
    console.error("[colecciones] falló pedir los videos:", e);
    return { ok: false, mensaje: "No se pudieron pedir los videos. Probá de nuevo." };
  }
}
