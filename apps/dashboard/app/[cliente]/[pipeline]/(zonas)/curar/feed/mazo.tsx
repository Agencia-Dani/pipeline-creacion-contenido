"use client";

import { rutaDe } from "@/domain/rutas";
import { usarCockpit } from "../../usar-cockpit";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  agrupar,
  ajustarCuentas,
  cursorDe,
  ETIQUETA_FILTRO,
  FILTRO_INICIAL,
  FILTROS,
  type Calificacion,
  type CandidatoFeed,
  type Filtro,
} from "@/domain/feed";
import { calificarCandidato, cargarMasFeed } from "./actions";
import { Detalle } from "./detalle";
import { Tarjeta } from "./tarjeta";

// El mazo: agrupado por proyecto, heat descendente adentro, filtro arriba, de a 25.
//
// 🔑 **La regla sigue siendo la misma: una tarjeta calificada NO se va del mazo hasta que se
// cambia de filtro o se recarga.** Lo que cambió es quién la sostiene. Antes había un congelado
// (`visibles`) que se recalculaba solo al cambiar de filtro, porque la lista se filtraba en el
// cliente y un `filter()` vivo habría hecho desaparecer la tarjeta de abajo del cursor —
// convirtiendo un misclick sobre 145 tarjetas en algo irrecuperable desde la pantalla
// (plan-cockpit §D6.4).
//
// Desde que el filtro se aplica **en la query**, ese congelado quedó sin trabajo y se borró:
// `cargados` solo cambia cuando se le pide algo al server (cambiar de filtro, o cargar más), y
// calificar no le pide nada. O sea que la regla dejó de depender de que alguien mantenga un `Set`
// sincronizado y pasó a ser **estructural**. Si algún día el filtro volviera al cliente, el
// congelado tiene que volver con él.
//
// Los contadores de los chips, en cambio, SÍ son vivos, y ahora sobre la tabla entera: salen de
// los cuatro `head` counts del server más los cambios de esta sesión (`ajustarCuentas`).

export function Mazo({
  inicial,
  hayMasInicial,
  cuentas,
  descartesPendientes,
}: {
  inicial: CandidatoFeed[];
  hayMasInicial: boolean;
  cuentas: Record<Filtro, number>;
  descartesPendientes: number;
}) {
  const cockpit = usarCockpit();
  const [cargados, setCargados] = useState(inicial);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [puestas, setPuestas] = useState<Record<string, Calificacion>>({});
  // La calificación que la fila tenía EN EL SERVER la primera vez que se la tocó en esta sesión.
  // Es lo que hace exacto el ajuste de los contadores: re-clickear tres emojis sobre la misma
  // tarjeta tiene que valer un solo delta, y el delta tiene que sobrevivir a un cambio de filtro
  // (que recarga las filas, pero no los conteos).
  const [originales, setOriginales] = useState<Record<string, Calificacion | null>>({});
  // ⚠️ `plegados` es estado propio y separado: plegar es solo dejar de dibujar un grupo, no tocar
  // qué está cargado. Arranca vacío — todo desplegado, que es el comportamiento de siempre.
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [cargando, startCargar] = useTransition();

  const efectiva = (c: CandidatoFeed): Calificacion | null => puestas[c.id] ?? c.calificacion;

  const ajustadas = ajustarCuentas(
    cuentas,
    Object.entries(puestas).map(([id, despues]) => ({ antes: originales[id] ?? null, despues })),
  );

  function alternarPlegado(proyecto: string) {
    setPlegados((p) => {
      const s = new Set(p);
      if (!s.delete(proyecto)) s.add(proyecto);
      return s;
    });
  }

  /**
   * Cambiar de filtro es pedirle al server la primera página de ESE filtro. No se puede resolver
   * en el cliente: lo cargado son 25 de N, así que filtrar en memoria mostraría "los 🔥 de estas
   * 25" en vez de "los primeros 25 🔥".
   *
   * El chip se marca recién cuando la página llegó. Si se marcara antes y la carga fallara, la
   * pantalla quedaría diciendo que el filtro es uno mientras muestra las tarjetas de otro.
   */
  function cambiarFiltro(nuevo: Filtro) {
    if (nuevo === filtro || cargando) return;
    setErrorLista(null);
    startCargar(async () => {
      const r = await cargarMasFeed(nuevo, null);
      if (!r.ok) {
        setErrorLista(r.mensaje);
        return;
      }
      setFiltro(nuevo);
      setCargados(r.candidatos);
      setHayMas(r.hayMas);
    });
  }

  /**
   * La página siguiente, por cursor y no por offset: con el filtro "Sin calificar" activo, cada
   * tarjeta que alguien califica sale del conjunto filtrado, y un `offset 25` se saltearía tantos
   * candidatos como calificaciones se hicieron — sin que nadie los vea nunca (ver `despuesDe`).
   */
  function mas() {
    setErrorLista(null);
    startCargar(async () => {
      const r = await cargarMasFeed(filtro, cursorDe(cargados));
      if (!r.ok) {
        setErrorLista(r.mensaje);
        return;
      }
      setCargados((c) => [...c, ...r.candidatos]);
      setHayMas(r.hayMas);
    });
  }

  function calificar(c: CandidatoFeed, calificacion: Calificacion) {
    const anterior = efectiva(c);
    // Optimista: sobre un mazo largo, esperar el ida y vuelta en cada click mata el ritmo. Si
    // falla, se revierte y la tarjeta muestra el error — nunca queda mintiendo.
    setOriginales((o) => (c.id in o ? o : { ...o, [c.id]: c.calificacion }));
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

  const grupos = agrupar(cargados);
  const abierto = cargados.find((c) => c.id === abiertoId) ?? null;
  const pendientes = ajustadas["sin-calificar"];
  const total = ajustadas[filtro];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            disabled={cargando}
            onClick={() => cambiarFiltro(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
              filtro === f ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
            )}
          >
            {ETIQUETA_FILTRO[f]} <span className="text-muted-foreground">{ajustadas[f]}</span>
          </button>
        ))}
      </div>

      {cargados.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === "sin-calificar"
            ? "No queda nada por calificar. El motor deja candidatos nuevos en cada corrida."
            : "Nada en este filtro."}
        </p>
      ) : (
        grupos.map((g) => {
          const plegado = plegados.has(g.proyecto);
          return (
            <section key={g.proyecto} className="space-y-3">
              {/* El título ES el control: los criterios son por proyecto, así que se trabaja de a
                  un grupo por vez y los demás estorban. El contador se queda visible plegado —
                  es justo lo que se quiere saber de un grupo cerrado.

                  ⚠️ Ese número es "cuántas de este proyecto hay CARGADAS", no cuántas existen: el
                  mazo pagina global por heat, así que los grupos se llenan a medida que se carga
                  más. El número que sí es del universo entero es el del chip, arriba. */}
              <h2 className="border-b pb-1.5">
                <button
                  type="button"
                  onClick={() => alternarPlegado(g.proyecto)}
                  aria-expanded={!plegado}
                  className="flex w-full items-baseline gap-2 text-left hover:text-primary"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "text-xs text-muted-foreground transition-transform",
                      plegado ? "-rotate-90" : "",
                    )}
                  >
                    ▼
                  </span>
                  <span className="font-medium">{g.proyecto}</span>
                  <span className="text-sm text-muted-foreground">{g.candidatos.length}</span>
                </button>
              </h2>
              {!plegado && (
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
              )}
            </section>
          );
        })
      )}

      {errorLista && <p className="text-sm text-destructive">{errorLista}</p>}

      {cargados.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {cargados.length} de {total}.
          </p>
          {hayMas && (
            <Button variant="outline" onClick={mas} disabled={cargando}>
              {cargando ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </div>
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
            <Link href={rutaDe(cockpit, "curar/descartes")}>Auditar los descartes</Link>
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
