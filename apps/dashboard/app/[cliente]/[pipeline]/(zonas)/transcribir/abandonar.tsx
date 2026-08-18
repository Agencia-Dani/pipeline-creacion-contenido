"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { abandonarTranscripcion } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// La otra salida de una fila fallada, al lado de `Reintentar` (ADR-062 §4).
//
// Reintentar sirve cuando el fallo fue transitorio. Cuando el video **no tiene voz** —el caso que
// pidió esto— reintentar no puede ganar nunca: la fila se queda ofreciendo un botón que pierde
// siempre. Abandonar la cierra y la deja como memoria, para que el mismo enlace no se vuelva a
// colar por el pegote ni se vuelva a pagar.
//
// **Pide confirmación porque no se deshace** (plan-cockpit §3.3: lo que no se puede deshacer se
// pregunta). Se confirma con un segundo clic en el mismo botón en vez de un modal: es la acción
// menos grave de las irreversibles, y un modal para una fila de una lista es más ruido que aviso.
export function Abandonar({ id }: { id: string }) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={enviando}
        onClick={() => {
          if (!confirmando) {
            setConfirmando(true);
            return;
          }
          startTransition(async () => {
            const r = await abandonarTranscripcion(cockpit, id);
            setError(r.ok ? null : r.mensaje);
            setConfirmando(false);
            // Igual que en `Reintentar`: el `revalidatePath` de la acción invalida el cache del
            // server, pero la lista que hay que repintar es la del cliente. Y también igual que
            // ahí, este refresh baja la cabecera con `abandonadas` ya sumada, que es lo que hace
            // que `tanda.tsx` recargue sus filas — sin eso la fila seguía ofreciendo el botón, y el
            // cuarto clic (este pide confirmación) devolvía un error sobre algo que sí se abandonó.
            if (r.ok) router.refresh();
          });
        }}
        onBlur={() => setConfirmando(false)}
      >
        {enviando ? "Abandonando…" : confirmando ? "¿Seguro? No se deshace" : "Abandonar"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
