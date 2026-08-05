# ADR-058 — El flip de la Capa 2: la autoridad viaja en el contexto, y la ventana se cierra en vez de suspenderse

- **Estado:** aceptada — 2026-08-05, **escrita después de ejecutar** (`d8edea2`, y el cierre 95 del
  handoff). Ejecuta el **paso 2 de 2** de la Capa 2 de [ADR-047](./ADR-047-aislamiento-en-dos-capas.md)
  ([plan multi-tenant §9 y §14.3](../agents/plan-multi-tenant.md)), cuyo paso 1 —la
  [`021`](../../core/schema/021_rls_capa_2.sql)— estaba aplicada e **inerte** desde el 2026-08-03.
  **Enmienda dos cosas de ADR-047**: la regla de qué hacer cuando el disparador se cumple, y la
  descripción del flip como *"un cambio de una línea"*.

  > ⚠️ **Este ADR se escribió con el código ya en `main`, y eso es un desvío del propio repo**
  > (*`core/` solo cambia con ADR*, y una decisión estructural se escribe antes). Queda dicho porque
  > el orden explica una cosa: el flip se ejecutó **dos veces en paralelo el mismo día**, por dos
  > sesiones que no se vieron, y las dos llegaron al mismo diseño —mismo campo, mismos dos valores,
  > mismos dos constructores—. Que converjan no lo valida: significa que la decisión era forzada por
  > la forma del código y que **escribirla antes habría ahorrado un día de trabajo duplicado.**

- **Contexto:** tres hechos medidos contra prod el 2026-08-05, ninguno anotado en el handoff ni en el
  plan hasta ese día, que juntos cambian qué es este paso.

  **1. El disparador de ADR-047 ya se había cruzado.** Su regla es textual: *"la Capa 2 entra ANTES
  de que un segundo cliente real tenga usuarios entrando al cockpit en producción — no antes, no
  después"*. Medido por PostgREST:

  | | Docs (handoff cierre 94, plan §0, `CLAUDE.md`) | **Prod, 2026-08-05** |
  |---|---|---|
  | `app.usuarios` | 5 | **6** |
  | `app.usuarios_clientes` | 5 filas, **todas `retia`** | **7: 5 `retia` + 1 `30x` + 1 `estadox`** |
  | `app.voces` | 3, todas `retia` | **4 — una es de `30x`** |

  La persona con las dos membresías nuevas (`30x` y `estadox`, operador en las dos) es **la primera
  que alcanza dos empresas**, o sea exactamente el caso que [`scoped.ts`](../../apps/dashboard/lib/supabase/scoped.ts)
  señala como el peligroso. Y `30x/linkedin` no es un cockpit vacío: `linkedin` implementa
  `operar`/`curar`/`entender` ([ADR-056](./ADR-056-las-zonas-son-rol-interseccion-pipeline.md)) y esas
  pantallas leen las tablas de grano empresa — la voz de `30x` entró por ahí. **El segundo tenant no
  estaba dado de alta: estaba en uso.**

  **2. El flip no era "una línea", y no por el tamaño del diff.** La `021` y el plan lo describían
  como *"un cambio de código aparte, de una línea, y revertible"*. Medido, `scoped()` sirve a **dos
  llamadores con autoridades distintas**, y la fachada llega por dos saltos transitivos:

  ```
  app/api/engine/run-plan/route.ts → leerRunPlanCrudo(ctx) → lib/config.ts
                                   → leerAjustes · leerProyectos · leerVoces · leerReferentes
                                   → scoped(ctx)
  ```

  **La fachada de [ADR-028](./ADR-028-contrato-motor-run-plan.md) comparte `scoped()` con el
  cockpit**, y n8n no tiene cookie. Un cambio en bloque la dejaba entrando como anónima: sin
  `auth.uid()` no hay policy contra la cual evaluar, `app.*` responde `42501 permission denied for
  schema app`, el `catch` de la ruta devuelve **503** y **ninguna corrida arranca**. El plan decía
  *"la fachada y n8n no se tocan"* — cierto como intención, falso como código, y **nadie lo tenía
  escrito porque llega por dos saltos.**

  **3. Ninguna pantalla puede probar que el flip tomó efecto.** La Capa 1 filtra por el cockpit
  abierto *antes* de que RLS opine, así que un operador de Retia ve sus 3 voces con RLS y sin RLS. Un
  flip deployado que **no** tomara efecto se vería idéntico a uno que funciona. Es la familia de la
  [`015`](../../core/schema/015_salud_referentes_una_fila.sql) —*"no falla, no avisa, y deja un
  número que se ve razonable y está mal"*— y el mismo modo de falla que dejó la `019`
  corrida-pero-no-aplicada durante un día.

- **Decisión:** tres, y las tres se siguen de los hechos de arriba.

  **A · La autoridad viaja en el `TenantContext`, no en un parámetro de `scoped()`.** El contexto gana
  `origen: 'sesion' | 'fachada'`, estampado en los **dos únicos constructores que existen**:
  `armarContexto()` (dominio, exige un `Alcance`, o sea alguien logueado) y `contextoDeFachada()`
  (`lib/tenant.ts`, header compartido). `scoped()` elige cliente a partir de eso y pasa a `async`
  (el cliente de sesión necesita `await cookies()`).

  Por qué en el contexto y no como parámetro: **un parámetro se puede pasar mal, y el error tiene una
  dirección peligrosa y silenciosa.** Declarar `"fachada"` en una pantalla saltea RLS sin romper nada
  —ninguna pantalla falla, ningún test se pone rojo—; declarar `"sesion"` en la fachada rompe fuerte y
  se ve. Viniendo del contexto no hay nada que hilar (cada función ya recibe `ctx`) y **un constructor
  nuevo no compila hasta declarar de dónde saca la autoridad.** Es el mismo principio que el mapa
  tabla→grano de `scoped.ts`: la decisión se hace imposible de omitir en vez de recordable, que es lo
  que ADR-047 ya había elegido al descartar el helper opcional.

  **B · La ventana se cierra haciendo el flip, no suspendiendo cockpits.** ADR-047 manda *"se retrasa
  el segundo cockpit, no la Capa 2"*. **No se aplicó**, y el motivo es que esa regla se escribió
  cuando el segundo cockpit era hipotético y retrasarlo costaba cero. Cuando el disparador llegó de
  verdad, costaba sacarle la herramienta a alguien que la estaba usando, por un riesgo **hipotético**:
  la Capa 1 estaba entera y la impone el compilador —los 34 call sites pasan por `scoped()` y
  `scoped.ts` no expone el query builder crudo por ningún camino—, así que lo que faltaba no era un
  agujero conocido sino la red bajo un bug que nadie midió. La ventana se cerró por arriba.

  **C · `lib/tenant.ts` se queda en `service_role`, y el selector queda con Capa 1 sola.** No entra al
  flip: `contextoDeFachada()` e `instanciasDePipeline()` (el dispatcher,
  [ADR-050](./ADR-050-dispatcher-una-ejecucion-por-instancia.md)) también llaman a `leerInstancias()`
  y **tampoco tienen sesión**, así que meterlo obligaría a enhebrar el origen por una segunda
  superficie — y un error ahí no rompe una pantalla, rompe el login. Es una decisión, no un olvido, y
  su seguimiento está en el plan §14.

- **Alternativas descartadas:**
  - **Dos funciones (`scoped()` y `scopedDeServicio()`).** Diff más chico y sin `async` contagioso.
    Descartada por lo dicho en **A**: elegir mal es silencioso justo en la dirección peligrosa.
  - **Que `scoped()` detecte la sesión en runtime y caiga a `service_role` si no hay.** Cero cambios
    en los llamadores. Descartada por fail-**open**: convierte *"no llegó la cookie"* en *"entrá como
    root"*, al revés de todo el resto del sistema.
  - **Duplicar la lectura de config para la fachada.** Separación total, sin discriminante. Descartada:
    deja dos verdades sobre cómo se arma el run-plan, que es lo que `CLAUDE.md` prohíbe (*un hecho, un
    dueño*).
  - **Flag por env var, para revertir sin redeploy.** Descartada porque deja el camino peligroso
    (`service_role` para todo) alcanzable en prod indefinidamente, y ningún flag de este tipo se borra
    solo.
  - **Pasar `30x/linkedin` y `estadox/linkedin` a `draft`.** Es la regla escrita de ADR-047 al pie de
    la letra, y una sola sentencia SQL. Descartada por la razón de la decisión **B**.

- **Consecuencias:**
  - (+) **El aislamiento entre las tres empresas dejó de ser solo TypeScript.** Es lo único que este
    paso compra, y es todo el punto.
  - (+) La superficie estaba verificada de antemano: las **11** tablas que la sesión escribe están las
    11 en el `grant insert, update, delete` de la `021` §2; `runs`/`outputs`/`processed_items` solo se
    leen desde el cockpit; y el cliente de sesión **ya funcionaba en prod** (`usuarioActual()` lee
    `app.usuarios` con él), o sea que el flip extendió un camino probado en vez de estrenar uno.
  - (−) `scoped()` es `async`: **34 llamadas** en `lib/` pasan por `await (await scoped(ctx))`. Es
    mecánico y el compilador produce la lista entera, igual que en la Capa 1.
  - (−) **Verificar el flip exige un instrumento aparte, y no vale con cuenta de dueño.** Lo que se
    midió en prod: con una cuenta **no dueña**, una lectura sin filtro de tenant devolvió **3 de las 4
    voces** que ve `service_role` — la base ocultó una fila sin que ningún código de la app
    interviniera. Con una cuenta `es_dueno` los dos números **coinciden por diseño**
    (`app.clientes_visibles()` le devuelve todas las empresas), así que esa medición no prueba nada. Y
    las zonas se recorrieron logueado: **Entender carga con datos**, que era el riesgo concentrado —
    sus 12 vistas corren `security_invoker` y necesitan que el usuario alcance `clients`/`instances`/
    `workflows`.
  - (−) **La ventana de ADR-047 existió y esto la registra como tal**, no la borra. Entre que el
    segundo tenant tuvo usuarios y el flip, tres empresas convivieron con aislamiento de aplicación.
    No hubo fuga conocida; tampoco había nada abajo si la hubiera habido.
  - (−) Los docs de estado (`handoff`, plan §0, `CLAUDE.md`) estaban **desactualizados en el hecho que
    más importaba**: daban 5 usuarios y 5 membresías todas de Retia. La lección repite la de la `019`
    en la dirección contraria: *el estado del sistema no se lee del handoff, se mide.*

- **Toca:** `apps/dashboard/domain/tenant.ts` (el tipo `Origen` + el campo, con test) ·
  `lib/supabase/scoped.ts` (elige cliente; pasa a `async`) · `lib/tenant.ts` (estampa `"fachada"`) ·
  los archivos de `lib/` que llaman a `scoped()`. **No toca `core/`**: la `021` ya estaba aplicada, y
  este ADR no cambia una línea de SQL.
