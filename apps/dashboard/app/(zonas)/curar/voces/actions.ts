"use server";

import { revalidatePath } from "next/cache";
import { validarProyecto, validarVoz } from "@/domain/proyectos";
import { exigirZona } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import {
  actualizarProyecto,
  actualizarVoz,
  crearProyecto,
  crearVoz,
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
const vocesValidas = async () => new Set((await leerVoces()).map((v) => v.id));

export async function guardarVoz(id: string, form: FormVoz): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  const validacion = validarVoz(form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  let anterior;
  try {
    anterior = (await leerVoces()).find((v) => v.id === id);
  } catch (e) {
    console.error("[voces] no se pudieron leer las voces:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Esa voz ya no existe. Recargá la página." };

  try {
    await actualizarVoz(id, validacion.valor);
  } catch (e) {
    console.error(`[voces] falló guardar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Apagar una voz apaga TODOS sus proyectos sin tocarlos: es el cambio de config con más
  // alcance que puede hacer alguien, y sin esto no hay forma de reconstruir por qué una corrida
  // entregó de golpe la mitad.
  await registrarEvento(usuario.id, "voces.editar", {
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
  const usuario = await exigirZona("curar");

  const validacion = validarVoz(form);
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const id = await crearVoz(validacion.valor);
    await registrarEvento(usuario.id, "voces.crear", { id, ...validacion.valor });
  } catch (e) {
    console.error("[voces] falló crear:", e);
    return { ok: false, mensaje: "No se pudo crear. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Voz creada. Agregale un proyecto para que empiece a traer videos." };
}

export async function guardarProyecto(id: string, form: FormProyecto): Promise<Resultado> {
  const usuario = await exigirZona("curar");

  const validacion = validarProyecto(form, await vocesValidas());
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  let anterior;
  try {
    anterior = (await leerProyectos()).find((p) => p.id === id);
  } catch (e) {
    console.error("[proyectos] no se pudieron leer los proyectos:", e);
    return { ok: false, mensaje: "No se pudo leer. Probá de nuevo." };
  }
  if (!anterior) return { ok: false, mensaje: "Ese proyecto ya no existe. Recargá la página." };

  try {
    await actualizarProyecto(id, validacion.valor);
  } catch (e) {
    console.error(`[proyectos] falló guardar ${id}:`, e);
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo; si sigue, avisale a un dev." };
  }

  // Los criterios son el prompt del gate: cambiarlos cambia qué se aprueba, y la explicación de
  // "por qué esta semana entró otra cosa" vive acá o en ningún lado.
  await registrarEvento(usuario.id, "proyectos.editar", {
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
  const usuario = await exigirZona("curar");

  const validacion = validarProyecto(form, await vocesValidas());
  if (!validacion.ok) return { ok: false, mensaje: validacion.error };

  try {
    const voz = (await leerVoces()).find((v) => v.id === validacion.valor.vozId);
    const id = await crearProyecto(validacion.valor, voz?.airtable_id ?? null);
    await registrarEvento(usuario.id, "proyectos.crear", { id, ...validacion.valor });
  } catch (e) {
    console.error("[proyectos] falló crear:", e);
    return { ok: false, mensaje: "No se pudo crear. Probá de nuevo; si sigue, avisale a un dev." };
  }

  revalidatePath("/curar/voces");
  return { ok: true, mensaje: "Proyecto creado. Elegile referentes para que traiga videos." };
}
