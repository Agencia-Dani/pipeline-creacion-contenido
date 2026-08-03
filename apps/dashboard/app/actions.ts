"use server";

// Acciones que NO son de un cockpit. `cerrarSesion` la usan el nav (adentro de
// `[cliente]/[pipeline]`) y `/sin-rol` (afuera, donde el usuario todavía no tiene tenant): por eso
// vive en la raíz de `app/` y no colgando de un cliente.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
