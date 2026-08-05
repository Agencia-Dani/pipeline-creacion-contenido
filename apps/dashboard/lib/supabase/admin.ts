import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: bypassa RLS. SOLO se importa desde código de servidor
// (el BFF es el único portador de secretos, plan-cockpit C2).
//
// ⚠️ **Su alcance se achicó con el flip de la Capa 2 (ADR-058).** Ya no es el camino por el que el
// cockpit lee: las pantallas entran por `scoped()` con la sesión del usuario, y `runs`/`outputs`/
// `processed_items` dejaron de ser "RLS sin policies" — la `021` les puso las suyas y su
// `grant select` a `authenticated`. Hoy esto queda para los tres caminos que NO tienen sesión:
// la fachada de ADR-028, la resolución de tenant de `lib/tenant.ts` y el proxy de miniaturas.
// Si aparece un cuarto, la pregunta es por qué no tiene sesión, no cómo darle service_role.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) throw new Error("Falta SUPABASE_SERVICE_ROLE (gestor).");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
