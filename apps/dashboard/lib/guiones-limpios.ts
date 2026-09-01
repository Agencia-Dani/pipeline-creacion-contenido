import { z } from "zod";
import { claveDe, type Plataforma } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";
import { abortarSiTruncado } from "@/lib/supabase/tope";

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
 * pidiendo `huellasDeLimpios` para dibujar los badges; esta función es para cuando alguien abre un
 * guion o baja el documento, que es cuando el texto hace falta de verdad.
 */
export async function leerLimpios(ctx: TenantContext): Promise<Map<string, GuionLimpio>> {
  const { data, error } = await (await scoped(ctx)).select("app.guiones_limpios", COLUMNAS);
  if (error) throw new Error(`Supabase respondió con error leyendo los limpios: ${error.message}`);
  abortarSiTruncado((data ?? []).length, "los guiones limpios (app.guiones_limpios)");

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

/**
 * Qué videos ya tienen limpio y con qué huella salió cada uno, **sin traerse los textos**.
 *
 * Es lo que dibuja los badges de la grilla: quién está limpio, y cuál de esos quedó viejo. Las
 * claves del mapa siguen siendo la respuesta a *"¿tiene limpio?"*; el valor es lo que agrega
 * ADR-080. El `texto` no viaja: para eso está `leerLimpios`, que se pide al abrir un guion.
 *
 * La huella puede ser `null` (guiones limpiados antes de la `032`) y eso NO es un dato faltante:
 * `estadoDelLimpio` los cuenta al día a propósito.
 */
export async function huellasDeLimpios(ctx: TenantContext): Promise<Map<string, string | null>> {
  const { data, error } = await (await scoped(ctx)).select(
    "app.guiones_limpios",
    "plataforma, external_id, criterios_hash",
  );
  if (error) throw new Error(`Supabase respondió con error: ${error.message}`);
  const huellas = new Map<string, string | null>();
  const columnas = fila.pick({ plataforma: true, external_id: true, criterios_hash: true });
  for (const f of z.array(columnas).parse(data ?? [])) {
    huellas.set(
      claveDe({ plataforma: f.plataforma as Plataforma, external_id: f.external_id }),
      f.criterios_hash,
    );
  }
  return huellas;
}

/**
 * Guarda (o rehace) el limpio de un video.
 *
 * `merge`: re-limpiar **pisa**. Una fila por video, sin historial — el punto de comparación que
 * importa es el crudo, que está intacto en otra tabla, no las limpiezas anteriores.
 *
 * 🔑 **`usuarioId` solo se manda cuando la fila es NUEVA** (ADR-074 §Enmienda). `creado_por`
 * significa *quién lo limpió la primera vez*, y mandarlo en cada upsert se lo robaba a esa persona:
 * `merge` pisa lo que se le manda, así que rehacer un guion de Majo lo ponía a nombre de quien
 * apretara. Con la columna afuera del payload, PostgREST no la toca.
 *
 * El que llama ya sabe cuál de los dos casos es sin leer nada: `limpiarFaltantes` apunta a videos
 * **sin** limpio y `relimpiarViejos` solo a los que **ya** lo tienen.
 */
export async function guardarLimpio(
  ctx: TenantContext,
  video: { plataforma: Plataforma; external_id: string },
  datos: {
    texto: string;
    modelo: string;
    criteriosHash: string;
    vozId: string | null;
    /** El autor. `null` = la fila ya existe y su `creado_por` no se toca. */
    usuarioId: string | null;
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
        ...(datos.usuarioId === null ? {} : { creado_por: datos.usuarioId }),
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
