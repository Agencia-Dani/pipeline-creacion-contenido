# ADR-049 — Un pipeline, sus tablas: lo común es el contrato, lo propio es la tabla

- **Estado:** aceptada — 2026-08-02. Es la decisión **D** del
  [plan multi-tenant §2](../agents/plan-multi-tenant.md) (la fase, su §8). Enmienda
  [`core/contracts/workflow-manifest.md`](../../core/contracts/workflow-manifest.md) y ejecuta
  [PLAN §F5](../../PLAN.md) con un pipeline real.

- **Contexto:** el segundo pipeline (LinkedIn) **no entra en el modelo actual**, y no por poco:

  - `app.plataforma` es un **enum `('instagram', 'tiktok')`**.
  - `app.candidatos` está modelado como **video**: `views`, `likes`, `engagement`, `thumbnail_url`,
    `script`, `idioma`, `seguidores`. En LinkedIn la mitad de esas columnas no existe y `script` es el
    post mismo.
  - Las **8 etapas canónicas** de [PLAN §2.4](../../PLAN.md) sí lo cubren (la etapa 4 ENRIQUECER
    "sobra" en LinkedIn: ya es texto, no hay nada que transcribir). Lo que no lo cubre son las
    **tablas**.

  O sea: el contrato de proceso ya es multi-pipeline desde [ADR-001](./ADR-001-motores-heterogeneos-contrato-comun.md);
  el **almacenamiento** del cockpit no. Y la pregunta es dónde poner la costura entre lo que comparten
  dos pipelines heterogéneos y lo que no.

- **Decisión:** **cada pipeline tiene sus propias tablas de pieza**, contra un contrato común.

  1. **Propio del pipeline:** las tablas de pieza y su curación —
     `app.candidatos_linkedin`, `app.descartes_linkedin`, `app.referentes_linkedin`— todas con
     `instance_id` ([ADR-046](./ADR-046-el-cockpit-es-multi-tenant.md), grano instancia).

  2. **Común a todos:** el **registro** (`runs`, `outputs`, `processed_items`, `clients`, `instances`,
     `workflows`), la **identidad y los permisos** (`app.usuarios`, y las voces/proyectos/referentes de
     grano empresa), y sobre todo **la forma**: `core/contracts/schemas/content_item.schema.yaml` y
     `output.schema.yaml`, que ya especifican el formato entre motores heterogéneos y no hay que
     inventar.

  3. **`app.plataforma` NO se toca.** El enum se queda con `('instagram', 'tiktok')` y describe el
     pipeline de reels, que es de lo único que habla. LinkedIn no es un valor más de ese enum: es otro
     pipeline.

  4. **El manifest es donde se declara qué implementa cada pipeline.** `workflow.yaml` ya mapea las 8
     etapas y admite `n/a` — LinkedIn declara `enriquecer: n/a` y eso es una afirmación verificable, no
     un comentario.

  5. **La regla de decisión, para que no haya que volver a discutirla tabla por tabla:**
     > **¿el dato tiene sentido sin saber de qué pipeline vino? Es común. ¿Cambia de forma según el
     > pipeline? Es propio.**
     Una voz tiene sentido sin pipeline (es de la empresa). Un candidato con `views` y `thumbnail_url`,
     no.

- **Alternativas descartadas:**
  - **Generalizar `candidatos` a "pieza candidata"** con las columnas de todos los pipelines. La
    opción de menos tablas y la más obvia. Descartada porque da una **tabla ancha llena de nulls** —
    `views`/`likes`/`thumbnail_url` vacíos en cada fila de LinkedIn— y **un enum que crece cada vez
    que entra un pipeline**, o sea una migración por pipeline sobre la tabla más caliente del sistema,
    con `not null` imposibles de poner y constraints que dependen del tipo de fila. El costo de los
    nulls no es el espacio: es que ninguna query puede confiar en una columna.
  - **Una tabla `piezas` con un `jsonb` de campos específicos.** Evita los nulls y el enum. Descartada
    porque tira la validación al runtime justo donde el repo eligió lo contrario: `app.candidatos`
    tiene FKs a `proyecto_id`/`voz_id` desde D7 y eso es lo que mató la clase de bug del *proyecto
    fantasma* — *"sin `typecast`, un id mal formado es un error de FK, no datos malos silenciosos"*
    ([ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md)). Un `jsonb` la reintroduce.
  - **Una base o un schema por pipeline.** Descartada por lo mismo que ADR-046 descartó el schema por
    empresa —las migraciones se aplican a mano— pero peor: acá el conteo sería *empresas × pipelines*.
  - **Esperar a tener el segundo pipeline andando y decidir después.** Descartada porque la decisión
    condiciona la migración `016`: si `candidatos` fuera a generalizarse, sus columnas de tenant y sus
    índices se diseñarían distinto. Es más barato decidirlo ahora que reabrir la tabla del feed.

- **Consecuencias:**
  - (+) Cada pipeline evoluciona su modelo **sin tocar el de los otros**. Invariante #3 respetado: el
    pipeline N+1 no toca el núcleo.
  - (+) Las tablas siguen **estrechas y con FKs reales**, que es lo que hace que un error sea un error
    y no un dato feo.
  - (+) Obliga a **decidir explícitamente qué es común** — que es exactamente el trabajo que
    `content_item`/`output` ya especifican y que nadie estaba usando.
  - (−) **La UI de curación y algunas vistas se duplican.** Es el costo aceptado, con cabeza: si
    llegan 4+ pipelines, se revisa si conviene un componente de feed genérico. Con dos, un componente
    genérico prematuro cuesta más que la duplicación.
  - (−) Una query "todas las piezas de la empresa X" pasa a ser un `union` sobre N tablas. Aceptable
    porque hoy nadie la hace: el cockpit se abre **por (empresa × pipeline)**, no sobre el total.
  - (−) Cada pipeline nuevo trae su propia migración de tablas. Es trabajo previsible y aislado, no
    una cirugía sobre datos vivos.
  - **Criterio de hecho, textual de [PLAN §F5](../../PLAN.md):** *"si algún paso de la guía exige
    modificar el núcleo, el diseño no está listo — se corrige la guía/el contrato, no se parchea a
    mano"* (invariante #3). LinkedIn es el test, no el motivo.

- **Toca:** `core/contracts/workflow-manifest.md` (qué declara un pipeline sobre sus tablas) ·
  `core/schema/017_pipeline_linkedin.sql` (Fase 5) · `Workflows/workflow-linkedin/` ·
  `apps/dashboard/domain/feed.ts` (se generaliza contra `content_item`) · las zonas de `curar`, que se
  parametrizan por pipeline. **`app.plataforma` no se toca.**
