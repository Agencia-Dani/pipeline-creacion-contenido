"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Historico } from "@/lib/historicos";
import { cargarMas } from "./actions";

// Todo lo aprobado, de todas las semanas, de a 25. Sin miniatura: el thumbnail era un
// attachment de Airtable que muere con el record y nunca se archivó — el histórico es texto.

const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function Lista({
  inicial,
  hayMasInicial,
  total,
}: {
  inicial: Historico[];
  hayMasInicial: boolean;
  total: number;
}) {
  const [filas, setFilas] = useState(inicial);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [pagina, setPagina] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  function mas() {
    setError(null);
    startTransition(async () => {
      const r = await cargarMas(pagina + 1);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setFilas((f) => [...f, ...r.filas]);
      setHayMas(r.hayMas);
      setPagina((p) => p + 1);
    });
  }

  const abierto = filas.find((f) => f.id === abiertoId) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mostrando {filas.length} de {total}.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filas.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setAbiertoId(h.id)}
            className="space-y-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-medium leading-snug">{h.titulo}</p>
              {h.calificacion && <span className="shrink-0 text-lg">{h.calificacion}</span>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {h.proyecto ?? "(sin proyecto)"}
              {h.referente && ` · ${h.referente}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {fecha(h.calificadoEn)}
              {h.views !== null && ` · ${miles(h.views)} vistas`}
            </p>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {hayMas && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={mas} disabled={cargando}>
            {cargando ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}

      <Detalle historico={abierto} onCerrar={() => setAbiertoId(null)} />
    </div>
  );
}

function Detalle({ historico, onCerrar }: { historico: Historico | null; onCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (historico && !dialogo.open) dialogo.showModal();
    if (!historico && dialogo.open) dialogo.close();
  }, [historico]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[85vh] w-[min(46rem,92vw)] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/50"
    >
      {historico && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b p-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-snug">{historico.titulo}</h2>
              <p className="text-xs text-muted-foreground">
                {historico.proyecto ?? "(sin proyecto)"}
                {historico.voz && ` · ${historico.voz}`}
                {` · aprobado el ${fecha(historico.calificadoEn)}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => ref.current?.close()} aria-label="Cerrar">
              ✕
            </Button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {historico.calificacion && <Badge variant="secondary">{historico.calificacion}</Badge>}
              {historico.heat !== null && <Badge variant="outline">heat {historico.heat.toFixed(2)}</Badge>}
              {historico.relevanciaScore !== null && (
                <Badge variant="outline">relevancia {historico.relevanciaScore.toFixed(2)}</Badge>
              )}
              {historico.views !== null && (
                <span className="text-muted-foreground">{miles(historico.views)} vistas</span>
              )}
              {historico.likes !== null && (
                <span className="text-muted-foreground">{miles(historico.likes)} likes</span>
              )}
              {historico.urlReferente && (
                <a
                  href={historico.urlReferente}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  ver el video ↗
                </a>
              )}
            </div>

            {historico.notas && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Notas del equipo</p>
                <p className="text-sm">{historico.notas}</p>
              </div>
            )}

            {historico.relevanciaRazon && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué pasó el filtro</p>
                <p className="text-sm">{historico.relevanciaRazon}</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Lo que se dice en el video (transcripción literal)
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {historico.script ?? "Sin transcripción."}
              </p>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
