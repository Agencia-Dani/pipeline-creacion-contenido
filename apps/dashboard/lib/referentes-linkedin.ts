import { z } from "zod";
import {
  esFuente,
  normalizarConsulta,
  ordenarBanco,
  type Fuente,
  type ReferenteLinkedin,
} from "@/domain/linkedin";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// El banco del carril copiable de LinkedIn (`020` §2, ADR-055).
//
// 🔑 **No es el hermano de `lib/referentes.ts`, y confundirlos es el error caro.** Aquel es de grano
// EMPRESA (`client_id`): el banco de cuentas de Instagram/TikTok es el mismo para todos los
// pipelines de esa empresa. Este es de grano INSTANCIA (`instance_id`), porque un filtro de
// Pinterest es del pipeline y no de la empresa — ADR-049 §5: *¿el dato tiene sentido sin saber de
// qué pipeline vino?* La respuesta cambia entre los dos, y por eso son dos tablas y dos archivos.
// El grano lo aplica solo `scoped()`; acá no hay un `.eq()` a mano que se pueda olvidar.
//
// 🩸 Y el dato que ordena las expectativas: **esta tabla nace vacía y no hay nada que migrar.**
// ADR-055 cita a Fernando textual — *"no tengo el listado de referentes"* — así que el banco hay que
// CONSTRUIRLO desde esta pantalla, no capturarlo de ningún lado.

const filaReferente = z.object({
  id: z.string(),
  fuente: z.string(),
  consulta: z.string(),
  idioma: z.string().nullable(),
  proyecto_id: z.string().nullable(),
  activo: z.boolean(),
  notas: z.string().nullable(),
});

const COLUMNAS = "id, fuente, consulta, idioma, proyecto_id, activo, notas";

/** Lo que se escribe al crear o editar. `proyectoId` vacío = sin proyecto, que es válido. */
export type DatosReferenteLinkedin = {
  fuente: Fuente;
  consulta: string;
  idioma: string | null;
  proyectoId: string | null;
  notas: string | null;
};

/** El banco de ESTE cockpit, ya ordenado como se dibuja (apagados primero dentro de su fuente). */
export async function leerBancoLinkedin(ctx: TenantContext): Promise<ReferenteLinkedin[]> {
  const { data, error } = await (await scoped(ctx)).select("app.referentes_linkedin", COLUMNAS);
  if (error) {
    throw new Error(`Supabase respondió con error leyendo el banco de LinkedIn: ${error.message}`);
  }

  const filas = z.array(filaReferente).parse(data ?? []).map((r) => ({
    id: r.id,
    // Si la base trajera una fuente fuera del enum sería un enum cambiado por debajo del código, y
    // preferimos que se vea a que se cuele: cae en `web`, que es el cajón genérico, y la pantalla
    // lo muestra tal cual en vez de romper el render entero por una fila.
    fuente: esFuente(r.fuente) ? r.fuente : ("web" as Fuente),
    consulta: r.consulta,
    idioma: r.idioma,
    proyectoId: r.proyecto_id,
    activo: r.activo,
    notas: r.notas,
  } satisfies ReferenteLinkedin));

  return ordenarBanco(filas);
}

/**
 * Alta. Devuelve el id nuevo.
 *
 * La consulta se normaliza ACÁ y no en la pantalla: es lo que hace que el `unique (instance_id,
 * fuente, consulta)` de la `020` signifique algo (ver `normalizarConsulta`). Si la normalización
 * viviera solo en el cliente, cualquier otro camino de escritura —un import, el propio motor de
 * LinkedIn cuando exista— metería los duplicados que la restricción dice evitar.
 */
export async function crearReferenteLinkedin(
  ctx: TenantContext,
  datos: DatosReferenteLinkedin,
): Promise<string> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.referentes_linkedin", [
      {
        fuente: datos.fuente,
        consulta: normalizarConsulta(datos.consulta),
        idioma: datos.idioma,
        proyecto_id: datos.proyectoId,
        notas: datos.notas,
        // Nace apagado, como en la base (`activo boolean not null default false`). Prender es un
        // acto aparte y deliberado: un referente recién cargado todavía no se revisó, y prenderlo
        // solo lo metería en la próxima corrida sin que nadie lo haya mirado.
        activo: false,
      },
    ])
    .select("id")
    .single();

  if (error) throw errorDeEscritura(error);
  return z.object({ id: z.string() }).parse(data).id;
}

/** Edición de los campos del formulario. `activo` va por `prenderReferenteLinkedin`. */
export async function actualizarReferenteLinkedin(
  ctx: TenantContext,
  id: string,
  datos: DatosReferenteLinkedin,
): Promise<void> {
  await escribir(ctx, id, {
    fuente: datos.fuente,
    consulta: normalizarConsulta(datos.consulta),
    idioma: datos.idioma,
    proyecto_id: datos.proyectoId,
    notas: datos.notas,
  });
}

/** El interruptor, que es la acción que la lista existe para provocar. */
export async function prenderReferenteLinkedin(
  ctx: TenantContext,
  id: string,
  activo: boolean,
): Promise<void> {
  await escribir(ctx, id, { activo });
}

export async function borrarReferenteLinkedin(ctx: TenantContext, id: string): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .borrar("app.referentes_linkedin")
    .eq("id", id)
    .select("id");
  if (error) throw errorDeEscritura(error);
  if (!data || data.length === 0) throw new Error("Ese referente ya no existe.");
}

/**
 * Fail-loud si la fila no está, con `actualizado_en` puesto siempre.
 *
 * Desde ADR-047 "no está" incluye "no es de este cockpit": el filtro de `scoped` entra en el
 * `update`, así que tocar un id de otra instancia devuelve 0 filas y tira. El mensaje es el mismo a
 * propósito — no confirma que el id exista en otro lado.
 */
async function escribir(
  ctx: TenantContext,
  id: string,
  campos: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.referentes_linkedin", { ...campos, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw errorDeEscritura(error);
  if (!data || data.length === 0) throw new Error("Ese referente ya no existe.");
}

/**
 * Traduce los dos errores de Postgres que este formulario puede provocar de verdad.
 *
 * El `23505` es el unique de la `020`, y su mensaje crudo (*duplicate key value violates unique
 * constraint "referentes_linkedin_instance_id_fuente_consulta_key"*) no le dice nada a nadie. Vale
 * la pena traducirlo porque es **el error esperable**: es exactamente lo que pasa cuando alguien
 * carga un filtro que ya estaba, que con un banco que se construye a mano va a pasar seguido.
 */
function errorDeEscritura(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("Esa consulta ya está en el banco para esa fuente.");
  }
  if (error.code === "23503") {
    return new Error("Ese proyecto ya no existe. Recargá la página.");
  }
  return new Error(`Supabase respondió con error guardando el referente: ${error.message}`);
}
