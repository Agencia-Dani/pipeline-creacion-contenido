// Cómo se escribe una fecha en el cockpit. Un solo lugar, y una sola zona horaria.
//
// Por qué existe: `toLocaleString` sin `timeZone` usa la del proceso. En el browser eso es la del
// equipo y sale bien; en un Server Component sobre Vercel es **UTC**, y sale corrido 5 horas. La
// zona Entender mostraba la actividad con la hora equivocada por exactamente eso, y el bug era
// invisible en local (donde el server también corre en Bogotá).
//
// La zona no se elige acá: ya estaba elegida. `core/contracts/workflow-manifest.md` la exige en cada
// manifest —"timezone OBLIGATORIA (incidente real)"— y los crons de ADR-020 corren en ella. Que el
// cockpit use otra sería que la pantalla y el motor hablen de horas distintas.
//
// Antes de esto había tres formateos inline con dos locales distintos (`"es"` y `"es-AR"`) y ninguno
// declaraba zona.

export const ZONA = "America/Bogota";
const LOCALE = "es-AR";

/** Día, mes y hora — para cuándo pasó algo. Es el único formato que muestra una hora absoluta. */
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA,
  });
}

/** Solo el día — para fechas donde la hora no dice nada (calificado el, semana del). */
export function fecha(iso: string, conAnio = false): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" as const } : {}),
    timeZone: ZONA,
  });
}

/**
 * `YYYY-MM-DD` en la zona del equipo, para texto que se GUARDA (no que se re-renderiza).
 *
 * `toISOString().slice(0, 10)` daría el día UTC: aprobar un sugerido a las 20:00 de Bogotá dejaba
 * escrita la fecha del día siguiente, y esa nota queda en la base para siempre.
 */
export function diaISO(momento: Date): string {
  return momento.toLocaleDateString("en-CA", { timeZone: ZONA });
}
