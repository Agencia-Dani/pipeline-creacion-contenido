import { z } from "zod";
import type { Dependencia } from "@/domain/borrado";
import type { Registro } from "@/domain/run-plan";
import {
  aRegistrosDeProyectos,
  aRegistrosDeVoces,
  type DatosProyecto,
  type DatosVoz,
  type ProyectoGuardado,
  type VozGuardada,
} from "@/domain/proyectos";
import type { TenantContext } from "@/domain/tenant";
import { contarEn, scoped } from "@/lib/supabase/scoped";

// IO de voces y proyectos. Lee y escribe `app.voces` + `app.proyectos` por `scoped()`, que desde el
// flip de la Capa 2 (ADR-058) entra con la sesión del usuario. Las dos son de grano EMPRESA: su
// policy filtra por `client_id`, el mismo eje que aplica `scoped()`.
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

export async function leerVoces(ctx: TenantContext): Promise<VozGuardada[]> {
  const { data, error } = await (await scoped(ctx)).select("app.voces", COLUMNAS_VOZ).order("nombre");
  if (error) throw new Error(`Supabase respondió con error leyendo voces: ${error.message}`);
  return z.array(filaVoz).parse(data);
}

export async function leerProyectos(ctx: TenantContext): Promise<ProyectoGuardado[]> {
  const { data, error } = await (await scoped(ctx)).select("app.proyectos", COLUMNAS_PROYECTO).order("nombre");
  if (error) throw new Error(`Supabase respondió con error leyendo proyectos: ${error.message}`);
  return z.array(filaProyecto).parse(data);
}

/**
 * Lo que la pantalla muestra: las voces con sus proyectos y, en cada proyecto, lo que la máquina
 * aprendió y la advertencia que escribió. Desde D7 sale todo de la misma fila — antes había que
 * ir a buscar esos dos campos a Airtable y pisarlos acá (ADR-033).
 */
export async function leerVocesConProyectos(ctx: TenantContext): Promise<
  (VozGuardada & { proyectos: ProyectoGuardado[] })[]
> {
  const [voces, proyectos] = await Promise.all([leerVoces(ctx), leerProyectos(ctx)]);
  return voces.map((v) => ({
    ...v,
    proyectos: proyectos.filter((p) => p.voz_id === v.id),
  }));
}

export async function leerVocesComoRegistros(
  ctx: TenantContext,
  ambito: "motor" | "completo",
): Promise<Registro[]> {
  return aRegistrosDeVoces(await leerVoces(ctx), ambito);
}

export async function leerProyectosComoRegistros(
  ctx: TenantContext,
  ambito: "motor" | "completo",
): Promise<Registro[]> {
  return aRegistrosDeProyectos(await leerProyectos(ctx), ambito);
}

// ── Escritura ────────────────────────────────────────────────────────────────

export async function actualizarVoz(ctx: TenantContext, id: string, datos: DatosVoz): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.voces", {
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

export async function actualizarProyecto(
  ctx: TenantContext,
  id: string,
  datos: DatosProyecto,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.proyectos", {
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
export async function crearVoz(ctx: TenantContext, datos: DatosVoz): Promise<string> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.voces", [
      {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        criterios_relevancia: datos.criterios_relevancia,
        activo: datos.activo,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando la voz: ${error.message}`);
  return data.id;
}

export async function crearProyecto(ctx: TenantContext, datos: DatosProyecto): Promise<string> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.proyectos", [
      {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        criterios_relevancia: datos.criterios_relevancia,
        voz_id: datos.vozId,
        activo: datos.activo,
        n: datos.n,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(`Supabase respondió con error creando el proyecto: ${error.message}`);
  return data.id;
}

// ── Borrado ──────────────────────────────────────────────────────────────────
// La regla vive en `domain/borrado.ts`: se borra solo lo que nunca produjo nada. Acá va el conteo
// que la alimenta y el DELETE.

/**
 * Lo que retiene a un proyecto, en el orden en que la frase lo va a nombrar.
 *
 * No están los pares `referentes_proyectos` ni `referentes_propuestos_proyectos`: cascadean, y con
 * razón — son la asignación (a qué proyecto alimenta esta cuenta), no historia. Si el proyecto deja
 * de existir, esa asignación no significa nada.
 */
export async function dependenciasDeProyecto(
  ctx: TenantContext,
  id: string,
): Promise<Dependencia[]> {
  const [candidatos, descartes] = await Promise.all([
    contarEn(ctx, "app.candidatos", "proyecto_id", id),
    contarEn(ctx, "app.descartes", "proyecto_id", id),
  ]);
  return [
    { cuantos: candidatos, singular: "video en el feed", plural: "videos en el feed" },
    { cuantos: descartes, singular: "descarte", plural: "descartes" },
  ];
}

/**
 * Lo que retiene a una voz. Los proyectos van primero porque son la razón habitual: `voz_id` es
 * `not null`, así que una voz con proyectos no se puede borrar ni aunque estén vacíos — habría que
 * borrarlos a ellos primero, y eso es una decisión de a uno, no un efecto secundario.
 */
export async function dependenciasDeVoz(ctx: TenantContext, id: string): Promise<Dependencia[]> {
  const [proyectos, candidatos] = await Promise.all([
    contarEn(ctx, "app.proyectos", "voz_id", id),
    contarEn(ctx, "app.candidatos", "voz_id", id),
  ]);
  return [
    { cuantos: proyectos, singular: "proyecto", plural: "proyectos" },
    { cuantos: candidatos, singular: "video en el feed", plural: "videos en el feed" },
  ];
}

/**
 * El conteo previo arma la frase; ESTO es la garantía. Entre contar y borrar puede entrar una
 * corrida y escribir candidatos, y ahí la FK rechaza el DELETE con un `23503`. Traducirlo es la
 * diferencia entre "no se pudo borrar, ya hay videos nuevos" y un error de Postgres en pantalla.
 */
function traducirFk(error: { code?: string; message: string }, que: string): Error {
  if (error.code === "23503") {
    return new Error(`No se pudo borrar ${que}: mientras tanto le quedó historia colgando. Recargá la página.`);
  }
  return new Error(`Supabase respondió con error borrando ${que}: ${error.message}`);
}

export async function borrarProyecto(ctx: TenantContext, id: string): Promise<void> {
  const { data, error } = await (await scoped(ctx)).borrar("app.proyectos").eq("id", id).select("id");
  if (error) throw traducirFk(error, "el proyecto");
  if (!data || data.length === 0) throw new Error("Ese proyecto ya no existe.");
}

export async function borrarVoz(ctx: TenantContext, id: string): Promise<void> {
  const { data, error } = await (await scoped(ctx)).borrar("app.voces").eq("id", id).select("id");
  if (error) throw traducirFk(error, "la voz");
  if (!data || data.length === 0) throw new Error("Esa voz ya no existe.");
}
