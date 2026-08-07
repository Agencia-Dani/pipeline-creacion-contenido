import { z } from "zod";
import type { Corrida } from "@/domain/corrida";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

const filaRun = z.object({
  id: z.string(),
  inicio: z.string(),
  fin: z.string().nullable(),
  estado: z.enum(["en_curso", "ok", "fallo", "parcial"]),
  trigger_type: z.string(),
  metricas: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
});

// Últimas corridas del motor. Mismo discriminador que usa el archivado para
// leer runs del motor (`params->>workflow = 'motor'`, dev-doc nodo 17b).
//
// El filtro por instancia lo pone `scoped`: con dos empresas, "las últimas corridas" son las de
// ESTE cockpit. Sin eso, Operar mostraría la corrida de otra empresa como si fuera propia.
export async function ultimasCorridasMotor(ctx: TenantContext, limite = 5): Promise<Corrida[]> {
  const { data, error } = await (await scoped(ctx))
    .select("public.runs", "id, inicio, fin, estado, trigger_type, metricas, error")
    .eq("params->>workflow", "motor")
    .order("inicio", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo runs: ${error.message}`);
  return z.array(filaRun).parse(data);
}

// ── El run del transcriptor (ADR-062 §3) ─────────────────────────────────────
//
// 🔑 **El cockpit escribe `runs`, y hasta ADR-062 eso solo lo hacía n8n.** No es una concesión: es
// lo que hace que el transcriptor exista para el resto del sistema. `outputs.run_id` es `not null`,
// así que sin una corrida propia sus guiones no pueden entrar al histórico — y aflojar ese not-null
// habría hecho que esas filas desaparecieran de toda vista que hace `join runs`, en silencio.
//
// El efecto de arrastre que nadie pidió y conviene tener: `v_costos_semana` agrupa por
// `params->>workflow`, así que **el gasto en Supadata del transcriptor se vuelve visible** en
// Entender. Hoy son ~58 pedidos que no aparecen en ningún lado.
//
// `trigger_type: 'manual'` y `params.workflow: 'transcriptor'` — los dos valores ya existían (el
// check de `trigger_type` los acepta desde la `001`, y el catálogo de `params.workflow` nunca tuvo
// check), así que esto no pide migración.

/** Abre la corrida de una tanda de enlaces pegados. Devuelve su id, o null si no se pudo. */
export async function abrirRunTranscriptor(ctx: TenantContext): Promise<string | null> {
  const { data, error } = await (await scoped(ctx))
    .insert("public.runs", [
      { estado: "en_curso", trigger_type: "manual", params: { workflow: "transcriptor" } },
    ])
    .select("id");

  if (error) {
    // Sumidero, igual que el registro de n8n (invariante #1 de PLAN §2.5): si no se puede abrir la
    // corrida, la tanda se transcribe igual y lo único que se pierde es que sus guiones entren al
    // histórico. Convertir el registro en dependencia de ejecución sería el error que ese
    // invariante existe para evitar.
    console.error("[transcriptor] no se pudo abrir el run:", error.message);
    return null;
  }
  return z.array(z.object({ id: z.string() })).parse(data)[0]?.id ?? null;
}

/** Cierra la corrida con lo que produjo. Best-effort por la misma razón que la apertura. */
export async function cerrarRunTranscriptor(
  ctx: TenantContext,
  runId: string,
  metricas: { pedidos: number; listos: number; sin_transcript: number; fallos: number },
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .update("public.runs", { estado: "ok", fin: new Date().toISOString(), metricas })
    .eq("id", runId);
  if (error) console.error("[transcriptor] no se pudo cerrar el run:", error.message);
}
