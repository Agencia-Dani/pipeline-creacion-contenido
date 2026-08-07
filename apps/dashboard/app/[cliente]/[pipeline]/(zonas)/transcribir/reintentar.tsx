"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reintentarTranscripcion } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Devuelve a la cola un enlace que falló o volvió sin voz. Solo se dibuja en esos dos estados —
// reintentar un `listo` sería pagar de nuevo un guion que ya tenemos, y el servidor lo rechaza
// igual (`reencolar` filtra por estado).
//
// No hace falta un botón de "procesar": al volver la fila a `pendiente`, el `revalidatePath` de la
// acción vuelve a renderizar la página, el `Procesador` ve pendientes > 0 y arranca solo.
export function Reintentar({ id }: { id: string }) {
  const cockpit = usarCockpit();
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
          })
        }
      >
        {enviando ? "Reintentando…" : "Reintentar"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
