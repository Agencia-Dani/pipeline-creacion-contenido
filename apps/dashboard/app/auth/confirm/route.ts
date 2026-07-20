import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aterrizaje del magic link. Soporta los dos formatos de Supabase:
// token_hash (template de mail recomendado para SSR) y code (template default, PKCE).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect("/");
    console.error(`[auth/confirm] verifyOtp (token_hash) falló: ${error.message}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect("/");
    // Causa típica: cookie code_verifier ausente (link abierto en otro browser/dispositivo,
    // o pre-escaneado por el cliente de mail). El flujo token_hash lo evita.
    console.error(`[auth/confirm] exchangeCodeForSession falló: ${error.message}`);
  } else {
    console.error("[auth/confirm] llegó sin token_hash+type ni code");
  }

  redirect("/login?estado=link-invalido");
}
