"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { marcarComoGrabada } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// El interruptor de "ya se grabó" (ADR-069).
//
// 🩸 **De dónde sale.** Majo reportó que la herramienta devolvía videos ya grabados. Se midió y la
// herramienta no repetía nada —977 filas en `processed_items` con 977 ids distintos, y los 12
// pegotes con `ya_estaban: 0`— pero el hecho de abajo era cierto: el equipo grabó videos que después
// volvieron a aparecer en una lista, y **el sistema no tenía dónde anotarlo**. El ciclo se cortaba
// en la calificación: un guion salía hacia un Google Doc, se grababa, y nada volvía.
//
// 🔓 **Sin confirmación, al revés que `Abandonar` que está al lado.** Aquel pregunta porque no se
// deshace; este se deshace con el mismo clic. Un modal acá sería ruido sobre un acto que no destruye
// nada — es plan-cockpit §3.3 en su otra dirección.
//
// Se ofrece en TODA fila y no solo en las `listo`: si alguien grabó el video antes de que llegara su
// transcripción, la herramienta no tiene por qué discutírselo.
export function Grabado({ id, grabado }: { id: string; grabado: boolean }) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={grabado ? "secondary" : "ghost"}
        size="sm"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const r = await marcarComoGrabada(cockpit, id, !grabado);
            setError(r.ok ? null : r.mensaje);
            // Igual que en `Reintentar` y `Abandonar`: el `revalidatePath` de la acción invalida el
            // cache del server, pero la lista que hay que repintar es la del cliente.
            if (r.ok) router.refresh();
          })
        }
      >
        {enviando ? "Guardando…" : grabado ? "✓ Grabado" : "Marcar como grabado"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
