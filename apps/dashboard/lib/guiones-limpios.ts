import { z } from "zod";
import { claveDe, type Plataforma } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO del guion limpio (ADR-074, migración `032`).
//
// 🔑 **El crudo no vive acá y no se toca desde acá.** `app.candidatos.script` y
// `app.transcripciones.script` siguen siendo la transcripción literal de ADR-009. Esta tabla es una
// capa derivada: se puede vaciar entera sin perder nada que se haya pagado.

export type GuionLimpio = {
  clave: string;
  texto: string;
  modelo: string;
  criteriosHash: string | null;
  actualizadoEn: string;
  /** Con qué voz se limpió. `null` = solo los criterios de la casa. */
  vozId: string | null;
};

const fila = z.object({
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  texto: z.string(),
  modelo: z.string(),
  criterios_hash: z.string().nullable(),
  actualizado_en: z.string(),
  voz_id: z.string().nullable(),
});

const COLUMNAS = "plataforma, external_id, texto, modelo, criterios_hash, actualizado_en, voz_id";

/** El arbiter de la PK de la `032`, con el tenant adentro como exige PostgREST. */
const ARBITER = "instance_id,plataforma,external_id";

/**
 * Todos los guiones limpios del cockpit, indexados por clave de video.
 *
 * ⚠️ **Trae el `texto`, que es largo, y eso es deliberado acá y NO en la lista de la colección.** La
 * regla del payload de `domain/feed.ts` (los textos largos no viajan con la grilla) se respeta
 * pidiendo `clavesConLimpio` para dibujar los badges; esta función es para cuando alguien abre un
 * guion o baja el documento, que es cuando el texto hace falta de verdad.
 */
export async function leerLimpios(ctx: TenantContext): Promise<Map<string, GuionLimpio>> {
  const { data, error } = await (await scoped(ctx)).select("app.guiones_limpios", COLUMNAS);
  if (error) throw new Error(`Supabase respondió con error leyendo los limpios: ${error.message}`);

  const mapa = new Map<string, GuionLimpio>();
  for (const f of z.array(fila).parse(data ?? [])) {
    const clave = claveDe({ plataforma: f.plataforma as Plataforma, external_id: f.external_id });
    mapa.set(clave, {
      clave,
      texto: f.texto,
      modelo: f.modelo,
      criteriosHash: f.criterios_hash,
      actualizadoEn: f.actualizado_en,
      vozId: f.voz_id,
    });
  }
  return mapa;
}

/** Qué videos ya tienen limpio, sin traerse los textos. Es lo que dibuja el badge en la grilla. */
export async function clavesConLimpio(ctx: TenantContext): Promise<Set<string>> {
  const { data, error } = await (await scoped(ctx)).select(
    "app.guiones_limpios",
    "plataforma, external_id",
  );
  if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
  const claves = new Set<string>();
  for (const f of z.array(fila.pick({ plataforma: true, external_id: true })).parse(data ?? [])) {
    claves.add(claveDe({ plataforma: f.plataforma as Plataforma, external_id: f.external_id }));
  }
  return claves;
}

/**
 * Guarda (o rehace) el limpio de un video.
 *
 * `merge`: re-limpiar **pisa**. Una fila por video, sin historial — el punto de comparación que
 * importa es el crudo, que está intacto en otra tabla, no las limpiezas anteriores.
 */
export async function guardarLimpio(
  ctx: TenantContext,
  video: { plataforma: Plataforma; external_id: string },
  datos: {
    texto: string;
    modelo: string;
    criteriosHash: string;
    vozId: string | null;
    usuarioId: string;
  },
): Promise<void> {
  const { error } = await (await scoped(ctx)).upsert(
    "app.guiones_limpios",
    [
      {
        plataforma: video.plataforma,
        external_id: video.external_id,
        texto: datos.texto,
        modelo: datos.modelo,
        criterios_hash: datos.criteriosHash,
        voz_id: datos.vozId,
        creado_por: datos.usuarioId,
        actualizado_en: new Date().toISOString(),
      },
    ],
    { onConflict: ARBITER },
  );
  if (error) throw new Error(`Supabase respondió con error guardando el limpio: ${error.message}`);
}

/** Tira el limpio de un video. El crudo no se toca: rehacerlo es volver a apretar el botón. */
export async function borrarLimpio(
  ctx: TenantContext,
  plataforma: Plataforma,
  externalId: string,
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .borrar("app.guiones_limpios")
    .eq("plataforma", plataforma)
    .eq("external_id", externalId);
  if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
}
