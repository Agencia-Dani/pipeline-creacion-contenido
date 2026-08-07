"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import type { TenantContext } from "@/domain/tenant";
import { revalidatePath } from "next/cache";
import { validarReferente } from "@/domain/referentes";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import {
  actualizarReferente,
  borrarReferente,
  buscarPorHandle,
  crearReferente,
  leerBanco,
  leerProyectos,
} from "@/lib/referentes";

export type Resultado = { ok: boolean; mensaje: string };

export type FormReferente = {
  handle: string;
  plataforma: string;
  proyectoIds: string[];
  activo: boolean;
  notas: string;
};

// La autoridad está en el servidor (plan-cockpit §3.2). La pantalla solo muestra los proyectos
// que existen; acá se vuelven a leer y se valida contra esa lista, porque un POST a mano no
// tiene por qué respetar lo que el `<select>` ofrecía.
async function validar(ctx: TenantContext, form: FormReferente) {
  const proyectos = await leerProyectos(ctx);
  return validarReferente(form, new Set(proyectos.map((p) => p.id)));
}

// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export async function guardar(
  enRuta: CockpitEnRuta,
  id: string,
  form: FormReferente,
): Promise<Resultado> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  const validacion = await validar(ctx, form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  let anterior;
  try {
    anterior = (await leerBanco(ctx)).find((r) => r.id === id);
  } catch (e) {
    console.error("[referentes] no se pudo leer el banco:", e);
    return { ok: false, mensaje: "No se pudo leer el banco. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Ese referente ya no existe. Recargá la página." };

  try {
    await actualizarReferente(ctx, id, validacion.valor);
  } catch (e) {
    console.error(`[referentes] falló guardar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Con qué handle y en qué proyectos estaba antes: apagar una cuenta o moverla de proyecto
  // cambia lo que entra en las corridas siguientes, y sin esto no hay forma de reconstruirlo.
  await registrarEvento(ctx, usuario.id, "referentes.editar", {
    id,
    anterior: {
      handle: anterior.handle,
      plataforma: anterior.plataforma,
      activo: anterior.activo,
      proyectoIds: anterior.proyectoIds,
    },
    nuevo: validacion.valor,
  });

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: "Guardado. Aplica en la próxima corrida." };
}

export async function crear(enRuta: CockpitEnRuta, form: FormReferente): Promise<Resultado> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  const validacion = await validar(ctx, form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const repetido = await buscarPorHandle(ctx, validacion.valor.handle, validacion.valor.plataforma);
    if (repetido) {
      return {
        ok: false,
        mensaje: `${repetido.handle} ya está en el banco${repetido.activo ? "" : " (apagada: prendela en vez de agregarla de nuevo)"}.`,
      };
    }
    const id = await crearReferente(ctx, validacion.valor);
    await registrarEvento(ctx, usuario.id, "referentes.crear", { id, ...validacion.valor });
  } catch (e) {
    console.error("[referentes] falló crear:", e);
    return { ok: false, mensaje: "No se pudo agregar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  return { ok: true, mensaje: "Agregada. Entra en la próxima corrida." };
}

/**
 * Sacar la cuenta del banco. Sin comprobaciones previas a propósito: nada le cuelga por FK y su
 * historia se guarda por handle en texto, así que borrarla no se lleva nada (el porqué largo está
 * en `lib/referentes.ts::borrarReferente` y en `domain/borrado.ts`).
 *
 * El evento va antes del DELETE y con los proyectos adentro: es lo único que queda de a quién
 * alimentaba, y la fila puente se va con la cuenta.
 */
export async function borrar(enRuta: CockpitEnRuta, id: string): Promise<Resultado> {
  const { usuario, ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  let referente;
  try {
    referente = (await leerBanco(ctx)).find((r) => r.id === id);
  } catch (e) {
    console.error("[referentes] no se pudo leer el banco:", e);
    return { ok: false, mensaje: "No se pudo leer el banco. Probá de nuevo." };
  }
  if (!referente) return { ok: false, mensaje: "Ese referente ya no existe. Recargá la página." };

  await registrarEvento(ctx, usuario.id, "referentes.borrar", {
    id,
    handle: referente.handle,
    plataforma: referente.plataforma,
    proyectoIds: referente.proyectoIds,
  });

  try {
    await borrarReferente(ctx, id);
  } catch (e) {
    console.error(`[referentes] falló borrar ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo borrar. Probá de nuevo." };
  }

  // Los proyectos que se quedan sin cuentas dejan de traer videos, y eso se ve en Voces (el techo
  // de crudos del campo N pasa a 0) y en Operar.
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/referentes"));
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/voces"));
  revalidatePath(rutaDe(comoRuta(cockpit), "operar"));
  return { ok: true, mensaje: `${referente.handle} salió del banco. Lo que ya trajo queda en el feed y en el histórico.` };
}
