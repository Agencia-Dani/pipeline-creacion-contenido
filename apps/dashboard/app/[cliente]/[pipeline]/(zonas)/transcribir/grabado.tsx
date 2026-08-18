"use client";

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
// 🎨 **El botón NO es el indicador de estado: eso lo dice el badge `✓ Grabado` de `Fila`.** Primero
// se intentó que el botón fuera las dos cosas (relleno cuando está marcado) y no alcanzaba — el
// cambio de fondo en un botón `sm` es casi imperceptible, y Mani reportó dos veces que "no hay
// manera de saber si se marcó". La separación correcta es la de siempre: **el estado se muestra
// fuerte, la acción se ofrece callada**. Por eso acá el botón se vuelve `ghost` cuando ya está
// marcado (es una salida, no el protagonista) y dice literalmente qué hace, no en qué estado está.
//
// Se ofrece en TODA fila y no solo en las `listo`: si alguien grabó el video antes de que llegara su
// transcripción, la herramienta no tiene por qué discutírselo.
//
// 🩸 **El estado lo lleva `Fila` y NO se refresca con `router.refresh()`, y eso es un arreglo, no un
// atajo** (encontrado por Mani el 2026-08-18, apretando el botón en prod). Las filas de una tanda
// abierta viven en el `useState` de `tanda.tsx` — bajan una sola vez por `cargarTanda`, y `abrir()`
// tiene un `if (filas) return` que impide recargarlas. `router.refresh()` re-renderiza **server
// components**: ese estado del cliente no lo toca ni puede tocarlo. La marca entraba a la base
// (verificado: `grabado_en` escrito) y **la pantalla no cambiaba nada**, que es el peor de los dos
// mundos — el operador vuelve a apretar creyendo que falló.
//
// Es el mismo patrón que `titulo` en `tanda.tsx`, con el mismo comentario: **el `revalidatePath` de
// la acción sirve para la próxima carga entera; lo que se ve ahora lo pinta el cliente.**
export function Grabado({
  id,
  grabado,
  onCambio,
}: {
  id: string;
  grabado: boolean;
  onCambio: (grabado: boolean) => void;
}) {
  const cockpit = usarCockpit();
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={grabado ? "ghost" : "outline"}
        size="sm"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const r = await marcarComoGrabada(cockpit, id, !grabado);
            if (r.ok) {
              setError(null);
              onCambio(!grabado);
              return;
            }
            setError(r.mensaje);
          })
        }
      >
        {enviando ? "Guardando…" : grabado ? "Sacar la marca de grabado" : "Marcar como grabado"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
