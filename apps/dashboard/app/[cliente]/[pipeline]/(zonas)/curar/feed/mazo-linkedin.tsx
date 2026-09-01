"use client";

import { useState, useTransition } from "react";
import { plural } from "@/domain/plural";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CALIFICACIONES } from "@/domain/feed";
import { sinCalificar, type CandidatoLinkedin } from "@/domain/feed-linkedin";
import { ETIQUETA_FUENTE } from "@/domain/linkedin";
import { calificarPiezaLinkedin, verTextoLinkedin } from "./actions-linkedin";
import { usarCockpit } from "../../usar-cockpit";

// El feed de LinkedIn: lo que la máquina trajo, para calificar.
//
// 🩸 **Hoy está vacío y su motor no existe** (ADR-055: sin definición de "funcionó", sin banco de
// referentes y sin few-shot). La pantalla existe igual porque es el destino de lo que el motor va a
// producir, y porque sembrando filas a mano se puede ejercitar la RLS de la `024`.
//
// ⚠️ **La diferencia con reels que hay que decir en voz alta: acá calificar NO archiva.** En reels,
// 🔥 y 👍 alimentan al archivado que escribe `outputs` y el equipo espera verlo en el Histórico. Acá
// no hay archivador todavía, así que la calificación mueve el estado y nada más. Callarlo sería
// dejar que la expectativa que crea el otro pipeline se traslade sola.

export function MazoLinkedin({
  candidatos,
  total,
  techo,
}: {
  candidatos: CandidatoLinkedin[];
  total: number;
  techo: number;
}) {
  const pendientes = sinCalificar(candidatos);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feed de LinkedIn</h1>
        <p className="text-muted-foreground">
          Lo que la máquina trajo, para decidir qué entra. 🔥 y 👍 lo aprueban, 👎 lo descarta.{" "}
          <strong>Calificar acá todavía no genera el post</strong>: marca la pieza y nada más.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {candidatos.length === 0
            ? "No hay piezas."
            : `${pendientes} sin calificar de ${candidatos.length}.`}
        </p>
        {/* 🔑 El techo se DICE. Es ADR-064 aplicado antes de que muerda: una ventana que oculta
            filas sin avisar deja trabajo inalcanzable y se lee como "no hay más". */}
        {total > candidatos.length && (
          <p className="text-sm text-destructive">
            Mostrando {candidatos.length} de {total}. El techo es {techo}: avisale a un dev.
          </p>
        )}
      </div>

      {candidatos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todavía no hay piezas, y no es un error de carga.</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            El motor de LinkedIn todavía no existe. Lo que falta para construirlo no es código:
            falta la definición de <em>qué significa que un post funcionó</em>, el banco de
            referentes y los ejemplos de posts perfectos por cuenta. Mientras tanto, lo que sí se
            puede hacer es configurar las voces y cargar el banco.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidatos.map((c) => (
            <Tarjeta key={c.id} candidato={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ candidato: c }: { candidato: CandidatoLinkedin }) {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, startTransition] = useTransition();

  const abrir = () => {
    if (texto !== null) {
      setAbierto((a) => !a);
      return;
    }
    startTransition(async () => {
      const r = await verTextoLinkedin(cockpit, c.id);
      if (!r.ok) return setError(r.mensaje ?? "No se pudo abrir.");
      setTexto(r.texto ?? "(esta pieza no tiene texto)");
      setAbierto(true);
    });
  };

  return (
    <div className={cn("rounded-lg border p-4", c.calificacion !== null && "bg-muted/40")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{c.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {ETIQUETA_FUENTE[c.fuente]}
            {` · carril ${c.carril}`}
            {c.autor && ` · ${c.autor}`}
            {c.idioma && ` · ${c.idioma}`}
            {c.reacciones !== null && ` · ${c.reacciones} ${plural(c.reacciones, "reacción", "reacciones")}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {CALIFICACIONES.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={c.calificacion === k ? "default" : "ghost"}
              disabled={trabajando}
              onClick={() =>
                startTransition(async () => {
                  const r = await calificarPiezaLinkedin(cockpit, c.id, k);
                  if (!r.ok) setError(r.mensaje);
                })
              }
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" disabled={trabajando} onClick={abrir}>
          {abierto ? "Ocultar el texto" : "Ver el texto"}
        </Button>
        {c.url && (
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            Abrir el original ↗
          </a>
        )}
      </div>

      {abierto && texto !== null && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-background p-3 text-sm">{texto}</p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
