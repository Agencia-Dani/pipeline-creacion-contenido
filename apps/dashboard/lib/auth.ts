import { redirect } from "next/navigation";
import type { Alcance, TenantContext } from "@/domain/tenant";
import { createClient } from "@/lib/supabase/server";
import { puedeVerZona, type Rol, type Zona } from "@/domain/roles";
import { zonasDePipeline } from "@/domain/pipelines";
import { baseDe, comoRuta } from "@/domain/rutas";
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

  // La zona se autoriza contra DOS cosas, y ninguna alcanza sola (ADR-056):
  //
  //   1. **El rol en ESTE cockpit.** La misma persona puede ser operadora en una empresa y sponsor
  //      en otra, así que el permiso es por cockpit, no por cuenta.
  //   2. **Lo que este pipeline implementa.** `transcribir` no existe en LinkedIn: su etapa
  //      `enriquecer` es `n/a` (ADR-055), o sea que la pantalla no tendría contra qué tabla correr.
  //
  // El layout esconde las zonas que no van; esto impide entrar a mano. La UI esconde, el servidor
  // impide — y acá está el servidor.
  const permitida =
    puedeVerZona(sesion.rol, zona) &&
    zonasDePipeline(sesion.cockpit.workflowId).includes(zona);

  // A la base del cockpit RESUELTO, no a los segmentos que vinieron: si la URL traía basura, ya
  // fue rechazada arriba, y si traía otro cockpit válido el redirect tiene que apuntar al que
  // efectivamente se abrió. La base rebota sola a la zona inicial.
  if (!permitida) redirect(baseDe(comoRuta(sesion.cockpit)));

  return { usuario, ...sesion };
}
