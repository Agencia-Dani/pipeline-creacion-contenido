import { z } from "zod";
import type { EnlaceVideo } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO del transcriptor (ADR-031): la cola en `app.transcripciones` y la marca en `processed_items`.
// Todo por `scoped()`: desde el flip de la Capa 2 (ADR-058) las pantallas entran con la sesión del
// usuario y las policies de la `021` se evalúan. El filtro de tenant sigue haciendo falta igual —
// RLS acota a las empresas del usuario, `scoped()` al cockpit abierto.
//
// 🚨 **Los dos `onConflict` de este archivo cambiaron con la migración `016`, y no es cosmético.**
// PostgREST exige que el arbiter del upsert coincida con un unique existente: si no, tira `42P10` y
// el insert muere entero. La `016` reemplazó `unique (plataforma, external_id)` de
// `app.transcripciones` por uno con la instancia adentro, así que **este archivo no se puede
// deployar antes de aplicarla** (el orden está en plan-multi-tenant §11.3, y es el mismo motivo por
// el que la `014` tenía que ir antes del deploy de su código).

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

export async function leerTranscripciones(
  ctx: TenantContext,
  limite = 50,
): Promise<Transcripcion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.transcripciones", COLUMNAS)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error)
    throw new Error(`Supabase respondió con error leyendo transcripciones: ${error.message}`);
  return z.array(filaTranscripcion).parse(data);
}

export type ResultadoEncolar = { nuevos: number; yaEstaban: number };

// Inserta los enlaces como pendientes. El unique hace el trabajo: `ignoreDuplicates` deja pasar los
// que ya se pidieron antes en vez de volver a pagarlos.
//
// Y ahora es **por instancia**: que otra empresa haya pedido este video no significa que esta ya lo
// tenga. El script vive en su fila, no en la de al lado.
// ⚠️ Ya no recibe `pedidoPor`. `transcripciones.pedido_por` se escribía y no la leía nadie, así que
// la dropea la `023` (ADR-059) y este insert tiene que dejar de mandarla antes — un body con una
// columna inexistente es `PGRST204` y se lleva el encolado entero. **Quién pidió qué no se pierde**:
// el acto queda en `app.eventos`, que es donde vive la auditoría.
export async function encolarEnlaces(
  ctx: TenantContext,
  enlaces: EnlaceVideo[],
): Promise<ResultadoEncolar> {
  if (enlaces.length === 0) return { nuevos: 0, yaEstaban: 0 };
  const { data, error } = await (await scoped(ctx))
    .upsert(
      "app.transcripciones",
      enlaces.map((e) => ({
        plataforma: e.plataforma,
        external_id: e.external_id,
        url: e.url,
      })),
      { onConflict: "instance_id,plataforma,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error encolando transcripciones: ${error.message}`);
  const nuevos = data?.length ?? 0;
  return { nuevos, yaEstaban: enlaces.length - nuevos };
}

export async function tomarPendientes(
  ctx: TenantContext,
  limite: number,
): Promise<Transcripcion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.transcripciones", COLUMNAS)
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true })
    .limit(limite);
  if (error)
    throw new Error(`Supabase respondió con error leyendo la cola: ${error.message}`);
  return z.array(filaTranscripcion).parse(data);
}

export async function contarPendientes(ctx: TenantContext): Promise<number> {
  const { count, error } = await (await scoped(ctx))
    .select("app.transcripciones", "id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error)
    throw new Error(`Supabase respondió con error contando la cola: ${error.message}`);
  return count ?? 0;
}

export async function marcarResultado(
  ctx: TenantContext,
  id: string,
  campos: { estado: Transcripcion["estado"]; script?: string; idioma?: string; error?: string },
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .update("app.transcripciones", { ...campos, procesado_en: new Date().toISOString() })
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
export async function registrarEnDedup(ctx: TenantContext, enlace: EnlaceVideo): Promise<void> {
  const { error } = await (await scoped(ctx)).upsert(
    "public.processed_items",
    [
      {
        // Solo la clave del dedup. `url` y `flag_viral` se escribían y no las leía nadie: se van
        // en la `023` (ADR-059), y este upsert deja de mandarlas antes para no comerse un PGRST204
        // — que acá sería peor que en el motor, porque el enlace quedaría fuera de la memoria.
        platform: enlace.plataforma,
        external_id: enlace.external_id,
      },
    ],
    // El arbiter nuevo de la `016`. El viejo (`platform,external_id`) sigue existiendo hasta la
    // `017`, así que los dos funcionan hoy — pero escribir el viejo acá dejaría este archivo roto
    // el día que se corra el cierre, y ese día nadie va a estar mirando este upsert.
    { onConflict: "instance_id,platform,external_id", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`Supabase respondió con error registrando el dedup: ${error.message}`);
}
