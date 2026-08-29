"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { advertenciaDeBorrado, NOMBRE_MAX } from "@/domain/colecciones";
import { rutaDe } from "@/domain/rutas";
import type { Coleccion } from "@/lib/colecciones";
import { usarCockpit } from "../../usar-cockpit";
import { borrar, crear, renombrar } from "./actions";

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
  /** Qué colección se está renombrando. Una a la vez: son dos clics, no una edición masiva. */
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);

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
              {renombrandoId === c.id ? (
                // 🔴 El formulario reemplaza a la tarjeta-link, no se agrega debajo: adentro del
                // `<a>` sería un nido interactivo inválido (lo mismo que ya obliga al botón de
                // borrar a vivir en el pie), y al lado dejaría dos veces el mismo nombre en
                // pantalla. Es el idioma de `BotonBorrar`: el control se reemplaza a sí mismo.
                <FormularioNombre
                  nombre={c.nombre}
                  onCancelar={() => setRenombrandoId(null)}
                  onGuardar={async (nuevo) => {
                    const r = await renombrar(cockpit, c.id, nuevo);
                    if (r.ok) setRenombrandoId(null);
                    return r;
                  }}
                />
              ) : (
                <Link href={rutaDe(cockpit, `curar/colecciones/${c.id}`)} className="block p-4">
                  <p className="font-medium">{c.nombre}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.videos} {c.videos === 1 ? "video" : "videos"}
                  </p>
                </Link>
              )}

              <div className="mt-auto flex items-center justify-end gap-1 border-t px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenombrandoId(renombrandoId === c.id ? null : c.id)}
                >
                  Renombrar
                </Button>
                <BotonBorrar
                  etiqueta="Borrar"
                  // La frase vive en el dominio: la dicen las DOS pantallas y no pueden divergir.
                  advertencia={advertenciaDeBorrado(c.videos)}
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

/**
 * El nombre en modo edición, dentro de la tarjeta.
 *
 * 🔑 **El error se muestra acá adentro y no en el aviso de arriba**, por la misma razón que este
 * archivo ya tiene escrita para el borrado: el aviso está pegado al formulario de crear, lejos de
 * la tarjeta donde se apretó. Y el caso que más importa —"ya tenés una colección que se llama
 * así"— hay que leerlo justo al lado del campo que hay que corregir.
 *
 * El éxito no dice nada: la action revalida y el nombre nuevo aparece en la tarjeta. Eso **es** el
 * acuse de recibo.
 */
function FormularioNombre({
  nombre,
  onGuardar,
  onCancelar,
}: {
  nombre: string;
  onGuardar: (nuevo: string) => Promise<{ ok: boolean; mensaje: string }>;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const sinCambio = valor.trim() === nombre || valor.trim() === "";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando || sinCambio) return;
    startTransition(async () => {
      const r = await onGuardar(valor);
      setError(r.ok ? null : r.mensaje);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-2 p-4">
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        maxLength={NOMBRE_MAX}
        autoFocus
        aria-label={`Nombre de la colección "${nombre}"`}
        // Escape cancela: es lo que espera cualquiera que abrió un campo por error.
        onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={guardando || sinCambio}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
