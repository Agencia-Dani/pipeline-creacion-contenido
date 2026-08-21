"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// La tarjeta de video del sistema. **Una sola, en las tres pantallas** (ADR-072).
//
// Salió de `curar/feed/tarjeta.tsx`, que ya la tenía bien resuelta, con un solo cambio de forma: el
// pie, el badge y el subtítulo pasan a ser **slots**, porque lo que se puede hacer con un video
// cambia por pantalla (calificarlo en el Feed, reintentarlo en Transcribir, marcarlo como grabado en
// Históricos) mientras que cómo se ve el video no cambia nunca.
//
// 🔑 **Degrada sin mentir, y eso es lo que hace posible estandarizar.** Las tres fuentes saben cosas
// distintas: medido el 2026-08-21, Transcribir tiene **0 de 130** videos con título o referente y los
// links cargados a mano **3 de 294**. Nada se completa inventando — lo que falta se dibuja como
// falta, y la tarjeta sigue siendo reconocible.

export const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

/** Lo que la tarjeta dibuja de un video. Subconjunto de `domain/video.ts`, todo opcional. */
export type VideoEnTarjeta = {
  titulo: string | null;
  referente: string | null;
  thumbnail: string | null;
  views?: number | null;
};

/**
 * La miniatura, con su fallback.
 *
 * Va por `/api/miniatura` y NO directo al CDN: Instagram manda
 * `cross-origin-resource-policy: same-origin`, así que el browser bloquea un `<img>` cross-origin
 * aunque la URL responda 200. El proxy además la copia a Storage la primera vez, porque la URL
 * firmada vence en ~5 días (ver `app/api/miniatura/route.ts`). `<img>` y no `next/image`: el
 * optimizador tampoco puede leer una URL firmada de terceros.
 */
function Miniatura({ video }: { video: VideoEnTarjeta }) {
  const [rota, setRota] = useState(false);

  // 4:5 y no 9:16: el video es vertical, pero una miniatura con la proporción real hace que una
  // sola fila de tarjetas llene la pantalla y la grilla deje de leerse como un conjunto. Se recorta
  // al centro, que es donde el reel pone el gancho.
  if (video.thumbnail && !rota) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/miniatura?u=${encodeURIComponent(video.thumbnail)}`}
        alt=""
        loading="lazy"
        // Si ni el proxy la consigue (URL vencida antes del primer cacheo), el ícono de imagen rota
        // se lee como "la app falló". Cae al mismo lugar que no tener miniatura.
        onError={() => setRota(true)}
        className="size-full object-cover transition-transform group-hover:scale-105"
      />
    );
  }

  const inicial = (video.referente ?? video.titulo ?? "").replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center">
      <span className="text-lg font-semibold text-muted-foreground/70">{inicial || "?"}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {video.thumbnail ? "miniatura vencida" : "sin miniatura"}
      </span>
    </div>
  );
}

export function TarjetaVideo({
  video,
  badge,
  subtitulo,
  pie,
  atenuada = false,
  error = null,
  onAbrir,
}: {
  video: VideoEnTarjeta;
  /** Sobre la miniatura, arriba a la derecha: la calificación, "✓ grabado", el estado. */
  badge?: ReactNode;
  /** Reemplaza la línea de referente + vistas. Sin esto se dibuja la de por defecto. */
  subtitulo?: ReactNode;
  /** El pie de la tarjeta: las acciones de cada pantalla. Sin esto no se dibuja el borde. */
  pie?: ReactNode;
  /** Ya se despachó: se atenúa y se queda en su lugar (no se va de la grilla). */
  atenuada?: boolean;
  error?: string | null;
  onAbrir: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card transition-opacity",
        atenuada && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="group text-left"
        // Sin título el `aria-label` diría "Abrir" a secas. El referente es lo siguiente que
        // identifica al video para quien navega con lector de pantalla.
        aria-label={`Abrir ${video.titulo ?? video.referente ?? "el video"}`}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
          <Miniatura video={video} />
          {badge && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-lg shadow-sm">
              {badge}
            </span>
          )}
        </div>

        <div className="space-y-1 p-2.5">
          {/* 🔴 Un video sin título dice que no lo tiene. **NUNCA se cae a la URL**: `outputs` lo
              hace hoy en 129 filas y ese disfraz fue lo que produjo el falso positivo de la
              medición del 21/08 (ADR-072 §4). Una pantalla que muestra una url donde dice "título"
              entrena a la gente a no leer ese campo. */}
          {video.titulo ? (
            <p className="line-clamp-2 text-sm font-medium leading-snug">{video.titulo}</p>
          ) : (
            <p className="text-sm italic leading-snug text-muted-foreground">sin título</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {subtitulo ?? (
              <>
                {video.referente ?? "sin referente"}
                {video.views != null && ` · ${miles(video.views)} vistas`}
              </>
            )}
          </p>
        </div>
      </button>

      {pie && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
          {pie}
        </div>
      )}

      {error && <p className="px-2.5 pb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
