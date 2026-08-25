"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// El modo selección: cómo se actúa sobre **varios videos a la vez** en las pantallas que muestran
// tarjetas (Feed, Transcribir, Históricos, el detalle de una colección).
//
// 🔑 **La regla que gobierna el diseño: la pantalla en reposo no cambia.** Apagado, el modo no
// existe — ni casillas, ni barra, ni un pixel distinto. Se prende con un botón explícito en la
// cabecera, y no con un hover: Majo cura desde el teléfono cuando le toca, y en un teléfono el
// hover no existe. Un modo que solo se descubre pasando el mouse es un modo que no existe para la
// mitad del equipo.
//
// 🩸 **De dónde sale.** El plan de colecciones lo diseñó (§Diseño de UI, punto 2) y **no se
// construyó**, y ningún doc lo anotó como faltante: la fase se dio por cerrada porque su pantalla
// nueva funcionaba. La consecuencia medida el 2026-08-21: la única puerta a una colección era pegar
// links, así que agrupar un video que **ya estaba en pantalla** costaba abrirlo, copiar su url, ir
// a Colecciones y pegarla. Cuatro pasos para un clic.
//
// 🎨 **Este módulo no sabe qué se hace con lo seleccionado.** Las acciones entran como `children` de
// la barra, porque no son las mismas en cada pantalla: en el Feed se califica y se archiva, en
// Transcribir e Históricos se marca grabado, y en las cuatro se agrega a una colección. Esa asimetría
// es el punto — **ninguna pantalla ofrece una acción que no puede ejecutar** — y sostenerla acá
// adentro obligaría a que el componente conozca las cuatro pantallas.

export type Seleccion = {
  /** ¿El modo está prendido? Apagado, nada de esto se dibuja. */
  activo: boolean;
  prender: () => void;
  /** Apaga el modo y suelta lo marcado. Las dos cosas juntas, siempre. */
  cancelar: () => void;
  marcado: (clave: string) => boolean;
  alternar: (clave: string) => void;
  /** Las claves marcadas, en el orden en que se marcaron. */
  claves: string[];
  cuantos: number;
  /** Suelta lo marcado y deja el modo prendido: para después de ejecutar una acción. */
  limpiar: () => void;
};

/**
 * El estado del modo, sin UI.
 *
 * `Set` y no array: `marcado()` corre una vez por tarjeta en cada render y con 400 tarjetas —el
 * pegote grande de Transcribir es un caso real— un `includes` lineal sería 160.000 comparaciones por
 * render. El orden de marcado se conserva igual porque `Set` en JS itera por inserción.
 */
export function usarSeleccion(): Seleccion {
  const [activo, setActivo] = useState(false);
  const [claves, setClaves] = useState<Set<string>>(new Set());

  const cancelar = useCallback(() => {
    setActivo(false);
    setClaves(new Set());
  }, []);

  const alternar = useCallback((clave: string) => {
    setClaves((previo) => {
      const proximo = new Set(previo);
      if (!proximo.delete(clave)) proximo.add(clave);
      return proximo;
    });
  }, []);

  return useMemo(
    () => ({
      activo,
      prender: () => setActivo(true),
      cancelar,
      marcado: (clave: string) => claves.has(clave),
      alternar,
      claves: [...claves],
      cuantos: claves.size,
      limpiar: () => setClaves(new Set()),
    }),
    [activo, claves, cancelar, alternar],
  );
}

/**
 * El botón que prende el modo, para la cabecera de cada pantalla.
 *
 * Desaparece mientras el modo está prendido: ahí el control de salida es el `Cancelar` de la barra,
 * y dos formas de apagar lo mismo en pantallas distintas es cómo se aprende que una no funciona.
 *
 * 👁️ **`secondary` y no `outline`, y la etiqueta dice qué hace** (pedido de Mani el 2026-08-24: el
 * equipo no lo encontraba). En las cuatro pantallas este botón vive rodeado de `outline` —filtros,
 * `Descargar`, `Archivar`—, así que siendo uno más se leía como parte del mobiliario. Relleno
 * sólido lo separa de sus vecinos sin robarle el lugar al `default`, que en esas barras está
 * reservado para la acción principal de la pantalla.
 *
 * 🔤 **"Seleccionar varios" y no "Seleccionar"**: el verbo solo se nombra a sí mismo y deja al
 * lector adivinando qué se selecciona; "varios" es lo que el modo agrega, que es actuar sobre un
 * montón de una vez.
 */
export function BotonSeleccionar({
  seleccion,
  etiqueta = "Seleccionar varios",
}: {
  seleccion: Seleccion;
  etiqueta?: string;
}) {
  if (seleccion.activo) return null;
  return (
    <Button type="button" variant="secondary" size="sm" onClick={seleccion.prender}>
      {etiqueta}
    </Button>
  );
}

/**
 * La casilla que se dibuja sobre la miniatura. La pone `TarjetaVideo`, no cada pantalla.
 *
 * No es un `<input type="checkbox">` real: la tarjeta entera ya es un `<button>` que en modo
 * selección alterna la marca, así que un control focusable adentro de otro sería un nido inválido y
 * dos tabs para el mismo acto. El estado viaja por `aria-pressed` del botón que la contiene.
 */
export function CasillaSeleccion({ marcado }: { marcado: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded border-2 text-xs font-bold shadow-sm transition-colors",
        marcado
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/80 bg-background/70",
      )}
    >
      {marcado ? "✓" : ""}
    </span>
  );
}

/**
 * La barra fija de abajo. Solo aparece con el modo prendido.
 *
 * 🎨 `sticky` y no `fixed`: la barra pertenece a la lista, no a la ventana. Con `fixed` tapaba el
 * pie de las pantallas que ya tienen uno (el contador de tarjetas del Feed) y quedaba flotando sobre
 * el nav en las que no.
 *
 * ⚠️ **Con cero marcados la barra sigue ahí, con las acciones apagadas.** Se probó esconderla hasta
 * el primer clic y era peor: el modo quedaba prendido sin ninguna evidencia en pantalla, y el
 * `Cancelar` —la única salida— desaparecía con ella.
 */
export function BarraSeleccion({
  seleccion,
  children,
}: {
  seleccion: Seleccion;
  /** Las acciones de esta pantalla. Reciben `seleccion.claves` por su cuenta. */
  children: ReactNode;
}) {
  if (!seleccion.activo) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <span className="text-sm font-medium">
        {seleccion.cuantos} {seleccion.cuantos === 1 ? "seleccionado" : "seleccionados"}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={seleccion.cancelar}
      >
        Cancelar
      </Button>
    </div>
  );
}
