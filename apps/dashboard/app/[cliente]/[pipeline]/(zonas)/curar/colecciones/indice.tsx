"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOMBRE_MAX } from "@/domain/colecciones";
import { rutaDe } from "@/domain/rutas";
import type { Coleccion } from "@/lib/colecciones";
import { usarCockpit } from "../../usar-cockpit";
import { crear } from "./actions";

// El índice: crear una, y la grilla de las que hay.
//
// El acuse de recibo va **pegado al formulario** y no al pie de la página: la lección de la carga
// masiva de Históricos, donde el mensaje aparecía lejos de donde se había apretado y nadie lo veía.

export function Indice({ colecciones }: { colecciones: Coleccion[] }) {
  const cockpit = usarCockpit();
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [creando, startTransition] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (creando || nombre.trim() === "") return;
    startTransition(async () => {
      const r = await crear(cockpit, nombre);
      setAviso(r);
      if (r.ok) setNombre("");
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <form onSubmit={enviar} className="flex flex-wrap items-center gap-2">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la colección (ej. Grabar semana del 25)"
            maxLength={NOMBRE_MAX}
            className="max-w-md"
            aria-label="Nombre de la colección nueva"
          />
          <Button type="submit" disabled={creando || nombre.trim() === ""}>
            {creando ? "Creando…" : "Crear colección"}
          </Button>
        </form>
        {aviso && (
          <p className={`mt-2 text-sm ${aviso.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {aviso.mensaje}
          </p>
        )}
      </div>

      {colecciones.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay colecciones. Creá una arriba y después metele videos pegando sus links.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colecciones.map((c) => (
            <Link
              key={c.id}
              href={rutaDe(cockpit, `curar/colecciones/${c.id}`)}
              className="rounded-lg border bg-card p-4 transition-colors hover:border-primary"
            >
              <p className="font-medium">{c.nombre}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.videos} {c.videos === 1 ? "video" : "videos"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
