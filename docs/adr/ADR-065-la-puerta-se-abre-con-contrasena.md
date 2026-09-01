# ADR-065 — La puerta se abre con contraseña, y el link queda de repuesto

- **Estado:** aceptada — 2026-08-07. **Enmienda [ADR-026](./ADR-026-stack-del-cockpit-propio.md)**
  en su única mitad de auth (el stack sigue siendo Supabase Auth; cambia con qué se entra). Sale de
  un pedido de Mani. **No toca `core/`.**

## Contexto

Desde D0 la única puerta del cockpit fue el **magic link**. Funciona, pero cada entrada cuesta un
correo — y el costo real apareció cuando hubo que usar **dos cuentas**: probar que el rol `operador`
no ve los costos, o que dos personas en Operar se enteran una de la otra, pide dos sesiones, y cada
salto entre ellas es otro correo.

**Lo que se midió antes de decidir nada, porque el diagnóstico obvio era el equivocado:**

| Hecho | Cómo se supo |
|---|---|
| La cookie **no** expira: `maxAge` de 400 días | `DEFAULT_COOKIE_OPTIONS` de `@supabase/ssr` 0.12.3 |
| El refresh de sesión está bien hecho | [`proxy.ts`](../../apps/dashboard/proxy.ts) llama `getUser()` sin lógica en el medio (el gotcha documentado de `@supabase/ssr`) |
| **La sesión es una sola por dominio y por perfil de navegador** | forma de `sb-<ref>-auth-token` |
| Prod solo tiene email: `google:false`, todo OAuth en `false`, `passkeys_enabled:false` | sondeo a `GET /auth/v1/settings` |

⇒ **El "correo cada vez" no era una sesión que vencía: era la cuenta B pisando la de A.** Sin esa
medición, el arreglo natural habría sido alargar la sesión —que ya duraba 400 días— y el problema
habría seguido intacto.

Y el costo no era teórico: **dos ítems de verificación humana llevaban días abiertos por esto** — A7
(dos personas en Operar) y el clic a la tanda de [ADR-064](./ADR-064-la-tanda-es-el-pegote-no-el-procesamiento.md),
construida, deployada y sin que nadie la abriera.

## Decisión

### 1. Mail + contraseña es la puerta; el link es la salida de emergencia

`signInWithPassword` sobre **las mismas cuentas que ya existen**: no se recrea a nadie, las 9 altas
siguen siendo las de `inviteUserByEmail`. `enviarMagicLink` **no se toca** y queda plegado en
`/login` bajo *"No tengo contraseña, o me la olvidé"*, porque sigue siendo el camino de dos casos
reales: **toda alta nueva empieza sin contraseña**, y el que la olvida no tiene otro modo de entrar.

### 2. El largo se valida al ELEGIR una contraseña, nunca al chequearla

`LARGO_MINIMO` gobierna *Mi cuenta*; `/login` solo exige que no esté vacía. Reusar la constante en
los dos lados es la tentación obvia y **es un bug con fecha de activación**: el día que el mínimo
suba, todo el que tenga una contraseña más corta deja de entrar —con *"contraseña incorrecta"*, que
ni siquiera dice por qué— sin que nadie haya tocado su cuenta. Hay un test que sostiene la propiedad.

⚠️ El mínimo **tiene que estar también en Supabase** (Auth → Password Requirements): `updateUser` es
una API pública, y si la base es más laxa la constante es decorativa.

### 3. La puerta no contesta quién existe

`estadoDeError()` colapsa `invalid_credentials` y `email_not_confirmed` en **el mismo estado**. El
segundo no es un borde: una cuenta invitada que nunca aceptó la invitación existe en `auth.users` sin
confirmar, y las 9 nacieron así. Distinguirlos convierte el login en un **oráculo de enumeración** —
con una lista de mails te dice cuáles son del equipo sin acertar una sola contraseña.

🔑 **Devuelve un estado (tres valores) y no un texto, y ahí está la mitad de la protección:** el
estado viaja en el query string, así que un mapeo a texto que distinguiera los casos igual habría
publicado la diferencia en la URL. El motivo real va al **log del servidor**, que es donde un dev
puede leerlo — y ahí `email_not_confirmed` significa algo accionable: a esa cuenta hay que
confirmarle el mail, no ponerle otra contraseña.

El **rate limit sí** tiene su propio estado, y no es una inconsistencia: un 429 no depende de quién
sos ni de si acertaste, así que no revela nada, y callarlo manda a la persona a reintentar justo lo
que la tiene frenada.

### 4. La contraseña se la pone cada uno, y no se pide la actual

Pantalla `/mi-cuenta` (fuera de `[cliente]/[pipeline]`, porque la contraseña es de la persona y no
de la empresa: quien tiene dos membresías tiene una sola contraseña). Sin gate de rol.

**No pedir la contraseña actual es una decisión, no un olvido:** quien acaba de entrar por el link
**no tiene ninguna**, que es exactamente el caso que esta pantalla existe para resolver. La prueba de
identidad es la sesión — una cookie del navegador de esa persona. Si algún día se quiere el doble
chequeo, la palanca es de configuración y ya existe: *Secure password change* en Supabase.

### 5. Lo que hay que cerrar en Supabase, que no es código

- **Password Requirements** al mismo mínimo que valida la app (§2).
- **Cerrar el signup** del provider Email: el alta es manual desde [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md) y hoy `disable_signup` es `false`, así que cualquiera puede crear una fila en `auth.users` pegándole a la API. No da acceso a datos —cae en `/sin-rol` y RLS le da cero— pero no debería poder entrar.
- **Confirmar que no hay session timebox ni inactivity timeout** (Auth → Sessions). Si estuvieran prendidos, explican el re-login y **nada de esta ADR lo evita**.

## Lo que se descartó

- **OAuth de Google.** Es la mejor UX en abstracto (un clic, selector de cuentas nativo) y se
  descartó por pedido de Mani: pide configurar dos consolas ajenas al repo, y **habilita que
  cualquier cuenta de Google cree una fila en `auth.users`** — inofensiva por RLS, pero es superficie
  que nadie pidió. La contraseña resuelve el mismo dolor con una API que ya está encendida.
- **Código de 6 dígitos en vez de link.** Arregla el *"el link ya no sirve"* por cross-device, pero
  **sigue costando un correo por entrada**, que era el problema.
- **Un script dev-only que mine links con `service_role`.** Resolvía el dolor del dev y dejaba al
  equipo con el mismo login. Si la puerta es incómoda, se arregla la puerta.

## Consecuencias

**Lo que se gana:** entrar deja de depender del correo, y con él de Resend y su dominio verificado
—que hasta hoy era camino crítico del login y ya se cayó dos veces (cierres 64 y 65)—. Alternar
cuentas pasa de un correo a tres segundos.

**El costo que se asume, por escrito:** se abre una superficie de contraseñas (fuerza bruta,
contraseñas débiles, reuso). Se mitiga con cuatro cosas y ninguna sola alcanza: el signup cerrado
(§5), el rate limit nativo de Supabase, los requisitos de largo en la base **y** en la app, y un alta
que sigue siendo de un admin. **No hay registro público: sigue sin haber forma de crearse una cuenta
desde la app.**

**Lo que esta ADR NO arregla, y conviene no confundir:** dos sesiones **vivas a la vez** siguen
necesitando dos perfiles de navegador, porque la cookie es una por dominio y perfil. La contraseña
abarata el salto; no lo elimina. Está escrito en
[verificaciones-humanas §4-bis](../verificaciones-humanas.md), que es donde alguien lo va a leer
justo cuando lo necesite.
