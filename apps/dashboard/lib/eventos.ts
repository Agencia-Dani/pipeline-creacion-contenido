import { createAdminClient } from "@/lib/supabase/admin";

// Auditoría (plan-cockpit C7): quién hizo qué en el cockpit. Sumidero, no dependencia — mismo
// principio que el registro de corridas (core/contracts/ingesta-registro.md): si esto falla, la
// acción del usuario NO se cae. Queda el rastro en los logs de Vercel igual.
export async function registrarEvento(
  usuarioId: string,
  tipo: string,
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.schema("app").from("eventos").insert({ usuario_id: usuarioId, tipo, detalle });
  } catch (e) {
    console.error(`[eventos] no se pudo registrar ${tipo}:`, e);
  }
}
