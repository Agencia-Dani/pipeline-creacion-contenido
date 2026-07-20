// Dominio puro (C3): qué va a correr y cómo leer una corrida.
// Espeja el gate del motor (proyecto activo de voz activa + N resuelta contra el
// default global, ADR-024) para que la pantalla Operar muestre lo mismo que el
// motor va a decidir. El scoring, el gate y el corte NO viven acá (ADR-028).

export type Voz = { id: string; nombre: string };

export type Proyecto = {
  id: string;
  nombre: string;
  // null = campo vacío en Airtable. 0 también significa "usar el default" (contrato §1).
  n: number | null;
  vozId: string | null;
};

export type ProyectoDelPlan = {
  id: string;
  nombre: string;
  n: number;
  nEsDefault: boolean;
};

export type VistaOperar = {
  porVoz: { voz: Voz; proyectos: ProyectoDelPlan[] }[];
  // Proyectos activos que NO van a correr: sin voz linkeada, o su voz está apagada.
  noCorren: string[];
};

export function armarVistaOperar(
  voces: Voz[],
  proyectos: Proyecto[],
  defaultN: number,
): VistaOperar {
  const noCorren: string[] = [];
  const porVoz = voces.map((voz) => ({ voz, proyectos: [] as ProyectoDelPlan[] }));
  const porVozId = new Map(porVoz.map((grupo) => [grupo.voz.id, grupo]));

  for (const proyecto of proyectos) {
    const grupo = proyecto.vozId ? porVozId.get(proyecto.vozId) : undefined;
    if (!grupo) {
      noCorren.push(proyecto.nombre);
      continue;
    }
    const usaDefault = !proyecto.n; // vacío o 0 → default global
    grupo.proyectos.push({
      id: proyecto.id,
      nombre: proyecto.nombre,
      n: usaDefault ? defaultN : (proyecto.n as number),
      nEsDefault: usaDefault,
    });
  }

  // Una voz activa sin proyectos activos no aporta nada a la corrida: no se muestra.
  return { porVoz: porVoz.filter((grupo) => grupo.proyectos.length > 0), noCorren };
}

// ── Corridas (filas de `runs` del motor) ──────────────────────────────────────

export type EstadoCorrida = "en_curso" | "ok" | "fallo" | "parcial";

export type Corrida = {
  id: string;
  inicio: string; // ISO
  fin: string | null;
  estado: EstadoCorrida;
  trigger_type: string;
  metricas: Record<string, unknown> | null;
  error: string | null;
};

export const ESTADO_LEGIBLE: Record<EstadoCorrida, string> = {
  en_curso: "Corriendo",
  ok: "Terminó bien",
  fallo: "Falló",
  parcial: "Terminó a medias",
};

export const DISPARO_LEGIBLE: Record<string, string> = {
  cron: "cron semanal",
  on_demand: "botón ▶",
  manual: "manual (n8n)",
  conversation: "conversación",
};

// Misma ventana que el guard single-flight del motor (ADR-023 C.3): una corrida
// `en_curso` más vieja que la ventana se considera colgada, no viva.
export const VENTANA_CORRIDA_MIN = 120;

export function hayCorridaViva(
  corridas: Corrida[],
  ahora: Date,
  ventanaMin: number = VENTANA_CORRIDA_MIN,
): boolean {
  return corridas.some(
    (c) =>
      c.estado === "en_curso" &&
      ahora.getTime() - new Date(c.inicio).getTime() < ventanaMin * 60_000,
  );
}

export function duracionLegible(
  inicio: string,
  fin: string | null,
  ahora: Date,
): string {
  const ms = (fin ? new Date(fin) : ahora).getTime() - new Date(inicio).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  return `${horas} h ${min % 60} min`;
}

export function haceCuanto(iso: string, ahora: Date): string {
  const min = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

// Qué entregó, del embudo que arma `Resumen del run` (ADR-021): outputs = candidatos.
export function entregaLegible(corrida: Corrida): string | null {
  const outputs = corrida.metricas?.["outputs"];
  if (typeof outputs !== "number") return null;
  return outputs === 1 ? "entregó 1 candidato" : `entregó ${outputs} candidatos`;
}
