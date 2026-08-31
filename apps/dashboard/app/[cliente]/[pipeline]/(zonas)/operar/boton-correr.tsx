"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { correrAhora, type ResultadoDisparo } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Correr cuesta créditos (Apify + transcripción) aunque no entregue nada nuevo:
// por eso el click pide confirmación explícita (plan-cockpit §3.3).
export function BotonCorrer({ deshabilitado }: { deshabilitado: boolean }) {
  const cockpit = usarCockpit();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);
  const [enviando, startTransition] = useTransition();

  const disparar = () => {
    setConfirmando(false);
    startTransition(async () => {
      setResultado(await correrAhora(cockpit));
    });
  };

  if (deshabilitado) {
    return (
      <Button disabled>Hay una corrida en curso — esperá a que termine</Button>
    );
  }

  return (
    <div className="space-y-3">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Correr gasta créditos aunque no haya videos nuevos. ¿Seguro?
          </span>
          <Button onClick={disparar} disabled={enviando}>
            Sí, correr
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button onClick={() => setConfirmando(true)} disabled={enviando}>
          {enviando ? "Enviando señal…" : "▶ Buscar contenido"}
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
