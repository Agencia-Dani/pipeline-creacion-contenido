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

/**
 * Una línea de Operar: lo que el proyecto **pide**, con qué **cuenta** para conseguirlo, y lo que
 * de verdad **entregó** la última vez.
 *
 * Los tres números son medidos, ninguno es un pronóstico. Es a propósito: `n` es un techo duro y
 * la entrega es best-effort sobre el supply real (`Armar candidato`: «N es un TECHO exacto; la
 * entrega es best-effort»), así que mostrar solo `pide 15` sería prometer algo que la máquina no
 * puede cumplir, y eso es peor que decir «hasta». Poniendo la última entrega al lado, el equipo
 * ve la realidad sin tener que confiar en una estimación — y `cuentas` es la palanca con la que
 * se cambia esa realidad.
 */
export type ProyectoDelPlan = {
  id: string;
  nombre: string;
  /** Lo que este proyecto pide por corrida. Es el único número que gobierna la cantidad. */
  pide: number;
  /** Referentes activos que lo alimentan. Es lo que hay que subir cuando falta fuente. */
  cuentas: number;
  /** Lo que entregó la última corrida con datos. `null` = todavía no hay historia. */
  ultimaEntrega: number | null;
  /** Por qué quedó corto la última vez, si quedó. */
  razonFaltante: RazonFaltante | null;
};

export type VistaOperar = {
  porVoz: { voz: Voz; proyectos: ProyectoDelPlan[] }[];
  // Proyectos activos que NO van a correr: sin voz linkeada, o su voz está apagada.
  noCorren: string[];
};

/**
 * `defaultN` sigue existiendo solo para filas viejas con `n` en null: el motor las resuelve
 * contra el global, así que la pantalla muestra el mismo número que el motor va a usar. Desde
 * esta versión el form exige N, o sea que no se crean filas nuevas así.
 *
 * El join con el embudo va **por nombre de proyecto** y no por id: las claves de
 * `metricas.por_proyecto` todavía son record ids de Airtable en las corridas ya registradas, y
 * `nombre` viaja adentro del valor. Renombrar un proyecto degrada a «sin historia», nunca a un
 * número de otro proyecto.
 */
export function armarVistaOperar(
  voces: Voz[],
  proyectos: Proyecto[],
  defaultN: number,
  cuentasPorProyecto: Map<string, number> = new Map(),
  embudo: EmbudoProyecto[] = [],
): VistaOperar {
  const noCorren: string[] = [];
  const porVoz = voces.map((voz) => ({ voz, proyectos: [] as ProyectoDelPlan[] }));
  const porVozId = new Map(porVoz.map((grupo) => [grupo.voz.id, grupo]));
  const porNombre = new Map(embudo.map((f) => [f.nombre, f]));

  for (const proyecto of proyectos) {
    const grupo = proyecto.vozId ? porVozId.get(proyecto.vozId) : undefined;
    if (!grupo) {
      noCorren.push(proyecto.nombre);
      continue;
    }
    const ultima = porNombre.get(proyecto.nombre);
    grupo.proyectos.push({
      id: proyecto.id,
      nombre: proyecto.nombre,
      pide: proyecto.n && proyecto.n > 0 ? proyecto.n : defaultN,
      cuentas: cuentasPorProyecto.get(proyecto.id) ?? 0,
      ultimaEntrega: ultima ? ultima.entregados : null,
      razonFaltante: ultima ? ultima.razonFaltante : null,
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
//
// ⚠️ Este número está DUPLICADO: el dueño real es `ventana_corrida_min` del nodo
// `Config` del motor (y del archivado). Si cambia allá, cambia acá, o la pantalla
// dice "hay una corrida viva" cuando el motor ya la considera zombie. Cuando la
// config viva en Postgres (D5) esto se lee de ahí y la duplicación muere.
// 120 → 45 → 60 el 2026-07-31: un abort fail-closed deja la fila `en_curso` y con
// 120 bloqueaba 2 h. 45 se eligió sobre un máximo medido de 23,2 min, pero la
// corrida del 31/07 duró 31 (margen 1,45x, no 2x). La ventana tiene que quedar
// POR ENCIMA de la corrida más larga posible: si queda debajo, el barredor mata
// una corrida en vuelo y el guard deja arrancar otra en paralelo.
export const VENTANA_CORRIDA_MIN = 60;

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

// ── Embudo por proyecto (ADR-030 / Fase 3) ────────────────────────────────────
// Lee `metricas.por_proyecto` que arma `Resumen del run`: la incidencia del
// criterio por proyecto. Responde "entregó X de N y por qué faltó" sin SQL.

export type RazonFaltante = "supply" | "gate" | "mixta";

export type EmbudoProyecto = {
  nombre: string;
  nObjetivo: number;
  evaluados: number;
  sinGuion: number;
  gatePass: number;
  tasaGate: number | null; // gate_pass / evaluados-con-guion (0..1); null si no evaluó nada con guion
  entregados: number;
  razonFaltante: RazonFaltante | null; // solo si entregados < nObjetivo
};

export const RAZON_FALTANTE_LEGIBLE: Record<RazonFaltante, string> = {
  supply: "poca fuente (faltan referentes)",
  gate: "criterio muy estricto",
  mixta: "poca fuente y criterio estricto",
};

// Parseo defensivo: metricas es jsonb libre; una corrida vieja (sin por_proyecto)
// devuelve []. Se ordena por nombre para que la card sea estable entre renders.
export function embudoPorProyecto(corrida: Corrida): EmbudoProyecto[] {
  const pp = corrida.metricas?.["por_proyecto"];
  if (!pp || typeof pp !== "object") return [];
  const filas: EmbudoProyecto[] = [];
  for (const valor of Object.values(pp as Record<string, unknown>)) {
    if (!valor || typeof valor !== "object") continue;
    const o = valor as Record<string, unknown>;
    const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
    const razon = o["razon_faltante"];
    filas.push({
      nombre: typeof o["nombre"] === "string" ? (o["nombre"] as string) : "—",
      nObjetivo: num("n_objetivo"),
      evaluados: num("evaluados"),
      sinGuion: num("sin_guion"),
      gatePass: num("gate_pass"),
      tasaGate: typeof o["tasa_gate"] === "number" ? (o["tasa_gate"] as number) : null,
      entregados: num("entregados"),
      razonFaltante:
        razon === "supply" || razon === "gate" || razon === "mixta" ? razon : null,
    });
  }
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// La corrida más reciente que trae el embudo por proyecto (las viejas no lo tienen).
export function ultimoEmbudo(
  corridas: Corrida[],
): { corrida: Corrida; filas: EmbudoProyecto[] } | null {
  for (const corrida of corridas) {
    const filas = embudoPorProyecto(corrida);
    if (filas.length > 0) return { corrida, filas };
  }
  return null;
}
