// Dominio puro (C3): el plan de corrida que el motor pide por la fachada (ADR-028).
// Resuelve EXACTAMENTE los filtros que hoy resuelve Airtable server-side, y nada más:
// voces activas, proyectos activos DE VOZ ACTIVA, referentes activos, y la N de cada
// proyecto ya resuelta contra el default global. El scoring, el gate, el corte por
// proyecto y el spillover se quedan en el motor (test-nodos.mjs sigue siendo la red).
//
// La forma del payload es el contrato core/contracts/run-plan.md: listas de registros
// `{id, fields}` (la misma forma que el motor ya parsea de Airtable) para que el swap
// en n8n sea un nodo, no una refactorización. Mientras `version` no cambie, la app
// puede mover el almacenamiento (Airtable → Postgres, D5) sin tocar n8n.

export const RUN_PLAN_VERSION = 1;

export type Registro = { id: string; fields: Record<string, unknown> };

export type RunPlan = {
  version: number;
  generado_en: string;
  voces: Registro[];
  proyectos: Registro[];
  referentes: Registro[];
  ajustes: Registro[];
};

const DEFAULT_CANDIDATOS_POR_CORRIDA = 100; // fail-open, mismo default que el AJUSTE_MAP

// La variante para el archivado (necesita TODAS las voces para resolver nombres) y el
// descubrimiento (ignora `activo` a propósito, cierre 49): mismo shape, cero filtros,
// N tal cual. Cada workflow aplica su propia lógica, como hoy.
export function armarRunPlanCompleto(
  entrada: {
    voces: Registro[];
    proyectos: Registro[];
    referentes: Registro[];
    ajustes: Registro[];
  },
  generadoEn: Date,
): RunPlan {
  return {
    version: RUN_PLAN_VERSION,
    generado_en: generadoEn.toISOString(),
    ...entrada,
  };
}

export function armarRunPlan(
  entrada: {
    voces: Registro[];
    proyectos: Registro[];
    referentes: Registro[];
    ajustes: Registro[];
  },
  generadoEn: Date,
): RunPlan {
  const vocesActivas = new Set(entrada.voces.map((v) => v.id));

  const fila = entrada.ajustes.find((a) => a.fields.clave === "Candidatos por corrida");
  const valor = fila?.fields.valor;
  const defaultN = typeof valor === "number" && valor > 0 ? valor : DEFAULT_CANDIDATOS_POR_CORRIDA;

  const proyectos = entrada.proyectos
    .filter((p) => {
      const voz = p.fields.voz_default;
      // El motor lee voz_default[0]; sin voz activa linkeada, el proyecto no corre.
      return Array.isArray(voz) && typeof voz[0] === "string" && vocesActivas.has(voz[0]);
    })
    .map((p) => {
      const n = p.fields.N;
      return {
        id: p.id,
        fields: { ...p.fields, N: typeof n === "number" && n > 0 ? n : defaultN },
      };
    });

  return {
    version: RUN_PLAN_VERSION,
    generado_en: generadoEn.toISOString(),
    voces: entrada.voces,
    proyectos,
    referentes: entrada.referentes,
    ajustes: entrada.ajustes,
  };
}
