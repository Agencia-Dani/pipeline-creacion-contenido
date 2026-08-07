"use server";

import { esVeredicto } from "@/domain/feed";
import type { CockpitEnRuta } from "@/domain/rutas";
import { exigirTenant } from "@/lib/auth";
import { marcarVeredicto } from "@/lib/descartes";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// Auditar un descarte del gate (ADR-021). Escribe `veredicto` en Postgres, que es el único
// campo de esa tabla que lee una máquina: `Computar métricas semana` cuenta los "era bueno"
// como `falsos_negativos` al cerrar la semana.
//
// Igual que el feed, no revalida: la tarjeta marcada se queda en su lugar para poder corregir.

// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export async function auditarDescarte(
  enRuta: CockpitEnRuta,
  id: string,
  veredicto: string,
): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  if (!esVeredicto(veredicto)) {
    return { ok: false, mensaje: "Ese veredicto no existe." };
  }

  try {
    await marcarVeredicto(ctx, id, veredicto);
    await registrarEvento(ctx, usuario.id, "descartes.auditar", { descarte: id, veredicto });
  } catch (e) {
    console.error(`[descartes] falló auditar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
  }

  return { ok: true, mensaje: "Guardado." };
}
