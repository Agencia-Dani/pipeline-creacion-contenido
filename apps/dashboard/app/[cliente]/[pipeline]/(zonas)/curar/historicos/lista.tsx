"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { fecha } from "@/lib/fechas";
import type { Historico } from "@/lib/historicos";
import { miles } from "@/lib/utils";
import { cargarMas, exportarCsv } from "./actions";

// Todo lo aprobado, de todas las semanas, de a 25. Sin miniatura: el thumbnail era un
// attachment de Airtable que muere con el record y nunca se archivó — el histórico es texto.

const fechaDe = (iso: string | null) => (iso ? fecha(iso, true) : "—");

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
  const [bajando, startBajar] = useTransition();

  // El descargable que reemplaza al Google Sheet (ADR-057). El server devuelve el texto y el
  // navegador lo baja: sin route nueva, así el export pasa por la misma guardia de tenant que
  // la pantalla.
  function bajar() {
    setError(null);
    startBajar(async () => {
      const r = await exportarCsv();
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      // `text/csv` a secas y no `application/octet-stream`: en el móvil decide si se puede abrir
      // en vez de solo guardar.
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombre;
      a.click();
      URL.revokeObjectURL(url);

      if (r.truncado) {
        setError(`El archivo trae las ${r.filas} más recientes. Hay más histórico del que entra en una descarga.`);
      }
    });
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mostrando {filas.length} de {total}.
        </p>
        <Button variant="outline" size="sm" onClick={bajar} disabled={bajando}>
          {bajando ? "Preparando…" : "Descargar CSV"}
        </Button>
      </div>

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
              {fechaDe(h.calificadoEn)}
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
  return (
    <Modal
      abierto={historico !== null}
      onCerrar={onCerrar}
      titulo={historico?.titulo ?? ""}
      subtitulo={
        historico && (
          <>
            {historico.proyecto ?? "(sin proyecto)"}
            {historico.voz && ` · ${historico.voz}`}
            {` · aprobado el ${fechaDe(historico.calificadoEn)}`}
          </>
        )
      }
    >
      {historico && (
        <>
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
                {/* `whitespace-pre-wrap` respeta los saltos que escribió el equipo; `break-words`
                    evita que una URL larga desborde la caja. Igual que el guion, más abajo. */}
                <p className="whitespace-pre-wrap break-words text-sm">{historico.notas}</p>
              </div>
            )}

            {historico.relevanciaRazon && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué pasó el filtro</p>
                <p className="text-sm">{historico.relevanciaRazon}</p>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Lo que se dice en el video (transcripción literal)
                </p>
                <Copiar texto={historico.script} etiqueta="Copiar guion" />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {historico.script ?? "Sin transcripción."}
              </p>
            </div>
        </>
      )}
    </Modal>
  );
}
