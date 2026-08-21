"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  agregarSeleccionados,
  coleccionesParaElegir,
} from "@/app/[cliente]/[pipeline]/(zonas)/curar/colecciones/actions";
import { usarCockpit } from "@/app/[cliente]/[pipeline]/(zonas)/usar-cockpit";
import type { Seleccion } from "@/components/video/seleccion";

// La acción del modo selección que existe en las cuatro pantallas: meter lo marcado en una bolsa.
//
// Vive en `components/` por la misma razón que `<BotonBuscar>`: lo renderizan zonas distintas
// (Curar y Transcribir) y es el mismo componente, no una copia. La acción que llama sí vive con su
// sustantivo, en `curar/colecciones/actions.ts`.
//
// 🔑 **Manda las URLS de lo seleccionado, no llaves derivadas.** La identidad del video la calcula
// el server con `parsearEnlaces` — la misma derivación que el pegote, la cola y el motor. Una
// segunda derivación viviendo en el browser es un bug mudo esperando a que una de las dos cambie.
//
// ⚠️ **Las colecciones se piden al abrir el diálogo, no al montar.** El botón vive en una barra que
// aparece en cuanto alguien prende el modo, y pedir la lista ahí sería una consulta por cada vez que
// alguien tantea el modo y lo cancela. Se pide cuando ya hay intención.

export function AgregarAColeccion({
  seleccion,
  /** `clave → url` de lo que se puede seleccionar en esta pantalla. */
  urlPorClave,
  onListo,
}: {
  seleccion: Seleccion;
  urlPorClave: (clave: string) => string | null;
  /** Después de agregar bien: la pantalla decide si suelta la marca, refresca o las dos cosas. */
  onListo?: (mensaje: string) => void;
}) {
  const cockpit = usarCockpit();
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<{ id: string; nombre: string }[] | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const abrir = () => {
    setAbierto(true);
    setError(null);
    setNombreNuevo("");
    setOpciones(null);
    startTransition(async () => setOpciones(await coleccionesParaElegir(cockpit)));
  };

  const urls = () =>
    seleccion.claves.map(urlPorClave).filter((u): u is string => typeof u === "string" && u !== "");

  const agregar = (destino: { coleccionId: string } | { nombreNuevo: string }) => {
    setError(null);
    startTransition(async () => {
      const r = await agregarSeleccionados(cockpit, destino, urls());
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setAbierto(false);
      seleccion.limpiar();
      onListo?.(r.mensaje);
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={seleccion.cuantos === 0 || enviando}
        onClick={abrir}
      >
        Agregar a colección
      </Button>

      <Modal
        abierto={abierto}
        ancho="28rem"
        titulo={`Agregar ${seleccion.cuantos} ${seleccion.cuantos === 1 ? "video" : "videos"} a una colección`}
        onCerrar={() => setAbierto(false)}
      >
        <div className="space-y-4">
            {opciones === null ? (
              <p className="text-sm text-muted-foreground">Buscando tus colecciones…</p>
            ) : opciones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no tenés ninguna colección. Poné un nombre acá abajo y se crea sola.
              </p>
            ) : (
              <div className="space-y-1.5">
                {opciones.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={enviando}
                    onClick={() => agregar({ coleccionId: c.id })}
                  >
                    {c.nombre}
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">…o crear una nueva</p>
              <div className="flex gap-2">
                <Input
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  placeholder="Reels de septiembre"
                  disabled={enviando}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nombreNuevo.trim()) agregar({ nombreNuevo });
                  }}
                />
                <Button
                  type="button"
                  disabled={enviando || nombreNuevo.trim() === ""}
                  onClick={() => agregar({ nombreNuevo })}
                >
                  Crear
                </Button>
              </div>
            </div>

            {/* ADR-075: lo dice antes de que pase, no después. Un efecto secundario sobre el juicio
                de otra persona no se descubre en el mensaje de éxito. */}
            <p className="text-xs text-muted-foreground">
              Lo que agregues y todavía no esté calificado queda en 👍, para que llegue al histórico
              con su guion. Lo que ya calificaste no se toca.
            </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
