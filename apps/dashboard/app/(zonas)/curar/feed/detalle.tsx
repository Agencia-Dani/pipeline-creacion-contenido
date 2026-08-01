"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { Calificacion, CandidatoFeed } from "@/domain/feed";
import { guardarNotasCandidato } from "./actions";
import { BotonesCalificar } from "./tarjeta";

// La tarjeta ABIERTA: acá sí está todo — el script literal completo, el juicio del gate con su
// razón, y los números del video. Es lo que se mira cuando el título no alcanza para decidir.
//
// El <dialog> vive en components/ui/modal.tsx (uno solo para todo el mazo, no uno por tarjeta).
// El contenido se monta recién al abrir, así que las notas de un candidato nunca arrastran las
// del anterior sin necesidad de un efecto que las resetee.

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
  return (
    <Modal
      abierto={candidato !== null}
      onCerrar={onCerrar}
      ancho="52rem"
      titulo={candidato?.titulo ?? ""}
      subtitulo={
        candidato && (
          <>
            {candidato.proyecto || "(sin proyecto)"}
            {candidato.referente && ` · ${candidato.referente}`}
            {candidato.idioma && ` · original en ${candidato.idioma}`}
          </>
        )
      }
      pie={
        <>
          <span className="text-xs text-muted-foreground">
            {puesta ? "Calificado. Clickeá otro emoji para corregir." : "¿Sirve este video?"}
          </span>
          <BotonesCalificar
            actual={puesta}
            onCalificar={onCalificar}
            enviando={enviando}
            tamano="lg"
          />
        </>
      }
    >
      {candidato && <Contenido candidato={candidato} />}
    </Modal>
  );
}

function Contenido({ candidato }: { candidato: CandidatoFeed }) {
  const [notas, setNotas] = useState(candidato.notas ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const sucias = notas.trim() !== (candidato.notas ?? "").trim();

  return (
    <>
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Lo que se dice en el video (transcripción literal, traducida)
          </p>
          <Copiar texto={candidato.script} etiqueta="Copiar guion" />
        </div>
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
    </>
  );
}
