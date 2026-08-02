import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { resolverContexto } from "@/lib/tenant";
import { rutaZona } from "@/domain/rutas";
import { zonaInicial } from "@/domain/roles";

// La raíz no es una pantalla: cada uno cae en SU cockpit, en la zona de su rol.
//
// Desde la Fase 3 son dos preguntas, no una: a qué cockpit entra (el de su cliente, o el primero
// que pueda ver) y a qué zona (la inicial de su rol). Es también la salida de emergencia del
// sistema: cualquier `redirect("/")` de una guardia termina acá y rebota a un lugar válido, en vez
// de dejar a alguien mirando una ruta que no existe.
export default async function Home() {
  const usuario = await usuarioActual();

  const sesion = await resolverContexto(usuario);
  // Tiene cliente y rol, pero no hay ninguna instancia activa que abrirle. Es la misma clase de
  // alta a medias que un usuario sin rol, así que sale por el mismo lado.
  if (!sesion) redirect("/sin-rol");

  redirect(
    rutaZona(
      { cliente: sesion.cockpit.clientId, pipeline: sesion.cockpit.slug },
      zonaInicial(usuario.rol),
    ),
  );
}
