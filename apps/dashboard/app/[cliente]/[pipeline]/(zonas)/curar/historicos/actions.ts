"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aCsv } from "@/domain/csv";
import { claveDe, parsearEnlaces, type EnlaceVideo } from "@/domain/enlace";
import { armarRegistro, estaGrabada } from "@/domain/grabados";
import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { desmarcar, leerMarcas, marcar, marcarMuchos } from "@/lib/grabados";
import { leerTodosLosAprobados, textoDeHistorico } from "@/lib/historicos";

// El histórico dejó de ser solo lectura con ADR-070: acá el equipo marca qué guiones ya grabó y
// carga en masa los que grabó por fuera de la herramienta.

// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export type ResultadoAccion = { ok: boolean; mensaje: string };

const enlaceAMarcar = z.object({
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string().min(1).max(30),
  url: z.string().url().max(500),
});

/** Tope al pegote de la carga masiva: 20k caracteres son ~400 links, igual que en Transcribir. */
const textoPegado = z.string().trim().min(1).max(20_000);

/**
 * Prende o apaga la marca de "ya se grabó" desde el histórico.
 *
 * 🔑 **Esta acción es la razón de ser de ADR-070.** El mismo botón existe en Transcribir desde
 * ADR-069, pero allá recibía el id de la transcripción y por eso no podía existir acá: 55 de los 183
 * guiones del histórico vinieron del Feed y **no tienen fila en `app.transcripciones`**. Con la
 * clave del video, el acto es el mismo en las dos pantallas y escribe en el mismo lugar.
 */
export async function marcarGrabado(
  enRuta: CockpitEnRuta,
  enlace: EnlaceVideo,
  grabado: boolean,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  const parseo = enlaceAMarcar.safeParse(enlace);
  if (!parseo.success) return { ok: false, mensaje: "Ese enlace no se pudo identificar." };
  const video = parseo.data;

  try {
    if (grabado) await marcar(ctx, video);
    else await desmarcar(ctx, video.plataforma, video.external_id);
  } catch (e) {
    console.error(`[historicos] falló marcar grabado ${claveDe(video)}:`, e);
    return { ok: false, mensaje: "No se pudo guardar la marca. Probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "historicos.grabado", { video: claveDe(video), grabado });
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/historicos"));
  return { ok: true, mensaje: grabado ? "Marcado como grabado." : "Marca sacada." };
}

/**
 * La carga masiva: pegan una lista de links y todos quedan marcados como grabados (ADR-070 §6).
 *
 * 🔑 **No transcribe nada y no cuesta nada.** Es la diferencia con el pegote de Transcribir, que
 * está a un clic de pagarle a Supadata: acá solo entra la marca. Un link que el sistema nunca vio
 * queda como fila **huérfana** —sin guion, porque el equipo lo grabó por fuera— y aparece igual en
 * la lista y en el aviso del próximo pegote. Ese caso es el que ninguna columna podía representar.
 */
export async function marcarMuchosComoGrabados(
  enRuta: CockpitEnRuta,
  texto: string,
): Promise<ResultadoAccion> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

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
    resultado = await marcarMuchos(ctx, validos);
  } catch (e) {
    console.error("[historicos] falló la carga masiva de grabados:", e);
    return { ok: false, mensaje: "No se pudo guardar la lista. Probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "historicos.marcar_masivo", {
    detectados: validos.length,
    nuevos: resultado.nuevos,
    ya_estaban: resultado.yaEstaban,
    no_reconocidos: invalidos.length,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/historicos"));

  const partes = [`${resultado.nuevos} marcados como grabados`];
  if (resultado.yaEstaban > 0) partes.push(`${resultado.yaEstaban} ya estaban`);
  if (invalidos.length > 0) partes.push(`${invalidos.length} no reconocidos`);
  return { ok: true, mensaje: partes.join(" · ") + "." };
}

/** El guion de una fila, cuando alguien la abre. Ver `leerHistoricoCompleto`: la lista no lo trae. */
export async function verGuion(
  enRuta: CockpitEnRuta,
  id: string,
): Promise<{ ok: true; script: string | null } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, mensaje: "Ese guion no existe." };
  }
  try {
    return { ok: true, script: await textoDeHistorico(ctx, id) };
  } catch (e) {
    console.error(`[historicos] falló leer el guion ${id}:`, e);
    return { ok: false, mensaje: "No se pudo traer el guion. Probá de nuevo." };
  }
}

// ── Los dos CSV ──────────────────────────────────────────────────────────────
//
// Las 15 primeras columnas son las del Google Sheet Histórico, en su orden, y no es coincidencia:
// este CSV **es** el reemplazo del Sheet (ADR-057), así que quien tenga una planilla armada encima
// del export viejo la puede seguir usando. Salen de `Preparar filas Sheet` del archivado.
//
// `ESTADO` va aunque acá siempre valga `aprobado`: la columna existía en el Sheet, y una columna
// que desaparece rompe la planilla de quien la esté leyendo por posición.
//
// **`ORIGEN` (16) y `GRABADO EN` (17) se agregan AL FINAL, y eso no es estética.** Las 15 de arriba
// conservan su posición exacta, así que una planilla armada sobre el export viejo —que lee por
// posición— sigue funcionando. Meter una en el medio correría 12 columnas de lugar sin que nadie se
// entere hasta que los números de otro se movieran solos.
const COLUMNAS = [
  "FECHA CALIFICACION", "PROYECTO", "VOZ", "TITULO", "URL ORIGINAL", "SCRIPT", "IDIOMA",
  "VIEWS", "LIKES", "SEGUIDORES", "HEAT SCORE", "CALIFICACION", "ESTADO",
  "RELEVANCIA SCORE", "RELEVANCIA RAZON", "ORIGEN", "GRABADO EN",
] as const;

export type ResultadoCsv =
  | { ok: true; csv: string; nombre: string; filas: number; truncado: boolean }
  | { ok: false; mensaje: string };

/**
 * El histórico como CSV. `soloGrabados` decide qué filas trae; **las columnas son las mismas**.
 *
 * 🔑 **Los dos botones no traen el mismo universo, y es a propósito** (decidido con Mani el
 * 2026-08-20):
 *
 *  · **todo** → exactamente las filas que el histórico siempre trajo (los `outputs` aprobados) más
 *    la columna 17. Es el archivo que Dani ya abre: cambiarle las filas cambiaría qué significa *el
 *    histórico* para alguien que no pidió ningún cambio.
 *  · **solo grabados** → todo lo marcado, **incluidas las huérfanas** (los links cargados a mano,
 *    que no tienen guion y van con las celdas de texto vacías). Es un artefacto nuevo, sin
 *    consumidor previo, así que puede traerlas sin romperle nada a nadie — y sin ellas sería un
 *    parte incompleto de lo que el equipo grabó.
 *
 * Devuelve el texto y el cliente lo baja como archivo: no hace falta una route ni un endpoint
 * nuevo, y así el export pasa por **la misma guardia de tenant** que la pantalla, sin una segunda
 * copia de esa lógica que se pueda atrasar.
 */
export async function exportarCsv(
  enRuta: CockpitEnRuta,
  soloGrabados = false,
): Promise<ResultadoCsv> {
  const { ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  try {
    const [{ filas, truncado }, marcas] = await Promise.all([
      leerTodosLosAprobados(ctx),
      leerMarcas(ctx),
    ]);

    // Se arma el registro igual que la pantalla —con la misma función— para que el archivo y lo que
    // se ve no puedan divergir. Dos implementaciones del mismo cruce serían dos verdades.
    const registro = armarRegistro(filas, marcas);
    const aExportar = soloGrabados ? registro.filter(estaGrabada) : registro.filter((f) => f.tipo === "guion");

    const csv = aCsv(
      COLUMNAS,
      aExportar.map((f) =>
        f.tipo === "huerfana"
          ? // Una huérfana solo sabe tres cosas de sí misma. El resto van vacías en vez de
            // inventar un proyecto o un guion que no existen.
            [null, null, null, f.marca.url, f.marca.url, null, null,
             null, null, null, null, null, "aprobado",
             null, null, "cargado a mano", f.marca.grabadoEn]
          : [
              f.guion.calificadoEn, f.guion.proyecto, f.guion.voz, f.guion.titulo,
              f.guion.urlReferente, f.guion.script, f.guion.idioma,
              f.guion.views, f.guion.likes, f.guion.seguidores, f.guion.heat,
              f.guion.calificacion, "aprobado",
              f.guion.relevanciaScore, f.guion.relevanciaRazon, f.guion.origen, f.grabadoEn,
            ],
      ),
    );

    // El nombre lleva empresa, pipeline y fecha: con varios cockpits, dos descargas del mismo día
    // terminarían siendo `historicos.csv` y `historicos (1).csv` en la carpeta de alguien.
    const hoy = new Date().toISOString().slice(0, 10);
    const { cliente, pipeline } = comoRuta(cockpit);
    return {
      ok: true,
      csv,
      nombre: `${soloGrabados ? "grabados" : "historico"}-${cliente}-${pipeline}-${hoy}.csv`,
      filas: aExportar.length,
      truncado,
    };
  } catch (e) {
    console.error("[historicos] falló el export a CSV:", e);
    return { ok: false, mensaje: "No se pudo generar el archivo. Probá de nuevo." };
  }
}
