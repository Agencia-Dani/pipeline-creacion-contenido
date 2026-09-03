// Dominio puro (C3): la lectura legible de la calidad del criterio, portada 1:1 del
// nodo `Computar métricas semana` del archivado (ADR-021: regla, sin IA). Los umbrales
// son los del archivado; solo se tildó la ortografía (el nodo escribía sin acentos).

// Relativo y con extensión, no `@/domain/...`: mismo motivo que `domain/corrida.ts` (npm test
// corre estos .ts directo en Node, que no resuelve el alias de tsconfig).
import { embudoPorProyecto, type Corrida, type EmbudoProyecto } from "./corrida.ts";

export type NivelCriterio = "sin_datos" | "invertido" | "flojo" | "mejorable" | "sano";

export type Diagnostico = { nivel: NivelCriterio; texto: string };

export function diagnosticoCriterio(
  separacionGate: number | null,
  precision: number | null,
): Diagnostico {
  if (separacionGate == null) {
    return { nivel: "sin_datos", texto: "Sin datos de relevancia esta semana (nada que evaluar)." };
  }

  let nivel: NivelCriterio;
  let texto: string;
  if (separacionGate < 0) {
    nivel = "invertido";
    texto =
      "🔴 Criterio invertido: el filtro puntúa mejor lo que el equipo DESCARTÓ que lo que aprobó. Reescribí criterios_relevancia de este proyecto.";
  } else if (separacionGate < 0.1) {
    nivel = "flojo";
    texto =
      "🔴 Criterio flojo: el filtro casi no distingue lo aprobado de lo descartado. Afiná criterios_relevancia (qué SÍ y qué NO cuenta como relevante).";
  } else if (separacionGate < 0.2) {
    nivel = "mejorable";
    texto = "🟡 Criterio mejorable: separa, pero poco. Un ajuste de criterios_relevancia lo subiría.";
  } else {
    nivel = "sano";
    texto = "🟢 Criterio sano: el filtro distingue bien lo que el equipo quiere.";
  }

  if (separacionGate >= 0.1 && precision != null && precision < 0.4) {
    texto += ` Aun así llega mucho ruido (precisión ${Math.round(precision * 100)}%): considerá subir la Relevancia mínima en Ajustes.`;
  }

  return { nivel, texto };
}

// ── La fila GLOBAL de la semana ──────────────────────────────────────────────

export type CalidadGlobal = {
  calificados: number;
  aprobados: number;
  descartados: number;
  precision: number | null;
};

/**
 * El agregado semanal que Airtable tenía en la fila `GLOBAL` de *Métricas Global* y que el corte
 * se llevó: al cockpit le quedó solo la calidad POR PROYECTO.
 *
 * No hace falta ninguna vista nueva — `v_metricas_calidad` ya trae los conteos crudos. Lo que sí
 * importa es **cómo** se agrega: `precision` se recalcula desde las sumas
 * (`aprobados / (aprobados + descartados)`), no promediando las precisiones de cada proyecto. El
 * promedio de proporciones no es la proporción del total, y con proyectos de volúmenes distintos
 * da un número que se ve razonable y está mal (paradoja de Simpson).
 *
 * `null` cuando no hay nada calificado: no es lo mismo que 0% de precisión.
 */
export function calidadGlobal(filas: { aprobados: number; descartados: number; calificados: number }[]): CalidadGlobal {
  const total = { calificados: 0, aprobados: 0, descartados: 0 };
  for (const f of filas) {
    total.calificados += f.calificados;
    total.aprobados += f.aprobados;
    total.descartados += f.descartados;
  }
  const juzgados = total.aprobados + total.descartados;
  return { ...total, precision: juzgados > 0 ? total.aprobados / juzgados : null };
}

// ── El norte (ADR-089): aprobados / N pedido, por proyecto y por corrida ────────
//
// Hasta el cierre 140 este número solo existía escrito a mano en SQL. `calidadGlobal` de arriba
// mide algo parecido pero distinto: agrupa por SEMANA sobre `outputs` (lo ya archivado), sin el
// `N pedido` al lado. Acá se junta lo que ya lee el resto del cockpit — `embudoPorProyecto`
// (runs.metricas, tiene `n_objetivo` y `entregados`) con los conteos vivos de `app.candidatos`
// (lib/candidatos.ts) — para dar el número completo sin escribir SQL cada vez.

export type ConteoProyecto = { vistos: number; calificados: number; aprobados: number };

/**
 * Debajo de esta cobertura de calificación (`calificados/entregados`), el norte de un proyecto se
 * marca como PISO y no como resultado — ADR-089 §"el tercer número no es opcional": un candidato
 * sin calificar no es un rechazo, y tratarlo como tal castiga al motor por algo que pasó (o no) en
 * el Feed. 0,8 y no 0,5: mejor avisar de más que leer un piso como si fuera definitivo.
 */
export const UMBRAL_COBERTURA_NORTE = 0.8;

export type NorteProyecto = {
  nombre: string;
  nPedido: number;
  entregados: number;
  calificados: number;
  aprobados: number;
  /** `aprobados / nPedido`. `null` si el proyecto no pidió nada esa corrida. */
  norte: number | null;
  /** `calificados / entregados`. `null` si no se entregó nada. */
  coberturaCalificacion: number | null;
  /**
   * `sin_entrega`: no se le entregó nada, no hay norte que leer.
   * `sin_dato`: se entregó pero `app.candidatos` no tiene ni una fila de esa corrida+proyecto —
   *   probablemente ya se archivó (ADR-036 borra el candidato al archivarlo). Distinto de "nadie
   *   calificó": acá no se puede saber, así que no se muestra un 0% que mentiría.
   * `piso`: hay datos pero la cobertura de calificación es baja — el número puede subir.
   * `resultado`: cobertura alta, el número ya es una lectura confiable.
   */
  estado: "sin_entrega" | "sin_dato" | "piso" | "resultado";
};

/** El norte de UNA corrida, proyecto por proyecto. */
export function norteDeCorrida(
  embudo: EmbudoProyecto[],
  conteos: Map<string, ConteoProyecto>,
): NorteProyecto[] {
  return embudo.map((f) => {
    const c = conteos.get(f.nombre) ?? { vistos: 0, calificados: 0, aprobados: 0 };
    const norte = f.nObjetivo > 0 ? c.aprobados / f.nObjetivo : null;
    const cobertura = f.entregados > 0 ? c.calificados / f.entregados : null;

    let estado: NorteProyecto["estado"];
    if (f.entregados === 0) estado = "sin_entrega";
    else if (c.vistos === 0) estado = "sin_dato";
    else if ((cobertura ?? 0) < UMBRAL_COBERTURA_NORTE) estado = "piso";
    else estado = "resultado";

    return {
      nombre: f.nombre,
      nPedido: f.nObjetivo,
      entregados: f.entregados,
      calificados: c.calificados,
      aprobados: c.aprobados,
      norte,
      coberturaCalificacion: cobertura,
      estado,
    };
  });
}

/**
 * El norte de las últimas corridas con embudo por proyecto (las que no lo traen — anteriores a
 * ADR-030 — se saltean, igual que hace `ultimoEmbudo`). `limite` acota cuántas corridas se
 * devuelven, no cuántas se recorren: una corrida sin `por_proyecto` no cuenta contra el límite.
 */
export function norteHistorico(
  corridas: Corrida[],
  conteosPorCorrida: Map<string, Map<string, ConteoProyecto>>,
  limite = 5,
): { corrida: Corrida; filas: NorteProyecto[] }[] {
  const resultado: { corrida: Corrida; filas: NorteProyecto[] }[] = [];
  for (const corrida of corridas) {
    const embudo = embudoPorProyecto(corrida);
    if (embudo.length === 0) continue;
    resultado.push({
      corrida,
      filas: norteDeCorrida(embudo, conteosPorCorrida.get(corrida.id) ?? new Map()),
    });
    if (resultado.length >= limite) break;
  }
  return resultado;
}
