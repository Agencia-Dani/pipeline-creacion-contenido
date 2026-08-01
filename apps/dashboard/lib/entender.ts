import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Lecturas de la zona Entender: las vistas de las migraciones 008 (D2) y 013 (D7). Read-only
// por construcción — acá no hay ni un write. El browser nunca toca estas vistas: pasan por el
// BFF con service_role (RLS sin policies del lado de las tablas).
//
// Las dos que suma D7 no son features nuevas: son agujeros que el corte habría abierto. Al matar
// las tablas de Métricas de Airtable se iban con ellas `falsos_negativos` (que no sale de
// `runs.metricas` sino de contar descartes auditados) y el embudo del descubrimiento (que
// `v_embudo_semana` no cubre porque filtra `workflow = 'motor'`).

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

const filaAuditoria = z.object({
  semana: z.string(),
  expuestos: z.number(),
  auditados: z.number(),
  falsos_negativos: z.number(),
});
export type FilaAuditoria = z.infer<typeof filaAuditoria>;

const filaDescubrimiento = z.object({
  semana: z.string(),
  runs_ok: z.number(),
  runs_fallo: z.number(),
  semillas: z.number().nullable(),
  sugeridos_unicos: z.number().nullable(),
  propuestos: z.number().nullable(),
  promovidos: z.number().nullable(),
});
export type FilaDescubrimiento = z.infer<typeof filaDescubrimiento>;

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
export const leerAuditoria = () => leerVista("v_auditoria_descartes", filaAuditoria, 8);
export const leerDescubrimiento = () => leerVista("v_embudo_descubrimiento", filaDescubrimiento, 8);

// ── La auditoría de quién tocó qué (app.eventos) ─────────────────────────────
//
// 7 Server Actions la escriben desde D0 y hasta D7 NADIE la leía: la única forma de consultarla
// era el SQL Editor de Supabase. Una auditoría que necesita acceso de dev no es una auditoría,
// y el principio §3.3 del plan-cockpit ("lo que no se puede deshacer se pregunta, y eventos
// guarda quién") pedía justo lo contrario. Es dev-only por §3.4: al equipo no le sirve.

const filaEvento = z.object({
  creado_en: z.string(),
  tipo: z.string(),
  detalle: z.unknown().nullable(),
  usuarios: z.object({ nombre: z.string().nullable() }).nullable(),
});
export type FilaEvento = z.infer<typeof filaEvento>;

export async function leerEventos(limite = 50): Promise<FilaEvento[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("eventos")
    .select("creado_en, tipo, detalle, usuarios(nombre)")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo los eventos: ${error.message}`);
  return z.array(filaEvento).parse(data);
}
