"use client";

import { useParams } from "next/navigation";
import type { CockpitEnRuta } from "@/domain/rutas";

// El cockpit abierto, para los componentes cliente que arman links.
//
// Los server components lo reciben en `params` y lo bajan como dato; los client components están
// abajo del todo (una tarjeta adentro de un mazo adentro de una página) y hacer prop drilling de
// dos strings por tres niveles solo para armar un `href` sería peor que leerlo de la URL, que es
// **donde el tenant vive** desde la Fase 3.
//
// Vive colocado con las rutas y no en `lib/` a propósito: `lib/` es la costura de IO del servidor,
// y esto es un hook de browser que solo tiene sentido adentro de `[cliente]/[pipeline]`.
export function usarCockpit(): CockpitEnRuta {
  const params = useParams<{ cliente: string; pipeline: string }>();
  return { cliente: params.cliente, pipeline: params.pipeline };
}
