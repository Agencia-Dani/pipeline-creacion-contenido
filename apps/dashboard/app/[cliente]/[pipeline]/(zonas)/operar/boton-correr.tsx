"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { correrAhora, type ResultadoDisparo } from "./actions";

// Correr cuesta créditos (Apify + transcripción) aunque no entregue nada nuevo:
// por eso el click pide confirmación explícita (plan-cockpit §3.3).
export function BotonCorrer({ deshabilitado }: { deshabilitado: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);
  const [enviando, startTransition] = useTransition();

  const disparar = () => {
    setConfirmando(false);
    startTransition(async () => {
      setResultado(await correrAhora());
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
          {enviando ? "Enviando señal…" : "▶ Correr ahora"}
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
