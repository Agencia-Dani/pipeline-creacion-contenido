"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
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
// 🩸 **`useMemo` y no un objeto literal, y no es cosmética: sin él la pantalla se cuelga.** Un
// literal nuevo por render hace que el hook devuelva una IDENTIDAD distinta cada vez, y cualquier
// `useEffect` que lo tenga en sus dependencias se re-dispara en cada render. Si además ese effect
// llama un setter en su cuerpo, el ciclo se cierra: setter → render → identidad nueva → cleanup
// cancela la corrida en vuelo → setter → … y la respuesta que llega SIEMPRE encuentra su corrida
// cancelada. Es lo que dejó el modal de guiones de Colecciones en un skeleton eterno (26/08).
// El hermano de `historicos/lista.tsx` tenía el mismo defecto con síntoma más suave —pedía el
// guion dos veces y lo mostraba— porque sus setters viven en el `.then()` y no en el cuerpo.
// Se arregla acá, en el hook, y no en cada consumidor: los 40 archivos que lo llaman no tienen
// por qué saber que devolver un objeto es peligroso.
export function usarCockpit(): CockpitEnRuta {
  const params = useParams<{ cliente: string; pipeline: string }>();
  return useMemo(
    () => ({ cliente: params.cliente, pipeline: params.pipeline }),
    [params.cliente, params.pipeline],
  );
}
