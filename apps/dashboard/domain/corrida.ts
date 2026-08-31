// Dominio puro (C3): qué va a correr y cómo leer una corrida.
// Espeja el gate del motor (proyecto activo de voz activa) para que la pantalla Operar muestre lo
// mismo que el motor va a decidir. El scoring, el gate y el corte NO viven acá (ADR-028).

// Relativo y con extensión, no `@/domain/...`: `npm test` corre estos `.ts` directo en Node, que
// no resuelve el alias de tsconfig. Es el primer módulo de dominio que importa a otro.
import { N_SI_EL_PROYECTO_NO_LO_DICE } from "./run-plan.ts";

export type Voz = { id: string; nombre: string };

export type Proyecto = {
  id: string;
  nombre: string;
  // null u 0 = fila que no dice cuántos quiere. La app ya no puede crear una así (ADR-038).
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
  /** Cuántos videos crudos llega a mirar la corrida para este proyecto (ADR-043). */
  techo: number;
  /** Lo que entregó la última corrida con datos. `null` = todavía no hay historia. */
  ultimaEntrega: number | null;
  /** Por qué quedó corto la última vez, si quedó. */
  razonFaltante: RazonFaltante | null;
};

/**
 * **El techo de crudos** (ADR-043): cuántos videos llega a MIRAR la corrida para este proyecto,
 * antes de filtrar nada.
 *
 * `cuentas × resultados por cuenta`. No es un pronóstico y por eso puede convivir con la decisión
 * de arriba: es un límite superior aritmético, verdadero por construcción. Un proyecto con 3
 * cuentas y el knob en 40 mira 120 videos crudos; si pide 50, está pidiendo que pase el filtro el
 * 42%, y las tasas reales están a la vista en Referentes.
 *
 * Sobreestima a propósito —ignora el dedup y el fan-out— porque eso es lo que lo vuelve seguro:
 * si ni siquiera el techo alcanza, la conclusión no depende de ninguna tasa.
 */
export function techoDeCrudos(cuentas: number, resultadosPorCuenta: number): number {
  return Math.max(0, cuentas) * Math.max(0, resultadosPorCuenta);
}

/**
 * Si el proyecto pide más de lo que la corrida llega a mirar, no hay filtro que lo salve: faltan
 * cuentas. Es la señal que dispara el aviso, y sin cuentas cargadas (techo 0) también es cierta.
 */
export function pideMasQueElTecho(pide: number, techo: number): boolean {
  return pide > techo;
}

export type VistaOperar = {
  porVoz: { voz: Voz; proyectos: ProyectoDelPlan[] }[];
  // Proyectos activos que NO van a correr: sin voz linkeada, o su voz está apagada.
  noCorren: string[];
};

/**
 * `resultadosPorCuenta` es el knob de supply, y entra solo para calcular el techo (ADR-043).
 * Antes acá llegaba un `defaultN` que salía del knob global `Candidatos por corrida`; ese knob
 * murió con ADR-042 y su lugar lo toma una constante: `N_SI_EL_PROYECTO_NO_LO_DICE`, que es una
 * red para filas con `n` null y ya no una perilla que alguien pueda mover.
 *
 * El join con el embudo va **por nombre de proyecto** y no por id: las claves de
 * `metricas.por_proyecto` todavía son record ids de Airtable en las corridas ya registradas, y
 * `nombre` viaja adentro del valor. Renombrar un proyecto degrada a «sin historia», nunca a un
 * número de otro proyecto.
 */
export function armarVistaOperar(
  voces: Voz[],
  proyectos: Proyecto[],
  resultadosPorCuenta: number,
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
    const cuentas = cuentasPorProyecto.get(proyecto.id) ?? 0;
    grupo.proyectos.push({
      id: proyecto.id,
      nombre: proyecto.nombre,
      pide: proyecto.n && proyecto.n > 0 ? proyecto.n : N_SI_EL_PROYECTO_NO_LO_DICE,
      cuentas,
      techo: techoDeCrudos(cuentas, resultadosPorCuenta),
      ultimaEntrega: ultima ? ultima.entregados : null,
      razonFaltante: ultima ? ultima.razonFaltante : null,
    });
  }

  // Una voz activa sin proyectos activos no aporta nada a la corrida: no se muestra.
  return { porVoz: porVoz.filter((grupo) => grupo.proyectos.length > 0), noCorren };
}

/**
 * Los proyectos que de verdad entran: activos **y de voz activa**. Sale de la vista ya armada y no
 * de un segundo cruce, justamente para que no exista un segundo cruce — desde ADR-079 este mismo
 * conjunto es el alcance de las DOS máquinas, así que si acá y la card discreparan, una de las dos
 * estaría mintiendo. Lo consume el plan del buscador (`armarVistaBuscador`).
 */
export function proyectosDelPlan(vista: VistaOperar): Set<string> {
  return new Set(vista.porVoz.flatMap((grupo) => grupo.proyectos.map((p) => p.id)));
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
  /**
   * Lo que la corrida guardó de sí misma al abrirse: `workflow` (el discriminador de los 4) y
   * `execution_id` (la ejecución de n8n). El segundo es la única llave que conecta una fila de
   * `runs` con la ejecución que la produjo, y es lo que evita tener que buscarla a mano por fecha.
   */
  params: Record<string, unknown> | null;
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

// ── Las corridas EN DETALLE (pantalla `operar/corridas`) ──────────────────────
//
// 🔑 **Esta mitad del archivo existe para traducir, no para calcular.** El motor ya diagnostica:
// `Resumen del run` (ADR-021/ADR-030) escribe el embudo, `razon_faltante` por proyecto, el
// desglose por referente y un array `avisos`. Lo que faltaba no era análisis: era que alguien lo
// dijera en el idioma del equipo de redes en vez del de los nodos.
//
// ⚠️ **La regla de honestidad de unidades, que es por qué el por-proyecto va primero en la
// pantalla:** `colectados` cuenta VIDEOS y `pretrim`/`gate` cuentan **video × proyecto** (un mismo
// video se evalúa en cada proyecto que lo reclama). Por eso `1.682` sale de `520` sin que nadie
// haya bajado más videos. El desglose por proyecto, en cambio, cuenta **videos distintos de punta a
// punta** (`Resumen del run` los dedupea por `external_id`), así que es la única vista donde los
// números se pueden restar entre sí sin mentir. El embudo global se muestra igual, pero abajo y
// diciendo qué unidad usa cada paso.

/** Los cuatro que escriben en `runs`. El discriminador es `params.workflow`. */
export const WORKFLOWS = ["motor", "archivado", "descubrimiento", "transcriptor"] as const;
export type Workflow = (typeof WORKFLOWS)[number];

export const esWorkflow = (v: unknown): v is Workflow =>
  typeof v === "string" && (WORKFLOWS as readonly string[]).includes(v);

/**
 * Cómo se llama cada máquina **para el equipo**, no para un dev.
 *
 * Son verbos, igual que las zonas del cockpit: lo que el equipo reconoce es la acción que apretó
 * (`Correr`, `Buscar cuentas nuevas`, `Archivar lo calificado` en Operar), no el nombre del
 * workflow en n8n. `transcriptor` no tiene botón en Operar porque se dispara solo al pegar enlaces
 * en la zona Transcribir — de ahí su nombre.
 */
export const WORKFLOW_LEGIBLE: Record<Workflow, string> = {
  motor: "Traer videos",
  archivado: "Archivar",
  descubrimiento: "Buscar cuentas",
  transcriptor: "Transcribir a mano",
};

/**
 * Cómo se disparó, **dicho por máquina**.
 *
 * 🩸 `DISPARO_LEGIBLE.manual` dice *"manual (n8n)"*, y para el transcriptor eso es directamente
 * falso: el transcriptor no corre en n8n, corre en el propio cockpit cuando alguien pega enlaces
 * (ADR-062). El mapa de arriba nació cuando las únicas corridas eran de n8n; se corrige acá y no
 * allá porque la etiqueta que sirve depende de qué máquina es, y `DISPARO_LEGIBLE` no lo sabe.
 */
export function disparoLegible(workflow: Workflow, trigger: string): string {
  if (workflow === "transcriptor") {
    return trigger === "manual" ? "pegando enlaces" : trigger;
  }
  return DISPARO_LEGIBLE[trigger] ?? trigger;
}

/** `1 video`, `2 videos`: las cinco unidades de `Paso` pluralizan sumando una `s`. */
export function conUnidad(valor: number, unidad: Paso["unidad"]): string {
  const numero = valor.toLocaleString("es");
  if (!unidad) return numero;
  return `${numero} ${valor === 1 ? unidad.replace(/s$/, "") : unidad}`;
}

export function workflowDe(corrida: Corrida): Workflow | null {
  const w = corrida.params?.["workflow"];
  return esWorkflow(w) ? w : null;
}

/** La ejecución de n8n que produjo esta corrida, si la guardó al abrirse. */
export function ejecucionN8n(corrida: Corrida): string | null {
  const id = corrida.params?.["execution_id"];
  return typeof id === "string" && id !== "" ? id : null;
}

// Lectores defensivos: `metricas` es jsonb libre y una corrida vieja puede no traer la clave.
// Devuelven `null` y no `0` cuando el dato no está, porque **"no se registró" y "fue cero" son
// cosas distintas** — es la misma regla que ya aplica `ultimaEntrega` en `ProyectoDelPlan`, y la
// que hace que un fallo (donde `metricas` es NULL entera) no se dibuje como una corrida que no
// trajo nada.
function num(fuente: unknown, clave: string): number | null {
  if (!fuente || typeof fuente !== "object") return null;
  const v = (fuente as Record<string, unknown>)[clave];
  return typeof v === "number" ? v : null;
}

function objeto(fuente: unknown, clave: string): Record<string, unknown> | null {
  if (!fuente || typeof fuente !== "object") return null;
  const v = (fuente as Record<string, unknown>)[clave];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Un paso del recorrido, ya en castellano.
 *
 * `unidad` no es decoración: es lo que impide leer el embudo global como una resta. Un paso en
 * `revisiones` y uno en `videos` no se pueden restar, y decirlo es más barato que explicarlo.
 */
export type Paso = {
  etiqueta: string;
  valor: number;
  unidad: "videos" | "revisiones" | "cuentas" | "enlaces" | "propuestas" | null;
  /** Un matiz medido del mismo paso ("18 sin audio"), nunca una interpretación. */
  nota: string | null;
  tono: "normal" | "aviso" | "malo";
};

function paso(
  etiqueta: string,
  valor: number | null,
  unidad: Paso["unidad"] = null,
  nota: string | null = null,
  tono: Paso["tono"] = "normal",
): Paso | null {
  return valor === null ? null : { etiqueta, valor, unidad, nota, tono };
}

/**
 * El recorrido de una corrida, **distinto para cada máquina** porque cada una hace otra cosa.
 *
 * Una plantilla común habría obligado a las cuatro a hablar de "items", que es exactamente el
 * lenguaje de dev que esta pantalla existe para no usar. Los pasos que la corrida no registró
 * simplemente no aparecen: la lista se arma con lo que hay.
 */
export function pasosDe(workflow: Workflow, corrida: Corrida): Paso[] {
  const m = corrida.metricas;
  if (!m) return [];

  if (workflow === "motor") {
    const vacias = num(m, "transcripciones_vacias");
    const escuchados = num(objeto(m, "llamadas"), "supadata");
    return [
      paso("Bajó de las cuentas", num(m, "colectados"), "videos"),
      paso("Los repartió entre los proyectos", num(m, "pretrim"), "revisiones"),
      paso("Quedaron los más calientes", num(m, "filtrados"), "revisiones"),
      paso(
        "Alcanzó a escuchar",
        escuchados,
        "videos",
        vacias && vacias > 0 ? `${vacias} volvieron sin audio` : null,
        vacias && escuchados && vacias / escuchados > 0.3 ? "aviso" : "normal",
      ),
      paso("Le gustaron", num(m, "gate"), "revisiones"),
      paso("Dejó en el feed", num(m, "outputs"), "videos"),
    ].filter((p): p is Paso => p !== null);
  }

  if (workflow === "descubrimiento") {
    const promovidos = num(m, "promovidos");
    return [
      paso("Partió de las cuentas que ya seguís", num(m, "semillas"), "cuentas"),
      paso("Encontró parecidas", num(m, "sugeridos_unicos"), "cuentas"),
      paso("Revisó a fondo", num(m, "detalle"), "cuentas"),
      paso("Te propuso", num(m, "propuestos"), "propuestas"),
      paso(
        "Se sembraron solas",
        promovidos,
        "cuentas",
        null,
        promovidos === 0 ? "aviso" : "normal",
      ),
    ].filter((p): p is Paso => p !== null);
  }

  if (workflow === "archivado") {
    return [paso("Mandó a Históricos", num(m, "archivados"), "videos")].filter(
      (p): p is Paso => p !== null,
    );
  }

  const fallos = num(m, "fallos");
  return [
    paso("Enlaces pegados", num(m, "pedidos"), "enlaces"),
    paso("Salieron con guion", num(m, "listos"), "videos"),
    paso("Sin transcripción disponible", num(m, "sin_transcript"), "videos"),
    paso("Fallaron", fallos, "videos", null, fallos && fallos > 0 ? "malo" : "normal"),
  ].filter((p): p is Paso => p !== null);
}

/**
 * Una línea del desglose por proyecto, con su diagnóstico **ya redactado**.
 *
 * La frase sale de `razon_faltante`, que el motor calcula con umbrales explícitos — no se
 * re-diagnostica acá. Es a propósito: dos diagnósticos del mismo hecho es cómo se llega a que la
 * pantalla contradiga al motor, y el que tiene los datos crudos es el motor.
 */
export type LineaProyecto = {
  nombre: string;
  miro: number;
  gustaron: number;
  entrego: number;
  pide: number;
  diagnostico: string;
  tono: "bien" | "aviso" | "malo";
};

export function lineasPorProyecto(corrida: Corrida): LineaProyecto[] {
  return embudoPorProyecto(corrida).map((f) => {
    const completo = f.nObjetivo > 0 && f.entregados >= f.nObjetivo;
    if (completo || f.razonFaltante === null) {
      return {
        nombre: f.nombre,
        miro: f.evaluados,
        gustaron: f.gatePass,
        entrego: f.entregados,
        pide: f.nObjetivo,
        diagnostico: completo ? "Completo." : "Entregó todo lo que pudo con lo que había.",
        tono: "bien" as const,
      };
    }
    const diagnostico =
      f.razonFaltante === "supply"
        ? `Faltó material: de ${f.evaluados} videos que miró, solo ${f.gatePass} le sirvieron. Hacen falta más cuentas.`
        : f.razonFaltante === "gate"
          ? `Miró ${f.evaluados} y aprobó ${f.gatePass}: el criterio está muy cerrado para lo que hay.`
          : `Miró ${f.evaluados} y aprobó ${f.gatePass}. Faltan cuentas y además el criterio está muy cerrado.`;
    return {
      nombre: f.nombre,
      miro: f.evaluados,
      gustaron: f.gatePass,
      entrego: f.entregados,
      pide: f.nObjetivo,
      diagnostico,
      tono: f.entregados === 0 ? ("malo" as const) : ("aviso" as const),
    };
  });
}

/**
 * Las cuentas que la corrida miró y de las que **no le sirvió ni un video**.
 *
 * 📌 Es el dato que el handoff ya venía pidiendo a mano ("podar los referentes de cola"): estaba
 * en `metricas.por_referente` de cada corrida desde ADR-021 y no lo dibujaba nadie. Se listan solo
 * las que tuvieron videos evaluados — una cuenta con cero evaluados no aportó porque la corrida no
 * llegó a mirarla, que es otro problema y otra palanca.
 */
export type CuentaMuda = { handle: string; miro: number };

export function cuentasSinAporte(corrida: Corrida): CuentaMuda[] {
  const pr = objeto(corrida.metricas, "por_referente");
  if (!pr) return [];
  const mudas: CuentaMuda[] = [];
  for (const [handle, valor] of Object.entries(pr)) {
    const miro = num(valor, "evaluados") ?? 0;
    const paso = num(valor, "gate_pass") ?? 0;
    if (miro > 0 && paso === 0) mudas.push({ handle, miro });
  }
  return mudas.sort((a, b) => b.miro - a.miro || a.handle.localeCompare(b.handle));
}

/** Los avisos que el propio motor se dejó escritos (`metricas.avisos`, ADR-030). */
export function avisosDe(corrida: Corrida): string[] {
  const a = corrida.metricas?.["avisos"];
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
}

/** Llamadas pagas por servicio, para la card de costo. Vacío si la corrida no las registró. */
export function llamadasDe(corrida: Corrida): { servicio: string; cuantas: number }[] {
  const l = objeto(corrida.metricas, "llamadas");
  const extra: { servicio: string; cuantas: number }[] = [];
  const ig = num(corrida.metricas, "apify_ig");
  const tt = num(corrida.metricas, "apify_tt");
  if (ig !== null || tt !== null) {
    extra.push({ servicio: "apify", cuantas: (ig ?? 0) + (tt ?? 0) });
  }
  if (!l) return extra;
  const desde = Object.entries(l)
    .map(([servicio, v]) => ({
      servicio: servicio.replace(/^haiku_lotes_/, "haiku ").replace(/_/g, " "),
      cuantas: typeof v === "number" ? v : 0,
    }))
    .filter((x) => x.cuantas > 0);
  return [...extra, ...desde];
}

// ── El fallo ──────────────────────────────────────────────────────────────────

/**
 * Lo que se puede saber de una corrida que se cayó.
 *
 * 🩸 **Y lo que NO se puede, medido contra prod el 2026-08-31: las 12 corridas fallidas tienen
 * `metricas` en NULL, las 12.** `Resumen del run` es el último nodo del motor, así que si la
 * corrida muere antes, no se escribe ni un contador. Por eso el detalle de un fallo es fino por
 * construcción y no por falta de pantalla: lo único que quedó registrado es esta oración, y lo que
 * la corrida alcanzó a dejar se cuenta yendo a las tablas que sí escribió (`lib/runs.ts`).
 */
export type Fallo = {
  /** El nodo de n8n donde murió, si el error handler llegó a escribirlo (ADR-054). */
  nodo: string | null;
  /** El mensaje, sin el nodo ni la URL: lo que queda es lo que dijo el sistema. */
  mensaje: string;
  /** La ejecución de n8n, cuando el error la trajo pegada. */
  url: string | null;
};

export function fallo(corrida: Corrida): Fallo | null {
  if (corrida.estado !== "fallo") return null;
  const crudo = (corrida.error ?? "").trim();
  if (crudo === "") return { nodo: null, mensaje: "Se cayó sin dejar mensaje.", url: null };

  // El formato lo arma `Preparar datos del fallo` del error handler:
  // `[nombre del workflow] mensaje · nodo: X · https://…/executions/N`
  const nodo = /·\s*nodo:\s*([^·]+)/.exec(crudo)?.[1]?.trim() ?? null;
  const url = /(https?:\/\/\S+)/.exec(crudo)?.[1] ?? null;
  const mensaje =
    crudo
      .replace(/·\s*nodo:\s*[^·]*/, "")
      .replace(/·?\s*https?:\/\/\S+/, "")
      .trim() || "Se cayó sin dejar mensaje.";
  return { nodo, mensaje: mensaje.replace(/\s+·\s*$/, ""), url };
}

/**
 * Qué hace, en castellano, el nodo donde se cayó.
 *
 * Solo están los que **pueden** caerse de verdad: los HTTP que salen a la red y los code nodes
 * caros. Un nodo que no está acá se dibuja con su nombre crudo y nada más — inventarle una
 * descripción sería peor que no tenerla, porque se leería igual de confiable que las que sí se
 * verificaron contra el `workflow.json`.
 */
export const QUE_HACE_EL_NODO: Record<string, string> = {
  "Leer plan (fachada)": "preguntarle al cockpit qué proyectos y qué cuentas tocaba correr",
  "Apify — IG Reels": "bajar los reels de las cuentas de Instagram",
  "Apify — TikTok Perfil": "bajar los videos de las cuentas de TikTok",
  "Transcribir (Supadata)": "sacar el texto hablado de cada video",
  "Traducir (Claude Haiku)": "traducir al español los videos que venían en otro idioma",
  "Gate de relevancia": "decidir cuáles videos sirven para cada proyecto",
  "POST Candidatos": "guardar en el cockpit los videos aprobados",
  "POST Descartes": "guardar los videos que descartó, para poder auditarlos",
  "POST processed_items": "anotar qué videos ya vio, para no repetirlos la próxima",
  "Cerrar run en el registro": "dejar anotado cómo le fue a la corrida",
  "Abrir run en el registro": "anotar que la corrida arrancó",
  "Leer Candidatos calificados": "buscar lo que el equipo ya calificó",
  "Registrar outputs (Supabase)": "mandar lo calificado a Históricos",
  "Destilar criterios": "aprender de los 🔥 para afinar los criterios de cada proyecto",
  "Apify — Perfiles semilla": "mirar las cuentas que ya seguís para buscar parecidas",
  "Apify — Lookalikes TikTok": "buscar cuentas parecidas en TikTok",
  "Vetting relevancia (Haiku)": "revisar una por una si las cuentas nuevas sirven",
  "POST Propuestos": "dejar las cuentas nuevas esperando tu aprobación",
};

// ── El veredicto ──────────────────────────────────────────────────────────────
//
// 🔑 **Determinístico y derivado de `metricas`, no generado.** El motor ya calcula `razon_faltante`
// con umbrales explícitos; un texto que se re-inventara en cada lectura podría contradecirlo, y una
// pantalla que dice "el gate estuvo bien" al lado de una regla que dice `gate` demasiado estricto
// es peor que una pantalla sin veredicto. El texto de la IA es OTRA cosa y va aparte
// (`veredictoIA`): se pide a mano, se guarda una vez, y compara contra la historia — que es
// justamente lo que una regla sobre una sola corrida no puede hacer.

export function veredicto(workflow: Workflow, corrida: Corrida): string[] {
  if (corrida.estado === "en_curso") return ["Todavía está corriendo."];
  if (!corrida.metricas) {
    return corrida.estado === "fallo"
      ? ["Se cayó antes de poder anotar lo que había hecho, así que de esta corrida solo queda el error."]
      : ["Esta corrida no dejó registro de lo que hizo."];
  }

  const frases: string[] = [];

  if (workflow === "motor") {
    const lineas = lineasPorProyecto(corrida);
    const entregados = num(corrida.metricas, "outputs") ?? 0;
    const pedidos = lineas.reduce((a, l) => a + l.pide, 0);
    if (pedidos > 0) frases.push(`Entregó ${entregados} de ${pedidos} pedidos.`);

    // El cuello se nombra midiendo, no opinando: si de los videos calientes se escuchó menos de la
    // mitad, el corte lo puso la transcripción y no el criterio — y la palanca es otra.
    const calientes = num(corrida.metricas, "filtrados");
    const escuchados = num(objeto(corrida.metricas, "llamadas"), "supadata");
    const vacias = num(corrida.metricas, "transcripciones_vacias") ?? 0;
    if (calientes !== null && escuchados !== null && calientes > 0 && escuchados / calientes < 0.5) {
      frases.push(
        `El cuello no fue el criterio: de ${calientes} videos calientes solo alcanzó a escuchar ${escuchados}` +
          (vacias > 0 ? `, y ${vacias} de esos volvieron sin audio.` : "."),
      );
    }

    const enCero = lineas.filter((l) => l.entrego === 0 && l.pide > 0);
    if (enCero.length > 0) {
      frases.push(
        enCero.length === 1
          ? `${enCero[0].nombre} quedó en cero.`
          : `Quedaron en cero: ${enCero.map((l) => l.nombre).join(", ")}.`,
      );
    }

    const mudas = cuentasSinAporte(corrida);
    if (mudas.length > 0) {
      frases.push(
        `${mudas.length} de las cuentas que miró no aportaron ni un video: conviene revisarlas.`,
      );
    }
  }

  if (workflow === "descubrimiento") {
    const propuestos = num(corrida.metricas, "propuestos") ?? 0;
    const promovidos = num(corrida.metricas, "promovidos") ?? 0;
    frases.push(`Te dejó ${propuestos} cuenta${propuestos === 1 ? "" : "s"} para aprobar.`);
    if (promovidos === 0 && propuestos > 0) {
      frases.push("Ninguna se sembró sola: todas esperan que alguien las mire.");
    }
  }

  if (workflow === "archivado") {
    const archivados = num(corrida.metricas, "archivados") ?? 0;
    frases.push(
      archivados === 0
        ? "No había nada calificado para archivar."
        : `Mandó ${archivados} video${archivados === 1 ? "" : "s"} a Históricos.`,
    );
  }

  if (workflow === "transcriptor") {
    const listos = num(corrida.metricas, "listos") ?? 0;
    const sin = num(corrida.metricas, "sin_transcript") ?? 0;
    const fallos = num(corrida.metricas, "fallos") ?? 0;
    frases.push(`Salieron ${listos} guion${listos === 1 ? "" : "es"}.`);
    if (sin > 0) frases.push(`${sin} no tenían transcripción disponible.`);
    if (fallos > 0) frases.push(`${fallos} fallaron.`);
  }

  frases.push(...avisosDe(corrida));
  return frases.length > 0 ? frases : ["Corrió sin nada para destacar."];
}

/** El texto que escribió la IA, si alguien ya lo pidió para esta corrida (se guarda en `metricas`). */
export const CLAVE_VEREDICTO_IA = "veredicto_ia";

export type VeredictoIA = { texto: string; cuando: string };

export function veredictoIA(corrida: Corrida): VeredictoIA | null {
  const v = objeto(corrida.metricas, CLAVE_VEREDICTO_IA);
  if (!v) return null;
  const texto = v["texto"];
  const cuando = v["cuando"];
  if (typeof texto !== "string" || texto.trim() === "") return null;
  return { texto, cuando: typeof cuando === "string" ? cuando : "" };
}

/**
 * Una corrida cerrada es la única a la que se le puede pedir veredicto.
 *
 * No es una restricción de producto sino la que hace que **no haya dos escritores sobre la misma
 * fila**: `metricas` la escribe n8n al cerrar, y guardar el veredicto es un read-modify-write sobre
 * ese mismo jsonb. Mientras la corrida esté viva, el que va a escribir es el motor.
 */
export function admiteVeredictoIA(corrida: Corrida): boolean {
  return corrida.estado !== "en_curso";
}

/** La línea de una corrida plegada: lo que entregó, en una frase corta. */
export function resumenCorto(workflow: Workflow, corrida: Corrida): string | null {
  const m = corrida.metricas;
  if (!m) return null;
  if (workflow === "motor") {
    const n = num(m, "outputs");
    return n === null ? null : `${n} al feed`;
  }
  if (workflow === "archivado") {
    const n = num(m, "archivados");
    return n === null ? null : `${n} archivados`;
  }
  if (workflow === "descubrimiento") {
    const n = num(m, "propuestos");
    return n === null ? null : `${n} propuestas`;
  }
  const n = num(m, "listos");
  return n === null ? null : `${n} guion${n === 1 ? "" : "es"}`;
}
