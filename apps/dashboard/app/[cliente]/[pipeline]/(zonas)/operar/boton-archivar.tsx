"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { archivarAhora, queHariaElArchivado, type ResultadoDisparo } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Adelanta el archivado del domingo (ADR-062). Para cuando el equipo ya calificó y quiere bajar el Excel hoy (el CSV murió en ADR-071).
//
// 🩸 **La confirmación dice las TRES cosas que hace, no "¿seguro?".** El archivado no solo archiva:
// también saca del feed lo que archivó y **borra los sin calificar de más de 20 días**. Un botón
// que dijera solo "archivar" estaría escondiendo un borrado detrás de una palabra inocente — y a
// diferencia del ▶ del motor, acá lo que se pierde no es plata, es trabajo del equipo que nadie
// alcanzó a calificar.
//
// No cuesta créditos (no llama a Apify ni a Supadata), así que la confirmación es por lo que borra,
// no por lo que gasta.
//
// 📏 **Y desde el 2026-08-21 la confirmación trae los NÚMEROS, contados en el momento.** La frase
// sola no alcanzaba: medido contra prod ese día, apretarlo archivaba **2** y borraba **67** — dos
// tercios del feed. *"Descarta lo que quedó sin calificar hace más de 20 días"* y *"borra 67"* son
// la misma información y solo una se lee.
//
// 🔀 **Se monta en DOS lugares** (ADR-062 lo puso en Operar; el Feed lo suma el 2026-08-21). En
// Operar porque es donde se disparan las máquinas; en el Feed porque es donde alguien termina de
// calificar y quiere ver el resultado ya, sin aprender que existe otra zona. Es el mismo componente,
// no una copia — igual que `<BotonBuscar>`.
export function BotonArchivar({ variante = "operar" }: { variante?: "operar" | "feed" }) {
  const cockpit = usarCockpit();
  const [confirmando, setConfirmando] = useState(false);
  const [cuentas, setCuentas] = useState<{ aprobados: number; aBorrar: number } | null>(null);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);
  const [enviando, startTransition] = useTransition();

  const preguntar = () => {
    setConfirmando(true);
    setCuentas(null);
    startTransition(async () => setCuentas(await queHariaElArchivado(cockpit)));
  };

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
          {/* 🔴 El borrado va en `text-destructive` y con el número adelante. Es lo único de esta
              frase que no se deshace: lo archivado queda en el histórico, lo borrado no vuelve. */}
          <span className="text-sm text-muted-foreground">
            {cuentas === null ? (
              "Archiva lo calificado, lo saca del feed y descarta lo que quedó sin calificar hace más de 20 días. ¿Seguro?"
            ) : (
              <>
                Manda <strong>{cuentas.aprobados}</strong> al histórico y{" "}
                <strong className="text-destructive">borra {cuentas.aBorrar}</strong> sin calificar
                de más de 20 días. ¿Seguro?
              </>
            )}
          </span>
          <Button onClick={disparar} disabled={enviando}>
            Sí, archivar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size={variante === "feed" ? "sm" : "default"}
          onClick={preguntar}
          disabled={enviando}
        >
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
