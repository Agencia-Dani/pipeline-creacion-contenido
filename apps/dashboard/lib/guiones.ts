import { z } from "zod";
import { parsearEnlaces, type Plataforma } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// El guion CRUDO de un video, venga de donde venga (ADR-072 §1).
//
// 🔑 **Es la transcripción literal de ADR-009 y esta capa NUNCA la escribe.** Solo lee. El guion
// limpio vive en `app.guiones_limpios` y se maneja desde `lib/guiones-limpios.ts`; el crudo se
// queda donde el motor y el transcriptor lo dejaron.
//
// 🩸 **Está en tres tablas y ninguna es "la" fuente**, que es todo el problema que ADR-072 vino a
// resolver:
//   · `app.transcripciones.script`   — el que se pidió pegando un link.
//   · `app.candidatos.script`        — el que trajo el motor y todavía está en el feed.
//   · `outputs.contenido_o_link`     — el que ya se archivó.
// Un mismo video puede estar en las tres, en dos o en una sola, y el texto es el mismo: es la misma
// transcripción, copiada al archivarse. Por eso alcanza con **el primero que aparezca**.

const textoUtil = (s: unknown): string | null => {
  const t = typeof s === "string" ? s.trim() : "";
  return t === "" ? null : t;
};

const filaTranscripcion = z.object({ script: z.string().nullable() });
const filaCandidato = z.object({
  script: z.string().nullable(),
  url_referente: z.string().nullable(),
});
const filaOutput = z.object({
  contenido_o_link: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * El guion crudo de un video, o `null` si el sistema no lo tiene.
 *
 * `null` es un caso normal y no una falla: un link cargado a mano en Históricos **nunca tuvo
 * guion** (se grabó por fuera de la herramienta) y una transcripción abandonada tampoco. La
 * pantalla lo dice; no hay nada que reintentar.
 *
 * El orden de búsqueda va de lo más barato a lo más caro y **corta en el primero que encuentra**.
 */
export async function leerCrudo(
  ctx: TenantContext,
  plataforma: Plataforma,
  externalId: string,
): Promise<string | null> {
  const s = await scoped(ctx);

  const t = await s
    .select("app.transcripciones", "script")
    .eq("plataforma", plataforma)
    .eq("external_id", externalId)
    .limit(1);
  if (!t.error) {
    const texto = textoUtil(z.array(filaTranscripcion).parse(t.data ?? [])[0]?.script);
    if (texto) return texto;
  }

  // `app.candidatos` no tiene columna `plataforma`: su identidad se deriva de `url_referente`, igual
  // que en todo el resto del sistema. Se filtra por `external_id` (que sí es columna) y se confirma
  // la plataforma en memoria — un id de IG y uno de TikTok podrían coincidir como texto sin ser el
  // mismo video.
  const c = await s.select("app.candidatos", "script, url_referente").eq("external_id", externalId);
  if (!c.error) {
    for (const f of z.array(filaCandidato).parse(c.data ?? [])) {
      if (f.url_referente && parsearEnlaces(f.url_referente).validos[0]?.plataforma !== plataforma) {
        continue;
      }
      const texto = textoUtil(f.script);
      if (texto) return texto;
    }
  }

  // 🩸 En `outputs` el `external_id` significa **dos cosas** según el carril (uuid del candidato en
  // `guion_reel`, id del video en `transcripcion_a_pedido`), así que filtrar por él mentiría. Se
  // busca por la URL de `metadata`, que es la forma que ADR-070 verificó en 300/300 — y por eso
  // esta rama es la última: no se puede acotar en la query y hay que traer y cruzar.
  const o = await s.select("public.outputs", "contenido_o_link, metadata");
  if (!o.error) {
    for (const f of z.array(filaOutput).parse(o.data ?? [])) {
      const url = typeof f.metadata?.url_referente === "string" ? f.metadata.url_referente : null;
      if (!url) continue;
      const id = parsearEnlaces(url).validos[0];
      if (id?.plataforma === plataforma && id.external_id === externalId) {
        const texto = textoUtil(f.contenido_o_link);
        if (texto) return texto;
      }
    }
  }

  return null;
}
