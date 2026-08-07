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
// A quién alcanza un sponsor (ADR-063 §3). Es una lista de UN elemento a propósito y no un booleano:
// va derecho al `where` de la query, igual que `rolesQuePuedeOtorgar` va al `<select>`.
const SOLO_OPERADOR: readonly Rol[] = ["operador"];

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

/**
 * Si quien administra puede tocar a un miembro con este rol — cambiarle el rol o quitarle el acceso.
 *
 * 🔑 **Es un eje distinto de `rolesQuePuedeOtorgar`, y hasta ADR-063 §3 no existía.** Aquella
 * pregunta *qué rol otorgo*; esta, *a quién se lo aplico*. Un solo gate no cubre las dos: sin esta,
 * un sponsor podía degradar o echar a **otro sponsor**, incluso al que le dio el acceso a él.
 *
 * La regla: **un `sponsor` solo toca `operador`.** Sube operadores a sponsor, pero un sponsor ya
 * nombrado es intocable para sus pares — lo puso la agencia o un par, y solo la agencia lo saca.
 * El `dev` toca a cualquiera.
 *
 * Vale igual para cambiar el rol y para quitar el acceso: separarlos sería peor que no tener el
 * techo — si no podés degradarme pero sí echarme, el techo es decorativo.
 *
 * 🔓 **Cierra de paso el agujero que este archivo documentaba como aceptado a sabiendas**: que el
 * último sponsor se quite el acceso a sí mismo y deje a la empresa sin quién administre. Un sponsor
 * no puede tocar a un sponsor, y él es uno.
 */
export function rolesQuePuedeTocar(rol: Rol): readonly Rol[] {
  if (!puedeAdministrarEquipo(rol)) return [];
  return rol === "dev" ? CON_DEV : SOLO_OPERADOR;
}
