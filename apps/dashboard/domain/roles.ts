// Dominio puro (C3): roles y zonas de la superficie. Sin IO, sin React, sin supabase.
// Las reglas viven acá para que el server las haga cumplir (plan-cockpit §3.2:
// "la UI esconde; RLS impide") y para poder testearlas con node:test.

export type Rol = "operador" | "dev" | "sponsor";
export type Zona = "operar" | "curar" | "transcribir" | "entender" | "ajustes";

export const ROLES: readonly Rol[] = ["operador", "dev", "sponsor"];
export const ZONAS: readonly Zona[] = ["operar", "curar", "transcribir", "entender", "ajustes"];

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
// 🩸 **El supuesto que esto apoyaba SE CAYÓ el 2026-08-06**, que era exactamente lo previsto: tres
// personas de Retia —empresa cliente, no la agencia— reciben `operador`. Ver `veCostos` abajo.
// ⚙️ **`ajustes` es la 5ª zona (ADR-060) y la ven LOS TRES roles.** Lo que se gatea no es la zona:
// son sus pantallas (`ajustes/equipo` la administran `dev` y `sponsor`, ver `domain/permisos.ts`).
//
// 🩸 **El plan la daba como "dev y sponsor, no operador", y eso estaba mal por un número:** de los
// 18 knobs de `app.ajustes`, **8 son de visibilidad `equipo`** (mínimo de likes, mínimo de vistas,
// propuestas por corrida, los 4 toggles de IG/TikTok, afinidad mínima). Mudar los knobs a una zona
// que el `operador` no ve le sacaba a Majo y a Jero ocho perillas que usan — sin error y sin aviso.
// Medido contra prod el 2026-08-06, no razonado.
//
// Va **última** en los tres arrays, por lo mismo que `entender`: `zonaInicial` devuelve el primero.
// 🔑 **El `sponsor` pasó a operar el 2026-08-07, y no es un permiso de más: es el modelo que había
// fallando en la práctica.** Nació como "el jefe que mira" (solo `entender`), y eso dejaba a cada
// empresa cliente con un agujero: el `operador` no invita gente, el `dev` es de la agencia y no
// puede estar de guardia, y el `sponsor` —el único que sí administra su propio equipo— no podía
// usar la herramienta que administra. Medido el 06/08: **cero `sponsor` en las 3 empresas**, o sea
// que la figura existía y nadie la usaba, porque no servía para nada.
//
// Ahora el `sponsor` es **el jefe del equipo de su empresa**: hace todo lo que hace un `operador`
// y además da y quita accesos (`domain/permisos.ts`, que ya lo contemplaba).
//
// 💰 **Lo que NO se movió, y es a propósito: `veCostos` sigue siendo solo `dev`.** El sponsor es de
// la empresa cliente, y `v_costos_semana` es consumo × `app.tarifas`, o sea **el margen de la
// agencia**. "Ver métricas" y "ver lo que le cuesta a la agencia" son dos cosas distintas, y la
// segunda no se le da a un cliente sin decidirlo explícitamente. La `025` lo sostiene también en la
// base (`app.tarifas` pregunta `app.ve_costos()`), así que ni cambiando este archivo se filtraría.
//
// ⚠️ **Su zona inicial cambia de `entender` a `operar`**, porque el primer elemento del array es a
// dónde cae al entrar. Es coherente con que ahora opere, pero un sponsor que ya estaba acostumbrado
// a caer en Entender lo va a notar.
const ZONAS_POR_ROL: Record<Rol, readonly Zona[]> = {
  operador: ["operar", "curar", "transcribir", "entender", "ajustes"],
  dev: ["operar", "curar", "transcribir", "entender", "ajustes"],
  sponsor: ["operar", "curar", "transcribir", "entender", "ajustes"],
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

// 💰 Quién ve lo que nos cuestan los proveedores (`v_costos_semana` = consumo × `app.tarifas`, o
// sea el margen de la agencia). **Solo `dev`**, desde el 2026-08-06.
//
// Antes el gate vivía inline en `entender/page.tsx` y decía `rol !== "sponsor"`, apoyado en que
// todos los operadores eran gente de adentro. Con Retia adentro dejó de serlo, y ese gate **falla
// hacia MOSTRAR**: no rompe, no avisa, filtra. La respuesta es la que ADR-052 dejó escrita y
// descartó por innecesaria en su momento (§15.0.bis del plan-multi-tenant).
//
// Está acá y no en la página por la misma razón que el resto de este archivo: una regla que decide
// qué sale al browser se testea, no se lee en un `if` de JSX. Y ahora **falla hacia ESCONDER**: un
// rol nuevo no ve costos hasta que alguien lo agregue a propósito.
export function veCostos(rol: Rol): boolean {
  return rol === "dev";
}

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as string[]).includes(valor);
}
