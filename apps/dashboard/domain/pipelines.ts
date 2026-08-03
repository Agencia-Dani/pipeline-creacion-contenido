// Dominio puro (C3): qué zonas del cockpit implementa cada pipeline. Sin IO, sin React.
//
// Existe por ADR-056. Hasta que entró LinkedIn, `zonasDe(rol)` alcanzaba para decidir el nav:
// con un solo pipeline, las 4 zonas existen en todos los cockpits porque hay un solo cockpit.
// Con dos pipelines eso deja de ser cierto — `transcribir` es la zona de ADR-031 (pegar enlaces →
// script literal) y LinkedIn **ya es texto**: su etapa `enriquecer` es `n/a` (ADR-055 §3).
//
// ⚠️ **Se keyea por `workflow_id`, no por el slug de la URL.** Son iguales hoy en reels por
// casualidad histórica (`short-form-content` → slug `reels` los separó), y el slug es de la
// INSTANCIA: dos instancias del mismo pipeline pueden llamarse distinto, que es justo lo que la
// `016` habilitó. Keyear por slug haría que renombrar un cockpit le cambiara las zonas.

// Con extensión: es un import de VALOR (`ZONAS`), y los `.ts` de `domain/` corren directo en Node
// sin build. Los demás archivos de acá importan solo tipos, que se borran y no necesitan resolver.
import { ZONAS, type Zona } from "./roles.ts";

/** El `workflows.id` del registro central, que es también el `id` del manifest. */
export type Pipeline = string;

// Qué zonas tiene sentido dibujar en cada pipeline. La tabla es corta a propósito: sumar un
// pipeline es una línea acá, no tocar el layout ni las guardias.
//
// No se deriva de la existencia de las tablas (que sería automático y sin duplicación) porque eso
// pone una decisión de producto a merced de una migración: aplicar la `020` cambiaría el nav de
// todos los cockpits sin que nadie lo decida (ADR-056, alternativas descartadas).
const ZONAS_POR_PIPELINE: Record<Pipeline, readonly Zona[]> = {
  "short-form-content": ["operar", "curar", "transcribir", "entender"],
  // Sin `transcribir`: no hay nada que transcribir cuando la pieza ya nació texto.
  linkedin: ["operar", "curar", "entender"],
};

/**
 * Las zonas que implementa un pipeline.
 *
 * **Un pipeline que no está declarado no tiene ninguna zona**, y es el default seguro que pide
 * ADR-056: falla ruidoso y visible (un cockpit sin nav, que se nota en el primer vistazo) en vez
 * de dibujar cuatro links a pantallas que no existen.
 */
export function zonasDePipeline(pipeline: Pipeline): readonly Zona[] {
  return ZONAS_POR_PIPELINE[pipeline] ?? [];
}

/** Si el pipeline está declarado acá. Lo usan las guardias para no adivinar. */
export function pipelineConocido(pipeline: Pipeline): boolean {
  return pipeline in ZONAS_POR_PIPELINE;
}

/**
 * La intersección de ADR-056: **lo que ve alguien es lo que su rol alcanza Y lo que el pipeline
 * tiene**. Las dos condiciones son necesarias y ninguna alcanza sola.
 *
 * El orden lo pone el rol, no el pipeline: `zonasDeRol` viene ordenada por prioridad (su primer
 * elemento es la zona inicial), y respetarlo es lo que hace que `zonaInicialEn` no tenga que
 * volver a decidir nada.
 */
export function zonasVisibles(
  zonasDeRol: readonly Zona[],
  pipeline: Pipeline,
): readonly Zona[] {
  const delPipeline = zonasDePipeline(pipeline);
  return zonasDeRol.filter((z) => delPipeline.includes(z));
}

/**
 * A dónde cae alguien al entrar a ESTE cockpit: la primera zona que su rol alcanza y el pipeline
 * implementa.
 *
 * Devuelve `null` cuando la intersección es vacía — un `sponsor` en un pipeline que no tuviera
 * `entender`, por ejemplo. No es un caso imposible y no se puede resolver acá inventando una zona:
 * quien llama tiene que decidir a dónde manda a esa persona (hoy, a la raíz).
 */
export function zonaInicialEn(
  zonasDeRol: readonly Zona[],
  pipeline: Pipeline,
): Zona | null {
  return zonasVisibles(zonasDeRol, pipeline)[0] ?? null;
}

/** Los pipelines declarados. Para tests y para pantallas que necesiten enumerarlos. */
export function pipelinesDeclarados(): readonly Pipeline[] {
  return Object.keys(ZONAS_POR_PIPELINE);
}

/**
 * Que ninguna declaración invente una zona que no existe.
 *
 * Un typo en la tabla de arriba (`"transcibir"`) no lo atrapa TypeScript si algún día la tabla se
 * arma desde datos, y su síntoma sería una zona que simplemente no aparece — mudo. Esto lo hace
 * ruidoso, y el test lo corre.
 */
export function declaracionesValidas(): boolean {
  return pipelinesDeclarados().every((p) =>
    zonasDePipeline(p).every((z) => ZONAS.includes(z)),
  );
}
