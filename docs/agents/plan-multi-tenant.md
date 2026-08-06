# Plan del refactor multi-tenant + multi-pipeline

> **Qué es este documento.** El plan fundamentado para llevar el cockpit propio de **producto individual** a **producto repartido**: varios pipelines (hoy reels, mañana LinkedIn) y varias empresas (30X, EstadoX, Retia), cada una con su cockpit aislado.
>
> Es el hermano de [plan-cockpit-propio.md](./plan-cockpit-propio.md): aquel llevó la config de Airtable a Postgres; este lleva el producto de uno a N. **Se escribió antes de una sola línea de código, a pedido explícito, para no improvisar el refactor.**
>
> **Cómo leerlo.** §1 es el diagnóstico con evidencia (leelo aunque conozcas el repo — hay cuatro cosas que no están documentadas en ningún otro lado). §2 son las decisiones. §3–§9 son las fases, en orden de ejecución. §10 son los casos de escalabilidad, uno por uno. §11 es cómo se verifica. **Si vas a ejecutar, §12 es el checklist.**

**Estado:** **en ejecución — Fases 0–4 y 6 en producción** (la Capa 2 quedó viva el 05/08, ADR-058). La **paginación del feed** (§12 #7) se cerró el 06/08; queda la **Fase 5, LinkedIn** (§12 #9) · **Escrito:** 2026-08-02 · **Última verificación contra prod:** 2026-08-06 · **Origen:** pedido de Alejandro — expandir el cockpit a otros pipelines (1) y a otras empresas (2), priorizando disponibilidad y capacidad, sin construir sin plan.

> 🚦 **Si venís a ejecutar HOY, andá directo a [§15](#15-el-cierre-del-producto-en-dos-carriles).**
> Tres personas de Retia empiezan a usar la herramienta, y eso cruzó tres disparadores que este repo
> dejó escritos con fecha. §15 los ordena en dos carriles paralelos con dueño único por archivo,
> para dos agentes trabajando a la vez.

---

## 0. Estado al 2026-08-04 — medido, no recordado

> **Empezá por acá.** Todo lo de abajo se leyó de la base y de la API de n8n el 2026-08-04, no del
> handoff. Si vas a retomar el refactor: el checklist con marcas está en **§12** y lo que falta,
> escrito para ejecutarse sin releer nada, en **§14**.

**Migraciones: las 21 de 21 aplicadas**, y desde el 05/08 **ninguna está inerte**: la `021` (RLS)
se activó con el flip de `scoped.ts` ([ADR-058](../adr/ADR-058-el-flip-de-la-capa-2.md)).

**La base (PostgREST, prod, 2026-08-05):** `clients` = **3** (`retia`, `estadox`, `30x`) ·
`instances` = **4** (`retia/reels` **active** · `retia/linkedin` draft · `estadox/linkedin` active ·
`30x/linkedin` active) · **`app.usuarios` = 6** · **`app.usuarios_clientes` = 7 filas** (retia: 3
operador + 2 dev · **`30x`: 1 operador** · **`estadox`: 1 operador**) · `es_dueno` = los 2 devs ·
**`app.voces` = 4, y una es de `30x`** · proyectos 6 · referentes 16 · candidatos 165 · descartes 38 ·
runs 41 · outputs 88.

> 🩸 **Las dos últimas cifras son la noticia, y hasta el 05/08 no estaban en ningún doc.** Hay una
> persona **no dueña con membresía en dos empresas** (la primera del sistema) y **dato real de una
> segunda empresa** en la base. Eso es textual el disparador de la Capa 2 escrito en ADR-047, o sea
> que **se cruzó sin que nadie lo anotara**: el segundo cockpit no estaba dado de alta, estaba **en
> uso**. *El estado del sistema no se lee del handoff, se mide.*

**Aislamiento hoy: las dos capas puestas.** La Capa 1 (el `.eq()` que inyecta `scoped()`, acota al
**cockpit abierto**) y la Capa 2 (las **19** policies de la `021`, acotan a **las empresas del usuario**).
No son redundantes y ninguna reemplaza a la otra. **Verificado en prod con cuenta no dueña**: una
lectura sin filtro de tenant devolvió 3 de las 4 voces, y las 4 zonas cargan con datos —
`Entender` incluida, que era el riesgo concentrado (sus 12 vistas corren `security_invoker`).
⚠️ Con cuenta **dueña** esa medición no prueba nada: `app.clientes_visibles()` le devuelve todas las
empresas, así que ve las 4.

**El único camino que sigue en `service_role`, por diseño:** la fachada de ADR-028 y las escrituras
de n8n (ADR-035) — no tienen sesión —, más `lib/tenant.ts`, que resuelve el tenant y scoparlo sería
circular (ADR-058 decisión C). El **selector de cockpits** queda entonces con Capa 1 sola.

**n8n:** **5 workflows activos** (motor 34 nodos · descubrimiento 22 · dispatcher 8 · archivado 20 ·
errores 3) y `npm run n8n:diff` da **limpio en los 5** (medido el 05/08). Ningún workflow tiene cron
propio: los dos que hay viven en el dispatcher (motor lunes 8am · archivado domingo 18:00). El
descubrimiento **no tiene cron a propósito** — se sacó en `270d107` y hoy es un botón del cockpit.

**El repo:** **175 tests** + `typecheck` verdes · `validate` **2046 checks** · `auditar-workflows`
sin hallazgos.

**La key de Anthropic filtrada está ROTADA y revocada** (verificado el 04/08: la del commit `d98d45a`
da **401** contra la API; los 3 workflows del live traen una sola key y coincide con el `.env`).

---

## 1. Diagnóstico

### 1.1 La multi-tenencia está construida a la mitad — y falta la mitad que se va a repartir

| Zona | ¿Tiene dimensión de cliente? | Evidencia |
|---|---|---|
| `public.{clients, workflows, instances, runs, outputs, processed_items}` | ✅ **Sí**, desde el día 1 | [`core/schema/001_registro_inicial.sql`](../../core/schema/001_registro_inicial.sql) · [ADR-003](../adr/ADR-003-multicliente-desde-dia-1.md) |
| **Todo el schema `app`** — `usuarios`, `voces`, `proyectos`, `referentes`, `ajustes`, `candidatos`, `descartes`, `referentes_propuestos`, `eventos` | ❌ **No. Cero columnas.** | [`core/schema/007`](../../core/schema/007_app_usuarios.sql), [`009`](../../core/schema/009_app_config_sombra.sql), [`012`](../../core/schema/012_referentes_proyectos.sql), [`013`](../../core/schema/013_corte_escritura.sql) |

O sea: **el registro sabe de clientes; el cockpit no.** Y el cockpit es el producto.

**No es un descuido, y entenderlo importa para no leerlo como deuda técnica sucia.** Cuando se escribió ADR-003 (11-jun) el cockpit era **Airtable** — una base por equipo, el aislamiento lo daba la herramienta. El cockpit propio nació con [ADR-025](../adr/ADR-025-cockpit-producto-propio.md) el 19-jul, resolviendo un problema single-tenant (Airtable free bloqueó el disparo y el eje analítico). **ADR-003 cubrió el registro, no el producto, porque el producto no existía.**

La consecuencia formal: el **invariante #4** de [PLAN §2.5](../../PLAN.md) —*"ningún dato de un cliente se mezcla con otro — separados por `client` desde el día 1"*— **hoy no se puede hacer cumplir en `app`.** No está violado (hay un solo tenant), pero no hay nada que lo sostenga.

### 1.2 Hoy no existe ninguna red de seguridad bajo el aislamiento

Tres hechos que se suman:

1. **Todo `apps/dashboard/lib/*.ts` entra con `createAdminClient()`** — service_role, que **bypassa RLS por definición**. Ver [`lib/supabase/admin.ts`](../../apps/dashboard/lib/supabase/admin.ts) y cualquier lectura, p. ej. `leerProyectos()` en [`lib/proyectos.ts`](../../apps/dashboard/lib/proyectos.ts).
2. **`app.*` tiene RLS activado *sin policies*.** Eso significa "solo entra el service_role", **no** "cada quien ve lo suyo". Es una puerta cerrada, no un filtro.
3. **`usuarioActual()` no devuelve tenant.** [`lib/auth.ts`](../../apps/dashboard/lib/auth.ts) devuelve `{ id, email, nombre, rol }`, y `app.usuarios` es `(id, nombre, rol, creado_en)`.

**Traducido:** con dos empresas, el aislamiento dependería al 100% de que cada una de las ~15 funciones de `lib/` se acuerde de filtrar. Un `.eq()` olvidado no falla, no avisa, y devuelve datos verosímiles de otra empresa.

> Es **exactamente la familia de fallo que este repo ya documentó tres veces**: la vista que daba 18 filas para 17 referentes ([`015`](../../core/schema/015_salud_referentes_una_fila.sql)), la descripción falsa de *Candidatos por corrida*, y la hora corrida 5 h por `toLocaleString` sin `timeZone`. La `015` lo dice textual: *"no falla, no avisa, y deja un número que se ve razonable y está mal."*

### 1.3 Cinco constraints globales que se rompen con el segundo tenant

| Dónde | Constraint actual | Qué pasa al segundo tenant | Gravedad |
|---|---|---|---|
| `public.processed_items` | `unique (platform, external_id)` | **El dedup es global.** Si dos empresas vigilan un referente en común, la primera que procese un video se lo bloquea a la otra **para siempre** (ADR-030: vuelve con transcript vacío → descartado `sin_guion` → ya está en la memoria de dedup, no se reintenta) | 🔴 pérdida silenciosa de contenido |
| `app.candidatos` | `unique (external_id)` ([`013`](../../core/schema/013_corte_escritura.sql)) | Mismo efecto, en el feed | 🔴 |
| `public.outputs` | `unique (external_id) where not null` ([`001`](../../core/schema/001_registro_inicial.sql)) | Colisión entre destinos nativos de empresas distintas (dos Sheets, dos filas, mismo id) | 🟠 |
| `app.ajustes` | `clave` es **primary key** | **Una sola fila por knob para todo el sistema.** Las 18 perillas quedarían compartidas entre empresas | 🔴 config cruzada |
| `public.instances` | `unique (workflow_id, client_id)` | Impide que **una** empresa tenga **dos** instancias del mismo pipeline (30X con dos máquinas de LinkedIn) | 🟠 techo de producto |

### 1.4 ADR-035 es la trampa de secuenciación, y es la más cara

La regla vigente ([ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md)) es:

> **n8n LEE su config por la fachada (ADR-028). ESCRIBE sus resultados por PostgREST (`ingesta-registro.md`).**

O sea **n8n conoce nombres de columna del schema `app`**. El propio ADR lo declara como el precio que se pagó con los ojos abiertos: *"un `alter table … rename` rompe un workflow y obliga a re-importar."*

Agregar columnas de tenant a `candidatos` y `descartes` **es exactamente ese caso.** Y el [handoff](./handoff.md) documenta lo que cuesta un re-import:

> Corrida del 2026-08-02: **costó tres intentos, y los dos primeros murieron por lo mismo — `<<DASHBOARD_URL>>` sin rellenar.** El nodo `Leer plan (fachada)` armó una URL relativa y n8n se la pidió a sí mismo → `404 … webhook "GET <uuid>/api/engine/run-plan" is not registered`.
> ⚠️ **Y el fallo es mudo donde importa:** un abort ahí deja la fila en `en_curso` para siempre, sin `fin` ni métricas. Parecía una corrida lenta.

**Consecuencia para este plan:** el re-import es inevitable, así que **se hace una sola vez, coordinado, y con el checklist de los 6 placeholders a la vista.**

### 1.5 Disparo y config son singulares por diseño

- **`MOTOR_WEBHOOK_URL` es una env var singular** ([`app/(zonas)/operar/actions.ts`](<../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/operar/actions.ts>)). Un webhook = una copia de workflow.
- **`GET /api/engine/run-plan` no recibe tenant.** Sus únicos params son `?ambito=motor|completo` ([`app/api/engine/run-plan/route.ts`](../../apps/dashboard/app/api/engine/run-plan/route.ts)). Devuelve *la* config, en singular.
- **`<<INSTANCE_ID>>` es, textual de [`core/contracts/ingesta-registro.md`](../../core/contracts/ingesta-registro.md), *"una constante de la instancia"***, resuelta por `core/scripts/deploy.mjs` desde el yaml del cliente.

Hoy sumar una empresa es: clonar el workflow en n8n + rellenar 6 placeholders a mano + agregar env vars. **Lineal en trabajo manual y en superficie de error**, y el error es mudo (§1.4).

### 1.6 El pipeline de LinkedIn no entra en el modelo actual

- `app.plataforma` es un **enum `('instagram', 'tiktok')`** ([`009`](../../core/schema/009_app_config_sombra.sql)).
- `app.candidatos` está modelado como **video**: `views`, `likes`, `engagement`, `thumbnail_url`, `script`, `idioma`, `seguidores`.
- Las 8 etapas canónicas de [PLAN §2.4](../../PLAN.md) sí lo cubren (la etapa 4 ENRIQUECER "sobra" en LinkedIn porque ya es texto), pero las **tablas** no.

### 1.7 Lo que está sano y hay que apalancar, no reconstruir

| Activo | Por qué sirve acá |
|---|---|
| **La fachada de [ADR-028](../adr/ADR-028-contrato-motor-run-plan.md)** | El motor **ya no conoce el schema de la config**, y [`run-plan.md`](../../core/contracts/run-plan.md) **ya tiene regla de versionado**: *"un cambio de forma sube la versión y ahí sí hay re-import coordinado"*. Meterle tenant es un cambio previsto, no una cirugía |
| **`apps/dashboard/domain/`** | Puro, sin IO, sin React, **138 tests** con `node:test`. Sobrevive el refactor entero y es la red de regresión |
| **`apps/dashboard/lib/`** | La **única** costura de IO. El scoping entra en un solo sitio |
| **[ADR-006](../adr/ADR-006-plano-de-datos-sin-workflow-padre.md)** | Ya autoriza un dispatcher: *"existe como componente opcional dentro de n8n (C9), no como centro del sistema"*. **No hay que re-litigarlo** |
| **`clients/<cliente>/<wf>.yaml` + `core/scripts/deploy.mjs`** | Existen. CLAUDE.md: el deploy *"queda como semilla del multi-cliente F5"* |
| **`core/contracts/schemas/{content_item,output}.schema.yaml`** | El formato común entre pipelines heterogéneos ya está especificado |
| **[PLAN §F5](../../PLAN.md)** | La fase "workflow N+1 real + templatización" ya estaba planeada. Esto la ejecuta con LinkedIn |

---

## 2. Las decisiones

Cuatro, tomadas con Alejandro el 2026-08-02. **Cada una va a ADR antes de una línea de código**, porque `core/` solo cambia con ADR.

### A · Una sola base, scoping por columna. Aislamiento en dos capas.

Se descartaron **proyecto Supabase por empresa** y **schema por empresa**. El motivo decisivo no es de gusto — **lo impone la decisión C**:

| Opción | Qué necesitaría el workflow único de la decisión C |
|---|---|
| Proyecto Supabase por empresa | Cambiar **URL y service_role key en tiempo de ejecución**. Las credenciales de n8n son estáticas por nodo ⇒ habría que hacer viajar secretos dentro de la respuesta de `run-plan`. **Contradice el invariante #5** (*"ningún secreto en git… el BFF es el único portador de secretos"*) |
| Schema por empresa | `Content-Profile: app_30x` dinámico. **Se puede** (ADR-035 ya usa ese header), pero cada una de las 15+ migraciones se corre N veces **a mano en el SQL Editor**, que es como se aplican hoy. Ahí aparece el drift. Y con la decisión D (tablas por pipeline) el conteo es *empresas × pipelines* |
| **Una base + columna** | **Nada.** Usa la credencial `Supabase Registro` que ya tiene y escribe una columna más |

**Y dos capas, porque una sola no alcanza:**

- **Capa 1 — el compilador.** Contexto de tenant **obligatorio y tipado** en todo `lib/`; el acceso a Supabase se envuelve para que **no se pueda construir una query sin él**. Ataca el 100% de `lib/` en tiempo de compilación. **Es la capa que de verdad salva**, porque el modo de falla real no es un atacante: es un `.eq()` olvidado.
- **Capa 2 — la base.** Policies de RLS + el BFF deja de leer con service_role. Es el último freno.

**Se hace la Capa 1 ahora y la Capa 2 como fase propia (§9)**, con disparador escrito. Razón: la Capa 1 es mecánica, verificable con `typecheck` y **no toca producción**; la Capa 2 revierte parte de la migración [`011`](../../core/schema/011_grants_app_service_role.sql) y toca el camino de datos que hoy funciona.

### B · Un nivel ahora, diseñado para dos. Doble grano.

**`clients` se vuelve un árbol**, con una línea:

```sql
alter table clients add column parent_id text references clients (id);
```

- **Hoy:** `30x`, `estadox`, `retia`, sin padre. Un nivel.
- **Mañana:** `viera` con `parent_id = 'retia'`. **El segundo nivel es una fila, no una migración.**
- **Visibilidad:** un usuario pertenece a un cliente y ve **su cliente y sus descendientes**. Regla pura → vive en `domain/`.

El argumento es de [ADR-003](../adr/ADR-003-multicliente-desde-dia-1.md) textual: *"retrofittear la dimensión cliente en datos, config, dashboard y convenciones cuesta caro; tenerla desde el inicio cuesta casi nada."* Esa apuesta ya se ganó una vez en este repo.

**Y el doble grano, que es lo que evita duplicar todo:**

| Grano | Tablas | Por qué |
|---|---|---|
| **`client_id`** | `app.usuarios`, `app.voces`, `app.proyectos`, `app.referentes` | Son de la **empresa** y **cruzan pipelines**. La voz de Andrés Bilbao es la misma para reels y para LinkedIn; scoparla por pipeline la duplicaría y habría que mantener dos |
| **`instance_id`** | `app.ajustes`, `app.candidatos*`, `app.descartes*`, `app.referentes_propuestos`, `app.eventos` | Son de **un pipeline concreto**. Los knobs de reels no son los de LinkedIn. `runs`/`outputs` **ya lo tienen** desde ADR-003 |
| **ninguno** | `app.referentes_proyectos`, `app.referentes_propuestos_proyectos` | Join tables: heredan por FK con `on delete cascade` ([`012`](../../core/schema/012_referentes_proyectos.sql), [`013`](../../core/schema/013_corte_escritura.sql)) |

`instances` **ya es** `workflow × cliente`. No se inventa una entidad: se usa la que ADR-003 creó y hoy está infrautilizada.

### C · Un workflow parametrizado por tenant, no una copia por empresa

`run-plan` sube a **`version: 2`** con `?instancia=<uuid>`. Un solo re-import coordinado, y después sumar empresa = una fila.

Se descartó **una copia de workflow por empresa** (lo que hay hoy): a 3 empresas × 2 pipelines son **6 copias que mantener sincronizadas a mano**, y §1.4 mide lo que cuesta cada re-import. Y se descartó **una instancia de n8n por empresa**: es la fase 2 de [ADR-005](../adr/ADR-005-hosting-n8n-managed-fase1.md) adelantada sin disparador, y **hoy no hay runbooks de operación** (eso es F6, sin empezar).

#### ⚠️ La tensión de esta decisión, y cómo se resuelve — leer antes de implementar

Un workflow que recorra las 3 empresas **dentro de la misma ejecución** rompe dos cosas:

1. **El invariante #1** (aislamiento de fallos): el error de un tenant se lleva puesta la corrida de los otros.
2. **El presupuesto de tiempo, que es un límite duro y medido.** `N8N_RUNNERS_TASK_TIMEOUT` es **900 s en el pod** y **mata el Code node entero** — pasó 3 veces el 07-10, y la corrida muere sin entregar nada. Por eso `Transcribir` tiene 840 s de presupuesto y `Traducir` los ganó en agosto ([ADR-044](../adr/ADR-044-todo-nodo-caro-tiene-presupuesto.md)). **Tres tenants en serie dentro del mismo nodo es la corrida muerta garantizada.**

**La resolución: una definición de workflow, N ejecuciones — no un loop interno.**

Un **dispatcher** consulta las instancias activas y dispara el motor **una vez por instancia**, pasando `instancia` en el payload.

- Cada ejecución conserva **el mismo presupuesto de 840 s que tiene hoy**. El cálculo del handoff sigue valiendo: con `CONCURRENCIA=24` a ~27 s/video, 840 s cubren ~745 videos **por tenant**.
- El single-flight de [ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md) pasa a ser **por instancia**.
- Un fallo **no cruza tenants**. Invariante #1 intacto.
- La cola de n8n gobierna la concurrencia.

Y no contradice ADR-006: ese ADR descartó el *workflow padre como centro del sistema* y **autorizó explícitamente el dispatcher** como componente opcional (C9).

### D · Tablas propias por pipeline

`app.candidatos_linkedin`, `app.descartes_linkedin`, `app.referentes_linkedin`, contra el contrato común de `core/contracts/schemas/`. **No se toca el enum `app.plataforma`.**

Se descartó generalizar `candidatos` a "pieza candidata": daría una tabla ancha con nulls y un enum que crece cada vez. El costo aceptado: la UI de curación y algunas vistas se duplican, y hay que decidir explícitamente qué es común — que es justo lo que `content_item`/`output` ya especifican.

---

## 3. Fase 0 — Los ADRs (antes de tocar nada)

Cinco archivos en [`docs/adr/`](../adr/), uno por decisión, con su porqué y sus alternativas descartadas. Tres re-litigan decisiones vigentes y por eso **no pueden ser un comentario en un commit**.

| ADR | Qué fija | Qué toca de lo existente |
|---|---|---|
| **ADR-046** — El cockpit es multi-tenant | `client_id`/`instance_id` en `app`, el doble grano, `clients.parent_id` | **Extiende ADR-003** al schema que no existía cuando se escribió |
| **ADR-047** — Aislamiento en dos capas | Capa 1 tipos / Capa 2 RLS, **con el disparador escrito** de cuándo entra la 2 | Enmienda la nota de [`011`](../../core/schema/011_grants_app_service_role.sql) |
| **ADR-048** — `run-plan` v2, motor parametrizado | El param `instancia`, y que `<<INSTANCE_ID>>` **deja de ser constante de instancia** | Sube [`run-plan.md`](../../core/contracts/run-plan.md) a `version: 2`; enmienda [`ingesta-registro.md`](../../core/contracts/ingesta-registro.md) |
| **ADR-049** — Un pipeline, sus tablas | Qué es común y qué es propio | Enmienda [`workflow-manifest.md`](../../core/contracts/workflow-manifest.md) |
| **ADR-050** — El dispatcher dispara una ejecución por instancia | Por qué no es el workflow padre de ADR-006 y cómo preserva el invariante #1 | **Activa C9** de [PLAN §2.2](../../PLAN.md) |

---

## 4. Fase 1 — Fundación de datos

**`core/schema/016_multi_tenant.sql`.** Se aplica a mano en el SQL Editor, como las 15 anteriores. Es larga: conviene leerla entera antes de correrla.

### 4.1 El árbol de clientes y la identidad de instancia

```sql
alter table clients add column parent_id text references clients (id);
create index clients_parent_idx on clients (parent_id);

-- Identidad legible de la instancia: hoy no tiene nombre, y con N instancias por
-- cliente hace falta para la URL y para el selector del cockpit.
alter table instances add column slug   text;
alter table instances add column nombre text;

-- El unique viejo impide dos instancias del mismo pipeline para un cliente (§1.3).
alter table instances drop constraint instances_workflow_id_client_id_key;
alter table instances add  constraint instances_identidad_key
  unique (workflow_id, client_id, slug);
```

> ⚠️ **`parent_id` habilita ciclos.** Un `check` no alcanza (Postgres no valida recursión en un check). La garantía va en dos sitios: un `trigger` que rechaza el ciclo al insertar/actualizar, **y** el recorrido en `domain/tenant.ts` con tope de profundidad. Cinturón y tirantes, porque un ciclo cuelga la resolución de visibilidad en cada request.

### 4.2 Las columnas de tenant

```sql
-- Grano empresa
alter table app.usuarios   add column client_id text references clients (id);
alter table app.voces      add column client_id text references clients (id);
alter table app.proyectos  add column client_id text references clients (id);
alter table app.referentes add column client_id text references clients (id);

-- Grano instancia
alter table app.ajustes               add column instance_id uuid references instances (id);
alter table app.candidatos            add column instance_id uuid references instances (id);
alter table app.descartes             add column instance_id uuid references instances (id);
alter table app.referentes_propuestos add column instance_id uuid references instances (id);
alter table app.eventos               add column instance_id uuid references instances (id);
```

**Nacen nullables a propósito** — el `not null` entra después del backfill (§4.5). Ese orden es el que evita que la migración falle sobre datos vivos.

### 4.3 Reparar los cinco uniques globales

```sql
-- Dedup: deja de ser global (§1.3, la más grave)
drop index processed_items_lookup;
alter table processed_items drop constraint processed_items_platform_external_id_key;
alter table processed_items alter column instance_id set not null;
alter table processed_items add constraint processed_items_dedup_key
  unique (instance_id, platform, external_id);
create index processed_items_lookup on processed_items (instance_id, platform, external_id);

-- Feed
drop index app.candidatos_external_id_key;
create unique index candidatos_external_id_key
  on app.candidatos (instance_id, external_id);

-- Ajustes: la PK pasa a ser compuesta; el check del AJUSTE_MAP se conserva tal cual
alter table app.ajustes drop constraint ajustes_pkey;
alter table app.ajustes add  constraint ajustes_pkey primary key (instance_id, clave);

-- Outputs: instance_id denormalizado. Además de scopear, evita que v_outputs_recientes
-- tenga que juntar 4 tablas solo para saber de quién es una fila.
alter table outputs add column instance_id uuid references instances (id);
drop index outputs_external_id_key;
create unique index outputs_external_id_key
  on outputs (instance_id, external_id) where external_id is not null;
create index outputs_instance_idx on outputs (instance_id);
```

> 🩸 **El dedup es la reparación que más importa y la que menos se ve.** El handoff mide que es brutal: *"2 h después de esa corrida, 491 pretrim quedaron en 35 filtrados."* Con dedup global entre empresas, la segunda que arranque **recibe casi nada** y el síntoma es "el motor no trae contenido", no un error.

### 4.4 Las vistas: exponer el eje, no filtrar adentro

Vistas afectadas: `v_salud_referentes`, `v_senal_seleccion`, `v_embudo_semana`, `v_costos_semana`, `v_metricas_calidad`, `v_corpus_aprobados`, `v_outputs_recientes`, `v_falsos_negativos`.

**Criterio: la vista expone la columna de scoping; el filtro lo pone `lib/`.** Es lo que deja la puerta abierta a que las policies de RLS de la Capa 2 filtren sin reescribir nada.

`v_salud_referentes` es el caso delicado: hoy lee `runs` **sin filtrar por instancia** (`where r.params->>'workflow' = 'motor'`). Con dos tenants **mezcla señales de empresas distintas** en la misma tasa.

> ⚠️ **Regla heredada de la [`015`](../../core/schema/015_salud_referentes_una_fila.sql), y se respeta acá:** *"todo join nuevo tiene que garantizar UNA fila por referente"*. Las CTEs de `seguidores` ya nacieron con `distinct on` justamente por eso. **Agregar el eje de tenant es exactamente el tipo de cambio que reintroduce el fan-out** — y el síntoma sería otra vez una tasa que se ve razonable y está mal.

### 4.5 Backfill y cierre

```sql
-- Todas las filas vivas son del tenant piloto.
update app.voces      set client_id = '<slug piloto>' where client_id is null;
-- … idem proyectos, referentes, usuarios
update app.ajustes    set instance_id = '<uuid instancia piloto>' where instance_id is null;
-- … idem candidatos, descartes, referentes_propuestos, eventos, outputs, processed_items

-- Recién ahora:
alter table app.voces     alter column client_id   set not null;
alter table app.ajustes   alter column instance_id set not null;
-- … el resto
```

Y los índices de acceso, que son los que sostienen el rendimiento cuando el feed crece por tenant:

```sql
create index candidatos_instancia_estado_idx on app.candidatos (instance_id, estado);
create index descartes_instancia_idx         on app.descartes  (instance_id, creado_en desc);
create index proyectos_cliente_idx           on app.proyectos  (client_id);
create index referentes_cliente_idx          on app.referentes (client_id);
```

> 🧹 **Antes de correr la migración, limpiar el dato sucio que el handoff arrastra:** `@casper_smc` está **dos veces** en `app.referentes`, con dos ids distintos y la misma plataforma. Con `client_id not null` esa fila duplicada se congela en el modelo nuevo. Mirar qué proyectos tiene cada una antes de borrar: si difieren, borrar la equivocada le saca fuentes a un proyecto.

---

## 5. Fase 2 — Capa 1: el tenant que el compilador no deja olvidar

**Es la fase que de verdad protege, y no toca producción.**

### 5.1 `apps/dashboard/domain/tenant.ts` *(nuevo, puro, con `.test.ts`)*

Va en `domain/` porque es la misma clase de regla que [`domain/roles.ts`](../../apps/dashboard/domain/roles.ts), que ya vive ahí y se testea con `node:test`.

```ts
export type TenantContext = {
  clientId: string;        // el cliente del usuario
  visibles: string[];      // clientId + descendientes (parent_id)
  instanceId: string;      // la instancia del cockpit abierto
};
```

Contenido: resolución de visibilidad recorriendo `parent_id` **con tope de profundidad** (§4.1), `puedeVerCliente()`, `puedeVerInstancia()`, y la composición con `puedeVerZona()` que ya existe. **Sin IO, sin React, sin supabase** — la misma disciplina de `domain/roles.ts`.

### 5.2 `apps/dashboard/lib/supabase/scoped.ts` *(nuevo)*

**La pieza clave del plan.** Envuelve el acceso a Supabase de forma que **no se pueda construir una query sin `TenantContext`**. Convierte "acordate de filtrar" en un **error de compilación**.

Aplica el filtro correcto según el grano de la tabla (§2-B): `client_id in (ctx.visibles)` o `instance_id = ctx.instanceId`. El mapa tabla→grano vive acá, en un solo lugar, y una tabla nueva sin entrada **no compila**.

### 5.3 `apps/dashboard/lib/auth.ts`

- `usuarioActual()` suma `client_id` (leyendo la columna nueva de `app.usuarios`).
- Nueva `exigirTenant(zona, cliente, pipeline)` que **compone con `exigirZona()` sin reemplazarla** — el chequeo de rol que ya funciona no se toca.

### 5.4 Los ~15 archivos de `lib/`

`proyectos.ts` · `referentes.ts` · `candidatos.ts` · `ajustes.ts` · `descartes.ts` · `sugeridos.ts` · `runs.ts` · `entender.ts` · `historicos.ts` · `transcribir.ts` · `transcripciones.ts` · `descubrimiento.ts` · `eventos.ts` · `config.ts` · `enlace.ts`

**Un solo patrón repetido en todos**, no quince cambios distintos:

```ts
// antes
export async function leerProyectos(): Promise<ProyectoGuardado[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.schema("app").from("proyectos")…

// después
export async function leerProyectos(ctx: TenantContext): Promise<ProyectoGuardado[]> {
  const q = scoped(ctx).from("app.proyectos");   // el filtro ya viene puesto
  …
```

**No hay que enumerar los sitios a mano: `npm run typecheck` produce la lista exacta y no deja terminar hasta que esté vacía.** Ese es el punto entero de la Capa 1.

### 5.5 Las Server Actions

`app/(zonas)/**/actions.ts` resuelven el contexto desde la sesión + la ruta y lo pasan hacia abajo. **`domain/` no cambia** salvo el archivo nuevo: los 138 tests existentes son la red que dice que el refactor no cambió comportamiento.

---

## 6. Fase 3 — Rutas: un cockpit por (empresa × pipeline)

```
app/(zonas)/curar/feed/page.tsx
→ app/[cliente]/[pipeline]/(zonas)/curar/feed/page.tsx
```

URL resultante: **`/30x/reels/curar/feed`**, `/estadox/linkedin/operar`, …

**Por qué en la URL y no en una cookie:** los links se pueden compartir entre compañeros, el caché de Next keyea correcto por tenant, y el tenant **no se puede perder** al navegar. Una cookie de tenant es un bug de caché esperando.

- El `layout.tsx` resuelve `(cliente, pipeline) → instance` **en el servidor** y valida contra los clientes visibles del usuario. Un cliente ajeno en la URL es un `redirect`, exactamente como hoy hace `exigirZona`.
- El nav (que hoy se arma con `zonasDe(rol)` en [`app/(zonas)/layout.tsx`](<../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/layout.tsx>)) suma el selector de empresa/pipeline, **visible solo si el usuario tiene más de uno** — un operador de EstadoX no ve que existen las otras.
- **`proxy.ts` no cambia.** Sigue siendo el chequeo optimista de sesión; la autoridad sigue en cada página. Y su excepción para `/api/engine` sigue siendo necesaria (un redirect a `/login` ahí sería un 200 con HTML para n8n = fail-closed roto).

---

## 7. Fase 4 — `run-plan` v2, el motor parametrizado y el dispatcher

### 7.1 El contrato

[`core/contracts/run-plan.md`](../../core/contracts/run-plan.md) → **`version: 2`**.

- Nuevo param **obligatorio** `?instancia=<uuid>`; se conserva `?ambito=motor|completo`.
- **Instancia ausente, mal formada o ajena ⇒ 400/403 y la corrida no arranca.** El fail-closed de ADR-028 §4 **no se afloja**: *"una corrida sin config entrega ruido; no entregar es mejor."*
- Se aprovecha el bump para **matar `fields.uuid`**, que ya es redundante (vale lo mismo que `id`) y que el handoff dejó anotado que *"muere en el próximo re-import que haga falta por otra cosa"*. **Este es ese re-import.**
  > ⚠️ El handoff también dejó dicho por qué la vez pasada se decidió **no** aprovecharlo: *"son cambios sin relación, y si la corrida de verificación sale mal quedan dos sospechosos."* Acá sí corresponde, porque el cambio de forma **ya** obliga al re-import — pero conviene verificar en dos pasos (primero instancia, después limpiar `uuid`) si la primera corrida sale rara.

### 7.2 El endpoint y la fachada

- [`app/api/engine/run-plan/route.ts`](../../apps/dashboard/app/api/engine/run-plan/route.ts): resuelve la instancia, arma el `TenantContext` y se lo pasa a `leerRunPlanCrudo()`. **`lib/config.ts` ya es la costura donde se decide de dónde sale cada dominio** — es el archivo correcto y no hay que crear otro.
- **Nuevo `GET /api/engine/instancias?workflow=<slug>`** → las instancias activas de un pipeline. Misma auth de header compartido, mismo fail-closed. Lo consume el dispatcher.

### 7.3 El workflow del motor

Pierde `<<INSTANCE_ID>>` como constante y lo toma **del payload del webhook**. Los otros 5 placeholders siguen igual.

> 🚨 **Un solo re-import coordinado, con el checklist del handoff a la vista — son 6, no 2:**
> `<<DASHBOARD_URL>>` · `<<INSTANCE_ID>>` · `<<SUPABASE_URL>>` · `<<WEBHOOK_PATH_MOTOR>>` · `<ANTHROPIC_API_KEY>` · `<SUPADATA_API_KEY>`.
> Los dos últimos **muerden a mitad de corrida**, no al principio.
>
> **Y el reflejo que hay que guardar, textual del handoff:** *"`runs` no distingue 'colgada' de 'muerta', Apify sí."* Si la corrida de verificación parece lenta, mirar Apify con el `APIFY_TOKEN` del `.env`: cero llamadas ⇒ murió antes de scrapear.

### 7.4 El dispatcher

Workflow n8n nuevo (`Workflows/workflow-dispatcher/`), autorizado por ADR-006 C9:

```
[cron] → GET /api/engine/instancias?workflow=short-form-content
       → por cada instancia: POST al webhook del motor con { instancia }
```

- **Continue-on-fail por iteración**: un tenant caído no corta a los otros (invariante #1).
- El dispatcher **no procesa nada**: solo dispara. Si se cae, no hay pérdida de datos — se vuelve a disparar.

### 7.5 El botón ▶ del cockpit

[`app/(zonas)/operar/actions.ts`](<../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/operar/actions.ts>): `MOTOR_WEBHOOK_URL` deja de ser una env var singular por empresa. El botón manda `instancia` en el payload, y el single-flight guard pasa a ser **por instancia** (hoy es global por copia de workflow). Idem `buscarAhora()` y `hayBusquedaViva()`.

---

## 8. Fase 5 — LinkedIn como el N+1 real

Es el test de "clonar y configurar" hecho con un pipeline real, que es lo que [PLAN §F5](../../PLAN.md) siempre pidió.

- **`Workflows/workflow-linkedin/`** con su `workflow.yaml` (manifest contra las 8 etapas canónicas de PLAN §2.4; la etapa 4 ENRIQUECER se declara `n/a` — LinkedIn ya es texto, sobra la transcripción) y su `README.md`.
- **`core/schema/018_pipeline_linkedin.sql`** *(era la `017` en la versión original de este plan; la Fase 1 se partió en `016` + `017_multi_tenant_cierre` — ver el log del handoff)*: `app.candidatos_linkedin`, `app.descartes_linkedin`, `app.referentes_linkedin`, todas con `instance_id`. **No se toca el enum `app.plataforma`.**
- Las zonas de `curar` se parametrizan por pipeline; `domain/feed.ts` se generaliza contra `content_item`.
- **`core/templates/`** y los runbooks `docs/runbooks/agregar-workflow.md` + `agregar-cliente.md`, que F5 ya listaba y nunca se escribieron.

> **Criterio de hecho, textual de PLAN §F5:** *"si algún paso de la guía exige modificar el núcleo, el diseño no está listo — se corrige la guía/el contrato, no se parchea a mano"* (invariante #3).

---

## 9. Fase 6 — Capa 2 (RLS), con disparador escrito

**No se hace ahora, y eso es deliberado. Entra antes de prender el segundo cockpit en producción — no antes, no después.**

- Policies en `app.*` que filtran por el tenant del usuario.
- El BFF deja de leer con `createAdminClient()` y pasa a la sesión del usuario. **[`lib/supabase/server.ts`](../../apps/dashboard/lib/supabase/server.ts) ya existe para eso y hoy casi no se usa** — su propio comentario dice *"cuando entre (D1+) vivirá solo en Route Handlers puntuales del BFF"*, o sea que el diseño ya lo anticipaba.
- `service_role` queda **solo** para la fachada y las escrituras de n8n.

> ⚠️ **La parte cara, y hay que saberla antes de empezar:** la migración [`011`](../../core/schema/011_grants_app_service_role.sql) existe porque *"`service_role` tiene BYPASSRLS, pero saltear RLS NO otorga USAGE sobre el schema ni privilegios sobre las tablas: Postgres los pide igual, y Supabase solo auto-otorga sobre `public`."* Volver a leer con el rol `authenticated` sobre un schema propio requiere sus propios grants **y** sus policies. Es la fase con más riesgo de romper lo que funciona, y por eso va sola y al final.

---

## 10. Casos de escalabilidad, uno por uno

El pedido fue explícito: *"pensar en todos los casos de escalabilidad posibles para facilitar el funcionamiento en el futuro."* Cada eje, qué se rompe primero, y qué hace el diseño.

| Eje de crecimiento | Qué se rompe primero hoy | Qué hace este plan | Qué queda pendiente |
|---|---|---|---|
| **+ pipelines** (LinkedIn, y los que vengan) | El enum `app.plataforma` y `candidatos` modelado como video (§1.6) | Tablas propias por pipeline (D) + el manifest como contrato (§8) | Cada pipeline nuevo duplica pantallas de curación. Si llegan 4+, revisar si conviene un componente de feed genérico |
| **+ empresas** | Los 5 uniques globales (§1.3) y la ausencia de tenant en `app` | `client_id`/`instance_id` + Capa 1 + Capa 2 | 🔴 **El Google Sheet del histórico es UNO SOLO** — el archivado lo tiene como constante del nodo `Config`, no por instancia: los aprobados de la empresa B se appendean al Sheet de Retia. **§14.4** |
| **+ sub-clientes** (los clientes de Retia) | Nada — hoy es imposible | `clients.parent_id`: el segundo nivel es **una fila** | La UI del selector con dos niveles; la visibilidad ya queda resuelta en `domain/tenant.ts` |
| **+ instancias del mismo pipeline por empresa** | `unique (workflow_id, client_id)` lo prohíbe | Se reemplaza por `(workflow_id, client_id, slug)` (§4.1) | — |
| **+ usuarios** | El alta es **manual en dos pasos** (invite en Supabase + `insert` a mano en el SQL Editor, documentado en [`007`](../../core/schema/007_app_usuarios.sql)) | Nada. **Sigue manual a propósito** | 🔶 **Con 3 empresas × varias personas esto se vuelve fricción real.** Una pantalla de alta scopeada por tenant es candidata a fase propia — no bloquea, pero se va a sentir |
| **+ volumen de candidatos** | El feed cargaba **todo**, y `app.candidatos` crece sin tope desde que se sacó la cuota de Airtable ([`009`](../../core/schema/009_app_config_sombra.sql): *"sin cuota: dejan de borrarse por presión de espacio"*) | Índices por `(instance_id, estado)` (§4.5) | ✅ **Cerrado el 06/08.** Y el diagnóstico estaba a medias: el problema no era solo *cuántas* filas, era **qué traía cada una** — 240 KB de los 337 eran 3 campos de texto que la tarjeta cerrada no dibuja |
| **+ referentes** | Nada estructural — **es la palanca que el sistema pide** | El banco pasa a ser por empresa | El handoff: *"la palanca de verdad es sumar referentes"* |
| **+ corridas concurrentes** | `N8N_RUNNERS_TASK_TIMEOUT` 900 s mata el Code node; single-flight global por copia de workflow | Una ejecución por instancia (§2-C) preserva el presupuesto por tenant; single-flight por instancia | Cuando N ejecuciones simultáneas saturen el pod → fase 2 de ADR-005 (VPS). **Disparador: medido, no anticipado** |
| **+ costo** | Ninguna atribución por empresa hoy en `app` | `runs.costo_estimado` **ya** cuelga de `instance_id` ⇒ el costo por empresa es una query, sin trabajo nuevo | Techo de gasto **por instancia** (hoy `cap_top_n` es global — y el handoff midió que además **corta global, no por proyecto**: con el cap en 10, un proyecto se llevó los 10 lugares y cuatro quedaron en `evaluados: 0`) |
| **+ almacenamiento** | Supabase free: **500 MB y pausa por inactividad** ([PLAN §2.5](../../PLAN.md)) | — | Con N tenants los 500 MB se comparten. `candidatos`/`descartes` son las que crecen. [ADR-045](../adr/ADR-045-se-borra-solo-lo-que-nunca-produjo-nada.md) y el archivado ya existen: **hay que medirlos por tenant** y poner el disparador de upgrade |
| **+ superficie de frontend** | Páginas con lecturas encadenadas | `lib/config.ts` ya usa `Promise.all` — es el patrón a replicar | Server Components + Vercel aguantan; el riesgo es de queries, no de render |

### El cuello que ninguna de estas fases toca, y hay que decirlo

El handoff mide que **todos** los proyectos, en **todas** las corridas, reportan `razon_faltante: supply`. La corrida más grande (31/07 16:28, 280 crudos, 191 transcritos, sin que el cap mordiera) entregó **139 de 400**. Los 4 proyectos de comunicación comparten **7 cuentas** y `Armar candidato` le da cada video a **un solo** proyecto.

**Repartir el producto a más empresas no empeora eso — pero tampoco lo arregla.** Cada empresa nueva arranca con su propio problema de supply y su propio banco de referentes vacío. Es otro trabajo, y conviene que esté dicho antes de que alguien espere que el refactor lo resuelva.

---

## 11. Verificación

### 11.1 Lo que el repo ya exige (CLAUDE.md §Feedback loops)

```bash
cd core/scripts && npm run validate      # manifest + escaneo de secretos (1616 checks). Siempre.
cd apps/dashboard && npm run typecheck   # ← la lista de trabajo de la Fase 2 sale de acá
cd apps/dashboard && npm test            # 138 tests de domain/ + los nuevos de tenant.ts
cd apps/dashboard && npm run build       # OBLIGATORIO: las Fases 2–3 tocan rutas y auth
node Workflows/auditar-workflows.mjs     # OBLIGATORIO en Fase 4: se tocan conexiones
node Workflows/workflow-short-form-content/test-nodos.mjs   # antes de re-importar
```

> ⚠️ **Trampa de entorno conocida, no la confundas con una regresión:** hay un test que hace una llamada real a la red si `GEMINI_API_KEY` está exportada en el shell. Está documentada y aceptada.

### 11.2 Pruebas nuevas, específicas de este refactor

En `domain/tenant.test.ts` (puras) + una suite de integración contra la base:

1. **Fuga horizontal** — un usuario de la empresa A **no puede** leer un `candidato` de la B. Contra la base, **no con mocks**: los mocks no atrapan un `.eq()` olvidado.
2. **Fuga por la fachada** — un `?instancia=` que no pertenece al llamante devuelve **403 y la corrida no arranca**.
3. **Dedup por tenant** — el mismo `external_id` entra **una vez por instancia** en `processed_items`. Es el test que prueba que el dedup dejó de ser global.
4. **Knobs aislados** — cambiar un ajuste en la empresa A **no lo mueve** en la B.
5. **Visibilidad jerárquica** — un usuario de `retia` ve `viera`; uno de `viera` **no** ve `retia` ni a sus hermanos.
6. **Ciclo en el árbol** — poner `parent_id` de A → B y de B → A es rechazado, y la resolución no cuelga.
7. **Una fila por referente** — `v_salud_referentes` con dos tenants devuelve exactamente `count(referentes)` filas (la regresión de la `015`).

### 11.3 Prueba de fuego end-to-end, en este orden exacto

1. Aplicar `016` en el SQL Editor.
2. Deploy de la Fase 2 (Capa 1) — **antes** del re-import, porque el zod de la fachada se endurece.
3. Crear una **segunda instancia de prueba** (cliente ficticio, referentes propios).
4. Re-importar y publicar el motor **con los 6 placeholders**.
5. Poner el techo de gasto en **10** — es la corrida más barata que existe.
6. Correr **las dos instancias**.
7. Confirmar en `runs.metricas`: **10 videos distintos por instancia**, y que **la segunda no vio nada de la primera**.
8. Devolver el techo a **250**.

> Si el cambio no agarró, **la corrida sale verde igual** y transcribe 250. Es la misma familia de fallo silencioso que los 4 hallazgos de D7 — por eso el paso 7 es un `select`, no un vistazo.

---

## 12. Orden de ejecución (el checklist)

| # | Fase | Bloquea a | Toca prod | **Estado (2026-08-04)** |
|---|---|---|---|---|
| 1 | **Fase 0** — los 5 ADRs | todo lo demás (`core/` solo cambia con ADR) | no | ✅ ADR-046..050 escritos (+051/052) |
| 2 | 🧹 Limpiar el `@casper_smc` duplicado | la `016` (`not null`) | sí, un `delete` | ✅ hecho |
| 3 | **Fase 1** — `016_multi_tenant.sql` | Fases 2 y 4 | sí | ✅ **`016` y `017` aplicadas y verificadas** |
| 4 | **Fase 2** — Capa 1 (tipos + `scoped.ts` + `lib/`) | Fase 3 | no (deploy sin cambio de comportamiento) | ✅ en prod |
| 5 | **Fase 3** — rutas `[cliente]/[pipeline]` | el segundo cockpit | sí (URLs cambian) | ✅ en prod · el 404 de la base y los bookmarks viejos, cerrados (cierre 89) |
| 6 | **Fase 4** — `run-plan` v2 + motor + dispatcher | el segundo tenant corriendo | sí, **re-import** | ✅ en prod · corrida de verificación `ok` |
| — | **ADR-051/052** — `018_membresias` + `019` | Capa 2, y el alta de usuarios externos | sí | ✅ **COMPLETO** — mergeada (`ad2de5b`), `018` + `019` aplicadas y verificadas por su efecto (04/08) |
| 7 | ~~**Paginación del feed**~~ (§10) | el segundo tenant con volumen | no | ✅ **HECHA el 2026-08-06.** Keyset sobre `(heat desc, id asc)`, filtro y contadores en el server, y los 3 textos largos fuera del listado: **405 KB → 16 KB** por carga. Verificada contra prod a nivel query; ⏳ falta el clic |
| 8 | **Fase 6** — Capa 2 (RLS) | **prender el segundo cockpit en producción** | sí | ✅ **COMPLETA el 2026-08-05** — la `021` aplicada **y** el flip de `scoped.ts` en prod (`d8edea2`, [ADR-058](../adr/ADR-058-el-flip-de-la-capa-2.md)). Verificada con cuenta no dueña y con las 4 zonas cargando |
| 9 | **Fase 5** — LinkedIn | — | sí (una migración) | 🔧 **EN CURSO desde el 06/08.** La **`020` aplicada** + 3 cockpits en `instances` (2 `active`, `retia/linkedin` en `draft`) · **1ª pantalla construida** (Referentes: `domain/linkedin.ts`, `lib/referentes-linkedin.ts`, ramificado por `workflowId`, las 4 tablas en `scoped.ts`) · **[`024`](../../core/schema/024_rls_linkedin.sql) APLICADA el 06/08** y re-verificada por su efecto el mismo día (§14.6) · ✅ `core/templates/` + los runbooks salieron el 06/08 (B4) · 🛑 **el workflow en n8n y su cron NO se construyen todavía — decisión de Mani, 2026-08-06.** Ver abajo |

> ✅ **Al 2026-08-06 queda uno: el #9 (LinkedIn), y arrancó.** El #7 se cerró el 06/08 y no bloqueaba
> a nadie; se hizo igual porque era lo único numerado que quedaba antes de la Fase 5, y porque su
> síntoma ya era medible con un solo tenant.
>
> 🩸 **Lo que la primera pantalla de LinkedIn destapó, y que ningún doc decía:** los cockpits de
> LinkedIn **ya eran alcanzables** (2 de 3 `active`, y hay una cuenta con membresía en 30X y EstadoX
> desde el 05/08) y su zona `curar` dibujaba **las 7 tarjetas de reels**. Seis apuntaban a pantallas
> que leen las tablas de reels y devuelven vacío para ese `instance_id` — sin fallar, que es lo peor:
> en un pipeline recién nacido "no hay nada" se lee como *"todavía no cargamos datos"*. ADR-056 había
> resuelto el nav **por zona** y nadie miró un nivel más abajo. Arreglado: el índice de `curar` es por
> pipeline y **lista lo que existe, no lo que va a existir**.
>
> ✅ **Y la otra mitad se cerró el mismo día:** `exigirPantallaDeCurar` en `lib/auth.ts`. `exigirTenant`
> guarda por ZONA (ADR-056) y `curar` existe en los dos pipelines, así que escribir la URL a mano
> entraba igual. Ahora las 7 páginas preguntan por su pantalla y el que no corresponde cae al índice
> de `curar` —no a la raíz: el problema no es de permisos, es que esa pantalla no existe en este
> pipeline, así que se lo manda a ver las que sí.
>
> 🔑 **Y la lista quedó UNA.** El primer arreglo puso las tarjetas por pipeline en la página y dejó
> la guardia sin escribir: dos expresiones de la misma verdad —lo que se dibuja y lo que existe—
> libres de divergir, con el peor síntoma posible (una tarjeta que lleva a un redirect). Hoy
> `PANTALLAS_CURAR` + `CURAR_POR_PIPELINE` viven en `domain/pipelines.ts`, el índice **deriva** sus
> tarjetas de ahí y la guardia pregunta a lo mismo. El `Record<PantallaCurar, Copy>` del índice es
> exhaustivo: sumar una pantalla al dominio **no compila** hasta escribirle su texto.
>
> ⚠️ **El orden cambió respecto de lo escrito arriba.** ADR-051 activó el disparador de la Capa 2, así
> que la secuencia real es **`018`/`019` → Capa 2 (RLS) → paginación → LinkedIn**. La fila sin número
> va donde va porque bloquea a la #8, no porque sea una fase nueva.

> ## 🛑 El `workflow.json` de LinkedIn NO se construye todavía — decisión de Mani, 2026-08-06
>
> **Es la parte de la Fase 5 que queda explícitamente parada.** Lo que ya existe se queda como está y
> no molesta: la [`020`](../../core/schema/020_pipeline_linkedin.sql) y la
> [`024`](../../core/schema/024_rls_linkedin.sql) aplicadas, los 3 cockpits en `instances`, la pantalla
> de Referentes, y el manifest en `Workflows/workflow-linkedin/` con `status: draft` — que ya dice, en
> su propio encabezado, que describe el diseño y no algo que corra.
>
> **Por qué, y no es una postergación arbitraria:** lo que bloquea a LinkedIn no es técnico, y está
> escrito desde el cierre 92 y en ADR-055 §Consecuencias — **no hay definición de "funcionó", no
> existe el banco de referentes y faltan los few-shot**. Construir el workflow ahora es construir la
> máquina antes de saber qué tiene que salir de ella, y encima con datos que no existen: las 4 tablas
> `*_linkedin` tienen **0 filas** al 06/08.
>
> **Qué significa en la práctica:**
> - ❌ **No** se crea el workflow en n8n, **no** se le da cron en el dispatcher, **no** se re-importa nada.
> - ✅ Sí sigue viva la prueba de [§14.6](#146) (**B3**): siembra dos filas a mano, mirá que cada
>   cockpit vea solo la suya, borralas. **Eso no necesita el workflow** — ejercita RLS, no el pipeline.
> - ✅ Sí se puede seguir la pantalla de Referentes si hace falta, porque es superficie de curación
>   para carga manual, no para lo que produciría el motor.
>
> 🔑 **El disparador para retomarlo es el mismo de siempre y sigue sin cumplirse:** que alguien
> escriba qué es un post de LinkedIn que funcionó. Hasta entonces esto queda acá y no en el backlog de
> nadie.

**La Fase 5 va al final a propósito:** LinkedIn es el N+1 que *valida* el refactor, no el que lo motiva. Construirlo antes de que la base sea multi-tenant es construir el sexto problema encima de los cinco que ya hay.

---

## 13. Fuera de alcance, a propósito

- **No se toca `domain/`** salvo para agregar `tenant.ts`. Es la capa sana del repo y es la red de regresión.
- **No se re-litiga [ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md)** (n8n escribe por PostgREST). Se paga su costo — un re-import coordinado en la Fase 4 — con los ojos abiertos, igual que lo pagó él.
- **No se toca el problema de supply** (§10). Es real, es el cuello, y es otro trabajo.
- **No se migra a VPS** ([ADR-005](../adr/ADR-005-hosting-n8n-managed-fase1.md) fase 2) hasta que haya un disparador **medido**, no anticipado.
- **No se automatiza el alta de usuarios.** Sigue manual (§10). Se anota como fricción conocida, no como bloqueante.
- **No se rediseña la UI.** El pedido permite cambiar UI/UX si está fundamentado; acá lo único fundamentado es el **selector de empresa/pipeline** y la **paginación del feed**. Todo lo demás se queda.

---

## 14. Pendientes abiertos — escritos para retomarlos sin releer nada

> **Qué es esta sección.** Con las Fases 0–4 en producción, lo que falta ya no es "las fases que
> siguen": son cuatro cosas concretas, tres de ellas encontradas midiendo el sistema el 2026-08-03 y
> **no anotadas en ningún otro lado hasta ahora**. Cada una tiene la misma forma — *qué es · la
> evidencia · qué lo destraba · hecho cuando* — para que una sesión nueva la tome y la ejecute.
>
> **Ninguna bloquea a Retia hoy.** Las tres estructurales muerden recién con la segunda empresa. Eso
> es exactamente por qué conviene cerrarlas antes de que exista, y no después.

### 14.1 ✅ CERRADO — la `018` y la `019` están aplicadas

> **Cerrado el 2026-08-04.** El código está en `main` (`ad2de5b`), la `018` dejó sus **5 membresías**
> (2 dev, 3 operador, todas `retia`, con `es_dueno` en los dos devs) y la **`019` mató `rol` y
> `client_id`**: `app.usuarios` quedó en `id, nombre, creado_en, es_dueno`. Verificado por su
> **efecto** contra prod, no por que la migración haya corrido.

**⚠️ La lección de método, que vale para toda migración con gate humano** (la `017`, la `019`, y las
que vengan): **la `019` se corrió el 03/08, no dio error visible, y no había entrado.** El
`insert into _cierre_membresias` del §0 seguía comentado, así que el `raise exception` abortaba la
transacción entera en silencio. *Una migración con gate no se da por aplicada porque se haya corrido;
se da por aplicada cuando se mide su efecto.*

<details><summary>El enunciado original (2026-08-03), como registro</summary>

**Qué.** [ADR-051](../adr/ADR-051-el-acceso-es-membresia-explicita.md) (el acceso pasa de
`usuarios.client_id` a `app.usuarios_clientes`, con el rol adentro) y
[ADR-052](../adr/ADR-052-el-sponsor-externo-no-ve-el-costo-del-proveedor.md) (el `sponsor` no ve
costos) están **implementados**, en un solo commit: `3f2d43f`, en `origin/refactor/membresias`.
Nunca se mergeó.

**Evidencia.** `app.usuarios_clientes` no existe en prod (PostgREST devuelve `PGRST205`). El
merge-base de la rama con `main` es `7118171`, **anterior al merge de las Fases 0–4**: le faltan 4
commits (`b1b8212`, `66bd25e`, `e5c6668`, `ab6f480`). El commit toca `domain/tenant.ts`,
`lib/auth.ts`, `lib/tenant.ts`, `lib/supabase/scoped.ts`, 4 páginas, y trae
`core/schema/018_membresias.sql` (133 líneas) + `019_membresias_cierre.sql` (69).

> 🚨 **El riesgo, dicho como riesgo.** La `018` mueve el acceso **de columna a tabla**. Si no
> backfillea las **5 filas** de `app.usuarios` —las 5 con `client_id = retia`, **Jero incluido**—
> los cinco pierden el cockpit el día del deploy. El backfill va en la **misma transacción** que el
> `create table`, no en un paso después.

</details>

### 14.2 🟡 `n8n:push` no cubre topología — y la razón que da ADR-053 para eso ya no es cierta

**Qué.** Desde [ADR-053](../adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md), cambiar un
`jsCode` cuesta un comando. Agregar **un nodo** sigue costando el re-import completo, que es donde se
pierden las credenciales (dos intentos fallidos el 03/08, los dos por elegir mal en un desplegable) y
donde vuelven los placeholders a mano.

**Evidencia (medida contra la instancia, API pública v1.1.1).** ADR-053 descarta empujar nodos nuevos
porque *"el repo guarda `<<CREDENCIAL_GOOGLE_SHEETS>>`, un nombre sin id"*. Pero
**`GET /api/v1/credentials` existe y responde 200**, con las 12 credenciales y su `{id, name, type}`:
el mapa nombre→id se puede **aprender de la instancia**, igual que se aprenden los placeholders y por
la misma razón (una tabla a mano sería una segunda verdad). Y los nombres del repo **ya coinciden**
con los reales desde el arreglo del 03/08: `Supabase account` ×26 · `Run Plan Header` ×4 ·
`Webhook Motor Header` ×3 · `Webhook Descubrimiento Header` ×1. El único que sigue siendo placeholder
es `<<CREDENCIAL_GOOGLE_SHEETS>>`, y se aprende del live como cualquier otro.

La instancia además expone, sin usar: `POST /workflows` (crear), `/activate`, `/deactivate`,
`/archive`, `GET /executions` (diagnosticar una corrida sin abrir el editor),
`GET /workflows/{id}/{versionId}`. **`/variables` y `/projects` dan 403 por licencia**, así que no son
opción para config por tenant — vale saberlo antes de diseñar sobre ellos.

**Qué lo destraba.** Es **enmienda de ADR-053, no un ADR nuevo**: un mapa nombre→id aprendido de la
instancia en `core/scripts/n8n-sync.mjs`, con la misma regla que los placeholders (aprendido, nunca
mapeado a mano) y fail-closed si un nombre no resuelve. **La pregunta abierta no es técnica sino de
red de seguridad:** `nodes` **reemplaza**, así que un push que crea nodos también puede borrarlos.
Hay que decidir si `--nodos` pasa a ser obligatorio y si un delta que **borra** exige confirmación
humana explícita.

**Hecho cuando.** Un nodo nuevo entra a un workflow **activo** con `npm run n8n:push -- <alias>
--apply`, `n8n:diff` queda limpio después, y `n8n:restore` lo saca.

### 14.3 ✅ CERRADO — el aislamiento ya no es solo TypeScript: la Capa 2 está viva en producción

> **Cerrado el 2026-08-05 (`d8edea2`).** Los dos pasos están hechos. Se partió en dos a propósito,
> con el mismo expand/contract de la `016`/`017` y la `018`/`019`:
>
> | | Paso | Riesgo | Estado |
> |---|---|---|---|
> | 1 | Aplicar la **`021`**: grants para `authenticated`, las funciones de alcance, **19** policies (`grep -c "create policy"` sobre la migración; los docs decían 17 hasta el 06/08) y `security_invoker` en las 12 vistas | **Ninguno.** El BFF seguía en `service_role`, que bypassa RLS: las policies existían y no se evaluaban en ningún camino | ✅ **APLICADA** (2026-08-03) e inerte, como se diseñó |
> | 2 | El **flip**: `scoped.ts` deja `createAdminClient()` y pasa a la sesión | **Alto.** Acá es donde el aislamiento se vuelve real | ✅ **EN PRODUCCIÓN** (2026-08-05) y **verificado con una cuenta no-dueña de dos empresas** |
>
> **La fachada y n8n no se tocan en ninguno de los dos.** `run-plan`, `instancias` y las escrituras
> por PostgREST siguen con `service_role` por diseño (ADR-028 / ADR-035): no tienen sesión de
> usuario, así que ahí el único filtro posible es el tipado de la Capa 1.
>
> 🩸 **PERO ESO ERA CIERTO COMO INTENCIÓN Y FALSO COMO CÓDIGO, y casi cuesta el motor.** Este párrafo
> —el de arriba, escrito antes del flip— daba por sentado que la fachada no pasaba por `scoped.ts`.
> **Pasa, por dos saltos:**
>
> ```
> app/api/engine/run-plan/route.ts
>   → leerRunPlanCrudo(ctx)                    lib/config.ts
>      → leerAjustesComoRegistros(ctx)         lib/ajustes.ts     ┐
>      → leerVocesComoRegistros(ctx)           lib/proyectos.ts   │→ scoped(ctx)
>      → leerProyectosComoRegistros(ctx)       lib/proyectos.ts   │
>      → leerReferentesComoRegistros(ctx)      lib/referentes.ts  ┘
> ```
>
> Son **las mismas funciones** que usan las pantallas: el corte de D5 las hizo compartidas a
> propósito (`lib/config.ts` es *"la costura donde se decide de qué almacenamiento sale cada
> dominio"*). Flipear `scoped()` a secas dejaba a `run-plan` en **`42501 permission denied for schema
> app`** —sin sesión no hay `auth.uid()` contra el que evaluar una policy— y el motor sin plan que
> leer. Nadie lo tenía escrito porque `lib/config.ts` no aparece grepeando consumidores de `scoped`.
>
> 🟢 *Habría fallado cerrado y barato: 500 en el primer nodo, antes de Apify/Supadata/Haiku. Pero se
> habría descubierto el **lunes 8:00**, con el cron.*
>
> **La forma que resolvió eso: la autoridad viaja en el contexto.** `TenantContext` gana
> `origen: "sesion" | "fachada"`, estampado en los **dos únicos** constructores del sistema —
> `armarContexto()` (hay usuario) y `contextoDeFachada()` (no lo hay) — y `scoped()` elige credencial
> según eso. Se eligió sobre la alternativa (dos puertas, `scoped` + `scopedDeFachada`) porque **no
> hay nada que hilar**: cada función ya recibe `ctx`. Y falla en la dirección correcta: un
> constructor nuevo **no compila** hasta declarar de dónde saca la autoridad, la misma disciplina que
> el mapa de tablas de `scoped.ts`.
>
> 📐 **Esto merece un ADR y todavía no lo tiene** — es una decisión estructural que gobierna cómo se
> elige credencial en todo el BFF, y sin ella escrita alguien va a "simplificar" el discriminante.
> Queda como task.
>
> ⚙️ **Efecto colateral que hay que saber:** `scoped()` es **async** (el cliente de sesión necesita
> `await cookies()`), así que los 36 call sites son `(await scoped(ctx))`. No se cachea el cliente
> entre requests a propósito: un cliente cacheado es la sesión de otra persona.
>
> ### Lo verificado, y con qué se verificó
>
> **El motor, contra el live:** `run-plan` con header **200** (`version: 2`, 3 voces · 5 proyectos ·
> 18 ajustes · 16 referentes) · sin header **403** · sin instancia **400** · instancia ajena **403** ·
> `ambito=completo` **200** · `instancias` del dispatcher **200** con `retia/reels`.
>
> **La Capa 2 viva en prod, no solo en Docker:** con la anon key, `app.voces`/`candidatos`/`ajustes`/
> `proyectos` dan **`42501 permission denied for schema app`**, y `runs`/`outputs` dan **200 con 0
> filas** — las policies evaluando `instancias_visibles()` sin `auth.uid()`. Fail-closed en las dos
> formas que existen.
>
> 🎯 **Y la prueba que hasta hoy era imposible: un no-dueño con membresía en DOS empresas.**
> `alejandro.davila@30x.com` (`es_dueno: false`, operador en `30x` **y** `estadox`, **no** en
> `retia`). Es el único perfil que separa las dos capas, porque RLS le habilita las dos empresas y
> solo el `.eq()` de `scoped.ts` lo acota al cockpit abierto. Verificado en pantalla:
>
> · **La voz de 30X no apareció en EstadoX** (`30x` tiene 1 voz, `estadox` 0). Esa sola fila es todo
>   el test de la distinción entre las dos capas, y hasta este login no existía en producción.
> · **Ni un `42501` navegando**: los grants de `authenticated` son correctos en prod, que era la
>   incógnita cara de ADR-047 (*"la fase con más riesgo de romper lo que funciona"*).
> · **Selector de equipo con 2 opciones**, sin Retia, y sin selector de pipeline.
> · **ADR-056 en las dos direcciones**: `Transcribir` escondida por el pipeline (el rol la tiene),
>   `Entender` por el rol (el pipeline la tiene).
> · **Las 4 URLs a mano rebotaron** (`/retia/reels`, `/retia/reels/curar/feed`, `.../transcribir`,
>   `.../entender`): la guardia está en el servidor, no en que el nav esconda el link.
> · Todo lo demás en **0** en los dos cockpits de LinkedIn, o sea **cero fugas de Retia**.
>
> ⏳ **Lo que falta, y es la otra mitad del riesgo:** todo eso corrió sobre cockpits **vacíos**. Las
> pantallas **con datos** (`/retia/reels`) siguen sin verificarse con una sesión — y la zona
> **`Entender`** es la de más riesgo del flip entero, porque son las 12 vistas `security_invoker`.
> Ver §Pendiente vivo del [handoff](./handoff.md).
>
> 🩸 **El hallazgo que la fase no tenía escrito, y que la decidía entera.** Las 27 vistas se crearon
> **sin `security_invoker`**. En Postgres una vista corre con los permisos de *su dueño*: escribir
> policies y dejar las vistas como estaban habría dejado toda la zona *Entender* sin RLS, y no se
> habría notado, porque con un tenant devuelven las filas correctas igual. **Medido:** apagando
> `security_invoker` en `v_metricas_calidad`, un operador de Retia ve **2 filas en vez de 1** — las
> de EstadoX incluidas.
>
> ⚠️ Y dos cosas más que encontró **la corrida y no el diseño**: con `security_invoker`, las vistas
> necesitan que *el usuario* alcance todo lo que cruzan, así que `clients`/`instances`/`workflows` y
> las 6 vistas de `public` necesitan sus propios grants. Sin eso la zona Entender devuelve `42501`
> el día del flip. Los dos ya están en la `021`.

**Qué.** El BFF lee **todo** con `service_role`, que bypassa RLS. Con la `021` aplicada las policies
existen, pero **no se evalúan en ningún camino** hasta el flip.

**Evidencia.** **No hay fuga hacia afuera hoy** (con la anon key: `app.candidatos` → **401**,
`public.runs` → **200 con 0 filas**), y por eso esto no es una emergencia. Pero adentro del BFF, un
`.eq(instance_id)` olvidado no lo atrapa nada más que la Capa 1 — que es tipos, o sea disciplina de
compilación, no una barrera de la base.

**Qué lo destraba.** §9 de este plan. La parte cara ya está medida y hay que saberla **antes** de
empezar: la [`011`](../../core/schema/011_grants_app_service_role.sql) existe porque `service_role`
tiene BYPASSRLS pero eso **no** otorga USAGE sobre el schema — volver a leer con `authenticated`
sobre `app` necesita sus propios grants **y** sus policies. Es la fase con más riesgo de romper lo
que funciona.

**Disparador (ya escrito en [ADR-047](../adr/ADR-047-aislamiento-en-dos-capas.md)).** Entra **antes**
de que un segundo cliente real tenga usuarios en producción. No antes, no después. **Se prueba con la
cuenta de Jero**, que es la que se puede perder.

### 14.4 ✅ CERRADO — el Google Sheet del histórico ya no existe

> **✅ CERRADO ENTERO el 2026-08-05, y medido el 06/08.**
> [ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) aceptó la opción 2 (el
> Sheet se muere) en dos pasos, **y los dos están hechos**:
>
> - **Paso 1 (en prod desde el 04/08):** `/curar/historicos` exporta un CSV con las 15 columnas del
>   Sheet en su orden, verificado contra las 31 filas reales con un parser RFC 4180 independiente.
>   *(⏳ lo único que queda de esto es **el clic**: nadie apretó el botón en un browser. Está en el
>   checklist de ojo humano de §15.B.)*
> - **Paso 2 (05/08):** los **3 nodos del Sheet se borraron a mano en el editor de n8n** — no por
>   re-import, que crea un workflow con id nuevo. **No hizo falta esperar a D8.**
>
> 📏 **Medido el 2026-08-06 por la API de n8n:** el archivado son **17 nodos** y los **5** workflows
> del sistema tienen **cero nodos de Google** y cero credenciales de Google. Con eso se fue **la
> última dependencia de Google del pipeline**.
>
> 🔑 **El riesgo que esta sección describía está muerto por construcción, no mitigado:** ya no hay
> un destino global al que appendear. El histórico de cada empresa vive en `outputs`, que cuelga de
> `instance_id`, y el CSV se arma desde ahí — así que sale scopeado por el mismo camino que todo lo
> demás. **Lo de abajo queda como registro de por qué se decidió así.**

**Qué (registro — ya no es cierto).** El archivado appendeaba los aprobados de la semana a un Google Sheet. `instance_id` **sí**
viaja por el body del webhook y se usa para todo lo demás — pero `sheet_id` y `sheet_tab` son
**constantes del nodo `Config`**. Con **un solo** workflow de archivado sirviendo a todas las
instancias, el día que exista una segunda empresa **sus aprobados se appendean al Sheet de Retia**.

**Evidencia.** Nodo `Append al Sheet Histórico` →
`documentId = {{ $('Config').first().json.sheet_id }}`, y en `Config` ese valor es el literal
`1Ngzjjsw2sMU-y6NienN-YHxro6o8BcOzmszZH9C3Av4` con `sheet_tab = Historico`. Comparalo con la línea de
al lado, `instance_id`, que **sí** es una expresión que lee el body: la parametrización se hizo para
el tenant y se saltó el Sheet. No está anotado en ningún ADR ni en este plan — el único hit de
"sheet" en `docs/` está en `dev-doc.md` y es descriptivo.

**Qué lo destraba.** Había **dos salidas, y no eran la misma decisión** — las dos y por qué ganó la
segunda están en [ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md):

1. **Parametrizarlo.** La regla ya está escrita, y es de
   [ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md): *n8n lee su config por la
   fachada.* `sheet_id`/`sheet_tab` son config por instancia, así que van a `run-plan`
   (`?ambito=archivado`), leyéndose de `app.ajustes` o de una columna de `instances`. Toca
   [`core/contracts/run-plan.md`](../../core/contracts/run-plan.md). Después es un
   `npm run n8n:push -- archivado --nodos "Config"`: son `parameters`, **no** es re-import.
2. **Matarlo** (propuesto por Mani el 04/08). El histórico canónico es `outputs`
   ([ADR-014](../adr/ADR-014-outputs-historico-canonico-archivado.md)) y el cockpit ya lo muestra
   entero en `/curar/historicos` (D6). El Sheet quedó como el afluente descargable de la época de
   Airtable. Barato de sacar (un nodo, una credencial, dos placeholders menos) y **elimina el
   problema en vez de escalarlo** — pero el [onboarding](../onboarding-equipo-redes.md) se lo promete
   al equipo como *"el archivo de lo ya elegido"* y el
   [one-pager](../one-pager-reels-mvp.md) se lo promete al jefe como descargable a Excel. **La
   decisión no es técnica: es si el cockpit reemplaza esas dos promesas.**

**Hecho cuando.** O bien dos instancias archivan la misma semana y cada una escribe en su propio
Sheet (opción 1), o bien el nodo no existe y el equipo obtiene el histórico desde el cockpit
(opción 2). ✅ **Ganó la 2, y se cumplió:** el nodo no existe (archivado = 17 nodos, medido el
06/08) y el histórico sale de `/curar/historicos`.

### 14.5 🟠 Dos cosas menores, anotadas para que no sorprendan

- **Knobs globales entre tenants.** `presupuesto_transcribir_s`, `concurrencia_transcribir`,
  `presupuesto_traducir_s`, `concurrencia_traducir`, `piso_referente`, `cap_descartes` y
  `cap_resultados_referente` viven **solo** en el `Config` del motor y **no están en `AJUSTE_MAP`**,
  así que `app.ajustes` no los pisa por instancia. Para los de concurrencia y presupuesto está bien:
  son del pod de n8n, compartido por definición. `piso_referente` y `cap_descartes` son **producto** y
  deberían ser por instancia.
- **Una sola cuenta de Apify / Supadata / Anthropic para todas las empresas.** El **costo** por
  empresa se puede atribuir sin trabajo nuevo (`runs.costo_estimado` ya cuelga de `instance_id`); el
  **cupo** no. Una empresa le puede quemar la cuota a otra y nada avisa. El techo por instancia sigue
  en §10 como pendiente.

### 14.6 🟠 Las 4 tablas de LinkedIn quedaron sin policy — y el check que lo cazaba corrió sin ellas

**Qué.** La [`020`](../../core/schema/020_pipeline_linkedin.sql) §6 crea `app.referentes_linkedin`,
`voces_linkedin`, `candidatos_linkedin` y `descartes_linkedin` con `enable row level security` y
**cero policies**, apoyada en que la Capa 2 las cubriría: *"estas cuatro tablas nacen del lado
correcto del disparador y NO hay que acordarse de volver"*. La
[`021`](../../core/schema/021_rls_capa_2.sql) **no las nombra ni una vez.**

**Evidencia.** `grep -c linkedin core/schema/021_rls_capa_2.sql` da **1**, y es un comentario sobre
`workflows`. El check #1 de la propia `021` —*"¿queda alguna tabla con tenant, RLS activado y sin
policy?"*— es exactamente el que lo habría cazado, y dio *"cero filas, sin excepciones"* porque
corrió en Docker sobre **`001→018` + `021`**, sin la `020` en el medio. *El agujero no está en la
verificación: está en el corpus sobre el que se corrió.*

**Por qué no es una emergencia.** Falla cerrado por los dos caminos posibles: si la `020` entró antes
que la `021`, el `grant select on all tables in schema app` las alcanzó y con RLS sin policy dan
**cero filas**; si entró después, ni siquiera tienen grant y dan **`42501`**. Y hoy nada las lee: el
mapa `TABLAS` de [`scoped.ts`](../../apps/dashboard/lib/supabase/scoped.ts) no tiene ninguna entrada
`*_linkedin`, así que ninguna pantalla las toca.

**Cuándo muerde.** En la **Fase 5**, el día que exista la primera pantalla de LinkedIn: devolvería
vacío sin error y sin aviso — la familia de la `015` otra vez, y encima disfrazada de *"todavía no
hay datos"*, que es lo que uno espera ver en un pipeline nuevo.

**Qué lo destraba.** ✅ **ESCRITA el 2026-08-06: [`024_rls_linkedin.sql`](../../core/schema/024_rls_linkedin.sql)**
— las 4 policies con el molde de sus hermanas de grano cockpit
(`instance_id in (select app.instancias_visibles())` en `using` y `with check`) más los grants.
Salió junto con la primera pantalla, como decía este párrafo: la de **Referentes** (`curar/referentes`
ramifica por `cockpit.workflowId`), así se verifica con datos reales y no con un `select` a una tabla
vacía. Las 4 tablas entraron además al mapa `TABLAS` de `scoped.ts` — la mitad de Capa 1, que sin
ella la pantalla no compila.

✅ **APLICADA el 2026-08-06 y verificada por su EFECTO** (la lección de la `019`, no por haber
corrido): `pg_policies` devuelve las **4 filas**, las cuatro `policyname = tenant` y las cuatro con
**`instancias_visibles`** en el `qual` — o sea grano instancia, que era el error fácil porque su
hermana de reels es por empresa. Y como en el SQL Editor el script corre como una unidad, que las
policies existan prueba que **todo lo anterior pasó**: las guardas del `§0` y los `grant` del `§1`
(si el grant hubiera fallado, la ejecución se cortaba antes y no habría 4 filas).

✅ **Y el check #1 CONTRA PROD se corrió el 2026-08-06: CERO FILAS.** Era una pregunta distinta de
la `024` —no la valida a ella, valida que no quede **otra** tabla en el mismo estado— y nunca se
había hecho contra la base real: la única vez fue en Docker sobre `001→018`+`021`, sin la `020` en el
medio, y por eso dio limpio con este agujero adentro. Ahora se corrió sobre el corpus completo, con
la `020` y la `024` aplicadas. **No queda ninguna tabla con columna de tenant, RLS activado y cero
policies.**

🔑 **Lo que el check #1 NO puede ver, y hay que decirlo porque el plan asumía que sí.** Pregunta por
*"RLS activado y **cero** policies"*, así que es ciego a la clase de agujero que la `025` de §15.A
existe para tapar, que es *"la policy existe pero es demasiado angosta"*. Medido el 06/08:

| Tabla | RLS | Policies | Columna de tenant | ¿La ve el check #1? |
|---|:-:|---|---|---|
| `app.usuarios` | ✅ | `usuario lee su propia fila` | **ninguna** (la `019` dropeó `client_id`) | **No**, por los dos motivos |
| `app.usuarios_clientes` | ✅ | `usuario lee sus membresias` | `client_id` | **No**: ya tiene policy |

⚠️ **Consecuencia práctica: el check #1 no depende de la `025`, así que B2 no depende de A1.** El
orden que §15.C daba por duro —*"B2 después de A1, o el check reporta las tablas nuevas"*— partía de
que la `025` crea tablas, y **no crea ninguna**: crea una función y policies. Vale correrlo igual
**después** de la `025`, pero como red de seguridad barata, no como precondición.

⚠️ **Y un matiz que cambió desde que se escribió §14.6:** la `021` no cambiaba nada al entrar porque
el BFF leía con `service_role`. **La `024` no tiene esa red** — el flip está en producción desde el
05/08, así que sus policies se evalúan desde el minuto que entran. Hoy no rompe nada porque ninguna
pantalla tocaba esas tablas, pero el orden es **migración primero, pantalla en producción después**.

**Hecho cuando.** El check #1 de la `021` corrido **contra prod con la `020` aplicada** da cero
filas ✅ **(06/08)**, y una pantalla de LinkedIn con una fila sembrada la muestra a quien corresponde
y no a otros ⬜ **(es lo único que falta: la tarea B3; las 4 tablas `*_linkedin` tienen 0 filas
al 06/08, así que la prueba todavía no se puede leer)**.
🔑 El par que prueba las dos mitades ya se puede armar: sembrar un referente en la instancia de
**30X** y mirarlo con la cuenta que alcanza **30X y EstadoX** (existe desde el 05/08). Tiene que
verse en el cockpit de 30X y **no** en el de EstadoX — RLS deja pasar lo propio, `scoped.ts` acota al
cockpit abierto.

---

## 15. El cierre del producto, en dos carriles

> **Qué es esta sección y por qué existe.** §14 listaba pendientes sueltos, cada uno con su forma
> *qué · evidencia · qué lo destraba · hecho cuando*, y todos con la misma nota al pie: *"ninguna
> bloquea a Retia hoy"*. **Eso dejó de ser cierto el 2026-08-06**: tres personas de Retia —empresa
> cliente, no la agencia— empiezan a usar la herramienta. Eso cruza de golpe tres disparadores que
> el repo dejó escritos y nunca ejecutó, y agrega uno que nadie había nombrado.
>
> §15 no reemplaza a §14: la ordena para ejecutarla **con dos agentes en paralelo**, que es la
> restricción nueva. §15.0 son las cuatro preguntas de producto que Mani hizo el 06/08, respondidas
> contra el código. §15.A y §15.B son los dos carriles. **§15.C es el protocolo que hace que no se
> pisen** — dueño único por archivo, no buena voluntad.

**Los tres disparadores que se cruzaron, con su cita:**

1. **[ADR-051](../adr/ADR-051-el-acceso-es-membresia-explicita.md)**, sobre dejar el alta manual:
   *"Disparador para automatizarla: **el primer usuario que no sea de la agencia**."*
2. **[`domain/roles.ts:25-31`](../../apps/dashboard/domain/roles.ts)**, sobre el gate de costos:
   *"Hoy está bien porque todos los operadores son gente de adentro. El día que una persona de una
   empresa cliente reciba `operador`, ese gate le publica el margen de la agencia — y **falla hacia
   MOSTRAR**, así que no va a romperse, va a filtrar."*
3. **§10 de este doc**, sobre el eje *+usuarios*: *"Con 3 empresas × varias personas esto se vuelve
   fricción real. Una pantalla de alta scopeada por tenant es candidata a fase propia."*

---

### 15.0 · Las cuatro preguntas, respondidas contra el código

Se escriben acá porque las respuestas **existían y estaban dispersas** —ADR-023, ADR-050, §14.5 y
tres comentarios de código— y por eso se volvieron a preguntar. Un hecho, un dueño.

#### ¿Cada empresa corre en simultáneo, o hay una sola corrida global?

**En simultáneo, por instancia.** El guard single-flight del motor filtra por
`instance_id=eq.<instancia>` —[ADR-050](../adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md) §3.3
lo convirtió de global a por-instancia— y el dispatcher dispara N ejecuciones en paralelo, una por
cockpit. Retia, EstadoX y 30X no se bloquean entre sí.

**Lo que sí es compartido, y nadie midió:**
- El pod de n8n. Es el disparador de la fase 2 de ADR-005 (VPS), que sigue escrito como *"medido, no
  anticipado"*.
- Las cuentas de Apify / Supadata / Anthropic: el **costo** se atribuye por instancia
  (`runs.metricas × app.tarifas`), el **cupo no**. Una empresa le puede quemar la cuota a otra sin
  que nada avise (§14.5).
- `concurrencia_transcribir` y los presupuestos viven en el `Config` del motor, fuera de
  `AJUSTE_MAP` ⇒ son del pod, no de la empresa. Tres corridas en paralelo multiplican por tres las
  llamadas en vuelo a Supadata.

**Nada que hacer hoy.** Queda como el disparador de ADR-005 fase 2, sin ejecutar y sin medir.

#### ¿Transcribir detecta lo ya transcrito? ¿Dos usuarios a la vez?

**Sí, y lo dice en pantalla.** `app.transcripciones` tiene `unique (instance_id, plataforma,
external_id)` desde la `016`, y `encolarEnlaces` upsertea con `ignoreDuplicates` devolviendo
*"N ya estaban (no se vuelven a pagar)"*. El motor usa la memoria hermana (`processed_items`),
fail-closed (ADR-029).

Dos matices que son decisión, no bug:
- **El dedup es por instancia a propósito.** Si Retia transcribió un video, EstadoX lo paga de nuevo.
  El unique global murió en la `017` porque le vaciaba el supply a la segunda empresa (`016:301`).
  Correcto para el motor; para el transcriptor a pedido significa pagar dos veces la misma URL.
- **Dos personas de la misma empresa procesando a la vez pueden agarrar el mismo enlace.** Está
  decidido y escrito en [`transcribir/actions.ts:81`](../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/transcribir/actions.ts):
  *"no vale un estado 'procesando' para eso: los writes ya son idempotentes"*. ~USD 0,014 por
  colisión. Con 3 personas pasa de hipotético a probable, y **sigue siendo más barato que el claim
  atómico**. Se deja y se mide; si molesta, el fix es un `update … where estado = 'pendiente'
  returning`.

#### Si alguien de Retia ejecuta, ¿al otro le sale?

**Solo si carga o navega la pantalla.** Dos agujeros, los dos reales:
- El polling de 5 s (`operar/auto-refresh.tsx`) se monta con `activo={corridaViva}`, o sea **solo si
  ya había corrida viva al renderizar**. Quien tenía Operar abierta antes de que otro dispare no se
  entera nunca.
- **`correrAhora()` no re-chequea del lado del servidor**, a diferencia de su gemela `buscarAhora()`
  que sí llama `hayBusquedaViva(ctx)` sesenta líneas más abajo **en el mismo archivo**. El botón
  deshabilitado es cosmético, y el mensaje de vuelta dice *"Señal enviada… aparece abajo como
  Corriendo"* incluso cuando el guard de n8n la bloqueó.

→ Es la tarea **A7**. No cierra la race de 1-2 s de ADR-023 C.3.3 (aceptada y argumentada): cierra el
agujero de UX que la vuelve visible tres veces por semana.

#### ¿Se puede invitar gente desde el cockpit?

**No existe la pantalla.** El alta son 3 pasos manuales con el modo de falla mudo que ADR-051 nombró:
una membresía con la empresa equivocada mete a alguien en el cockpit de otro cliente **sin un solo
error**. Construirla necesita tres cosas que faltan, y la primera está escrita como deuda en la
propia `021` (línea 216): *"una pantalla de accesos —quiénes entran a mi empresa— necesitaría una
policy nueva; no existe todavía, así que no se escribe"*.

→ Es el carril **A** entero.

---

### 🔴 15.0.bis · Carril 0 — lo que va ANTES de que entren

*Bloquea el live, no bloquea el código. Lo hace Mani a mano, son 10 minutos.*

No hay que esperar la pantalla para dar de alta a Retia. **Pero hay que decidir el rol primero,
porque el gate de costos muerde exactamente acá:**

| Rol | Qué ve | Consecuencia |
|---|---|---|
| `operador` | Las 4 zonas, **incluidos los costos de proveedor** en Entender | Les publica el margen de la agencia |
| `sponsor` | Solo Entender, sin costos | No pueden calificar ni operar: inservible para su trabajo |

Ninguna de las dos sirve, y el arreglo ya está escrito en `domain/roles.ts:31`: **cambiar `veCostos`
de `rol !== "sponsor"` a `rol === "dev"`** en [`entender/page.tsx:41`](../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/entender/page.tsx).
Es lo que ADR-052 dejó escrito y descartó por innecesario; ahora es necesario. Una línea y su test.

1. Cambiar el gate a `rol === "dev"` + test. Deploy.
2. Alta de las 3 personas por los 3 pasos de ADR-051, rol `operador`, `client_id = 'retia'`.
3. Correr la query de verificación que la `018` dejó escrita (`018:125-130`) y **leerla fila por
   fila**, no contarla.

---

### 15.A · Carril A — Accesos y concurrencia visible

**Rama `carril-a-accesos`.** Superficie nueva del cockpit: **no toca n8n ni el motor.**

| # | Qué | Archivos |
|---|---|---|
| **A1** | La migración `025_accesos.sql` | `core/schema/025_accesos.sql` |
| **A2** | El landmine de `scoped.ts` | `lib/supabase/scoped.ts` |
| **A3** | `domain/permisos.ts` + tests | `domain/permisos.ts(.test.ts)` |
| **A4** | La zona `ajustes` (5ª) | `domain/roles.ts`, `domain/pipelines.ts`, `(zonas)/ajustes/**` |
| **A5** | La pantalla de equipo y el alta | `lib/equipo.ts`, `ajustes/equipo/**` |
| **A6** | ADR-060 | ✅ **ESCRITA** — [ADR-060](../adr/ADR-060-el-equipo-se-administra-desde-el-cockpit.md) |
| **A7** | Concurrencia visible | `operar/actions.ts`, `operar/auto-refresh.tsx` |

> ✅ **Carril 0 cerrado del lado del código el 06/08** (`d89ef04`): el gate de costos es
> `veCostos(rol)` en `domain/roles.ts`, con dos tests, y `entender/page.tsx` lo importa. Falta el
> deploy y la verificación de §15.D, que son de Mani.
>
> 🔴 **Y el arreglo destapó que el gate era SOLO de UI:** la [`021:280`](../../core/schema/021_rls_capa_2.sql)
> le da `app.tarifas` a cualquiera logueado (`using (true)`) y `v_costos_semana` es
> `security_invoker`, así que un `operador` que consulte PostgREST con su propia sesión llega al
> margen igual. **Lo cierra la `025`** (A1) y la decisión está en ADR-060 §5. Medido: n8n nunca lee
> `tarifas`, así que no rompe nada.

#### A1 · `core/schema/025_accesos.sql` — ✍️ **ESCRITA y PROBADA · ⬜ FALTA APLICARLA**

> **Estado al 06/08:** el archivo está en [`core/schema/025_accesos.sql`](../../core/schema/025_accesos.sql)
> y se probó entero contra un **Postgres 16.13 real**, con un fixture que reproduce la forma exacta
> de prod (8 usuarios / 2 dueños / 9 membresías / 7 en `retia` con 2 de dueño). **Nadie la aplicó a
> prod todavía** — eso es el SQL Editor, y es de Mani. La tabla de resultados medidos está al pie
> del propio archivo, para comparar contra lo que dé prod.
>
> 🩸 **La medición cambió una policy.** Los 2 dueños **tienen membresía en `retia` con rol `dev`**
> (la dejó el backfill de la `018`, que corrió antes de que `es_dueno` existiera). Con la policy
> obvia —*"las membresías de mis empresas"*— un `sponsor` de Retia veía **dos filas fantasma con
> `rol = dev`**: sin nombre ni mail, pero delatando a la agencia en una superficie que lista
> personas, que es justo lo que ADR-051 §3 prohíbe. Por eso la exclusión de dueños va en **las dos**
> policies. Es un bug que ninguna pantalla habría delatado.
>
> ➕ **Una función más de la previsto, y por qué:** `app.emails_visibles()`. `app.usuarios` **no tiene
> el mail** (sus columnas son `id, nombre, creado_en, es_dueno`): vive en `auth.users`, a la que
> nunca se le da `select` a `authenticated`. Copiar el mail a una columna sería el error que
> ADR-041 ya decidió no cometer, así que se lee por función `security definer`, filtrada por
> `usuarios_visibles()`. **A5 lo necesita** — la lista promete nombre, mail, rol y desde cuándo.

Las policies que la `021` dejó explícitamente sin escribir. Mismo molde que su §1, que es el estándar
de Supabase y no un atajo:

- **`app.usuarios_visibles()`** — `security definer` + `stable` + `set search_path`. Devuelve los
  `usuario_id` que comparten empresa con la sesión, **excluyendo `es_dueno`**. La exclusión va en la
  policy y no en un `.filter()` de React porque ADR-051 §3 la puso como propiedad del sistema: *"la
  agencia queda FUERA de toda superficie que liste personas"*.
  El `security definer` es lo que evita la recursión: una policy sobre `app.usuarios_clientes` que
  seleccione `app.usuarios_clientes` necesitaría una policy para su policy (`021:77`).
- **`policy select` en `app.usuarios`** para esos ids. **Se suma** a la de la `007` (las policies se
  OR-ean), así que un dueño sigue leyendo su propia fila.
- **`policy select` en `app.usuarios_clientes`** con `client_id in (select app.clientes_visibles())`,
  ampliando la de `021:307` que solo deja ver las membresías propias.
- **Sin grants de escritura.** La `021` §2 dejó `usuarios` y `usuarios_clientes` fuera de los
  `grant insert/update/delete` a propósito, y se mantiene: el alta escribe con `service_role` desde
  la Server Action porque **`auth.admin.inviteUserByEmail` no existe con la clave anon**.
- **`policy select` en `app.tarifas`, reemplazando el `using (true)` de la `021:280`** por *"solo
  `dev` en alguna membresía, o dueño"*. **Se suma el 06/08** (ADR-060 §5): sin esto el gate de
  costos del Carril 0 es solo de UI. No rompe nada — n8n nunca lee `tarifas` (medido) y la fachada
  bypassa.
- Gate humano, verificado **por efecto** y no por *"corrió sin error"* — la lección de la `019`
  (§14.1).

⚠️ **Orden que no se puede invertir: la `025` va a prod ANTES que la pantalla.** El flip de la Capa 2
está vivo desde el 05/08, así que una pantalla sin policy devuelve cero filas o `42501`. Es la misma
nota que abre la `024`.

#### A2 · El landmine de `scoped.ts` — ✅ **HECHO el 06/08**

> La entrada de `app.usuarios` **se sacó, no se corrigió**: una persona no pertenece a una empresa,
> pertenece a una membresía (ADR-051), así que la tabla no tiene ni puede tener columna de tenant.
> `scoped().select("app.usuarios")` ahora **no compila**. Entró `app.usuarios_clientes` con grano
> `"cliente"`.
>
> 🔎 **Y apareció una contradicción que había que resolver, no ignorar:** `lib/tenant.ts` decía que
> `usuarios_clientes` **no** está en el mapa *"porque scopear la tabla con la que se decide el scope
> sería circular"*. Las dos cosas son ciertas — la tabla contesta dos preguntas: como **registro**
> (*"¿qué empresas alcanzo?"*) va con admin y sin scopear; como **dato** (*"¿quiénes entran a esta
> empresa?"*) va scopeada y con la sesión. Quedó escrito en los dos archivos, porque el que lea uno
> solo va a pensar que el otro está mal.

[`scoped.ts:51`](../../apps/dashboard/lib/supabase/scoped.ts) declara
`"app.usuarios": { grano: "cliente" }` ⇒ filtraría por `client_id`, **columna que la `019` dropeó**
(`019:59`). Hoy nadie lo ejerce porque `lib/auth.ts` lee esa tabla con `createClient()` directo. **La
pantalla de equipo sería la primera en tocarlo**, y el síntoma sería un error de PostgREST sobre una
columna inexistente.

Fix: **`app.usuarios_clientes` entra al mapa con grano `"cliente"`** —tiene la columna y filtra exacto
al cockpit abierto— y la entrada mentirosa de `app.usuarios` se corrige. El equipo se lee por
`usuarios_clientes` con embedding a `usuarios`: la Capa 1 sigue siendo el `.eq("client_id")` de
siempre y la Capa 2 filtra el embed.

#### A3 · `domain/permisos.ts` — ✅ **HECHO el 06/08** (8 tests)

> Un ajuste sobre lo escrito abajo: el corte de `dev` es **`esDueno`**, no `rol === "dev"`. O sea
> que un `dev` que no sea de la agencia —hoy no existe, mañana puede— **tampoco acuña devs**: el
> techo no se hereda otorgándoselo a otro. Es una línea y cierra el caso antes de que exista.

Dominio puro, misma disciplina que `roles.ts` y `tenant.ts`: sin IO, `.test.ts` al lado, corre en
Node sin build.

- `puedeAdministrarEquipo(rol)` → `dev | sponsor`.
- `rolesQuePuedeOtorgar(rol, esDueno)` → la agencia otorga los 3; el `sponsor` otorga
  `operador | sponsor`, **nunca `dev`**, porque ese rol ve el costo del proveedor.

**La regla es *nadie otorga un rol que no tiene*, y vive en una función testeable** — no en un `if`
de React ni en las opciones de un `<select>`.

#### A4 · La zona `ajustes`

> ⚠️ **CORREGIDO el 06/08 al escribir ADR-060, y por un número medido contra prod.** Este bloque
> decía *"`ajustes` para `dev` y `sponsor`, **no** para `operador`"*. Pero de los **18 knobs** de
> `app.ajustes`, **8 son de visibilidad `equipo`** (mínimo de likes, mínimo de vistas, propuestas
> por corrida, los 4 toggles de IG/TikTok, afinidad mínima). Mudarlos a una zona que el `operador`
> no ve **le saca a Majo y a Jero ocho perillas que usan**, sin error y sin aviso. Lo que se gatea
> **no es la zona: son sus pantallas.** El detalle y el porqué, en [ADR-060](../adr/ADR-060-el-equipo-se-administra-desde-el-cockpit.md) §1.

- `domain/roles.ts`: `ZONAS` y `ZONAS_POR_ROL` ganan `"ajustes"` para **los tres roles**. Va
  **última** en el array de cada uno: el archivo avisa en la línea 22 que *"el orden de este array
  es prioridad"* y `zonaInicial` devuelve el primero. Para el `sponsor`, `entender` sigue siendo la
  primera.
- `domain/pipelines.ts`: `ZONAS_POR_PIPELINE` la suma a los **dos** pipelines (el equipo es de la
  empresa: existe con o sin pipeline). `PANTALLAS_CURAR` **pierde** `"ajustes"`.
  Y nace **`PANTALLAS_AJUSTES`** con su tabla por pipeline, mismo molde que `PANTALLAS_CURAR`:
  reels declara `motor` + `equipo`, **LinkedIn solo `equipo`** — `app.ajustes` está vacía para su
  instancia, así que `motor` cargaría limpia con cero perillas. La familia de la `015` otra vez.
- El gate de `equipo` es `puedeAdministrarEquipo(rol)` (A3), en la guardia del servidor. `motor`
  la alcanzan los tres, con el filtro por knob que **ya existe** (`ajustesVisibles`).
- `(zonas)/ajustes/page.tsx` — índice con tarjetas **derivadas** del dominio, igual que
  `curar/page.tsx`: la lista que se dibuja y la que consulta la guardia tienen que ser una sola.
- `(zonas)/ajustes/motor/` — los knobs, movidos tal cual desde `curar/ajustes/`.
- `curar/ajustes` → `redirect` a `ajustes/motor`. El equipo tiene bookmarks y el 404 de la Fase 3 ya
  cobró ese precio una vez (cierre 89).

🔑 **El compilador lleva la mano:** `COPY` en `curar/page.tsx` es un `Record<PantallaCurar, …>`
exhaustivo, así que sacar `ajustes` de `PANTALLAS_CURAR` **no compila** hasta borrar su copy.

#### A5 · `lib/equipo.ts` + `ajustes/equipo/` — ✅ **CONSTRUIDA el 06/08 · ⬜ falta el clic**

> **Dos cosas que se decidieron construyendo, y no estaban en el plan:**
>
> 1. **El alta pide `nombre` además de mail y rol.** `invitar(email, rol)` no alcanza:
>    `app.usuarios.nombre` es `not null`, y derivarlo del mail deja *"jperez"* como nombre en la
>    lista del cliente. Tres campos.
> 2. **El mail se lee por RPC y se cruza en TS**, porque los dos lados tienen grano distinto:
>    `emails_visibles()` devuelve a toda la gente con la que compartís *alguna* empresa (RLS no sabe
>    qué cockpit hay abierto) y la lista scopeada es la de *esta*. Manda la scopeada.
>
> ✅ **Verificado contra prod lo que se podía sin una sesión ajena:** el embed
> `usuarios_clientes?select=…,usuarios(nombre)` resuelve (7 filas en `retia` con `service_role`,
> **incluidas las 2 de los dueños** — que es justo lo que la `025` tiene que esconderle a una
> sesión: tienen que ser **5**).
>
> 🐛 **Y un bug que solo aparece corriendo el código:** `z.email().trim()` valida **antes** de
> limpiar, así que un mail pegado con un espacio al final —copiarlo de un chat— se rechazaba como
> inválido. Va `z.string().trim().toLowerCase().pipe(z.email(...))`. El typecheck no lo veía.

- **Lectura** por `(await scoped(ctx))` con sesión ⇒ las policies de A1 se evalúan de verdad. Lista:
  nombre, mail, rol, desde cuándo. Sin dueños, y eso lo hace la policy.
- **`invitar(email, rol)`**: `exigirTenant("ajustes")` → `puedeAdministrarEquipo` →
  `rolesQuePuedeOtorgar` → `createAdminClient().auth.admin.inviteUserByEmail` →
  `insert app.usuarios` → `insert app.usuarios_clientes` → `registrarEvento`. **Los 3 pasos manuales
  de ADR-051, en un acto.**
- 🔑 **El modo de falla mudo desaparece por construcción:** la empresa no se elige en un formulario,
  sale de `ctx.clientId` — el cockpit abierto. No hay dónde equivocarse.
- **El caso que ya existe en prod es el de la persona con dos membresías.** Si el mail ya está en
  `auth.users`, `inviteUserByEmail` falla y hay que sumar solo la membresía. Es el camino normal, no
  el borde.
- Quitar acceso y cambiar rol: mismo gate, mismo techo de roles. Zod en todo input, `revalidatePath`
  después de cada mutación.

#### A6 · ADR-060 — ✅ **ESCRITA el 06/08, antes de construir**

[**ADR-060 — El equipo se administra desde el cockpit, y la autoridad se parte en dos**](../adr/ADR-060-el-equipo-se-administra-desde-el-cockpit.md).
Se escribió antes, y esto no es ceremonia: es la lección del cierre 96, donde el mismo flip se hizo
**dos veces el mismo día** por dos sesiones que no se vieron.

**Y ya se cobró sola:** escribirla obligó a mirar los knobs por visibilidad, y ahí apareció el 8-de-18
que corrige A4. Construir primero habría dejado a dos personas sin sus perillas.

Cubre las tres decisiones previstas —la 5ª zona, el techo de roles, y por qué la lectura va por RLS
pero la escritura por `service_role`— más una cuarta que apareció en el Carril 0: **`app.tarifas`
estaba abierta a todo usuario logueado**, así que el gate de costos era solo de UI. Enmienda
ADR-051, ADR-052 y ADR-056.

#### A7 · Concurrencia visible

- `correrAhora()` gana el chequeo server-side **que su gemela ya tiene en el mismo archivo**. Reusa
  `hayCorridaViva` de `domain/corrida.ts` y `ultimasCorridasMotor` de `lib/runs.ts`, que ya existen y
  que ya usa `operar/page.tsx`. El mensaje deja de mentir.
- `auto-refresh.tsx` se monta **siempre** en Operar, con dos cadencias: 5 s con corrida viva, 30 s
  sin ella.

---

### 15.B · Carril B — Cerrar reels

**Rama `carril-b-cierres`.** SQL contra prod, verificación y docs: **no toca `apps/dashboard/`.**

*Por qué este carril y no la Fase 5: LinkedIn sigue bloqueado por lo **no técnico** (cierre 92) — no
hay definición de "funcionó", no existe el banco de referentes y faltan los few-shot. Construir sus
pantallas ahora es superficie para datos que no existen.*

| # | Qué | Estado |
|---|---|---|
| **B1** | El gate de la `023` | ⏳ espera corridas del fin de semana |
| **B2** | Check #1 de la `021` contra PROD | ✅ **CERO FILAS el 06/08** — y no dependía de A1 |
| **B3** | La prueba de §14.6 con filas | ⬜ escrita paso a paso en el handoff |
| **B4** | `docs/runbooks/` + `core/templates/` | ✅ **ESCRITO el 06/08.** F5 da **partido**: empresa 🟢 pasa · pipeline 🔴 no. El paso de alta se verifica cuando A5 esté en prod |
| **B5** | Las verificaciones de ojo humano | ✅ **HECHO el 06/08** — [`docs/verificaciones-humanas.md`](../verificaciones-humanas.md), 10 items. Y 4 de los 9 números esperados estaban mal |
| **B6** | Deuda de docs medida | ✅ **HECHO el 06/08** — 21 links rotos, no 4; y la lista era más larga |

**B1 — el único bloqueante numerado del repo.** Depende del calendario, no del trabajo: archivado
domingo 18:00, motor lunes 08:00. Con las dos corridas verdes,
`node Workflows/workflow-short-form-content/verificar-corrida.mjs 2` tiene que decir
**`intersección: 0`** contando por `run_id`. Si cae a la ventana de `primera_vez`, la memoria no se
escribió y hay que mirar por qué **antes de dropear nada**: el modo de falla está medido — `PGRST204`
que los `onError: continue` se tragan ⇒ motor en verde **sin memoria de dedup**.

**B2 — ✅ HECHO el 2026-08-06: el check #1 contra prod da CERO FILAS.** El SQL está al pie de la
[`024`](../../core/schema/024_rls_linkedin.sql); se corrió sobre el corpus completo, con la `020` y la
`024` aplicadas, que es lo que la corrida vieja en Docker no tenía. No queda **ninguna** tabla con
columna de tenant, RLS activado y cero policies.

⚠️ **Y la precondición que este plan le ponía era falsa: B2 no dependía de A1.** El argumento era
*"o el check reporta las tablas nuevas"*, y la `025` **no crea tablas** — crea una función y policies.
Peor: el check es **estructuralmente ciego** al agujero que la `025` tapa. Pregunta por *"RLS y **cero**
policies"*, y las dos tablas de accesos ya tienen policy (`app.usuarios` una del `007`,
`app.usuarios_clientes` una de la `021`); encima `app.usuarios` **no tiene columna de tenant** desde que
la `019` dropeó `client_id`. La `025` arregla *"la policy es demasiado angosta"*, que es otra pregunta.
**La tabla con la medición está en §14.6.** Correrlo otra vez después de la `025` sigue valiendo, como
red barata; como puerta, no.

**B3 — §14.6 con filas.** Escrita paso a paso en el handoff, con los dos `instance_id`, la cuenta de
doble membresía y la matriz de interpretación (**1 y 1** anda · **2 y 2** Capa 1 rota · **0 y 0**
policy que no matchea o grant que falta · **`42501`** falta un grant). No sirve con una cuenta
`es_dueno`. Termina con un alta desde el botón: lo único que ejercita los `grant insert/update/delete`.

**B4 — ✅ ESCRITO el 2026-08-06, y el criterio de F5 dio partido.** Están
[`agregar-cliente.md`](../runbooks/agregar-cliente.md), [`agregar-workflow.md`](../runbooks/agregar-workflow.md)
y [`core/templates/`](../../core/templates/) (el `cliente-nuevo.sql`, el esqueleto de manifest y su
checklist). El criterio era la auditoría honesta del refactor entero: *"si algún paso de la guía exige
modificar el núcleo, el diseño no está listo"*.

| | Veredicto | Medido contra |
|---|---|---|
| **Agregar una empresa** | 🟢 **PASA.** SQL de datos + clics en el cockpit. **Cero código, cero n8n, cero migraciones** | El `cliente-nuevo.sql` se corrió **contra prod en una transacción revertida**: dejó 1 empresa, 1 cockpit en `draft` y **18 perillas, las 18 con su descripción**. Prod quedó en 3 clientes / 4 instancias, sin fugas |
| **Agregar un pipeline** | 🔴 **NO PASA** | LinkedIn, los dos commits reales: `0bc0678` (+1.082) y `b7249f5` (+1.427). **~2.500 líneas, 2 migraciones en `core/schema/`, 2 ADRs y ~15 archivos de `apps/dashboard/`** — para un pipeline que todavía no corre en n8n |

🔑 **Y el contraste tiene una explicación, no es azar: una empresa es un parámetro; un pipeline es un
dominio.** El eje *+empresas* se templatizó y salió barato (el motor es un workflow parametrizado y el
dispatcher lo multiplica, ADR-050). El eje *+pipelines* nunca se templatizó **porque cada pipeline
tiene entidades propias** (§2.D). Lo que sí se pudo templatizar, y es donde se pierde el tiempo de
verdad, es **el checklist de lo que no hay que olvidarse**: los agujeros que costaron sesiones enteras
(una tabla con RLS y sin policy, un placeholder que `onError: continue` se traga, un cron local en vez
del dispatcher) son todos **de olvido**, no de diseño.

📌 **Lo que haría falta para que el segundo también pase**, escrito en el runbook y **sin proponerlo
acá porque es un ADR**: que una pantalla de curación sea **configuración y no código** — un descriptor
por pipeline que rinda la tabla, el formulario y la entrada de `scoped.ts` desde un solo lugar (hoy se
escriben tres veces por pantalla). **Es un proyecto, no un refactor**, y se decide con dos pipelines
reales encima, no con uno.

🔗 **La dependencia con el Carril A quedó marcada, no resuelta:** el paso *"dar de alta a las
personas"* está escrito **asumiendo la pantalla de A5** (`ajustes/equipo`), con un bloque
`🚧 VERIFICAR CUANDO A5 ESTÉ EN PROD` que dice qué hacer mientras tanto (los 3 pasos manuales de
ADR-051). **Cuando A5 entre hay que dar un alta real por la pantalla y corregir lo que no coincida** —
que es exactamente lo que F5 pide de una guía.

**B5 — ✅ HECHO el 2026-08-06: [`docs/verificaciones-humanas.md`](../verificaciones-humanas.md).**
Los 10 items con quién los hace, cuánto tarda y **qué significa si falla** — los arrastres del handoff
(el clic al CSV, el feed paginado, el tab Entender de un operador), el gate de costos del Carril 0, y
del ROADMAP **V2 · V4 · V5 · V6 · D3**. Los ejecutan Mani y el equipo; el carril solo los dejó escritos.

🩸 **Y escribirlo destapó lo que lo hacía peligroso: la tabla de números esperados tenía 4 de 9 filas
mal**, todas hacia el mismo lado —pedían el `count(*)` crudo de la tabla donde la pantalla filtra.
`/curar/historicos` decía 88 y son **31** (filtra `aprobado`; los 88 son 31 aprobados + 57 descartados)
· `/operar` decía 41 y son **5** tarjetas (`limite = 5` sobre los runs del motor) · `/curar/sugeridos`
decía 8 y son **6** (solo `propuesto`) · `/curar/ajustes` decía 18 y son **18 para un `dev`, 8 para un
`operador`**. **Esa tabla existe justamente para distinguir "se ve bien" de una policy que no
matchea**, y con esos números habría reportado un fallo de RLS inexistente en casi la mitad de las
pantallas.

🔑 **Y la trampa inversa, que casi se cuela en la corrección misma:** `app.voces` tiene 4 filas en la
base y `/retia/reels/curar/voces` muestra **3** — la fila que falta es de 30X, porque `voces` es de
**grano empresa**. Con el doble grano de §2.B, **un `count(*)` global no confirma ni desmiente nada**:
la query de verificación tiene que scopear por el mismo eje que scopea la pantalla. Los números buenos
se midieron así, cockpit por cockpit.

**Dos que quedaron fuera del checklist a propósito, porque no son de mirar:**
- **V6 no se puede correr como está escrita.** Pedía romper la credencial de Supabase *"para que el
  workflow IGUAL escriba a Airtable"*, y post-D7 la **entrega también es Supabase**: romperla tumba
  las dos mitades, así que ya no separa registro de ejecución. El invariante #1 de PLAN §2.5 sigue
  vivo; lo que hay que rediseñar es cómo se ejercita. Es una decisión de Mani, no una verificación.
- **V5 no va antes del gate de la `023`** (B1). Si `processed_items` deja de escribirse, el
  `PGRST204` se lo traga el `onError: continue` y el motor cierra en verde **sin memoria de dedup** —
  que es exactamente lo que V5 cree estar midiendo.

**B6 — ✅ HECHO el 2026-08-06.** Lo que decía falso, corregido **contra la base y contra el live**, no
de memoria: conteos por PostgREST, `pg_policies` por SQL y los 5 `workflow.json` traídos por la API de
n8n. Las cinco de la lista original estaban bien vistas; **dos se quedaron cortas y aparecieron tres
que nadie había nombrado.**

| Lo que decía el plan | Lo que se midió |
|---|---|
| ROADMAP §3 (M0/A/B sin marcar) | ✅ Marcado con el número que lo prueba en cada item. **Lo que sigue abierto es V2, V4, V5, V6, D2 y D3** — y **V4 y V6 tenían el enunciado podrido**: V4 pedía "la vista 🔥 Seleccionados", que era de Airtable; V6 pide romper Supabase para que "IGUAL escriba a Airtable", y hoy la entrega **también** es Supabase |
| §12 fila 9 (la `024` sin aplicar) | ✅ Corregido. **Aplicada**, re-verificada por efecto: 4 policies, todas con `instancias_visibles` |
| §14.4 (el Sheet) | ✅ Cerrada entera. Medido: archivado = **17 nodos**, **cero nodos y cero credenciales de Google** en los 5 |
| plan-cockpit §8 (2 decisiones abiertas) | ✅ Las dos cerradas, con su ADR y su medición |
| "4 links rotos entre ADRs y migraciones" | 🩸 **Eran 21**, y casi ninguno entre ADRs y migraciones: **10** apuntaban al borrado `core/contracts/airtable-cockpit.md`, 3 a la ruta pre-Fase-3 `app/(zonas)/`, 3 a `./ROADMAP.md`/`./PLAN.md` **desde el encabezado del propio handoff**, 3 a archivos borrados en la purga, y 2 eran nombres de archivo equivocados (`020_linkedin.sql`, `ADR-026-cockpit-propio-en-next.md`). Todos arreglados; quedan 0 |

**Las tres que no estaban en la lista:**

1. 🩸 **Los manifests mentían.** Los **4** `workflow.yaml` de los pipelines vivos decían `status: draft`
   con comentarios ya falsos —*"cron sin activar"*, *"sin importar aún en la instancia n8n"*— mientras
   corrían en producción hacía meses. Es la mitad de **D2** del ROADMAP, que nadie había marcado.
   Corregidos a `active` contra lo medido; `npm run validate` verde (2062 checks).
2. 🩸 **"las 17 policies de la `021`" son 19.** `grep -c "create policy"` sobre la migración da 19, y la
   cuenta cierra exacta contra prod: 19 (`021`) + 4 (`024`) + 1 (`007`) = **24 policies** medidas
   (18 en `app` + 6 en `public`). El 17 venía repetido en 5 lugares desde una sesión que lo contó mal.
3. ☠️ **ADR-008 no decía que estaba superada.** Su asunto —*"Airtable es el cockpit del equipo"*— murió
   entero, y el índice de ADRs la sigue listando como "Aceptada" sin marca. Se le puso el encabezado de
   superación (ADR-025/026/027/035). *El problema general —el índice de `docs/adr/` no distingue vigente
   de superada— queda anotado, no barrido: son 59 ADRs y es otra tarea.*

📏 **Y de yapa, medido de paso** (la foto de prod al 2026-08-06, que es lo que un agente nuevo necesita
y ningún doc tenía junto): **23 de 24 migraciones aplicadas** (falta solo la `023`, verificada por sus
7 columnas todavía vivas) · 3 clientes · 4 instancias · 8 usuarios / **9 membresías** · 4 voces (3
activas) · 6 proyectos · 16 referentes · 165 candidatos · 88 outputs · 38 descartes · 772
`processed_items` · **41 corridas, 29 `ok` y 12 `fallo`**, la última el **2026-08-04 21:12** — que es
la medición que confirma que **B1 sigue bloqueado**: ninguna corrida ejerció todavía el código nuevo.

---

### 15.C · El protocolo de paralelo

**Lo que hace que dos agentes no se pisen es dueño único por archivo, no buena voluntad.**

Ramas desde `main`: **`carril-a-accesos`** y **`carril-b-cierres`**. Merge con **rebase** (el repo va
directo a `main`, commits en español y concisos).

| Zona del repo | A | B |
|---|:-:|:-:|
| `(zonas)/ajustes/**` · `(zonas)/operar/**` · `(zonas)/curar/ajustes/**` | ✍️ | — |
| `(zonas)/entender/page.tsx` (Carril 0) | ✍️ | — |
| `domain/roles.ts` · `domain/permisos.ts` · `lib/equipo.ts` · `lib/supabase/scoped.ts` | ✍️ | — |
| **`domain/pipelines.ts`** | ✍️ | 🚫 |
| `core/schema/025_accesos.sql` | ✍️ | — |
| `core/schema/023_poda_write_only.sql` (firmar el gate) | — | ✍️ |
| `Workflows/**` | — | ✍️ |
| `docs/runbooks/**` · `core/templates/**` | — | ✍️ |
| `docs/adr/ADR-060-*.md` | ✍️ | — |
| `ROADMAP.md` · `plan-cockpit-propio.md` | — | ✍️ |
| **este doc** | §15.A | §15.0 · §15.B · §12 · §14 |
| `docs/agents/handoff.md` | bloque propio | bloque propio |

**`domain/pipelines.ts` es el único archivo que los dos querrían tocar** — A le agrega la zona
`ajustes`, y B lo tocaría si siguiera a LinkedIn. Con el carril B en *cerrar reels*, **B no lo toca**.
Queda escrito para que no haya que acordarse.

**Las cuatro reglas duras:**

1. **Números de migración:** A se reserva la **`025`**. B no crea ninguna: solo aplica la `023`, que
   ya existe. Si B necesitara una, es la `026` y avisa antes.
2. **Docs compartidos:** cada carril escribe **solo su sub-bloque**, con encabezado propio. Como no
   se solapan, git resuelve casi todo; el segundo en mergear rebasea.
3. **Orden que no se puede invertir:** Carril 0 antes de las altas · **A1 antes que A5 en prod** ·
   **B2 después de A1** · **B4 después de A5**.
4. **Antes de mergear**, el loop entero del carril:
   `cd apps/dashboard && npm run typecheck && npm test && npm run build` ·
   `cd core/scripts && npm run validate` · y `npm run n8n:diff` si tocó `Workflows/`.

---

### 15.D · Hecho cuando

- **Carril 0:** una cuenta `operador` entra a `/retia/reels/entender` y **no** ve la tarjeta de
  costos; una `dev` sí. Las 3 personas de Retia entran solas.
- **A1:** `pg_policies` muestra las policies nuevas, y el mismo `count(*)` sobre
  `app.usuarios_clientes` da distinto con una cuenta de Retia que con una ajena. **Medido por
  efecto**, no por haber corrido.
- **A5:** un mail de prueba invitado desde `/retia/reels/ajustes/equipo` recibe el magic link, entra,
  cae en el cockpit de Retia, **aparece en la lista de Retia y no en la de 30X**, y un `sponsor` no
  logra otorgar `dev` ni forzando el request (lo rechaza la Server Action, no el `<select>`).
- **A7:** dos ventanas en Operar; la segunda se entera sola en ≤30 s, y un segundo click devuelve
  *"Ya hay una corrida corriendo"* y no *"Señal enviada"*.
- **B1:** `verificar-corrida.mjs 2` da `intersección: 0` por `run_id`, y recién ahí se firma el `§0`.
- **B2 / B3:** el check #1 da **cero filas**; la prueba de §14.6 da **1 y 1**.
- **B4:** se da de alta un cliente nuevo siguiendo `agregar-cliente.md` **sin leer nada más**. Si
  algún paso obliga a tocar `core/`, la guía no está lista y el diseño tampoco.
