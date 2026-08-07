"use server";

// Acciones que NO son de un cockpit. `cerrarSesion` la usan el nav (adentro de
// `[cliente]/[pipeline]`) y `/sin-rol` (afuera, donde el usuario todavía no tiene tenant): por eso
// vive en la raíz de `app/` y no colgando de un cliente.

import { redirect } from "next/navigation";
import { estadoDeError, parseContrasenaNueva } from "@/domain/credenciales";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Ponerse (o cambiarse) la contraseña, ya adentro. Es lo que hace que ADR-065 no dependa de que un
 * admin toque el dashboard de Supabase por cada persona.
 *
 * 🔑 **No se pide la contraseña actual, y es una decisión, no un olvido.** Quien acaba de entrar
 * por el magic link **no tiene ninguna** —ese es el camino normal de toda alta nueva—, así que
 * pedirla dejaría afuera exactamente al caso que esta pantalla existe para resolver. La prueba de
 * identidad es la sesión, que es una cookie del navegador de esa persona. Si algún día se quiere el
 * doble chequeo, la palanca ya existe y es de configuración: *Secure password change* en Supabase,
 * que obliga a reautenticar antes de `updateUser`.
 *
 * No lleva gate de rol: cambiar la propia contraseña no es una operación de cockpit, y no hay
 * `clientId` que mirar. El único requisito es tener sesión, y de eso se ocupa el proxy.
 */
export async function cambiarContrasena(formData: FormData) {
  const parseo = parseContrasenaNueva({
    password: formData.get("password"),
    repetida: formData.get("repetida"),
  });
  if (!parseo.ok) {
    // El mensaje del dominio viaja tal cual porque acá NO hay nada que filtrar: son reglas sobre lo
    // que la persona acaba de tipear, no sobre quién existe. Es la diferencia con `/login`.
    redirect(`/mi-cuenta?error=${encodeURIComponent(parseo.mensaje)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parseo.datos });

  if (error) {
    console.error(
      `[mi-cuenta] updateUser falló: ${error.code ?? "sin código"} (${error.status ?? "sin status"}) ${error.message}`,
    );
    // Sin sesión no hay a quién cambiarle nada: el proxy ya rebota, pero si la sesión venció entre
    // que se dibujó la pantalla y se apretó el botón, el fallo cae acá.
    const mensaje =
      estadoDeError(error.code, error.status) === "espera"
        ? "Demasiados intentos seguidos. Esperá unos minutos."
        : "No se pudo cambiar la contraseña. Probá de nuevo, o pedí un link nuevo y volvé a entrar.";
    redirect(`/mi-cuenta?error=${encodeURIComponent(mensaje)}`);
  }

  redirect("/mi-cuenta?estado=lista");
}
