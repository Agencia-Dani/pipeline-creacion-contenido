"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { baseDe, rutaDe, type CockpitEnRuta } from "@/domain/rutas";

export type OpcionCockpit = CockpitEnRuta & {
  /** Lo que ve el humano: "Reels". El slug es para la URL, no para leer. */
  etiqueta: string;
  /** El nombre de la empresa como se muestra. Hoy es el `clients.id`, que ya es legible. */
  empresa: string;
};

/**
 * Los dos selectores del nav, y **por qué son dos y no uno** (ADR-056).
 *
 * Hasta que existió un segundo pipeline, un único selector plano (`empresa · pipeline`) alcanzaba,
 * porque con un solo cockpit nunca se dibujaba. Con dos pipelines miente en los dos sentidos:
 * alguien de UNA empresa vería dos opciones en un control que significaba *cambiar de empresa*, y
 * alguien de dos empresas tendría empresa y pipeline mezclados en el mismo string — o sea que
 * saltar de equipo y saltar de trabajo serían el mismo gesto. Son dos preguntas distintas: **de
 * quién es el trabajo** y **cuál trabajo**.
 *
 * ⚠️ **Ninguno de los dos es la autoridad.** Las dos listas ya vienen filtradas por las membresías
 * (ADR-051) desde el servidor, y la página de destino aplica su propia guardia (`exigirTenant`).
 * Acá está la comodidad; el permiso está allá.
 */

// La sub-ruta se saca de la URL viva y no de una prop: el layout que monta esto no sabe en qué
// página está parado el usuario (por eso es un layout), y pedírsela lo obligaría a re-renderizar en
// cada navegación. Los dos primeros segmentos son el tenant; lo que sigue es el lugar.
function subRuta(pathname: string): string {
  return pathname.split("/").filter(Boolean).slice(2).join("/");
}

/**
 * El selector de **equipo**: las empresas que esta persona alcanza.
 *
 * El layout lo dibuja **solo si alcanza más de una**. Esa condición es lo que hace que nadie vea el
 * nombre de una empresa que no es suya: un operador de una sola empresa no ve el control, así que
 * no se entera de que existen las otras.
 */
export function SelectorEquipo({
  cockpits,
  actual,
}: {
  cockpits: OpcionCockpit[];
  actual: CockpitEnRuta;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startTransition] = useTransition();

  const empresas = [...new Set(cockpits.map((c) => c.cliente))];

  return (
    <Select
      aria-label="Equipo"
      value={actual.cliente}
      disabled={navegando}
      onChange={(e) => {
        const empresa = e.target.value;
        const enEsaEmpresa = cockpits.filter((c) => c.cliente === empresa);
        if (enEsaEmpresa.length === 0) return;

        // El mismo pipeline en la empresa nueva si existe; si no, el primero que alcance ahí.
        // Nunca un 404 y nunca el cockpit de otro.
        const mismo = enEsaEmpresa.find((c) => c.pipeline === actual.pipeline);
        const destino = mismo ?? enEsaEmpresa[0];

        // La sub-ruta se conserva **solo si el pipeline no cambió**: si cambió, la zona en la que
        // estabas puede no existir del otro lado (ADR-056: `transcribir` no está en LinkedIn), y
        // mandar a alguien a una zona inexistente para que la guardia lo rebote es hacerle dar dos
        // saltos para llegar al mismo lado. Sin sub-ruta, la base lo deja en su zona inicial.
        const destinoUrl = mismo
          ? rutaDe(destino, subRuta(pathname))
          : baseDe(destino);

        startTransition(() => router.push(destinoUrl));
      }}
    >
      {empresas.map((empresa) => (
        <option key={empresa} value={empresa}>
          {cockpits.find((c) => c.cliente === empresa)?.empresa ?? empresa}
        </option>
      ))}
    </Select>
  );
}

/**
 * El selector de **pipeline**: los cockpits de la empresa que está abierta.
 *
 * El layout lo dibuja solo si esa empresa tiene más de uno. Acá la sub-ruta sí se conserva a
 * ciegas —seguís en la misma empresa, y si la zona no existe en el pipeline nuevo la guardia
 * redirige— porque el caso común es justamente quedarse en el mismo lugar del otro trabajo.
 */
export function SelectorPipeline({
  cockpits,
  actual,
}: {
  cockpits: OpcionCockpit[];
  actual: CockpitEnRuta;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startTransition] = useTransition();

  const suyos = cockpits.filter((c) => c.cliente === actual.cliente);

  return (
    <Select
      aria-label="Pipeline"
      value={actual.pipeline}
      disabled={navegando}
      onChange={(e) => {
        const elegido = suyos.find((c) => c.pipeline === e.target.value);
        if (!elegido) return;
        startTransition(() => router.push(rutaDe(elegido, subRuta(pathname))));
      }}
    >
      {suyos.map((c) => (
        <option key={c.pipeline} value={c.pipeline}>
          {c.etiqueta}
        </option>
      ))}
    </Select>
  );
}
