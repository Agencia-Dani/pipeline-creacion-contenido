import { z } from "zod";
import { claveDe, type Plataforma } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import type { ParteVideo } from "@/domain/video";
import type { MetaDeVideo } from "@/lib/apify";
import { scoped } from "@/lib/supabase/scoped";

// IO de `app.videos_meta` (ADR-072, migración `030`): lo que se le compró a Apify.
//
// 🔑 **La PK es la guardia contra re-pagar.** No hay vencimiento ni refresco por antigüedad: si la
// fila está, no se vuelve a comprar. Agregar el mismo video a una segunda colección cuesta cero.

const filaMeta = z.object({
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  titulo: z.string().nullable(),
  referente: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  seguidores: z.number().nullable(),
});

const COLUMNAS =
  "plataforma, external_id, titulo, referente, thumbnail_url, views, likes, seguidores";

/** El arbiter de la PK de la `030`, con el tenant adentro como exige PostgREST. */
const ARBITER = "instance_id,plataforma,external_id";

/**
 * Toda la metadata comprada del cockpit, como partes listas para `fusionar`.
 *
 * Se trae entera y no filtrada por claves: el llamador la cruza contra listas que se arman de
 * fuentes distintas, y pedir por `in (...)` obligaría a trocear en lotes de 200 (el 414 de prod que
 * ya mordió en `cualesGrabadas`) para ahorrar unos KB.
 *
 * ponytail: sin ventana. Una fila son ~300 bytes y solo existe para videos que alguien agrupó a
 * mano; a 5.000 son ~1,5 MB y ahí sí toca paginar.
 */
export async function leerMeta(ctx: TenantContext): Promise<ParteVideo[]> {
  const { data, error } = await (await scoped(ctx)).select("app.videos_meta", COLUMNAS);
  if (error) throw new Error(`Supabase respondió con error leyendo la metadata: ${error.message}`);

  return z.array(filaMeta).parse(data ?? []).map((f) => ({
    plataforma: f.plataforma as Plataforma,
    external_id: f.external_id,
    titulo: f.titulo,
    referente: f.referente,
    thumbnail: f.thumbnail_url,
    views: f.views,
    likes: f.likes,
    seguidores: f.seguidores,
  }));
}

/** Las claves que YA tienen metadata comprada. Es lo que evita pagar dos veces. */
export async function clavesConMeta(ctx: TenantContext): Promise<Set<string>> {
  const { data, error } = await (await scoped(ctx)).select(
    "app.videos_meta",
    "plataforma, external_id",
  );
  if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
  const claves = new Set<string>();
  for (const f of z.array(filaMeta.pick({ plataforma: true, external_id: true })).parse(data ?? [])) {
    claves.add(claveDe({ plataforma: f.plataforma as Plataforma, external_id: f.external_id }));
  }
  return claves;
}

/**
 * Guarda lo que volvió del scrape.
 *
 * `merge` y no `ignoreDuplicates` (al revés que `app.grabados`): acá la pregunta no es *"¿cuándo se
 * dijo por primera vez?"* sino *"¿qué se sabe hoy de este video?"*, y un re-scrape pedido a mano
 * tiene que poder pisar datos viejos. La PK ya impide que se pida sin querer.
 */
export async function guardarMeta(ctx: TenantContext, metas: readonly MetaDeVideo[]): Promise<void> {
  if (metas.length === 0) return;
  const { error } = await (await scoped(ctx)).upsert(
    "app.videos_meta",
    metas.map((m) => ({
      plataforma: m.plataforma,
      external_id: m.external_id,
      titulo: m.titulo,
      referente: m.referente,
      thumbnail_url: m.thumbnail_url,
      views: m.views,
      likes: m.likes,
      seguidores: m.seguidores,
      fuente: "apify",
      traido_en: new Date().toISOString(),
    })),
    { onConflict: ARBITER },
  );
  // Sumidero: si esto falla, el video ya está en la colección y lo único que se pierde es la foto.
  // La próxima vez que alguien pida enriquecer, se vuelve a intentar.
  if (error) console.error("[videos] no se pudo guardar la metadata comprada:", error.message);
}
