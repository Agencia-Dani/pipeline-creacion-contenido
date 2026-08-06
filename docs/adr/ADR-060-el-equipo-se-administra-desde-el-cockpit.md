# ADR-060 — El equipo se administra desde el cockpit, y la autoridad se parte en dos

- **Estado:** aceptada — 2026-08-06. **Enmienda [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md)**
  (el alta deja de ser manual: se cruzó su disparador), **[ADR-052](./ADR-052-el-sponsor-externo-no-ve-el-costo-del-proveedor.md)**
  (el gate de costos pasa a `dev` y además baja a la base) y **[ADR-056](./ADR-056-las-zonas-son-rol-interseccion-pipeline.md)**
  (hay una zona más). Toca `core/`: la migración `025`. Es el carril A de
  [plan-multi-tenant §15.A](../agents/plan-multi-tenant.md).

> **Se escribe ANTES de construir, y eso es la mitad del punto.** [ADR-058](./ADR-058-el-flip-de-la-capa-2.md)
> se escribió después de ejecutar, y el resultado fue el mismo flip hecho **dos veces el mismo día**
> por dos sesiones que no se vieron. Acá hay dos agentes en paralelo otra vez (§15.C), así que el
> orden se invierte a propósito.

- **Contexto:** el 2026-08-06 entran **tres personas de Retia**, empresa cliente y no la agencia.
  Eso cruza el disparador que ADR-051 dejó escrito con todas las letras —*"disparador para
  automatizarla: el primer usuario que no sea de la agencia"*— y deja al descubierto cuatro cosas
  que hasta ayer eran teóricas:

  1. **El alta son tres pasos manuales con un modo de falla mudo.** ADR-051 lo aceptó "una vuelta
     más" con el riesgo sobre la mesa: una membresía con la empresa equivocada mete a alguien en el
     cockpit de otro cliente **sin un solo error**. Con tres altas de golpe, la mitigación (correr
     la query de verificación y leerla fila por fila) es un ritual que alguien va a saltarse.
  2. **La deuda está escrita en la propia `021`** (línea 216): *"una pantalla de accesos —quiénes
     entran a mi empresa— necesitaría una policy nueva; no existe todavía, así que no se escribe"*.
  3. **El flip de la Capa 2 cambió lo que cuesta construirla** (ADR-058, en prod desde el 05/08).
     Antes, una pantalla nueva leía con `service_role` y andaba. Ahora una pantalla sin policy
     devuelve **cero filas o `42501`**, así que la migración va antes que la pantalla y no después.
  4. **Un hallazgo del mismo día, al arreglar el gate de costos** (§15.0.bis, commit `d89ef04`): la
     `021:280` le da `app.tarifas` a **cualquiera** que esté logueado —
     `create policy "cualquiera autenticado lee" … using (true)`— y `v_costos_semana` es
     `security_invoker`. O sea que el gate de costos que acabamos de arreglar **es solo de UI**: la
     regla de la casa es *"la UI esconde, el servidor impide"*, y acá el servidor no impide.

  Y un quinto hecho, **medido contra prod y no supuesto**, que corrige la forma que §15.A le había
  dado a la zona nueva: de los **18 knobs** de `app.ajustes`, **8 son de visibilidad `equipo`**
  (`Mínimo de likes`, `Mínimo de vistas`, `Propuestas por corrida`, los cuatro toggles de
  Instagram/TikTok y `Afinidad mínima de propuesta`). Mover los knobs a una zona que el `operador`
  no ve **le saca a Majo y a Jero ocho perillas que usan**. El plan decía *"`ajustes` para `dev` y
  `sponsor`, no para `operador`"*, y eso era correcto para el **equipo** y equivocado para los
  **knobs**.

- **Decisión:**

  1. **`ajustes` es la 5ª zona, y la ven los tres roles.** Lo que se gatea no es la zona: son sus
     pantallas. `ajustes/motor` (los 18 knobs, mudados tal cual desde `curar/ajustes`) la alcanza
     cualquiera, con el filtro por knob que **ya existe** (`ajustesVisibles`, que al `operador` le
     da 8 de 18); `ajustes/equipo` la alcanzan `dev` y `sponsor`.

     Va **última** en el array de cada rol: `zonaInicial` devuelve el primer elemento, así que
     ponerla antes cambiaría a dónde cae el equipo al entrar. Para el `sponsor`, `entender` sigue
     siendo la primera.

     **Por qué los knobs se mudan igual:** `curar` es *trabajar sobre el material* —feed, descartes,
     voces, referentes— y configurar el motor no es eso. La pista estaba en que `curar/ajustes` era
     la única pantalla de `curar` que no mira una pieza de contenido. Y el equipo **no es del
     pipeline**: existe con o sin motor, así que `ZONAS_POR_PIPELINE` la suma a los dos.

     **`curar/ajustes` queda como `redirect` a `ajustes/motor`**, no como 404. El equipo tiene
     bookmarks y el 404 de la Fase 3 ya cobró ese precio una vez (cierre 89). El redirect es parte
     de la decisión, no un extra que se puede recortar.

     **Las pantallas de `ajustes` se declaran por pipeline, con el mismo molde que `PANTALLAS_CURAR`.**
     No es maquinaria nueva: es el arreglo del 06/08 aplicado a la zona nueva antes de que muerda.
     LinkedIn declara `equipo` y **no** `motor` — `app.ajustes` está vacía para su instancia, así que
     la pantalla cargaría limpia mostrando cero perillas, que en un pipeline recién nacido se lee
     como *"todavía no lo configuramos"* y no como *"esto no es de acá"*. La familia de la `015`.

  2. **El techo de roles: nadie otorga un rol que no tiene.** `puedeAdministrarEquipo(rol)` →
     `dev | sponsor`. `rolesQuePuedeOtorgar(rol, esDueno)` → la agencia otorga los tres; un
     `sponsor` otorga `operador | sponsor` y **nunca `dev`**.

     🔑 **Esto no es higiene, es lo que hace que el gate de costos sea una propiedad y no una
     configuración.** `dev` es exactamente el rol que ve lo que cuestan los proveedores (decisión 4).
     Sin techo, el sponsor de Retia se otorga `dev` a sí mismo desde la pantalla que le acabamos de
     dar y ve el margen de la agencia: la línea del Carril 0 quedaría desarmable desde la UI.

     Vive en `domain/permisos.ts`, puro y con `.test.ts` al lado, **no en las opciones de un
     `<select>`**. Un `<select>` es UI, y la UI esconde.

  3. **La empresa no se elige: sale de `ctx.clientId`.** El modo de falla mudo de ADR-051 —la
     membresía con la empresa equivocada— **desaparece por construcción**, porque no hay dónde
     equivocarse. Es el mejor argumento a favor de la pantalla, y es mejor que la mitigación que
     ADR-051 aceptó (un ritual de verificación que depende de que alguien se acuerde).

  4. **La lectura va por RLS; la escritura, por `service_role`.** La asimetría es la excepción del
     sistema y se nombra acá para que nadie la descubra leyendo el código:

     - **Lectura** por `(await scoped(ctx))` con la sesión ⇒ se evalúan las policies nuevas de la
       `025`. La agencia queda fuera de la lista **por la policy** (`app.usuarios_visibles()`
       excluye `es_dueno`), no por un `.filter()` de React: ADR-051 §3 puso la invisibilidad como
       propiedad del sistema, y una propiedad del sistema no se implementa en el render.
     - **Escritura** por `createAdminClient()` desde la Server Action. **No es conveniencia:**
       `auth.admin.inviteUserByEmail` es la Admin API y **no existe con la clave anon**, e invitar
       crea una fila en `auth.users`, que no es una operación del schema `app` y que **ninguna
       policy puede autorizar**. La `021` §2 ya había dejado `usuarios` y `usuarios_clientes` fuera
       de los `grant insert/update/delete` a propósito; se mantiene.
     - **La autoridad la pone la Server Action**, en este orden y antes de tocar el cliente admin:
       `exigirTenant("ajustes")` → `puedeAdministrarEquipo` → `rolesQuePuedeOtorgar` → Zod →
       recién ahí el admin → `registrarEvento`.

     [`admin.ts`](../../apps/dashboard/lib/supabase/admin.ts) dice *"si aparece un cuarto [portador
     de `service_role`], la pregunta es por qué no tiene sesión, no cómo darle service_role"*. Esta
     es el cuarto, y la respuesta es la de arriba: **no tiene sesión con la que hacerlo, tiene
     sesión con la que autorizarlo.** El riesgo que se asume, escrito: una Server Action con
     `service_role` que se equivoque de `client_id` escribe en cualquier empresa. Por eso el
     `client_id` no es un parámetro.

  5. **El gate de costos baja a la base** (enmienda ADR-052, cierra el hallazgo 4 del contexto). La
     `025` reemplaza el `using (true)` de `app.tarifas` por *"solo quien sea `dev` en alguna
     membresía, o dueño"*. Efecto: un `operador` que llegue a `v_costos_semana` por fuera de la
     pantalla —PostgREST con su propia sesión— obtiene **cero filas** en vez del margen.

     No rompe nada, y está medido: **n8n nunca lee `app.tarifas`** (`grep` sobre `Workflows/` y
     `core/`: la única mención es una línea de prosa en `ingesta-registro.md`), el costo se calcula
     y no se guarda, y la fachada bypassa RLS igual.

     ⚠️ **La base no puede saber qué cockpit está abierto**, así que la policy dice *"esta persona
     puede ver costos"* y el gate de la pantalla dice *"acá"*. Es la misma asimetría que la `021` §3
     ya explica para `scoped.ts`, y por la misma razón **ninguna de las dos sobra**.

- **Alternativas descartadas:**
  - **Dejar los knobs en `curar` y que `ajustes` sea solo el equipo.** Es el cambio más chico y fue
    la primera forma del plan. Descartada porque deja **dos lugares que se llaman "configurar"** en
    el mismo cockpit, y porque la pregunta *"¿dónde toco el mínimo de vistas?"* pasa a tener dos
    respuestas plausibles. El costo de mudarlas es un `redirect`.
  - **Seguir §15.A al pie de la letra: `ajustes` para `dev` y `sponsor`.** Es lo que se iba a
    construir, y lo descarta un número: **8 de 18 knobs son del equipo de redes**. Habría sacado de
    circulación perillas que Majo y Jero usan, sin error y sin aviso — descubierto por medición
    contra prod, no razonando sobre el plan.
  - **Que el `operador` administre el equipo.** El que califica el feed no da accesos. Y con Retia
    adentro, "operador" ya no significa "gente de la agencia".
  - **Que un `sponsor` pueda otorgar `dev`.** Ver decisión 2: desarma el Carril 0 desde la UI.
  - **Escribir el alta con la sesión del usuario, dando `insert/update/delete` sobre
    `usuarios_clientes` y dejando que un `with check` imponga el techo.** Es la opción simétrica y
    se consideró en serio: pondría el techo de roles en la base, que es donde más aguanta.
    Descartada por dos razones que se suman: `inviteUserByEmail` necesita la Admin API **de todas
    formas**, así que la Server Action va a tener `service_role` en la mano igual, y **dos
    autoridades para el mismo acto es peor que una** (¿cuál manda cuando discrepan?); y el `with
    check` que expresa *"no otorgues un rol mayor al tuyo"* es una subconsulta sobre la tabla que se
    está escribiendo — la recursión de la `021` §1, que se resuelve con otra función `security
    definer` más. Se reabre si alguna vez algo que no sea el cockpit escribe membresías.
  - **Sacar `app.tarifas` de la base**, que ADR-052 ya había descartado: el problema nunca fue dónde
    vive la tarifa.

- **Consecuencias:**
  - (+) El alta pasa de **tres pasos de SQL a un acto**, y con ella se va el modo de falla mudo que
    ADR-051 aceptó por una vuelta. El runbook `agregar-cliente.md` (B4 del carril B) cambia de
    forma: por eso B4 va después de A5.
  - (+) *"¿Quiénes entran a mi empresa?"* deja de ser una query del SQL Editor y pasa a ser una
    pantalla que el cliente se contesta solo.
  - (+) El gate de costos deja de ser solo UI: hoy es una línea de TypeScript, después es una línea
    de TypeScript **y** una policy.
  - (−) **Un cuarto portador de `service_role`**, y el único que además escribe. Los otros tres
    (fachada, `lib/tenant.ts`, proxy de miniaturas) solo leen.
  - (−) Una zona más en `ZONAS`, `ZONAS_POR_ROL` y `ZONAS_POR_PIPELINE`, más una segunda tabla de
    pantallas-por-pipeline. Es duplicación de forma con `PANTALLAS_CURAR`; si aparece una tercera
    zona con pantallas, ahí se generaliza — no antes.
  - (−) **Los operadores dejan de ver los costos**, y eso incluye a Majo y a Jero. Es intencional
    (Carril 0) y es el precio de que el gate no dependa de quién trabaja dónde.
  - (−) La `025` lleva **gate humano y se verifica por su efecto**, no por haber corrido sin error.
    Es la lección de la `019`, que se dio por aplicada el 03/08 y no había entrado (§14.1).
  - (−) `app.usuarios_clientes` entra al mapa de `scoped.ts` y la entrada mentirosa de `app.usuarios`
    se corrige: hoy declara grano `"cliente"` ⇒ filtraría por `client_id`, **columna que la `019`
    dropeó**. Nadie lo ejerce porque `lib/auth.ts` lee esa tabla con `createClient()` directo, y
    esta pantalla sería la primera en tocarlo.

- **Toca:** `core/schema/025_accesos.sql` (`app.usuarios_visibles()`, policies de `select` en
  `app.usuarios` y `app.usuarios_clientes`, la de `app.tarifas`) · `apps/dashboard/domain/permisos.ts`
  (+ test) · `domain/roles.ts` · `domain/pipelines.ts` · `lib/supabase/scoped.ts` · `lib/equipo.ts` ·
  `app/[cliente]/[pipeline]/(zonas)/ajustes/**` · el `redirect` en `curar/ajustes`.
  **No toca n8n, ni el motor, ni `core/contracts/`.**
