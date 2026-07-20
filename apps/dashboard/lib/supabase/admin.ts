import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: bypassa RLS. SOLO se importa desde código de servidor
// (el BFF es el único portador de secretos, plan-cockpit C2). `runs`/`outputs`
// tienen RLS sin policies a propósito — la anon key no las ve — así que leerlas
// desde acá es el camino previsto (cierre 58: "el service_role entra en D1+").
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) throw new Error("Falta SUPABASE_SERVICE_ROLE (gestor).");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
