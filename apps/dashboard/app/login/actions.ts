"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { estadoDeError, parseLogin } from "@/domain/credenciales";
import { createClient } from "@/lib/supabase/server";

const EmailSchema = z.string().trim().toLowerCase().email();

/**
 * La puerta de todos los días (ADR-065): mail + contraseña.
 *
 * 🔑 **La sesión se escribe acá porque esto es una Server Action y no un Server Component.** El
 * `setAll` de `lib/supabase/server.ts` tiene un `catch` vacío justamente para el segundo caso —
 * donde escribir cookies no está permitido y el refresh lo hace el proxy—; en una action sí se
 * puede, y es lo que deja la cookie de sesión puesta antes del redirect.
 *
 * El fallo no distingue casos **a propósito**: el motivo real va al log del servidor y a la
 * pantalla va un estado de tres valores. El porqué completo, en `domain/credenciales.ts`.
 */
export async function entrarConContrasena(formData: FormData) {
  const parseo = parseLogin({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // Un mail mal escrito no llega a Supabase: sería un intento gastado contra el rate limit por algo
  // que ya sabemos que no puede entrar.
  if (!parseo.ok) redirect("/login?estado=credenciales");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parseo.datos);

  if (error) {
    // El log es el ÚNICO lugar donde los casos se separan. `email_not_confirmed` acá significa una
    // cosa concreta y accionable: esa cuenta fue invitada pero nunca aceptó la invitación, así que
    // ponerle contraseña no alcanza — hay que confirmarle el mail (ver README §auth).
    console.error(
      `[login] signInWithPassword falló para ${parseo.datos.email}: ${error.code ?? "sin código"} (${error.status ?? "sin status"}) ${error.message}`,
    );
    redirect(`/login?estado=${estadoDeError(error.code, error.status)}`);
  }

  redirect("/");
}

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
