// Dominio puro (C3): las reglas del espacio de trabajo de D6 — el feed de calificación y la
// auditoría de descartes. Sin IO: lo que pega contra Postgres vive en lib/candidatos.ts y
// lib/descartes.ts.
//
// La regla central es ADR-034: **calificar es UN solo acto y el Estado se deriva**. El
// vocabulario (`nuevo`/`aprobado`/`descartado`, 🔥/👍/👎) no cambió con D7: el archivado sigue
// filtrando por `estado` y `Destilar criterios` sigue eligiendo por el 🔥, solo que ahora leen
// Postgres.
//
// ⚠️ Un Descarte del gate NO es un Candidato (ADR-021: se descartó explícitamente modelarlo
// como "candidato con estado especial"). Comparte archivo porque comparte pantalla y ciclo de
// trabajo, no modelo: tiene su propio tipo, su propio acto (`veredicto`) y su propia vida. Y
// desde ADR-036 **su vida es más larga que la de un candidato**: el candidato se borra al
// archivarse (su historia queda en `outputs`), el descarte no se borra nunca — si se borrara,
// nadie más guardaría lo que se tiró.

// ─────────────────────────── Calificar un Candidato ───────────────────────────

export const CALIFICACIONES = ["🔥", "👍", "👎"] as const;
export type Calificacion = (typeof CALIFICACIONES)[number];

export type Estado = "nuevo" | "aprobado" | "descartado";
export type EstadoDecidido = Exclude<Estado, "nuevo">;

export const esCalificacion = (v: unknown): v is Calificacion =>
  typeof v === "string" && (CALIFICACIONES as readonly string[]).includes(v);

/**
 * El corazón de ADR-034: de la calificación sale el estado, y no hay un segundo control.
 *
 * 🔥 y 👍 son los dos **aprobado**; lo que los separa no es el estado sino la prioridad como
 * ejemplo positivo al destilar los criterios aprendidos (ADR-022). Por eso la derivación va en
 * este sentido y no al revés: de `aprobado` no se puede recuperar si fue 🔥 o 👍, que es
 * exactamente la información que el destilado consume.
 */
export function estadoDe(calificacion: Calificacion): EstadoDecidido {
  return calificacion === "👎" ? "descartado" : "aprobado";
}

/**
 * Lo que se escribe por una calificación: los **tres** campos, siempre juntos.
 *
 * `fecha_calificacion` está acá por una razón que no se ve: en Airtable era un campo
 * `lastModified` que se calculaba **solo**, así que ningún código lo escribía nunca. Al pasar a
 * Postgres la columna se queda sin autor — y de ella cuelga toda la analítica de calidad
 * (`fecha_calificacion` → `outputs.calificado_en` → `v_metricas_calidad`, que filtra
 * `calificado_en is not null` y agrupa por su semana). Sin esta línea la vista devuelve **cero
 * filas** y muere la *precisión de entrega*, la métrica norte de ADR-021. No falla: queda en cero,
 * que es peor.
 */
export function camposDeCalificacion(
  calificacion: Calificacion,
  ahora: Date = new Date(),
): {
  calificacion: Calificacion;
  estado: EstadoDecidido;
  fecha_calificacion: string;
} {
  return {
    calificacion,
    estado: estadoDe(calificacion),
    fecha_calificacion: ahora.toISOString(),
  };
}

// ─────────────────────────── El mazo: filtro y orden ───────────────────────────

export type CandidatoFeed = {
  id: string;
  titulo: string;
  script: string | null;
  thumbnail: string | null;
  proyecto: string;
  /** La voz dueña del proyecto. Airtable la mostraba junto al proyecto; el corte la dejó afuera. */
  voz: string | null;
  referente: string | null;
  urlReferente: string | null;
  heat: number | null;
  relevanciaScore: number | null;
  relevanciaRazon: string | null;
  idioma: string | null;
  views: number | null;
  likes: number | null;
  seguidores: number | null;
  /** Interacción sobre seguidores. La columna existía desde `009` y no la leía nadie. */
  engagement: number | null;
  viralPorTamano: boolean;
  calificacion: Calificacion | null;
  estado: Estado;
  notas: string | null;
};

export const FILTROS = ["sin-calificar", "fuego", "aprobados", "todos"] as const;
export type Filtro = (typeof FILTROS)[number];

export const ETIQUETA_FILTRO: Record<Filtro, string> = {
  "sin-calificar": "Sin calificar",
  fuego: "🔥",
  aprobados: "Aprobados",
  todos: "Todos",
};

type Calificable = { calificacion: Calificacion | null };

/**
 * El filtro se evalúa contra la calificación **efectiva** (la guardada, o la que se acaba de
 * poner en esta sesión), así que una tarjeta recién calificada sale de "sin calificar" recién
 * cuando se cambia de filtro o se recarga. Eso es deliberado: es lo que deja re-clickear otro
 * emoji para corregir un misclick sin construir un undo (plan-cockpit §D6.4).
 *
 * 🔥 vive dentro de "aprobados": es un aprobado marcado como ejemplar, no una tercera clase.
 */
export function pasaFiltro(c: Calificable, filtro: Filtro): boolean {
  switch (filtro) {
    case "sin-calificar":
      return c.calificacion === null;
    case "fuego":
      return c.calificacion === "🔥";
    case "aprobados":
      return c.calificacion === "🔥" || c.calificacion === "👍";
    case "todos":
      return true;
  }
}

export function contarPorFiltro(candidatos: Calificable[]): Record<Filtro, number> {
  return {
    "sin-calificar": candidatos.filter((c) => pasaFiltro(c, "sin-calificar")).length,
    fuego: candidatos.filter((c) => pasaFiltro(c, "fuego")).length,
    aprobados: candidatos.filter((c) => pasaFiltro(c, "aprobados")).length,
    todos: candidatos.length,
  };
}

export const SIN_PROYECTO = "(sin proyecto)";

export type Grupo<T> = { proyecto: string; candidatos: T[] };

/**
 * Agrupa por proyecto y ordena por heat descendente adentro.
 *
 * Por qué agrupado y no una sola cola por heat: los criterios de relevancia son **por
 * proyecto**, así que mezclarlos obliga a rotar de criterio en cada tarjeta y vuelve
 * inconsistente el juicio. Además deja repartir el trabajo por proyecto sin pisarse.
 *
 * El orden es **estable a propósito** (grupos por nombre, empates de heat por id): el mazo no
 * se puede reacomodar solo mientras alguien lo recorre. Es la misma lección que dejó el corte
 * 3/4 — un orden que depende de la posición en un grid cambia cuando alguien arrastra una fila.
 * `(sin proyecto)` va último: es un dato roto, no una categoría.
 */
export function agrupar<T extends { id: string; proyecto: string; heat: number | null }>(
  candidatos: T[],
): Grupo<T>[] {
  const porProyecto = new Map<string, T[]>();
  for (const c of candidatos) {
    const clave = c.proyecto || SIN_PROYECTO;
    const grupo = porProyecto.get(clave);
    if (grupo) grupo.push(c);
    else porProyecto.set(clave, [c]);
  }

  return [...porProyecto.entries()]
    .map(([proyecto, lista]) => ({
      proyecto,
      candidatos: lista.sort(
        (a, b) => (b.heat ?? 0) - (a.heat ?? 0) || a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => {
      if (a.proyecto === SIN_PROYECTO) return 1;
      if (b.proyecto === SIN_PROYECTO) return -1;
      return a.proyecto.localeCompare(b.proyecto, "es");
    });
}

// ─────────────────────────── Auditar un Descarte del gate ───────────────────────────
//
// Entidad distinta (ADR-021): un descarte nunca esperó calificación. El equipo dice si la
// máquina hizo bien en matarlo; los "era bueno" son los **falsos negativos** que el archivado
// cuenta al cerrar la semana, y es el único campo de esa tabla que lee una máquina.

export const VEREDICTOS = ["bien descartado", "era bueno"] as const;
export type Veredicto = (typeof VEREDICTOS)[number];

export const esVeredicto = (v: unknown): v is Veredicto =>
  typeof v === "string" && (VEREDICTOS as readonly string[]).includes(v);

export type DescarteFeed = {
  id: string;
  titulo: string;
  script: string | null;
  thumbnail: string | null;
  proyecto: string;
  referente: string | null;
  urlReferente: string | null;
  relevanciaScore: number | null;
  relevanciaRazon: string | null;
  veredicto: Veredicto | null;
};

/**
 * Los near-miss primero: son los top-K rechazos por score (enmienda 2026-07-13 de ADR-021), o
 * sea los que más cerca estuvieron de pasar — donde viven los falsos negativos. Sin auditar
 * antes que auditados, porque lo pendiente es lo que hay que decidir.
 */
export function ordenarDescartes<T extends { id: string; relevanciaScore: number | null; veredicto: Veredicto | null }>(
  descartes: T[],
): T[] {
  return [...descartes].sort(
    (a, b) =>
      Number(a.veredicto !== null) - Number(b.veredicto !== null) ||
      (b.relevanciaScore ?? 0) - (a.relevanciaScore ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
