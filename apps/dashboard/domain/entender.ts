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
