"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { aprobar, descartar, type Resultado } from "./actions";

// Una propuesta = una fila compacta. Antes cada una desplegaba razón + bio + semillas + una
// grilla de checkboxes con TODOS los proyectos, y con 8 propuestas la pantalla era un muro donde
// no se sabía dónde mirar.
//
// La clave para poder compactarla sin perder el flujo: **el buscador ya viene con los proyectos
// sugeridos** (los escribe en `referentes_propuestos_proyectos`), así que el caso normal se
// aprueba de un click sin abrir nada. Abrir el record es para leer la razón completa o cambiar
// los proyectos, que es lo excepcional.

export type ProyectoOpcion = { id: string; nombre: string; activo: boolean };

export type PropuestaVista = {
  id: string;
  handle: string;
  plataforma: string;
  url: string | null;
  afinidad: number | null;
  razon: string | null;
  bio: string | null;
  seguidores: number | null;
  semillas: string | null;
  proyectoIdsSugeridos: string[];
};

const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

export function Tarjeta({
  propuesta,
  proyectos,
}: {
  propuesta: PropuestaVista;
  proyectos: ProyectoOpcion[];
}) {
  const [elegidos, setElegidos] = useState(propuesta.proyectoIdsSugeridos);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();

  const nombrePorId = new Map(proyectos.map((p) => [p.id, p.nombre]));
  const alternar = (id: string) =>
    setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const decidir = (accion: () => Promise<Resultado>) =>
    startTransition(async () => {
      const r = await accion();
      setResultado(r);
      if (r.ok) setAbierto(false);
    });

  // Resuelta: la fila se colapsa a una línea en vez de desaparecer, así se ve el avance.
  if (resultado?.ok) {
    return (
      <div className="border-b py-3 text-sm text-muted-foreground last:border-b-0">
        {propuesta.handle} · {resultado.mensaje}
      </div>
    );
  }

  const acciones = (
    <>
      <Button
        size="sm"
        disabled={enviando || elegidos.length === 0}
        onClick={() => decidir(() => aprobar(propuesta.id, elegidos))}
      >
        {enviando ? "Guardando…" : "Aprobar"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={enviando}
        onClick={() => decidir(() => descartar(propuesta.id))}
      >
        Descartar
      </Button>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3 last:border-b-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="font-medium hover:underline"
            >
              {propuesta.handle}
            </button>
            <Badge variant="secondary">{propuesta.plataforma}</Badge>
            {propuesta.afinidad !== null && (
              <Badge variant="outline" title="Qué tan bien pega con el tema, de 0 a 1.">
                afinidad {propuesta.afinidad}
              </Badge>
            )}
            {propuesta.seguidores !== null && (
              <span className="text-xs text-muted-foreground">
                {miles(propuesta.seguidores)} seguidores
              </span>
            )}
          </div>
          {/* La razón decide la mayoría de los casos, así que se muestra — pero recortada a una
              línea. La completa está a un click, en el record. */}
          {propuesta.razon && (
            <p className="line-clamp-1 text-sm text-muted-foreground">{propuesta.razon}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {elegidos.length === 0 ? (
              <span className="text-destructive">
                Sin proyecto elegido — abrila para decidir a cuál entra.
              </span>
            ) : (
              <>entraría a: {elegidos.map((id) => nombrePorId.get(id) ?? "?").join(" · ")}</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{acciones}</div>
      </div>

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo={propuesta.handle}
        subtitulo={`${propuesta.plataforma}${propuesta.afinidad !== null ? ` · afinidad ${propuesta.afinidad}` : ""}${propuesta.seguidores !== null ? ` · ${miles(propuesta.seguidores)} seguidores` : ""}`}
      >
        {propuesta.url && (
          <a
            href={propuesta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            ver la cuenta ↗
          </a>
        )}
        {propuesta.razon && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Por qué la propone el buscador
            </p>
            <p className="text-sm">{propuesta.razon}</p>
          </div>
        )}
        {propuesta.bio && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Bio de la cuenta</p>
            <p className="text-sm">{propuesta.bio}</p>
          </div>
        )}
        {propuesta.semillas && (
          <p className="text-xs text-muted-foreground">La recomendaron: {propuesta.semillas}</p>
        )}

        <div className="space-y-1">
          <Label>A qué proyectos entraría</Label>
          <p className="text-xs text-muted-foreground">
            El buscador ya propuso los que mejor pegan. Al menos uno: aprobar sin proyecto no
            haría nada.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {proyectos.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={elegidos.includes(p.id)}
                  onChange={() => alternar(p.id)}
                  disabled={enviando}
                  className="size-4 accent-primary"
                />
                <span className={p.activo ? "" : "text-muted-foreground"}>
                  {p.nombre}
                  {p.activo ? "" : " (pausado)"}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-4 border-t bg-card px-4 py-3">
          <p className={`text-xs ${resultado?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
            {resultado?.mensaje ??
              (elegidos.length === 0
                ? "Elegí a qué proyecto entraría."
                : "Aprobar la suma al banco y empieza a traer videos.")}
          </p>
          <div className="flex shrink-0 items-center gap-2">{acciones}</div>
        </div>
      </Modal>
    </>
  );
}
