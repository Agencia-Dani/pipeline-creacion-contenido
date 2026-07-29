import { z } from "zod";
import type { EnlaceVideo } from "@/domain/enlace";
import { createAdminClient } from "@/lib/supabase/admin";

// IO del transcriptor (ADR-031): la cola en `app.transcripciones` y la marca en `processed_items`.
// Todo con service_role — `app.*` tiene RLS sin policies, el browser no llega solo.

const filaTranscripcion = z.object({
  id: z.string(),
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  url: z.string(),
  estado: z.enum(["pendiente", "listo", "sin_transcript", "fallo"]),
  script: z.string().nullable(),
  idioma: z.string().nullable(),
  error: z.string().nullable(),
  creado_en: z.string(),
  procesado_en: z.string().nullable(),
});
export type Transcripcion = z.infer<typeof filaTranscripcion>;

const COLUMNAS =
  "id, plataforma, external_id, url, estado, script, idioma, error, creado_en, procesado_en";

export async function leerTranscripciones(limite = 50): Promise<Transcripcion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("transcripciones")
    .select(COLUMNAS)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error)
    throw new Error(`Supabase respondió con error leyendo transcripciones: ${error.message}`);
  return z.array(filaTranscripcion).parse(data);
}

export type ResultadoEncolar = { nuevos: number; yaEstaban: number };

// Inserta los enlaces como pendientes. El unique (plataforma, external_id) hace el trabajo:
// `ignoreDuplicates` deja pasar los que ya se pidieron antes en vez de volver a pagarlos.
export async function encolarEnlaces(
  enlaces: EnlaceVideo[],
  pedidoPor: string,
): Promise<ResultadoEncolar> {
  if (enlaces.length === 0) return { nuevos: 0, yaEstaban: 0 };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("transcripciones")
    .upsert(
      enlaces.map((e) => ({
        plataforma: e.plataforma,
        external_id: e.external_id,
        url: e.url,
        pedido_por: pedidoPor,
      })),
      { onConflict: "plataforma,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error encolando transcripciones: ${error.message}`);
  const nuevos = data?.length ?? 0;
  return { nuevos, yaEstaban: enlaces.length - nuevos };
}

export async function tomarPendientes(limite: number): Promise<Transcripcion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("transcripciones")
    .select(COLUMNAS)
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true })
    .limit(limite);
  if (error)
    throw new Error(`Supabase respondió con error leyendo la cola: ${error.message}`);
  return z.array(filaTranscripcion).parse(data);
}

export async function contarPendientes(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .schema("app")
    .from("transcripciones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error)
    throw new Error(`Supabase respondió con error contando la cola: ${error.message}`);
  return count ?? 0;
}

export async function marcarResultado(
  id: string,
  campos: { estado: Transcripcion["estado"]; script?: string; idioma?: string; error?: string },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("app")
    .from("transcripciones")
    .update({ ...campos, procesado_en: new Date().toISOString() })
    .eq("id", id);
  if (error)
    throw new Error(`Supabase respondió con error marcando la transcripción: ${error.message}`);
}

// La razón de ser de toda la herramienta: dejar el enlace en la memoria del dedup para que el
// motor no lo vuelva a recomendar. Mismo INSERT idempotente que hace el nodo `POST
// processed_items` — el external_id ya viene con la forma exacta que graba el motor (ADR-031).
//
// Solo se llama cuando la transcripción salió bien (decisión de Mani): si no hubo transcript, el
// enlace queda libre. No se pierde gran cosa — si el motor lo trae, el gate lo descarta duro por
// sin_guion (ADR-030).
export async function registrarEnDedup(enlace: EnlaceVideo): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("processed_items").upsert(
    {
      platform: enlace.plataforma,
      external_id: enlace.external_id,
      url: enlace.url,
      flag_viral: false,
    },
    { onConflict: "platform,external_id", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`Supabase respondió con error registrando el dedup: ${error.message}`);
}
