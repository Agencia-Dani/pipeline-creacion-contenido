"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TarjetaVideo } from "@/components/video/tarjeta";
import { haceCuanto } from "@/domain/corrida";
import type { Transcripcion } from "@/lib/transcripciones";
import { Abandonar } from "./abandonar";
import { BADGE_POR_ESTADO, ESTADO_LEGIBLE } from "./fila";
import { Grabado } from "./grabado";
import { Reintentar } from "./reintentar";

// La fila de una tanda, ahora como tarjeta (ADR-072, Fase 2b): el mismo video se ve igual en el
// Feed, en Transcribir y en Históricos.
//
// ⚠️ **Acá la tarjeta va a estar casi vacía, y es lo esperado.** Medido el 2026-08-21: **0 de 130**
// transcripciones tienen título, referente o miniatura, porque Supadata devuelve `content`, `lang`
// y `availableLangs` y nada más. Lo que las llena es entrar a una colección, que es donde se paga
// el scrape (ADR-073). Por eso el subtítulo es **la url**: es lo único que identifica a este video
// hasta entonces, y era lo que la fila vieja mostraba.
//
// 📏 Y la grilla es también el arreglo de escala: 100 tarjetas se recorren, 100 filas altas con un
// `<details>` adentro no. Ese era el problema real de un pegote grande.
export function TarjetaCola({
  t,
  ahora,
  grabadaInicial = false,
  onAbrir,
}: {
  t: Transcripcion;
  ahora: Date;
  /** Si el video ya está marcado como grabado. Llega como prop desde ADR-070; ver `Fila`. */
  grabadaInicial?: boolean;
  onAbrir: () => void;
}) {
  // Mismo optimista-sobre-el-prop que `Fila`, y por la misma razón: las filas de una tanda abierta
  // viven en el `useState` de `tanda.tsx`, así que ningún refresh del server las repinta. Y cuando
  // la tanda las recarga, gana el prop (la `key` es `t.id` y React no remonta).
  const [grabado, setGrabado] = useState(grabadaInicial);
  const [visto, setVisto] = useState(grabadaInicial);
  if (visto !== grabadaInicial) {
    setVisto(grabadaInicial);
    setGrabado(grabadaInicial);
  }

  const fallada = t.estado === "fallo" || t.estado === "sin_transcript";

  return (
    <TarjetaVideo
      video={{ titulo: null, referente: null, thumbnail: null }}
      // El acuse de recibo del botón, en el lugar donde el Feed pone la calificación. Es lo que en
      // la fila era el badge `✓ Grabado`: el estado se muestra fuerte, la acción se ofrece callada.
      badge={grabado ? "✓" : undefined}
      subtitulo={t.url}
      error={t.error}
      onAbrir={onAbrir}
      pie={
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <Badge variant={BADGE_POR_ESTADO[t.estado]}>{ESTADO_LEGIBLE[t.estado]}</Badge>
          <span className="text-xs text-muted-foreground">
            {haceCuanto(t.creado_en, ahora)}
            {t.idioma && t.idioma !== "es" && ` · ${t.idioma}`}
          </span>
          {/* Las dos salidas de una fila fallada van juntas (ADR-062 §4): reintentar sirve cuando el
              fallo fue transitorio, abandonar cuando no puede ganar nunca. */}
          {fallada && (
            <>
              <Reintentar id={t.id} />
              <Abandonar id={t.id} />
            </>
          )}
          {/* Va SIEMPRE, incluso en una fallada: si el video se grabó igual, la marca sirve lo
              mismo para el próximo pegote. */}
          <Grabado
            enlace={{ plataforma: t.plataforma, external_id: t.external_id, url: t.url }}
            grabado={grabado}
            onCambio={setGrabado}
            compacto
          />
        </div>
      }
    />
  );
}
