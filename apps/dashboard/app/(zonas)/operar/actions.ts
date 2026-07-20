"use server";

import { revalidatePath } from "next/cache";
import { exigirZona } from "@/lib/auth";

export type ResultadoDisparo = { ok: boolean; mensaje: string };

// ▶ Correr ahora: señal desnuda al webhook del motor (ADR-023). Sin payload:
// el motor decide qué corre leyendo la config. El header vive solo acá (BFF,
// único portador de secretos) y en n8n — jamás en el browser ni en git.
export async function correrAhora(): Promise<ResultadoDisparo> {
  const usuario = await exigirZona("operar");

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
  revalidatePath("/operar");
  return {
    ok: true,
    // El 200 es "señal recibida", no el veredicto: si ya hay una corrida viva,
    // el guard single-flight del motor la ignora igual con 200 (ADR-023 C.3).
    mensaje: "Señal enviada. En unos segundos la corrida aparece abajo como “Corriendo”.",
  };
}
