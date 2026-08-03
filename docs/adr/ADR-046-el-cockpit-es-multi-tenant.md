# ADR-046 — El cockpit también es multi-tenant: `client_id`/`instance_id` en `app`, con doble grano

- **Estado:** aceptada — 2026-08-02 · **enmendada el mismo día por
  [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md)**, que reemplaza `usuarios.client_id`
  (una empresa por persona) por membresías explícitas y le saca a `clients.parent_id` el gobierno
  del acceso. **Los granos y las columnas de este ADR siguen en pie tal cual**; lo que cambia es
  quién alcanza qué. **Extiende [ADR-003](./ADR-003-multicliente-desde-dia-1.md)**
  al schema que no existía cuando ADR-003 se escribió. Es la decisión **A + B** del
  [plan multi-tenant §2](../agents/plan-multi-tenant.md) (el diagnóstico con evidencia está en su §1;
  el SQL, en su §4 — acá va el porqué).

- **Contexto:** ADR-003 puso la dimensión cliente en el **registro** (`clients`, `instances`, y la FK
  en `runs`/`outputs`/`processed_items`) y esa apuesta ya se ganó. Lo que no cubrió es el schema
  **`app`** — `usuarios`, `voces`, `proyectos`, `referentes`, `ajustes`, `candidatos`, `descartes`,
  `referentes_propuestos`, `eventos`: **cero columnas de tenant.**

  **Y no es deuda sucia, es cronología.** Cuando ADR-003 se escribió (11-jun) el cockpit era
  **Airtable**: una base por equipo, el aislamiento lo daba la herramienta, y no había schema `app`
  que scopear. El cockpit propio nació con [ADR-025](./ADR-025-cockpit-producto-propio.md) el 19-jul
  resolviendo un problema **single-tenant** (Airtable free bloqueó el disparo y el eje analítico).
  ADR-003 cubrió el registro porque el producto todavía no existía. Este ADR le pone al producto la
  dimensión que el registro ya tiene.

  La consecuencia formal: el **invariante #4** de [PLAN §2.5](../../PLAN.md) —*"ningún dato de un
  cliente se mezcla con otro"*— hoy **no se puede hacer cumplir en `app`**. No está violado (hay un
  solo tenant), pero no hay nada que lo sostenga. Con la segunda empresa deja de ser teórico, y de
  las cinco formas en que se rompe ([plan §1.3](../agents/plan-multi-tenant.md)) la peor es **muda**:
  el dedup de `processed_items` es global, así que la segunda empresa que vigile un referente en común
  **recibe casi nada** y el síntoma no es un error sino *"el motor no trae contenido"*.

- **Decisión:**

  1. **Una sola base Supabase, scoping por columna.** Se descartan proyecto-por-empresa y
     schema-por-empresa (abajo, y el motivo decisivo lo impone
     [ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md)).

  2. **Doble grano, no un grano único.** Cada tabla de `app` recibe **una** columna, según de quién
     es el dato:

     | Grano | Tablas | Por qué |
     |---|---|---|
     | **`client_id`** | `usuarios`, `voces`, `proyectos`, `referentes` | Son de la **empresa** y **cruzan pipelines**. La voz de un referente es la misma para reels y para LinkedIn: scoparla por pipeline la duplicaría y habría dos que mantener sincronizadas a mano |
     | **`instance_id`** | `ajustes`, `candidatos`, `descartes`, `referentes_propuestos`, `eventos`, `transcripciones` | Son de **un pipeline concreto**. Los knobs de reels no son los de LinkedIn. `runs`/`outputs`/`processed_items` ya lo tienen desde ADR-003 |
     | **ninguno** | `referentes_proyectos`, `referentes_propuestos_proyectos` | Join tables: heredan por FK con `on delete cascade` |

     **`instances` ya es `workflow × cliente`.** No se inventa una entidad nueva: se usa la que
     ADR-003 creó y que hasta hoy estaba infrautilizada.

     > `app.transcripciones` (la zona Transcribir, [ADR-031](./ADR-031-transcriptor-a-pedido.md))
     > **no estaba en el inventario del plan** y aparece acá porque la regla la cubre sin
     > ambigüedad: es de un pipeline concreto. Traía además un **sexto** unique global
     > —`(plataforma, external_id)`— de la misma familia que los cinco del punto 4. Lo que faltó
     > fue el inventario, no el criterio.

  3. **`clients` se vuelve un árbol** con `parent_id text references clients (id)`. Hoy `30x`,
     `estadox`, `retia` sin padre — un nivel. Mañana un cliente de Retia es **una fila, no una
     migración**. La visibilidad (un usuario ve su cliente y sus descendientes) es una regla pura y
     vive en `domain/`, no en SQL.

  4. **Los cinco uniques globales se reparan en la misma migración** — dedup, feed, `ajustes` (su PK
     pasa a compuesta), `outputs`, y el `unique (workflow_id, client_id)` de `instances` que hoy
     prohíbe que una empresa tenga dos instancias del mismo pipeline. Lista y SQL:
     [plan §1.3 y §4.3](../agents/plan-multi-tenant.md).

- **Alternativas descartadas:**
  - **Un proyecto Supabase por empresa.** El aislamiento más fuerte que existe, y por eso se miró
    primero. Descartada porque obliga a cambiar **URL y `service_role` key en tiempo de ejecución**, y
    las credenciales de n8n son estáticas por nodo: habría que hacer viajar secretos dentro de la
    respuesta de `run-plan`. **Contradice el invariante #5** (*"ningún secreto en git… el BFF es el
    único portador de secretos"*).
  - **Un schema por empresa** (`app_30x`, `app_estadox`). Técnicamente posible —
    [ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md) ya usa el header `Content-Profile`, así
    que podría ser dinámico. Descartada por operación: **las migraciones se aplican a mano en el SQL
    Editor**, así que cada una de las 15+ se corre N veces y ahí aparece el drift. Con
    [ADR-049](./ADR-049-un-pipeline-sus-tablas.md) el conteo no es *empresas*, es *empresas ×
    pipelines*.
  - **Un solo grano (`instance_id` en todo).** Más simple de explicar y de scopear. Descartada porque
    duplicaría voces, proyectos y referentes por cada pipeline de la misma empresa — el mismo referente
    en dos filas, con dos historias, y ninguna forma obvia de decir cuál es la buena.
  - **Dos niveles de cliente recién cuando hagan falta.** Es el argumento textual de ADR-003 al revés:
    *"retrofittear la dimensión cliente en datos, config, dashboard y convenciones cuesta caro; tenerla
    desde el inicio cuesta casi nada."* Acá cuesta **una columna y un índice**, y la alternativa es
    volver a abrir las nueve tablas.

- **Consecuencias:**
  - (+) El invariante #4 pasa de aspiración a algo que la base puede sostener, y
    [ADR-047](./ADR-047-aislamiento-en-dos-capas.md) lo convierte en error de compilación.
  - (+) **El dedup deja de ser global**, que es la reparación que más importa y la que menos se ve.
  - (+) El costo por empresa ya era una query (`runs.costo_estimado` cuelga de `instance_id` desde
    ADR-003); ahora el feed y los knobs también.
  - (−) **`parent_id` habilita ciclos**, y un `check` no alcanza (Postgres no valida recursión en un
    check). La garantía va en dos sitios —trigger en la base **y** tope de profundidad en el recorrido
    de `domain/`— porque un ciclo cuelga la resolución de visibilidad **en cada request**.
  - (−) Las columnas nacen **nullable** y el `not null` entra después del backfill. Ese orden no es
    cosmético: al revés, la migración falla sobre datos vivos.
  - (−) 🧹 Obliga a **limpiar el `@casper_smc` duplicado** de `app.referentes` antes de correr la
    migración: con `client_id not null` esa fila se congela en el modelo nuevo.
  - (−) Toca `app.candidatos` y `app.descartes`, que n8n escribe por PostgREST ⇒ **re-import**. No se
    paga aparte: es el mismo re-import que ADR-048 ya obliga, y se hace **una sola vez, coordinado**.

- **Toca:** `core/schema/016_multi_tenant.sql` (Fase 1 del plan) · las 8 vistas de `app` (exponen el
  eje, **no filtran adentro**) · `core/contracts/airtable-cockpit.md` **no** — está congelado en D7 y
  es registro histórico.
