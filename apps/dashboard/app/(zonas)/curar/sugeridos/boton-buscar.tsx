"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buscarAhora, type Resultado } from "./actions";

// Buscar cuesta créditos (Apify × 3 actores + el vetting con Haiku), así que el click pide
// confirmación explícita — mismo criterio que el ▶ del motor (plan-cockpit §3.3: lo que no se
// puede deshacer se pregunta).
//
// El botón vive acá y no en Operar a propósito: *Operar* es la máquina que trae videos, y esto
// trae cuentas. Se aprieta mirando la bandeja vacía, que es cuando se siente la falta.
export function BotonBuscar({ pendientes }: { pendientes: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const disparar = () => {
    setConfirmando(false);
    startTransition(async () => {
      setResultado(await buscarAhora());
    });
  };

  return (
    <div className="space-y-3">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Buscar gasta créditos. {pendientes > 0
              ? `Todavía hay ${pendientes} propuesta${pendientes === 1 ? "" : "s"} sin decidir — conviene resolverlas primero.`
              : "¿Seguro?"}
          </span>
          <Button onClick={disparar} disabled={enviando}>
            Sí, buscar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant={pendientes > 0 ? "outline" : "default"}
          onClick={() => setConfirmando(true)}
          disabled={enviando}
        >
          {enviando ? "Enviando señal…" : "Buscar cuentas nuevas"}
        </Button>
      )}
      {resultado && (
        <Alert variant={resultado.ok ? "default" : "destructive"}>
          <AlertDescription>{resultado.mensaje}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
