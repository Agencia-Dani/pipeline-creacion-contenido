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
