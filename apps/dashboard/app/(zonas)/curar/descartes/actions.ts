"use server";

import { esVeredicto } from "@/domain/feed";
import { exigirZona } from "@/lib/auth";
import { marcarVeredicto } from "@/lib/descartes";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// Auditar un descarte del gate (ADR-021). Escribe `veredicto` en Airtable, que es el único
// campo de esa tabla que lee una máquina: `Computar métricas semana` cuenta los "era bueno"
// como `falsos_negativos` al cerrar la semana.
//
// Igual que el feed, no revalida: la tarjeta marcada se queda en su lugar para poder corregir.

export async function auditarDescarte(id: string, veredicto: string): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  if (!esVeredicto(veredicto)) {
    return { ok: false, mensaje: "Ese veredicto no existe." };
  }

  try {
    await marcarVeredicto(id, veredicto);
    await registrarEvento(usuario.id, "descartes.auditar", { descarte: id, veredicto });
  } catch (e) {
    console.error(`[descartes] falló auditar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
  }

  return { ok: true, mensaje: "Guardado." };
}
