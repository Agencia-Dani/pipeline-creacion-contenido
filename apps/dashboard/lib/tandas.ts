import { z } from "zod";
import type { ContadoresTanda } from "@/domain/tanda";
import type { TenantContext } from "@/domain/tenant";
import { createClient } from "@/lib/supabase/server";
import { scoped } from "@/lib/supabase/scoped";

// IO de la tanda (ADR-064): el pegote como entidad. Lo puro —cómo se llama, cómo se resume— está en
// `domain/tanda.ts`.
//
// 🔑 **La forma de este archivo ES la decisión de ADR-064 §3.** La pantalla carga **cabeceras**
// (`app.v_tandas`, una fila por tanda) y las transcripciones bajan cuando alguien abre una. La lista
// vieja traía las últimas 50 filas **con sus `script`** sobre 110 existentes, o sea que ocultaba más
// de la mitad sin decirlo. Es la misma forma que arregló el feed en el cierre 98 (405 KB → 16 KB):
// el `script` es el campo gordo y una tanda colapsada no necesita sus guiones.

const filaCabecera = z.object({
  id: z.string(),
  titulo: z.string().nullable(),
  creada_por: z.string().nullable(),
  creado_en: z.string(),
  // `count(*)` es `bigint` en Postgres. PostgREST lo manda como número JSON, pero `coerce` cuesta
  // nada y evita que un cambio de serialización rompa la pantalla en silencio.
  total: z.coerce.number(),
  pendientes: z.coerce.number(),
  listos: z.coerce.number(),
  fallidas: z.coerce.number(),
  abandonadas: z.coerce.number(),
});

export type CabeceraTanda = ContadoresTanda & {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  creadoEn: string;
};

/** Todas las tandas del cockpit, de la más nueva a la más vieja. **Sin ventana, y ese es el punto.** */
export async function leerCabeceras(ctx: TenantContext): Promise<CabeceraTanda[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.v_tandas", "id, titulo, creada_por, creado_en, total, pendientes, listos, fallidas, abandonadas")
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`Supabase respondió con error leyendo las tandas: ${error.message}`);

  return z.array(filaCabecera).parse(data ?? []).map((f) => ({
    id: f.id,
    titulo: f.titulo,
    creadaPor: f.creada_por,
    creadoEn: f.creado_en,
    total: f.total,
    pendientes: f.pendientes,
    listos: f.listos,
    fallidas: f.fallidas,
    abandonadas: f.abandonadas,
  }));
}

/**
 * Abre una tanda. Devuelve `null` si no se pudo.
 *
 * 🔑 **Sumidero, no dependencia de ejecución** (invariante #1 de PLAN §2.5, el mismo criterio que
 * `abrirRunTranscriptor`): si esto falla, los enlaces se encolan y se transcriben igual y lo único
 * que se pierde es el agrupado de la pantalla. Convertir la agrupación visual en un bloqueante del
 * encolado sería el error que ese invariante existe para evitar.
 */
export async function crearTanda(ctx: TenantContext, creadaPor: string): Promise<string | null> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.tandas", [{ creada_por: creadaPor }])
    .select("id");
  if (error) {
    console.error("[tandas] no se pudo abrir la tanda:", error.message);
    return null;
  }
  return z.array(z.object({ id: z.string() })).parse(data ?? [])[0]?.id ?? null;
}

/**
 * Le pone la tanda a las filas que el encolado acaba de crear.
 *
 * 🩸 **Va DESPUÉS del insert y no adentro, y no es un detalle de implementación.** `encolarEnlaces`
 * es un upsert con `ignoreDuplicates`: hasta que Postgres no responde, nadie sabe cuántos enlaces
 * eran nuevos. Creando la tanda primero, un pegote entero de repetidos dejaría una tanda vacía en la
 * pantalla — y sin `delete` en el grant de la `027`, ahí se quedaría para siempre.
 *
 * Best-effort por lo mismo que `crearTanda`: una fila sin tanda se ve suelta, no se pierde.
 */
export async function asignarTanda(
  ctx: TenantContext,
  tandaId: string,
  transcripcionIds: string[],
): Promise<void> {
  if (transcripcionIds.length === 0) return;
  const { error } = await (await scoped(ctx))
    .update("app.transcripciones", { tanda_id: tandaId })
    .in("id", transcripcionIds);
  if (error) console.error("[tandas] no se pudo asignar la tanda:", error.message);
}

/**
 * Renombra. `titulo: null` la devuelve al nombre por defecto.
 *
 * 🔑 **Renombrar es el 90% del valor del título** (ADR-064 §2): el campo aparece justo cuando la
 * persona está apurada pegando 50 links, así que casi toda tanda nace con el nombre automático. Sin
 * esto, "poder ponerle nombre" sería una única oportunidad que se pierde por apuro.
 */
export async function renombrarTanda(
  ctx: TenantContext,
  id: string,
  titulo: string | null,
): Promise<boolean> {
  const { data, error } = await (await scoped(ctx))
    .update("app.tandas", { titulo })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error renombrando la tanda: ${error.message}`);
  // 0 filas = no existe o no es de este cockpit. Ninguna de las dos es un error del servidor.
  return (data?.length ?? 0) > 0;
}

const filaAutor = z.object({ usuario_id: z.string(), nombre: z.string().nullable() });

/**
 * `usuario_id → nombre` para las tandas que esta sesión ve.
 *
 * 🔴 **Por qué un RPC y no un embed a `app.usuarios`**, que sería lo obvio: la policy de la `025`
 * solo deja ver `usuarios_visibles()`, que **excluye a los dueños** (ADR-051 §3, *"la agencia queda
 * fuera de toda superficie que liste personas"*). Con un embed, toda tanda pegada por un dueño diría
 * *"(sin acceso a la ficha)"* — que es lo que pasa hoy en la pantalla de equipo, ahí a propósito.
 *
 * Decisión de Mani (2026-08-07): en una tanda **sí** se muestra quién, sea dueño, sponsor u operador.
 * La excepción se hizo **angosta** y vive en la base, no acá: `app.autores_de_tandas()` no lista
 * personas, resuelve el nombre de quien firmó un trabajo que la sesión ya alcanza. El porqué largo
 * está en el §6 de la `027`.
 *
 * Devuelve un Map vacío si falla: una cabecera sin autor se lee bien; una pantalla caída, no.
 */
export async function leerAutores(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("autores_de_tandas");
  if (error) {
    console.error("[tandas] no se pudieron leer los autores:", error.message);
    return new Map();
  }
  const filas = z.array(filaAutor).safeParse(data ?? []);
  if (!filas.success) return new Map();
  return new Map(filas.data.flatMap((f) => (f.nombre ? [[f.usuario_id, f.nombre] as const] : [])));
}
