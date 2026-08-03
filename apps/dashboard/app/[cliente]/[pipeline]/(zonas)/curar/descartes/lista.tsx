"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { VEREDICTOS, type DescarteFeed, type Veredicto } from "@/domain/feed";
import { auditarDescarte } from "./actions";

// La auditoría del gate. El acto es binario: ¿la máquina hizo bien en matarlo?
//
// El botón que importa es "era bueno" — es el que produce el `falsos_negativos` de la semana.
// Por eso los dos dicen qué significan y no "sí/no": marcar mal acá afina los criterios en la
// dirección equivocada.

const ETIQUETA: Record<Veredicto, string> = {
  "bien descartado": "Bien descartado",
  "era bueno": "Era bueno",
};

export function Lista({ descartes }: { descartes: DescarteFeed[] }) {
  const [puestos, setPuestos] = useState<Record<string, Veredicto>>({});
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const efectivo = (d: DescarteFeed): Veredicto | null => puestos[d.id] ?? d.veredicto;

  function auditar(d: DescarteFeed, veredicto: Veredicto) {
    const anterior = efectivo(d);
    setPuestos((p) => ({ ...p, [d.id]: veredicto }));
    setErrores(({ [d.id]: _, ...resto }) => resto);
    setEnviando((e) => new Set(e).add(d.id));

    startTransition(async () => {
      const r = await auditarDescarte(d.id, veredicto);
      setEnviando((e) => {
        const s = new Set(e);
        s.delete(d.id);
        return s;
      });
      if (!r.ok) {
        setPuestos((p) => {
          const copia = { ...p };
          if (anterior === null) delete copia[d.id];
          else copia[d.id] = anterior;
          return copia;
        });
        setErrores((e) => ({ ...e, [d.id]: r.mensaje }));
      }
    });
  }

  const abierto = descartes.find((d) => d.id === abiertoId) ?? null;
  const pendientes = descartes.filter((d) => efectivo(d) === null).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pendientes === 0
          ? "Listo: todos auditados."
          : `${pendientes} sin auditar de ${descartes.length}.`}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {descartes.map((d) => {
          const puesto = efectivo(d);
          return (
            <div
              key={d.id}
              className={cn(
                "flex flex-col overflow-hidden rounded-lg border bg-card transition-opacity",
                puesto && "opacity-60",
              )}
            >
              <button type="button" onClick={() => setAbiertoId(d.id)} className="flex gap-3 p-3 text-left">
                <div className="size-16 shrink-0 overflow-hidden rounded bg-muted">
                  {d.thumbnail && (
                    // Por /api/miniatura, igual que el feed: el CDN de Instagram bloquea el
                    // hotlink con `cross-origin-resource-policy` (ver app/api/miniatura/route.ts).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/miniatura?u=${encodeURIComponent(d.thumbnail)}`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{d.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.proyecto || "(sin proyecto)"}
                    {d.referente && ` · ${d.referente}`}
                  </p>
                  {d.relevanciaScore !== null && (
                    <Badge variant="outline" title="Qué tan relevante lo juzgó el filtro. Cuanto más alto, más cerca estuvo de pasar.">
                      {d.relevanciaScore.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </button>

              {/* Sin recortar: la razón es con lo que se decide el veredicto, y son 20 tarjetas
                  de ~200 caracteres. Cortarla obligaría a abrir cada una para hacer justo lo que
                  la lista existe para permitir. */}
              {d.relevanciaRazon && (
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  Por qué lo mató: {d.relevanciaRazon}
                </p>
              )}

              <div className="mt-auto flex flex-wrap gap-1.5 border-t p-2">
                {VEREDICTOS.map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={puesto === v ? "default" : "outline"}
                    disabled={enviando.has(d.id)}
                    onClick={() => auditar(d, v)}
                  >
                    {ETIQUETA[v]}
                  </Button>
                ))}
              </div>

              {errores[d.id] && <p className="px-3 pb-2 text-xs text-destructive">{errores[d.id]}</p>}
            </div>
          );
        })}
      </div>

      <Detalle descarte={abierto} onCerrar={() => setAbiertoId(null)} />
    </div>
  );
}

function Detalle({ descarte, onCerrar }: { descarte: DescarteFeed | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={descarte !== null}
      onCerrar={onCerrar}
      titulo={descarte?.titulo ?? ""}
      subtitulo={
        descarte && (
          <>
            {descarte.proyecto || "(sin proyecto)"}
            {descarte.referente && ` · ${descarte.referente}`}
          </>
        )
      }
    >
      {descarte && (
        <>
          {descarte.urlReferente && (
            <a
              href={descarte.urlReferente}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4"
            >
              ver el video ↗
            </a>
          )}
          {descarte.relevanciaRazon && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué el filtro lo mató</p>
              <p className="text-sm">{descarte.relevanciaRazon}</p>
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Lo que se dice en el video (transcripción literal)
              </p>
              <Copiar texto={descarte.script} etiqueta="Copiar guion" />
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {descarte.script ?? "Sin transcripción."}
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}
