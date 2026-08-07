"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
import { hayCorridaViva } from "@/domain/corrida";
import { exigirTenant } from "@/lib/auth";
import { hayBusquedaViva } from "@/lib/descubrimiento";
import { registrarEvento } from "@/lib/eventos";
import { ultimasCorridasMotor } from "@/lib/runs";

// Las DOS señales que disparan una máquina viven acá, juntas y guardadas por la misma zona.
// Antes `buscarAhora` estaba en `curar/sugeridos/actions.ts`, al lado de aprobar y descartar —
// pero aprobar es curar y disparar es operar, y esa mezcla es la que dejó el botón sin renderizar
// durante todo el commit que lo creó. Son gemelas: POST a un webhook de n8n, el workflow decide
// qué hacer leyendo su config por la fachada (ADR-023 + ADR-028).
//
// ⚠️ **Desde ADR-048 la señal ya no es desnuda: lleva `{ instancia }`.** Es el único dato que el
// workflow no puede deducir —hay una definición para N empresas— y sin él la fachada responde 400
// y la corrida no arranca. Todo lo demás lo sigue resolviendo el motor leyendo la config: el
// payload dice DE QUIÉN es la corrida, no qué hacer.

export type ResultadoDisparo = { ok: boolean; mensaje: string };

// ▶ Correr ahora: señal al webhook del motor (ADR-023) con la instancia del cockpit abierto.
// El header vive solo acá (BFF, único portador de secretos) y en n8n — jamás en el browser ni en
// git. La instancia no es secreta: es un uuid del registro, y viaja en el body como el dispatcher.
//
// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export async function correrAhora(enRuta: CockpitEnRuta): Promise<ResultadoDisparo> {
  const { usuario, ctx, cockpit } = await exigirTenant("operar", enRuta.cliente, enRuta.pipeline);

  const url = process.env.MOTOR_WEBHOOK_URL;
  const nombre = process.env.MOTOR_WEBHOOK_HEADER_NOMBRE;
  const valor = process.env.MOTOR_WEBHOOK_HEADER_VALOR;
  if (!url || !nombre || !valor) {
    return {
      ok: false,
      mensaje:
        "Falta configurar el webhook del motor (las 3 env vars del gestor). Avisale a un dev.",
    };
  }

  // Preguntar antes de disparar, igual que `buscarAhora` sesenta líneas más abajo (A7).
  //
  // 🩸 Por qué faltaba y por qué importa: el botón deshabilitado de `page.tsx` es **cosmético** —
  // se decide al renderizar, así que dos personas con la pantalla abierta lo ven habilitado las
  // dos. El guard single-flight del motor sí bloquea la segunda, pero responde **200** (ADR-023
  // C.3), y esta acción lo leía como éxito: devolvía *"Señal enviada, aparece abajo como
  // Corriendo"* cuando no iba a aparecer nada. **El mensaje mentía, y era el único feedback.**
  //
  // ⚠️ Esto NO cierra la race de 1-2 s de ADR-023 C.3.3, que está aceptada y argumentada: dos
  // clicks simultáneos siguen pasando los dos por acá. Cierra el caso real y frecuente —alguien
  // dispara mientras otro ya tenía una corrida andando— y deja al guard de n8n como lo que siempre
  // fue: la autoridad, no el primer filtro.
  try {
    if (hayCorridaViva(await ultimasCorridasMotor(ctx), new Date())) {
      return {
        ok: false,
        mensaje: "Ya hay una corrida corriendo. Esperá a que termine — la vas a ver abajo.",
      };
    }
  } catch {
    // Fail-OPEN, y al revés que su gemela a propósito: si no se pueden leer las corridas, el guard
    // de n8n sigue estando y es el que manda. Bloquear acá por un error de lectura dejaría a Operar
    // sin su botón por una razón que no tiene nada que ver con si hay o no una corrida.
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { [nombre]: valor, "content-type": "application/json" },
      body: JSON.stringify({ instancia: ctx.instanceId }),
    });
    if (res.status === 403) {
      // El gotcha documentado: header distinto al de la credencial de n8n = 403 en silencio.
      return {
        ok: false,
        mensaje:
          "El motor rechazó la señal (403): el header no coincide con el de n8n. Avisale a un dev.",
      };
    }
    if (!res.ok) {
      return { ok: false, mensaje: `El motor respondió ${res.status}. Avisale a un dev.` };
    }
  } catch {
    return { ok: false, mensaje: "No se pudo llegar al motor. ¿n8n está caído? Avisale a un dev." };
  }

  // Auditoría interina hasta app.eventos (D3): quién disparó, en los logs de Vercel (C7).
  console.log(`[operar] ${usuario.email} disparó ▶ Correr ahora`);
  revalidatePath(rutaDe(comoRuta(cockpit), "operar"));
  return {
    ok: true,
    // El 200 es "señal recibida", no el veredicto: si ya hay una corrida viva,
    // el guard single-flight del motor la ignora igual con 200 (ADR-023 C.3).
    mensaje: "Señal enviada. En unos segundos la corrida aparece abajo como “Corriendo”.",
  };
}

// ── Buscar cuentas nuevas ────────────────────────────────────────────────────
//
// El buscador de referentes perdió el cron de los lunes (enmienda de ADR-020) y pasó a ser este
// botón. Misma forma que el ▶ del motor: la instancia en el body, el header solo acá y en n8n.

export async function buscarAhora(enRuta: CockpitEnRuta): Promise<ResultadoDisparo> {
  const { usuario, ctx, cockpit } = await exigirTenant("operar", enRuta.cliente, enRuta.pipeline);

  const url = process.env.DESCUBRIMIENTO_WEBHOOK_URL;
  const nombre = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_NOMBRE;
  const valor = process.env.DESCUBRIMIENTO_WEBHOOK_HEADER_VALOR;
  if (!url || !nombre || !valor) {
    return { ok: false, mensaje: "Falta configurar el webhook del buscador (3 env vars del gestor). Avisale a un dev." };
  }

  // Preguntar antes de disparar: dos clicks son dos corridas de Apify pagas. Acá alcanza con esto
  // y no con el guard single-flight del motor porque hay un solo camino de entrada (este botón).
  if (await hayBusquedaViva(ctx)) {
    return { ok: false, mensaje: "Ya hay una búsqueda corriendo. Esperá a que termine (tarda unos minutos)." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { [nombre]: valor, "content-type": "application/json" },
      body: JSON.stringify({ instancia: ctx.instanceId }),
    });
    if (res.status === 403) {
      // El gotcha documentado: header distinto al de la credencial de n8n = 403 en silencio.
      return { ok: false, mensaje: "El buscador rechazó la señal (403): el header no coincide con el de n8n. Avisale a un dev." };
    }
    if (!res.ok) return { ok: false, mensaje: `El buscador respondió ${res.status}. Avisale a un dev.` };
  } catch {
    return { ok: false, mensaje: "No se pudo llegar al buscador. ¿n8n está caído? Avisale a un dev." };
  }

  await registrarEvento(ctx, usuario.id, "sugeridos.buscar", {});
  // Las dos, porque el botón vive en las dos pantallas: se dispara desde Operar y el resultado
  // se mira en Sugeridos.
  revalidatePath(rutaDe(comoRuta(cockpit), "operar"));
  revalidatePath(rutaDe(comoRuta(cockpit), "curar/sugeridos"));
  return { ok: true, mensaje: "Buscando. En unos minutos aparecen las propuestas nuevas en Curar → Sugeridos." };
}
