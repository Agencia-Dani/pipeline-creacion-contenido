"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { rutaDe, type CockpitEnRuta } from "@/domain/rutas";

export type OpcionCockpit = CockpitEnRuta & {
  /** Lo que ve el humano: "30X · Reels". El slug es para la URL, no para leer. */
  etiqueta: string;
};

/**
 * El selector de empresa × pipeline del nav.
 *
 * **Solo se renderiza si el usuario tiene más de un cockpit** (lo decide el layout, no este
 * componente): un operador de EstadoX no tiene por qué enterarse de que existen las otras
 * empresas, y un `<select>` de un solo elemento es ruido en la barra.
 *
 * Al cambiar, conserva la sub-ruta: si estabas en `curar/feed` de una empresa, caés en
 * `curar/feed` de la otra. Cambiar de empresa y aterrizar siempre en la home sería perder el
 * lugar en cada salto, y saltar es justamente lo que este control existe para hacer.
 *
 * ⚠️ Si la zona no existe para el otro cockpit, la página de destino aplica su propia guardia
 * (`exigirTenant`) y redirige. La autoridad no está acá — acá está la comodidad.
 */
export function SelectorCockpit({
  cockpits,
  actual,
}: {
  cockpits: OpcionCockpit[];
  actual: CockpitEnRuta;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startTransition] = useTransition();

  const valorDe = (c: CockpitEnRuta) => `${c.cliente}/${c.pipeline}`;

  // La sub-ruta se saca de la URL viva, no de una prop: el layout que lo monta no sabe en qué
  // página está parado el usuario (por eso es un layout), y pedírsela lo obligaría a re-renderizar
  // en cada navegación. Los dos primeros segmentos son el tenant; lo que sigue es el lugar.
  const sub = pathname.split("/").filter(Boolean).slice(2).join("/");

  return (
    <Select
      aria-label="Empresa y pipeline"
      value={valorDe(actual)}
      disabled={navegando}
      onChange={(e) => {
        const elegido = cockpits.find((c) => valorDe(c) === e.target.value);
        if (!elegido) return;
        startTransition(() => router.push(rutaDe(elegido, sub)));
      }}
    >
      {cockpits.map((c) => (
        <option key={valorDe(c)} value={valorDe(c)}>
          {c.etiqueta}
        </option>
      ))}
    </Select>
  );
}
