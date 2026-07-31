"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aprobar, descartar, type Resultado } from "./actions";

// Una propuesta = una tarjeta con lo que hace falta para decidir sin salir de la pantalla:
// la razón que escribió el jurado, la bio, el tamaño y qué referentes propios la recomendaron.
// Aprobar es irreversible en la práctica (siembra la cuenta y la propuesta se cierra), así que
// el botón dice qué va a pasar en vez de "OK".

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
  const [enviando, startTransition] = useTransition();

  const alternar = (id: string) =>
    setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const resuelta = resultado?.ok === true;

  if (resuelta) {
    return (
      <div className="border-b py-4 text-sm text-muted-foreground last:border-b-0">
        {propuesta.handle} · {resultado.mensaje}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        {propuesta.url ? (
          <a
            href={propuesta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
          >
            {propuesta.handle}
          </a>
        ) : (
          <span className="font-medium">{propuesta.handle}</span>
        )}
        <Badge variant="outline">{propuesta.plataforma}</Badge>
        {propuesta.afinidad !== null && (
          <Badge variant="secondary" title="Qué tan bien pega con el tema, de 0 a 1.">
            afinidad {propuesta.afinidad}
          </Badge>
        )}
        {propuesta.seguidores !== null && (
          <span className="text-xs text-muted-foreground">{miles(propuesta.seguidores)} seguidores</span>
        )}
      </div>

      {propuesta.razon && <p className="text-sm">{propuesta.razon}</p>}
      {propuesta.bio && <p className="text-xs text-muted-foreground">Bio: {propuesta.bio}</p>}
      {propuesta.semillas && (
        <p className="text-xs text-muted-foreground">La recomendaron: {propuesta.semillas}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {proyectos.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm">
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={enviando || elegidos.length === 0}
          onClick={() => startTransition(async () => setResultado(await aprobar(propuesta.id, elegidos)))}
        >
          {enviando ? "Guardando…" : "Aprobar y empezar a rastrear"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={enviando}
          onClick={() => startTransition(async () => setResultado(await descartar(propuesta.id)))}
        >
          Descartar
        </Button>
        {elegidos.length === 0 && (
          <span className="text-xs text-muted-foreground">Elegí a qué proyecto entraría.</span>
        )}
      </div>

      {resultado && !resultado.ok && <p className="text-xs text-destructive">{resultado.mensaje}</p>}
    </div>
  );
}
