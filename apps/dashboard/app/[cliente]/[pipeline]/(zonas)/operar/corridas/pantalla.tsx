"use client";

import { useState, useTransition } from "react";
import { usarCockpit } from "../../usar-cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ESTADO_LEGIBLE,
  QUE_HACE_EL_NODO,
  WORKFLOWS,
  WORKFLOW_LEGIBLE,
  admiteVeredictoIA,
  avisosDe,
  conUnidad,
  cuentasSinAporte,
  disparoLegible,
  duracionLegible,
  fallo,
  lineasPorProyecto,
  llamadasDe,
  pasosDe,
  resumenCorto,
  veredicto,
  veredictoIA,
  type Corrida,
  type EstadoCorrida,
  type Workflow,
} from "@/domain/corrida";
import { fechaHora } from "@/lib/fechas";
import { contarVivos, explicarConIA, traerCorridas } from "./actions";

// La pantalla de corridas: 4 tabs, master/detail, lenguaje llano.
//
// 🔑 **Master/detail y no una pared de cartas**, y la forma sale del volumen medido: 84 corridas en
// 2 meses entre las cuatro máquinas. No es un problema de escala (a un año son ~250 en el tab más
// cargado) sino de forma — 20 cartas gordas no se recorren, 20 filas de una línea sí. El detalle se
// abre solo en la corrida que alguien eligió.
//
// ⚠️ **Cada tab dibuja lo suyo y no hay plantilla común.** Las cuatro máquinas hacen cosas
// distintas: el motor tiene embudo, por-proyecto y por-referente; el archivado guarda un solo
// número. Una plantilla común las habría obligado a hablar de "items", que es exactamente el
// idioma de dev que esta pantalla existe para no usar. Lo que unifica es `pasosDe`, en el dominio.

const BADGE_POR_ESTADO: Record<EstadoCorrida, "default" | "secondary" | "destructive" | "outline"> = {
  en_curso: "default",
  ok: "secondary",
  fallo: "destructive",
  parcial: "outline",
};

const TONO_TEXTO = {
  bien: "text-emerald-700 dark:text-emerald-500",
  aviso: "text-amber-700 dark:text-amber-500",
  malo: "text-destructive",
} as const;

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

/** El recorrido de la corrida: una fila por paso, con su unidad dicha. */
function Recorrido({ workflow, corrida }: { workflow: Workflow; corrida: Corrida }) {
  const pasos = pasosDe(workflow, corrida);
  if (pasos.length === 0) return null;
  return (
    <Seccion titulo="El recorrido">
      <ul className="rounded-lg border text-sm">
        {pasos.map((p) => (
          <li
            key={p.etiqueta}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b px-3 py-1.5 last:border-b-0"
          >
            <span>{p.etiqueta}</span>
            <span className="tabular-nums">
              {/* 🔑 La unidad se dice SIEMPRE, y es lo que impide leer el embudo como una resta:
                  `colectados` cuenta videos y `pretrim`/`gate` cuentan video × proyecto, así que
                  1.682 sale de 520 sin que nadie haya bajado más videos. */}
              <span className={p.tono === "normal" ? "" : TONO_TEXTO[p.tono === "malo" ? "malo" : "aviso"]}>
                {conUnidad(p.valor, p.unidad)}
              </span>
              {p.nota && <span className="text-amber-700 dark:text-amber-500"> · {p.nota}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

/** El desglose por proyecto: la única vista en unidades sanas, y por eso va primero. */
function PorProyecto({ corrida }: { corrida: Corrida }) {
  const lineas = lineasPorProyecto(corrida);
  if (lineas.length === 0) return null;
  return (
    <Seccion titulo="Qué pasó en cada proyecto">
      <ul className="rounded-lg border text-sm">
        {lineas.map((l) => (
          <li key={l.nombre} className="border-b px-3 py-2 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{l.nombre}</span>
              <span className="text-muted-foreground tabular-nums">
                miró {l.miro} · le gustaron {l.gustaron} · al feed{" "}
                <span className="text-foreground">
                  {l.entrego}
                  {l.pide > 0 && ` de ${l.pide}`}
                </span>
              </span>
            </div>
            <p className={cn("mt-0.5 text-xs", TONO_TEXTO[l.tono])}>{l.diagnostico}</p>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

/** Las cuentas que miró y de las que no le sirvió nada. Estaba en `metricas` y no lo dibujaba nadie. */
function CuentasMudas({ corrida }: { corrida: Corrida }) {
  const mudas = cuentasSinAporte(corrida);
  if (mudas.length === 0) return null;
  return (
    <Seccion titulo="Cuentas que no aportaron nada">
      <ul className="rounded-lg border text-sm">
        {mudas.map((c) => (
          <li
            key={c.handle}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b px-3 py-1.5 last:border-b-0"
          >
            <span className="font-mono text-xs">{c.handle}</span>
            <span className="text-muted-foreground tabular-nums">
              {c.miro} video{c.miro === 1 ? "" : "s"}, 0 aprobados
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Miró estos videos y no le sirvió ninguno para ningún proyecto. Si se repite corrida tras
        corrida, la cuenta está gastando presupuesto sin dar nada.
      </p>
    </Seccion>
  );
}

/** El fallo: dónde murió, qué hacía ese paso, y el mensaje crudo escondido. */
function Fallo({ corrida, dejoVivos }: { corrida: Corrida; dejoVivos: number | null }) {
  const f = fallo(corrida);
  if (!f) return null;
  const queHace = f.nodo ? QUE_HACE_EL_NODO[f.nodo] : undefined;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
        <p className="text-xs text-destructive">se cayó en el paso</p>
        <p className="font-mono text-sm text-destructive">{f.nodo ?? "no quedó registrado"}</p>
        {queHace && <p className="mt-1 text-sm text-destructive">Ese paso sirve para {queHace}.</p>}
      </div>

      {/* 🩸 Medido contra prod el 2026-08-31: las 12 corridas fallidas tienen `metricas` en NULL,
          las 12. `Resumen del run` es el último nodo del motor, así que una corrida que muere antes
          no deja ni un contador. Lo único que se puede contar es lo que alcanzó a ESCRIBIR, y eso
          se lee de las tablas por `run_id` (ADR-081). */}
      <p className="text-sm text-muted-foreground">
        {dejoVivos === null
          ? "No se pudo contar qué alcanzó a dejar."
          : dejoVivos === 0
            ? "No alcanzó a dejar ningún video en el feed."
            : `Alcanzó a dejar ${dejoVivos} video${dejoVivos === 1 ? "" : "s"} en el feed, que siguen ahí.`}{" "}
        Del resto de lo que hizo no queda registro: la corrida anota sus números al final, y se cayó
        antes.
      </p>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Mensaje técnico</summary>
        <p className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs break-words">
          {f.mensaje}
        </p>
      </details>
    </div>
  );
}

function Detalle({
  workflow,
  corrida,
  enlace,
  dejoVivos,
}: {
  workflow: Workflow;
  corrida: Corrida;
  enlace: string | undefined;
  dejoVivos: number | null;
}) {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState<string | null>(veredictoIA(corrida)?.texto ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pidiendo, pedir] = useTransition();

  const frases = veredicto(workflow, corrida);
  const llamadas = llamadasDe(corrida);
  const avisos = avisosDe(corrida);

  return (
    <div className="space-y-4 border-t bg-muted/20 px-3 py-4">
      {corrida.estado === "fallo" ? (
        <Fallo corrida={corrida} dejoVivos={dejoVivos} />
      ) : (
        <>
          <PorProyecto corrida={corrida} />
          <CuentasMudas corrida={corrida} />
          <Recorrido workflow={workflow} corrida={corrida} />
          {llamadas.length > 0 && (
            <Seccion titulo="Lo que le costó">
              <p className="text-sm text-muted-foreground">
                {llamadas.map((l) => `${l.servicio}: ${l.cuantas.toLocaleString("es")}`).join(" · ")}
              </p>
            </Seccion>
          )}
        </>
      )}

      {avisos.length > 0 && (
        <ul className="space-y-1">
          {avisos.map((a) => (
            <li key={a} className="text-sm text-amber-700 dark:text-amber-500">
              ⚠️ {a}
            </li>
          ))}
        </ul>
      )}

      {/* El veredicto: la capa determinística siempre, la de la IA a pedido. Van juntos y en ese
          orden a propósito — el de arriba sale de las reglas del motor y no puede contradecirlo. */}
      <div className="space-y-2 rounded-lg border bg-background px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">Veredicto</p>
        {frases.map((f) => (
          <p key={f} className="text-sm">
            {f}
          </p>
        ))}

        {texto && (
          <p className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">{texto}</p>
        )}
        {aviso && <p className="text-xs text-amber-700 dark:text-amber-500">{aviso}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!texto && admiteVeredictoIA(corrida) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pidiendo}
              onClick={() =>
                pedir(async () => {
                  setAviso(null);
                  const r = await explicarConIA(cockpit, corrida.id);
                  setTexto(r.texto);
                  setAviso(r.ok ? (r.mensaje || null) : r.mensaje);
                })
              }
            >
              {pidiendo ? "Pensando…" : "Explicar con IA"}
            </Button>
          )}
          {/* 🔒 Solo llega acá si el servidor lo puso en `enlaces`, y solo lo pone para `dev`: el
              equipo de redes no tiene cuenta en n8n, y un link que pide un login que no tenés es
              peor que ningún link. */}
          {enlace && (
            <a
              href={enlace}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Ver la ejecución en n8n ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function Pantalla({
  inicial,
  conteos,
  esDev,
}: {
  inicial: { workflow: Workflow; corridas: Corrida[]; enlaces: Record<string, string>; hayMas: boolean };
  conteos: Record<Workflow, { total: number; fallos: number }>;
  esDev: boolean;
}) {
  const cockpit = usarCockpit();
  const [workflow, setWorkflow] = useState<Workflow>(inicial.workflow);
  const [corridas, setCorridas] = useState(inicial.corridas);
  const [enlaces, setEnlaces] = useState(inicial.enlaces);
  const [hayMas, setHayMas] = useState(inicial.hayMas);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [vivos, setVivos] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, cargar] = useTransition();

  const ahora = new Date();

  function cambiarTab(nuevo: Workflow) {
    if (nuevo === workflow || cargando) return;
    setError(null);
    cargar(async () => {
      try {
        const p = await traerCorridas(cockpit, nuevo);
        // El tab se marca recién cuando las filas llegaron: si se marcara antes y la carga fallara,
        // la pantalla diría que estás en una máquina mientras muestra las corridas de otra.
        setWorkflow(nuevo);
        setCorridas(p.corridas);
        setEnlaces(p.enlaces);
        setHayMas(p.hayMas);
        setAbierta(null);
      } catch {
        setError("No se pudieron leer esas corridas. Probá de nuevo.");
      }
    });
  }

  function verMas() {
    cargar(async () => {
      try {
        const p = await traerCorridas(cockpit, workflow, corridas.length);
        setCorridas((c) => [...c, ...p.corridas]);
        setEnlaces((e) => ({ ...e, ...p.enlaces }));
        setHayMas(p.hayMas);
      } catch {
        setError("No se pudieron traer más corridas.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {WORKFLOWS.map((w) => (
          <button
            key={w}
            type="button"
            disabled={cargando}
            onClick={() => cambiarTab(w)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
              workflow === w ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
            )}
          >
            {WORKFLOW_LEGIBLE[w]}{" "}
            <span className="text-muted-foreground">{conteos[w].total}</span>
            {conteos[w].fallos > 0 && (
              <span className="text-destructive"> · {conteos[w].fallos} con fallo</span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {corridas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {cargando ? "Buscando…" : "Esta máquina todavía no corrió nunca en este cockpit."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border">
          {corridas.map((c) => {
            const resumen = resumenCorto(workflow, c);
            const f = fallo(c);
            const estaAbierta = abierta === c.id;
            return (
              <li key={c.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    const siguiente = estaAbierta ? null : c.id;
                    setAbierta(siguiente);
                    // Lo que la corrida dejó vivo solo hace falta cuando falló, y solo cuando
                    // alguien la abre: es un `head` count por corrida, no uno por fila de la lista.
                    if (siguiente && c.estado === "fallo" && !(c.id in vivos)) {
                      cargar(async () => {
                        const vivo = await contarVivos(cockpit, c.id);
                        setVivos((v) => ({ ...v, [c.id]: vivo }));
                      });
                    }
                  }}
                  aria-expanded={estaAbierta}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "text-xs text-muted-foreground transition-transform",
                      estaAbierta ? "" : "-rotate-90",
                    )}
                  >
                    ▼
                  </span>
                  <Badge variant={BADGE_POR_ESTADO[c.estado]}>{ESTADO_LEGIBLE[c.estado]}</Badge>
                  <span>{fechaHora(c.inicio)}</span>
                  <span className="text-muted-foreground">
                    {disparoLegible(workflow, c.trigger_type)} ·{" "}
                    {duracionLegible(c.inicio, c.fin, ahora)}
                  </span>
                  {/* En la fila plegada, un fallo dice el paso donde murió: es el dato que hacía
                      falta abrir n8n para conseguir. */}
                  {f?.nodo && (
                    <span className="font-mono text-xs text-destructive">{f.nodo}</span>
                  )}
                  {resumen && <span className="ml-auto tabular-nums">{resumen}</span>}
                </button>
                {estaAbierta && (
                  <Detalle
                    workflow={workflow}
                    corrida={c}
                    enlace={enlaces[c.id]}
                    dejoVivos={vivos[c.id] ?? null}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hayMas && (
        <Button type="button" variant="outline" size="sm" disabled={cargando} onClick={verMas}>
          {cargando ? "Trayendo…" : "Ver más corridas"}
        </Button>
      )}

      {!esDev && (
        <p className="text-xs text-muted-foreground">
          Si algo de acá no se entiende o pinta un error, mandale esta pantalla a un dev: acá está
          todo lo que hace falta para diagnosticarlo.
        </p>
      )}
    </div>
  );
}
