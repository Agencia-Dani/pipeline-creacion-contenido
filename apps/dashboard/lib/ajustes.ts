import { z } from "zod";
import type { Registro } from "@/domain/run-plan";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO de los knobs del equipo (D5, primer corte de config). Lee y escribe `app.ajustes`
// con service_role — `app.*` tiene RLS sin policies, el browser no llega solo.
//
// 🔑 Desde ADR-046 los knobs son **por instancia**: la PK pasó a ser `(instance_id, clave)`. Antes
// `clave` era la PK a secas, o sea UNA fila por knob para todo el sistema — las 18 perillas
// compartidas entre empresas. Acá eso se traduce en que `scoped` filtra por instancia, y en que un
// `update` por `clave` sola ya no puede pisar el ajuste de otra empresa.
//
// Ojo con `valor`: la columna es `numeric` y PostgREST la devuelve como STRING
// ("0.4", no 0.4). Se normaliza acá, una vez, para que ni el dominio ni la pantalla
// tengan que saberlo.

const filaAjuste = z.object({
  clave: z.string(),
  valor: z.coerce.number().nullable(),
  descripcion: z.string().nullable(),
  visibilidad: z.string(),
  actualizado_en: z.string(),
});
export type Ajuste = z.infer<typeof filaAjuste>;

export async function leerAjustes(ctx: TenantContext): Promise<Ajuste[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.ajustes", "clave, valor, descripcion, visibilidad, actualizado_en")
    .order("clave");
  if (error) throw new Error(`Supabase respondió con error leyendo ajustes: ${error.message}`);
  return z.array(filaAjuste).parse(data);
}

// Postgres → la forma del contrato (core/contracts/run-plan.md): listas de `{id, fields}`.
// El `id` va la clave porque NADIE lo usa: los 2 workflows que leen ajustes los recorren por
// `fields.clave` / `fields.valor` (su AJUSTE_MAP), y en Airtable el record id tampoco viajaba
// a ningún lado. Mientras la forma no cambie, el motor no se entera de que la fuente se movió.
export async function leerAjustesComoRegistros(ctx: TenantContext): Promise<Registro[]> {
  const filas = await leerAjustes(ctx);
  return filas.map((f) => ({
    id: f.clave,
    fields: { clave: f.clave, valor: f.valor, descripcion: f.descripcion },
  }));
}

// UPDATE, nunca upsert: las 18 claves ya existen (las trajo el import de sombra) y el check
// de la migración las fija. Si una clave no está, es un bug de datos y tiene que doler.
export async function guardarAjuste(ctx: TenantContext, clave: string, valor: number): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.ajustes", { valor, actualizado_en: new Date().toISOString() })
    .eq("clave", clave)
    .select("clave");
  if (error) throw new Error(`Supabase respondió con error guardando ${clave}: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`No existe el ajuste "${clave}" en app.ajustes.`);
}
