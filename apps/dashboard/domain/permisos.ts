// Dominio puro (C3): quién administra el equipo, y hasta dónde llega. Sin IO, sin React.
//
// Existe por ADR-060 §2. La regla base es **nadie otorga un rol que no tiene**, y vive acá —una
// función con su test— y no en las opciones de un `<select>`: un `<select>` es UI, y la regla de la
// casa es *"la UI esconde, el servidor impide"* (plan-cockpit §3.2). La Server Action de A5
// pregunta a esto, no al formulario que le llegó.

import type { Rol } from "./roles.ts";

/**
 * Quién puede ver y tocar la pantalla de equipo.
 *
 * El `operador` queda afuera: el que califica el feed no da accesos. Y desde el 2026-08-06 eso
 * dejó de ser una distinción interna — "operador" ya incluye gente de Retia (ADR-060).
 */
export function puedeAdministrarEquipo(rol: Rol): boolean {
  return rol === "dev" || rol === "sponsor";
}

// El orden es el del `<select>`: de menos a más alcance. `dev` último y solo.
const CON_DEV: readonly Rol[] = ["operador", "sponsor", "dev"];
const SIN_DEV: readonly Rol[] = ["operador", "sponsor"];

/**
 * Los roles que esta persona puede otorgar en el cockpit abierto. Vacío = no administra.
 *
 * 🔑 **`dev` lo otorga SOLO la agencia, y esto es lo que sostiene el gate de costos.** `dev` es
 * exactamente el rol que ve lo que cuestan los proveedores (ADR-052, endurecido por ADR-060 §5), o
 * sea el margen. Sin este techo, el `sponsor` de una empresa cliente se otorga `dev` a sí mismo
 * desde la pantalla que le acabamos de dar, y la línea de `veCostos` queda desarmable desde la UI.
 *
 * **Está medido, no argumentado:** contra un Postgres real con la forma de prod, a una cuenta de
 * Retia hecha `dev` en una transacción `app.tarifas` le devolvió filas. Esta función es lo único
 * entre esas dos cosas.
 *
 * Por eso el corte es `esDueno` y no `rol === "dev"`: un `dev` que no sea de la agencia —hoy no
 * existe, mañana puede— tampoco acuña más devs. El techo no se hereda otorgándoselo a otro.
 *
 * 🩸 Lo que esta función NO impide, escrito para que nadie construya maquinaria por las dudas: que
 * el último `sponsor` de una empresa se quite el acceso a sí mismo y la deje sin quién administre.
 * Es recuperable —la agencia alcanza todas las empresas (`es_dueno`)— así que se deja pasar y se
 * arregla si ocurre, en vez de un invariante que hay que mantener en cada mutación.
 */
export function rolesQuePuedeOtorgar(rol: Rol, esDueno: boolean): readonly Rol[] {
  if (!puedeAdministrarEquipo(rol)) return [];
  return esDueno ? CON_DEV : SIN_DEV;
}
