import type { Proyecto, Voz } from "@/domain/corrida";
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

export async function leerRunPlanCrudo(ambito: "motor" | "completo" = "motor") {
  const [voces, proyectos, ajustes, referentes] = await Promise.all([
    leerVocesComoRegistros(ambito), // ← Postgres (D5, corte 3/4)
    leerProyectosComoRegistros(ambito), // ← Postgres (D5, corte 3/4)
    leerAjustesComoRegistros(), // ← Postgres (D5, corte 1/4)
    leerReferentesComoRegistros(ambito), // ← Postgres (D5, corte 2/4)
  ]);
  return { voces, proyectos, ajustes, referentes };
}

export async function leerConfigOperar(): Promise<{
  voces: Voz[];
  proyectos: Proyecto[];
  defaultN: number;
}> {
  const [vocesRaw, proyectosRaw, ajustes] = await Promise.all([
    leerVoces(),
    leerProyectos(),
    leerAjustes(),
  ]);

  // Los mismos dos filtros que hacía Airtable server-side, y NADA más: el cruce "proyecto activo
  // de voz activa" lo resuelve `armarVistaOperar`, que con eso arma la lista de los que no corren.
  // Filtrarlo acá vaciaría ese aviso — que es justo lo que la pantalla existe para mostrar.
  const voces = vocesRaw.filter((v) => v.activo).map((v) => ({ id: v.id, nombre: v.nombre }));

  const proyectos = proyectosRaw
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id, nombre: p.nombre, n: p.n, vozId: p.voz_id }));

  // Fail-open como el motor (ADR-011): sin fila o valor vacío → default del AJUSTE_MAP.
  const valor = ajustes.find((a) => a.clave === "Candidatos por corrida")?.valor;
  const defaultN = typeof valor === "number" && valor > 0 ? valor : 100;

  return { voces, proyectos, defaultN };
}
