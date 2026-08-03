import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { resolverContexto } from "@/lib/tenant";
import { rutaZona } from "@/domain/rutas";
import { zonasDe } from "@/domain/roles";
import { zonaInicialEn } from "@/domain/pipelines";

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

  // El rol sale de la sesión, no del usuario (ADR-051): sin cockpit no hay rol, y acá el cockpit
  // lo acaba de elegir `resolverContexto`. La zona además tiene que existir en el pipeline que
  // eligió (ADR-056) — si no, a la raíz, sin inventar una zona.
  const zona = zonaInicialEn(zonasDe(sesion.rol), sesion.cockpit.workflowId);
  if (!zona) redirect("/");

  redirect(
    rutaZona(
      { cliente: sesion.cockpit.clientId, pipeline: sesion.cockpit.slug },
      zona,
    ),
  );
}
