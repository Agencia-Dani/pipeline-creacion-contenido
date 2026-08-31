import { z } from "zod";
import {
  CLAVE_VEREDICTO_IA,
  WORKFLOWS,
  ejecucionN8n,
  type Corrida,
  type Workflow,
} from "@/domain/corrida";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

const filaRun = z.object({
  id: z.string(),
  inicio: z.string(),
  fin: z.string().nullable(),
  estado: z.enum(["en_curso", "ok", "fallo", "parcial"]),
  trigger_type: z.string(),
  metricas: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  params: z.record(z.string(), z.unknown()).nullable(),
});

// Las columnas de una corrida. Una sola constante porque desde la pantalla de detalle hay **tres**
// lectores (`ultimasCorridasMotor`, `corridasDe`, `leerCorrida`) y los tres tienen que traer
// `params`: sin él no se sabe de qué máquina es la fila ni cuál ejecución de n8n la produjo.
const COLUMNAS_RUN = "id, inicio, fin, estado, trigger_type, metricas, error, params";

// Últimas corridas del motor. Mismo discriminador que usa el archivado para
// leer runs del motor (`params->>workflow = 'motor'`, dev-doc nodo 17b).
//
// El filtro por instancia lo pone `scoped`: con dos empresas, "las últimas corridas" son las de
// ESTE cockpit. Sin eso, Operar mostraría la corrida de otra empresa como si fuera propia.
export async function ultimasCorridasMotor(ctx: TenantContext, limite = 5): Promise<Corrida[]> {
  const { data, error } = await (await scoped(ctx))
    .select("public.runs", COLUMNAS_RUN)
    .eq("params->>workflow", "motor")
    .order("inicio", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Supabase respondió con error leyendo runs: ${error.message}`);
  return z.array(filaRun).parse(data);
}

// ── El run del transcriptor (ADR-062 §3) ─────────────────────────────────────
//
// 🔑 **El cockpit escribe `runs`, y hasta ADR-062 eso solo lo hacía n8n.** No es una concesión: es
// lo que hace que el transcriptor exista para el resto del sistema. `outputs.run_id` es `not null`,
// así que sin una corrida propia sus guiones no pueden entrar al histórico — y aflojar ese not-null
// habría hecho que esas filas desaparecieran de toda vista que hace `join runs`, en silencio.
//
// El efecto de arrastre que nadie pidió y conviene tener: `v_costos_semana` agrupa por
// `params->>workflow`, así que **el gasto en Supadata del transcriptor se vuelve visible** en
// Entender. Hoy son ~58 pedidos que no aparecen en ningún lado.
//
// `trigger_type: 'manual'` y `params.workflow: 'transcriptor'` — los dos valores ya existían (el
// check de `trigger_type` los acepta desde la `001`, y el catálogo de `params.workflow` nunca tuvo
// check), así que esto no pide migración.

/** Abre la corrida de una tanda de enlaces pegados. Devuelve su id, o null si no se pudo. */
export async function abrirRunTranscriptor(ctx: TenantContext): Promise<string | null> {
  const { data, error } = await (await scoped(ctx))
    .insert("public.runs", [
      { estado: "en_curso", trigger_type: "manual", params: { workflow: "transcriptor" } },
    ])
    .select("id");

  if (error) {
    // Sumidero, igual que el registro de n8n (invariante #1 de PLAN §2.5): si no se puede abrir la
    // corrida, la tanda se transcribe igual y lo único que se pierde es que sus guiones entren al
    // histórico. Convertir el registro en dependencia de ejecución sería el error que ese
    // invariante existe para evitar.
    console.error("[transcriptor] no se pudo abrir el run:", error.message);
    return null;
  }
  return z.array(z.object({ id: z.string() })).parse(data)[0]?.id ?? null;
}

/** Cierra la corrida con lo que produjo. Best-effort por la misma razón que la apertura. */
export async function cerrarRunTranscriptor(
  ctx: TenantContext,
  runId: string,
  metricas: { pedidos: number; listos: number; sin_transcript: number; fallos: number },
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .update("public.runs", { estado: "ok", fin: new Date().toISOString(), metricas })
    .eq("id", runId);
  if (error) console.error("[transcriptor] no se pudo cerrar el run:", error.message);
}

/**
 * Marca como `fallo` los runs del transcriptor que quedaron `en_curso` para siempre.
 *
 * 🩸 **El agujero que tapa, y es de ADR-062:** `procesarPendientes` abre el run al empezar y lo
 * cierra al final. Si la pasada muere en el medio —la función de Vercel se corta a los 60 s, o la
 * persona cierra la pestaña— el cierre **nunca corre** y el run queda `en_curso` de por vida. Medido
 * en prod el 2026-08-07, a la hora de deployar: **5 de 10 runs quedaron colgados**. No rompe nada
 * (nadie los lee todavía), pero ensucia Operar y hace contar mal a la primera métrica que los mire.
 *
 * Es el mismo barrido que el nodo `Barrer runs zombie` del motor, con su misma forma (`fallo` + `fin`
 * + un `error` que dice por qué), y corre **antes** de abrir el run nuevo por la misma razón que
 * allá: el barrido no puede depender de la corrida que está por empezar.
 *
 * ⏱️ **La ventana es fija y no un knob**, al revés que la del motor. Ahí es config porque una
 * corrida puede durar de minutos a media hora; acá el techo es el `maxDuration = 60` de la zona, o
 * sea que una pasada no puede pasar de 60 segundos ni queriendo. **5 minutos es 5× ese techo**: un
 * run más viejo está muerto, no lento. Un ajuste por instancia para esto sería una perilla que nadie
 * va a mover y una fila más en `app.ajustes` por cockpit.
 */
const ZOMBIE_TRANSCRIPTOR_MS = 5 * 60_000;

export async function barrerRunsZombieTranscriptor(ctx: TenantContext): Promise<void> {
  const limite = new Date(Date.now() - ZOMBIE_TRANSCRIPTOR_MS).toISOString();

  const { error } = await (await scoped(ctx))
    .update("public.runs", {
      estado: "fallo",
      fin: new Date().toISOString(),
      error: "pasada del transcriptor sin cerrar (la función se cortó o cerraron la pestaña); barrida por una posterior",
    })
    .eq("params->>workflow", "transcriptor")
    .eq("estado", "en_curso")
    .lt("inicio", limite);

  // Sumidero como el resto del registro: si el barrido falla, la tanda se transcribe igual.
  if (error) console.error("[transcriptor] no se pudieron barrer los runs zombie:", error.message);
}

// ── La pantalla de detalle (`operar/corridas`) ────────────────────────────────
//
// 🔑 **Tres lectores y no uno solo con parámetros**, porque las tres preguntas son distintas: la
// card de Operar quiere las últimas del motor, la pantalla quiere una página de UNA máquina, y el
// veredicto quiere UNA corrida por id. Meterlas en una función con banderas habría hecho que el
// llamador tenga que saber qué combinación es válida.

/** Cuántas corridas trae de una la pantalla. El "ver más" pide de a otro tanto. */
export const CORRIDAS_POR_PAGINA = 20;

/**
 * Una página de corridas de UNA máquina, la más nueva primero.
 *
 * ⚠️ **`offset` y no keyset, y eso es una decisión con condición.** El feed tiene prohibido
 * `offset` porque ahí se edita mientras se recorre: cada tarjeta calificada sale del conjunto
 * filtrado y un `offset 25` se saltearía tantas como calificaciones hubo (`domain/feed.ts`). Acá no
 * se edita nada —una corrida vieja es inmutable— así que `offset` es seguro, igual que en
 * `curar/historicos`. Si algún día esta pantalla gana un filtro que dependa de algo mutable, la
 * excepción se cae y hay que volver a keyset.
 *
 * 📏 El volumen medido el 2026-08-31 dice que esto alcanza de sobra: **84 corridas en 2 meses**
 * entre las cuatro máquinas (motor 40, transcriptor 24, archivado 16, descubrimiento 4), o sea
 * ~10 por mes en el tab más cargado.
 */
export async function corridasDe(
  ctx: TenantContext,
  workflow: Workflow,
  cuantas = CORRIDAS_POR_PAGINA,
  saltear = 0,
): Promise<Corrida[]> {
  const { data, error } = await (await scoped(ctx))
    .select("public.runs", COLUMNAS_RUN)
    .eq("params->>workflow", workflow)
    .order("inicio", { ascending: false })
    .range(saltear, saltear + cuantas - 1);
  if (error) throw new Error(`Supabase respondió con error leyendo corridas: ${error.message}`);
  return z.array(filaRun).parse(data ?? []);
}

/**
 * Cuántas corridas tiene cada máquina y cuántas le fallaron: los números de los tabs.
 *
 * Son `head` counts (dos por máquina, ocho en total, sin traer una sola fila) y no un `group by`,
 * porque PostgREST no expone agregaciones sin una vista — y crear una vista para pintar ocho
 * números sería una migración, o sea `core/` y un ADR, para algo que no lo necesita.
 *
 * **Es sumidero**: si un conteo falla, ese tab muestra su nombre sin número. Un contador roto no
 * puede impedir leer los logs, que es a lo que la pantalla existe.
 */
export async function contarCorridas(
  ctx: TenantContext,
): Promise<Record<Workflow, { total: number; fallos: number }>> {
  const s = await scoped(ctx);
  const contar = async (workflow: Workflow, soloFallos: boolean): Promise<number> => {
    try {
      let q = s
        .select("public.runs", "id", { count: "exact", head: true })
        .eq("params->>workflow", workflow);
      if (soloFallos) q = q.eq("estado", "fallo");
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    } catch (e) {
      console.error(`[corridas] no se pudo contar ${workflow}:`, e);
      return 0;
    }
  };
  const pares = await Promise.all(
    WORKFLOWS.map(async (w) => [w, { total: await contar(w, false), fallos: await contar(w, true) }] as const),
  );
  return Object.fromEntries(pares) as Record<Workflow, { total: number; fallos: number }>;
}

/** Una corrida por id, del cockpit abierto. `null` si no existe o no es suya. */
export async function leerCorrida(ctx: TenantContext, id: string): Promise<Corrida | null> {
  const { data, error } = await (await scoped(ctx))
    .select("public.runs", COLUMNAS_RUN)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`Supabase respondió con error leyendo la corrida: ${error.message}`);
  return z.array(filaRun).parse(data ?? [])[0] ?? null;
}

/**
 * Qué dejó una corrida **contando las filas que escribió**, en vez de leer lo que dijo de sí misma.
 *
 * 🩸 **Existe por un hecho medido y no por completitud: las 12 corridas fallidas de prod tienen
 * `metricas` en NULL, las 12.** `Resumen del run` es el último nodo del motor, así que una corrida
 * que muere antes no deja ni un contador — y la pantalla se quedaría diciendo "no se sabe" sobre
 * una corrida que igual alcanzó a dejar candidatos en el feed.
 *
 * El `run_id` de `app.candidatos` es de ADR-081 y es lo que hace esto posible: sin esa columna, la
 * única forma de atribuir un candidato a su corrida era la ventana de tiempo, y eso ya se descartó
 * midiendo (el 40% de los candidatos vivos cae fuera de toda ventana).
 *
 * ⚠️ **Solo cuenta lo que sigue vivo.** Un candidato archivado se borra (ADR-036), así que en una
 * corrida vieja este número baja con el tiempo: dice *"quedan N de esa corrida"*, no *"entregó N"*.
 * Para eso está `metricas.outputs`, y por eso la pantalla lo usa solo cuando no hay métricas.
 */
export async function loQueDejoVivo(ctx: TenantContext, runId: string): Promise<number | null> {
  try {
    const { count, error } = await (await scoped(ctx))
      .select("app.candidatos", "id", { count: "exact", head: true })
      .eq("run_id", runId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (e) {
    console.error("[corridas] no se pudo contar lo que dejó la corrida:", e);
    return null;
  }
}

/**
 * Guarda el veredicto de la IA **adentro de `metricas`**, que es jsonb: cero migración.
 *
 * 🔒 **Read-modify-write, y por eso solo se permite sobre una corrida cerrada** (`admiteVeredictoIA`):
 * `metricas` la escribe n8n al cerrar el run, así que mientras la corrida esté viva hay otro
 * escritor y esto le pisaría el embudo entero. Con la corrida cerrada, n8n ya no la vuelve a tocar.
 *
 * Devuelve `false` en vez de tirar: no poder guardar el texto no puede romper la pantalla que lo
 * pidió — se muestra igual, solo que habrá que pagarlo de nuevo la próxima.
 */
export async function guardarVeredictoIA(
  ctx: TenantContext,
  runId: string,
  texto: string,
): Promise<boolean> {
  try {
    const corrida = await leerCorrida(ctx, runId);
    if (!corrida) return false;
    const metricas = {
      ...(corrida.metricas ?? {}),
      [CLAVE_VEREDICTO_IA]: { texto, cuando: new Date().toISOString() },
    };
    const { error } = await (await scoped(ctx))
      .update("public.runs", { metricas })
      .eq("id", runId);
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error("[corridas] no se pudo guardar el veredicto de la IA:", e);
    return false;
  }
}

// ── El enlace a la ejecución de n8n ───────────────────────────────────────────
//
// 🔒 **Se calcula en el servidor y solo para `dev`.** El equipo de redes no tiene cuenta en n8n, así
// que para ellos el link es una puerta cerrada: se ve, se aprieta, y pide un login que no tienen.
// Un link muerto es peor que ningún link. Mismo criterio que `veCostos` en `domain/roles.ts` — lo
// que separa no es la zona sino de quién es la herramienta.
//
// ⚠️ **Si las env vars no están, no hay link y no hay error.** `N8N_BASE_URL` y `N8N_WF_<MÁQUINA>`
// viven hoy en el `.env` de la raíz (los usan los scripts de `core/`) y no en Vercel, así que en
// producción esto arranca apagado hasta que alguien las cargue. Lo que **sí** funciona sin ninguna
// env var es el link de un fallo: el error handler lo escribe pegado al mensaje (ADR-054), así que
// justo el caso donde más se necesita no depende de configurar nada.
const ID_DE_WORKFLOW: Record<Workflow, string | undefined> = {
  motor: process.env.N8N_WF_MOTOR,
  archivado: process.env.N8N_WF_ARCHIVADO,
  descubrimiento: process.env.N8N_WF_DESCUBRIMIENTO,
  // El transcriptor no es un workflow de n8n: corre en el propio cockpit (ADR-062), así que no hay
  // ejecución que abrir. `undefined` acá no es un olvido, es que no existe.
  transcriptor: undefined,
};

/** `runId` → URL de su ejecución en n8n. Vacío si no es dev o si falta configuración. */
export function enlacesN8n(
  workflow: Workflow,
  corridas: readonly Corrida[],
  esDev: boolean,
): Record<string, string> {
  if (!esDev) return {};
  const enlaces: Record<string, string> = {};
  const base = process.env.N8N_BASE_URL?.replace(/\/+$/, "");
  const wf = ID_DE_WORKFLOW[workflow];
  for (const c of corridas) {
    // El del fallo gana: viene del propio error handler y no depende de ninguna env var.
    const delError = /(https?:\/\/\S+)/.exec(c.error ?? "")?.[1];
    if (delError) {
      enlaces[c.id] = delError;
      continue;
    }
    const ejecucion = ejecucionN8n(c);
    if (base && wf && ejecucion) {
      enlaces[c.id] = `${base}/workflow/${wf}/executions/${ejecucion}`;
    }
  }
  return enlaces;
}
