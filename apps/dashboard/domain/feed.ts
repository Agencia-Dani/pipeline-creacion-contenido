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

/**
 * Un candidato **en el listado**: todos los escalares, ninguno de los textos largos.
 *
 * 🔑 La línea se trazó midiendo el payload real de las 165 filas de prod (2026-08-06), no por
 * gusto: de 337 KB, `script` son 207, `relevancia_razon` 30 y `notas_equipo` 3,3 — **240 KB, el
 * 71%**, en tres campos que la tarjeta cerrada no dibuja. Todo el resto junto (url, idioma y los
 * números) son ~15 KB, así que sacarlos no compraba nada y le habría costado al modal mostrar un
 * spinner para su subtítulo y sus badges. Por eso se van **solo los tres**: ver `TextosCandidato`.
 */
export type CandidatoFeed = {
  id: string;
  titulo: string;
  thumbnail: string | null;
  proyecto: string;
  /** La voz dueña del proyecto. Airtable la mostraba junto al proyecto; el corte la dejó afuera. */
  voz: string | null;
  referente: string | null;
  urlReferente: string | null;
  heat: number | null;
  relevanciaScore: number | null;
  idioma: string | null;
  views: number | null;
  likes: number | null;
  seguidores: number | null;
  /** Interacción sobre seguidores. La columna existía desde `009` y no la leía nadie. */
  engagement: number | null;
  viralPorTamano: boolean;
  calificacion: Calificacion | null;
  estado: Estado;
};

/**
 * Los tres campos de texto largo, que se piden **al abrir una tarjeta** y no antes.
 *
 * Es lo que el diseño ya decía y el código no hacía: `tarjeta.tsx` documenta que *"el script
 * (1000+ caracteres) se lee solo cuando el título no alcanza"*, y aun así viajaban los 165
 * scripts en cada carga para dibujar tarjetas que muestran título, referente, vistas y heat.
 */
export type TextosCandidato = {
  script: string | null;
  relevanciaRazon: string | null;
  notas: string | null;
};

export const FILTROS = ["sin-calificar", "fuego", "aprobados", "todos"] as const;
export type Filtro = (typeof FILTROS)[number];

/**
 * Con qué filtro abre el feed. Es una constante y no un literal suelto porque desde que el filtro
 * se aplica en la query hay **dos** lugares que tienen que coincidir —la primera página que arma
 * el server y el estado inicial del cliente— y si se separaran, la pantalla mostraría una página
 * filtrada por A diciendo que el filtro activo es B.
 */
export const FILTRO_INICIAL: Filtro = "sin-calificar";

export const ETIQUETA_FILTRO: Record<Filtro, string> = {
  "sin-calificar": "Sin calificar",
  fuego: "🔥",
  aprobados: "Aprobados",
  todos: "Todos",
};

export const esFiltro = (v: unknown): v is Filtro =>
  typeof v === "string" && (FILTROS as readonly string[]).includes(v);

type Calificable = { calificacion: Calificacion | null };

/**
 * Un filtro tiene **dos lados**, y viven acá juntos a propósito.
 *
 * Desde que el feed pagina, el filtro se aplica en la query (si se aplicara en el cliente, "Sin
 * calificar" mostraría los sin calificar *de la página*, no los primeros sin calificar de la
 * tabla). Pero `ajustarCuentas` sigue necesitando evaluarlo **en memoria**. Son dos expresiones
 * de la misma regla, o sea la forma exacta en que este repo ya se comió un bug: el `IF` y el code
 * node del archivado discrepando sobre la forma del dato. Declarados en un `Record<Filtro, …>`
 * exhaustivo, agregar un filtro **no compila** hasta que se decidan los dos lados.
 */
/** Unión discriminada por `op` para que el llamador pueda angostar `valor` sin castear. */
export type Condicion =
  | { op: "is"; valor: null }
  | { op: "eq"; valor: Calificacion }
  | { op: "in"; valor: readonly Calificacion[] };

type Regla = {
  /** Cómo se evalúa contra una calificación que ya está en memoria. */
  pasa: (c: Calificacion | null) => boolean;
  /** Cómo se le pide a PostgREST. `null` = sin condición: trae todo. */
  condicion: Condicion | null;
};

const REGLAS: Record<Filtro, Regla> = {
  "sin-calificar": {
    pasa: (c) => c === null,
    condicion: { op: "is", valor: null },
  },
  // 🔥 vive DENTRO de aprobados: es un aprobado marcado como ejemplar, no una tercera clase.
  fuego: {
    pasa: (c) => c === "🔥",
    condicion: { op: "eq", valor: "🔥" },
  },
  aprobados: {
    pasa: (c) => c === "🔥" || c === "👍",
    condicion: { op: "in", valor: ["🔥", "👍"] },
  },
  todos: {
    pasa: () => true,
    condicion: null,
  },
};

/**
 * El filtro se evalúa contra la calificación **efectiva** (la guardada, o la que se acaba de
 * poner en esta sesión), así que una tarjeta recién calificada sale de "sin calificar" recién
 * cuando se cambia de filtro o se recarga. Eso es deliberado: es lo que deja re-clickear otro
 * emoji para corregir un misclick sin construir un undo (plan-cockpit §D6.4).
 */
export function pasaFiltro(c: Calificable, filtro: Filtro): boolean {
  return REGLAS[filtro].pasa(c.calificacion);
}

/** El lado PostgREST de la misma regla. Lo consume `lib/candidatos.ts`. */
export function condicionDeFiltro(filtro: Filtro): Condicion | null {
  return REGLAS[filtro].condicion;
}

/**
 * Los contadores de los chips, que son el **avance acumulándose** y por eso no pueden salir de la
 * página cargada: con paginación dirían "25" para siempre.
 *
 * La base son los conteos reales de la tabla (`contarFeed`, cuatro `head` counts) y encima se
 * aplican los cambios que esta sesión hizo y el server todavía no reflejó en esos números. Cada
 * cambio va **desde la calificación original de la fila** —no desde la anterior local—, así que
 * re-clickear tres emojis sobre la misma tarjeta suma un solo delta, y el ajuste sobrevive a un
 * cambio de filtro (que recarga las filas pero no los conteos).
 *
 * `todos` nunca se mueve: calificar no crea ni borra candidatos.
 */
export type Cambio = { antes: Calificacion | null; despues: Calificacion };

export function ajustarCuentas(
  base: Record<Filtro, number>,
  cambios: Cambio[],
): Record<Filtro, number> {
  const ajustadas = { ...base };
  for (const { antes, despues } of cambios) {
    for (const f of FILTROS) {
      if (f === "todos") continue;
      if (REGLAS[f].pasa(antes)) ajustadas[f] -= 1;
      if (REGLAS[f].pasa(despues)) ajustadas[f] += 1;
    }
  }
  return ajustadas;
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

// ─────────────────────────── Paginar el mazo ───────────────────────────
//
// 🩸 Por qué keyset y no `offset`, que es lo que hace `/curar/historicos`: **acá las filas se
// mueven mientras se pagina.** Con el filtro "Sin calificar" activo, cada tarjeta que alguien
// califica sale del conjunto filtrado; si la página 2 fuera `offset 25`, esas N filas ya no están
// adelante y el offset se salta N candidatos **que nadie vio nunca**. En el histórico no pasa
// porque ahí no se edita nada (es `outputs`, ya archivado).
//
// El cursor es `(heat, id)`, que es exactamente el orden estable que `agrupar` ya documenta —
// heat descendente, empates por id. "Traeme lo que va después de este" no se corre cuando una
// fila desaparece del filtro.

export type Cursor = { heat: number | null; id: string };

/** El cursor para pedir la página siguiente: la última fila de la que ya está en pantalla. */
export function cursorDe(candidatos: readonly { heat: number | null; id: string }[]): Cursor | null {
  const ultimo = candidatos.at(-1);
  return ultimo ? { heat: ultimo.heat, id: ultimo.id } : null;
}

/**
 * La condición PostgREST de "todo lo que va DESPUÉS de `cursor`" en `(heat desc, id asc)`, para
 * pasarle a `.or()`.
 *
 * ⚠️ Los `null` de `heat_score` van **últimos** (la query ordena con `nullsFirst: false`, y el
 * dominio hace lo mismo con `heat ?? 0` al agrupar). Hoy no hay ninguno en prod —medido: 0 de
 * 165— pero la columna es nullable, así que si no estuvieran contemplados el día que aparezca
 * uno la paginación cortaría antes de tiempo **sin error**, que es el modo de falla que este
 * repo persigue. De ahí las dos ramas.
 */
export function despuesDe(cursor: Cursor): string {
  if (cursor.heat === null) {
    // Ya estamos en la cola de los nulos: solo quedan nulos con id mayor.
    return `and(heat_score.is.null,id.gt.${cursor.id})`;
  }
  return [
    `heat_score.lt.${cursor.heat}`,
    `and(heat_score.eq.${cursor.heat},id.gt.${cursor.id})`,
    // Los nulos ordenan después de cualquier número, así que siempre están "más adelante".
    "heat_score.is.null",
  ].join(",");
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
