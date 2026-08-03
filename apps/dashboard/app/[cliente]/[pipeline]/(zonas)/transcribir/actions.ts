"use server";

import { comoRuta, rutaDe } from "@/domain/rutas";
import type { TenantContext } from "@/domain/tenant";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsearEnlaces } from "@/domain/enlace";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { transcribir, traducir } from "@/lib/transcribir";
import {
  contarPendientes,
  encolarEnlaces,
  marcarResultado,
  registrarEnDedup,
  tomarPendientes,
  type Transcripcion,
} from "@/lib/transcripciones";

export type ResultadoPegar = { ok: boolean; mensaje: string };

// Tope al pegote: 20k caracteres son ~400 links o un chat entero. Zod en todo input de usuario
// (plan-cockpit §5): un textarea abierto es exactamente el borde que el plan nombra.
const textoPegado = z.string().trim().min(1).max(20_000);

export async function pegarEnlaces(texto: string): Promise<ResultadoPegar> {
  const { usuario, ctx, cockpit } = await exigirTenant("transcribir");

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
    encolados = await encolarEnlaces(ctx, validos, usuario.id);
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

// Pool de 8 en paralelo con presupuesto de tiempo, misma idea que el nodo `Transcribir (Supadata)`
// del motor: no se ARRANCAN videos nuevos pasado el límite, los en vuelo terminan. Cada enlace se
// marca apenas vuelve, así que si Vercel corta la función a mitad no se pierde nada — la pasada
// siguiente agarra los que quedaron pendientes. Eso hace la herramienta reanudable por
// construcción y vuelve irrelevante el techo de maxDuration.
const CONCURRENCIA = 8;
const PRESUPUESTO_MS = 45_000;
const LOTE = 64;

export type ResultadoProcesar = { procesados: number; quedan: number };

export async function procesarPendientes(): Promise<ResultadoProcesar> {
  const { ctx, cockpit } = await exigirTenant("transcribir");

  // Nota: dos personas procesando a la vez pueden agarrar el mismo enlace y pagarlo dos veces
  // (~USD 0.014). No vale un estado 'procesando' para eso: los writes ya son idempotentes.
  const pendientes = await tomarPendientes(ctx, LOTE);
  if (pendientes.length === 0) return { procesados: 0, quedan: 0 };

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
