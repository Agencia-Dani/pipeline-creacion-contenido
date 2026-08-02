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

/**
 * `2` desde ADR-048: el motor pasa a pedir la config **de una instancia** (`?instancia=<uuid>`) y
 * `fields.uuid` deja de viajar. Los dos son cambios de FORMA, así que suben la versión y cuestan el
 * re-import coordinado que la regla de versionado de ADR-028 §5 siempre anunció.
 *
 * ⚠️ El bump que ADR-035 declaró (por el flip de ids de D7) **nunca se ejecutó**, y con razón: el
 * flip terminó siendo pass-through. Este es el primero de verdad — la nota de numeración está en
 * ADR-048.
 */
export const RUN_PLAN_VERSION = 2;

export type Registro = { id: string; fields: Record<string, unknown> };

export type RunPlan = {
  version: number;
  generado_en: string;
  voces: Registro[];
  proyectos: Registro[];
  referentes: Registro[];
  ajustes: Registro[];
};

/**
 * La red para un proyecto con `N` en null, y **nada más que eso**.
 *
 * Hasta ADR-042 esto era el default del knob global `Candidatos por corrida`, que el equipo podía
 * mover. Ese knob murió: estaba inerte (el form exige `N` desde ADR-038, así que ningún proyecto
 * cae acá) y su descripción describía a `cap_top_n`, que es otra cosa. Hoy `N` es la única perilla
 * de cantidad que existe.
 *
 * El número se queda igual al `top_n` del `Config` del motor, que es donde cae la misma decisión
 * del otro lado. Si alguna vez aparece una fila con `n` null —escrita por fuera del cockpit— la
 * corrida no revienta.
 */
export const N_SI_EL_PROYECTO_NO_LO_DICE = 100;

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
        fields: { ...p.fields, N: typeof n === "number" && n > 0 ? n : N_SI_EL_PROYECTO_NO_LO_DICE },
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
