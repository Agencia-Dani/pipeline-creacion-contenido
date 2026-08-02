"use server";

import { comoRuta, rutaDe } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { exigirTenant } from "@/lib/auth";
import { hayBusquedaViva } from "@/lib/descubrimiento";
import { registrarEvento } from "@/lib/eventos";

// Las DOS señales que disparan una máquina viven acá, juntas y guardadas por la misma zona.
// Antes `buscarAhora` estaba en `curar/sugeridos/actions.ts`, al lado de aprobar y descartar —
// pero aprobar es curar y disparar es operar, y esa mezcla es la que dejó el botón sin renderizar
// durante todo el commit que lo creó. Son gemelas: POST desnudo a un webhook de n8n, el workflow
// decide qué hacer leyendo su config por la fachada (ADR-023 + ADR-028).

export type ResultadoDisparo = { ok: boolean; mensaje: string };

// ▶ Correr ahora: señal desnuda al webhook del motor (ADR-023). Sin payload:
// el motor decide qué corre leyendo la config. El header vive solo acá (BFF,
// único portador de secretos) y en n8n — jamás en el browser ni en git.
export async function correrAhora(): Promise<ResultadoDisparo> {
  const { usuario, ctx, cockpit } = await exigirTenant("operar");

  const url = process.env.MOTOR_WEBHOOK_URL;
  const nombre = process.env.MOTOR_WEBHOOK_HEADER_NOMBRE;
  const valor = process.env.MOTOR_WEBHOOK_HEADER_VALOR;
  if (!url || !nombre || !valor) {
    return {
      ok: false,
      mensaje:
        "Falta configurar el webhook del motor (las 3 env vars del gestor). Avisale a un dev.",
    };
  }

  try {
    const res = await fetch(url, { method: "POST", headers: { [nombre]: valor } });
    if (res.status === 403) {
      // El gotcha documentado: header distinto al de la credencial de n8n = 403 en silencio.
      return {
        ok: false,
        mensaje:
          "El motor rechazó la señal (403): el header no coincide con el de n8n. Avisale a un dev.",
      };
    }
    if (!res.ok) {
      return { ok: false, mensaje: `El motor respondió ${res.status}. Avisale a un dev.` };
    }
  } catch {
    return { ok: false, mensaje: "No se pudo llegar al motor. ¿n8n está caído? Avisale a un dev." };
  }

  // Auditoría interina hasta app.eventos (D3): quién disparó, en los logs de Vercel (C7).
  console.log(`[operar] ${usuario.email} disparó ▶ Correr ahora`);
  revalidatePath(rutaDe(comoRuta(cockpit), "operar"));
  return {
    ok: true,
    // El 200 es "señal recibida", no el veredicto: si ya hay una corrida viva,
    // el guard single-flight del motor la ignora igual con 200 (ADR-023 C.3).
    mensaje: "Señal enviada. En unos segundos la corrida aparece abajo como “Corriendo”.",
  };
}

// ── Buscar cuentas nuevas ────────────────────────────────────────────────────
//
// El buscador de referentes perdió el cron de los lunes (enmienda de ADR-020) y pasó a ser este
// botón. Misma forma que el ▶ del motor: señal desnuda, sin payload, el header solo acá y en n8n.

export async function buscarAhora(): Promise<ResultadoDisparo> {
  const { usuario, ctx, cockpit } = await exigirTenant("operar");

  const url = process.env.DESCUBRIMIENTO_WEBHOOK_URL;
  const nombre = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_NOMBRE;
  const valor = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_VALOR;
  if (!url || !nombre || !valor) {
    return { ok: false, mensaje: "Falta configurar el webhook del buscador (3 env vars del gestor). Avisale a un dev." };
  }

  // Preguntar antes de disparar: dos clicks son dos corridas de Apify pagas. Acá alcanza con esto
  // y no con el guard single-flight del motor porque hay un solo camino de entrada (este botón).
  if (await hayBusquedaViva(ctx)) {
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

  await registrarEvento(ctx, usuario.id, "sugeridos.buscar", {});
  // Las dos, porque el botón vive en las dos pantallas: se dispara desde Operar y el resultado
  // se mira en Sugeridos.
  revalidatePath(rutaDe(comoRuta(cockpit), "operar"));
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/sugeridos"));
  return { ok: true, mensaje: "Buscando. En unos minutos aparecen las propuestas nuevas en Curar → Sugeridos." };
}
