"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reintentarTranscripcion } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Devuelve a la cola un enlace que falló o volvió sin transcripción. Solo se dibuja en esos dos
// estados — reintentar un `listo` sería pagar de nuevo un guion que ya tenemos, y el servidor lo
// rechaza igual (`reencolar` filtra por estado).
//
// No hace falta un botón de "procesar": al volver la fila a `pendiente`, la página se vuelve a
// renderizar, el `Procesador` ve pendientes > 0 y arranca solo.
//
// 🩸 **El `router.refresh()` no es redundante con el `revalidatePath` de la acción** (medido el
// 2026-08-07). Se apretó el botón en prod: la fila volvió a `pendiente` y ahí se quedó, con
// `procesado_en` en `null` — o sea que el `Procesador` **nunca arrancó** y desde la pantalla el
// reintento "no hacía nada". El `revalidatePath` invalida el cache del server, pero acá lo que
// tiene que cambiar es el prop `pendientes` que dispara el efecto, y eso pide re-render del cliente.
// El pegote no lo notaba porque ahí el `setResultado`/`setTexto` ya provocaban uno.
//
// 🔁 **Y desde el 2026-08-18 ese mismo refresh es lo que repinta la fila.** Hasta entonces no lo
// hacía: dentro de una tanda abierta las filas viven en el `useState` de `tanda.tsx` y el refresh no
// las toca, así que esto escribía bien y la pantalla no acusaba recibo — el segundo clic devolvía
// *"Ese enlace ya no se puede reintentar"* sobre algo que había funcionado. El arreglo no está acá:
// `tanda.tsx` mira los contadores de su cabecera (que este refresh baja de nuevo) y recarga sus
// filas si cambiaron. Por eso este componente no necesita saber nada de la tanda que lo contiene.
export function Reintentar({ id }: { id: string }) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const r = await reintentarTranscripcion(cockpit, id);
            setError(r.ok ? null : r.mensaje);
            if (r.ok) router.refresh();
          })
        }
      >
        {enviando ? "Reintentando…" : "Reintentar"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
