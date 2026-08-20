"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { haceCuanto } from "@/domain/corrida";
import type { Transcripcion } from "@/lib/transcripciones";
import { Abandonar } from "./abandonar";
import { Copiar } from "./copiar";
import { Grabado } from "./grabado";
import { Reintentar } from "./reintentar";

// La fila de un enlace. Vive en su propio archivo desde ADR-064 porque ahora la dibujan **dos**
// superficies: la tarjeta de fallidas (que la página renderiza en el server) y una tanda abierta
// (que la trae por acción y la dibuja en el cliente). Es un componente de cliente para que la
// segunda pueda usarlo; la primera lo renderiza igual, sin costo.

// 🩸 `sin_transcript` decía **"Sin voz"** hasta el 2026-08-07, y **"Voz" ya significa otra cosa en
// este sistema**: el personaje o marca para quien se cura contenido (context.md). La misma app usa
// las dos acepciones en dos pantallas — `operar/page.tsx` dice *"su voz está apagada o sin voz"*
// hablando de la entidad. Un operador leyó "Sin voz" en Transcribir y preguntó si la herramienta
// devolvía una Voz: la ambigüedad es real y la cazó un humano leyendo la pantalla.
// "Sin transcripción" además es más honesto: el estado no distingue *"el video no tiene habla"* de
// *"Supadata no pudo"*, y el nombre viejo afirmaba lo primero.
const ESTADO_LEGIBLE: Record<Transcripcion["estado"], string> = {
  pendiente: "En cola",
  listo: "Listo",
  sin_transcript: "Sin transcripción",
  fallo: "Falló",
  // No dice "Descartado" a propósito: en esta app descartar es un juicio de mérito (el gate rechazó
  // el video, o el equipo le puso 👎). Esto dice que el insumo está roto (ADR-062 §4).
  abandonado: "Abandonado",
};

const BADGE_POR_ESTADO: Record<
  Transcripcion["estado"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendiente: "default",
  listo: "secondary",
  sin_transcript: "outline",
  fallo: "destructive",
  abandonado: "outline",
};

export function Fila({
  t,
  ahora,
  grabadaInicial = false,
}: {
  t: Transcripcion;
  ahora: Date;
  /**
   * Si el video de esta fila ya está marcado. **Llega como prop y ya no sale de la fila** (ADR-070):
   * la marca se mudó a `app.grabados`, con clave por video, así que `t` no la trae y quien dibuja
   * la lista tiene que haberla pedido. El default `false` es el estado normal de casi toda fila.
   */
  grabadaInicial?: boolean;
}) {
  // 🩸 **Optimista sobre el prop, igual que `titulo` en `tanda.tsx` y por la misma razón.** El
  // `revalidatePath` de la acción sirve para la próxima carga entera, pero las filas de una tanda
  // abierta viven en el `useState` de `tanda.tsx` (bajan una vez, y `abrir()` tiene un
  // `if (filas) return`), así que **ningún refresh del server las repinta**. Sin esto, marcar
  // grababa en la base y la pantalla no acusaba recibo — lo encontró Mani apretando el botón en
  // prod el 18/08.
  //
  // Vive acá y no adentro de `Grabado` porque son **dos** cosas las que tienen que cambiar: el badge
  // de esta línea y el botón de abajo. `Fila` es el ancestro común más chico.
  const [grabado, setGrabado] = useState(grabadaInicial);

  return (
    <li className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge variant={BADGE_POR_ESTADO[t.estado]}>{ESTADO_LEGIBLE[t.estado]}</Badge>
        <a
          href={t.url}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all underline underline-offset-4"
        >
          {t.url}
        </a>
        {/* Un badge propio y no un `estado` más: grabar es ORTOGONAL a que la transcripción haya
            salido bien (ADR-069 §1). Una fila puede estar `Listo` y grabada a la vez, y esas son
            dos cosas que el operador necesita ver juntas, no una pisando a la otra.
            🎨 Y va en `default` (color de acento), NO en `secondary`, que fue el primer intento y
            no servía: **`listo` ya usa `secondary`** (`BADGE_POR_ESTADO`, arriba), así que la marca
            quedaba como una segunda pastilla gris idéntica pegada a la primera — presente en el DOM
            e invisible para el ojo. Mani lo reportó dos veces. Este badge ES el acuse de recibo del
            botón; la acción de sacarlo se ofrece callada, abajo. */}
        {grabado && <Badge>✓ Grabado</Badge>}
        <span className="text-muted-foreground">
          {haceCuanto(t.creado_en, ahora)}
          {t.idioma && t.idioma !== "es" && ` · original en ${t.idioma}`}
        </span>
      </div>

      {t.script && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Ver el script ({t.script.length} caracteres)
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{t.script}</p>
          <div className="mt-2">
            <Copiar texto={t.script} />
          </div>
        </details>
      )}

      {t.error && <p className="text-xs text-muted-foreground">{t.error}</p>}

      {/* Sin esto un enlace que falló quedaba clavado para siempre: el procesador solo levanta
          `pendiente`, y volver a pegar el link tampoco servía porque el encolado lo descarta como
          duplicado. Con Supadata devolviendo transcripciones vacías, no es un caso raro.
          Las dos salidas van juntas a propósito: reintentar sirve cuando el fallo
          fue transitorio, y abandonar cuando no puede ganar nunca (un video sin voz). Con una sola
          de las dos, la fila queda ofreciendo un botón que pierde siempre (ADR-062 §4). */}
      <span className="inline-flex flex-wrap items-center gap-2">
        {(t.estado === "fallo" || t.estado === "sin_transcript") && (
          <>
            <Reintentar id={t.id} />
            <Abandonar id={t.id} />
          </>
        )}
        {/* Este va SIEMPRE, incluso en una fila fallada: si el video se grabó igual (por ejemplo
            porque alguien lo transcribió a oído), la marca sirve lo mismo para el próximo pegote. */}
        <Grabado
          enlace={{ plataforma: t.plataforma, external_id: t.external_id, url: t.url }}
          grabado={grabado}
          onCambio={setGrabado}
        />
      </span>
    </li>
  );
}
