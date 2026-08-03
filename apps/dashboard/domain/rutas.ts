// Dominio puro (C3): cómo se arma la URL de un cockpit. Sin IO, sin React.
//
// Existe porque con la Fase 3 **toda ruta de zona lleva el tenant adelante** (`/30x/reels/operar`)
// y había 28 `href` + ~30 `revalidatePath` escritos a mano. Con el prefijo variable, cada uno de
// esos strings es una oportunidad de mandar a alguien al cockpit equivocado — o peor, de
// revalidar el de otra empresa.
//
// **Por qué el tenant va en la URL y no en una cookie** (plan-multi-tenant §6): los links se
// pueden compartir entre compañeros, el caché de Next keyea correcto por tenant, y el tenant no se
// puede perder al navegar. Una cookie de tenant es un bug de caché esperando.
//
// ⚠️ Lo que NO lleva prefijo, y no es un olvido: `/login`, `/auth/*`, `/sin-rol`, `/api/*` y la
// raíz `/`. Son de la sesión o de la máquina, no de un cockpit. La raíz redirige al cockpit que
// corresponda; `/api/engine` resuelve su tenant por parámetro (ADR-048).

import type { Zona } from "./roles";

/** La identidad de un cockpit **en la URL**: los dos segmentos, no los ids de la base. */
export type CockpitEnRuta = {
  /** `clients.id` — es el slug, así que ya es apto para URL (migración `001`). */
  cliente: string;
  /** `instances.slug` — la identidad legible que agregó la `016`. */
  pipeline: string;
};

/**
 * Segmentos aceptables: minúsculas, números y guiones.
 *
 * No es paranoia de seguridad —el layout valida contra las instancias visibles igual— sino de
 * forma: un segmento con `/` o `..` arma una ruta que no es la que el llamador cree que armó.
 */
export function esSegmentoValido(valor: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(valor);
}

/** El prefijo del cockpit: `/30x/reels`. */
export function baseDe(cockpit: CockpitEnRuta): string {
  return `/${cockpit.cliente}/${cockpit.pipeline}`;
}

/**
 * Una ruta dentro del cockpit: `rutaDe(c, "curar/feed")` → `/30x/reels/curar/feed`.
 *
 * Acepta el sub-path con o sin barra inicial porque los dos se escriben solos, y devolver
 * `/30x/reels//curar` por una barra de más sería un 404 difícil de ver leyendo el código.
 */
export function rutaDe(cockpit: CockpitEnRuta, sub = ""): string {
  const limpio = sub.replace(/^\/+/, "").replace(/\/+$/, "");
  return limpio === "" ? baseDe(cockpit) : `${baseDe(cockpit)}/${limpio}`;
}

/** La zona, que es el caso más común: `/30x/reels/operar`. */
export function rutaZona(cockpit: CockpitEnRuta, zona: Zona): string {
  return rutaDe(cockpit, zona);
}

/**
 * De una fila de `instances` a los dos segmentos de la URL.
 *
 * Existe para que las Server Actions no tengan que acordarse de que el segundo segmento es el
 * `slug` y no el `workflow_id` — son iguales hoy (la `016` los backfilleó así) y van a dejar de
 * serlo en cuanto una empresa tenga dos instancias del mismo pipeline, que es justo lo que la
 * `016` habilitó. Un `revalidatePath` con el segmento equivocado no falla: revalida una ruta que
 * no existe, y la pantalla que sí existe se queda con datos viejos.
 */
export function comoRuta(instancia: { clientId: string; slug: string }): CockpitEnRuta {
  return { cliente: instancia.clientId, pipeline: instancia.slug };
}
