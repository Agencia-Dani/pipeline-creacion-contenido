-- 020_pipeline_linkedin.sql — las tablas del pipeline N+1 (ADR-049 + ADR-055).
-- Aplicar DESPUÉS de la `019`. SQL Editor de Supabase → pegar → Run.
--
-- Qué hace: le da a LinkedIn sus propias tablas de pieza, contra el contrato común que ya existe
-- (`content_item`/`output`, el registro de `runs`/`outputs`, la identidad y las membresías). Es la
-- decisión D del plan multi-tenant, ejecutada: **lo común es el contrato, lo propio es la tabla.**
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ CUATRO COSAS QUE HAY QUE SABER ANTES DE PEGAR ESTO
--
--   1. **`app.plataforma` NO se toca.** Prohibido explícitamente por ADR-049 §3: el enum se queda
--      con ('instagram','tiktok') porque describe el pipeline de reels, que es de lo único que
--      habla. LinkedIn no es un valor más de ese enum — es otro pipeline, con otras tablas.
--
--   2. **Esta migración NO crea ninguna instancia ni ningún cliente.** Solo crea tablas vacías.
--      Prender un cockpit de LinkedIn es un `insert` a `instances`, aparte y a conciencia: mientras
--      no exista esa fila, estas tablas no las mira nadie y el dispatcher no dispara nada.
--
--   3. **Grano instancia, como manda ADR-049.** Ojo con la asimetría contra reels, que es a
--      propósito: `app.referentes` (reels) es de grano EMPRESA porque el banco de cuentas es el
--      mismo para toda la empresa; `app.referentes_linkedin` es de grano INSTANCIA porque un filtro
--      de Pinterest es del pipeline, no de la empresa. La regla que decide es la de ADR-049 §5:
--      ¿el dato tiene sentido sin saber de qué pipeline vino?
--
--   4. **Sin defaults puente, al revés que la `016`.** Ahí los defaults existían para no romper
--      inserts de un sistema vivo durante el expand/contract. Acá no hay nada vivo que romper: las
--      tablas nacen con `instance_id not null` y sin default, o sea que un insert que se olvide del
--      tenant **falla en el primer intento** en vez de atribuirle datos a la instancia equivocada.
-- ─────────────────────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
begin
  if to_regclass('instances') is null or to_regclass('app.voces') is null then
    raise exception '020: faltan instances / app.voces. Corré la 016 y la 009 primero.';
  end if;
end
$guardas$;

-- El pipeline se declara en el registro central. **No es opcional ni cosmético:**
-- `instances.workflow_id` le hace FK, así que sin esta fila el cockpit de LinkedIn no se puede
-- crear — y la migración que crea las tablas es el lugar honesto para registrarlo, no un paso
-- suelto que alguien tiene que acordarse de correr después.
-- Nace `draft` porque todavía no corre nada: pasa a `active` cuando el workflow esté importado
-- y activo en n8n.
insert into workflows (id, nombre, motor, estado)
values ('linkedin', 'Máquina de LinkedIn — referentes y texto, con fotos', 'n8n', 'draft')
on conflict (id) do nothing;


-- ═══════════════════════ §1 · Los dos vocabularios del pipeline ═══════════════════════

-- El carril del que salió la pieza (ADR-055 §2). No es una etiqueta descriptiva: los dos carriles
-- tienen umbrales distintos y trabajos distintos en producción, así que la pieza tiene que saber
-- de cuál vino para que el resto del pipeline sepa qué hacerle.
--   · personal  — del archivo propio de la voz. No compite con nadie: no hay umbral de volumen.
--   · copiable  — de afuera. Ya funcionó en otro lado y se rebrandea (paleta, traducción, firma).
create type app.carril_linkedin as enum ('personal', 'copiable');

-- De dónde salió. Deliberadamente NO es `app.plataforma`: son universos distintos.
--   · pinterest — la fuente principal del carril copiable (ADR-055 §2: se deja rastrear, y es
--                 donde vive de verdad el material visual que se rebrandea)
--   · linkedin  — deseable y no requerido; entra cuando y si se deja
--   · web       — blogs, newsletters, cualquier página suelta que un humano trajo
--   · archivo   — el material propio de la voz (podcasts, blogs, transcripciones): el carril personal
create type app.fuente_linkedin as enum ('pinterest', 'linkedin', 'web', 'archivo');


-- ═══════════════════════ §2 · El banco de referentes ═══════════════════════
-- La etapa 1 del carril copiable. Hoy NO EXISTE en ninguna marca — Fernando, textual: "no tengo el
-- listado de referentes". Hay que construirlo, no capturarlo, y por eso la tabla nace vacía y se
-- llena desde el cockpit.

create table app.referentes_linkedin (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references instances (id),
  fuente         app.fuente_linkedin not null,
  -- El handle de una cuenta (`@alguien`) o el filtro de búsqueda de Pinterest (`mindset`, `AI`).
  -- Es el mismo campo a propósito: los dos son "la consulta que le hago a esta fuente", y
  -- separarlos en dos columnas dejaría una nula en cada fila sin ganar nada.
  consulta       text not null,
  -- El idioma en el que se busca. El arbitraje de tiempo del carril copiable ES esto: un formato
  -- agotado en inglés puede estar fresco en español.
  idioma         text,
  proyecto_id    uuid references app.proyectos (id),
  activo         boolean not null default false,
  notas          text,
  actualizado_en timestamptz not null default now(),

  -- Dos veces la misma consulta a la misma fuente en el mismo cockpit es un duplicado que paga dos
  -- veces el scrape y mete la misma pieza dos veces al feed.
  unique (instance_id, fuente, consulta)
);

create index referentes_linkedin_instancia_idx on app.referentes_linkedin (instance_id, activo);

comment on table app.referentes_linkedin is
  'El banco del carril copiable (ADR-055): cuentas y filtros de Pinterest/inglés de donde salen los formatos que ya funcionaron. Grano instancia (ADR-049).';


-- ═══════════════════════ §3 · El perfil de voz para LinkedIn ═══════════════════════
-- Por qué no son columnas de `app.voces`: la firma, el espaciado y la separación mínima entre posts
-- **no tienen sentido sin saber que hablamos de LinkedIn** — son la regla de ADR-049 §5 del lado
-- "propio". `app.voces` es de grano empresa y la comparten los dos pipelines; ensuciarla con
-- config de uno solo es exactamente la tabla ancha llena de nulls que ADR-049 descartó.
--
-- 🩸 El insumo que llena `perfil` NO es el perfil de LinkedIn de la persona. Es su archivo completo
-- (podcasts, blogs, transcripciones) — el hallazgo que más cambió el diseño. De ese archivo salen
-- DOS cosas y solo una es la voz: cómo habla (esto) y qué le ha pasado (el carril personal).

create table app.voces_linkedin (
  instance_id  uuid not null references instances (id),
  voz_id       uuid not null references app.voces (id) on delete cascade,

  -- Cómo habla: léxico, registro, tratamiento, clichés a evitar.
  perfil       text,

  -- R-2 (ADR-055 §4) — nombre · cargo · frase de propósito. Va al cierre de TODO post, sin
  -- excepción, y también al pie de la imagen rebrandeada. La única excepción es la imagen ajena sin
  -- modificar: no se firma lo que no se tocó.
  -- Es `not null` porque una voz sin firma produce posts que violan la regla en silencio, y el
  -- validador determinista no tendría contra qué chequear.
  firma        text not null,

  -- R-3 — cuántas líneas por bloque en el CUERPO. Es preferencia personal, no norma: Daniel Bilbao
  -- escribe de una en una, Andrés no. (R-1, el gancho sin línea en blanco, NO está acá: es de la
  -- plataforma, se impone a todas las voces y vive en código.)
  espaciado    smallint not null default 2 check (espaciado between 1 and 3),

  -- R-4 — horas mínimas entre dos posts de esta cuenta. Los posts se canibalizan: "si pones dos
  -- pegados con una hora de diferencia, el primero no va a volar tanto". Gobierna la cola.
  separacion_h smallint not null default 4 check (separacion_h > 0),

  -- Las franjas que funcionan y los días buenos: empíricos y POR CUENTA, no hay fórmula. Base
  -- observada: 08:00 · 13:00 · 17:30 (las 19:00 solo si el post es megaviral).
  franjas      text[] not null default array['08:00','13:00','17:30'],
  dias         text[],

  -- Las líneas rojas propias, que se SUMAN a la base común (política y religión). Comedia y
  -- controversia están permitidas explícitamente.
  -- ⚠️ Lo que NO se automatiza y queda como límite del producto, no como filtro: la sensibilidad al
  -- mercado local. Eso lo resuelve el humano de la etapa de curación.
  lineas_rojas text,

  actualizado_en timestamptz not null default now(),

  primary key (instance_id, voz_id)
);

comment on table app.voces_linkedin is
  'La config por voz del pipeline de LinkedIn (ADR-055 §4): firma (R-2), espaciado (R-3) y separación mínima (R-4). R-1 no está acá: es de la plataforma y vive en código.';


-- ═══════════════════════ §4 · Las piezas candidatas ═══════════════════════
-- El equivalente de `app.candidatos`, y por qué no es la misma tabla: allá la pieza es un VIDEO
-- (`views`, `likes`, `thumbnail_url`, `seguidores`, y `script` = la transcripción). Acá la pieza es
-- texto y/o una imagen, y no hay nada que transcribir — la etapa `enriquecer` es `n/a` (ADR-055 §3).

create table app.candidatos_linkedin (
  id                uuid primary key default gen_random_uuid(),
  instance_id       uuid not null references instances (id),

  -- La identidad de la pieza en su fuente. Es lo que dedupea, y va scopeado por instancia: el
  -- unique global fue el peor hallazgo del diagnóstico multi-tenant (le vaciaba el supply a la
  -- segunda empresa sin un solo error). No se repite acá.
  external_id       text not null,

  carril            app.carril_linkedin not null,
  fuente            app.fuente_linkedin not null,
  referente_id      uuid references app.referentes_linkedin (id),

  titulo            text not null,
  -- El post o la idea, tal cual vino. En reels el campo equivalente se llama `script` y es la
  -- transcripción; acá el texto ES la pieza, no una derivación de ella.
  texto             text,
  idioma            text,
  url               text,
  autor             text,
  -- La imagen ORIGINAL. La rebrandeada (paleta de la marca, traducida, firmada) es un artefacto de
  -- producción y no vive acá: cuando exista, va por `outputs` como cualquier otra entrega.
  imagen_url        text,

  -- Las métricas que la fuente dé. Nulas en el carril personal, donde no hay nada contra qué
  -- medirse, y nulas en Pinterest, donde el umbral es de pertinencia y formato, no de viralidad.
  reacciones        bigint,
  comentarios       bigint,

  heat_score        numeric,
  relevancia_score  numeric,
  relevancia_razon  text,

  proyecto_id       uuid references app.proyectos (id),
  voz_id            uuid references app.voces (id),

  -- Calificar es un solo acto y el estado se deriva (ADR-034): 🔥/👍 ⇒ aprobado · 👎 ⇒ descartado.
  -- Mismo vocabulario que reels a propósito: el equipo de redes no aprende dos idiomas.
  calificacion      text check (calificacion in ('🔥', '👍', '👎')),
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'aprobado', 'descartado')),
  fecha_calificacion timestamptz,
  notas_equipo      text,
  output_id         uuid references outputs (id),
  creado_en         timestamptz not null default now(),

  unique (instance_id, external_id)
);

create index candidatos_linkedin_instancia_estado_idx
  on app.candidatos_linkedin (instance_id, estado);


-- ═══════════════════════ §5 · Los descartes ═══════════════════════
-- Los near-miss del gate, para auditar falsos negativos. No se barren NUNCA (ADR-036): un descarte
-- sin auditar antes del domingo era una auditoría perdida para siempre.

create table app.descartes_linkedin (
  id               uuid primary key default gen_random_uuid(),
  instance_id      uuid not null references instances (id),
  external_id      text,
  carril           app.carril_linkedin not null,
  fuente           app.fuente_linkedin not null,
  titulo           text not null,
  texto            text,
  url              text,
  autor            text,
  imagen_url       text,
  proyecto_id      uuid references app.proyectos (id),
  relevancia_score numeric,
  relevancia_razon text,
  veredicto        text check (veredicto in ('bien descartado', 'era bueno')),
  creado_en        timestamptz not null default now()
);

create index descartes_linkedin_instancia_idx
  on app.descartes_linkedin (instance_id, creado_en desc);


-- ═══════════════════════ §6 · RLS ═══════════════════════
-- Enabled y sin policies, que es el patrón vivo del schema `app`: hoy el aislamiento lo da la Capa 1
-- (TypeScript) y el BFF lee con `service_role`. Las policies llegan con la Capa 2 (ADR-047), cuyo
-- disparador es justamente que un segundo cliente real tenga usuarios en producción — o sea que
-- estas cuatro tablas nacen del lado correcto del disparador y NO hay que acordarse de volver.

alter table app.referentes_linkedin  enable row level security;
alter table app.voces_linkedin       enable row level security;
alter table app.candidatos_linkedin  enable row level security;
alter table app.descartes_linkedin   enable row level security;

grant usage on schema app to service_role;
grant all on app.referentes_linkedin, app.voces_linkedin,
             app.candidatos_linkedin, app.descartes_linkedin to service_role;


-- ═══════════════════════ Verificación (correr y mirar) ═══════════════════════
-- 1. Las cuatro tablas existen y están vacías:
--      select relname, n_live_tup from pg_stat_user_tables
--       where schemaname = 'app' and relname like '%linkedin%' order by 1;
--
-- 2. El enum de reels NO se tocó (tiene que dar exactamente instagram y tiktok):
--      select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--       where t.typname = 'plataforma' order by enumsortorder;
--
-- 3. `instance_id` es not null y SIN default en las cuatro (lo contrario de la 016, §nota 4):
--      select table_name, column_name, is_nullable, column_default
--        from information_schema.columns
--       where table_schema = 'app' and column_name = 'instance_id'
--         and table_name like '%linkedin%';
--
-- 4. Lo que esta migración NO hace, y hay que hacer aparte para que el cockpit exista:
--      insert into instances (client_id, workflow_id, slug, nombre, estado) values (...);
--    Mientras no exista esa fila no hay cockpit de LinkedIn, y eso es lo correcto: las tablas se
--    aplican una vez, los cockpits se prenden uno por uno.
