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

// Con extensión: son imports de VALOR y los `.ts` de `domain/` corren directo en Node sin build,
// igual que el `ZONAS` de `pipelines.ts`.
import { PIPELINE_LINKEDIN, PIPELINE_REELS } from "./pipelines.ts";

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

/**
 * Lo que todo plan trae, sirva el pipeline que sirva.
 *
 * **`pipeline` entró con ADR-068** y es aditivo: nada de lo que ya viajaba cambió de forma, así que
 * `version` se queda en 2 y ningún workflow de reels se entera. Está para que el motor pueda
 * **afirmar** que le contestaron el plan que pidió, con una línea en su `Config`. Es barato porque
 * el modo de falla que cubre es mudo: la fachada deriva el pipeline de la instancia, así que un
 * workflow apuntado a la instancia equivocada no recibe un error — recibe un plan **bien formado y
 * ajeno**, con voces y referentes de verdad adentro. Eso no se ve mirando si "vino algo".
 *
 * ⚠️ Sacarlo después SÍ sería un cambio de forma y costaría el bump (ADR-028 §5).
 */
export type PlanBase = {
  version: number;
  pipeline: string;
  generado_en: string;
};

export type RunPlan = PlanBase & {
  voces: Registro[];
  proyectos: Registro[];
  referentes: Registro[];
  ajustes: Registro[];
};

/**
 * El plan del pipeline de LinkedIn (ADR-068). **No es el de reels con campos de menos**, y la
 * diferencia importa más que el ahorro:
 *
 *   · **No trae `proyectos`.** En LinkedIn el proyecto no gobierna una corrida: la unidad de config
 *     es la VOZ (ADR 002 del repo de diseño, ADR-067). `referentes[].fields.proyecto_id` sigue
 *     viajando para que el motor sepa a qué proyecto atribuir la pieza, pero no hay corte por
 *     proyecto ni `N` por proyecto que resolver.
 *   · **No trae `ajustes`, y esa ausencia es deliberada.** `app.ajustes` es de grano instancia y
 *     LinkedIn no tiene ni una fila (por eso su cockpit tampoco declara la pantalla `motor`,
 *     ADR-066). Servir `ajustes: []` sería la lista siempre vacía que se lee como *"todavía no lo
 *     configuraron"* en vez de *"esto no existe todavía"* — la familia de la `015`. Las perillas del
 *     manifest (`umbral_reacciones`, `pins_por_consulta`, `dias_recencia`, `n_por_voz`,
 *     `ventana_corrida_min`) llegan con la Fase 4 y su migración `028`, y **ese** es el día de
 *     agregar el campo.
 */
export type RunPlanLinkedin = PlanBase & {
  voces: Registro[];
  referentes: Registro[];
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
    pipeline: PIPELINE_REELS,
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
    pipeline: PIPELINE_REELS,
    generado_en: generadoEn.toISOString(),
    voces: entrada.voces,
    proyectos,
    referentes: entrada.referentes,
    ajustes: entrada.ajustes,
  };
}

/**
 * El plan de LinkedIn (ADR-068). **No filtra nada acá, y eso no es una simplificación provisoria.**
 *
 * En reels este ensamblador tiene trabajo real: cruza proyectos contra voces activas y resuelve la
 * `N`. Acá los dos filtros que existen —*"la voz tiene perfil"* y *"el referente está prendido"*—
 * son propiedades de **una** fila cada uno, así que viven en su mapper (`aRegistrosDeVocesLinkedin`,
 * `aRegistrosDeBancoLinkedin`), al lado del tipo que los define. Poner un cruce vacío acá para que
 * los dos pipelines "se parezcan" sería simetría decorativa.
 *
 * 🔴 **El filtro que sí importa está en el mapper de voces y conviene saber cuál es: lo que activa
 * una voz en LinkedIn es que EXISTA SU PERFIL, nunca `voces.activo`** (ADR-067). Ese flag significa
 * de facto *"corre en reels"*. Un plan de LinkedIn que filtrara por él le escondería al motor voces
 * perfectamente configuradas — y hoy le escondería **todas**, porque la pantalla de LinkedIn crea
 * las voces con `activo: false` a propósito.
 */
export function armarRunPlanLinkedin(
  entrada: { voces: Registro[]; referentes: Registro[] },
  generadoEn: Date,
): RunPlanLinkedin {
  return {
    version: RUN_PLAN_VERSION,
    pipeline: PIPELINE_LINKEDIN,
    generado_en: generadoEn.toISOString(),
    ...entrada,
  };
}
