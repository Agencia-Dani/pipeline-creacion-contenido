-- 009 — El schema `app` completo: la config que hoy vive en Airtable (D3 del plan-cockpit-propio).
-- Gobernada por ADR-025/027: Postgres pasa a ser el dueño de la config, dominio por dominio.
-- Esta migración crea las tablas EN SOMBRA: Airtable sigue siendo el dueño hasta que el diff
-- (apps/dashboard/scripts) dé cero diferencias 3 corridas seguidas; el flip es por dominio (D5).
-- Se aplica a mano en el SQL Editor de Supabase, DESPUÉS de 001–008.
--
-- Reglas que Airtable no podía hacer cumplir y acá son constraint (plan-cockpit §4):
--   · proyectos.voz_id NOT NULL → "1 proyecto = 1 voz" deja de ser convención (regla de Mani,
--     cierre 46 — ya se rompió una vez en vivo y se limpió a mano).
--   · proyectos.criterios_relevancia NOT NULL → cierra la trampa del form (mapa-campos §5.1-6).
--   · referentes.plataforma como enum · ajustes.clave con check contra el mapa conocido.
--   · candidatos sin cuota de 1.000 records ni thumbnails que expiran.
--   · descartes.veredicto editable de verdad (en Airtable estaba bloqueado, §5.1-1).
--
-- Identidad durante la sombra: cada tabla lleva `airtable_id` único (el record id de la base
-- viva). El import upsertea por esa clave y el diff compara por ella. Cuando Airtable se apague
-- (D8), la columna queda como legado inofensivo y las filas nuevas ya nacen sin ella.
--
-- La salud de referentes NO se guarda: son 3 columnas derivadas que hoy escribe el archivado;
-- acá son la vista v_salud_referentes (se derivan de runs.metricas + v_senal_seleccion).

create type app.plataforma as enum ('instagram', 'tiktok');

-- ─────────────────── Voces y Proyectos (van juntas: FK) ───────────────────

create table app.voces (
  id                   uuid primary key default gen_random_uuid(),
  airtable_id          text unique,
  nombre               text not null,
  descripcion          text,
  criterios_relevancia text,
  activo               boolean not null default false,
  actualizado_en       timestamptz not null default now()
);

create table app.proyectos (
  id                   uuid primary key default gen_random_uuid(),
  airtable_id          text unique,
  nombre               text not null,
  descripcion          text,
  criterios_relevancia text not null,
  criterios_aprendidos text,
  advertencia_criterios text,
  voz_id               uuid not null references app.voces (id),
  activo               boolean not null default false,
  n                    integer check (n is null or n >= 0),  -- null o 0 = default global (ADR-024)
  actualizado_en       timestamptz not null default now()
);

-- ─────────────────── Referentes (banco de perfiles, ADR-019) ───────────────────

create table app.referentes (
  id             uuid primary key default gen_random_uuid(),
  airtable_id    text unique,
  handle         text not null,
  plataforma     app.plataforma not null,
  proyecto_id    uuid references app.proyectos (id),
  activo         boolean not null default false,
  notas          text,
  actualizado_en timestamptz not null default now()
);

-- Salud de la fuente (ADR-022/M2), derivada — el archivado deja de escribirla al migrar:
-- tasa_gate y videos_evaluados salen del desglose por_referente de runs.metricas (últimos 7
-- días, como el nodo 24 del archivado); tasa_aprobacion de v_senal_seleccion (acumulada).
-- El mínimo de muestra (min_muestra_referente=10) lo aplica la pantalla, no la vista.
create view app.v_salud_referentes as
with semana as (
  select (jsonb_each(r.metricas->'por_referente')).key   as handle,
         (jsonb_each(r.metricas->'por_referente')).value as conteos
  from runs r
  where r.params->>'workflow' = 'motor'
    and r.inicio >= now() - interval '7 days'
),
gate as (
  select lower(handle) as handle,
         sum((conteos->>'evaluados')::int) as videos_evaluados,
         sum((conteos->>'gate_pass')::int) as gate_pass
  from semana group by 1
)
select
  ref.id,
  ref.handle,
  gate.videos_evaluados,
  case when gate.videos_evaluados > 0
       then round(gate.gate_pass::numeric / gate.videos_evaluados, 2) end as tasa_gate,
  sel.tasa_seleccion as tasa_aprobacion
from app.referentes ref
left join gate on gate.handle = lower(replace(ref.handle, '@', ''))
left join v_senal_seleccion sel on lower(coalesce(sel.referente, '')) = lower(replace(ref.handle, '@', ''));

-- ─────────────────── Ajustes (los knobs, ADR-011) ───────────────────
-- El check es el AJUSTE_MAP del contrato: una clave fuera del mapa es un typo que el motor
-- ignoraría en silencio — acá revienta al escribir, que es lo que queremos. Sumar un knob
-- nuevo = migración (a propósito: el mapa del motor también hay que tocarlo).

create table app.ajustes (
  clave        text primary key check (clave in (
    'Peso de vistas', 'Peso de likes', 'Peso de interacción', 'Peso de relevancia',
    'Bonus idioma extranjero', 'Seguidores para marcar viral',
    'Mínimo de vistas', 'Mínimo de likes', 'Relevancia mínima',
    'Candidatos por corrida', 'Días de recencia', 'Resultados por cuenta de referente',
    'Buscar por referentes en Instagram', 'Buscar por referentes en TikTok',
    'Propuestas por corrida', 'Afinidad mínima de propuesta',
    'Descubrir en Instagram', 'Descubrir en TikTok'
  )),
  airtable_id  text unique,
  valor        numeric,
  descripcion  text,
  visibilidad  text not null default 'dev' check (visibilidad in ('equipo', 'dev')),
  actualizado_en timestamptz not null default now()
);

-- ─────────────────── Candidatos (el feed a calificar) ───────────────────
-- Sin cuota: dejan de borrarse por presión de espacio. output_id se llena al archivar
-- (la costura con el histórico canónico de ADR-014); en sombra queda null.

create table app.candidatos (
  id                uuid primary key default gen_random_uuid(),
  airtable_id       text unique,
  titulo            text not null,
  script            text,
  idioma            text,
  thumbnail_url     text,
  proyecto_id       uuid references app.proyectos (id),
  voz_id            uuid references app.voces (id),
  referente         text,
  url_referente     text,
  views             bigint,
  likes             bigint,
  seguidores        bigint,
  engagement        numeric,
  heat_score        numeric,
  relevancia_score  numeric,
  relevancia_razon  text,
  viral_por_tamano  boolean not null default false,
  calificacion      text check (calificacion in ('🔥', '👍', '👎')),
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'aprobado', 'descartado')),
  fecha_calificacion timestamptz,
  notas_equipo      text,
  output_id         uuid references outputs (id),
  creado_en         timestamptz not null default now()
);

create index candidatos_estado_idx on app.candidatos (estado);

-- ─────────────────── Descartes del gate (los near-miss, ADR-021) ───────────────────

create table app.descartes (
  id               uuid primary key default gen_random_uuid(),
  airtable_id      text unique,
  titulo           text not null,
  script           text,
  referente        text,
  url_referente    text,
  proyecto_id      uuid references app.proyectos (id),
  relevancia_score numeric,
  relevancia_razon text,
  thumbnail_url    text,
  veredicto        text check (veredicto in ('bien descartado', 'era bueno')),
  creado_en        timestamptz not null default now()
);

-- ─────────────────── Referentes propuestos (la bandeja del descubrimiento, ADR-020) ───────────────────

create table app.referentes_propuestos (
  id           uuid primary key default gen_random_uuid(),
  airtable_id  text unique,
  handle       text not null,
  plataforma   app.plataforma,
  proyecto_id  uuid references app.proyectos (id),
  afinidad     numeric,
  razon        text,
  seguidores   bigint,
  bio          text,
  url          text,
  semillas     text,
  estado       text not null default 'propuesto'
               check (estado in ('propuesto', 'aprobado', 'descartado', 'promovido')),
  creado_en    timestamptz not null default now()
);

-- ─────────────────── Eventos (auditoría, C7) ───────────────────
-- Quién disparó, quién calificó, quién apagó una voz. Lo escribe solo el BFF.

create table app.eventos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references app.usuarios (id),
  tipo       text not null,
  detalle    jsonb,
  creado_en  timestamptz not null default now()
);

create index eventos_creado_idx on app.eventos (creado_en desc);

-- ─────────────────── Seguridad ───────────────────
-- Mismo patrón que el resto: RLS activado SIN policies — por REST solo entra el service_role
-- del BFF. Cuando lleguen las pantallas de edición (D5/D6), la escritura seguirá pasando por
-- el BFF (Server Actions), no por el browser: no hacen falta policies de authenticated.

alter table app.voces                  enable row level security;
alter table app.proyectos              enable row level security;
alter table app.referentes             enable row level security;
alter table app.ajustes                enable row level security;
alter table app.candidatos             enable row level security;
alter table app.descartes              enable row level security;
alter table app.referentes_propuestos  enable row level security;
alter table app.eventos                enable row level security;
