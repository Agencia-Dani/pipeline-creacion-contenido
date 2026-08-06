"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Polling de Operar, en dos cadencias.
//
// 🔑 Se monta SIEMPRE, y ese es el arreglo (A7). Antes hacía `if (!activo) return`, o sea que solo
// pollea si YA había una corrida viva **al renderizar**: quien tenía Operar abierta cuando otra
// persona disparó no se enteraba nunca, y con tres personas de Retia adentro eso pasa tres veces
// por semana. El estado que importa es justamente el que cambia sin que vos hagas nada.
//
// Las dos cadencias son la respuesta a las dos preguntas distintas que hace la pantalla:
//   · con corrida viva, 5 s  → "¿ya terminó?" (plan-cockpit §8; Realtime sigue siendo la opción
//     futura si esto molesta)
//   · sin corrida viva, 30 s → "¿alguien más disparó?" — más barato, y suficiente: enterarse medio
//     minuto tarde de que arrancó una corrida no cambia ninguna decisión.
const CADENCIA_MS = { viva: 5_000, ociosa: 30_000 };

export function AutoRefresh({ corridaViva }: { corridaViva: boolean }) {
  const router = useRouter();
  const cada = corridaViva ? CADENCIA_MS.viva : CADENCIA_MS.ociosa;

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), cada);
    return () => clearInterval(timer);
  }, [cada, router]);

  return null;
}
