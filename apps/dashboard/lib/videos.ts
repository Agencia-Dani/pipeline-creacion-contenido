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

// ─────────────────────────── Lo que el sistema ya sabe de un video ───────────────────────────
//
// 🔑 **Esto es lo que evita pagar de más.** Antes de comprarle nada a Apify hay que juntar lo que ya
// está en casa, y está repartido en tres lugares que no comparten forma ni clave. El cruce lo hace
// `fusionar` (dominio puro, ADR-072 §2); acá solo se traen las piezas y se ponen **en orden de
// precedencia**, que es lo único que decide quién gana.

import { parsearEnlaces } from "@/domain/enlace";
import { fusionar, type Video } from "@/domain/video";
import { leerTodosLosAprobados } from "@/lib/historicos";
import { leerVoces } from "@/lib/proyectos";

const filaCandidato = z.object({
  external_id: z.string(),
  url_referente: z.string().nullable(),
  titulo: z.string().nullable(),
  referente: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  seguidores: z.number().nullable(),
  idioma: z.string().nullable(),
  heat_score: z.number().nullable(),
  voz_id: z.string().nullable(),
});

/**
 * Una URL → la identidad del video, o `null` si no se puede.
 *
 * Se apoya en `parsearEnlaces` y no en las columnas sueltas de cada tabla a propósito: es la misma
 * derivación que usan el pegote, `app.grabados` y `claveDeUrl`. Dos derivaciones de la misma
 * identidad serían dos bugs mudos el día que una cambie.
 */
function identidad(url: string | null): { plataforma: Plataforma; external_id: string } | null {
  if (!url) return null;
  const { validos } = parsearEnlaces(url);
  return validos.length === 1
    ? { plataforma: validos[0].plataforma, external_id: validos[0].external_id }
    : null;
}

/**
 * Todo lo que el sistema sabe hoy de sus videos, indexado por clave.
 *
 * **La precedencia es el orden de este arreglo** (`fusionar` gana campo a campo, no objeto a
 * objeto):
 *  1. `app.candidatos` — el Feed vivo, lo más fresco que trajo el motor.
 *  2. `app.videos_meta` — lo que se compró a pedido. Es el único que aporta miniatura al resto.
 *  3. `outputs` — el archivo. Llena huecos, nunca pisa.
 */
export async function leerLoQueSeSabe(ctx: TenantContext): Promise<Map<string, Video>> {
  const s = await scoped(ctx);
  const [candidatos, meta, aprobados, voces] = await Promise.all([
    s.select(
      "app.candidatos",
      "external_id, url_referente, titulo, referente, thumbnail_url, views, likes, seguidores, idioma, heat_score, voz_id",
    ),
    leerMeta(ctx),
    leerTodosLosAprobados(ctx),
    // Para traducir la voz del histórico, que viaja por NOMBRE y no por uuid (`outputs.metadata.voz`
    // guarda "Juan Pablo Vieira"). Es la misma asimetría que el join del embudo en `armarVistaOperar`
    // y por la misma causa: `outputs` archiva texto, no llaves.
    leerVoces(ctx),
  ]);

  // Renombrar una voz deja huérfanas las filas viejas de `outputs`, que siguen con el nombre
  // anterior. Degrada a `vozId: null` —el video se limpia con los criterios de la casa— y nunca a
  // la voz equivocada, que es el único error que costaría plata y saldría mal escrito.
  const vozPorNombre = new Map(voces.map((v) => [v.nombre, v.id]));

  const partes: ParteVideo[] = [];

  if (candidatos.error) {
    // Sumidero: sin el Feed vivo la fusión sigue teniendo las otras dos fuentes. Perder metadata
    // es cosmético; tirar acá dejaría sin armar la colección.
    console.error("[videos] no se pudo leer el feed vivo:", candidatos.error.message);
  } else {
    for (const c of z.array(filaCandidato).parse(candidatos.data ?? [])) {
      const id = identidad(c.url_referente);
      if (!id) continue;
      partes.push({
        ...id,
        url: c.url_referente,
        titulo: c.titulo,
        referente: c.referente,
        thumbnail: c.thumbnail_url,
        views: c.views,
        likes: c.likes,
        seguidores: c.seguidores,
        idioma: c.idioma,
        heat: c.heat_score,
        vozId: c.voz_id,
      });
    }
  }

  partes.push(...meta);

  for (const h of aprobados.filas) {
    const id = identidad(h.urlReferente);
    if (!id) continue;
    partes.push({
      ...id,
      url: h.urlReferente,
      // 🔴 Va crudo a propósito: `esTituloDeVerdad` en `fusionar` descarta las urls disfrazadas de
      // título (las 129 filas de `transcripcion_a_pedido`). Filtrarlo acá sería una segunda regla
      // que puede desincronizarse de aquella.
      titulo: h.titulo,
      referente: h.referente,
      views: h.views,
      likes: h.likes,
      seguidores: h.seguidores,
      idioma: h.idioma,
      heat: h.heat,
      vozId: h.voz ? (vozPorNombre.get(h.voz) ?? null) : null,
    });
  }

  return new Map(fusionar(partes).map((v) => [v.clave, v]));
}
