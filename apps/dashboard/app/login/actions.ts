"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EmailSchema = z.string().trim().toLowerCase().email();

export async function enviarMagicLink(formData: FormData) {
  const parsed = EmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/login?estado=email-invalido");

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // Solo entran usuarios ya invitados en Supabase: la puerta no crea cuentas.
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  // "Signups not allowed" = mail no invitado; no se distingue para no filtrar quién existe.
  // El error real va al log (rate limit del email built-in vs SMTP mal configurado vs
  // mail no invitado se ven distinto acá, aunque al usuario le mostremos lo mismo).
  if (error) {
    console.error(`[login] signInWithOtp falló para ${parsed.data}: ${error.message}`);
    redirect("/login?estado=no-enviado");
  }
  redirect("/login?estado=enviado");
}
