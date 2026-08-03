# ADR-055 — LinkedIn es un pipeline de este repo, con dos carriles y una fuente que no es LinkedIn

- **Estado:** aceptada — 2026-08-03. Ejecuta la **Fase 5** del
  [plan multi-tenant §8](../agents/plan-multi-tenant.md) y [PLAN §F5](../../PLAN.md) con un pipeline
  real. Se apoya en [ADR-049](./ADR-049-un-pipeline-sus-tablas.md), que ya decidió la **forma** del
  almacenamiento; esto decide **dónde vive la máquina y qué hace**.
  **Cierra `maquina-linkedin/docs/adr/001 §3`** (*"la infraestructura queda sin decidir"*) e
  **importa** sus ADR 002 y 003 al repo que va a construir.

- **Contexto.** La máquina de LinkedIn se diseñó en un repo aparte
  (`Contenido/maquina-linkedin/`): README, PLAN, la entrevista a Fernando Benites del 2026-08-01 y
  tres ADRs. Ese diseño está maduro y **no tiene una línea de código**. Su ADR 001 §3 dejó a
  propósito una pregunta abierta —*"¿carril nuevo dentro de `pipeline-creacion-contenido` o repo
  propio?"*— con la condición de resolverla *"después del Paso 0, cuando se sepa cuánto se parece de
  verdad al pipeline existente"*.

  **Lo que pasó desde entonces cambió la respuesta sin necesidad del Paso 0:**

  1. El refactor multi-tenant entró a producción (Fases 0–4). Existen `clients`, `instances`, el
     cockpit por `(empresa × pipeline)`, `run-plan` v2 por instancia y el dispatcher. Eso es
     exactamente la infraestructura que un repo propio tendría que volver a montar.
  2. La máquina pasó a servir a **tres marcas** —30X, EstadoX y Retia— por pedido explícito
     (`maquina-linkedin` ADR 002). Con Retia adentro, la máquina y el pipeline de reels comparten
     empresa, equipo y cockpit.
  3. El propio PLAN de `maquina-linkedin` ya lo anticipaba en su R4: *"si la máquina sirve a Retia,
     cuyo pipeline de contenido ya vive en `pipeline-creacion-contenido`, la opción «carril nuevo»
     gana peso frente a «repo propio»"*.

- **Decisión.** **LinkedIn entra como el pipeline N+1 de este repo**, y con él entran las dos
  decisiones de forma que salieron de la entrevista a Fernando.

  1. **Dónde vive.** `Workflows/workflow-linkedin/` con su manifest, sus tablas
     (`core/schema/020_pipeline_linkedin.sql`, la forma que ADR-049 ya fijó) y su superficie en el
     cockpit existente. **Un cockpit de LinkedIn es una `instances` más**: `retia/linkedin`,
     `estadox/linkedin`, `30x/linkedin`. No hay repo nuevo, ni base nueva, ni login nuevo.

  2. **La etapa 1 se bifurca en dos carriles** (`maquina-linkedin` ADR 003, importado):

     | | **Carril personal** | **Carril copiable** |
     |---|---|---|
     | **Fuente** | el archivo propio de la voz (podcasts, blogs, transcripciones) | **Pinterest + referentes en inglés**; LinkedIn cuando se deje |
     | **Qué produce** | una anécdota o experiencia que solo esa persona tiene | un formato que ya funcionó, para rebrandear |
     | **Qué mide el umbral** | nada: no compite, es material propio | pertinencia y formato, **no** viralidad |

     **La fuente del carril copiable NO es LinkedIn, y eso es lo que destraba el proyecto.** El
     contenido que se rebrandea es visual y no nació en LinkedIn: infografías, diagramas, listas.
     Buscarlo en LinkedIn era buscarlo en el peor sitio, y encima en el único que no se deja
     rastrear. El riesgo *"LinkedIn no se deja scrapear"* se resuelve **por rodeo, no por fuerza**.

  3. **`enriquecer` es `n/a`, y eso tiene una consecuencia en la superficie.** LinkedIn ya es texto:
     no hay transcripción ni traducción de audio. La etapa 4 canónica se declara `n/a` en el
     manifest (ADR-049 §4), y **la zona `transcribir` del cockpit no aplica a este pipeline** — lo
     resuelve [ADR-056](./ADR-056-las-zonas-son-rol-interseccion-pipeline.md).

  4. **Cuatro reglas duras de formato, y la mitad se impone por código.** Salieron de la entrevista
     y ya están separadas por el criterio del propio diseño (*"si no cabe en un placeholder, no era
     proceso: era gusto"*):

     | | Regla | Quién manda | Dónde vive |
     |---|---|---|---|
     | **R-1** | El gancho es un bloque continuo de 2–3 líneas **sin línea en blanco**. Un `\n\n` antes de la línea 2 esconde el post detrás del *"ver más"* | la plataforma | **código**, rechazo automático |
     | **R-2** | **Firma obligatoria al cierre de todo post**: nombre · cargo · frase de propósito. También al pie de la imagen rebrandeada; única excepción, imagen ajena sin modificar (no se firma lo que no se tocó) | la casa | **código**, con el texto por voz |
     | **R-3** | Espaciado del cuerpo | la persona | **placeholder por voz** |
     | **R-4** | Separación mínima entre posts de la misma cuenta (se canibalizan) | la persona | **placeholder por voz**, gobierna la cola |

     **R-1 y R-2 se imponen a todas las voces; R-3 y R-4 se parametrizan.** Es la misma costura que
     este repo ya usa en todos lados: el LLM propone, **código determinista sanitiza** antes de que
     nada llegue a un humano.

  5. **Publica un humano** (`maquina-linkedin` ADR 001 §1, que sigue vigente y Fernando confirmó sin
     que se le preguntara). La máquina deja el post listo en una cola con estado; nadie publica
     solo. Esto **no** es una limitación temporal a levantar después: el costo de equivocarse en un
     canal que no quiere ser automatizado es la cuenta, no un reintento — y ya hay precedente propio
     y caro con los baneos de WhatsApp por Baileys.

- **Alternativas descartadas:**
  - **Repo propio, clonando `reelsdetector`.** Era la opción del ADR 001 §3 y arranca más rápido
    porque no hay que coordinar con nada vivo. Descartada porque **duplica exactamente lo que acaba
    de costar el refactor multi-tenant**: cockpit, login, membresías, dedup, histórico, registro de
    corridas y dispatcher. Y con Retia adentro, duplicarlo significa que el equipo de redes tendría
    **dos cockpits con dos logins** para dos pipelines de la misma empresa.
  - **Generalizar `app.candidatos` para que sirva a los dos pipelines.** Ya descartada en ADR-049 y
    no se reabre: tabla ancha llena de nulls y un enum que crece por pipeline.
  - **Esperar al Paso 0 (correr la máquina a mano, cronometrada) antes de decidir la infra.** Era la
    condición escrita en el ADR 001 §3. Se adelanta porque los tres hechos del contexto ya
    respondieron lo que el Paso 0 iba a responder —cuánto se parece al pipeline existente— y porque
    **el Paso 0 sigue siendo necesario igual**, pero para calibrar tiempos y umbrales, no para
    elegir repo. Postergar la decisión ahora solo retrasaba el trabajo que no depende de ella.
  - **Sumar LinkedIn como un valor del enum `app.plataforma`.** Prohibido explícitamente por
    ADR-049 §3: LinkedIn no es una plataforma más del pipeline de reels, es otro pipeline.

- **Consecuencias:**
  - (+) LinkedIn **hereda gratis** todo lo que ya está pagado y en producción: multi-tenencia,
    membresías (ADR-051), el aislamiento de dos capas (ADR-047), `run-plan` v2, el dispatcher, el
    registro de corridas y el cockpit con su equipo ya entrenado.
  - (+) Es el **test real del invariante #3** que PLAN §F5 siempre pidió: *"si algún paso de la guía
    exige modificar el núcleo, el diseño no está listo"*. Si LinkedIn entra sin tocar `core/` más
    allá de su propia migración, la promesa de *clonar y configurar* deja de ser una promesa.
  - (+) La **segunda empresa deja de ser hipotética**, y eso obliga a cerrar los tres huecos que
    [plan-multi-tenant §14](../agents/plan-multi-tenant.md) dejó escritos y que *"muerden con la
    segunda empresa, no con esta"* — en particular la **Capa 2 (RLS)**, cuyo disparador es
    justamente que un segundo cliente real tenga usuarios en producción.
  - (−) **`maquina-linkedin` deja de ser el repo de construcción y pasa a ser el de diseño.** Sus
    ADR 002 y 003 quedan importados acá; su PLAN, su entrevista y sus hallazgos siguen siendo la
    fuente de la decisión y **no se copian** (docs lean: un hecho, un dueño).
  - (−) La UI de curación se duplica entre pipelines. Es el costo que ADR-049 ya aceptó con cabeza:
    con dos pipelines, un componente genérico prematuro cuesta más que la duplicación.
  - ⚠️ **Lo que esta decisión NO resuelve, y sigue bloqueando la mitad de producción.** Son tres, y
    ninguna es técnica ni se responde con Fernando:
    1. **No hay definición de "funcionó"** (R5 del PLAN de `maquina-linkedin`). La respuesta que hay
       es *"impresiones y reacciones"*, que es volumen puro: construir el aprendizaje sobre eso
       converge en el post motivacional con máximas reacciones y cero clientes. Son **tres
       respuestas distintas** porque son tres marcas, y **solo EstadoX puede anclarla a dinero** hoy.
    2. **No existe el banco de referentes.** Fernando: *"no tengo el listado"*. Hay que construirlo,
       no capturarlo.
    3. **No hay inventario de voces de EstadoX ni de Retia**, y el tamaño del proyecto es lineal en
       el número de voces.

    **Lo que sí se puede construir sin ellas es la detección, la curación y el cockpit** — que es
    justamente lo que este ADR habilita. La generación en voz (etapa 3) y el aprendizaje (etapa 5)
    esperan a que existan los few-shot y la definición de éxito.
  - ⚠️ **La norma de rebrandear material ajeno se hereda a sabiendas.** Tomar la infografía ajena,
    cambiarla a los colores de la marca, traducirla y firmarla es la práctica vigente en 30X, no una
    decisión que se tome acá. Queda escrito que se heredó; si alguien quiere moverla, se mueve con
    un ADR.

- **Toca:** `core/schema/020_pipeline_linkedin.sql` (nuevo) · `Workflows/workflow-linkedin/` (nuevo) ·
  `apps/dashboard/domain/pipelines.ts` (nuevo) y la superficie de `curar`, vía
  [ADR-056](./ADR-056-las-zonas-son-rol-interseccion-pipeline.md). **`app.plataforma` no se toca**
  (ADR-049 §3) y `core/contracts/` no cambia: el manifest v1 ya admite `n/a` por etapa, que es todo
  lo que LinkedIn necesita declarar.
