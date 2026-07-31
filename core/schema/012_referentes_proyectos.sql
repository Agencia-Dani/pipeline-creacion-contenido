-- 012_referentes_proyectos.sql — un referente alimenta N proyectos (ADR-032).
-- Aplicar DESPUÉS de 011. SQL Editor de Supabase → pegar → Run.
--
-- El bug de modelo que repara: `Referentes.proyecto` de Airtable es un link MÚLTIPLE y el motor
-- lo recorre como lista (`Armar plan de corrida` empuja el handle a los ig_handles/tt_handles de
-- CADA proyecto enlazado). La migración 009 le dio una sola columna `proyecto_id` y el mapeo de
-- sombra la llenó con el primer elemento del array. Medido contra la base viva antes de flipear:
-- 35 pares (referente, proyecto) en Airtable → 16 acá, y el proyecto *Storytelling* se quedaba
-- con CERO referentes (no es proyecto[0] de ninguno de sus 5). El corte 2/4 de D5 lo habría
-- apagado sin un solo error.
--
-- El diff de sombra no podía verlo: compara Airtable-ya-mapeado contra Postgres, y el mapeo
-- truncaba a [0] de los dos lados. Un diff que pasa por el mapper valida el transporte, no el
-- modelo (ADR-032 §Contexto).
--
-- El contrato de la fachada NO cambia: `fields.proyecto` sigue siendo un array de ids, ahora
-- armado desde esta tabla. Sin re-import de workflows (ADR-028 §5, `version` sigue en 1).

create table app.referentes_proyectos (
  referente_id uuid not null references app.referentes (id) on delete cascade,
  proyecto_id  uuid not null references app.proyectos  (id) on delete cascade,
  primary key (referente_id, proyecto_id)
);

-- Buscar "qué referentes alimentan este proyecto" es la consulta de la pantalla del banco y del
-- plan de corrida; la PK solo cubre el sentido inverso.
create index referentes_proyectos_proyecto_idx on app.referentes_proyectos (proyecto_id);

-- Backfill de lo que había, para que la tabla nunca exista vacía: son los 16 pares truncados.
-- Los 35 reales los repone el `sombra:import` con el mapeo nuevo, que corre antes del flip.
-- Sin esto, aplicar la migración y no correr el import dejaría al motor sin referentes.
insert into app.referentes_proyectos (referente_id, proyecto_id)
select id, proyecto_id from app.referentes where proyecto_id is not null
on conflict do nothing;

-- Un vínculo, un dueño (ADR-027): dejar la columna vieja garantiza que diverja en la primera
-- edición desde la pantalla.
alter table app.referentes drop column proyecto_id;

-- Mismo patrón que el resto del schema `app`: RLS activado SIN policies. Por REST solo entra el
-- service_role del BFF; la escritura pasa por Server Actions, no por el browser.
-- (Los grants no hacen falta: 011 dejó `alter default privileges` para las tablas nuevas.)
alter table app.referentes_proyectos enable row level security;
