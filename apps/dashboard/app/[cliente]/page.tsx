import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { resolverContexto } from "@/lib/tenant";
import { rutaZona } from "@/domain/rutas";
import { zonaInicial } from "@/domain/roles";

// Una empresa sin pipeline (`/retia`) cae en el primer cockpit suyo que el usuario pueda abrir.
//
// `resolverContexto` con `pipeline` en `undefined` ya hace exactamente esa pregunta, y su orden es
// estable entre requests (`leerInstancias` viene ordenado), así que el destino no cambia de visita
// en visita — un default inestable acá sería un bug de caché esperando.
export default async function BaseDelCliente({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const usuario = await usuarioActual();

  const sesion = await resolverContexto(usuario, cliente);
  if (!sesion) redirect("/");

  redirect(
    rutaZona(
      { cliente: sesion.cockpit.clientId, pipeline: sesion.cockpit.slug },
      zonaInicial(usuario.rol),
    ),
  );
}
