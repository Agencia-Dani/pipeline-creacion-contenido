import { z } from "zod";
import type { Registro } from "@/domain/run-plan";
import {
  aRegistrosDeProyectos,
  aRegistrosDeVoces,
  type DatosProyecto,
  type DatosVoz,
  type ProyectoGuardado,
  type VozGuardada,
} from "@/domain/proyectos";
import { crearRegistro, leerCriteriosDestilados } from "@/lib/airtable";
import { createAdminClient } from "@/lib/supabase/admin";

// IO de voces y proyectos (D5, corte 3/4). Lee y escribe `app.voces` + `app.proyectos` con
// service_role: `app.*` tiene RLS sin policies, el browser no llega solo.
//
// Igual que en Referentes, salen dos formas distintas a propósito:
//  · `leerVoces` / `leerProyectos` hablan en uuid — son para la pantalla, que edita.
//  · `leer*ComoRegistros` hablan en record ids de Airtable — son para la fachada, porque el
//    motor todavía escribe Candidatos y Descartes como links de Airtable (ADR-033 §3).

const filaVoz = z.object({
  id: z.string(),
  airtable_id: z.string().nullable(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  criterios_relevancia: z.string().nullable(),
  activo: z.boolean(),
});

const filaProyecto = z.object({
  id: z.string(),
  airtable_id: z.string().nullable(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  criterios_relevancia: z.string(),
  criterios_aprendidos: z.string().nullable(),
  advertencia_criterios: z.string().nullable(),
  voz_id: z.string(),
  activo: z.boolean(),
  n: z.coerce.number().nullable(),
});

const COLUMNAS_VOZ = "id, airtable_id, nombre, descripcion, criterios_relevancia, activo";
const COLUMNAS_PROYECTO =
  "id, airtable_id, nombre, descripcion, criterios_relevancia, criterios_aprendidos, advertencia_criterios, voz_id, activo, n";

export async function leerVoces(): Promise<VozGuardada[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.schema("app").from("voces").select(COLUMNAS_VOZ).order("nombre");
  if (error) throw new Error(`Supabase respondió con error leyendo voces: ${error.message}`);
  return z.array(filaVoz).parse(data);
}

export async function leerProyectos(): Promise<ProyectoGuardado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.schema("app").from("proyectos").select(COLUMNAS_PROYECTO).order("nombre");
  if (error) throw new Error(`Supabase respondió con error leyendo proyectos: ${error.message}`);
  return z.array(filaProyecto).parse(data);
}

/**
 * Lo que la pantalla muestra: las voces con sus proyectos y, en cada proyecto, lo que la máquina
 * aprendió y la advertencia que escribió. Esos dos vienen de Airtable mientras el archivado siga
 * siendo su escritor (ADR-033) — la pantalla no tiene por qué saberlo, así que se mezclan acá.
 */
export async function leerVocesConProyectos(): Promise<
  (VozGuardada & { proyectos: ProyectoGuardado[] })[]
> {
  const [voces, proyectos, destilados] = await Promise.all([
    leerVoces(),
    leerProyectos(),
    leerCriteriosDestilados(),
  ]);
  return voces.map((v) => ({
    ...v,
    proyectos: proyectos
      .filter((p) => p.voz_id === v.id)
      .map((p) => ({
        ...p,
        criterios_aprendidos: destilados.get(p.airtable_id ?? "")?.criterios_aprendidos ?? null,
        advertencia_criterios: destilados.get(p.airtable_id ?? "")?.advertencia_criterios ?? null,
      })),
  }));
}

export async function leerVocesComoRegistros(ambito: "motor" | "completo"): Promise<Registro[]> {
  return aRegistrosDeVoces(await leerVoces(), ambito);
}

export async function leerProyectosComoRegistros(ambito: "motor" | "completo"): Promise<Registro[]> {
  const [proyectos, voces, destilados] = await Promise.all([
    leerProyectos(),
    leerVoces(),
    leerCriteriosDestilados(),
  ]);
  return aRegistrosDeProyectos(proyectos, new Map(voces.map((v) => [v.id, v.airtable_id])), destilados, ambito);
}

// ── Escritura ────────────────────────────────────────────────────────────────

export async function actualizarVoz(id: string, datos: DatosVoz): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("voces")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      criterios_relevancia: datos.criterios_relevancia,
      activo: datos.activo,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando la voz: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Esa voz ya no existe.");
}

export async function actualizarProyecto(id: string, datos: DatosProyecto): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("proyectos")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      criterios_relevancia: datos.criterios_relevancia,
      voz_id: datos.vozId,
      activo: datos.activo,
      n: datos.n,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el proyecto: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese proyecto ya no existe.");
}

/**
 * El alta acuña primero el record id en Airtable y recién después escribe en Postgres.
 *
 * Por qué ese orden y no al revés: si Airtable falla, no queda nada creado (y el equipo reintenta);
 * si fallara Postgres después, queda una fila huérfana en una tabla que ya nadie mira. El error
 * caro es el opuesto — un proyecto vivo en la app SIN record id hace que el motor escriba sus
 * candidatos con `typecast` y un uuid, y Airtable no falla: **inventa un proyecto fantasma**
 * (ADR-033 §3). La llamada a Airtable se borra en D7, no la fila de Postgres.
 */
export async function crearVoz(datos: DatosVoz): Promise<string> {
  const airtableId = await crearRegistro("Voces", { nombre: datos.nombre });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("voces")
    .insert({
      airtable_id: airtableId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      criterios_relevancia: datos.criterios_relevancia,
      activo: datos.activo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando la voz: ${error.message}`);
  return data.id;
}

export async function crearProyecto(datos: DatosProyecto, airtableVozId: string | null): Promise<string> {
  // El link a la voz viaja solo si la voz tiene record id. Una voz nacida en la app y un
  // proyecto nacido en la app comparten el problema y la solución: los dos acuñan el suyo.
  const airtableId = await crearRegistro("Proyectos", {
    nombre: datos.nombre,
    ...(airtableVozId ? { voz_default: [airtableVozId] } : {}),
  });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("proyectos")
    .insert({
      airtable_id: airtableId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      criterios_relevancia: datos.criterios_relevancia,
      voz_id: datos.vozId,
      activo: datos.activo,
      n: datos.n,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando el proyecto: ${error.message}`);
  return data.id;
}
