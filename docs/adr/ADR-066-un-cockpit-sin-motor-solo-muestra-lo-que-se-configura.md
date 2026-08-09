# ADR-066 — Un cockpit sin motor solo muestra lo que se puede configurar, y el disparo se guarda por pipeline

- **Estado:** aceptada — 2026-08-08. **Enmienda [ADR-056](./ADR-056-las-zonas-son-rol-interseccion-pipeline.md)**
  en su tabla de zonas, y completa [ADR-055](./ADR-055-linkedin-es-un-pipeline-de-este-repo.md).
  La dispara el pedido de dejar el cockpit de LinkedIn **listo para configurar** para las 3 empresas.

- **Contexto.** ADR-056 declaró que LinkedIn implementa `operar`, `curar`, `entender` y `ajustes`, y
  esa tabla se escribió **cuando LinkedIn no tenía ninguna pantalla propia**. La afirmación era
  aspiracional: decía qué zonas *iba a tener*, no cuáles podía dibujar. Mientras tanto, un cockpit
  de LinkedIn entrando a `operar` o `entender` **renderiza las pantallas de reels**.

  **`entender` es el caso conocido:** sus 5 vistas (`v_metricas_calidad`, `v_embudo_semana`, …) son
  de reels y están filtradas por `instance_id`, así que desde LinkedIn devuelven **ceros sin
  fallar** — la familia de la `015`, exactamente el fallo que `domain/pipelines.ts` existe para
  evitar y que ya se pagó dos veces (las 7 pantallas de `curar`, la de `ajustes/motor`).

  🔴 **`operar` es de otra especie, y es lo que hace urgente esta ADR.** No muestra datos ajenos:
  **trae los tres botones que disparan los workflows de reels.**

  | Acción | Webhook |
  |---|---|
  | `correrAhora` | `MOTOR_WEBHOOK_URL` |
  | `buscarAhora` | `DESCUBRIMIENTO_WEBHOOK_URL` |
  | `archivarAhora` | `ARCHIVADO_WEBHOOK_URL` |

  Las tres se guardaban con `exigirTenant("operar", …)`, que autoriza **la zona** — y `operar` la
  declaraban los dos pipelines. Ninguna miraba el pipeline. Las tres mandan
  `{ instancia: ctx.instanceId }` con el uuid del cockpit abierto, así que desde `30x/linkedin` el
  ▶ le pedía al **motor de reels** que corriera sobre un tenant de LinkedIn. **No falla**: el motor
  arranca, le pide su plan a la fachada y trabaja. Y con `30x/linkedin` y `estadox/linkedin` en
  `active` desde el 03/08, el botón estaba vivo.

  📏 **Medido antes de cerrarlo, y por eso esta ADR no repara nada:** cero `runs`, cero
  `processed_items` y cero `outputs` contra las 3 instancias de LinkedIn. Nadie llegó a apretarlo.

- **Decisión.** Dos reglas, y la segunda no es redundante con la primera.

  **1. Un pipeline declara solo las zonas que puede dibujar con pantallas propias.**

  | Pipeline | `operar` | `curar` | `transcribir` | `entender` | `ajustes` |
  |---|---|---|---|---|---|
  | `short-form-content` | ✅ | ✅ | ✅ | ✅ | ✅ |
  | `linkedin` | ❌ *(sin motor)* | ✅ | ❌ (`enriquecer: n/a`) | ❌ *(sin datos propios)* | ✅ |

  `operar` y `entender` **vuelven el día que tengan pantalla propia**, que es el día que exista el
  motor de LinkedIn. Hasta entonces el cockpit abre en `curar`, sin que nadie tenga que decidirlo:
  `zonaInicialEn` es la primera zona que el rol alcanza y el pipeline implementa.

  Y queda ratificado, para no re-litigarlo cada vez: **`historicos` y `sugeridos` tampoco se
  declaran.** No es que falten de construir — es que **no tienen escritor**. El archivado que llena
  `outputs` es de reels, y no hay descubrimiento de LinkedIn. Se declaran cuando haya quien escriba.

  **2. El disparo de una máquina se guarda por PIPELINE, no por zona.**

  Cada una de las tres acciones pregunta si el pipeline del cockpit abierto es el dueño del webhook
  que está por llamar, y si no, devuelve un mensaje explícito. Es hermana de `exigirCockpitLinkedin`
  (`curar/referentes/actions-linkedin.ts`), del otro lado de la costura.

- **Por qué la regla 2 va igual, si la 1 ya cierra la puerta hoy.** Porque **son preguntas
  distintas** y la diferencia se cobra en el futuro. Sacar `operar` de la tabla hace que
  `exigirTenant` redirija, así que hoy las tres acciones son inalcanzables desde LinkedIn. Pero el
  día que LinkedIn recupere `operar` con su propio motor —lo va a hacer, es el punto entero de
  ADR-055— la guardia de zona **vuelve a autorizar** el POST al motor de reels, en silencio, y nadie
  va a estar mirando ese archivo. La zona contesta *"¿este cockpit tiene esta pantalla?"*; lo que
  hay que preguntar es *"¿este cockpit es el dueño de esta máquina?"*.

  Es la misma lección que este repo ya pagó con las pantallas de `curar`: la guardia de zona dejaba
  pasar la zona entera y adentro había siete links a tablas de reels. **Un nivel de guardia se pone
  donde está la consecuencia, no donde está la ruta.**

- **Alternativas descartadas:**
  - **Solo poner la guarda y dejar las zonas visibles.** Más barato, y deja a `entender` mostrando
    ceros de reels — el fallo mudo que ADR-056 y `domain/pipelines.ts` existen para matar. Un nav
    que lleva a una pantalla vacía es una promesa incumplida, y en un pipeline recién nacido se lee
    como *"todavía no cargamos datos"*.
  - **Construir `operar` y `entender` de LinkedIn ahora.** Operar sin motor no tiene qué disparar y
    Entender sin candidatos no tiene qué medir: serían dos pantallas vacías **por diseño**, o sea el
    mismo fallo con más código encima.
  - **Derivar el dueño del webhook desde el cockpit.** No se puede: las URLs viven en env vars
    sueltas (una por workflow, para todo el sistema), así que no hay dato del que derivarlo. La
    constante se vuelve un mapa el día que LinkedIn tenga los suyos.
  - **Que la guarda viva en `exigirTenant`.** Tentador —un solo lugar— y equivocado: `exigirTenant`
    autoriza *el acceso a una pantalla*, y esto no es acceso, es **qué máquina se dispara**. Meterlo
    ahí obligaría a que la guardia de rutas supiera de webhooks.

- **Consecuencias:**
  - (+) **El riesgo activo se cierra**: ningún cockpit puede disparar la máquina de otro, ni hoy ni
    cuando LinkedIn recupere `operar`.
  - (+) El cockpit de LinkedIn deja de prometer lo que no tiene: muestra **exactamente** las dos
    zonas donde hay algo que hacer.
  - (+) Desbloquea prender `retia/linkedin` (la tercera empresa) sin agregar un tercer lugar con el
    ▶ armado.
  - (−) El nav de LinkedIn queda notoriamente corto (2 de 5). Es honesto: refleja que el motor no
    existe. Y es reversible con una línea.
  - (−) Una constante más que mantener (`DUENO_DE_ESTOS_WEBHOOKS`). Mitigado porque el test de
    `domain/pipelines.test.ts` se pone rojo si alguien vuelve a declarar `operar` en LinkedIn, y ese
    test apunta al comentario que explica por qué la guarda no se saca.

- **Toca:** `apps/dashboard/domain/pipelines.ts` (la tabla de zonas) · `domain/pipelines.test.ts` ·
  `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/operar/actions.ts` (la guarda, en las 3
  acciones) · `Workflows/workflow-linkedin/{workflow.yaml,README.md}` (el runbook menciona el nav).
  **No toca datos, ni el motor, ni `core/`.**
