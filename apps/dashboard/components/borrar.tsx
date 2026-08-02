"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

// El control de borrar, uno solo para las tres pantallas que lo tienen (voz, proyecto, cuenta).
//
// Confirma EN EL LUGAR, no con un `window.confirm` ni con un segundo <dialog>: el botón se
// reemplaza a sí mismo por la pregunta y las dos salidas. El `confirm` nativo se ve como un error
// del browser y no se puede escribir en el idioma del equipo; un modal adentro del modal del record
// obliga a decidir dónde va el foco cuando se cierra el de arriba, que es maquinaria para una
// pregunta de una línea.
//
// El resultado se devuelve al padre en vez de mostrarse acá: el pie de cada formulario ya tiene un
// lugar donde va lo que dijo el servidor, y dos frases compitiendo en la misma barra es cómo se
// pierde justamente la que explica por qué NO se borró.

export function BotonBorrar({
  etiqueta,
  advertencia,
  onBorrar,
  onResultado,
  deshabilitado = false,
}: {
  /** Qué se borra, en la voz del equipo: «Borrar la voz», «Borrar el proyecto». */
  etiqueta: string;
  /** Lo que hay que saber ANTES de decir que sí. Una línea. */
  advertencia: string;
  onBorrar: () => Promise<{ ok: boolean; mensaje: string }>;
  onResultado: (resultado: { ok: boolean; mensaje: string }) => void;
  deshabilitado?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, startTransition] = useTransition();

  if (!confirmando) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirmando(true)}
        disabled={deshabilitado || enviando}
      >
        {etiqueta}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-muted-foreground">{advertencia}</p>
      <Button
        variant="destructive"
        size="sm"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const r = await onBorrar();
            // Al rechazo se vuelve al estado inicial: el motivo lo muestra el padre y quedarse en
            // «¿seguro?» después de un no invita a insistir con el mismo click.
            setConfirmando(false);
            onResultado(r);
          })
        }
      >
        {enviando ? "Borrando…" : "Sí, borrar"}
      </Button>
      <Button variant="ghost" size="sm" disabled={enviando} onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </div>
  );
}
