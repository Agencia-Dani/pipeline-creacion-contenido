"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { procesarPendientes } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// Vacía la cola: mientras queden pendientes llama al server una y otra vez, refrescando entre
// pasadas para que el equipo vea avanzar la lista. Cada pasada trabaja hasta su presupuesto de
// tiempo y devuelve cuántos quedan, así que un lote grande (o una función que Vercel corta por
// timeout) se termina solo en la pasada siguiente.
export function Procesador({ pendientes }: { pendientes: number }) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const corriendo = useRef(false);

  useEffect(() => {
    if (pendientes === 0 || corriendo.current) return;
    corriendo.current = true;
    let cancelado = false;

    (async () => {
      try {
        let quedan = pendientes;
        while (quedan > 0 && !cancelado) {
          const pasada = await procesarPendientes(cockpit);
          // Si una pasada no movió la aguja, cortar: mejor que girar en vacío gastando llamadas.
          if (pasada.procesados === 0) break;
          quedan = pasada.quedan;
          if (!cancelado && quedan > 0) router.refresh();
        }
      } catch (e) {
        console.error("[transcribir] la pasada falló:", e);
      } finally {
        corriendo.current = false;
        if (!cancelado) router.refresh();
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [pendientes, router]);

  return null;
}
