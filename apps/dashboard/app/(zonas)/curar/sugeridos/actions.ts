"use server";

import { revalidatePath } from "next/cache";
import { esPlataforma, validarReferente } from "@/domain/referentes";
import { exigirZona } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { hayBusquedaViva } from "@/lib/descubrimiento";
import { buscarPorHandle, crearReferente, leerProyectos } from "@/lib/referentes";
import { leerPendientes, marcarResuelto, notaDePromocion } from "@/lib/sugeridos";

export type Resultado = { ok: boolean; mensaje: string };

// Aprobar = sembrar el referente en el banco y cerrar la propuesta. Es el trabajo que hacían
// `Preparar promoción` + `POST Referentes (promoción)` del descubrimiento — 4 nodos que D7
// terminó de borrar. La propuesta va directo a `promovido`, nunca a `aprobado` (ver
// lib/sugeridos.ts: el vocabulario sobrevivió a la razón que lo creó, y está bien así).
//
// El orden importa: primero se crea el referente, después se cierra la propuesta. Si falla el
// segundo paso, la propuesta reaparece en la bandeja y el segundo intento avisa "ya está en el
// banco" — molesto, pero nadie pierde una cuenta. Al revés, un referente aprobado se perdería
// sin dejar rastro.

export async function aprobar(id: string, proyectoIds: string[]): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  let sugerido;
  try {
    sugerido = (await leerPendientes()).find((s) => s.id === id);
  } catch (e) {
    console.error("[sugeridos] no se pudo leer la bandeja:", e);
    return { ok: false, mensaje: "No se pudo leer las propuestas. Probá de nuevo." };
  }
  if (!sugerido) return { ok: false, mensaje: "Esa propuesta ya no está pendiente. Recargá la página." };

  const proyectos = await leerProyectos();
  const validacion = validarReferente(
    {
      handle: sugerido.handle,
      plataforma: esPlataforma(sugerido.plataforma) ? sugerido.plataforma : "instagram",
      proyectoIds,
      activo: true, // se aprueba para que empiece a traer videos, si no aprobar no hace nada
      notas: notaDePromocion(sugerido, new Date()),
    },
    new Set(proyectos.map((p) => p.id)),
  );
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const repetido = await buscarPorHandle(validacion.valor.handle, validacion.valor.plataforma);
    if (repetido) {
      // Ya estaba: se cierra la propuesta igual, si no vuelve a aparecer todas las semanas.
      await marcarResuelto(id, "promovido");
      revalidatePath("/curar/sugeridos");
      return { ok: true, mensaje: `${repetido.handle} ya estaba en el banco. La propuesta se cerró.` };
    }

    const referenteId = await crearReferente(validacion.valor);
    await marcarResuelto(id, "promovido");
    await registrarEvento(usuario.id, "sugeridos.aprobar", {
      propuesta: id,
      referenteId,
      handle: validacion.valor.handle,
      proyectoIds: validacion.valor.proyectoIds,
      afinidad: sugerido.afinidad,
    });
  } catch (e) {
    console.error(`[sugeridos] falló aprobar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo aprobar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath("/curar/sugeridos");
  revalidatePath("/curar/referentes");
  return { ok: true, mensaje: "Aprobada. Empieza a traer videos en la próxima corrida." };
}

export async function descartar(id: string): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  try {
    await marcarResuelto(id, "descartado");
    await registrarEvento(usuario.id, "sugeridos.descartar", { propuesta: id });
  } catch (e) {
    console.error(`[sugeridos] falló descartar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo descartar. Probá de nuevo." };
  }

  revalidatePath("/curar/sugeridos");
  return { ok: true, mensaje: "Descartada. No se vuelve a proponer." };
}

// ── Disparar la búsqueda ─────────────────────────────────────────────────────
//
// Señal desnuda al webhook del descubrimiento, mismo patrón que el ▶ del motor (ADR-023): sin
// payload, el workflow decide a quién buscar leyendo la config por la fachada. El header vive
// solo acá (BFF, único portador de secretos) y en n8n.

export async function buscarAhora(): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  const url = process.env.DESCUBRIMIENTO_WEBHOOK_URL;
  const nombre = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_NOMBRE;
  const valor = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_VALOR;
  if (!url || !nombre || !valor) {
    return { ok: false, mensaje: "Falta configurar el webhook del buscador (3 env vars del gestor). Avisale a un dev." };
  }

  // Preguntar antes de disparar: dos clicks son dos corridas de Apify pagas. Acá alcanza con esto
  // y no con el guard single-flight del motor porque hay un solo camino de entrada (este botón).
  if (await hayBusquedaViva()) {
    return { ok: false, mensaje: "Ya hay una búsqueda corriendo. Esperá a que termine (tarda unos minutos)." };
  }

  try {
    const res = await fetch(url, { method: "POST", headers: { [nombre]: valor } });
    if (res.status === 403) {
      // El gotcha documentado: header distinto al de la credencial de n8n = 403 en silencio.
      return { ok: false, mensaje: "El buscador rechazó la señal (403): el header no coincide con el de n8n. Avisale a un dev." };
    }
    if (!res.ok) return { ok: false, mensaje: `El buscador respondió ${res.status}. Avisale a un dev.` };
  } catch {
    return { ok: false, mensaje: "No se pudo llegar al buscador. ¿n8n está caído? Avisale a un dev." };
  }

  await registrarEvento(usuario.id, "sugeridos.buscar", {});
  revalidatePath("/curar/sugeridos");
  return { ok: true, mensaje: "Buscando. En unos minutos aparecen las propuestas nuevas acá — recargá la página." };
}
