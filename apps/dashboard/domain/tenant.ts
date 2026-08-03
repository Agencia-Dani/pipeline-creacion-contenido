// Dominio puro (C3): de quién es cada cosa y quién alcanza qué. Sin IO, sin React, sin supabase —
// la misma disciplina que `domain/roles.ts`, y por la misma razón: el server tiene que poder hacer
// cumplir la regla, y la regla tiene que poder testearse sin base.
//
// Gobernado por ADR-046 (doble grano) y **ADR-051** (el acceso es membresía explícita).
//
// Las dos distinciones que ordenan el archivo:
//   · **cliente** = la EMPRESA. Cruza pipelines: voces, proyectos y referentes son los mismos para
//     reels y para LinkedIn.
//   · **instancia** = un PIPELINE de esa empresa. Los knobs de reels no son los de LinkedIn.
//
// Y la regla que ADR-051 dejó, que es la que evita mezclar empresas en una pantalla:
//
//   > **La membresía decide a qué cockpits entrás. NO decide qué filas ves adentro.**
//   > Adentro, el filtro es siempre la empresa del cockpit abierto.

import type { Rol } from "./roles";

/**
 * El contexto que atraviesa todo `lib/`. Sin esto no se puede construir una query (ADR-047).
 *
 * `clientId` es **la empresa del cockpit abierto**, no la del usuario. La diferencia importa desde
 * que alguien puede alcanzar más de una: si acá viviera "las empresas del usuario", una pantalla de
 * 30X mostraría también los proyectos de EstadoX, sin que nada avise.
 */
export type TenantContext = {
  clientId: string;
  instanceId: string;
};

/** Una fila de `app.usuarios_clientes`. */
export type Membresia = { clientId: string; rol: Rol };

/** Lo que hace falta saber de un usuario para decidir qué alcanza. */
export type Alcance = {
  esDueno: boolean;
  membresias: readonly Membresia[];
};

/** Una fila de `instances`, reducida a lo que la regla necesita. */
export type InstanciaVisible = { id: string; clientId: string };

/**
 * El rol con el que la agencia entra a cualquier cockpit.
 *
 * Los dueños no tienen membresía (ADR-051: el flag es justamente para no depender de filas que
 * alguien tiene que acordarse de crear), así que su rol no está escrito en ningún lado y hay que
 * elegirlo. `dev` es el que corresponde: son quienes operan la máquina, y es el único que ve las
 * cuatro zonas.
 */
export const ROL_DE_DUENO: Rol = "dev";

/**
 * Las empresas que esta persona alcanza.
 *
 * Un dueño alcanza todas — incluidas las que se creen después, que es el punto entero del flag
 * frente a tres membresías que alguien tendría que acordarse de agregar (ADR-051).
 */
export function empresasAlcanzables(
  usuario: Alcance,
  todasLasEmpresas: readonly string[],
): string[] {
  if (usuario.esDueno) return [...todasLasEmpresas];
  return usuario.membresias.map((m) => m.clientId);
}

/** ¿Esta persona entra a esta empresa? */
export function puedeVerCliente(usuario: Alcance, clientId: string): boolean {
  return usuario.esDueno || usuario.membresias.some((m) => m.clientId === clientId);
}

/** ¿Y a este cockpit? Se pregunta por la EMPRESA de la instancia, no por la que tenga abierta. */
export function puedeVerInstancia(usuario: Alcance, instancia: InstanciaVisible): boolean {
  return puedeVerCliente(usuario, instancia.clientId);
}

/**
 * Con qué rol entra esta persona a esta empresa. `null` = no entra.
 *
 * Es la pregunta que antes tenía una sola respuesta global (`usuarios.rol`) y ahora tiene una por
 * empresa — que es la forma que toma cuando el que pregunta es el dueño de una de ellas.
 */
export function rolEn(usuario: Alcance, clientId: string): Rol | null {
  const propia = usuario.membresias.find((m) => m.clientId === clientId);
  if (propia) return propia.rol;
  return usuario.esDueno ? ROL_DE_DUENO : null;
}

/** Los cockpits que esta persona puede abrir: lo que alimenta el selector del nav. */
export function instanciasVisibles<T extends InstanciaVisible>(
  usuario: Alcance,
  instancias: readonly T[],
): T[] {
  return instancias.filter((i) => puedeVerInstancia(usuario, i));
}

/**
 * Arma el contexto de un cockpit, o dice que no.
 *
 * Devuelve `null` en vez de tirar: el llamador sabe si eso es un `redirect` (una página) o un 403
 * (la fachada), y esa decisión no es del dominio.
 *
 * ⚠️ Fijate que el `clientId` que sale es **el de la instancia**, no el del usuario. Es la línea
 * que hace cumplir la regla de ADR-051.
 */
export function armarContexto(
  usuario: Alcance,
  instancia: InstanciaVisible,
): { ctx: TenantContext; rol: Rol } | null {
  const rol = rolEn(usuario, instancia.clientId);
  if (rol === null) return null;
  return { ctx: { clientId: instancia.clientId, instanceId: instancia.id }, rol };
}
