// Dominio puro (C3): la lectura legible de la calidad del criterio, portada 1:1 del
// nodo `Computar métricas semana` del archivado (ADR-021: regla, sin IA). Los umbrales
// son los del archivado; solo se tildó la ortografía (el nodo escribía sin acentos).

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
