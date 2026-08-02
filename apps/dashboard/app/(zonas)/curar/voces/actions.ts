"use server";

import type { TenantContext } from "@/domain/tenant";
import { revalidatePath } from "next/cache";
import { motivoParaNoBorrar } from "@/domain/borrado";
import { validarProyecto, validarVoz } from "@/domain/proyectos";
import { exigirTenant } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import {
  actualizarProyecto,
  actualizarVoz,
  borrarProyecto as borrarProyectoDeLaBase,
  borrarVoz as borrarVozDeLaBase,
  crearProyecto,
  crearVoz,
  dependenciasDeProyecto,
  dependenciasDeVoz,
  leerProyectos,
  leerVoces,
} from "@/lib/proyectos";

export type Resultado = { ok: boolean; mensaje: string };

export type FormVoz = {
  nombre: string;
  descripcion: string;
  criterios_relevancia: string;
  activo: boolean;
};

export type FormProyecto = {
  nombre: string;
  descripcion: string;
  criterios_relevancia: string;
  vozId: string;
  activo: boolean;
  n: string;
};

// La autoridad está en el servidor (plan-cockpit §3.2): la lista de voces se vuelve a leer acá
// y se valida contra ella, porque un POST a mano no tiene por qué respetar lo que el `<select>`
// ofrecía.
const vocesValidas = async (ctx: TenantContext) => new Set((await leerVoces(ctx)).map((v) => v.id));

export async function guardarVoz(id: string, form: FormVoz): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  const validacion = validarVoz(form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  let anterior;
  try {
    anterior = (await leerVoces(ctx)).find((v) => v.id === id);
  } catch (e) {
    console.error("[voces] no se pudieron leer las voces:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Esa voz ya no existe. Recargá la página." };

  try {
    await actualizarVoz(ctx, id, validacion.valor);
  } catch (e) {
    console.error(`[voces] falló guardar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Apagar una voz apaga TODOS sus proyectos sin tocarlos: es el cambio de config con más
  // alcance que puede hacer alguien, y sin esto no hay forma de reconstruir por qué una corrida
  // entregó de golpe la mitad.
  await registrarEvento(ctx, usuario.id, "voces.editar", {
    id,
    anterior: { nombre: anterior.nombre, activo: anterior.activo },
    nuevo: validacion.valor,
  });

  revalidatePath("/curar/voces");
  return {
    ok: true,
    mensaje: validacion.valor.activo === anterior.activo
      ? "Guardado. Aplica en la próxima corrida."
      : validacion.valor.activo
        ? "Voz prendida: sus proyectos activos vuelven a correr."
        : "Voz apagada: sus proyectos no van a correr hasta que la prendas.",
  };
}

export async function crearVozNueva(form: FormVoz): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  const validacion = validarVoz(form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const id = await crearVoz(ctx, validacion.valor);
    await registrarEvento(ctx, usuario.id, "voces.crear", { id, ...validacion.valor });
  } catch (e) {
    console.error("[voces] falló crear:", e);
    return { ok: false, mensaje: "No se pudo crear. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Voz creada. Agregale un proyecto para que empiece a traer videos." };
}

export async function guardarProyecto(id: string, form: FormProyecto): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  const validacion = validarProyecto(form, await vocesValidas(ctx));
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  let anterior;
  try {
    anterior = (await leerProyectos(ctx)).find((p) => p.id === id);
  } catch (e) {
    console.error("[proyectos] no se pudieron leer los proyectos:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Ese proyecto ya no existe. Recargá la página." };

  try {
    await actualizarProyecto(ctx, id, validacion.valor);
  } catch (e) {
    console.error(`[proyectos] falló guardar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Los criterios son el prompt del gate: cambiarlos cambia qué se aprueba, y la explicación de
  // "por qué esta semana entró otra cosa" vive acá o en ningún lado.
  await registrarEvento(ctx, usuario.id, "proyectos.editar", {
    id,
    anterior: {
      nombre: anterior.nombre,
      activo: anterior.activo,
      n: anterior.n,
      voz_id: anterior.voz_id,
      criterios_relevancia: anterior.criterios_relevancia,
    },
    nuevo: validacion.valor,
  });

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Guardado. Aplica en la próxima corrida." };
}

export async function crearProyectoNuevo(form: FormProyecto): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  const validacion = validarProyecto(form, await vocesValidas(ctx));
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const id = await crearProyecto(ctx, validacion.valor);
    await registrarEvento(ctx, usuario.id, "proyectos.crear", { id, ...validacion.valor });
  } catch (e) {
    console.error("[proyectos] falló crear:", e);
    return { ok: false, mensaje: "No se pudo crear. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Proyecto creado. Elegile referentes para que traiga videos." };
}

// ── Borrar (regla en domain/borrado.ts: solo lo que nunca produjo nada) ──────
//
// El evento se registra ANTES del DELETE y con los criterios adentro, no después: es lo único que
// queda del registro una vez borrado, y `app.eventos` no tiene FK al proyecto ni a la voz (así que
// el rastro sobrevive). Si el DELETE falla, queda un evento de un borrado que no pasó — molesto,
// pero mucho menos grave que un borrado sin rastro. Mismo criterio que `sugeridos/actions.ts`.

export async function borrarProyecto(id: string): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  let proyecto;
  try {
    proyecto = (await leerProyectos(ctx)).find((p) => p.id === id);
  } catch (e) {
    console.error("[proyectos] no se pudieron leer los proyectos:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!proyecto) return { ok: false, mensaje: "Ese proyecto ya no existe. Recargá la página." };

  let motivo;
  try {
    motivo = motivoParaNoBorrar(proyecto.nombre, await dependenciasDeProyecto(ctx, id));
  } catch (e) {
    console.error(`[proyectos] no se pudo contar lo que cuelga de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo comprobar si hay historia colgando. Probá de nuevo." };
  }
  if (motivo) return { ok: false, mensaje: motivo };

  await registrarEvento(ctx, usuario.id, "proyectos.borrar", {
    id,
    nombre: proyecto.nombre,
    voz_id: proyecto.voz_id,
    n: proyecto.n,
    criterios_relevancia: proyecto.criterios_relevancia,
  });

  try {
    await borrarProyectoDeLaBase(ctx, id);
  } catch (e) {
    console.error(`[proyectos] falló borrar ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo borrar. Probá de nuevo." };
  }

  // Las cuentas que solo alimentaban a este proyecto quedan prendidas y sin destino: el motor les
  // pide videos que no van a ningún lado. La pantalla de Referentes ya lo avisa arriba de todo,
  // pero decirlo acá es la diferencia entre enterarse ahora y enterarse la semana que viene.
  revalidatePath("/curar/voces");
  revalidatePath("/curar/referentes");
  return {
    ok: true,
    mensaje: "Proyecto borrado. Revisá Referentes: las cuentas que solo lo alimentaban a él quedaron sin proyecto.",
  };
}

export async function borrarVoz(id: string): Promise<Resultado> {
  const { usuario, ctx } = await exigirTenant("curar");

  let voz;
  try {
    voz = (await leerVoces(ctx)).find((v) => v.id === id);
  } catch (e) {
    console.error("[voces] no se pudieron leer las voces:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!voz) return { ok: false, mensaje: "Esa voz ya no existe. Recargá la página." };

  let motivo;
  try {
    motivo = motivoParaNoBorrar(voz.nombre, await dependenciasDeVoz(ctx, id));
  } catch (e) {
    console.error(`[voces] no se pudo contar lo que cuelga de ${id}:`, e);
    return { ok: false, mensaje: "No se pudo comprobar si hay historia colgando. Probá de nuevo." };
  }
  if (motivo) return { ok: false, mensaje: motivo };

  await registrarEvento(ctx, usuario.id, "voces.borrar", {
    id,
    nombre: voz.nombre,
    criterios_relevancia: voz.criterios_relevancia,
  });

  try {
    await borrarVozDeLaBase(ctx, id);
  } catch (e) {
    console.error(`[voces] falló borrar ${id}:`, e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo borrar. Probá de nuevo." };
  }

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Voz borrada." };
}
