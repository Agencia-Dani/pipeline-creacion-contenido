-- 002_cockpit_y_dedup.sql — extensiones para el MVP de reels (ADR-008)
-- Aplicar DESPUÉS de 001. SQL Editor de Supabase → pegar → Run.
-- No edita 001; agrega lo nuevo. Cambios futuros = 003_*.sql.
--
-- Qué agrega:
--   1. processed_items  → el "set de procesados" que evita reprocesar contenido (dedup/incremental).
--   2. v_corpus_aprobados → vista del corpus de guiones aprobados por voz (alimenta el few-shot).
-- El cockpit del equipo (proyectos, referentes, keywords, voces, calificación) vive en Airtable
-- (core/contracts/airtable-cockpit.md); Supabase solo guarda lo que se acumula.

-- ───────────────────────── Dedup: set de procesados ─────────────────────────
-- Cada video que el motor YA consideró queda acá. Antes de generar, el workflow consulta esta
-- tabla y descarta lo visto; después de la corrida, inserta lo nuevo. El UNIQUE es el dedup real.

create table processed_items (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid references instances(id),
  run_id       uuid references runs(id),
  platform     text not null,                 -- instagram | tiktok
  external_id  text not null,                 -- id del video en la plataforma (estable)
  url          text,
  seguidores   bigint,                        -- del autor al momento de verlo
  flag_viral   boolean not null default false,-- true si seguidores > umbral (≈700K) — se marca, no se filtra
  primera_vez  timestamptz not null default now(),
  unique (platform, external_id)              -- ← el corazón del dedup: no entra dos veces
);

create index processed_items_lookup on processed_items (platform, external_id);

-- Inserción idempotente desde n8n: ON CONFLICT DO NOTHING (re-correr no duplica ni falla).
-- POST .../rest/v1/processed_items con header  Prefer: resolution=ignore-duplicates

-- ───────────────────── Corpus de aprobados (loop de mejora) ─────────────────────
-- Cuando el equipo aprueba un candidato en Airtable, su estado se archiva acá como output
-- 'aprobado'. Esta vista junta los aprobados por voz → son los few-shot de la próxima generación.
-- (La 'voz' viaja en outputs.metadata->>'voz'; el guion en contenido_o_link.)

create view v_corpus_aprobados as
select
  o.id,
  o.metadata->>'voz'        as voz,
  o.titulo,
  o.contenido_o_link        as guion,
  o.metadata->>'proyecto'   as proyecto,
  o.publicado_en,
  o.creado_en
from outputs o
where o.tipo = 'guion_reel'
  and o.estado in ('aprobado', 'publicado')
order by o.creado_en desc;

-- ───────────────────── Catálogo de tipos de output (se sella) ─────────────────────
-- 001 dejó outputs.tipo sin check duro a propósito. Con el MVP de reels el tipo queda fijo:
alter table outputs
  add constraint outputs_tipo_chk
  check (tipo in ('guion_reel', 'research_item', 'borrador_newsletter', 'nugget'));

alter table processed_items enable row level security;  -- igual que el resto: solo service_role
