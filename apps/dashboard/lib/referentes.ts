import { z } from "zod";
import type { Registro } from "@/domain/run-plan";
import {
  aRegistrosDelPlan,
  conArroba,
  normalizarHandle,
  type DatosReferente,
  type Salud,
} from "@/domain/referentes";
import type { TenantContext } from "@/domain/tenant";
import { leerProyectos as leerProyectosDePostgres } from "@/lib/proyectos";
import { scoped } from "@/lib/supabase/scoped";

// IO del banco de referentes (D5, corte 2/4). Lee y escribe `app.referentes` +
// `app.referentes_proyectos` (la relación N:M de ADR-032) con service_role: `app.*` tiene RLS
// sin policies, el browser no llega solo.
//
// Las dos formas que salían de acá —una en uuid para la pantalla, otra en record ids de Airtable
// para la fachada— son una sola desde el paso 3 de D7: todo habla uuid.

const filaReferente = z.object({
  id: z.string(),
  handle: z.string(),
  plataforma: z.string(),
  activo: z.boolean(),
  notas: z.string().nullable(),
});

const filaSalud = z.object({
  id: z.string(),
  videos_evaluados: z.coerce.number().nullable(),
  tasa_gate: z.coerce.number().nullable(),
  tasa_aprobacion: z.coerce.number().nullable(),
  seguidores: z.coerce.number().nullable(), // migración `014` (ADR-041)
});

export type Proyecto = { id: string; nombre: string; vozId: string; activo: boolean };
export type ReferenteDelBanco = z.infer<typeof filaReferente> & { proyectoIds: string[]; salud: Salud };

/** La proyección que la pantalla de referentes necesita: el picker de proyectos y su voz. */
export async function leerProyectos(ctx: TenantContext): Promise<Proyecto[]> {
  return (await leerProyectosDePostgres(ctx)).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    vozId: p.voz_id,
    activo: p.activo,
  }));
}

const SIN_SALUD: Salud = {
  tasa_gate: null,
  tasa_aprobacion: null,
  videos_evaluados: null,
  seguidores: null,
};

// La puente no lleva columna de tenant: hereda por FK (ADR-046). Trae los pares de todos los
// tenants y el cruce lo hace `leerBanco` contra SU banco, que sí viene scopeado — un par de otra
// empresa no tiene con qué engancharse.
async function leerPares(ctx: TenantContext): Promise<Map<string, string[]>> {
  const { data, error } = await (await scoped(ctx))
    .select("app.referentes_proyectos", "referente_id, proyecto_id");
  if (error) throw new Error(`Supabase respondió con error leyendo los proyectos de cada referente: ${error.message}`);

  const pares = new Map<string, string[]>();
  for (const p of z.array(z.object({ referente_id: z.string(), proyecto_id: z.string() })).parse(data)) {
    pares.set(p.referente_id, [...(pares.get(p.referente_id) ?? []), p.proyecto_id]);
  }
  return pares;
}

/** El banco completo con sus proyectos y su salud: lo que la pantalla necesita, en una pasada. */
export async function leerBanco(ctx: TenantContext): Promise<ReferenteDelBanco[]> {
  // El acceso se pide UNA vez y se reusa: dentro del `Promise.all` un `await` por elemento
  // serializa la construcción del cliente antes de que arranque nada, y de paso hace que el
  // paralelismo real de las 3 lecturas se vuelva difícil de leer.
  const acceso = await scoped(ctx);
  const [referentes, pares, salud] = await Promise.all([
    acceso.select("app.referentes", "id, handle, plataforma, activo, notas").order("handle"),
    leerPares(ctx),
    acceso.select("app.v_salud_referentes", "id, videos_evaluados, tasa_gate, tasa_aprobacion, seguidores"),
  ]);
  if (referentes.error) throw new Error(`Supabase respondió con error leyendo referentes: ${referentes.error.message}`);
  if (salud.error) throw new Error(`Supabase respondió con error leyendo la salud: ${salud.error.message}`);

  const saludPorId = new Map(z.array(filaSalud).parse(salud.data).map((s) => [s.id, s]));

  return z.array(filaReferente).parse(referentes.data).map((r) => ({
    ...r,
    proyectoIds: pares.get(r.id) ?? [],
    salud: saludPorId.get(r.id) ?? SIN_SALUD,
  }));
}

/**
 * Cuántas cuentas **prendidas** alimenta cada proyecto, por id.
 *
 * Lo consume Operar: es la palanca de la que depende que un proyecto llegue a su número. Un
 * proyecto con 3 cuentas no puede entregar 15 videos nuevos por semana por más que los pida, y
 * sin este dato la pantalla no tendría cómo decir qué hacer al respecto.
 *
 * Cuenta solo las activas a propósito: una cuenta apagada no le pide nada a Apify, así que
 * contarla haría parecer que hay fuente donde no la hay.
 */
export async function cuentasPorProyecto(ctx: TenantContext): Promise<Map<string, number>> {
  const cuentas = new Map<string, number>();
  for (const referente of await leerBanco(ctx)) {
    if (!referente.activo) continue;
    for (const proyectoId of referente.proyectoIds) {
      cuentas.set(proyectoId, (cuentas.get(proyectoId) ?? 0) + 1);
    }
  }
  return cuentas;
}

/**
 * Postgres → la forma del contrato (core/contracts/run-plan.md). Sin traducciones desde el paso 3
 * de D7: se leía Proyectos acá solo para mapear cada uuid a su record id de Airtable, y ahora el
 * contrato habla uuid de punta a punta.
 */
export async function leerReferentesComoRegistros(
  ctx: TenantContext,
  ambito: "motor" | "completo",
): Promise<Registro[]> {
  return aRegistrosDelPlan(await leerBanco(ctx), ambito);
}

// ── Escritura ────────────────────────────────────────────────────────────────

/** Los proyectos de un referente se reemplazan enteros: es un conjunto, no un acumulado. */
async function fijarProyectos(
  ctx: TenantContext,
  referenteId: string,
  proyectoIds: string[],
): Promise<void> {
  const acceso = await scoped(ctx);
  const { error: errorBorrado } = await acceso
    .borrar("app.referentes_proyectos")
    .eq("referente_id", referenteId);
  if (errorBorrado) throw new Error(`No se pudieron limpiar los proyectos: ${errorBorrado.message}`);

  const { error } = await acceso.insert(
    "app.referentes_proyectos",
    proyectoIds.map((proyecto_id) => ({ referente_id: referenteId, proyecto_id })),
  );
  if (error) throw new Error(`No se pudieron guardar los proyectos: ${error.message}`);
}

export async function actualizarReferente(
  ctx: TenantContext,
  id: string,
  datos: DatosReferente,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.referentes", {
      handle: conArroba(datos.handle),
      plataforma: datos.plataforma,
      activo: datos.activo,
      notas: datos.notas,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el referente: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese referente ya no existe.");

  await fijarProyectos(ctx, id, datos.proyectoIds);
}

/** Devuelve el uuid del referente nuevo. Sin `airtable_id`: nació acá (ADR-027 — Postgres es el dueño). */
export async function crearReferente(ctx: TenantContext, datos: DatosReferente): Promise<string> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.referentes", [
      {
        handle: conArroba(datos.handle),
        plataforma: datos.plataforma,
        activo: datos.activo,
        notas: datos.notas,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando el referente: ${error.message}`);

  await fijarProyectos(ctx, data.id, datos.proyectoIds);
  return data.id;
}

/**
 * ¿Ya está esta cuenta en el banco? El handle es la clave con la que el motor pide videos y con
 * la que la salud se atribuye, así que dos filas para la misma cuenta parten su historia en dos
 * y le piden a Apify lo mismo dos veces. En Airtable pasó (hay un `@casper_smc` duplicado).
 */
export async function buscarPorHandle(
  ctx: TenantContext,
  handle: string,
  plataforma: string,
): Promise<ReferenteDelBanco | null> {
  const banco = await leerBanco(ctx);
  return banco.find((r) => normalizarHandle(r.handle) === handle && r.plataforma === plataforma) ?? null;
}

/**
 * Sacar una cuenta del banco de verdad, no apagarla.
 *
 * A diferencia de voces y proyectos, acá no hay nada que preguntar antes (ver `domain/borrado.ts`):
 * `referentes_proyectos` cascadea —es la asignación, no historia— y la historia de la cuenta se
 * guarda por HANDLE en texto (`candidatos.referente`, `descartes.referente`, y de ahí sale
 * `v_senal_seleccion`), no por FK. O sea que borrar la fila saca la cuenta de las próximas corridas
 * y del banco, y deja intacto todo lo que trajo. Si mañana se vuelve a agregar el mismo handle, la
 * salud y la señal de selección vuelven solas.
 *
 * Apagar sigue siendo lo correcto para "no la busques más pero quiero seguir viéndola"; borrar es
 * para la fila que no debería existir: la repetida, la que se cargó con un typo.
 */
export async function borrarReferente(ctx: TenantContext, id: string): Promise<void> {
  const { data, error } = await (await scoped(ctx)).borrar("app.referentes").eq("id", id).select("id");
  if (error) throw new Error(`Supabase respondió con error borrando el referente: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese referente ya no existe.");
}
