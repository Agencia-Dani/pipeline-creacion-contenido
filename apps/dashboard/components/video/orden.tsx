"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  filtrarPor,
  opcionesDe,
  ordenar,
  type CriterioOrden,
  type Direccion,
  type Faceta,
  type OpcionFaceta,
} from "@/domain/orden";
import { cn } from "@/lib/utils";

// El control de orden y filtro de las pantallas de video (ADR-076).
//
// 🎨 **Espejo deliberado de `seleccion.tsx`**: un hook que tiene el estado (`usarOrden`) y un
// componente que lo dibuja (`BarraOrden`). Mismo reparto, mismo lugar en la cabecera y la misma
// razón — la pantalla decide qué se puede ordenar y filtrar, el módulo no conoce ninguna pantalla.
//
// 🔑 **El default es `null`: no reordenar.** Las cuatro pantallas ya llegan ordenadas por alguien
// (`agrupar()`, `armarRegistro()`, `ordenarDescartes()`, el orden de inserción). El control por
// defecto tiene que NO tocar eso — reproducir esas reglas acá serían dos implementaciones de cada
// una, que es el error que ADR-072 §2 ya nombró.

export type Orden<T> = {
  /** Lo que la pantalla tiene que dibujar: filtrado y ordenado. */
  visibles: T[];
  /** Para el `<Select>`. */
  criterios: readonly CriterioOrden<T>[];
  claveCriterio: string;
  elegirCriterio: (clave: string) => void;
  direccion: Direccion;
  alternarDireccion: () => void;
  /** Sólo las facetas que tienen 2+ valores distintos en lo cargado. */
  facetasVisibles: readonly { faceta: Faceta<T>; opciones: readonly OpcionFaceta[] }[];
  elegidos: Readonly<Record<string, string[]>>;
  alternarValor: (claveFaceta: string, valor: string) => void;
  /** ¿Hay alguna faceta activa? Es lo que decide si se dibuja el "Limpiar". */
  hayFiltro: boolean;
  limpiarFiltros: () => void;
};

/** El sentinel del `<Select>` para "el orden que ya trae la lista". */
export const SIN_CRITERIO = "";

/**
 * El estado del control, más el cálculo de lo visible.
 *
 * ⚠️ **`criterios` y `facetas` tienen que ser estables entre renders** (declarados como constantes
 * a nivel de módulo, o memoizados). Si se arman inline en el cuerpo del componente, los `useMemo`
 * de acá se invalidan en cada render. Es la misma trampa que ya costó un bucle de fetch en
 * `colecciones/[id]/detalle.tsx`, donde `usarCockpit()` armaba un objeto nuevo por render.
 */
export function usarOrden<T>(
  items: readonly T[],
  criterios: readonly CriterioOrden<T>[],
  facetas: readonly Faceta<T>[] = [],
): Orden<T> {
  const [claveCriterio, setClaveCriterio] = useState<string>(SIN_CRITERIO);
  const [direccion, setDireccion] = useState<Direccion>("desc");
  const [elegidos, setElegidos] = useState<Record<string, string[]>>({});

  // Las opciones se cuentan sobre `items` ENTERO y no sobre lo ya filtrado: si se contaran sobre lo
  // filtrado, prender un chip haría desaparecer los otros y no habría cómo volver.
  const facetasVisibles = useMemo(
    () =>
      facetas
        .map((faceta) => ({ faceta, opciones: opcionesDe(items, faceta) }))
        .filter((f) => f.opciones.length >= 2),
    [items, facetas],
  );

  const visibles = useMemo(() => {
    let salida = [...items];
    for (const { faceta } of facetasVisibles) {
      salida = filtrarPor(salida, faceta, elegidos[faceta.clave] ?? []);
    }
    const criterio = criterios.find((c) => c.clave === claveCriterio) ?? null;
    return ordenar(salida, criterio, direccion);
  }, [items, facetasVisibles, elegidos, criterios, claveCriterio, direccion]);

  const hayFiltro = Object.values(elegidos).some((v) => v.length > 0);

  return {
    visibles,
    criterios,
    claveCriterio,
    elegirCriterio: setClaveCriterio,
    direccion,
    alternarDireccion: () => setDireccion((d) => (d === "desc" ? "asc" : "desc")),
    facetasVisibles,
    elegidos,
    alternarValor: (claveFaceta, valor) =>
      setElegidos((previo) => {
        const actuales = previo[claveFaceta] ?? [];
        return {
          ...previo,
          [claveFaceta]: actuales.includes(valor)
            ? actuales.filter((v) => v !== valor)
            : [...actuales, valor],
        };
      }),
    hayFiltro,
    limpiarFiltros: () => setElegidos({}),
  };
}

/**
 * La barra. Va en la cabecera, al lado de `<BotonSeleccionar>`.
 *
 * 🎨 El `<Select>` del repo y no un `<select>` con clases propias: ese componente existe justo
 * porque cuatro pantallas lo tenían escrito a mano con dos alturas distintas y las columnas de
 * controles se veían como escalones. Los chips van `outline` y la flecha `ghost` — este bloque
 * convive con los chips de filtro que ya existen y tiene que leerse como uno más de ellos, no
 * competir. El `default` de esas barras está reservado para la acción principal de la pantalla.
 *
 * Si la pantalla no tiene criterios ni facetas dibujables, no se dibuja nada.
 */
export function BarraOrden<T>({ orden }: { orden: Orden<T> }) {
  if (orden.criterios.length === 0 && orden.facetasVisibles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {orden.criterios.length > 0 && (
        <>
          <label htmlFor="orden-criterio" className="text-sm text-muted-foreground">
            Ordenar por
          </label>
          <Select
            id="orden-criterio"
            value={orden.claveCriterio}
            onChange={(e) => orden.elegirCriterio(e.target.value)}
          >
            {/* La primera opción es el default de la pantalla: no reordenar. */}
            <option value={SIN_CRITERIO}>Lo que muestra la pantalla</option>
            {orden.criterios.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // Sin criterio la flecha no significa nada: el orden lo puso la pantalla.
            disabled={orden.claveCriterio === SIN_CRITERIO}
            onClick={orden.alternarDireccion}
            aria-label={
              orden.direccion === "desc" ? "Ordenar de menor a mayor" : "Ordenar de mayor a menor"
            }
          >
            {orden.direccion === "desc" ? "↓" : "↑"}
          </Button>
        </>
      )}

      {orden.facetasVisibles.map(({ faceta, opciones }) => (
        <span key={faceta.clave} className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-muted-foreground">{faceta.etiqueta}</span>
          {opciones.map((o) => {
            const activo = (orden.elegidos[faceta.clave] ?? []).includes(o.valor);
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => orden.alternarValor(faceta.clave, o.valor)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  activo ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
                )}
              >
                {o.valor} <span className="text-muted-foreground">{o.cuantos}</span>
              </button>
            );
          })}
        </span>
      ))}

      {orden.hayFiltro && (
        <Button type="button" variant="ghost" size="sm" onClick={orden.limpiarFiltros}>
          Limpiar
        </Button>
      )}
    </div>
  );
}
