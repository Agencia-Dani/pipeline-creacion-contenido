import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Lecturas de la zona Entender: las 3 vistas de la migración 008 (D2). Read-only
// por construcción — acá no hay ni un write. El browser nunca toca estas vistas:
// pasan por el BFF con service_role (RLS sin policies del lado de las tablas).

const filaCalidad = z.object({
  semana: z.string(),
  proyecto: z.string().nullable(),
  calificados: z.number(),
  aprobados: z.number(),
  descartados: z.number(),
  precision: z.number().nullable(),
  score_aprobados: z.number().nullable(),
  score_descartados: z.number().nullable(),
  separacion_gate: z.number().nullable(),
});
export type FilaCalidad = z.infer<typeof filaCalidad>;

const filaEmbudo = z.object({
  semana: z.string(),
  runs_ok: z.number(),
  runs_fallo: z.number(),
  colectados: z.number().nullable(),
  asignados: z.number().nullable(),
  pretrim: z.number().nullable(),
  filtrados: z.number().nullable(),
  gate_pass: z.number().nullable(),
  entregados: z.number().nullable(),
  sin_guion: z.number().nullable(),
  descartes_expuestos: z.number().nullable(),
  duracion_min: z.number().nullable(),
});
export type FilaEmbudo = z.infer<typeof filaEmbudo>;

const filaCosto = z.object({
  semana: z.string(),
  servicio: z.string(),
  unidad: z.string(),
  unidades: z.number(),
  costo_usd: z.number(),
});
export type FilaCosto = z.infer<typeof filaCosto>;

async function leerVista<T>(vista: string, esquema: z.ZodType<T>, limite: number): Promise<T[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from(vista)
    .select("*")
    .order("semana", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo ${vista}: ${error.message}`);
  return z.array(esquema).parse(data);
}

// Límites pensados en semanas: ~8 de historia visible alcanzan para leer tendencia.
export const leerCalidad = () => leerVista("v_metricas_calidad", filaCalidad, 48);
export const leerEmbudo = () => leerVista("v_embudo_semana", filaEmbudo, 8);
export const leerCostos = () => leerVista("v_costos_semana", filaCosto, 64);
