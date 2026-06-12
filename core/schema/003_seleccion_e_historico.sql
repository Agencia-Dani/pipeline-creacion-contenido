-- 003_seleccion_e_historico.sql — la dirección del jefe 2026-06-12 (ADR-009)
-- Aplicar DESPUÉS de 001 y 002. SQL Editor de Supabase → pegar → Run.
-- No edita los anteriores; agrega lo nuevo. Cambios futuros = 004_*.sql.
--
-- Qué agrega:
--   1. processed_items.idioma     → idioma del original (prioridad multiidioma del heat-score).
--   2. outputs.calificado_en      → cuándo el equipo calificó (tracking de selecciones).
--   3. v_historico_seleccionados  → la "tabla histórica" que pidió el jefe: link original +
--                                   métricas + link al Doc, por voz. Se materializa al Sheet.
--   4. v_selecciones_por_dia      → "el lunes 20 seleccionaron 5 videos para tal voz".
--   5. v_senal_seleccion          → el aprendizaje: tasa de selección por referente/idioma,
--                                   alimenta el heat-score de las corridas siguientes.
--
-- Nota (ADR-009): v_corpus_aprobados (002) queda EN PAUSA — no se borra; es la costura de la
-- evolución futura "guiones en voz propia". El motor v1 no la consulta.

-- ─────────────────── 1. Idioma del original (dedup ya lo ve pasar) ───────────────────

alter table processed_items add column idioma text;   -- es | en | pt | it | fr | otro

-- ─────────────────── 2. Cuándo se calificó (lo escribe el archivado) ───────────────────

alter table outputs add column calificado_en timestamptz;

-- Convención de metadata para outputs tipo 'guion_reel' (lo escribe el motor / el archivado):
--   { proyecto, voz, referente, url_referente, link_doc, idioma, views, likes, seguidores,
--     engagement, heat_score, calificacion ('🔥'|'👍'|'👎'), hashtags }

-- ─────────────────── 3. El histórico de seleccionados (tabla del jefe) ───────────────────
-- Una fila por video que el equipo calificó. El workflow de archivado hace append de las filas
-- nuevas al Google Sheet "Histórico" (exportable a Excel desde Sheets, nativo).

create view v_historico_seleccionados as
select
  o.calificado_en,
  o.metadata->>'proyecto'              as proyecto,
  o.metadata->>'voz'                   as voz,
  o.titulo,
  o.metadata->>'url_referente'         as url_original,
  o.metadata->>'link_doc'              as link_doc,
  o.metadata->>'idioma'                as idioma,
  (o.metadata->>'views')::bigint       as views,
  (o.metadata->>'likes')::bigint       as likes,
  (o.metadata->>'seguidores')::bigint  as seguidores,
  (o.metadata->>'heat_score')::numeric as heat_score,
  o.metadata->>'calificacion'          as calificacion,
  o.estado
from outputs o
where o.tipo = 'guion_reel'
  and o.calificado_en is not null
order by o.calificado_en desc;

-- ─────────────────── 4. Selecciones por día y voz ───────────────────

create view v_selecciones_por_dia as
select
  date(o.calificado_en)   as dia,
  o.metadata->>'voz'      as voz,
  o.estado,                              -- aprobado | descartado | publicado
  count(*)                as videos
from outputs o
where o.tipo = 'guion_reel'
  and o.calificado_en is not null
group by 1, 2, 3
order by dia desc;

-- ─────────────────── 5. Señal de aprendizaje para el heat-score ───────────────────
-- El motor la consulta al scorear: referentes/idiomas con mejor tasa de selección suben.

create view v_senal_seleccion as
select
  o.metadata->>'referente' as referente,
  o.metadata->>'idioma'    as idioma,
  count(*) filter (where o.estado in ('aprobado', 'publicado')) as seleccionados,
  count(*)                 as calificados,
  round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric
        / count(*), 2)     as tasa_seleccion
from outputs o
where o.tipo = 'guion_reel'
  and o.calificado_en is not null
group by 1, 2;
