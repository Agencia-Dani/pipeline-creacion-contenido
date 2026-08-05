# ADR-047 — El aislamiento va en dos capas: el compilador ahora, RLS después (con disparador escrito)

- **Estado:** aceptada — 2026-08-02 · **Capa 2 ejecutada el 2026-08-05.**
  ⚠️ **El disparador de más abajo se cumplió, y la regla que lo acompaña NO se aplicó: no se
  suspendió ningún cockpit.** Qué se hizo en su lugar y por qué está en
  **[ADR-058](./ADR-058-el-flip-de-la-capa-2.md)**, que además enmienda la descripción del flip como
  *"un cambio de una línea"* — la fachada comparte `scoped()` con el cockpit por dos saltos
  transitivos. **Si venís por la regla del disparador, seguí por ahí.**

  Es la segunda mitad de la decisión **A** del
  [plan multi-tenant §2](../agents/plan-multi-tenant.md) (§5 y §9 son las fases).
  Implementa lo que [ADR-046](./ADR-046-el-cockpit-es-multi-tenant.md) deja escrito en el schema, y
  **enmienda la nota de alcance** de la migración [`011`](../../core/schema/011_grants_app_service_role.sql).

- **Contexto:** poner `client_id`/`instance_id` en las tablas no aísla nada por sí solo. Alguien tiene
  que filtrar, y hoy **no hay nada bajo el aislamiento**:

  1. **Todo `apps/dashboard/lib/*.ts` entra con `createAdminClient()`** — `service_role`, que
     **bypassa RLS por definición**.
  2. **`app.*` tiene RLS activado *sin policies*.** Eso significa *"solo entra el service_role"*, **no**
     *"cada quien ve lo suyo"*. Es una puerta cerrada, no un filtro.
  3. **`usuarioActual()` no devuelve tenant** — `{ id, email, nombre, rol }`, y `app.usuarios` es
     `(id, nombre, rol, creado_en)`.

  Traducido: con dos empresas, el aislamiento dependería al 100% de que cada una de las ~15 funciones
  de `lib/` **se acuerde** de filtrar. Y el modo de falla real no es un atacante: es un `.eq()`
  olvidado, que **no falla, no avisa, y devuelve datos verosímiles de otra empresa**.

  > Es exactamente la familia de fallo que este repo ya documentó tres veces —la vista que daba 18
  > filas para 17 referentes ([`015`](../../core/schema/015_salud_referentes_una_fila.sql)), la
  > descripción falsa de *Candidatos por corrida*, la hora corrida 5 h por `toLocaleString` sin
  > `timeZone`. La `015` lo dice textual: *"no falla, no avisa, y deja un número que se ve razonable y
  > está mal."*

- **Decisión:** **dos capas, y en este orden.**

  **Capa 1 — el compilador (entra ya, con ADR-046).** Un `TenantContext` **obligatorio y tipado**
  atraviesa `lib/`, y el acceso a Supabase se envuelve de forma que **no se pueda construir una query
  sin él**. El mapa tabla→grano (`client_id in (visibles)` vs `instance_id = …`) vive en **un solo
  archivo**, y una tabla nueva sin entrada ahí **no compila**. Convierte *"acordate de filtrar"* en un
  **error de compilación**, que es la única forma conocida de ganarle a un `.eq()` olvidado.

  **Capa 2 — la base (fase propia, al final).** Policies de RLS en `app.*`, el BFF deja de leer con
  `createAdminClient()` y pasa a la sesión del usuario, y `service_role` queda **solo** para la fachada
  y las escrituras de n8n. Es el último freno: lo que atrapa lo que la Capa 1 no ve, incluido un bug de
  la Capa 1 misma.

  **El disparador de la Capa 2, escrito para que no quede a criterio de nadie:**

  > **La Capa 2 entra ANTES de que un segundo cliente real tenga usuarios entrando al cockpit en
  > producción — no antes, no después.**
  >
  > - **No antes**, porque revierte parte de [`011`](../../core/schema/011_grants_app_service_role.sql)
  >   y toca el camino de datos que hoy funciona con un solo tenant, donde no compra nada.
  > - **No después**, porque a partir de ahí el único aislamiento en producción sería el código de
  >   `lib/`, y un bug ahí es una **fuga entre empresas**, no un dato feo.
  > - La **instancia de prueba** de la verificación end-to-end ([plan §11.3](../agents/plan-multi-tenant.md))
  >   **no dispara** la Capa 2: es un cliente ficticio, sin usuarios y sin datos de nadie. Ese es
  >   justamente el punto de que exista.
  > - Si el disparador llega y la Capa 2 no está lista, **se retrasa el segundo cockpit**, no la Capa 2.

  **La Capa 1 no se salta aunque la Capa 2 esté hecha.** RLS filtra por el usuario de la sesión, y hay
  dos caminos que no tienen sesión de usuario: la fachada de
  [ADR-028](./ADR-028-contrato-motor-run-plan.md) y las escrituras de n8n de
  [ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md). Ahí el único filtro posible es el
  tipado. No son capas redundantes: cubren superficies distintas.

- **Alternativas descartadas:**
  - **Solo RLS, ya.** La opción "correcta de libro" y la más tentadora. Descartada como *primer* paso
    por secuenciación, no por mérito: es la fase con más riesgo de romper lo que funciona (ver
    consecuencias), no cubre la fachada ni a n8n (que entran con `service_role` por diseño), y **no se
    verifica con `typecheck`** — se verifica en producción, contra datos reales, que es donde este repo
    no quiere descubrir cosas.
  - **Solo tipos, nunca RLS.** Descartada porque deja el aislamiento entero apoyado en una sola capa
    de código de aplicación. Con datos de tres empresas distintas en la misma base, un solo bug es una
    fuga; la base tiene que poder decir que no.
  - **Un helper `conTenant()` opcional que hay que acordarse de usar.** Es la versión de la Capa 1 que
    no funciona: no cambia nada respecto a hoy, porque el problema nunca fue que no existiera la
    función — es que se puede no llamarla.
  - **Filtrar dentro de las vistas SQL.** Descartada en el mismo movimiento: las vistas **exponen** el
    eje de tenant y el filtro lo pone `lib/`. Filtrar adentro las volvería single-tenant otra vez y
    dejaría a las policies de la Capa 2 sin nada sobre qué actuar.

- **Consecuencias:**
  - (+) **La Capa 1 no toca producción.** Es mecánica, y `npm run typecheck` **produce la lista de
    trabajo y no deja terminar hasta que esté vacía** — ese es el punto entero de la fase, y por eso no
    hay que enumerar los archivos a mano.
  - (+) `domain/` no cambia salvo por el archivo nuevo: los 138 tests existentes son la red que dice
    que el refactor no cambió comportamiento.
  - (−) **La Capa 2 es la fase con más riesgo del refactor, y hay que saber por qué antes de empezar.**
    La `011` existe porque *"`service_role` tiene BYPASSRLS, pero saltear RLS NO otorga USAGE sobre el
    schema ni privilegios sobre las tablas: Postgres los pide igual, y Supabase solo auto-otorga sobre
    `public`"*. Volver a leer con el rol `authenticated` sobre un schema propio necesita **sus propios
    grants Y sus policies**. Por eso va sola, al final, y con disparador.
  - (−) Entre la Capa 1 y la Capa 2 hay una **ventana declarada** donde el aislamiento es solo de
    aplicación. Es aceptable únicamente porque el disparador la cierra antes del segundo cliente real.
  - (−) Las pruebas de fuga (§11.2 del plan) **van contra la base, no con mocks**: un mock no atrapa un
    `.eq()` olvidado, que es literalmente el bug que se está previniendo.
  - **`proxy.ts` no cambia.** Sigue siendo el chequeo optimista de sesión y la autoridad sigue en cada
    página. Su excepción para `/api/engine` sigue siendo necesaria: un redirect a `/login` ahí sería un
    200 con HTML para n8n, o sea el fail-closed roto.

- **Toca:** `apps/dashboard/domain/tenant.ts` (nuevo, puro, con test) · `lib/supabase/scoped.ts`
  (nuevo) · `lib/auth.ts` · los ~15 archivos de `lib/` · más adelante, las policies y los grants de la
  Fase 6. **Enmienda el alcance de [`011`](../../core/schema/011_grants_app_service_role.sql)**: su
  *"acá solo se habilita al service_role, que es el único que entra por el BFF"* deja de ser el estado
  final y pasa a ser el estado **hasta la Capa 2**.
