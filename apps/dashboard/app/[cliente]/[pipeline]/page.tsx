import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { resolverContexto } from "@/lib/tenant";
import { rutaZona } from "@/domain/rutas";
import { zonaInicial } from "@/domain/roles";

// La base de un cockpit tampoco es una pantalla: `/retia/reels` cae en la zona inicial del rol,
// igual que la raíz cae en el cockpit del usuario.
//
// Existe porque la Fase 3 dejó páginas solo para las ZONAS, y `baseDe`/`rutaDe(c)` devuelven
// justo esta ruta — o sea que el propio dominio sabe construir una URL que hasta hoy era un 404.
// El selector de cockpit la arma cuando alguien salta de empresa parado en la base, y es la que
// escribe a mano cualquiera que recorte la URL. Un 404 ahí no informa nada: el cockpit existe.
export default async function BaseDelCockpit({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const usuario = await usuarioActual();

  const sesion = await resolverContexto(usuario, cliente, pipeline);
  // No existe o no es suyo: no se distinguen, y salen por donde salen todas (`lib/tenant.ts`).
  if (!sesion) redirect("/");

  redirect(
    rutaZona(
      { cliente: sesion.cockpit.clientId, pipeline: sesion.cockpit.slug },
      // El rol de ESTE cockpit, no el de la cuenta (ADR-051): la misma persona puede ser operadora
      // en una empresa y sponsor en otra, y cada rol arranca en una zona distinta.
      zonaInicial(sesion.rol),
    ),
  );
}
