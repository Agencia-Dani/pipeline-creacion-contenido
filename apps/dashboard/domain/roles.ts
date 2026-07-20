// Dominio puro (C3): roles y zonas de la superficie. Sin IO, sin React, sin supabase.
// Las reglas viven acá para que el server las haga cumplir (plan-cockpit §3.2:
// "la UI esconde; RLS impide") y para poder testearlas con node:test.

export type Rol = "operador" | "dev" | "sponsor";
export type Zona = "operar" | "curar" | "entender";

export const ROLES: readonly Rol[] = ["operador", "dev", "sponsor"];
export const ZONAS: readonly Zona[] = ["operar", "curar", "entender"];

// Quién ve qué zona (plan-cockpit §2.1): el operador opera y cura; el sponsor
// solo entiende; el dev ve todo (los knobs avanzados viven detrás de su rol, §3.4).
const ZONAS_POR_ROL: Record<Rol, readonly Zona[]> = {
  operador: ["operar", "curar"],
  dev: ["operar", "curar", "entender"],
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
