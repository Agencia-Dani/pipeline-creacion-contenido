// El plan del buscador de referentes, calculado en el cockpit para poder MOSTRARLO antes de
// apretar (ADR-079 §3). Es el gemelo de `armarVistaOperar`: misma forma, mismo rol, misma
// contrapartida.
//
// 🩸 **Esto es una segunda implementación de una regla que ya vive en n8n**, en el nodo
// `Armar plan de descubrimiento`. Se acepta con los ojos abiertos, por el mismo motivo que ya se
// aceptó para el motor (`techoDeCrudos` reproduce la aritmética de la corrida): la alternativa era
// que el workflow expusiera un dry-run, o sea un contrato nuevo y un viaje a n8n para pintar una
// card. **Si el nodo cambia, esto miente con cara de verdad.** Por eso cada constante de acá dice
// de qué campo del `Config` de aquel workflow es espejo, y por eso el orden de los filtros es el
// mismo y no "el equivalente".

/** Espejo de `Config.cap_semillas` del workflow de descubrimiento. Tope de costo, dev-only:
 *  no está en `Ajustes`, así que el equipo no lo puede mover y el cockpit no lo puede leer. */
export const CAP_SEMILLAS = 8;

/** Defaults de `Config` para los dos knobs que el equipo SÍ puede pisar desde `Ajustes`
 *  (`Propuestas por corrida` y `Afinidad mínima de propuesta`). */
export const PROPUESTAS_POR_CORRIDA_POR_DEFECTO = 10;
export const AFINIDAD_MINIMA_POR_DEFECTO = 0.6;

/** Lo mínimo que el plan necesita de un referente del banco. */
export type ReferenteParaSembrar = {
  handle: string;
  plataforma: string;
  activo: boolean;
  proyectoIds: readonly string[];
};

/** La señal de selección por cuenta (`v_senal_seleccion`), que es lo que ordena las semillas. */
export type SenalPorReferente = { tasa: number; calificados: number };

export type Semilla = {
  handle: string;
  /** `null` = esta cuenta todavía no tiene ningún video calificado, así que no aporta señal. */
  tasa: number | null;
  calificados: number;
};

export type VistaBuscador = {
  /** Las que de verdad van a sembrar: rankeadas y ya cortadas por `CAP_SEMILLAS`. */
  semillas: Semilla[];
  /** Cuántas calificaban ANTES del corte. `elegibles - semillas.length` es lo que se queda afuera. */
  elegibles: number;
  cap: number;
  propuestasMax: number;
  afinidadMinima: number;
  /** Referentes activos que alimentan proyectos en alcance pero **no siembran por su plataforma**
   *  (el descubrimiento es solo-IG, ADR-020 v1). Hoy suele ser 0; existe para que el día que el
   *  equipo cargue cuentas de TikTok la pantalla lo diga en vez de dejarlas invisibles. */
  sinSembrarPorPlataforma: number;
};

const esInstagram = (plataforma: string) => plataforma.toLowerCase().includes("insta");

/** Igual que el workflow: sin `@`, y la comparación va en minúsculas. */
const normalizar = (handle: string) => handle.trim().replace(/^@+/, "");

/**
 * `proyectoIdsEnAlcance` son los proyectos que el descubrimiento va a atender: activos **y de voz
 * activa** (ADR-079). Se pasan ya resueltos en vez de recalcular el cruce acá, para que la card de
 * Operar y esta lista no puedan discrepar sobre quién entra — es el mismo conjunto que
 * `armarVistaOperar` ya usa para el motor, que es justamente lo que ADR-079 §3 compró.
 *
 * El orden reproduce el del nodo: **tasa de selección desc, y a igual tasa manda quién tiene más
 * calificados** (más muestra = más confiable). Una cuenta sin señal cuenta como tasa 0 y cae al
 * fondo, igual que allá — no se la esconde, porque una semilla sin historia sigue siendo una
 * semilla válida cuando no hay mejores.
 */
export function armarVistaBuscador(
  referentes: readonly ReferenteParaSembrar[],
  proyectoIdsEnAlcance: ReadonlySet<string>,
  senal: ReadonlyMap<string, SenalPorReferente>,
  knobs: { propuestasMax: number; afinidadMinima: number; descubrirEnInstagram: boolean },
): VistaBuscador {
  const base = {
    cap: CAP_SEMILLAS,
    propuestasMax: knobs.propuestasMax,
    afinidadMinima: knobs.afinidadMinima,
  };

  const alimentanAlgoEnAlcance = referentes.filter(
    (r) => r.activo && r.proyectoIds.some((id) => proyectoIdsEnAlcance.has(id)),
  );
  const sinSembrarPorPlataforma = alimentanAlgoEnAlcance.filter(
    (r) => !esInstagram(r.plataforma),
  ).length;

  // El toggle `Descubrir en Instagram` apagado no deja semillas, y entonces no hay búsqueda que
  // mostrar. Se devuelve la forma completa igual (no null) para que la card diga "0 de N" en vez
  // de desaparecer: una pantalla vacía no explica por qué está vacía.
  if (!knobs.descubrirEnInstagram) {
    return { ...base, semillas: [], elegibles: 0, sinSembrarPorPlataforma };
  }

  // Dedup por handle en minúsculas, como el `semMap` del nodo: la misma cuenta cargada dos veces
  // es UNA semilla, no dos, y se queda con la primera forma escrita del handle.
  const porHandle = new Map<string, string>();
  for (const r of alimentanAlgoEnAlcance) {
    if (!esInstagram(r.plataforma)) continue;
    const handle = normalizar(r.handle);
    if (!handle) continue;
    const clave = handle.toLowerCase();
    if (!porHandle.has(clave)) porHandle.set(clave, handle);
  }

  const elegibles = [...porHandle].map(([clave, handle]) => {
    const s = senal.get(clave);
    return {
      handle,
      tasa: s ? s.tasa : null,
      calificados: s ? s.calificados : 0,
    };
  });

  elegibles.sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0) || b.calificados - a.calificados);

  return {
    ...base,
    semillas: elegibles.slice(0, CAP_SEMILLAS),
    elegibles: elegibles.length,
    sinSembrarPorPlataforma,
  };
}
