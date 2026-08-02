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
import { createAdminClient } from "@/lib/supabase/admin";

// IO de voces y proyectos. Lee y escribe `app.voces` + `app.proyectos` con service_role: `app.*`
// tiene RLS sin policies, el browser no llega solo.
//
// Con D7 este archivo dejó de hablar dos idiomas. Ya no acuña record ids en Airtable al crear
// (el motor escribe FKs uuid, no links con `typecast`) y ya no va a buscar los criterios
// destilados afuera: los escribe el archivado por PostgREST, en la misma fila. **ADR-033 se
// cumplió entera y murió** — era la regla que sostenía la coexistencia, con fecha de vencimiento
// puesta en D7.
//
// Y con el paso 3 del corte dejó de hablar el idioma viejo del todo: la fachada sirve el uuid
// como `id` (ver `domain/proyectos.ts::aRegistrosDeVoces`), así que estas lecturas ya no traen
// `airtable_id`. La columna sigue en la tabla —es la traza al export de Airtable y la usa
// `scripts/cortar-feed.ts`, la evidencia del corte— y se cae con la limpieza de D8.

const filaVoz = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  criterios_relevancia: z.string(), // not null desde la `014` (ADR-040)
  activo: z.boolean(),
});

const filaProyecto = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  criterios_relevancia: z.string(),
  criterios_aprendidos: z.string().nullable(),
  advertencia_criterios: z.string().nullable(),
  voz_id: z.string(),
  activo: z.boolean(),
  n: z.coerce.number().nullable(),
});

const COLUMNAS_VOZ = "id, nombre, descripcion, criterios_relevancia, activo";
const COLUMNAS_PROYECTO =
  "id, nombre, descripcion, criterios_relevancia, criterios_aprendidos, advertencia_criterios, voz_id, activo, n";

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
 * aprendió y la advertencia que escribió. Desde D7 sale todo de la misma fila — antes había que
 * ir a buscar esos dos campos a Airtable y pisarlos acá (ADR-033).
 */
export async function leerVocesConProyectos(): Promise<
  (VozGuardada & { proyectos: ProyectoGuardado[] })[]
> {
  const [voces, proyectos] = await Promise.all([leerVoces(), leerProyectos()]);
  return voces.map((v) => ({
    ...v,
    proyectos: proyectos.filter((p) => p.voz_id === v.id),
  }));
}

export async function leerVocesComoRegistros(ambito: "motor" | "completo"): Promise<Registro[]> {
  return aRegistrosDeVoces(await leerVoces(), ambito);
}

export async function leerProyectosComoRegistros(ambito: "motor" | "completo"): Promise<Registro[]> {
  return aRegistrosDeProyectos(await leerProyectos(), ambito);
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
 * El alta escribe en Postgres y nada más.
 *
 * Hasta D7 acá había un paso previo: acuñar un record id en Airtable, porque el motor escribía
 * `Candidatos.proyecto` como *link* con `typecast: true` y una fila sin record id no producía un
 * error sino un **proyecto fantasma** (ADR-033 §4). Con el motor escribiendo FKs uuid ese riesgo
 * desapareció: un id que no existe ahora viola la foreign key, que es exactamente lo que uno
 * quiere que pase.
 */
export async function crearVoz(datos: DatosVoz): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("voces")
    .insert({
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

export async function crearProyecto(datos: DatosProyecto): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("proyectos")
    .insert({
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
