"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { archivarAhora, type ResultadoDisparo } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Adelanta el archivado del domingo (ADR-062). Para cuando el equipo ya calificó y quiere el CSV hoy.
//
// 🩸 **La confirmación dice las TRES cosas que hace, no "¿seguro?".** El archivado no solo archiva:
// también saca del feed lo que archivó y **borra los sin calificar de más de 20 días**. Un botón
// que dijera solo "archivar" estaría escondiendo un borrado detrás de una palabra inocente — y a
// diferencia del ▶ del motor, acá lo que se pierde no es plata, es trabajo del equipo que nadie
// alcanzó a calificar.
//
// No cuesta créditos (no llama a Apify ni a Supadata), así que la confirmación es por lo que borra,
// no por lo que gasta.
export function BotonArchivar() {
  const cockpit = usarCockpit();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);
  const [enviando, startTransition] = useTransition();

  const disparar = () => {
    setConfirmando(false);
    startTransition(async () => {
      setResultado(await archivarAhora(cockpit));
    });
  };

  return (
    <div className="space-y-3">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Archiva lo calificado, lo saca del feed y descarta lo que quedó sin calificar hace más
            de 20 días. ¿Seguro?
          </span>
          <Button onClick={disparar} disabled={enviando}>
            Sí, archivar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirmando(true)} disabled={enviando}>
          {enviando ? "Enviando señal…" : "Archivar ahora"}
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
