"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOMBRE_MAX } from "@/domain/colecciones";
import { rutaDe } from "@/domain/rutas";
import type { Coleccion } from "@/lib/colecciones";
import { usarCockpit } from "../../usar-cockpit";
import { borrar, crear } from "./actions";

// El índice: crear una, y la grilla de las que hay.
//
// El acuse de recibo va **pegado al formulario** y no al pie de la página: la lección de la carga
// masiva de Históricos, donde el mensaje aparecía lejos de donde se había apretado y nadie lo veía.

export function Indice({ colecciones }: { colecciones: Coleccion[] }) {
  const cockpit = usarCockpit();
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [creando, startTransition] = useTransition();
  /**
   * El error de borrar, **por colección**.
   *
   * No se reusa el `aviso` de arriba a propósito: está pegado al formulario de crear, y este
   * archivo ya tiene escrita la razón — *"la lección de la carga masiva de Históricos, donde el
   * mensaje aparecía lejos de donde se había apretado y nadie lo veía"*.
   *
   * 🔑 **Sólo el fallo necesita mensaje.** La página es `force-dynamic` y la action hace
   * `revalidatePath`, así que un borrado exitoso hace desaparecer la tarjeta — y eso **es** el
   * acuse de recibo. Un "borrada con éxito" flotando donde ya no hay nada es ruido.
   */
  const [erroresBorrado, setErroresBorrado] = useState<Record<string, string>>({});

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
            // 🔴 El `<Link>` envuelve **sólo el contenido**, y el botón vive afuera en el pie. Un
            // botón adentro de un `<a>` es un nido interactivo inválido y dos tabs para dos actos
            // distintos — el mismo problema que `tarjeta.tsx` ya documenta con su casilla. La forma
            // (contenido + pie con `border-t`) es la de `TarjetaVideo`, para que las dos grillas de
            // la app se lean igual.
            <div
              key={c.id}
              className="flex flex-col rounded-lg border bg-card transition-colors hover:border-primary"
            >
              <Link href={rutaDe(cockpit, `curar/colecciones/${c.id}`)} className="block p-4">
                <p className="font-medium">{c.nombre}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.videos} {c.videos === 1 ? "video" : "videos"}
                </p>
              </Link>

              <div className="mt-auto flex justify-end border-t px-2 py-1">
                <BotonBorrar
                  etiqueta="Borrar"
                  // Dice la verdad completa de ADR-073 y por eso tranquiliza en vez de asustar: la
                  // bolsa es descartable, **lo que se pagó no**. Con la colección vacía no hay nada
                  // que advertir.
                  advertencia={
                    c.videos === 0
                      ? "Está vacía."
                      : `Se va la lista de ${c.videos}. Los guiones limpios y la metadata comprada se quedan.`
                  }
                  onBorrar={() => borrar(cockpit, c.id)}
                  onResultado={(r) =>
                    setErroresBorrado((previo) =>
                      r.ok
                        ? // Éxito: la tarjeta se va con el revalidate. Se limpia por si esta misma
                          // colección había fallado antes.
                          Object.fromEntries(Object.entries(previo).filter(([id]) => id !== c.id))
                        : { ...previo, [c.id]: r.mensaje },
                    )
                  }
                />
              </div>

              {erroresBorrado[c.id] && (
                <p className="px-4 pb-2 text-xs text-destructive">{erroresBorrado[c.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
