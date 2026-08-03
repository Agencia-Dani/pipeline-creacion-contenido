import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// Auditoría (plan-cockpit C7): quién hizo qué en el cockpit. Sumidero, no dependencia — mismo
// principio que el registro de corridas (core/contracts/ingesta-registro.md): si esto falla, la
// acción del usuario NO se cae. Queda el rastro en los logs de Vercel igual.
//
// Desde ADR-046 el evento también dice EN QUÉ cockpit pasó: `scoped` le pone la instancia sola.
export async function registrarEvento(
  ctx: TenantContext,
  usuarioId: string,
  tipo: string,
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    await scoped(ctx).insert("app.eventos", [{ usuario_id: usuarioId, tipo, detalle }]);
  } catch (e) {
    console.error(`[eventos] no se pudo registrar ${tipo}:`, e);
  }
}
