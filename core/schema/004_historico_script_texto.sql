-- 004_historico_script_texto.sql — el script va como TEXTO, no como link (ADR-009, decisión 2026-06-14)
-- Aplicar DESPUÉS de 001, 002 y 003. SQL Editor de Supabase → pegar → Run.
-- No edita los anteriores; reemplaza una vista. Cambios futuros = 005_*.sql.
--
-- Por qué:
--   La decisión 2026-06-14 (HANDOFF §"Decisiones a consultar con el equipo", punto 2) descartó el
--   Google Doc por script: el guion vive como TEXTO en Airtable (`Candidatos.script`) y en Supabase
--   (`outputs.contenido_o_link` — así lo escribe el motor B3, ver workflow.json nodo "Preparar
--   outputs Supabase"). El campo `link_doc` quedó vestigial (el motor lo manda vacío).
--   → El histórico (la tabla del jefe + el Sheet del carril C) debe llevar el TEXTO del script,
--     no un link muerto.
--
-- Qué cambia:
--   v_historico_seleccionados deja de exponer `link_doc` y pasa a exponer `script`
--   (= outputs.contenido_o_link). El resto de columnas no cambia. Cambia el NOMBRE de una columna
--   → no alcanza CREATE OR REPLACE (Postgres no permite renombrar/quitar columnas de una vista con
--     REPLACE); hay que DROP + CREATE.

drop view if exists v_historico_seleccionados;

create view v_historico_seleccionados as
select
  o.calificado_en,
  o.metadata->>'proyecto'              as proyecto,
  o.metadata->>'voz'                   as voz,
  o.titulo,
  o.metadata->>'url_referente'         as url_original,
  o.contenido_o_link                   as script,        -- ← antes: metadata->>'link_doc'
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
