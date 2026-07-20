-- 008 — Tarifas + las 3 vistas analíticas de la zona Entender (D2 del plan-cockpit-propio).
-- Gobernada por ADR-025 (producto propio) y ADR-027 (lo analítico sale de VISTAS: una métrica
-- se define una vez, en SQL — reemplaza a `Métricas Proyectos`/`Métricas Global` de Airtable,
-- que eran una proyección que existía solo porque Airtable no podía consultar Supabase).
-- Se aplica a mano en el SQL Editor de Supabase, DESPUÉS de 001–007.
--
-- Solo lee `runs.metricas` y `outputs` (la verdad cruda de siempre): no escribe nada, no toca
-- los workflows. Las lee el BFF del dashboard con service_role.
-- "Semana" = date_trunc('week', …) = el lunes ISO, igual que el archivado.

-- ─────────────────── 1. Tarifas (antes: baked en fórmulas de Airtable) ───────────────────
-- Editar una tarifa = UPDATE acá; los costos históricos se recalculan con la tarifa vigente,
-- exactamente la misma semántica que tenía la fórmula editable de Airtable.

create table app.tarifas (
  servicio       text primary key,
  usd_por_unidad numeric not null check (usd_por_unidad >= 0),
  unidad         text not null,
  actualizado_en timestamptz not null default now()
);

comment on table app.tarifas is
  'USD por unidad de cada servicio medido en runs.metricas. Fuente: contrato airtable-cockpit §Tarifas (Mani 2026-07-14).';

insert into app.tarifas (servicio, usd_por_unidad, unidad) values
  ('supadata',          0.009,  'video transcrito'),
  ('haiku_lote',        0.004,  'lote (pre-trim o gate)'),
  ('haiku_traduccion',  0.005,  'video traducido'),
  ('apify_ig',          0.0023, 'result de instagram-scraper (motor)'),
  ('apify_tt',          0.005,  'item de free-tiktok-scraper (motor)'),
  ('perfiles_semilla',  0.0023, 'result de instagram-profile-scraper (descubrimiento)'),
  ('detalle_sugeridos', 0.0023, 'result de instagram-profile-scraper (descubrimiento)'),
  ('lookalikes_tt',     0.20,   'result de tiktok-lookalike-search (descubrimiento)');

-- Mismo patrón que el resto: RLS sin policies (por REST solo entra service_role, que bypassa).
alter table app.tarifas enable row level security;

-- ─────────────────── 2. Calidad por proyecto (reemplaza Métricas Proyectos) ───────────────────
-- Una fila por (semana de calificación × proyecto). El score del gate viene de
-- outputs.metadata.relevancia_score (ADR-021: el juicio del gate llega al histórico).

create view app.v_metricas_calidad as
select
  date_trunc('week', o.calificado_en)::date as semana,
  o.metadata->>'proyecto'                   as proyecto,
  count(*)                                  as calificados,
  count(*) filter (where o.estado in ('aprobado', 'publicado'))  as aprobados,
  count(*) filter (where o.estado = 'descartado')                as descartados,
  round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric
        / count(*), 2)                      as "precision",
  round(avg((o.metadata->>'relevancia_score')::numeric)
        filter (where o.estado in ('aprobado', 'publicado')), 2) as score_aprobados,
  round(avg((o.metadata->>'relevancia_score')::numeric)
        filter (where o.estado = 'descartado'), 2)               as score_descartados,
  round(avg((o.metadata->>'relevancia_score')::numeric)
        filter (where o.estado in ('aprobado', 'publicado'))
      - avg((o.metadata->>'relevancia_score')::numeric)
        filter (where o.estado = 'descartado'), 2)               as separacion_gate
from outputs o
where o.tipo = 'guion_reel'
  and o.calificado_en is not null
group by 1, 2;

-- ─────────────────── 3. Embudo y salud del motor (reemplaza la fila GLOBAL) ───────────────────
-- Suma runs.metricas del motor por semana de corrida. Un `en_curso` no suma embudo (sus
-- metricas todavía son null) ni cuenta como ok/fallo: acá no hace falta el matiz zombie del
-- archivado porque la vista se recalcula sola en cada lectura.

create view app.v_embudo_semana as
select
  date_trunc('week', r.inicio)::date                    as semana,
  count(*) filter (where r.estado = 'ok')               as runs_ok,
  count(*) filter (where r.estado in ('fallo', 'parcial')) as runs_fallo,
  sum((r.metricas->>'colectados')::int)                 as colectados,
  sum((r.metricas->>'asignados')::int)                  as asignados,
  sum((r.metricas->>'pretrim')::int)                    as pretrim,
  sum((r.metricas->>'filtrados')::int)                  as filtrados,
  sum((r.metricas->>'gate')::int)                       as gate_pass,
  sum((r.metricas->>'outputs')::int)                    as entregados,
  sum((r.metricas->>'sin_guion')::int)                  as sin_guion,
  sum((r.metricas->>'descartes_expuestos')::int)        as descartes_expuestos,
  round(sum(extract(epoch from (r.fin - r.inicio)) / 60)::numeric, 0) as duracion_min
from runs r
where r.params->>'workflow' = 'motor'
group by 1;

-- ─────────────────── 4. Costos de la semana (reemplaza las columnas $ de Métricas Global) ───────────────────
-- Formato largo: una fila por (semana × servicio) con unidades y USD. El total de la semana es
-- sum(costo_usd) — lo hace la pantalla, pero la definición del costo vive acá y solo acá.
-- Los contadores son los de ADR-021 bis: el motor cuenta apify_ig/apify_tt y llamadas por
-- servicio; el descubrimiento cuenta sus 3 actores. haiku_lote = lotes pre-trim + lotes gate.

create view app.v_costos_semana as
with uso as (
  select date_trunc('week', r.inicio)::date as semana, s.servicio, s.unidades
  from runs r
  cross join lateral (values
    ('supadata',         (r.metricas->'llamadas'->>'supadata')::numeric),
    ('haiku_lote',       coalesce((r.metricas->'llamadas'->>'haiku_lotes_pretrim')::numeric, 0)
                       + coalesce((r.metricas->'llamadas'->>'haiku_lotes_gate')::numeric, 0)),
    ('haiku_traduccion', (r.metricas->'llamadas'->>'haiku_traducciones')::numeric),
    ('apify_ig',         (r.metricas->>'apify_ig')::numeric),
    ('apify_tt',         (r.metricas->>'apify_tt')::numeric)
  ) as s (servicio, unidades)
  where r.params->>'workflow' = 'motor'
  union all
  select date_trunc('week', r.inicio)::date, s.servicio, s.unidades
  from runs r
  cross join lateral (values
    ('perfiles_semilla',  (r.metricas->>'perfiles_semilla')::numeric),
    ('detalle_sugeridos', (r.metricas->>'detalle_sugeridos')::numeric),
    ('lookalikes_tt',     (r.metricas->>'lookalikes_tt')::numeric)
  ) as s (servicio, unidades)
  where r.params->>'workflow' = 'descubrimiento'
)
select
  u.semana,
  u.servicio,
  t.unidad,
  sum(u.unidades)::numeric                        as unidades,
  round(sum(u.unidades) * t.usd_por_unidad, 2)    as costo_usd
from uso u
join app.tarifas t on t.servicio = u.servicio
where u.unidades is not null and u.unidades > 0
group by u.semana, u.servicio, t.unidad, t.usd_por_unidad;

-- Sin grants nuevos: por REST solo las lee el service_role (bypassa RLS y tiene los suyos).
-- `authenticated` NO ve tarifas ni vistas — la zona Entender pasa por el BFF, no por el browser.
