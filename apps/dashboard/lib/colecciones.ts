import { z } from "zod";
import { claveDe, type EnlaceVideo, type Plataforma } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO de las colecciones (ADR-073, migración `031`).
//
// 🔑 **La colección apunta a la LLAVE del video, no a la fila del candidato.** No hay FK a
// `app.candidatos`, así que el barrido del archivado puede borrar el candidato y la colección sigue
// entera. Es lo que resuelve el "los videos quedan atrapados en el Feed" sin tocar n8n.

export type Coleccion = {
  id: string;
  nombre: string;
  creadoEn: string;
  /** Cuántos videos tiene. Se cuenta en memoria: ver `leerColecciones`. */
  videos: number;
};

/** Un video adentro de una colección. Lo mínimo para cruzarlo con lo que se sabe de él. */
export type VideoDeColeccion = {
  clave: string;
  plataforma: Plataforma;
  external_id: string;
  url: string;
  agregadoEn: string;
};

const filaColeccion = z.object({
  id: z.string(),
  nombre: z.string(),
  creado_en: z.string(),
});

const filaMiembro = z.object({
  coleccion_id: z.string(),
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  url: z.string(),
  agregado_en: z.string(),
});

/**
 * Las colecciones del cockpit, con su conteo.
 *
 * 🔑 **El conteo se hace en memoria y no con un `count` de PostgREST**, que obligaría a una consulta
 * por colección (N+1) o a una vista nueva. Una fila de miembro son ~80 bytes: a 20 colecciones de
 * 100 videos son 160 KB, y a cambio no hay un objeto más de esquema que mantener. Si esto crece,
 * la respuesta es una vista, no un bucle de `count`.
 */
export async function leerColecciones(ctx: TenantContext): Promise<Coleccion[]> {
  const s = await scoped(ctx);
  const [{ data: cols, error: e1 }, { data: miembros, error: e2 }] = await Promise.all([
    s.select("app.colecciones", "id, nombre, creado_en"),
    s.select("app.colecciones_videos", "coleccion_id"),
  ]);
  if (e1) throw new Error(`Supabase respondió con error leyendo las colecciones: ${e1.message}`);
  if (e2) throw new Error(`Supabase respondió con error contando los videos: ${e2.message}`);

  const cuenta = new Map<string, number>();
  for (const m of z.array(z.object({ coleccion_id: z.string() })).parse(miembros ?? [])) {
    cuenta.set(m.coleccion_id, (cuenta.get(m.coleccion_id) ?? 0) + 1);
  }

  return z
    .array(filaColeccion)
    .parse(cols ?? [])
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      creadoEn: c.creado_en,
      videos: cuenta.get(c.id) ?? 0,
    }))
    // Más nueva primero: la que se acaba de armar es la que se va a abrir.
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

/** Crea una. El nombre ya viene validado y trimmeado por `domain/colecciones.ts`. */
export async function crearColeccion(
  ctx: TenantContext,
  nombre: string,
  usuarioId: string,
): Promise<string> {
  const { data, error } = await (await scoped(ctx))
    .insert("app.colecciones", [{ nombre, creado_por: usuarioId }])
    .select("id")
    .single();

  if (error) {
    // 23505 = el unique (instance_id, nombre). Es un caso de uso, no una falla: alguien puso un
    // nombre que ya existe. Se distingue acá para que la acción pueda decirlo en castellano.
    if (error.code === "23505") throw new Error("YA_EXISTE");
    throw new Error(`Supabase respondió con error creando la colección: ${error.message}`);
  }
  return z.object({ id: z.string() }).parse(data).id;
}

/** Los videos de una colección. */
export async function leerMiembros(
  ctx: TenantContext,
  coleccionId: string,
): Promise<VideoDeColeccion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.colecciones_videos", "coleccion_id, plataforma, external_id, url, agregado_en")
    .eq("coleccion_id", coleccionId);
  if (error) throw new Error(`Supabase respondió con error leyendo la colección: ${error.message}`);

  return z
    .array(filaMiembro)
    .parse(data ?? [])
    .map((m) => ({
      clave: claveDe({ plataforma: m.plataforma as Plataforma, external_id: m.external_id }),
      plataforma: m.plataforma as Plataforma,
      external_id: m.external_id,
      url: m.url,
      agregadoEn: m.agregado_en,
    }))
    .sort((a, b) => b.agregadoEn.localeCompare(a.agregadoEn));
}

/**
 * Mete videos en una colección. Idempotente.
 *
 * `ignoreDuplicates`: agregar algo que ya estaba **no es un error**, es un no-op. Alguien que
 * selecciona 30 tarjetas no tiene por qué acordarse de cuáles ya había agregado la semana pasada.
 * Se devuelve el desglose para poder decírselo (`"12 agregados · 3 ya estaban"`).
 */
export async function agregarMiembros(
  ctx: TenantContext,
  coleccionId: string,
  enlaces: readonly EnlaceVideo[],
): Promise<{ nuevos: number; yaEstaban: number }> {
  if (enlaces.length === 0) return { nuevos: 0, yaEstaban: 0 };

  // Troceado de a 200 por la misma razón que `marcarMuchos`: una URL de PostgREST muy larga da 414
  // en prod, y un pegote de 400 links es un caso real.
  let nuevos = 0;
  for (let i = 0; i < enlaces.length; i += 200) {
    const lote = enlaces.slice(i, i + 200);
    const { data, error } = await (await scoped(ctx))
      .upsert(
        "app.colecciones_videos",
        lote.map((e) => ({
          coleccion_id: coleccionId,
          plataforma: e.plataforma,
          external_id: e.external_id,
          url: e.url,
        })),
        { onConflict: "coleccion_id,plataforma,external_id", ignoreDuplicates: true },
      )
      .select("url");
    if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
    nuevos += (data ?? []).length;
  }
  return { nuevos, yaEstaban: enlaces.length - nuevos };
}

/** Saca un video de una colección. No lo borra de ningún lado más. */
export async function quitarMiembro(
  ctx: TenantContext,
  coleccionId: string,
  plataforma: Plataforma,
  externalId: string,
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .borrar("app.colecciones_videos")
    .eq("coleccion_id", coleccionId)
    .eq("plataforma", plataforma)
    .eq("external_id", externalId);
  if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
}

/**
 * Borra la colección entera. Los miembros se van con ella por el `on delete cascade`.
 *
 * 🔑 **Lo que NO se va: `app.videos_meta` ni el guion limpio.** La bolsa es descartable; lo que se
 * pagó, no. Si mañana el mismo video entra a otra colección, su metadata ya está y no se vuelve a
 * comprar.
 */
export async function borrarColeccion(ctx: TenantContext, coleccionId: string): Promise<void> {
  const { error } = await (await scoped(ctx)).borrar("app.colecciones").eq("id", coleccionId);
  if (error) throw new Error(`Supabase respondió con error borrando la colección: ${error.message}`);
}
