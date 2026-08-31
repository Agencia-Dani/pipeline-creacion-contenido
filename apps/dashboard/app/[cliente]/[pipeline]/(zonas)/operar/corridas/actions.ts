"use server";

import type { CockpitEnRuta } from "@/domain/rutas";
import { admiteVeredictoIA, esWorkflow, type Corrida } from "@/domain/corrida";
import { exigirTenant } from "@/lib/auth";
import { veCostos } from "@/domain/roles";
import { registrarEvento } from "@/lib/eventos";
import { explicarCorrida, hayIA } from "@/lib/ia";
import {
  CORRIDAS_POR_PAGINA,
  corridasDe,
  enlacesN8n,
  guardarVeredictoIA,
  leerCorrida,
  loQueDejoVivo,
} from "@/lib/runs";

// Las dos acciones de la pantalla de corridas. Reciben `cockpit` por la misma razón que las del
// feed: una server action no recibe los `params` de la ruta, y sin el cockpit `exigirTenant` cae al
// default de *"el primero que alcance"* — el bug que dejó el feed de Retia escribiendo en 30X
// durante 3 días (ver `lib/auth.ts`).

export type PaginaCorridas = {
  corridas: Corrida[];
  enlaces: Record<string, string>;
  /** Si vino la página completa, probablemente haya más. No es un `count`: no hace falta uno. */
  hayMas: boolean;
};

/** Las corridas de una máquina. La usa el cambio de tab y el "ver más". */
export async function traerCorridas(
  enRuta: CockpitEnRuta,
  workflow: string,
  saltear = 0,
): Promise<PaginaCorridas> {
  const { ctx, rol } = await exigirTenant("operar", enRuta.cliente, enRuta.pipeline);
  if (!esWorkflow(workflow)) return { corridas: [], enlaces: {}, hayMas: false };

  const corridas = await corridasDe(ctx, workflow, CORRIDAS_POR_PAGINA, saltear);
  return {
    corridas,
    // 🔒 El gate del link vive acá y no en el JSX: si se decidiera al dibujar, la URL habría viajado
    // igual al browser de todo el equipo. Misma razón por la que `veCostos` está en el dominio.
    enlaces: enlacesN8n(workflow, corridas, veCostos(rol)),
    hayMas: corridas.length === CORRIDAS_POR_PAGINA,
  };
}

export type ResultadoIA = { ok: boolean; texto: string | null; mensaje: string };

/**
 * Le pide a la IA que explique una corrida, y **guarda el texto en la corrida**.
 *
 * Se paga una vez por corrida y después todos leen lo mismo: dos personas mirando la misma corrida
 * tienen que leer el mismo veredicto. Un texto regenerado por visita costaría por lectura y
 * cambiaría entre lecturas, que es la forma exacta del problema que este repo ya nombró con los
 * canarios — un texto que se re-genera no se puede citar.
 *
 * Si guardar falla, **el texto se devuelve igual**: no poder cachearlo no es razón para tirar algo
 * que ya se pagó.
 */
export async function explicarConIA(
  enRuta: CockpitEnRuta,
  runId: string,
): Promise<ResultadoIA> {
  const { usuario, ctx } = await exigirTenant("operar", enRuta.cliente, enRuta.pipeline);

  if (!hayIA()) {
    return {
      ok: false,
      texto: null,
      mensaje: "La explicación con IA no está configurada en este entorno. Avisale a un dev.",
    };
  }

  const corrida = await leerCorrida(ctx, runId);
  if (!corrida) return { ok: false, texto: null, mensaje: "Esa corrida no existe en este cockpit." };

  const workflow = corrida.params?.["workflow"];
  if (!esWorkflow(workflow)) {
    return { ok: false, texto: null, mensaje: "Esa corrida no dice de qué máquina es." };
  }

  // La corrida viva todavía la está escribiendo el motor: guardar el veredicto es un
  // read-modify-write sobre el mismo `metricas` y le pisaría el embudo entero.
  if (!admiteVeredictoIA(corrida)) {
    return {
      ok: false,
      texto: null,
      mensaje: "Esperá a que termine: mientras corre, sus números todavía se están escribiendo.",
    };
  }

  // Las anteriores son el contexto que habilita comparar, y es lo único que una regla sobre una
  // sola fila no puede dar. Van pocas a propósito: tres alcanzan para decir "peor que las últimas".
  const anteriores = (await corridasDe(ctx, workflow, 4, 0)).filter((c) => c.id !== runId);

  const texto = await explicarCorrida(workflow, corrida, anteriores);
  if (!texto) {
    return { ok: false, texto: null, mensaje: "No se pudo generar la explicación. Probá de nuevo." };
  }

  const guardado = await guardarVeredictoIA(ctx, runId, texto);
  await registrarEvento(ctx, usuario.id, "corridas.explicar", { corrida: runId, workflow, guardado });

  return {
    ok: true,
    texto,
    mensaje: guardado ? "" : "Se generó, pero no se pudo guardar: la próxima vez habrá que pedirla de nuevo.",
  };
}

/**
 * Cuántos videos de esa corrida siguen vivos en el feed.
 *
 * Se pide **al abrir una corrida fallida**, y no al listar: es un `head` count por corrida, y
 * pedirlo para las 20 filas de la lista serían 20 queries para dibujar un número que casi nadie
 * mira. La corrida que salió bien no lo necesita — ella sí dejó sus números escritos.
 */
export async function contarVivos(enRuta: CockpitEnRuta, runId: string): Promise<number | null> {
  const { ctx } = await exigirTenant("operar", enRuta.cliente, enRuta.pipeline);
  return loQueDejoVivo(ctx, runId);
}
