"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import type { Video } from "@/domain/video";
import { cn } from "@/lib/utils";
import { usarCockpit } from "../../../usar-cockpit";
import { tirarLimpio, verGuiones } from "../actions";

// El interruptor Crudo / Limpio (ADR-074).
//
// 🔑 **Los dos conviven en la misma pantalla, y esa es la decisión del ADR entera.** El limpio es un
// artefacto NUEVO al lado del crudo, nunca encima: `app.candidatos.script` y
// `app.transcripciones.script` siguen siendo la transcripción literal de ADR-009.
//
// 🩸 **Y no es una precaución teórica.** Majo se topó con el modo de falla antes de que el feature
// existiera: un video con dos voces (una pregunta y su respuesta) al que la corrección le desarmó
// la estructura y lo volvió monólogo. El guion se veía mejor y era peor. Con los dos a un click,
// eso se descubre acá y no en grabación.

type Pestana = "crudo" | "limpio";

export function Guiones({
  coleccionId,
  video,
  tieneLimpio,
  onCerrar,
}: {
  /** Solo para revalidar la ruta después de tirar un limpio. El guion no es de la colección. */
  coleccionId: string;
  video: Video | null;
  tieneLimpio: boolean;
  onCerrar: () => void;
}) {
  const cockpit = usarCockpit();
  const [pestana, setPestana] = useState<Pestana>("crudo");
  const [textos, setTextos] = useState<{ crudo: string | null; limpio: string | null } | null>(null);
  const [borrando, startTransition] = useTransition();

  // Los textos se piden AL ABRIR, no vienen con la grilla: la regla del payload de `domain/feed.ts`,
  // medida en su momento en 240 KB de 337 por carga. El limpio entra en el mismo saco.
  useEffect(() => {
    if (!video) {
      setTextos(null);
      return;
    }
    let cancelado = false;
    setTextos(null);
    setPestana(tieneLimpio ? "limpio" : "crudo");
    verGuiones(cockpit, video.plataforma, video.external_id).then((r) => {
      if (!cancelado) setTextos(r);
    });
    return () => {
      cancelado = true;
    };
  }, [video, tieneLimpio, cockpit]);

  const activo = textos ? (pestana === "crudo" ? textos.crudo : textos.limpio) : null;

  return (
    <Modal
      abierto={video !== null}
      onCerrar={onCerrar}
      ancho="52rem"
      titulo={video?.titulo ?? "Sin título"}
      subtitulo={
        video && (
          <>
            {video.referente ?? "sin referente"}
            {video.idioma && ` · original en ${video.idioma}`}
          </>
        )
      }
      pie={
        <div className="flex flex-wrap items-center gap-2">
          <Copiar texto={activo ?? ""} />
          {video && (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Ver el video
            </a>
          )}
          {tieneLimpio && video && (
            // Sin confirmación: tirar el limpio se deshace volviéndolo a limpiar, y el crudo —que
            // es lo que costó Supadata y Haiku— no se toca. La regla de la casa es que lo que se
            // deshace no se pregunta.
            <Button
              variant="ghost"
              size="sm"
              disabled={borrando}
              onClick={() =>
                startTransition(async () => {
                  await tirarLimpio(cockpit, coleccionId, video.plataforma, video.external_id);
                  onCerrar();
                })
              }
              className="ml-auto text-muted-foreground"
            >
              {borrando ? "Borrando…" : "Tirar el limpio"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1 border-b">
          {(["crudo", "limpio"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              aria-pressed={pestana === p}
              className={cn(
                "-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors",
                pestana === p
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "crudo" ? "Crudo" : "Limpio"}
            </button>
          ))}
        </div>

        {textos === null ? (
          <div className="h-40 animate-pulse rounded-md bg-muted" />
        ) : activo ? (
          <p className="whitespace-pre-wrap text-sm">{activo}</p>
        ) : pestana === "limpio" ? (
          <p className="text-sm text-muted-foreground">
            Este guion todavía no se limpió. Elegí la voz arriba y apretá{" "}
            <strong>Limpiar los guiones</strong>.
          </p>
        ) : (
          // Un link cargado a mano NUNCA tuvo guion: se grabó por fuera de la herramienta. No hay
          // nada que reintentar, así que se dice y no se ofrece un botón que pierde siempre.
          <p className="text-sm text-muted-foreground">
            El sistema no tiene el guion de este video. Pasa cuando el link se cargó a mano en
            Históricos y nunca se transcribió.
          </p>
        )}
      </div>
    </Modal>
  );
}
