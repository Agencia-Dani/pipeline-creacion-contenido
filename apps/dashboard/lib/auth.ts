import { redirect } from "next/navigation";
import type { Alcance, TenantContext } from "@/domain/tenant";
import { createClient } from "@/lib/supabase/server";
import { puedeVerZona, type Rol, type Zona } from "@/domain/roles";
import { leerMembresias, resolverContexto, type Instancia } from "@/lib/tenant";

/**
 * Quién es, y qué alcanza.
 *
 * **Ya no trae `rol`**, y es el cambio de forma de ADR-051: el rol depende de la empresa, así que
 * preguntarlo sin decir en cuál no tiene respuesta. Lo devuelve `exigirTenant`, que sí sabe qué
 * cockpit está abierto.
 */
export type Usuario = Alcance & {
  id: string;
  email: string;
  nombre: string;
};

// Sesión + fila en app.usuarios + sus membresías, o redirect. Toda página protegida pasa por acá:
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
    .select("nombre, es_dueno")
    .eq("id", user.id)
    .single();

  if (!fila) redirect("/sin-rol");

  const membresias = await leerMembresias(user.id);

  // Ni membresías ni flag = la cuenta existe en `auth.users` pero su alta en el cockpit quedó a
  // medias. El alta es manual y en tres pasos (ADR-051), así que este es un estado alcanzable de
  // verdad — y es el que hay que hacer visible en vez de dejar a alguien mirando una pantalla vacía.
  if (!fila.es_dueno && membresias.length === 0) redirect("/sin-rol");

  return {
    id: user.id,
    email: user.email ?? "",
    nombre: fila.nombre,
    esDueno: fila.es_dueno,
    membresias,
  };
}

/**
 * La guardia: rol **y** tenant, en un solo acto.
 *
 * Desde ADR-051 no hay una `exigirZona` suelta, y no es una simplificación: **sin cockpit no hay
 * rol**, así que una guardia que solo mirara la zona no tendría con qué decidir. Las dos preguntas
 * siguen siendo ortogonales —el rol dice QUÉ zona ve, el tenant DE QUIÉN son los datos— pero ahora
 * se contestan juntas porque la primera depende de la segunda.
 *
 * `cliente` y `pipeline` son los segmentos de la URL.
 */
export async function exigirTenant(
  zona: Zona,
  cliente?: string,
  pipeline?: string,
): Promise<{ usuario: Usuario; ctx: TenantContext; cockpit: Instancia; rol: Rol }> {
  const usuario = await usuarioActual();
  const sesion = await resolverContexto(usuario, cliente, pipeline);
  // Un cockpit que no existe o que no es suyo sale por el mismo lado: a la raíz, que lo rebota al
  // que sí le toca. Sin decir cuál de las dos cosas fue.
  if (!sesion) redirect("/");

  // El rol se evalúa contra ESTE cockpit. La misma persona puede ser operadora en una empresa y
  // sponsor en otra, así que la zona se autoriza por cockpit, no por cuenta.
  if (!puedeVerZona(sesion.rol, zona)) redirect(`/${cliente ?? sesion.cockpit.clientId}/${pipeline ?? sesion.cockpit.slug}`);

  return { usuario, ...sesion };
}
