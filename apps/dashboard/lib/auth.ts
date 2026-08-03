import { redirect } from "next/navigation";
import type { TenantContext } from "@/domain/tenant";
import { createClient } from "@/lib/supabase/server";
import { esRol, puedeVerZona, type Rol, type Zona } from "@/domain/roles";
import { resolverContexto, type Instancia } from "@/lib/tenant";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  /** A qué empresa pertenece (ADR-046). Es el punto de entrada del tenant al sistema. */
  clientId: string;
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
    .select("nombre, rol, client_id")
    .eq("id", user.id)
    .single();

  // Sin rol o sin empresa es el mismo caso: la cuenta existe en `auth.users` pero su alta en el
  // cockpit quedó a medias. El alta es manual y en dos pasos (migración `007`), así que este es un
  // estado alcanzable de verdad — y desde ADR-046 el `insert` tiene que traer también el cliente.
  if (!fila || !esRol(fila.rol) || !fila.client_id) redirect("/sin-rol");

  return {
    id: user.id,
    email: user.email ?? "",
    nombre: fila.nombre,
    rol: fila.rol,
    clientId: fila.client_id,
  };
}

// Guardia por zona: devuelve el usuario o lo saca de la ruta.
export async function exigirZona(zona: Zona): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!puedeVerZona(usuario.rol, zona)) redirect("/");
  return usuario;
}

/**
 * La guardia completa: rol **y** tenant.
 *
 * **Compone con `exigirZona`, no la reemplaza** — el chequeo de rol que ya funciona no se toca. Son
 * dos preguntas ortogonales (ADR-046/047): el rol dice QUÉ zona ve alguien, el tenant dice DE QUIÉN
 * son los datos que ve. Las páginas que además leen datos usan esta; `exigirZona` sigue sirviendo
 * para las que solo deciden qué mostrar.
 *
 * `cliente` y `pipeline` son los segmentos de URL de la Fase 3; hoy no llegan y el contexto cae al
 * único cockpit del usuario (ver `lib/tenant.ts`).
 */
export async function exigirTenant(
  zona: Zona,
  cliente?: string,
  pipeline?: string,
): Promise<{ usuario: Usuario; ctx: TenantContext; cockpit: Instancia }> {
  const usuario = await exigirZona(zona);
  const sesion = await resolverContexto(usuario, cliente, pipeline);
  // Un cockpit ajeno en la URL sale por el mismo lado que una zona ajena: redirect a la raíz, que
  // reboteará al cockpit que sí le corresponde. Sin decir si existe — es lo que ya hace
  // `exigirZona` con el rol.
  if (!sesion) redirect("/");
  return { usuario, ...sesion };
}
