"use server";

import type { CockpitEnRuta } from "@/domain/rutas";
import { exigirTenant } from "@/lib/auth";
import { leerEventos, type FilaEvento } from "@/lib/entender";

// Una tanda más del log de actividad. Solo lectura.
//
// 🩸 **Recibe `enRuta` y no lo resuelve solo** (mismo motivo que `historicos/actions.ts`): una
// server action no recibe los `params` de la ruta, así que `exigirTenant(zona)` a secas caía al
// default de `resolverContexto` —*el primero que alcance*— y desde que entraron las instancias de
// LinkedIn ese primero es `30x/linkedin`. El cockpit viaja desde el cliente y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles.
//
// El gate de dev NO se repite acá a mano: `exigirTenant("entender", …)` es la misma guardia que la
// pantalla, y `Actividad` solo se dibuja para dev. Duplicar el `rol === "dev"` en la action sería
// una segunda copia de la regla que se puede atrasar.
export async function cargarMasEventos(
  enRuta: CockpitEnRuta,
  pagina: number,
): Promise<{ ok: true; filas: FilaEvento[]; hayMas: boolean } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("entender", enRuta.cliente, enRuta.pipeline);

  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 500) {
    return { ok: false, mensaje: "Página inválida." };
  }

  try {
    return { ok: true, ...(await leerEventos(ctx, pagina)) };
  } catch (e) {
    console.error(`[entender] falló cargar la página ${pagina} de actividad:`, e);
    return { ok: false, mensaje: "No se pudo cargar más actividad. Probá de nuevo." };
  }
}
