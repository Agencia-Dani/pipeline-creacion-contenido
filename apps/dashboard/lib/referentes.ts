import { z } from "zod";
import type { Registro } from "@/domain/run-plan";
import {
  aRegistrosDelPlan,
  conArroba,
  normalizarHandle,
  type DatosReferente,
  type Salud,
} from "@/domain/referentes";
import { createAdminClient } from "@/lib/supabase/admin";

// IO del banco de referentes (D5, corte 2/4). Lee y escribe `app.referentes` +
// `app.referentes_proyectos` (la relación N:M de ADR-032) con service_role: `app.*` tiene RLS
// sin policies, el browser no llega solo.
//
// Las dos formas que salen de acá son distintas a propósito:
//  · `leerBanco` habla en uuid — es para la pantalla, que edita.
//  · `leerReferentesComoRegistros` habla en record ids de Airtable — es para la fachada, porque
//    Proyectos TODAVÍA vive en Airtable (corte 4/4) y el motor cruza las dos listas por id.

const filaReferente = z.object({
  id: z.string(),
  airtable_id: z.string().nullable(),
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
});

export type Proyecto = { id: string; airtableId: string | null; nombre: string; vozId: string; activo: boolean };
export type ReferenteDelBanco = z.infer<typeof filaReferente> & { proyectoIds: string[]; salud: Salud };

const SIN_SALUD: Salud = { tasa_gate: null, tasa_aprobacion: null, videos_evaluados: null };

async function leerPares(): Promise<Map<string, string[]>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("referentes_proyectos")
    .select("referente_id, proyecto_id");
  if (error) throw new Error(`Supabase respondió con error leyendo los proyectos de cada referente: ${error.message}`);

  const pares = new Map<string, string[]>();
  for (const p of z.array(z.object({ referente_id: z.string(), proyecto_id: z.string() })).parse(data)) {
    pares.set(p.referente_id, [...(pares.get(p.referente_id) ?? []), p.proyecto_id]);
  }
  return pares;
}

export async function leerProyectos(): Promise<Proyecto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("proyectos")
    .select("id, airtable_id, nombre, voz_id, activo")
    .order("nombre");
  if (error) throw new Error(`Supabase respondió con error leyendo proyectos: ${error.message}`);
  return z
    .array(z.object({ id: z.string(), airtable_id: z.string().nullable(), nombre: z.string(), voz_id: z.string(), activo: z.boolean() }))
    .parse(data)
    .map((p) => ({ id: p.id, airtableId: p.airtable_id, nombre: p.nombre, vozId: p.voz_id, activo: p.activo }));
}

/** El banco completo con sus proyectos y su salud: lo que la pantalla necesita, en una pasada. */
export async function leerBanco(): Promise<ReferenteDelBanco[]> {
  const supabase = createAdminClient();
  const [referentes, pares, salud] = await Promise.all([
    supabase.schema("app").from("referentes").select("id, airtable_id, handle, plataforma, activo, notas").order("handle"),
    leerPares(),
    supabase.schema("app").from("v_salud_referentes").select("id, videos_evaluados, tasa_gate, tasa_aprobacion"),
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
 * Postgres → la forma del contrato (core/contracts/run-plan.md).
 *
 * Dos traducciones que NO son cosméticas mientras dure la coexistencia:
 *  · **`id` = el record id de Airtable** cuando lo hay. A diferencia de `ajustes`, acá el `id`
 *    SÍ lo consume alguien: `Computar salud referentes` del archivado lo usa para PATCHear
 *    Airtable. Un referente nacido en la app no tiene, y viaja con su uuid — ese PATCH escribe
 *    sobre una tabla ya congelada y es fail-open, así que el peor caso es un batch descartado
 *    en un lugar que nadie lee. El nodo muere en D7.
 *  · **`fields.proyecto` = record ids de Airtable de los proyectos.** El motor cruza
 *    `referentes[].fields.proyecto` contra `proyectos[].id`, y Proyectos sale de Airtable hasta
 *    el corte 4/4. Cuando Proyectos corte, esta traducción se cae sola (los dos lados pasan a
 *    ser uuid) — es la última costura de este corte.
 */
export async function leerReferentesComoRegistros(ambito: "motor" | "completo"): Promise<Registro[]> {
  const [banco, proyectos] = await Promise.all([leerBanco(), leerProyectos()]);
  return aRegistrosDelPlan(banco, new Map(proyectos.map((p) => [p.id, p.airtableId])), ambito);
}

// ── Escritura ────────────────────────────────────────────────────────────────

/** Los proyectos de un referente se reemplazan enteros: es un conjunto, no un acumulado. */
async function fijarProyectos(referenteId: string, proyectoIds: string[]): Promise<void> {
  const supabase = createAdminClient();
  const { error: errorBorrado } = await supabase
    .schema("app")
    .from("referentes_proyectos")
    .delete()
    .eq("referente_id", referenteId);
  if (errorBorrado) throw new Error(`No se pudieron limpiar los proyectos: ${errorBorrado.message}`);

  const { error } = await supabase
    .schema("app")
    .from("referentes_proyectos")
    .insert(proyectoIds.map((proyecto_id) => ({ referente_id: referenteId, proyecto_id })));
  if (error) throw new Error(`No se pudieron guardar los proyectos: ${error.message}`);
}

export async function actualizarReferente(id: string, datos: DatosReferente): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("referentes")
    .update({
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

  await fijarProyectos(id, datos.proyectoIds);
}

/** Devuelve el uuid del referente nuevo. Sin `airtable_id`: nació acá (ADR-027 — Postgres es el dueño). */
export async function crearReferente(datos: DatosReferente): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("referentes")
    .insert({
      handle: conArroba(datos.handle),
      plataforma: datos.plataforma,
      activo: datos.activo,
      notas: datos.notas,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando el referente: ${error.message}`);

  await fijarProyectos(data.id, datos.proyectoIds);
  return data.id;
}

/**
 * ¿Ya está esta cuenta en el banco? El handle es la clave con la que el motor pide videos y con
 * la que la salud se atribuye, así que dos filas para la misma cuenta parten su historia en dos
 * y le piden a Apify lo mismo dos veces. En Airtable pasó (hay un `@casper_smc` duplicado).
 */
export async function buscarPorHandle(handle: string, plataforma: string): Promise<ReferenteDelBanco | null> {
  const banco = await leerBanco();
  return banco.find((r) => normalizarHandle(r.handle) === handle && r.plataforma === plataforma) ?? null;
}
