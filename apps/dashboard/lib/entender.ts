import { z } from "zod";
import type { Corrida } from "@/domain/corrida";
import { norteHistorico, type NorteProyecto } from "@/domain/entender";
import type { TenantContext } from "@/domain/tenant";
import { leerConteosPorCorrida } from "@/lib/candidatos";
import { ultimasCorridasMotor } from "@/lib/runs";
import { scoped, type Tabla } from "@/lib/supabase/scoped";

// Lecturas de la zona Entender: las vistas de las migraciones 008 (D2) y 013 (D7). Read-only
// por construcción — acá no hay ni un write. El browser nunca toca estas vistas: pasan por el BFF.
// ⚠️ Son VISTAS, y desde la `021` corren `security_invoker`: con los permisos de quien pregunta, no
// de su dueño. Sin eso, poner policies en las tablas base habría dejado toda esta zona sin RLS — y
// no se habría notado, porque con un tenant devuelve las filas correctas igual (ADR-058).
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
  // `promovidos` NO se lee: la vista lo suma de `metricas->>'promovidos'`, que el workflow
  // dejó de emitir porque medía un nodo inexistente desde ADR-020 (ver domain/corrida.ts).
  // La columna sigue en la vista; el día que se quiera el número de verdad sale de
  // `app.eventos` (tipo `sugeridos.aprobar`), que sí registra quién aprobó y cuándo.
});
export type FilaDescubrimiento = z.infer<typeof filaDescubrimiento>;

// Las 5 vistas exponen `instance_id` desde la `016` y el filtro lo pone `scoped` (ADR-047: la
// vista expone el eje, no filtra adentro). Sin esto, Entender sumaría el embudo y el COSTO de
// todas las empresas en el mismo número — y un costo de más se lee como propio sin sospechar nada.
async function leerVista<T>(
  ctx: TenantContext,
  vista: Extract<Tabla, `app.v_${string}`>,
  esquema: z.ZodType<T>,
  limite: number,
): Promise<T[]> {
  const { data, error } = await (await scoped(ctx))
    .select(vista, "*")
    .order("semana", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo ${vista}: ${error.message}`);
  return z.array(esquema).parse(data);
}

// Límites pensados en semanas: ~8 de historia visible alcanzan para leer tendencia.
export const leerCalidad = (ctx: TenantContext) => leerVista(ctx, "app.v_metricas_calidad", filaCalidad, 48);
export const leerEmbudo = (ctx: TenantContext) => leerVista(ctx, "app.v_embudo_semana", filaEmbudo, 8);
export const leerCostos = (ctx: TenantContext) => leerVista(ctx, "app.v_costos_semana", filaCosto, 64);
export const leerAuditoria = (ctx: TenantContext) => leerVista(ctx, "app.v_auditoria_descartes", filaAuditoria, 8);
export const leerDescubrimiento = (ctx: TenantContext) =>
  leerVista(ctx, "app.v_embudo_descubrimiento", filaDescubrimiento, 8);

// ── El norte (ADR-089, cierre 140) ────────────────────────────────────────────
//
// No es una vista de las de arriba: junta dos lecturas que ya existían por separado
// (`runs.metricas.por_proyecto` vía `ultimasCorridasMotor`, y `app.candidatos` vía
// `leerConteosPorCorrida`) porque ninguna vista de Postgres las tenía juntas. Antes de esto,
// leer "aprobados contra pedido" era escribir el join a mano en el SQL Editor cada vez.

/** Cuántas corridas del motor se traen a mirar; `norteHistorico` corta a 5 con embudo real. */
const CORRIDAS_PARA_NORTE = 8;

export async function leerNorte(
  ctx: TenantContext,
): Promise<{ corrida: Corrida; filas: NorteProyecto[] }[]> {
  const corridas = await ultimasCorridasMotor(ctx, CORRIDAS_PARA_NORTE);
  const conteos = await leerConteosPorCorrida(ctx, corridas.map((c) => c.id));
  return norteHistorico(corridas, conteos);
}

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

/** Cuántos eventos por tanda. 20 y no 50: es un log, se lee de arriba y casi nunca hasta el final. */
export const EVENTOS_POR_PAGINA = 20;

/**
 * Una página del log de actividad, de a `EVENTOS_POR_PAGINA`.
 *
 * Traía 50 de una y sin paginar, sobre una tabla que solo crece (107 filas al 07/08): la tarjeta
 * se volvía una pared que empujaba el resto de Entender fuera de la pantalla.
 *
 * El desempate por `id` es el mismo de `leerAprobados` y por la misma razón: 7 Server Actions
 * escriben acá, y dos eventos de la misma tanda comparten `creado_en` al segundo. Sin desempate,
 * dos filas con el mismo timestamp pueden repetirse o saltearse entre páginas — que es exactamente
 * el bug que la lista de Transcribir tuvo con los 52 links pegados juntos.
 */
export async function leerEventos(
  ctx: TenantContext,
  pagina = 0,
): Promise<{ filas: FilaEvento[]; hayMas: boolean }> {
  const desde = pagina * EVENTOS_POR_PAGINA;

  // Se pide UNA de más en vez de un `count: "exact"`: lo único que hay que decidir es si dibujar
  // el botón, y un count exacto sobre una tabla que solo crece cuesta un scan por carga de página.
  const { data, error } = await (await scoped(ctx))
    .select("app.eventos", "id, creado_en, tipo, detalle, usuarios(nombre)")
    .order("creado_en", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + EVENTOS_POR_PAGINA);

  if (error) throw new Error(`Supabase respondió con error leyendo los eventos: ${error.message}`);

  const filas = z.array(filaEvento).parse(data ?? []);
  return { filas: filas.slice(0, EVENTOS_POR_PAGINA), hayMas: filas.length > EVENTOS_POR_PAGINA };
}
