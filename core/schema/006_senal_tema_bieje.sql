-- 006_senal_tema_bieje.sql — señal de aprendizaje por keyword/tema (segundo eje, O7 / ADR-012)
-- Aplicar DESPUÉS de 001–005. SQL Editor de Supabase → pegar → Run.
-- No edita las anteriores; agrega una vista. Cambios futuros = 007_*.sql.
--
-- Por qué:
--   v_senal_seleccion (003) acredita la selección por `referente` (la cuenta que posteó). Sirve para
--   el contenido descubierto por referente, pero es CIEGO para el descubierto por keyword/hashtag:
--   ahí el poster suele ser una cuenta de una sola vez que no reaparece → tasa por cuenta = ruido.
--   Con el descubrimiento simétrico (ADR-011/#4) hace falta el segundo eje: acreditar por el
--   keyword/tema que matcheó el candidato, para que el motor aprenda "los videos de #liderazgo se
--   seleccionan seguido → subí #liderazgo".
--
-- Qué agrega:
--   v_senal_tema: tasa de selección agrupada por `metadata->>'tema'` (el keyword matcheado, que el
--   motor escribe en Candidatos.tema → el archivado lo copia a outputs.metadata.tema). El motor la lee
--   (nodo "Leer señal tema") y combina con la señal por referente (max) en el Heat-score.
--   Inerte hasta que haya historial de selección con tema; no cambia el comportamiento hoy.

create view v_senal_tema as
select
  o.metadata->>'tema' as tema,
  count(*) filter (where o.estado in ('aprobado', 'publicado')) as seleccionados,
  count(*)            as calificados,
  round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric
        / count(*), 2) as tasa_seleccion
from outputs o
where o.tipo = 'guion_reel'
  and o.calificado_en is not null
  and coalesce(o.metadata->>'tema', '') <> ''
group by 1;
