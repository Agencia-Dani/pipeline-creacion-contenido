"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VEREDICTOS } from "@/domain/feed";
import { sinVeredicto, type DescarteLinkedin } from "@/domain/feed-linkedin";
import { ETIQUETA_FUENTE } from "@/domain/linkedin";
import { juzgarLinkedin } from "./actions-linkedin";
import { usarCockpit } from "../../usar-cockpit";

// Los descartes de LinkedIn: lo que el filtro mató, para decir si acertó.
//
// 🔑 **Marcar acá es lo único que corrige los criterios**, y por eso los sin veredicto van primero y
// dentro de ellos los de score más alto: son los que el filtro mató por menos, o sea donde es más
// probable que se haya equivocado. **Lo que no se marca sigue esperando** — la lista no se borra.
//
// Se puede cambiar de opinión sobre un veredicto ya puesto: el juicio es del equipo y revisarlo es
// parte del trabajo, no un error que haya que impedir.

export function ListaDescartesLinkedin({
  descartes,
  total,
  techo,
}: {
  descartes: DescarteLinkedin[];
  total: number;
  techo: number;
}) {
  const pendientes = sinVeredicto(descartes);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Descartes de LinkedIn</h1>
        <p className="text-muted-foreground">
          Las piezas que el filtro mató. Marcar cuáles <em>eran buenas</em> es lo que corrige los
          criterios; lo que no marques sigue esperando.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {descartes.length === 0
            ? "No hay descartes."
            : `${pendientes} sin juzgar de ${descartes.length}.`}
        </p>
        {total > descartes.length && (
          <p className="text-sm text-destructive">
            Mostrando {descartes.length} de {total}. El techo es {techo}: avisale a un dev.
          </p>
        )}
      </div>

      {descartes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todavía no hay descartes, y no es un error de carga.</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            No hay descartes porque no hubo corridas: el motor de LinkedIn todavía no existe. Esta
            lista se llena sola cuando el filtro empiece a rechazar piezas.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {descartes.map((d) => (
            <Fila key={d.id} descarte={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({ descarte: d }: { descarte: DescarteLinkedin }) {
  const cockpit = usarCockpit();
  const [error, setError] = useState<string | null>(null);
  const [trabajando, startTransition] = useTransition();

  return (
    <div className={cn("space-y-2 p-3", d.veredicto !== null && "bg-muted/40")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{d.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {ETIQUETA_FUENTE[d.fuente]}
            {` · carril ${d.carril}`}
            {d.autor && ` · ${d.autor}`}
            {d.relevanciaScore !== null && ` · relevancia ${d.relevanciaScore}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {VEREDICTOS.map((v) => (
            <Button
              key={v}
              size="sm"
              variant={d.veredicto === v ? "default" : "ghost"}
              disabled={trabajando}
              onClick={() =>
                startTransition(async () => {
                  const r = await juzgarLinkedin(cockpit, d.id, v);
                  if (!r.ok) setError(r.mensaje);
                })
              }
            >
              {v === "era bueno" ? "Era bueno" : "Bien descartado"}
            </Button>
          ))}
        </div>
      </div>

      {/* La razón del filtro es la mitad útil de la pantalla: sin ella el veredicto es una corazonada. */}
      {d.relevanciaRazon && (
        <p className="text-xs text-muted-foreground">Por qué lo descartó: {d.relevanciaRazon}</p>
      )}
      {d.url && (
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:underline"
        >
          Abrir el original ↗
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
