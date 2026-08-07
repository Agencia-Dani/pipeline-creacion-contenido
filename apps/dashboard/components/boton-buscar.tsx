"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buscarAhora, type ResultadoDisparo } from "@/app/[cliente]/[pipeline]/(zonas)/operar/actions";
import { usarCockpit } from "@/app/[cliente]/[pipeline]/(zonas)/usar-cockpit";

// Buscar cuesta créditos (Apify × 3 actores + el vetting con Haiku), así que el click pide
// confirmación explícita — mismo criterio que el ▶ del motor (plan-cockpit §3.3: lo que no se
// puede deshacer se pregunta).
//
// Vive en `components/` porque lo renderizan DOS zonas: **Operar**, que es donde se disparan las
// máquinas y donde el equipo lo va a buscar, y **Curar → Sugeridos**, que es donde se siente la
// falta al mirar la bandeja vacía. Es el mismo componente en los dos lados, no una copia.
//
// (Estuvo escrito y sin renderizar desde el commit que lo creó: nadie lo importaba. Por eso el
// conteo de pendientes entra por prop y no lo lee él — así la página que lo monta tiene que
// decidir explícitamente qué mostrarle, y un botón huérfano no compila en silencio.)
export function BotonBuscar({ pendientes }: { pendientes: number }) {
  const cockpit = usarCockpit();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);
  const [enviando, startTransition] = useTransition();

  const disparar = () => {
    setConfirmando(false);
    startTransition(async () => {
      setResultado(await buscarAhora(cockpit));
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
