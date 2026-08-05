// Dominio puro (C3): roles y zonas de la superficie. Sin IO, sin React, sin supabase.
// Las reglas viven acá para que el server las haga cumplir (plan-cockpit §3.2:
// "la UI esconde; RLS impide") y para poder testearlas con node:test.

export type Rol = "operador" | "dev" | "sponsor";
export type Zona = "operar" | "curar" | "transcribir" | "entender";

export const ROLES: readonly Rol[] = ["operador", "dev", "sponsor"];
export const ZONAS: readonly Zona[] = ["operar", "curar", "transcribir", "entender"];

// Quién ve qué zona (plan-cockpit §2.1): el operador opera, cura, transcribe y entiende; el
// sponsor solo entiende; el dev ve todo (los knobs avanzados viven detrás de su rol, §3.4).
// "transcribir" es la cuarta zona que agregó ADR-031: un verbo propio del equipo de
// redes, no una vista de la máquina — por eso el sponsor no la ve.
//
// **`entender` para el operador entró el 2026-08-05** (enmienda de plan-cockpit §2.1, que la daba
// como "dev + sponsor"). La exclusión venía de la tabla original de arquitectura de información —
// una zona por verbo, cada uno en la suya— y era la única sin motivo escrito. Lo que Entender le da
// al operador es feedback sobre su propio trabajo: precisión de entrega (de lo que calificó, qué
// fracción aprobó) y separación del gate. La salud por referente ya la tenía en Curar.
//
// ⚠️ **Va ÚLTIMA en el array, y no es cosmético:** `zonaInicial` devuelve el primer elemento, así
// que ponerla antes cambiaría a dónde cae el equipo al entrar. El orden de este array es prioridad.
//
// 🩸 **El supuesto que esto apoya, escrito porque el día que deje de ser cierto nada avisa:**
// Entender muestra costos, y el gate de ese bloque (`entender/page.tsx`) dice `rol !== "sponsor"`,
// o sea que el operador **ve lo que cuestan los proveedores**. Hoy está bien porque **todos los
// operadores son gente de adentro** (confirmado 2026-08-05). El día que una persona de una empresa
// cliente reciba `operador`, ese gate le publica el margen de la agencia — y falla hacia MOSTRAR,
// así que no va a romperse, va a filtrar. Es el mismo problema que ADR-052 ya resolvió para el
// `sponsor`; si pasa, la respuesta es la que ahí se descartó por innecesaria: gate `rol === "dev"`.
const ZONAS_POR_ROL: Record<Rol, readonly Zona[]> = {
  operador: ["operar", "curar", "transcribir", "entender"],
  dev: ["operar", "curar", "transcribir", "entender"],
  sponsor: ["entender"],
};

export function puedeVerZona(rol: Rol, zona: Zona): boolean {
  return ZONAS_POR_ROL[rol].includes(zona);
}

export function zonasDe(rol: Rol): readonly Zona[] {
  return ZONAS_POR_ROL[rol];
}

// A dónde cae cada rol al entrar: su primera zona.
export function zonaInicial(rol: Rol): Zona {
  return ZONAS_POR_ROL[rol][0];
}

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as string[]).includes(valor);
}
