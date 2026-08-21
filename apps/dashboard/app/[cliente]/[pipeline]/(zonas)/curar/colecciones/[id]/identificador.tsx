"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { usarCockpit } from "../../../usar-cockpit";
import { identificarFaltantes } from "../actions";

// Le compra a Apify los videos que quedaron pelados, en pasadas, hasta que no quede ninguno.
//
// 🔑 **Es el mismo componente invisible que vacía la cola de Transcribir** (`procesador.tsx`), y
// está acá por la misma razón, medida: una llamada al actor de Apify tardó **~45 s con dos links**
// —el costo dominante es arrancarlo, no los items—, contra un `maxDuration` de 60. Hacerlo dentro
// de la acción de agregar era una carrera contra la plataforma; en pasadas, cada una tiene el
// presupuesto entero para sí y lo que no entró se termina en la siguiente.
//
// 🔴 **Gasta plata sola, así que las condiciones de corte son estrictas:** arranca solo si hay algo
// que identificar, corre una sola vez por montaje (`corriendo`), y **corta apenas una pasada trae
// cero** en vez de reintentar. Girar en vacío contra un proveedor caído sería pagar por nada.
export function Identificador({ coleccionId, faltan }: { coleccionId: string; faltan: number }) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const corriendo = useRef(false);

  useEffect(() => {
    if (faltan === 0 || corriendo.current) return;
    corriendo.current = true;
    let cancelado = false;

    (async () => {
      try {
        let quedan = faltan;
        while (quedan > 0 && !cancelado) {
          const pasada = await identificarFaltantes(cockpit, coleccionId);
          if (pasada.identificados === 0) break;
          quedan = pasada.quedan;
          if (!cancelado && quedan > 0) router.refresh();
        }
      } catch (e) {
        console.error("[colecciones] la pasada de identificación falló:", e);
      } finally {
        corriendo.current = false;
        if (!cancelado) router.refresh();
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [faltan, coleccionId, router]);

  return null;
}
