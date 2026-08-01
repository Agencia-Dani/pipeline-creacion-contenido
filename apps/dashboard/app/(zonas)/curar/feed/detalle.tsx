"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Calificacion, CandidatoFeed } from "@/domain/feed";
import { guardarNotasCandidato } from "./actions";
import { BotonesCalificar } from "./tarjeta";

// La tarjeta ABIERTA: acá sí está todo — el script literal completo, el juicio del gate con su
// razón, y los números del video. Es lo que se mira cuando el título no alcanza para decidir.
//
// Usa el <dialog> nativo (showModal): trae foco atrapado, cierre con Escape y backdrop sin
// ninguna dependencia. Hay UNO solo para todo el mazo, no uno por tarjeta.

const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

export function Detalle({
  candidato,
  puesta,
  enviando,
  onCalificar,
  onCerrar,
}: {
  candidato: CandidatoFeed | null;
  puesta: Calificacion | null;
  enviando: boolean;
  onCalificar: (c: Calificacion) => void;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (candidato && !dialogo.open) dialogo.showModal();
    if (!candidato && dialogo.open) dialogo.close();
  }, [candidato]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        // Click en el backdrop (el <dialog> mismo, no su contenido) = cerrar.
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[85vh] w-[min(52rem,92vw)] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/50"
    >
      {candidato && (
        <Contenido
          candidato={candidato}
          puesta={puesta}
          enviando={enviando}
          onCalificar={onCalificar}
          onCerrar={() => ref.current?.close()}
        />
      )}
    </dialog>
  );
}

function Contenido({
  candidato,
  puesta,
  enviando,
  onCalificar,
  onCerrar,
}: {
  candidato: CandidatoFeed;
  puesta: Calificacion | null;
  enviando: boolean;
  onCalificar: (c: Calificacion) => void;
  onCerrar: () => void;
}) {
  const [notas, setNotas] = useState(candidato.notas ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  // Cada candidato entra con sus propias notas: el diálogo es uno solo y se reusa.
  useEffect(() => {
    setNotas(candidato.notas ?? "");
    setAviso(null);
  }, [candidato.id, candidato.notas]);

  const sucias = notas.trim() !== (candidato.notas ?? "").trim();

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex items-start justify-between gap-4 border-b p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold leading-snug">{candidato.titulo}</h2>
          <p className="text-xs text-muted-foreground">
            {candidato.proyecto || "(sin proyecto)"}
            {candidato.referente && ` · ${candidato.referente}`}
            {candidato.idioma && ` · original en ${candidato.idioma}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {candidato.heat !== null && (
            <Badge variant="secondary" title="Qué tan caliente lo considera el motor, de 0 a 1.">
              heat {candidato.heat.toFixed(2)}
            </Badge>
          )}
          {candidato.relevanciaScore !== null && (
            <Badge variant="outline" title="Qué tan relevante lo juzgó el filtro contra los criterios del proyecto.">
              relevancia {candidato.relevanciaScore.toFixed(2)}
            </Badge>
          )}
          {candidato.views !== null && <span className="text-muted-foreground">{miles(candidato.views)} vistas</span>}
          {candidato.likes !== null && <span className="text-muted-foreground">{miles(candidato.likes)} likes</span>}
          {candidato.seguidores !== null && (
            <span className="text-muted-foreground">{miles(candidato.seguidores)} seguidores</span>
          )}
          {candidato.urlReferente && (
            <a
              href={candidato.urlReferente}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              ver el video ↗
            </a>
          )}
        </div>

        {candidato.relevanciaRazon && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué pasó el filtro</p>
            <p className="text-sm">{candidato.relevanciaRazon}</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Lo que se dice en el video (transcripción literal, traducida)
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {candidato.script ?? "Sin transcripción."}
          </p>
        </div>

        <div>
          <label htmlFor={`notas-${candidato.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Notas del equipo — para lo que el emoji no dice (&ldquo;bueno, pero no ahora&rdquo;)
          </label>
          <Textarea
            id={`notas-${candidato.id}`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Opcional."
          />
          {sucias && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={guardando}
                onClick={() =>
                  startTransition(async () => {
                    const r = await guardarNotasCandidato(candidato.id, notas);
                    setAviso(r.mensaje);
                  })
                }
              >
                {guardando ? "Guardando…" : "Guardar nota"}
              </Button>
              {aviso && <span className="text-xs text-muted-foreground">{aviso}</span>}
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-4 border-t p-4">
        <span className="text-xs text-muted-foreground">
          {puesta ? "Calificado. Clickeá otro emoji para corregir." : "¿Sirve este video?"}
        </span>
        <BotonesCalificar actual={puesta} onCalificar={onCalificar} enviando={enviando} tamano="lg" />
      </footer>
    </div>
  );
}
