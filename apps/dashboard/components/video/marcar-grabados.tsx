"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { marcarMuchosComoGrabados } from "@/app/[cliente]/[pipeline]/(zonas)/curar/historicos/actions";
import { usarCockpit } from "@/app/[cliente]/[pipeline]/(zonas)/usar-cockpit";
import type { Seleccion } from "@/components/video/seleccion";

// "Ya grabamos estos" en lote, desde el modo selección (ADR-070).
//
// 🔑 **Reusa `marcarMuchosComoGrabados`, la acción de la carga masiva, en vez de escribir una
// hermana.** Esa acción ya hace exactamente esto: texto → `parsearEnlaces` → `marcarMuchos`, con su
// upsert `ignoreDuplicates` que cuenta cuántos ya estaban. Pasarle las urls separadas por saltos de
// línea es la misma entrada que un pegote de 300 links. Una segunda acción sería la misma lógica en
// dos lugares que pueden divergir.
//
// La única diferencia que sí importa viaja en `origen`: **el evento tiene que poder distinguir un
// pegote de una selección**, porque `app.eventos` es hoy el único instrumento que dice si alguien
// usa esto de verdad.
//
// 🔓 **Sin confirmación**, igual que el botón por tarjeta: marcar se deshace desmarcando y no
// destruye nada. La confirmación se guarda para lo que no vuelve.

export function MarcarGrabados({
  seleccion,
  urlPorClave,
  onListo,
}: {
  seleccion: Seleccion;
  urlPorClave: (clave: string) => string | null;
  /**
   * `claves` son las que se acababan de marcar. Van como parámetro y **no se leen de `seleccion`
   * adentro del callback**: para cuando esto corre ya se llamó a `limpiar()`. Hoy el closure viejo
   * todavía las tendría —React no actualiza el estado en el medio de un tick— pero apoyarse en eso
   * es una trampa que funciona hasta que alguien mueva una línea.
   */
  onListo?: (mensaje: string, claves: readonly string[]) => void;
}) {
  const cockpit = usarCockpit();
  const [enviando, startTransition] = useTransition();

  const marcar = () => {
    const marcadas = seleccion.claves;
    const urls = marcadas
      .map(urlPorClave)
      .filter((u): u is string => typeof u === "string" && u !== "");
    if (urls.length === 0) return;

    startTransition(async () => {
      const r = await marcarMuchosComoGrabados(cockpit, urls.join("\n"), "seleccion");
      if (r.ok) seleccion.limpiar();
      onListo?.(r.mensaje, marcadas);
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={seleccion.cuantos === 0 || enviando}
      onClick={marcar}
    >
      {/* 🏷️ "los seleccionados" y no "Marcar como grabados" a secas: en Históricos ese texto exacto
          ya lo lleva el botón del cuadro de pegar links, y dos botones idénticos en la misma
          pantalla haciendo cosas distintas es una trampa. Se vio en la verificación del 21/08. */}
      {enviando ? "Marcando…" : "Marcar los seleccionados como grabados"}
    </Button>
  );
}
