"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { FilaEvento } from "@/lib/entender";
import { usarCockpit } from "../usar-cockpit";
import { cargarMasEventos } from "./actions";
import { Actividad } from "./secciones";

// El shell con estado del log de actividad, espejo de `historicos/lista.tsx`.
//
// Por qué es un componente aparte y `Actividad` sigue en `secciones.tsx`: las secciones de Entender
// son presentacionales a propósito (se renderizan con fixtures, que es como se verificaron en el
// cierre 60). El estado y el botón viven acá para no convertir ese archivo entero en client.

export function ActividadConMas({
  inicial,
  hayMasInicial,
}: {
  inicial: FilaEvento[];
  hayMasInicial: boolean;
}) {
  const [filas, setFilas] = useState(inicial);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [pagina, setPagina] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();
  const cockpit = usarCockpit();

  function mas() {
    setError(null);
    startTransition(async () => {
      const r = await cargarMasEventos(cockpit, pagina + 1);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setFilas((previas) => [...previas, ...r.filas]);
      setHayMas(r.hayMas);
      setPagina((p) => p + 1);
    });
  }

  return (
    <div className="space-y-3">
      <Actividad filas={filas} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {hayMas && (
        <Button variant="outline" size="sm" onClick={mas} disabled={cargando}>
          {cargando ? "Cargando…" : "Cargar más"}
        </Button>
      )}
    </div>
  );
}
