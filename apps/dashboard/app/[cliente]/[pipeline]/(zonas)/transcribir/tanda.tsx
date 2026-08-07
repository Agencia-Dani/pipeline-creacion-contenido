"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LARGO_MAX_TITULO, resumenDeTanda, tituloDeTanda } from "@/domain/tanda";
import type { CabeceraTanda } from "@/lib/tandas";
import type { Transcripcion } from "@/lib/transcripciones";
import { cargarTanda, ponerTituloATanda } from "./actions";
import { Fila } from "./fila";
import { usarCockpit } from "../usar-cockpit";

// Una tanda: el pegote como cosa que se abre, se cierra y se puede nombrar (ADR-064).
//
// 🔑 **Las filas bajan al expandir, y ahí está el arreglo.** La página carga cabeceras —título y
// contadores, una fila por tanda— así que se ven **todas** las tandas, no las últimas 50 filas de
// una lista que ocultaba más de la mitad sin decirlo. El `script` es el campo gordo y una tanda
// colapsada no lo necesita: es la misma forma que llevó el feed de 405 KB a 16 KB (cierre 98).
//
// `<details>` nativo y no un componente de acordeón: da el colapsable, el estado abierto/cerrado y
// el teclado gratis, y `onToggle` es el gancho que dispara la carga. No hay primitiva de
// collapsible en `components/ui` y esto no la pide.
//
// 🔒 **Se carga UNA vez por apertura**, no en cada toggle: sin el `if (filas) return`, cerrar y
// abrir una tanda de 52 enlaces vuelve a pedir sus 52 scripts.
export function Tanda({
  cabecera,
  autor,
  cuando,
  ahora,
}: {
  cabecera: CabeceraTanda;
  autor: string | null;
  /** El momento ya formateado: la zona horaria vive en `lib/fechas.ts` y el server la resuelve. */
  cuando: string;
  ahora: Date;
}) {
  const cockpit = usarCockpit();
  const [filas, setFilas] = useState<Transcripcion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startCarga] = useTransition();

  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(cabecera.titulo ?? "");
  // Optimista sobre el prop: el `revalidatePath` de la acción refresca el server component, pero
  // hasta que llegue la cabecera seguiría mostrando el nombre viejo debajo del input recién cerrado.
  const [titulo, setTitulo] = useState(cabecera.titulo);
  const [guardando, startGuardado] = useTransition();

  const abrir = (abierto: boolean) => {
    if (!abierto || filas || cargando) return;
    startCarga(async () => {
      const r = await cargarTanda(cockpit, cabecera.id);
      if (r.ok) {
        setFilas(r.filas);
        setError(null);
      } else {
        setError(r.mensaje);
      }
    });
  };

  const guardar = () =>
    startGuardado(async () => {
      const r = await ponerTituloATanda(cockpit, cabecera.id, texto);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setTitulo(texto.trim() || null);
      setEditando(false);
      setError(null);
    });

  return (
    <li className="rounded-lg border">
      <details onToggle={(e) => abrir(e.currentTarget.open)}>
        <summary className="cursor-pointer list-none p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium">
              {tituloDeTanda(titulo, cabecera.total, cuando)}
            </span>
            <span className="text-sm text-muted-foreground">
              {resumenDeTanda(cabecera)}
              {/* Quién pegó. Se muestra sea dueño, sponsor u operador (decisión de Mani, ADR-064
                  §5): dice a quién preguntarle por estos links. Las 9 del backfill no lo tienen —
                  son anteriores a la columna— y ahí no se dibuja nada en vez de inventar. */}
              {autor && ` · pegada por ${autor}`}
            </span>
          </div>
        </summary>

        <div className="space-y-4 border-t p-4">
          <div className="flex flex-wrap items-center gap-2">
            {editando ? (
              <>
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={LARGO_MAX_TITULO}
                  disabled={guardando}
                  placeholder="Cómo la vas a reconocer (dejalo vacío para volver al nombre automático)"
                  className="max-w-md"
                />
                <Button size="sm" onClick={guardar} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTexto(titulo ?? "");
                    setEditando(false);
                  }}
                  disabled={guardando}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                {titulo ? "Cambiar el nombre" : "Ponerle nombre"}
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {cargando && !filas ? (
            <p className="text-sm text-muted-foreground">Trayendo los enlaces…</p>
          ) : filas && filas.length > 0 ? (
            <ul className="space-y-4">
              {filas.map((t) => (
                <Fila key={t.id} t={t} ahora={ahora} />
              ))}
            </ul>
          ) : filas ? (
            <p className="text-sm text-muted-foreground">Esta tanda se quedó sin enlaces.</p>
          ) : null}
        </div>
      </details>
    </li>
  );
}
