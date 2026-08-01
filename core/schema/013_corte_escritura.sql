-- 013_corte_escritura.sql — lo que el schema necesita para D7 (ADR-035, ADR-036).
-- Aplicar DESPUÉS de 012. SQL Editor de Supabase → pegar → Run.
--
-- D7 saca a Airtable del sistema: el motor y el descubrimiento pasan a escribir acá por PostgREST
-- (ADR-035) y el archivado deja de escribir Métricas y salud de referentes. Esta migración repara
-- lo que el schema `009` modeló mal o dejó afuera, y crea las dos vistas que reemplazan a lo último
-- que quedaba en las tablas de Métricas.
--
-- Los tres huecos que se taparon acá salieron de aplicar UNA pregunta al dato vivo, y es la regla
-- que este corte le deja a los que vengan: **¿qué campos no los escribía nadie, porque Airtable los
-- calculaba solo?** Los `createdTime`, `lastModified` y las columnas-fórmula no tienen autor: al
-- migrar se vuelven NULL en silencio y se llevan puesto lo que dependía de ellos.

-- ─────────────────── 1. `external_id`: el dedup pasa de procedural a estructural ───────────────────
-- El motor lo escribe en el feed desde ADR-029 como TERCERA línea de defensa contra duplicados
-- ("la última si processed_items se borró a mano"), y `Leer feed vivo` lo lee de vuelta. El 009 no
-- le dio columna, así que el import de sombra lo viene tirando hace semanas y nadie lo notó.
--
-- El `unique` es seguro y es lo que ADR-029 dejó diferido ("el día que el cockpit propio sea el
-- feed, el unique migra con él"): ADR-018 garantiza UNA copia por video —`Armar candidato` dedupea
-- el fan-out a la salida, el video se lo lleva el proyecto que mejor lo juzgó— y `outputs` ya tiene
-- su propio UNIQUE(external_id) desde la 005. Los items sin id se conservan (ADR-018 §3): en
-- Postgres, varios NULL no colisionan.
--
-- Ojo: esto NO reemplaza a `Leer feed vivo`. El constraint atrapa el duplicado DESPUÉS de haber
-- pagado la transcripción; el nodo lo mata antes (es lo que bajó la corrida del 31/07 de 31 a
-- 9,4 min). Las dos defensas conviven: una es económica, la otra es estructural.
alter table app.candidatos add column external_id text;
create unique index candidatos_external_id_key on app.candidatos (external_id);

-- ─────────────────── 2. Las propuestas son N:M (enmienda de ADR-032) ───────────────────
-- Misma clase de bug que reparó la 012, medido igual y peor: las 8 propuestas vivas tienen
-- EXACTAMENTE 2 proyectos cada una, y el 009 les dio un `proyecto_id` simple ⇒ el corte tiraba
-- 8 de 16 pares, o sea el 100% de las propuestas perdía la mitad de su atribución.
--
-- Tiene sentido a posteriori: una propuesta HEREDA los proyectos del referente-semilla que la trajo
-- (ADR-020), y los referentes son N:M desde ADR-032. Modelarla 1:1 contradecía a su propia fuente.
create table app.referentes_propuestos_proyectos (
  propuesto_id uuid not null references app.referentes_propuestos (id) on delete cascade,
  proyecto_id  uuid not null references app.proyectos             (id) on delete cascade,
  primary key (propuesto_id, proyecto_id)
);

create index referentes_propuestos_proyectos_proyecto_idx
  on app.referentes_propuestos_proyectos (proyecto_id);

-- Backfill de lo truncado, para que la tabla no exista vacía. Los pares reales los repone el script
-- de corte, que corre antes del flip.
insert into app.referentes_propuestos_proyectos (propuesto_id, proyecto_id)
select id, proyecto_id from app.referentes_propuestos where proyecto_id is not null
on conflict do nothing;

-- Un vínculo, un dueño (ADR-027): dejar la columna vieja garantiza divergencia.
alter table app.referentes_propuestos drop column proyecto_id;

alter table app.referentes_propuestos_proyectos enable row level security;

-- ─────────────────── 3. `falsos_negativos` vuelve a existir, como vista (ADR-036) ───────────────────
-- D7 mata las tablas de Métricas (ADR-027), y `v_embudo_semana` NO tiene `falsos_negativos` — no
-- puede: esa vista suma `runs.metricas`, y este número no sale de una corrida sino de contar filas
-- que el equipo audita a mano, días después. Sin esto, D7 mataba el contador por segunda vez (la
-- primera fue el `veredicto` de solo-lectura de Airtable), y "0 falsos negativos" se lee como "el
-- gate está perfecto", que es la conclusión opuesta a la verdad.
--
-- Por eso `app.descartes` deja de barrerse (ADR-036): esta vista necesita la fuente viva. `auditados`
-- viaja al lado a propósito — un `falsos_negativos` bajo con `auditados` bajo no dice nada del gate,
-- dice que nadie auditó.
create view app.v_auditoria_descartes as
select
  date_trunc('week', creado_en)::date                      as semana,
  count(*)                                                 as expuestos,
  count(*) filter (where veredicto is not null)            as auditados,
  count(*) filter (where veredicto = 'era bueno')          as falsos_negativos
from app.descartes
group by 1;

-- ─────────────────── 4. El embudo del descubrimiento (reemplaza la fila DESCUBRIMIENTO) ───────────────────
-- `v_embudo_semana` filtra `workflow = 'motor'`, así que la fila DESCUBRIMIENTO de `Métricas Global`
-- se quedaba sin reemplazo: los COSTOS del descubrimiento sí los cubre `v_costos_semana`, el EMBUDO
-- no. Es la única medida de si el buscador de cuentas sirve, y el dato ya está en `runs.metricas`.
create view app.v_embudo_descubrimiento as
select
  date_trunc('week', r.inicio)::date                          as semana,
  count(*) filter (where r.estado = 'ok')                     as runs_ok,
  count(*) filter (where r.estado in ('fallo', 'parcial'))     as runs_fallo,
  sum((r.metricas->>'semillas')::int)                         as semillas,
  sum((r.metricas->>'sugeridos_unicos')::int)                 as sugeridos_unicos,
  sum((r.metricas->>'propuestos')::int)                       as propuestos,
  sum((r.metricas->>'promovidos')::int)                       as promovidos
from runs r
where r.params->>'workflow' = 'descubrimiento'
group by 1;

-- ─────────────────── 5. Limpieza: las 2 columnas que D7 vuelve imposibles de llenar ───────────────────
-- `output_id` documentaba "la costura con el histórico" y nunca se implementó (nadie la escribe,
-- nadie la lee). Con D7 deja de tener sentido incluso en teoría: el candidato se BORRA al archivarse
-- —su historia queda entera en `outputs`, que es el histórico canónico de ADR-014— así que jamás
-- existiría una fila con este campo lleno.
alter table app.candidatos drop column output_id;

-- `airtable_id` de ajustes es vestigio del corte 1/4: la tabla salió del catálogo de sombra ese día
-- y el contrato viaja por `clave`, no por id (run-plan.md: "el id de ajustes es opaco").
alter table app.ajustes drop column airtable_id;
