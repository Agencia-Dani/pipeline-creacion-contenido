# ADR-068 — El pipeline lo dice la instancia, no el que pregunta

- **Estado:** aceptada — 2026-08-09. **Extiende [ADR-028](./ADR-028-contrato-motor-run-plan.md)**
  (la fachada) y **[ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md)** (`?instancia` obligatorio),
  y le da a [ADR-055](./ADR-055-linkedin-es-un-pipeline-de-este-repo.md) la primera pieza de motor que
  existe de verdad. **Toca `core/`:** [`core/contracts/run-plan.md`](../../core/contracts/run-plan.md).

- **Contexto.** El cockpit de LinkedIn quedó completo el 08/08 (ADR-066, ADR-067) y lo que sigue es el
  motor en n8n. Al inventariar qué le falta al tooling apareció esto, medido y escrito en el handoff
  del cierre 106:

  > `GET /api/engine/run-plan?ambito=linkedin` — 🔴 **da 400 hoy** — `route.ts` acepta solo
  > `motor|completo`, y el `workflow.yaml` de LinkedIn **ya declara ese ámbito**. Es lo primero que se
  > va a chocar.
  >
  > `leerRunPlanCrudo` (`lib/config.ts`) — **no tiene rama por pipeline**: llena el plan siempre desde
  > las tablas de reels.

  Los dos renglones parecen el mismo bug con dos caras, y **no lo son**. El 400 es el síntoma barato:
  falla ruidoso, aborta la corrida, se diagnostica en un minuto. El segundo es el caro, y sigue vivo
  aunque se arregle el primero de la forma obvia.

  🩸 **El fallo que importa no produce un error, produce un plan ajeno.** `leerRunPlanCrudo` lee
  `app.voces`, `app.proyectos`, `app.referentes` y `app.ajustes` filtradas por el contexto del tenant.
  Un motor de LinkedIn que le pidiera su plan a la fachada **no recibiría un 500**: recibiría el plan
  de **reels** de esa misma empresa, bien formado y con la `N` resuelta. Es la familia de la `015` y
  la de ADR-066: no se ve mirando si "vino algo".

  📏 **Medido contra producción el 09/08, y el número corrige la versión intuitiva de esta frase.**
  Se le pidió el plan a las dos instancias de LinkedIn que están `active`, con el header real y sin
  escribir nada:

  | | Hoy | El día que se prenda `retia/linkedin` |
  |---|---|---|
  | `30x/linkedin`, `estadox/linkedin` | **200 con el plan de reels VACÍO** — `voces`, `proyectos`, `referentes` y `ajustes` en 0 filas, porque las dos empresas tienen cero de todo | igual |
  | `retia/linkedin` | **403** `instancia_desconocida` — está en `draft`, y `leerInstancias()` solo trae las `active` | **200 con 3 voces, 6 proyectos y 17 referentes de REELS** (medido en `app.*`, son de grano empresa y los comparten los dos pipelines) |

  Tres cosas salen de ahí, y la tercera contradice la lectura fácil de las dos primeras:

  1. **Hoy el plan ajeno es el VACÍO, que es el peor de los dos.** Un plan lleno de datos raros
     alguien lo mira dos veces; un plan vacío produce una corrida que termina **en verde sin entregar
     nada**, y en un pipeline recién nacido eso se lee como *"todavía no cargamos referentes"*.
  2. **Prender `retia/linkedin` es lo que le pone datos adentro.** Es el paso 2 del handoff del cierre
     106 — no es hipotético, es lo siguiente. Ese día la misma llamada pasa de vacía a **17 cuentas de
     Instagram/TikTok y 6 proyectos de reels**.
  3. 📏 **Pero NO hay ningún camino automático que haga esa llamada, y eso también se midió.** La
     respuesta equivocada existe; nadie la pide. Los **3 workflows que consumen `run-plan`** (motor,
     descubrimiento, archivado) no inventan el uuid: se lo pasa el dispatcher en el payload, y el
     dispatcher tiene **exactamente 2 crons** (motor lunes 8:00, archivado domingo 18:00) que
     preguntan `instancias?workflow=<su propio pipeline>`, filtrado por `workflow_id` ⇒ un uuid de
     LinkedIn no sale de ahí. **No existe workflow de LinkedIn en n8n ni cron suyo**, y el botón ▶ lo
     cerró ADR-066 dos veces (la zona y la guarda por pipeline).

  ⇒ **La formulación correcta: prender el cockpit antes del deploy no abre una fuga alcanzable, deja
  el arma cargada para el primero que sondee la fachada a mano.** Y eso no es un caso raro: es
  literalmente el primer movimiento de quien se sienta a construir el motor —el `curl` para ver qué
  contesta— con la diferencia de que la respuesta sería una **mentira plausible**.

  **Y el arreglo obvio lo habilita en vez de cerrarlo.** Agregar `linkedin` a la lista de `ambito`
  hace que el 400 desaparezca, pero deja que **el que llama declare de qué pipeline es**. Ahí se abre
  el desacuerdo: `?instancia=<uuid de LinkedIn>&ambito=motor` es una petición perfectamente válida —
  un nodo copiado de otro workflow, un placeholder sin cambiar, el default— y devuelve **200 con el
  plan de reels**. El sistema ya tiene la respuesta correcta guardada: `instances.workflow_id`, que es
  FK a `workflows` y lo escribió la migración que creó el cockpit.

  Además `ambito` **ya significa otra cosa**, y esa cosa la va a necesitar LinkedIn también:
  `motor` = con los filtros de ADR-028 §2, `completo` = sin ellos, para el archivado y el
  descubrimiento. Meter el pipeline ahí colapsa dos ejes en un parámetro y el día que LinkedIn tenga
  su archivado no hay cómo pedir "linkedin, completo".

- **Decisión.** **Son dos ejes y se separan.**

  | Eje | Quién contesta | Qué decide |
  |---|---|---|
  | **Qué pipeline** | la **instancia** (`instances.workflow_id`), derivado por la fachada | qué tablas se leen y qué plan se arma |
  | **Cuán filtrado** (`?ambito`) | **el que llama**, como hasta hoy | `motor` (filtrado) vs `completo` (sin filtros) |

  ⚠️ **Y el 400 de hoy no protege de nada, aunque lo parezca.** `?ambito=linkedin` da 400 solo porque
  `linkedin` no está en la lista de ámbitos: **sacar ese parámetro** —o copiar un nodo de reels, que
  no lo manda— devuelve 200 con el plan equivocado. La puerta no está cerrada; está entornada por un
  typo que todavía nadie corrigió.

  **El pipeline no se pide nunca.** `contextoDeFachada` ya leía la fila de `instances` para resolver el
  tenant; ahora devuelve también su `workflowId`, al lado del `ctx` y no adentro (el `TenantContext` es
  *"de quién es este dato"* y lo consume `scoped()`; el pipeline es *"qué máquina pregunta"*).
  `route.ts` despacha con eso: reels → `armarRunPlan`, LinkedIn → `armarRunPlanLinkedin`, cualquier
  otro → **400 fail-closed**, nombrando el pipeline para que el diagnóstico desde n8n sea posible.

  **El plan dice de qué pipeline es.** Se agrega `pipeline` al payload de los dos. Es **aditivo**, así
  que `version` se queda en `2` y ningún workflow de reels se entera (sacarlo después sí costaría el
  bump de ADR-028 §5). Existe para que el motor pueda **afirmar** en una línea de su `Config` que le
  contestaron el plan que pidió: es el único chequeo posible contra un fallo cuyo síntoma es un
  documento bien formado.

  **El plan de LinkedIn no es el de reels con campos de menos:**

  | | |
  |---|---|
  | `voces` | las de la empresa **con su perfil de LinkedIn**. 🔴 El filtro de `motor` es **la existencia del perfil, jamás `voces.activo`** (ADR-067). Ese flag significa de facto *"corre en reels"* y la pantalla de LinkedIn crea las voces con `activo: false` a propósito ⇒ filtrar por él le daría al motor **cero voces en las tres marcas**, en verde |
  | `referentes` | el banco de `app.referentes_linkedin` prendido, con `carril` **ya resuelto** desde la fuente (decide qué umbral se aplica, ADR-055 §2: esa regla no puede quedar duplicada en un code node) y `proyecto_id` como string nullable, **no** como array de un elemento — esa forma es herencia de un campo *link* de Airtable y no se arrastra a un contrato nuevo |
  | ~~`proyectos`~~ | **no viaja.** En LinkedIn la unidad de config es la **voz**, no el proyecto: no hay corte por proyecto ni `N` que resolver |
  | ~~`ajustes`~~ | **no viaja, y la ausencia es la decisión.** `app.ajustes` es de grano instancia y LinkedIn no tiene una sola fila (por eso su cockpit tampoco declara la pantalla `motor`, ADR-066). Servir `ajustes: []` sería la lista siempre vacía que se lee como *"todavía no lo configuraron"*. Las perillas del manifest llegan con la Fase 4 y su migración `028`, y **ese** es el día de agregar el campo |

- **Alternativas descartadas.**

  1. **`?ambito=linkedin`** — lo que el `workflow.yaml` ya declaraba. Hace desaparecer el 400 y deja al
     llamante contradecir a la base sobre algo que la base sabe; el desacuerdo devuelve 200 con el plan
     equivocado. Además quema el eje `motor|completo` para el pipeline nuevo.
  2. **`?pipeline=<id>` como parámetro propio, validado contra la instancia** — arregla el desacuerdo
     (400 si no coinciden) pero pide un dato que ya tenemos para después chequear que sea el mismo. Un
     parámetro obligatorio más en cada nodo HTTP, y un placeholder más que puede quedar sin resolver:
     el sospechoso número uno de este sistema.
  3. **Meter `pipeline` en el `TenantContext`** — lo haría viajar por las ~40 funciones de `lib/` que
     no lo necesitan, y obligaría a `armarContexto` (el constructor de contextos de pantalla) a
     contestar una pregunta que ahí no se hace.
  4. **Un endpoint por pipeline (`/api/engine/run-plan-linkedin`)** — otra credencial, otra ruta, otra
     env var, y el mismo fail-closed escrito dos veces. La fachada es una por diseño (ADR-028).
  5. **Servir `ajustes: []` y `proyectos: []` por simetría** — la lista siempre vacía es el fallo mudo
     de la `015`, movido de lugar. Un campo que no existe se nota; uno que existe vacío se explica solo
     con una historia tranquilizadora.

- **Consecuencias.**

  - **Para reels, cero.** La respuesta es byte-idéntica salvo el campo `pipeline` agregado, que ningún
    nodo lee. **No hay re-import ni `n8n:push`**: verificado con `npm run n8n:diff`, los 5 workflows
    siguen corriendo lo que dice el repo.
  - **El `workflow.yaml` de LinkedIn dejó de mentir** en dos líneas: el `?ambito=linkedin` que daba 400
    y el `client_config: clients/{cliente}/linkedin.yaml`, que apunta a un archivo que **no existe ni
    va a existir** (desde ADR-035 la config sale de la fachada; un yaml por cliente sería una segunda
    fuente de verdad). ⚠️ Los manifests de `short-form-content`, `descubrimiento-referentes` y
    `archivado` declaran el suyo y tampoco existe — misma herencia pre-fachada, sin consecuencia
    porque nadie los lee, y **no se tocaron acá**.
  - **Lo que esto NO destraba.** El motor de LinkedIn sigue sin existir y sus **tres bloqueos no
    técnicos siguen intactos** (ADR-055 §Consecuencias): no hay definición de *"funcionó"*, no existe
    el banco de referentes y faltan los few-shot. Esto le saca del camino la primera piedra técnica,
    que era la que se iba a chocar el día 1.
  - **Sigue sin poder ejercitarse con datos, y hay que saber leerlo.** Las 4 tablas de LinkedIn están
    en 0 filas, así que el plan de una instancia de LinkedIn devuelve `voces: []` y `referentes: []`
    **igual que antes de esta ADR**. La diferencia no se ve en el tamaño de las listas: se ve en
    `pipeline`, que ahora dice `linkedin` en vez de `short-form-content`. **Ese campo es la única
    prueba observable de que el cambio hizo algo** hasta que haya filas. La prueba con datos es la
    misma que espera [plan-multi-tenant §14.6](../agents/plan-multi-tenant.md) para las policies de
    la `024`.
  - 📌 **Y hay un orden que conviene respetar, aunque NO por urgencia:** este deploy va **antes** de
    prender `retia/linkedin` (paso 2 del handoff). Invertirlo no abre una fuga alcanzable —está
    medido arriba: no hay caller automático— pero deja al primero que sondee la fachada con ese uuid
    recibiendo 17 referentes de Instagram en un plan de LinkedIn. **La razón para respetarlo es la
    asimetría, no el riesgo: cuesta cero.** Es un `UPDATE` después de un deploy en vez de antes, y no
    hay nada que ganar al revés.
  - **Deuda anotada:** cuando la Fase 4 aplique la `028`, el plan de LinkedIn gana `ajustes` y ese sí
    es un cambio de forma para un consumidor que para entonces va a existir.
