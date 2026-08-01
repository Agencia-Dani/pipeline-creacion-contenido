"use client";

import { useState } from "react";
import { CALIFICACIONES, type Calificacion, type CandidatoFeed } from "@/domain/feed";
import { cn } from "@/lib/utils";

// La tarjeta CERRADA: lo mínimo para decidir sin abrir (miniatura, título, referente, heat) y
// los tres botones ahí mismo. Abrir es opcional — los fáciles se despachan de un click y el
// script (1000+ caracteres) se lee solo cuando el título no alcanza.
//
// Una tarjeta ya calificada NO se va: se marca y se atenúa en su lugar hasta que se recargue o
// se cambie de filtro. Volver a clickear otro emoji la re-califica, y eso ES el deshacer
// (plan-cockpit §D6.4) — sin toast ni máquina de undo.

const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

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
}: {
  candidato: CandidatoFeed;
  puesta: Calificacion | null;
  enviando: boolean;
  error: string | null;
  onCalificar: (c: Calificacion) => void;
  onAbrir: () => void;
}) {
  const calificado = puesta !== null;
  const [miniaturaRota, setMiniaturaRota] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card transition-opacity",
        calificado && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="group text-left"
        aria-label={`Abrir ${candidato.titulo}`}
      >
        {/* 4:5 y no 9:16: el video es vertical, pero una miniatura con la proporción real hace
            que una sola fila de tarjetas llene la pantalla y el mazo deje de leerse como un
            conjunto. Se recorta al centro, que es donde el reel pone el gancho. */}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
          {candidato.thumbnail && !miniaturaRota ? (
            // Va por /api/miniatura y NO directo al CDN: Instagram manda
            // `cross-origin-resource-policy: same-origin`, así que el browser bloquea un <img>
            // cross-origin aunque la URL responda 200. El proxy además la copia a Storage la
            // primera vez, porque la URL firmada vence en ~5 días (ver app/api/miniatura/route.ts).
            // <img> y no next/image: el optimizador tampoco puede leer una URL firmada de terceros.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/miniatura?u=${encodeURIComponent(candidato.thumbnail)}`}
              alt=""
              loading="lazy"
              // Si ni el proxy la consigue (URL vencida antes del primer cacheo), el ícono de
              // imagen rota se lee como "la app falló". Cae al mismo lugar que no tener miniatura:
              // la decisión igual la da el guion.
              onError={() => setMiniaturaRota(true)}
              className="size-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center">
              <span className="text-lg font-semibold text-muted-foreground/70">
                {(candidato.referente ?? candidato.titulo).replace(/^@/, "").charAt(0).toUpperCase() || "?"}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {candidato.thumbnail ? "miniatura vencida" : "sin miniatura"}
              </span>
            </div>
          )}
          {puesta && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-lg shadow-sm">
              {puesta}
            </span>
          )}
        </div>

        <div className="space-y-1 p-2.5">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{candidato.titulo}</p>
          {/* `high-end` va acá y no como badge sobre la miniatura: lo tiene buena parte del feed,
              así que flotando era ruido en vez de señal. Es una marca, no cambia el orden. */}
          <p className="truncate text-xs text-muted-foreground">
            {candidato.referente ?? "sin referente"}
            {candidato.views !== null && ` · ${miles(candidato.views)} vistas`}
            {candidato.viralPorTamano && " · high-end"}
          </p>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
        <span
          className="text-xs text-muted-foreground"
          title="Qué tan caliente lo considera el motor, de 0 a 1."
        >
          {candidato.heat !== null ? candidato.heat.toFixed(2) : "—"}
        </span>
        <BotonesCalificar actual={puesta} onCalificar={onCalificar} enviando={enviando} />
      </div>

      {error && <p className="px-2.5 pb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
