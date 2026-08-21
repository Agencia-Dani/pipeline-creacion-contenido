"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// El envoltorio de las tarjetas de video: la grilla y el grupo plegable (ADR-072).
//
// Sale del mazo del Feed, que ya tenía el layout correcto. Las tres pantallas agrupan por cosas
// distintas —el Feed y Históricos por **proyecto**, Transcribir por **lote**— pero el control, el
// contador y el plegado son los mismos, así que el criterio de agrupación entra como texto y no
// como una variante del componente.

/**
 * La grilla. Cinco columnas en pantalla ancha, dos en teléfono.
 *
 * 📏 **Es también la respuesta a la escalabilidad**, y por eso es un componente y no una clase
 * suelta: 100 tarjetas de grilla se recorren, 100 filas altas con un `<details>` adentro no. Era el
 * problema real de Transcribir con un pegote grande.
 */
export function GrillaVideos({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}

/**
 * Un grupo de videos, plegable.
 *
 * 🔑 **El título ES el control.** Se trabaja de a un grupo por vez y los demás estorban; el
 * contador se queda visible plegado, que es justo lo que se quiere saber de un grupo cerrado.
 *
 * ⚠️ `conteo` es cuántos hay **cargados**, no cuántos existen. En el Feed el mazo pagina global por
 * heat, así que los grupos se llenan a medida que se carga más; el número del universo entero es el
 * del chip de filtro, arriba. Quien reuse esto tiene que saber cuál de los dos está mostrando.
 */
export function GrupoPlegable({
  titulo,
  conteo,
  plegado,
  onAlternar,
  children,
}: {
  titulo: string;
  conteo: number;
  plegado: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="border-b pb-1.5">
        <button
          type="button"
          onClick={onAlternar}
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
          <span className="font-medium">{titulo}</span>
          <span className="text-sm text-muted-foreground">{conteo}</span>
        </button>
      </h2>
      {!plegado && children}
    </section>
  );
}
