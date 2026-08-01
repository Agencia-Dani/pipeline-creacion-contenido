"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  agrupar,
  contarPorFiltro,
  ETIQUETA_FILTRO,
  FILTROS,
  pasaFiltro,
  type Calificacion,
  type CandidatoFeed,
  type Filtro,
} from "@/domain/feed";
import { calificarCandidato } from "./actions";
import { Detalle } from "./detalle";
import { Tarjeta } from "./tarjeta";

// El mazo: agrupado por proyecto, heat descendente adentro, filtro arriba.
//
// 🔑 La regla que explica la forma de este componente: **una tarjeta calificada no se va del
// mazo hasta que se cambia de filtro o se recarga.** Por eso la lista visible (`visibles`) es
// un congelado que se recalcula SOLO al cambiar de filtro, y no un `filter()` en cada render.
// Si se recalculara sola, la tarjeta desaparecería de abajo del cursor al calificarla y un
// misclick sobre 145 tarjetas sería irrecuperable desde la pantalla (plan-cockpit §D6.4).
//
// Los contadores de los chips, en cambio, SÍ son vivos: son el avance acumulándose.

export function Mazo({
  candidatos,
  descartesPendientes,
}: {
  candidatos: CandidatoFeed[];
  descartesPendientes: number;
}) {
  const [puestas, setPuestas] = useState<Record<string, Calificacion>>({});
  const [filtro, setFiltro] = useState<Filtro>("sin-calificar");
  const [visibles, setVisibles] = useState<Set<string>>(
    () => new Set(candidatos.filter((c) => pasaFiltro(c, "sin-calificar")).map((c) => c.id)),
  );
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const efectiva = (c: CandidatoFeed): Calificacion | null => puestas[c.id] ?? c.calificacion;
  const cuentas = contarPorFiltro(candidatos.map((c) => ({ calificacion: efectiva(c) })));

  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo);
    setVisibles(
      new Set(
        candidatos.filter((c) => pasaFiltro({ calificacion: efectiva(c) }, nuevo)).map((c) => c.id),
      ),
    );
  }

  function calificar(c: CandidatoFeed, calificacion: Calificacion) {
    const anterior = efectiva(c);
    // Optimista: sobre 145 tarjetas, esperar el ida y vuelta a Airtable en cada click mata el
    // ritmo. Si falla, se revierte y la tarjeta muestra el error — nunca queda mintiendo.
    setPuestas((p) => ({ ...p, [c.id]: calificacion }));
    setErrores(({ [c.id]: _, ...resto }) => resto);
    setEnviando((e) => new Set(e).add(c.id));

    startTransition(async () => {
      const r = await calificarCandidato(c.id, calificacion);
      setEnviando((e) => {
        const s = new Set(e);
        s.delete(c.id);
        return s;
      });
      if (!r.ok) {
        setPuestas((p) => {
          const copia = { ...p };
          if (anterior === null) delete copia[c.id];
          else copia[c.id] = anterior;
          return copia;
        });
        setErrores((e) => ({ ...e, [c.id]: r.mensaje }));
      }
    });
  }

  const enPantalla = candidatos.filter((c) => visibles.has(c.id));
  const grupos = agrupar(enPantalla);
  const abierto = candidatos.find((c) => c.id === abiertoId) ?? null;
  const pendientes = cuentas["sin-calificar"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => cambiarFiltro(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filtro === f ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
            )}
          >
            {ETIQUETA_FILTRO[f]} <span className="text-muted-foreground">{cuentas[f]}</span>
          </button>
        ))}
      </div>

      {enPantalla.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === "sin-calificar"
            ? "No queda nada por calificar. El motor deja candidatos nuevos en cada corrida."
            : "Nada en este filtro."}
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.proyecto} className="space-y-3">
            <h2 className="flex items-baseline gap-2 border-b pb-1.5">
              <span className="font-medium">{g.proyecto}</span>
              <span className="text-sm text-muted-foreground">{g.candidatos.length}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {g.candidatos.map((c) => (
                <Tarjeta
                  key={c.id}
                  candidato={c}
                  puesta={efectiva(c)}
                  enviando={enviando.has(c.id)}
                  error={errores[c.id] ?? null}
                  onCalificar={(cal) => calificar(c, cal)}
                  onAbrir={() => setAbiertoId(c.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* El encadenamiento con los descartes. Va SIEMPRE al pie del mazo, no solo al terminar
          la cola: condicionarlo a "0 pendientes" sonaba bien y no se dispararía casi nunca —
          son 145 por semana y nadie los despacha de una sentada, así que la invitación no
          llegaría justo en las sesiones normales. Lo que cambia con la cola vacía es el énfasis,
          no la existencia. El costo de no verla es alto: 0 auditorías desde que la tabla existe,
          y el archivado las borra cada domingo. */}
      {descartesPendientes > 0 && (
        <div
          className={cn(
            "rounded-lg border p-4",
            pendientes === 0 ? "border-primary/40 bg-primary/5" : "border-dashed",
          )}
        >
          <p className="font-medium">
            {pendientes === 0
              ? `Terminaste el feed. Quedan ${descartesPendientes} descartes por auditar.`
              : `Y quedan ${descartesPendientes} descartes por auditar.`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Son los videos que el filtro mató por poco. Decir cuáles eran buenos es lo que corrige
            los criterios — y el domingo se borran.
          </p>
          <Button asChild size="sm" variant={pendientes === 0 ? "default" : "outline"} className="mt-3">
            <Link href="/curar/descartes">Auditar los descartes</Link>
          </Button>
        </div>
      )}

      <Detalle
        candidato={abierto}
        puesta={abierto ? efectiva(abierto) : null}
        enviando={abierto ? enviando.has(abierto.id) : false}
        onCalificar={(cal) => abierto && calificar(abierto, cal)}
        onCerrar={() => setAbiertoId(null)}
      />
    </div>
  );
}
