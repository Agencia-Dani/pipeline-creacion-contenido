-- 015_salud_referentes_una_fila.sql — `v_salud_referentes` devolvía más filas que referentes.
-- Aplicar DESPUÉS de 014. SQL Editor de Supabase → pegar → Run.
--
-- **Corrección de un bug de la `009`, no una decisión nueva.** Apareció al contar las filas de la
-- vista para verificar la columna `seguidores` de ADR-041: 18 filas para 17 referentes.
--
-- La causa: `v_senal_seleccion` (migración `003`) agrupa por **`(referente, idioma)`**, no por
-- referente. El `left join` de `v_salud_referentes` lo trata como si fuera uno-a-uno, así que
-- **cualquier cuenta que haya publicado en dos idiomas se duplica**. Hoy pasa con `@tori.trades`:
--
--     tori.trades · otro · 0 de 1  →  tasa 0.00
--     tori.trades · en   · 1 de 8  →  tasa 0.13
--
-- Consecuencias que tenía en vivo:
--   · la cuenta aparecía DOS VECES en `/curar/referentes`;
--   · la columna «aprueban» mostraba 0% o 13% según qué fila ganara el join — **no determinista**,
--     y ninguna de las dos es la tasa de la cuenta (la real es 1 de 9 ≈ 11%).
--
-- Es de la misma familia que los hallazgos de D7: no falla, no avisa, y deja un número que se ve
-- razonable y está mal. `esFlojo` usa `tasa_gate` y no esta, así que la sección *A revisar* nunca
-- estuvo contaminada.
--
-- El arreglo colapsa la señal por referente ANTES del join, sumando los conteos y recalculando la
-- tasa desde las sumas. Eso además la vuelve **la tasa que la pantalla dice mostrar**: «qué
-- proporción de sus videos terminan aprobando ustedes», sin cortar por idioma. Es el mismo criterio
-- que se aplicó a la calidad global del cockpit: promediar proporciones de volúmenes distintos da
-- un número creíble y equivocado.
--
-- ⚠️ Cuidado al tocar esta vista: las dos CTEs de `seguidores` que agregó la `014` ya venían con su
-- `distinct on` justamente para no reintroducir este fan-out. Cualquier join nuevo tiene que
-- garantizar UNA fila por referente o la vista vuelve a multiplicar.

create or replace view app.v_salud_referentes as
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
),
-- ⬅️ LO QUE ARREGLA ESTA MIGRACIÓN: una fila por referente, cruzando idiomas.
seleccion as (
  select lower(coalesce(referente, '')) as handle,
         sum(seleccionados) as seleccionados,
         sum(calificados)   as calificados
  from v_senal_seleccion
  group by 1
),
ultimo_visto as (
  select distinct on (lower(replace(c.referente, '@', '')))
         lower(replace(c.referente, '@', '')) as handle,
         c.seguidores
  from app.candidatos c
  where c.referente is not null and c.seguidores is not null
  order by lower(replace(c.referente, '@', '')), c.creado_en desc
),
propuesto as (
  select distinct on (lower(replace(p.handle, '@', '')))
         lower(replace(p.handle, '@', '')) as handle,
         p.seguidores
  from app.referentes_propuestos p
  where p.seguidores is not null
  order by lower(replace(p.handle, '@', '')), p.creado_en desc
)
select
  ref.id,
  ref.handle,
  gate.videos_evaluados,
  case when gate.videos_evaluados > 0
       then round(gate.gate_pass::numeric / gate.videos_evaluados, 2) end as tasa_gate,
  -- La tasa de la CUENTA, no la de un idioma suyo elegido al azar por el join.
  case when sel.calificados > 0
       then round(sel.seleccionados::numeric / sel.calificados, 2) end as tasa_aprobacion,
  coalesce(uv.seguidores, pr.seguidores) as seguidores
from app.referentes ref
left join gate       on gate.handle = lower(replace(ref.handle, '@', ''))
left join seleccion  sel on sel.handle = lower(replace(ref.handle, '@', ''))
left join ultimo_visto uv on uv.handle = lower(replace(ref.handle, '@', ''))
left join propuesto    pr on pr.handle = lower(replace(ref.handle, '@', ''));

-- Verificación (tiene que dar 17 y 17, o sea una fila por referente):
--   select count(*) as filas, count(distinct id) as ids from app.v_salud_referentes;
--   select count(*) from app.referentes;
