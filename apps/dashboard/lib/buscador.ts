import { z } from "zod";
import {
  AFINIDAD_MINIMA_POR_DEFECTO,
  PROPUESTAS_POR_CORRIDA_POR_DEFECTO,
  type ReferenteParaSembrar,
  type SenalPorReferente,
} from "@/domain/buscador";
import { leerAjustes } from "@/lib/ajustes";
import { leerBanco } from "@/lib/referentes";
import { scoped } from "@/lib/supabase/scoped";
import type { TenantContext } from "@/domain/tenant";

// Lo que la card «Qué va a buscar» necesita de la base. El cruce lo hace `armarVistaBuscador`
// (dominio puro); acá solo se lee.

const filaSenal = z.object({
  referente: z.string().nullable(),
  tasa_seleccion: z.coerce.number().nullable(),
  calificados: z.coerce.number().nullable(),
});

/**
 * La señal por cuenta, con la clave en minúsculas — que es como la matchea el workflow
 * (`senal[handle.toLowerCase()]`). `v_senal_seleccion` agrupa por **(referente, idioma)**, así que
 * una misma cuenta puede traer varias filas; se queda con la de **más calificados**, que es la que
 * más muestra tiene. El nodo hace lo mismo de hecho: escribe en el mismo slot y gana la última,
 * pero acá se elige a propósito en vez de depender del orden en que PostgREST devuelva las filas.
 */
export async function leerSenalPorReferente(
  ctx: TenantContext,
): Promise<Map<string, SenalPorReferente>> {
  const acceso = await scoped(ctx);
  const { data, error } = await acceso.select(
    "public.v_senal_seleccion",
    "referente, tasa_seleccion, calificados",
  );
  if (error) throw new Error(`Supabase respondió con error leyendo la señal: ${error.message}`);

  const porHandle = new Map<string, SenalPorReferente>();
  for (const fila of z.array(filaSenal).parse(data)) {
    const handle = (fila.referente ?? "").trim().replace(/^@+/, "").toLowerCase();
    if (!handle) continue;
    const calificados = fila.calificados ?? 0;
    const previo = porHandle.get(handle);
    if (previo && previo.calificados >= calificados) continue;
    porHandle.set(handle, { tasa: fila.tasa_seleccion ?? 0, calificados });
  }
  return porHandle;
}

/** Los dos knobs que el equipo puede mover desde Ajustes, más el toggle del eje. */
export function leerKnobsDelBuscador(ajustes: { clave: string; valor: number | null }[]) {
  const valor = (clave: string) => ajustes.find((a) => a.clave === clave)?.valor;
  const propuestas = valor("Propuestas por corrida");
  const afinidad = valor("Afinidad mínima de propuesta");
  const descubrirIg = valor("Descubrir en Instagram");
  return {
    propuestasMax:
      typeof propuestas === "number" && propuestas > 0
        ? propuestas
        : PROPUESTAS_POR_CORRIDA_POR_DEFECTO,
    afinidadMinima:
      typeof afinidad === "number" && afinidad >= 0 ? afinidad : AFINIDAD_MINIMA_POR_DEFECTO,
    // Default ON, igual que el `pick(..., 1)` del workflow: la ausencia de la fila no apaga el eje.
    descubrirEnInstagram: typeof descubrirIg === "number" ? descubrirIg > 0 : true,
  };
}

/**
 * Todo lo que la card necesita, en una pasada. El conjunto de proyectos en alcance NO se calcula
 * acá: lo pasa la pantalla, que ya lo tiene de `armarVistaOperar` — así el motor y el buscador no
 * pueden discrepar sobre quién entra, que es lo que ADR-079 §3 compró.
 */
export async function leerDatosDelBuscador(ctx: TenantContext): Promise<{
  referentes: ReferenteParaSembrar[];
  senal: Map<string, SenalPorReferente>;
  knobs: ReturnType<typeof leerKnobsDelBuscador>;
}> {
  const [banco, senal, ajustes] = await Promise.all([
    leerBanco(ctx),
    leerSenalPorReferente(ctx),
    leerAjustes(ctx),
  ]);
  return {
    referentes: banco.map((r) => ({
      handle: r.handle,
      plataforma: r.plataforma,
      activo: r.activo,
      proyectoIds: r.proyectoIds,
    })),
    senal,
    knobs: leerKnobsDelBuscador(ajustes),
  };
}
