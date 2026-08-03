"use server";

import { exigirTenant } from "@/lib/auth";
import { leerAprobados, type Historico } from "@/lib/historicos";

// Una página más del histórico. Solo lectura: acá no se edita nada — lo aprobado ya se archivó
// y su verdad vive en `outputs` (ADR-014).

export async function cargarMas(
  pagina: number,
): Promise<{ ok: true; filas: Historico[]; hayMas: boolean } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar");

  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 500) {
    return { ok: false, mensaje: "Página inválida." };
  }

  try {
    const { filas, hayMas } = await leerAprobados(ctx, pagina);
    return { ok: true, filas, hayMas };
  } catch (e) {
    console.error(`[historicos] falló cargar la página ${pagina}:`, e);
    return { ok: false, mensaje: "No se pudo cargar más. Probá de nuevo." };
  }
}
