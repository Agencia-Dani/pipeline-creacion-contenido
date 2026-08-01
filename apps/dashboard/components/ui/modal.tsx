"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// El diálogo de "abrir el record", uno solo para todo el cockpit.
//
// Usa el <dialog> nativo (showModal): trae foco atrapado, cierre con Escape y backdrop sin
// ninguna dependencia. Esto ya estaba escrito TRES veces —el detalle del feed, el de descartes y
// el de históricos— con el mismo useEffect y el mismo click-en-backdrop; el estándar de D8 lo
// necesita en tres pantallas más, así que vive acá y no se vuelve a copiar.
//
// La regla de uso: hay UN <Modal> por lista, no uno por fila. `abierto` se deriva de cuál id está
// abierto, y el contenido se re-renderiza adentro del mismo <dialog>.

export function Modal({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  pie,
  ancho = "46rem",
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  /** Barra fija al pie, fuera del área que scrollea (los botones de acción van acá). */
  pie?: React.ReactNode;
  ancho?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        // Click en el backdrop (el <dialog> mismo, no su contenido) = cerrar.
        if (e.target === ref.current) ref.current?.close();
      }}
      style={{ width: `min(${ancho}, 92vw)` }}
      className={cn(
        "m-auto max-h-[85vh] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/50",
      )}
    >
      {/* El contenido se monta solo con el modal abierto: así el estado local de un form
          (lo tipeado, lo elegido) nace limpio en cada apertura y no arrastra la fila anterior. */}
      {abierto && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b p-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold leading-snug">{titulo}</h2>
              {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
            >
              ✕
            </Button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>

          {pie && <footer className="flex items-center justify-between gap-4 border-t p-4">{pie}</footer>}
        </div>
      )}
    </dialog>
  );
}
