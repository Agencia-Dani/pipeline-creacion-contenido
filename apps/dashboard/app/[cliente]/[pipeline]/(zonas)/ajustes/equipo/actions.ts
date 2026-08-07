"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { puedeAdministrarEquipo, rolesQuePuedeOtorgar } from "@/domain/permisos";
import { esRol, type Rol } from "@/domain/roles";
import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { exigirTenant } from "@/lib/auth";
import { cambiarRolEnEmpresa, darDeAlta, quitarDeEmpresa } from "@/lib/equipo";
import { registrarEvento } from "@/lib/eventos";

export type Resultado = { ok: boolean; mensaje: string };

// 🔒 **Acá vive la autoridad del alta**, y es toda la decisión de ADR-060 §4: la base no puede
// imponer nada de esto porque estas escrituras van con `service_role`, así que el orden de los
// gates ES el control de acceso. Los tres, siempre, antes de tocar el cliente admin:
//
//   1. `exigirTenant("ajustes")` → hay sesión, el cockpit es suyo, y de ahí sale el `clientId`.
//   2. `puedeAdministrarEquipo(rol)` → el rol EN ESTE cockpit administra.
//   3. `rolesQuePuedeOtorgar(...)` → el techo: nadie otorga un rol que no tiene, y `dev` solo la
//      agencia (ADR-060 §2 — es lo único que separa a un sponsor del margen).
//
// 🔑 **La empresa no es un parámetro de ninguna de estas funciones.** Sale de `ctx.clientId`, o sea
// del cockpit abierto. Es lo que hace que el modo de falla mudo de ADR-051 —la membresía con la
// empresa equivocada, que mete a alguien en el cockpit de otro cliente sin un solo error—
// **desaparezca por construcción**: no hay dónde equivocarse.
//
// 🩸 …siempre que *"el cockpit abierto"* sea de verdad el abierto, y hasta el 2026-08-06 no lo era.
// `exigirTenant("ajustes")` sin segmentos caía al default de `resolverContexto` —*el primero que
// alcance*, que desde el 03/08 es `30x/linkedin`— así que esta pantalla habría dado de alta a la
// gente de Retia **en 30X**, con el gate de rol evaluado contra el cockpit equivocado y sin un
// solo error a la vista. No llegó a pasar solo porque A5 todavía no está deployada. Por eso
// `enRuta` es obligatorio y viaja desde la URL: ver `lib/auth.ts`.

const alta = z.object({
  // ⚠️ **El orden importa y se probó**: `z.email().trim()` valida ANTES de limpiar, así que un mail
  // pegado con un espacio al final —el caso normal al copiarlo de un chat— se rechazaba por
  // inválido. Primero se normaliza, después se valida. (`z.email()` y no `z.string().email()`,
  // que en Zod 4 está deprecado.)
  email: z.string().trim().toLowerCase().pipe(z.email("Ese mail no tiene forma de mail.")),
  nombre: z.string().trim().min(2, "Poné el nombre de la persona.").max(80),
  rol: z.string().refine(esRol, "Ese rol no existe."),
});

/** El gate compartido: sesión + rol que administra. Devuelve lo que las tres acciones necesitan. */
async function exigirAdminDeEquipo(enRuta: CockpitEnRuta) {
  const sesion = await exigirTenant("ajustes", enRuta.cliente, enRuta.pipeline);
  if (!puedeAdministrarEquipo(sesion.rol)) return null;
  return sesion;
}

export async function invitar(
  enRuta: CockpitEnRuta,
  form: {
    email: string;
    nombre: string;
    rol: string;
  },
): Promise<Resultado> {
  const sesion = await exigirAdminDeEquipo(enRuta);
  if (!sesion) return { ok: false, mensaje: "No podés administrar el equipo de esta empresa." };
  const { usuario, ctx, cockpit } = sesion;

  const validacion = alta.safeParse(form);
  if (!validacion.success) {
    return { ok: false, mensaje: validacion.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { email, nombre, rol } = validacion.data;

  // El techo, en el servidor. El `<select>` de la pantalla ya no ofrece `dev` a un sponsor, pero
  // eso es cosmética: un POST a mano no respeta lo que el formulario ofrecía.
  if (!rolesQuePuedeOtorgar(sesion.rol, usuario.esDueno).includes(rol as Rol)) {
    return { ok: false, mensaje: `No podés otorgar el rol "${rol}".` };
  }

  const resultado = await darDeAlta(ctx.clientId, email, nombre, rol as Rol);
  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje };

  await registrarEvento(ctx, usuario.id, "equipo.invitar", { email, rol });

  revalidatePath(rutaDe(comoRuta(cockpit), "ajustes/equipo"));
  return {
    ok: true,
    mensaje: resultado.yaTeniaCuenta
      ? `${nombre} ya tenía cuenta: se le dio acceso a esta empresa, sin mail nuevo.`
      : `Listo. Le mandamos a ${email} un mail con el acceso.`,
  };
}

export async function cambiarRol(
  enRuta: CockpitEnRuta,
  usuarioId: string,
  rol: string,
): Promise<Resultado> {
  const sesion = await exigirAdminDeEquipo(enRuta);
  if (!sesion) return { ok: false, mensaje: "No podés administrar el equipo de esta empresa." };
  const { usuario, ctx, cockpit } = sesion;

  if (!esRol(rol)) return { ok: false, mensaje: "Ese rol no existe." };
  // El mismo techo que el alta: si no lo podés otorgar al invitar, tampoco ascendiendo a alguien.
  // Sin esto, el camino largo (invitar como operador y después subirlo) esquivaría el control.
  if (!rolesQuePuedeOtorgar(sesion.rol, usuario.esDueno).includes(rol)) {
    return { ok: false, mensaje: `No podés otorgar el rol "${rol}".` };
  }

  if (!(await cambiarRolEnEmpresa(ctx.clientId, usuarioId, rol))) {
    return { ok: false, mensaje: "No se pudo cambiar el rol. Recargá la página y probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "equipo.cambiar-rol", { usuarioId, rol });

  revalidatePath(rutaDe(comoRuta(cockpit), "ajustes/equipo"));
  return { ok: true, mensaje: "Rol actualizado." };
}

export async function quitarAcceso(
  enRuta: CockpitEnRuta,
  usuarioId: string,
): Promise<Resultado> {
  const sesion = await exigirAdminDeEquipo(enRuta);
  if (!sesion) return { ok: false, mensaje: "No podés administrar el equipo de esta empresa." };
  const { usuario, ctx, cockpit } = sesion;

  // Quitarse el acceso a uno mismo deja la empresa sin quien administre si era el último. Se
  // permite quitar a otros y no a uno mismo: el caso "me voy yo" no existe (te vas y alguien te
  // saca), y el bloqueo evita el clic irreversible más caro de la pantalla. La agencia puede
  // arreglar cualquier lockout igual (`es_dueno` alcanza todas las empresas).
  if (usuarioId === usuario.id) {
    return { ok: false, mensaje: "No podés quitarte el acceso a vos mismo. Pedíselo a otra persona." };
  }

  if (!(await quitarDeEmpresa(ctx.clientId, usuarioId))) {
    return { ok: false, mensaje: "No se pudo quitar el acceso. Recargá la página y probá de nuevo." };
  }

  await registrarEvento(ctx, usuario.id, "equipo.quitar", { usuarioId });

  revalidatePath(rutaDe(comoRuta(cockpit), "ajustes/equipo"));
  return { ok: true, mensaje: "Acceso quitado." };
}
