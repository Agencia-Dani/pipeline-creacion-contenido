-- 001_registro_inicial.sql — Registro central v0 (PLAN.md §2.2)
-- Aplicar UNA vez en Supabase: SQL Editor → pegar → Run.
-- Cambios futuros = archivos nuevos numerados (002_*.sql), nunca editar este.
--
-- Nota de diseño: 'trigger' es palabra con significado propio en SQL → la columna se llama
-- trigger_type. El catálogo de outputs.tipo queda SIN check duro a propósito: la taxonomía
-- se cierra con el jefe (PLAN.md §3.2); cuando se selle, se agrega el check en 002.

-- ───────────────────────────── Entidades ─────────────────────────────

create table clients (
  id         text primary key,                 -- slug == carpeta en clients/
  nombre     text not null,
  estado     text not null default 'activo'
             check (estado in ('activo', 'pausado', 'retirado')),
  creado_en  timestamptz not null default now()
);

create table workflows (
  id         text primary key,                 -- slug == id del manifest (workflow.yaml)
  nombre     text not null,
  motor      text not null check (motor in ('n8n', 'openclaw', 'script')),
  estado     text not null default 'draft'
             check (estado in ('draft', 'active', 'paused', 'inactive', 'retired')),
  creado_en  timestamptz not null default now()
);

-- Una instancia = un workflow desplegado para un cliente concreto.
create table instances (
  id          uuid primary key default gen_random_uuid(),
  workflow_id text not null references workflows (id),
  client_id   text not null references clients (id),
  config_ref  text,                            -- ruta de la config en el repo (clients/...)
  estado      text not null default 'draft'
              check (estado in ('draft', 'active', 'paused', 'retired')),
  creado_en   timestamptz not null default now(),
  unique (workflow_id, client_id)
);

create table runs (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references instances (id),
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  estado         text not null default 'en_curso'
                 check (estado in ('en_curso', 'ok', 'fallo', 'parcial')),
  trigger_type   text not null
                 check (trigger_type in ('cron', 'manual', 'on_demand', 'conversation')),
  params         jsonb,                        -- filtros pedidos en esa corrida (scope: run)
  costo_estimado numeric,                      -- USD estimados de APIs de esa corrida
  metricas       jsonb,                        -- contadores libres (items colectados, filtrados…)
  error          text
);

create table outputs (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references runs (id),
  tipo             text not null,              -- catálogo v0: guion_reel | research_item |
                                               -- borrador_newsletter | nugget (check duro en 002)
  titulo           text not null,
  contenido_o_link text not null,              -- contenido completo o link al destino nativo
  estado           text not null default 'draft'
                   check (estado in ('draft', 'aprobado', 'publicado', 'descartado')),
  publicado_en     timestamptz,
  source_items     jsonb,                      -- content_items de origen (trazabilidad)
  metadata         jsonb,                      -- métricas del item fuente (views, likes,
                                               -- seguidores, hashtags…) → filtros del dashboard
  external_id      text,                       -- id en el destino nativo (página Notion, fila
                                               -- Sheet) → clave del sync idempotente (F3)
  creado_en        timestamptz not null default now()
);

-- ───────────────────────────── Índices ─────────────────────────────

create index runs_instance_inicio_idx on runs (instance_id, inicio desc);
create index outputs_run_idx          on outputs (run_id);
create index outputs_estado_idx       on outputs (estado);
-- Idempotencia del sync: un objeto del destino nativo entra una sola vez.
create unique index outputs_external_id_key on outputs (external_id)
  where external_id is not null;

-- ─────────────────────── Vista para dashboard/resúmenes ───────────────────────

create view v_outputs_recientes as
select
  o.creado_en,
  c.id   as cliente,
  w.id   as workflow,
  o.tipo,
  o.titulo,
  o.estado,
  o.contenido_o_link,
  r.trigger_type,
  r.inicio as corrida_inicio,
  r.costo_estimado,
  o.metadata
from outputs o
join runs      r on r.id = o.run_id
join instances i on i.id = r.instance_id
join workflows w on w.id = i.workflow_id
join clients   c on c.id = i.client_id
order by o.creado_en desc;

-- ───────────────────────────── Seguridad ─────────────────────────────
-- RLS activado SIN policies: por REST solo entra la service_role key (bypassa RLS),
-- que vive en las credenciales de n8n — jamás en el repo. La anon key no ve nada.

alter table clients   enable row level security;
alter table workflows enable row level security;
alter table instances enable row level security;
alter table runs      enable row level security;
alter table outputs   enable row level security;

-- Rol de SOLO LECTURA para dashboards (Looker/Metabase, F4).
-- Descomentar al llegar a F4, generar el password y guardarlo en el gestor (no en el repo):
-- create role dashboard_ro login password '<GENERAR_PASSWORD>';
-- grant usage on schema public to dashboard_ro;
-- grant select on all tables in schema public to dashboard_ro;
-- alter default privileges in schema public grant select on tables to dashboard_ro;

-- ───────────────────────────── Seeds ─────────────────────────────

insert into workflows (id, nombre, motor, estado) values
  ('short-form-content', 'Detector de referentes virales → guiones short form', 'n8n',      'draft'),
  ('substack',           'Newsletter editorial — research, scoring y borradores', 'openclaw', 'inactive');

-- El cliente real y su instancia se insertan en F2 al configurarlo:
-- insert into clients (id, nombre) values ('<slug>', '<Nombre>');
-- insert into instances (workflow_id, client_id, config_ref)
--   values ('short-form-content', '<slug>', 'clients/<slug>/short-form-content.yaml');
