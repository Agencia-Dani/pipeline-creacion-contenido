"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import {
  esFuente,
  esValido,
  normalizarConsulta,
  validarReferente,
  type FormReferenteLinkedin,
} from "@/domain/linkedin";
import type { TenantContext } from "@/domain/tenant";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import { leerProyectos } from "@/lib/referentes";
import {
  actualizarReferenteLinkedin,
  borrarReferenteLinkedin,
  crearReferenteLinkedin,
  leerBancoLinkedin,
  prenderReferenteLinkedin,
  type DatosReferenteLinkedin,
} from "@/lib/referentes-linkedin";
import type { Instancia } from "@/lib/tenant";

export type Resultado = { ok: boolean; mensaje: string };

/**
 * 🔒 La guardia que `exigirTenant` sola no da, y que hace falta acá.
 *
 * `exigirTenant("curar")` resuelve el cockpit abierto y comprueba rol + zona, pero **no comprueba
 * el pipeline**: no tiene por qué, la zona `curar` existe en los dos. Sin esta línea, un cockpit de
 * REELS podría llamar estos actions y escribir filas en `app.referentes_linkedin` atribuidas a una
 * instancia de reels — filas válidas para la base (el `instance_id` existe) e invisibles para
 * siempre, porque ninguna pantalla de LinkedIn las va a pedir con ese instance_id.
 *
 * Ni `scoped()` ni RLS lo atrapan: los dos preguntan *"¿es tuya esta instancia?"*, y lo es. La
 * pregunta que falta es *"¿es esta instancia de este pipeline?"*, y solo la puede contestar el
 * registro. Es la misma disciplina de `exigirTenant`: la UI esconde, el servidor impide.
 */
async function exigirCockpitLinkedin(enRuta: CockpitEnRuta): Promise<
  { ok: true; usuario: { id: string }; ctx: TenantContext; cockpit: Instancia } | { ok: false; mensaje: string }
> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);
  if (cockpit.workflowId !== "linkedin") {
    return { ok: false, mensaje: "Este cockpit no es de LinkedIn." };
  }
  return { ok: true, usuario, ctx, cockpit };
}

/**
 * La autoridad está en el servidor: la pantalla ya validó con la MISMA función del dominio, y acá
 * se vuelve a validar porque un POST a mano no tiene por qué respetar lo que el `<select>` ofrecía.
 * El `proyectoId` se comprueba contra los proyectos que existen de verdad, no contra el form.
 */
async function aDatos(
  ctx: TenantContext,
  form: FormReferenteLinkedin,
): Promise<{ ok: true; datos: DatosReferenteLinkedin } | { ok: false; mensaje: string }> {
  const errores = validarReferente(form);
  if (!esValido(errores)) {
    return { ok: false, mensaje: Object.values(errores)[0] ?? "Revisá los datos." };
  }
  // Redundante con `validarReferente`, que ya lo comprobó — pero es lo que convence a TypeScript de
  // que `form.fuente` es una `Fuente`, y de paso deja el invariante escrito en el borde.
  if (!esFuente(form.fuente)) return { ok: false, mensaje: "Elegí de dónde sale." };

  const proyectoId = form.proyectoId.trim() === "" ? null : form.proyectoId;
  if (proyectoId !== null) {
    const proyectos = await leerProyectos(ctx);
    if (!proyectos.some((p) => p.id === proyectoId)) {
      return { ok: false, mensaje: "Ese proyecto no existe. Recargá la página." };
    }
  }

  const idioma = form.idioma.trim();
  const notas = form.notas.trim();
  return {
    ok: true,
    datos: {
      fuente: form.fuente,
      consulta: form.consulta,
      idioma: idioma === "" ? null : idioma,
      proyectoId,
      notas: notas === "" ? null : notas,
    },
  };
}

export async function crearLinkedin(
  enRuta: CockpitEnRuta,
  form: FormReferenteLinkedin,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  const datos = await aDatos(ctx, form);
  if (!datos.ok) return datos;

  try {
    const id = await crearReferenteLinkedin(ctx, datos.datos);
    await registrarEvento(ctx, usuario.id, "referentes_linkedin.crear", { id, ...datos.datos });
  } catch (e) {
    console.error("[referentes-linkedin] falló crear:", e);
    // El mensaje de `errorDeEscritura` sí sirve para mostrar: el 23505 ("ya está en el banco") es
    // el error ESPERABLE de un banco que se carga a mano, no una falla del sistema.
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo agregar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: "Agregado, y apagado. Prendelo cuando lo hayas revisado." };
}

export async function guardarLinkedin(
  enRuta: CockpitEnRuta,
  id: string,
  form: FormReferenteLinkedin,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  const datos = await aDatos(ctx, form);
  if (!datos.ok) return datos;

  let anterior;
  try {
    anterior = (await leerBancoLinkedin(ctx)).find((r) => r.id === id);
  } catch (e) {
    console.error("[referentes-linkedin] no se pudo leer el banco:", e);
    return { ok: false, mensaje: "No se pudo leer el banco. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Ese referente ya no existe. Recargá la página." };

  try {
    await actualizarReferenteLinkedin(ctx, id, datos.datos);
  } catch (e) {
    console.error(`[referentes-linkedin] falló guardar ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo guardar." };
  }

  // Con qué consulta y a qué proyecto apuntaba antes: cambiarla cambia lo que entra en las
  // corridas siguientes, y sin esto no hay forma de reconstruirlo.
  await registrarEvento(ctx, usuario.id, "referentes_linkedin.editar", {
    id,
    anterior: { fuente: anterior.fuente, consulta: anterior.consulta, proyectoId: anterior.proyectoId },
    nuevo: datos.datos,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: "Guardado. Aplica en la próxima corrida." };
}

/** El interruptor. Es la acción que la lista existe para provocar, así que va sin confirmación. */
export async function prenderLinkedin(
  enRuta: CockpitEnRuta,
  id: string,
  activo: boolean,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  try {
    await prenderReferenteLinkedin(ctx, id, activo);
    await registrarEvento(ctx, usuario.id, "referentes_linkedin.prender", { id, activo });
  } catch (e) {
    console.error(`[referentes-linkedin] falló prender ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo cambiar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: activo ? "Prendido." : "Apagado." };
}

export async function borrarLinkedin(enRuta: CockpitEnRuta, id: string): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  let referente;
  try {
    referente = (await leerBancoLinkedin(ctx)).find((r) => r.id === id);
  } catch (e) {
    console.error("[referentes-linkedin] no se pudo leer el banco:", e);
    return { ok: false, mensaje: "No se pudo leer el banco. Probá de nuevo." };
  }
  if (!referente) return { ok: false, mensaje: "Ese referente ya no existe. Recargá la página." };

  // El evento va ANTES del delete: es lo único que va a quedar de que esta consulta existió.
  await registrarEvento(ctx, usuario.id, "referentes_linkedin.borrar", {
    id,
    fuente: referente.fuente,
    consulta: referente.consulta,
    proyectoId: referente.proyectoId,
  });

  try {
    await borrarReferenteLinkedin(ctx, id);
  } catch (e) {
    console.error(`[referentes-linkedin] falló borrar ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo borrar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: `${normalizarConsulta(referente.consulta)} salió del banco.` };
}
