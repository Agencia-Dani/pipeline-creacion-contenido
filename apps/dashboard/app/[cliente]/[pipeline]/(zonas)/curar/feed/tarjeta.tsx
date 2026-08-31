"use client";

import { miles, TarjetaVideo } from "@/components/video/tarjeta";
import { CALIFICACIONES, type Calificacion, type CandidatoFeed } from "@/domain/feed";
import { cn } from "@/lib/utils";

// La tarjeta del Feed: `TarjetaVideo` (compartida, ADR-072) más lo que es de esta pantalla y solo
// de esta — calificar.
//
// Lo mínimo para decidir sin abrir (miniatura, título, referente, heat) y los tres botones ahí
// mismo. Abrir es opcional: los fáciles se despachan de un click y el script (1000+ caracteres) se
// lee solo cuando el título no alcanza.
//
// Una tarjeta ya calificada NO se va: se marca y se atenúa en su lugar hasta que se recargue o se
// cambie de filtro. Volver a clickear otro emoji la re-califica, y eso ES el deshacer
// (plan-cockpit §D6.4) — sin toast ni máquina de undo.

const AYUDA: Record<Calificacion, string> = {
  "🔥": "Aprobado y ejemplar: además de entrar, se usa como ejemplo para afinar los criterios.",
  "👍": "Aprobado: sirve.",
  "👎": "Descartado: no sirve.",
};

export function BotonesCalificar({
  actual,
  onCalificar,
  enviando,
  tamano = "sm",
}: {
  actual: Calificacion | null;
  onCalificar: (c: Calificacion) => void;
  enviando: boolean;
  tamano?: "sm" | "lg";
}) {
  return (
    <div className="flex items-center gap-1">
      {CALIFICACIONES.map((c) => (
        <button
          key={c}
          type="button"
          title={AYUDA[c]}
          aria-label={AYUDA[c]}
          aria-pressed={actual === c}
          disabled={enviando}
          onClick={(e) => {
            e.stopPropagation();
            onCalificar(c);
          }}
          className={cn(
            "rounded-md border transition-colors disabled:opacity-50",
            tamano === "lg" ? "px-3 py-1.5 text-xl" : "px-2 py-1 text-base",
            actual === c
              ? "border-primary bg-primary/15"
              : "border-transparent hover:border-border hover:bg-accent",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function Tarjeta({
  candidato,
  puesta,
  enviando,
  error,
  onCalificar,
  onAbrir,
  seleccion,
}: {
  candidato: CandidatoFeed;
  puesta: Calificacion | null;
  enviando: boolean;
  error: string | null;
  onCalificar: (c: Calificacion) => void;
  onAbrir: () => void;
  /** Modo selección prendido: la tarjeta marca en vez de abrir. Ver `components/video/seleccion`. */
  seleccion?: { marcado: boolean; onAlternar: () => void };
}) {
  return (
    <TarjetaVideo
      video={candidato}
      atenuada={puesta !== null}
      badge={puesta}
      error={error}
      onAbrir={onAbrir}
      seleccion={seleccion}
      // `high-end` va en el subtítulo y no como badge sobre la miniatura: lo tiene buena parte del
      // feed, así que flotando era ruido en vez de señal. Es una marca, no cambia el orden.
      subtitulo={
        <>
          {candidato.referente ?? "sin referente"}
          {candidato.views !== null && ` · ${miles(candidato.views)} vistas`}
          {candidato.viralPorTamano && " · high-end"}
          {" · "}
          {/* La corrida que lo trajo (ADR-081). **El `sin corrida` se dibuja**, no se omite: la
              falta es un estado real —fila anterior a la `034`, o registro caído— y omitirla la
              haría indistinguible de "esta pantalla todavía no muestra la corrida" (ADR-072 §4).
              Se apaga solo: el barrido de 20 días se lleva las filas viejas. */}
          <span title={
            candidato.corrida
              ? "La corrida del motor que trajo este video."
              : "No se sabe de qué corrida salió: es anterior a que el motor lo registrara, o el registro no pudo abrir la corrida."
          }>
            {candidato.corrida ?? "sin corrida"}
          </span>
        </>
      }
      pie={
        <>
          <span
            className="text-xs text-muted-foreground"
            title="Qué tan caliente lo considera el motor, de 0 a 1."
          >
            {candidato.heat !== null ? candidato.heat.toFixed(2) : "—"}
          </span>
          <BotonesCalificar actual={puesta} onCalificar={onCalificar} enviando={enviando} />
        </>
      }
    />
  );
}
