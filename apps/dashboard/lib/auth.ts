import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esRol, puedeVerZona, type Rol, type Zona } from "@/domain/roles";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
};

// Sesión + fila en app.usuarios, o redirect. Toda página protegida pasa por acá:
// el permiso se decide en el servidor, nunca en un if de React.
export async function usuarioActual(): Promise<Usuario> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fila } = await supabase
    .schema("app")
    .from("usuarios")
    .select("nombre, rol")
    .eq("id", user.id)
    .single();

  if (!fila || !esRol(fila.rol)) redirect("/sin-rol");

  return {
    id: user.id,
    email: user.email ?? "",
    nombre: fila.nombre,
    rol: fila.rol,
  };
}

// Guardia por zona: devuelve el usuario o lo saca de la ruta.
export async function exigirZona(zona: Zona): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!puedeVerZona(usuario.rol, zona)) redirect("/");
  return usuario;
}
