"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Polling barato mientras haya una corrida en curso (plan-cockpit §8: default
// polling cada 5 s; Realtime queda como decisión abierta). Sin corrida viva no
// hace nada: la página es estática hasta el próximo click o navegación.
export function AutoRefresh({ activo }: { activo: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!activo) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [activo, router]);

  return null;
}
