import type { Proyecto, Voz } from "@/domain/corrida";
import type { TenantContext } from "@/domain/tenant";
import { leerAjustes, leerAjustesComoRegistros } from "@/lib/ajustes";
import { leerProyectos, leerProyectosComoRegistros, leerVoces, leerVocesComoRegistros } from "@/lib/proyectos";
import { leerReferentesComoRegistros } from "@/lib/referentes";

// La costura del corte de D5: acá, y solo acá, se decide de qué almacenamiento sale cada
// dominio de la config. Con el corte 3/4, los CUATRO dominios del contrato salen de Postgres:
// la fachada ya no le pregunta nada a Airtable para armar el plan.
//
// Lo único que todavía viaja desde Airtable son `criterios_aprendidos` y
// `advertencia_criterios`, que no son config del equipo sino salida del archivado — su escritor
// sigue en n8n hasta D7 y se leen de donde él los deja (ADR-033). Eso vive en lib/proyectos.ts,
// no acá: desde esta capa, Proyectos es Postgres.
//
// Lo que no cambia nunca es la FORMA: la fachada devuelve `{id, fields}` (contrato
// core/contracts/run-plan.md), así que ningún corte obliga a re-importar workflows.

export async function leerRunPlanCrudo(ctx: TenantContext, ambito: "motor" | "completo" = "motor") {
  const [voces, proyectos, ajustes, referentes] = await Promise.all([
    leerVocesComoRegistros(ctx, ambito), // ← Postgres (D5, corte 3/4)
    leerProyectosComoRegistros(ctx, ambito), // ← Postgres (D5, corte 3/4)
    leerAjustesComoRegistros(ctx), // ← Postgres (D5, corte 1/4)
    leerReferentesComoRegistros(ctx, ambito), // ← Postgres (D5, corte 2/4)
  ]);
  return { voces, proyectos, ajustes, referentes };
}

/**
 * Cuántos videos crudos baja el motor por cada cuenta de referente. Es el otro factor del techo
 * de crudos (ADR-043) y la palanca de supply más barata que tiene el equipo.
 *
 * Fail-open como el motor (ADR-011): sin fila o vacío, el default del `Config` del workflow.
 */
export const RESULTADOS_POR_CUENTA_POR_DEFECTO = 20;

export async function leerConfigOperar(ctx: TenantContext): Promise<{
  voces: Voz[];
  proyectos: Proyecto[];
  resultadosPorCuenta: number;
}> {
  const [vocesRaw, proyectosRaw, ajustes] = await Promise.all([
    leerVoces(ctx),
    leerProyectos(ctx),
    leerAjustes(ctx),
  ]);

  // Los mismos dos filtros que hacía Airtable server-side, y NADA más: el cruce "proyecto activo
  // de voz activa" lo resuelve `armarVistaOperar`, que con eso arma la lista de los que no corren.
  // Filtrarlo acá vaciaría ese aviso — que es justo lo que la pantalla existe para mostrar.
  const voces = vocesRaw.filter((v) => v.activo).map((v) => ({ id: v.id, nombre: v.nombre }));

  const proyectos = proyectosRaw
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id, nombre: p.nombre, n: p.n, vozId: p.voz_id }));

  return { voces, proyectos, resultadosPorCuenta: leerResultadosPorCuenta(ajustes) };
}

/** El knob de supply, normalizado. Lo usan Operar y el campo `N` de Voces y proyectos. */
export function leerResultadosPorCuenta(ajustes: { clave: string; valor: number | null }[]): number {
  const valor = ajustes.find((a) => a.clave === "Resultados por cuenta de referente")?.valor;
  return typeof valor === "number" && valor > 0 ? valor : RESULTADOS_POR_CUENTA_POR_DEFECTO;
}
