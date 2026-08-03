# Plan del refactor multi-tenant + multi-pipeline

> **Qué es este documento.** El plan fundamentado para llevar el cockpit propio de **producto individual** a **producto repartido**: varios pipelines (hoy reels, mañana LinkedIn) y varias empresas (30X, EstadoX, Retia), cada una con su cockpit aislado.
>
> Es el hermano de [plan-cockpit-propio.md](./plan-cockpit-propio.md): aquel llevó la config de Airtable a Postgres; este lleva el producto de uno a N. **Se escribió antes de una sola línea de código, a pedido explícito, para no improvisar el refactor.**
>
> **Cómo leerlo.** §1 es el diagnóstico con evidencia (leelo aunque conozcas el repo — hay cuatro cosas que no están documentadas en ningún otro lado). §2 son las decisiones. §3–§9 son las fases, en orden de ejecución. §10 son los casos de escalabilidad, uno por uno. §11 es cómo se verifica. **Si vas a ejecutar, §12 es el checklist.**

**Estado:** propuesto · **Fecha:** 2026-08-02 · **Origen:** pedido de Alejandro — expandir el cockpit a otros pipelines (1) y a otras empresas (2), priorizando disponibilidad y capacidad, sin construir sin plan.

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

- **`MOTOR_WEBHOOK_URL` es una env var singular** ([`app/(zonas)/operar/actions.ts`](<../../apps/dashboard/app/(zonas)/operar/actions.ts>)). Un webhook = una copia de workflow.
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
- El nav (que hoy se arma con `zonasDe(rol)` en [`app/(zonas)/layout.tsx`](<../../apps/dashboard/app/(zonas)/layout.tsx>)) suma el selector de empresa/pipeline, **visible solo si el usuario tiene más de uno** — un operador de EstadoX no ve que existen las otras.
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

[`app/(zonas)/operar/actions.ts`](<../../apps/dashboard/app/(zonas)/operar/actions.ts>): `MOTOR_WEBHOOK_URL` deja de ser una env var singular por empresa. El botón manda `instancia` en el payload, y el single-flight guard pasa a ser **por instancia** (hoy es global por copia de workflow). Idem `buscarAhora()` y `hayBusquedaViva()`.

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
| **+ empresas** | Los 5 uniques globales (§1.3) y la ausencia de tenant en `app` | `client_id`/`instance_id` + Capa 1 + Capa 2 | — |
| **+ sub-clientes** (los clientes de Retia) | Nada — hoy es imposible | `clients.parent_id`: el segundo nivel es **una fila** | La UI del selector con dos niveles; la visibilidad ya queda resuelta en `domain/tenant.ts` |
| **+ instancias del mismo pipeline por empresa** | `unique (workflow_id, client_id)` lo prohíbe | Se reemplaza por `(workflow_id, client_id, slug)` (§4.1) | — |
| **+ usuarios** | El alta es **manual en dos pasos** (invite en Supabase + `insert` a mano en el SQL Editor, documentado en [`007`](../../core/schema/007_app_usuarios.sql)) | Nada. **Sigue manual a propósito** | 🔶 **Con 3 empresas × varias personas esto se vuelve fricción real.** Una pantalla de alta scopeada por tenant es candidata a fase propia — no bloquea, pero se va a sentir |
| **+ volumen de candidatos** | El feed carga sin paginación; `app.candidatos` crece sin tope desde que se sacó la cuota de Airtable ([`009`](../../core/schema/009_app_config_sombra.sql): *"sin cuota: dejan de borrarse por presión de espacio"*) | Índices por `(instance_id, estado)` (§4.5) | 🔴 **Paginación del feed antes del segundo tenant.** Es lo primero que se va a notar en el frontend |
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

| # | Fase | Bloquea a | Toca prod |
|---|---|---|---|
| 1 | **Fase 0** — los 5 ADRs | todo lo demás (`core/` solo cambia con ADR) | no |
| 2 | 🧹 Limpiar el `@casper_smc` duplicado | la `016` (`not null`) | sí, un `delete` |
| 3 | **Fase 1** — `016_multi_tenant.sql` | Fases 2 y 4 | sí |
| 4 | **Fase 2** — Capa 1 (tipos + `scoped.ts` + `lib/`) | Fase 3 | no (deploy sin cambio de comportamiento) |
| 5 | **Fase 3** — rutas `[cliente]/[pipeline]` | el segundo cockpit | sí (URLs cambian) |
| 6 | **Fase 4** — `run-plan` v2 + motor + dispatcher | el segundo tenant corriendo | sí, **re-import** |
| 7 | 🔴 **Paginación del feed** (§10) | el segundo tenant con volumen | no |
| 8 | **Fase 6** — Capa 2 (RLS) | **prender el segundo cockpit en producción** | sí |
| 9 | **Fase 5** — LinkedIn | — | no (pipeline nuevo, aislado) |

**La Fase 5 va al final a propósito:** LinkedIn es el N+1 que *valida* el refactor, no el que lo motiva. Construirlo antes de que la base sea multi-tenant es construir el sexto problema encima de los cinco que ya hay.

---

## 13. Fuera de alcance, a propósito

- **No se toca `domain/`** salvo para agregar `tenant.ts`. Es la capa sana del repo y es la red de regresión.
- **No se re-litiga [ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md)** (n8n escribe por PostgREST). Se paga su costo — un re-import coordinado en la Fase 4 — con los ojos abiertos, igual que lo pagó él.
- **No se toca el problema de supply** (§10). Es real, es el cuello, y es otro trabajo.
- **No se migra a VPS** ([ADR-005](../adr/ADR-005-hosting-n8n-managed-fase1.md) fase 2) hasta que haya un disparador **medido**, no anticipado.
- **No se automatiza el alta de usuarios.** Sigue manual (§10). Se anota como fricción conocida, no como bloqueante.
- **No se rediseña la UI.** El pedido permite cambiar UI/UX si está fundamentado; acá lo único fundamentado es el **selector de empresa/pipeline** y la **paginación del feed**. Todo lo demás se queda.
