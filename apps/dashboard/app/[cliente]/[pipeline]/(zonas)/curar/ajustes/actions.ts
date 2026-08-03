"use server";

import { comoRuta, rutaDe } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { ajustesVisibles, validarAjuste } from "@/domain/ajustes";
import { exigirTenant } from "@/lib/auth";
import { guardarAjuste, leerAjustes } from "@/lib/ajustes";
import { registrarEvento } from "@/lib/eventos";

export type ResultadoGuardar = { ok: boolean; mensaje: string };

// La autoridad está en el servidor (plan-cockpit §3.2): la pantalla ya esconde los knobs que
// el rol no puede tocar, pero eso es cosmética. Acá se vuelve a leer la fila real y se vuelve
// a filtrar por rol — un POST a mano no alcanza para mover un knob de dev.
export async function guardar(clave: string, valor: string): Promise<ResultadoGuardar> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar");

  let filas;
  try {
    filas = await leerAjustes(ctx);
  } catch (e) {
    console.error("[ajustes] no se pudieron leer los knobs:", e);
    return { ok: false, mensaje: "No se pudo leer la configuración. Probá de nuevo." };
  }

  const fila = ajustesVisibles(filas, usuario.rol).find((f) => f.clave === clave);
  if (!fila) return { ok: false, mensaje: "Ese ajuste no existe o no lo podés editar." };

  const validacion = validarAjuste(clave, valor);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };
  if (validacion.valor === fila.valor) return { ok: true, mensaje: "Sin cambios." };

  try {
    await guardarAjuste(ctx, clave, validacion.valor);
  } catch (e) {
    console.error(`[ajustes] falló guardar ${clave}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Quién movió qué knob y desde qué valor: un peso mal puesto se nota corridas después,
  // y sin esto no hay forma de reconstruirlo (plan-cockpit C7).
  await registrarEvento(ctx, usuario.id, "ajustes.editar", {
    clave,
    anterior: fila.valor,
    nuevo: validacion.valor,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/ajustes"));
  return { ok: true, mensaje: "Guardado. Aplica en la próxima corrida." };
}
