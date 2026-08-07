import { z } from "zod";

// Las reglas de la puerta de entrada por contraseña (ADR-065). Puro: sin Supabase, sin red, sin
// `next/*` — la política se decide acá y se testea sin levantar nada, igual que `permisos.ts`.

/**
 * El largo mínimo de una contraseña **nueva**.
 *
 * ⚠️ **Tiene que estar también en Supabase** (Auth → Password Requirements). La app valida antes de
 * llamar, pero `updateUser` es una API pública: si la base es más laxa, esta constante es
 * decorativa y alcanza con un POST a mano para esquivarla.
 */
export const LARGO_MINIMO = 10;

/**
 * Lo que se pide para ENTRAR.
 *
 * 🔑 **Acá la contraseña solo se exige no vacía, y es a propósito.** La tentación es reusar
 * `LARGO_MINIMO` en los dos lados, pero validar el largo al entrar es un bug con fecha de
 * activación: el día que subamos el mínimo, todo el que tenga una contraseña más corta deja de
 * poder entrar —con "contraseña inválida", que ni siquiera dice por qué— sin que nadie haya tocado
 * su cuenta. **El largo es una regla de cuando se ELIGE, no de cuando se CHEQUEA.**
 *
 * El orden del mail está probado y no es intercambiable: `trim().toLowerCase()` **antes** de
 * `z.email()`. Al revés, un mail pegado desde un chat con un espacio al final se rechaza por
 * inválido — el gotcha que ya documenta `ajustes/equipo/actions.ts`. (`z.email()` y no
 * `z.string().email()`, deprecado en Zod 4.)
 */
const login = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Ese mail no tiene forma de mail.")),
  password: z.string().min(1, "Escribí tu contraseña."),
});

export type Login = z.infer<typeof login>;

export type Parseo<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

export function parseLogin(form: {
  email: unknown;
  password: unknown;
}): Parseo<Login> {
  const r = login.safeParse(form);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Datos inválidos." };
  return { ok: true, datos: r.data };
}

/**
 * Lo que se pide para ELEGIR una contraseña nueva (pantalla *Mi cuenta*).
 *
 * La repetición se pide porque acá no hay red de seguridad: quien se equivoca al tipear una
 * contraseña que nadie más conoce queda afuera y depende de un mail de recuperación.
 */
const contrasenaNueva = z
  .object({
    password: z.string().min(LARGO_MINIMO, `Poné al menos ${LARGO_MINIMO} caracteres.`),
    repetida: z.string(),
  })
  .refine((v) => v.password === v.repetida, {
    message: "Las dos contraseñas no coinciden.",
    path: ["repetida"],
  });

export function parseContrasenaNueva(form: {
  password: unknown;
  repetida: unknown;
}): Parseo<string> {
  const r = contrasenaNueva.safeParse(form);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Datos inválidos." };
  return { ok: true, datos: r.data.password };
}

/** Los estados con los que `/login` se vuelve a dibujar. El texto de cada uno vive en la página. */
export type EstadoDeLogin = "credenciales" | "espera" | "suspendida";

/**
 * El error de Supabase traducido al estado que la pantalla sabe mostrar.
 *
 * 🔒 **La regla que gobierna esta función: no filtrar quién existe.** Es la misma política que el
 * magic link ya declara (`shouldCreateUser: false` + un solo mensaje para todos sus fallos). Una
 * puerta que contesta distinto ante "ese mail no tiene cuenta" y "esa contraseña está mal" es un
 * oráculo: con una lista de mails te dice cuáles son del equipo, sin acertar una sola contraseña.
 *
 * Por eso `invalid_credentials` y `email_not_confirmed` caen en el MISMO estado. **El segundo no es
 * un borde**: una cuenta invitada que nunca aceptó la invitación existe en `auth.users` sin
 * confirmar, y hoy tenemos 9 altas hechas con `inviteUserByEmail`. El motivo real va al log del
 * servidor —que es donde un dev puede distinguirlos— y nunca a la pantalla.
 *
 * 🔑 **Devuelve un estado y no un texto, y ahí está la mitad de la protección:** el estado viaja en
 * el query string (`/login?estado=…`), así que un mapeo a texto que distinguiera los casos igual
 * habría publicado la diferencia en la URL. Con tres estados posibles no hay dónde filtrarlo.
 *
 * La excepción es el rate limit, y no es una inconsistencia: un 429 no depende de quién sos ni de
 * si acertaste, así que no revela nada — y callarlo sería peor, porque manda a alguien a reintentar
 * justo lo que lo tiene frenado.
 */
export function estadoDeError(codigo: string | undefined, status?: number): EstadoDeLogin {
  if (
    codigo === "over_request_rate_limit" ||
    codigo === "over_email_send_rate_limit" ||
    status === 429
  ) {
    return "espera";
  }
  if (codigo === "user_banned") return "suspendida";
  return "credenciales";
}
