import { z } from "zod";
import type { Corrida } from "@/domain/corrida";
import { createAdminClient } from "@/lib/supabase/admin";

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
export async function ultimasCorridasMotor(limite = 5): Promise<Corrida[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("runs")
    .select("id, inicio, fin, estado, trigger_type, metricas, error")
    .eq("params->>workflow", "motor")
    .order("inicio", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo runs: ${error.message}`);
  return z.array(filaRun).parse(data);
}
