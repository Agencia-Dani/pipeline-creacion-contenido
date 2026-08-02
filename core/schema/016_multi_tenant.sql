-- 016_multi_tenant.sql — la fundación de datos del refactor multi-tenant (Fase 1).
-- Gobernada por ADR-046 (el cockpit es multi-tenant, doble grano, `clients.parent_id`),
-- ADR-047 (Capa 1 ahora, RLS después) y ADR-049 (un pipeline, sus tablas).
-- Plan: docs/agents/plan-multi-tenant.md §4. Aplicar DESPUÉS de 015, a mano en el SQL Editor.
--
-- ⚠️ SON DOS CORRIDAS, Y LA SEGUNDA NO ES OPCIONAL.
--   · Este archivo (§0–§7) se corre AHORA. No rompe nada de lo que hoy funciona.
--   · `017_multi_tenant_cierre.sql` se corre DESPUÉS del re-import de la Fase 4, y es el que
--     endurece: pone los `not null`, mata los defaults puente y mata el dedup global.
--   Correr solo este archivo deja el sistema funcionando pero **sin aislamiento real**: los
--   defaults atribuyen todo al tenant piloto y el unique viejo sigue deduplicando global.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- El orden de esta migración es la mitad de su valor. Tres reglas, y las tres se descubrieron
-- mirando quién escribe cada tabla, no leyendo el schema:
--
--   1. **Las columnas nacen nullable → backfill → recién ahí `not null`.** Al revés falla sobre
--      datos vivos. (Es la única de las tres que el plan ya traía.)
--
--   2. **Toda columna de tenant nace con un DEFAULT puente al piloto.** No es cosmético: entre
--      esta migración (Fase 1) y la Capa 1 (Fase 2) / el re-import (Fase 4) hay una ventana en la
--      que el BFF y n8n siguen insertando SIN mandar el tenant. Sin default esas filas nacen con
--      `client_id`/`instance_id` en null, y en cuanto la Fase 2 empiece a filtrar **desaparecen
--      de las pantallas** — un candidato que se pagó y no se ve. El default es un puente con
--      fecha de vencimiento, y la fecha es la `017`.
--
--   3. **Un `unique` que n8n nombra en un `on_conflict=` NO se puede reemplazar hoy.** PostgREST
--      exige que el arbiter del upsert coincida con un unique existente; si no, tira `42P10` y el
--      insert muere entero. Son exactamente dos:
--        · `processed_items?on_conflict=platform,external_id`  (motor, ANTES de transcribir)
--        · `outputs?on_conflict=external_id`                   (archivado, al entregar)
--      Los dos se hacen por expand/contract —se AGREGA el unique nuevo acá, el viejo muere en la
--      `017` después del re-import—, que es el mismo patrón con el que D7 flipeó los ids.
--      El de `app.candidatos` sí se reemplaza hoy: nadie lo nombra en un `on_conflict`, y el
--      cambio solo AFLOJA (de global a por-instancia), así que no puede romper un insert.
--
-- ⚠️ Y una corrección al SQL del plan §4.3, que si se copiaba tal cual rompía el archivado:
-- el índice nuevo de `outputs` **no lleva `where external_id is not null`**. La `005` sacó ese
-- predicado justamente porque Postgres no acepta un índice parcial como arbiter de ON CONFLICT
-- sin repetir el predicado, y PostgREST no lo emite (verificado en vivo: `42P10`).
-- ─────────────────────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════ §0 · Guardas — fallar temprano, no a mitad ═══════════════════════
-- Las tres cosas que, si no se cumplen, dejan la migración a mitad de camino sobre datos vivos.
-- Si alguna aborta: se resuelve y se vuelve a correr el archivo entero (todo lo de acá es
-- idempotente-por-fallo — nada se aplicó todavía).

-- `if not exists` + `delete` porque el SQL Editor puede reusar la conexión: si abortaste una vez,
-- la temp table sigue viva en tu sesión y el segundo intento moriría acá, que sería el peor lugar.
create temporary table if not exists _mt_piloto (cliente text, instancia uuid);
delete from _mt_piloto;

do $guardas$
declare
  n_clientes   int;
  n_instancias int;
  duplicados   text;
begin
  -- (a) ¿Están las 15 anteriores? `app.transcripciones` es de la 010 y `..._propuestos_proyectos`
  --     de la 013: si faltan, esta migración escribe sobre un schema que no es el que asume.
  if to_regclass('app.transcripciones') is null
     or to_regclass('app.referentes_propuestos_proyectos') is null then
    raise exception
      '016: falta aplicar alguna de las migraciones 001-015. Corré las que falten, en orden, antes de esta.';
  end if;

  -- (b) 🧹 El dato sucio que hay que limpiar ANTES, no después: `@casper_smc` está dos veces en
  --     `app.referentes`, con dos ids y la misma plataforma. Cuando la `017` ponga `client_id`
  --     not null, esa fila duplicada queda congelada en el modelo nuevo.
  --     ⚠️ Mirá qué PROYECTOS cuelga de cada una antes de borrar (`app.referentes_proyectos`):
  --     si difieren, borrar la equivocada le saca fuentes a un proyecto. Se puede hacer desde el
  --     cockpit, sin SQL (ADR-045: los referentes salen siempre).
  select string_agg(muestra, ', ') into duplicados
  from (
    select min(handle) as muestra
    from app.referentes
    group by lower(replace(handle, '@', '')), plataforma
    having count(*) > 1
  ) d;

  if duplicados is not null then
    raise exception
      '016: hay referentes duplicados por (handle, plataforma): %. Limpialos primero (cockpit o SQL) y volvé a correr.',
      duplicados;
  end if;

  -- (c) Resolver el tenant piloto sin escribir un id en el repo (convención de CLAUDE.md).
  --     Si esto aborta porque hay más de una instancia, es una decisión humana: mirá cuál es la
  --     que corre hoy y hacé, en su lugar:
  --       insert into _mt_piloto values ('<slug del cliente>', '<uuid de la instancia>');
  --     …y volvé a correr desde §1 (saltando este bloque).
  select count(*) into n_clientes   from clients;
  select count(*) into n_instancias from instances;

  if n_clientes <> 1 or n_instancias <> 1 then
    raise exception
      '016: se esperaba exactamente 1 cliente y 1 instancia (hay % y %). Fijá el piloto a mano — ver el comentario de acá arriba.',
      n_clientes, n_instancias;
  end if;

  insert into _mt_piloto (cliente, instancia)
  select (select id from clients), (select id from instances);
end
$guardas$;


-- ═══════════════════ §1 · El árbol de clientes y la identidad de instancia ═══════════════════

-- Un nivel hoy (30x, estadox, retia sin padre), dos cuando Retia traiga los suyos: el segundo
-- nivel es UNA FILA, no una migración (ADR-046, decisión B).
alter table clients add column parent_id text references clients (id);
create index clients_parent_idx on clients (parent_id);

-- ⚠️ `parent_id` habilita ciclos y un `check` NO alcanza: Postgres no valida recursión en un
-- check. Cinturón y tirantes (ADR-046): el trigger rechaza el ciclo al escribir, y el recorrido
-- de `domain/tenant.ts` lleva su propio tope de profundidad. Un ciclo no da un dato feo: cuelga
-- la resolución de visibilidad EN CADA REQUEST.
create or replace function app.clients_sin_ciclos() returns trigger as $ciclos$
declare
  actual text := new.parent_id;
  saltos int  := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'clients: "%" no puede ser su propio padre', new.id;
  end if;

  while actual is not null loop
    saltos := saltos + 1;
    if saltos > 10 then
      raise exception
        'clients: el árbol pasa de 10 niveles desde "%" — o hay un ciclo o el modelo se fue de las manos', new.id;
    end if;
    if actual = new.id then
      raise exception 'clients: "%" → "%" cierra un ciclo', new.id, new.parent_id;
    end if;
    select parent_id into actual from clients where id = actual;
  end loop;

  return new;
end
$ciclos$ language plpgsql;

create trigger clients_sin_ciclos
  before insert or update of parent_id on clients
  for each row execute function app.clients_sin_ciclos();

-- Identidad legible de la instancia: hoy no tiene nombre, y con N instancias por cliente hace
-- falta para la URL (`/30x/reels/...`, Fase 3) y para el selector del cockpit.
alter table instances add column slug   text;
alter table instances add column nombre text;

-- El unique viejo impide que UNA empresa tenga DOS instancias del mismo pipeline (30x con dos
-- máquinas de LinkedIn). Es un techo de producto, no una garantía (plan §1.3).
-- Se puede reemplazar hoy: nadie lo nombra en un `on_conflict`.
update instances set slug   = coalesce(slug, workflow_id) where slug is null;
update instances set nombre = coalesce(nombre, workflow_id) where nombre is null;
alter table instances alter column slug set not null;

alter table instances drop constraint instances_workflow_id_client_id_key;
alter table instances add  constraint instances_identidad_key
  unique (workflow_id, client_id, slug);


-- ═════════════ §2 · Las columnas de tenant (nullables + default puente, regla 2) ═════════════

-- Grano EMPRESA — cruzan pipelines: la voz y el banco de referentes son los mismos para reels y
-- para LinkedIn, y scoparlos por pipeline los duplicaría (ADR-046, decisión B).
alter table app.usuarios   add column client_id text references clients (id);
alter table app.voces      add column client_id text references clients (id);
alter table app.proyectos  add column client_id text references clients (id);
alter table app.referentes add column client_id text references clients (id);

-- Grano INSTANCIA — son de un pipeline concreto: los knobs de reels no son los de LinkedIn.
alter table app.ajustes               add column instance_id uuid references instances (id);
alter table app.candidatos            add column instance_id uuid references instances (id);
alter table app.descartes             add column instance_id uuid references instances (id);
alter table app.referentes_propuestos add column instance_id uuid references instances (id);
alter table app.eventos               add column instance_id uuid references instances (id);

-- ⚠️ `app.transcripciones` NO está en la lista del plan §4.2, y tiene que estar. Es la zona
-- Transcribir (ADR-031): un pipeline concreto, y encima trae un SEXTO unique global —
-- `unique (plataforma, external_id)`— de la misma familia que los cinco que el plan encontró.
-- La regla de grano de ADR-046 la cubre sin ambigüedad; lo que faltó fue el inventario.
alter table app.transcripciones add column instance_id uuid references instances (id);

-- `outputs` denormaliza la instancia. Además de scopear, saca a `v_outputs_recientes` de tener
-- que juntar 4 tablas solo para saber de quién es una fila.
alter table outputs add column instance_id uuid references instances (id);

-- 🚫 Lo que NO lleva columna, a propósito:
--   · `app.referentes_proyectos` y `app.referentes_propuestos_proyectos`: join tables, heredan
--     por FK con `on delete cascade` (012, 013).
--   · `app.tarifas`: es lo que nos COBRA el proveedor (USD por video transcrito), no un dato de
--     la empresa. Es global y tiene que seguir siéndolo — si algún día una empresa negocia su
--     propia tarifa, eso es otra decisión, no una columna suelta.
--   · `runs`, `processed_items`: ya tienen `instance_id` desde ADR-003.

-- Los defaults puente (regla 2). Se ponen por SQL dinámico para no escribir un id en el repo.
-- 💀 Mueren en la `017`. Mientras vivan, "me olvidé el tenant" escribe al piloto en vez de
--    fallar — es seguro SOLO porque hasta la Fase 4 hay un tenant y uno solo.
do $puentes$
declare
  c text;
  i uuid;
begin
  select cliente, instancia into c, i from _mt_piloto;

  execute format('alter table app.usuarios   alter column client_id   set default %L', c);
  execute format('alter table app.voces      alter column client_id   set default %L', c);
  execute format('alter table app.proyectos  alter column client_id   set default %L', c);
  execute format('alter table app.referentes alter column client_id   set default %L', c);

  execute format('alter table app.ajustes               alter column instance_id set default %L::uuid', i);
  execute format('alter table app.candidatos            alter column instance_id set default %L::uuid', i);
  execute format('alter table app.descartes             alter column instance_id set default %L::uuid', i);
  execute format('alter table app.referentes_propuestos alter column instance_id set default %L::uuid', i);
  execute format('alter table app.eventos               alter column instance_id set default %L::uuid', i);
  execute format('alter table app.transcripciones       alter column instance_id set default %L::uuid', i);
end
$puentes$;

-- `outputs` no lleva default: lo DERIVA de su corrida, que es el dato exacto en vez de una
-- suposición. Mismo principio que ADR-041 (los seguidores se derivan, no se copian) y de paso
-- evita sumarle un séptimo ítem al checklist del re-import — el archivado sigue insertando igual.
create or replace function app.outputs_hereda_instancia() returns trigger as $hereda$
begin
  if new.instance_id is null then
    select r.instance_id into new.instance_id from runs r where r.id = new.run_id;
  end if;
  return new;
end
$hereda$ language plpgsql;

create trigger outputs_hereda_instancia
  before insert on outputs
  for each row execute function app.outputs_hereda_instancia();


-- ═══════════════════════════════ §3 · Backfill ═══════════════════════════════
-- Todas las filas vivas son del tenant piloto. Lo que se puede DERIVAR se deriva; el resto se
-- atribuye al piloto, que hoy es verdad por construcción (hay un solo cliente).

update app.usuarios   set client_id = (select cliente from _mt_piloto) where client_id is null;
update app.voces      set client_id = (select cliente from _mt_piloto) where client_id is null;
update app.proyectos  set client_id = (select cliente from _mt_piloto) where client_id is null;
update app.referentes set client_id = (select cliente from _mt_piloto) where client_id is null;

update app.ajustes               set instance_id = (select instancia from _mt_piloto) where instance_id is null;
update app.candidatos            set instance_id = (select instancia from _mt_piloto) where instance_id is null;
update app.descartes             set instance_id = (select instancia from _mt_piloto) where instance_id is null;
update app.referentes_propuestos set instance_id = (select instancia from _mt_piloto) where instance_id is null;
update app.eventos               set instance_id = (select instancia from _mt_piloto) where instance_id is null;
update app.transcripciones       set instance_id = (select instancia from _mt_piloto) where instance_id is null;

-- `outputs`: derivado de la corrida que lo produjo. Exacto, no atribuido.
update outputs o set instance_id = r.instance_id
from runs r where r.id = o.run_id and o.instance_id is null;

-- `processed_items`: primero por su corrida (exacto), y recién lo que quede huérfano al piloto.
-- Las filas viejas pueden tener `run_id` null: el dedup se pobló antes de que el motor reportara.
update processed_items p set instance_id = r.instance_id
from runs r where r.id = p.run_id and p.instance_id is null;

update processed_items set instance_id = (select instancia from _mt_piloto) where instance_id is null;


-- ══════════════ §4 · `not null` — solo lo que ya nadie puede romper hoy ══════════════
-- El resto espera a la `017`. El criterio no es de gusto: acá van las columnas cuyos escritores
-- YA mandan el tenant (o lo derivan), así que endurecerlas no puede tumbar un insert vivo.

--   · `processed_items.instance_id`: el motor ya lo manda (`<<INSTANCE_ID>>`, ingesta-registro).
--     ⚠️ Con un matiz que conviene saber: `Preparar procesados` manda `instance_id: null` a
--     propósito si el placeholder quedó sin rellenar (`indexOf('<<') < 0 ? … : null`). O sea que
--     desde acá, un re-import que se olvide de `<<INSTANCE_ID>>` **falla al escribir el dedup**
--     en vez de guardar filas sin dueño. Es más ruidoso y es mejor: esa corrida ya venía rota
--     igual (`Abrir run en el registro` postea el placeholder crudo como uuid y revienta antes).
--   · `outputs.instance_id`: lo pone el trigger de §2 antes de que se evalúe el constraint.
alter table processed_items alter column instance_id set not null;
alter table outputs         alter column instance_id set not null;

-- `app.ajustes` pasa a PK compuesta: hoy `clave` es primary key, o sea UNA SOLA FILA POR KNOB
-- PARA TODO EL SISTEMA — las 18 perillas compartidas entre empresas (plan §1.3). Una PK implica
-- not null, y se puede hacer ya porque a `ajustes` la escribe solo el BFF (n8n la LEE por la
-- fachada, ADR-028). El check del AJUSTE_MAP se conserva tal cual.
alter table app.ajustes alter column instance_id set not null;
alter table app.ajustes drop constraint ajustes_pkey;
alter table app.ajustes add  constraint ajustes_pkey primary key (instance_id, clave);


-- ════════════════ §5 · Los uniques globales (los que se pueden tocar hoy) ════════════════

-- ── El feed: reemplazo directo. Nadie lo nombra en un `on_conflict` y el cambio AFLOJA.
drop index app.candidatos_external_id_key;
create unique index candidatos_external_id_key on app.candidatos (instance_id, external_id);

-- ── El dedup, que es la reparación que más importa y la que menos se ve: EXPAND (regla 3).
-- 🩸 Hoy `unique (platform, external_id)` es GLOBAL: si dos empresas vigilan un referente en
-- común, la primera que procese un video se lo bloquea a la otra PARA SIEMPRE (ADR-030: vuelve
-- con transcript vacío → descartado `sin_guion` → ya está en la memoria de dedup, no se
-- reintenta). El síntoma no es un error: es "el motor no trae contenido".
-- Acá se AGREGA el unique por instancia; el global muere en la `017`, después del re-import que
-- cambia el `on_conflict` del motor. Con un solo tenant los dos dicen lo mismo.
create unique index processed_items_dedup_key
  on processed_items (instance_id, platform, external_id);
create index processed_items_lookup_instancia
  on processed_items (instance_id, platform, external_id);

-- ── `outputs`: EXPAND también (el archivado sube con `on_conflict=external_id`).
-- Sin `where external_id is not null` — ver la corrección al plan en la cabecera.
create unique index outputs_instancia_external_id_key on outputs (instance_id, external_id);
create index outputs_instance_idx on outputs (instance_id);

-- ── `app.transcripciones`: el sexto unique global, mismo tratamiento que el feed (lo escribe
--    solo el BFF, así que se puede reemplazar hoy).
alter table app.transcripciones drop constraint transcripciones_plataforma_external_id_key;
alter table app.transcripciones add  constraint transcripciones_identidad_key
  unique (instance_id, plataforma, external_id);


-- ═══════════════════════ §6 · Índices de acceso ═══════════════════════
-- Los que sostienen el rendimiento cuando el feed crece POR TENANT. `candidatos_estado_idx` (009)
-- y `descartes` sin índice quedan cortos en cuanto la primera columna del filtro es la instancia.

create index candidatos_instancia_estado_idx on app.candidatos            (instance_id, estado);
create index descartes_instancia_idx         on app.descartes             (instance_id, creado_en desc);
create index eventos_instancia_idx           on app.eventos               (instance_id, creado_en desc);
create index propuestos_instancia_idx        on app.referentes_propuestos (instance_id, estado);
create index proyectos_cliente_idx           on app.proyectos             (client_id);
create index referentes_cliente_idx          on app.referentes            (client_id);
create index voces_cliente_idx               on app.voces                 (client_id);
create index usuarios_cliente_idx            on app.usuarios              (client_id);


-- ═════════════════ §7 · Las vistas: exponen el eje, NO filtran adentro ═════════════════
-- Criterio de ADR-047: la vista expone la columna de scoping y el filtro lo pone `lib/`. Filtrar
-- adentro las volvería single-tenant otra vez y dejaría a las policies de la Capa 2 sin nada
-- sobre qué actuar.
--
-- Todas van con `create or replace` y la columna nueva AL FINAL — es lo único que Postgres
-- permite replaceando, y así nada que las lea se entera (mismo truco que la 014).
-- El plan §4.4 listaba 8; son 12. Las 4 que faltaban: `v_embudo_descubrimiento`,
-- `v_historico_seleccionados`, `v_selecciones_por_dia`, `v_senal_tema`. Y `v_falsos_negativos`
-- no existe con ese nombre: es `app.v_auditoria_descartes` (ADR-036, migración 013).

-- ── public: las que cuelgan de `outputs` ──────────────────────────────────────────────────

create or replace view v_outputs_recientes as
select o.creado_en, c.id as cliente, w.id as workflow, o.tipo, o.titulo, o.estado,
       o.contenido_o_link, r.trigger_type, r.inicio as corrida_inicio, r.costo_estimado,
       o.metadata,
       o.instance_id
from outputs o
join runs      r on r.id = o.run_id
join instances i on i.id = r.instance_id
join workflows w on w.id = i.workflow_id
join clients   c on c.id = i.client_id
order by o.creado_en desc;

create or replace view v_corpus_aprobados as
select o.id, o.metadata->>'voz' as voz, o.titulo, o.contenido_o_link as guion,
       o.metadata->>'proyecto' as proyecto, o.publicado_en, o.creado_en,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.estado in ('aprobado', 'publicado')
order by o.creado_en desc;

create or replace view v_historico_seleccionados as
select o.calificado_en, o.metadata->>'proyecto' as proyecto, o.metadata->>'voz' as voz, o.titulo,
       o.metadata->>'url_referente' as url_original, o.contenido_o_link as script,
       o.metadata->>'idioma' as idioma,
       (o.metadata->>'views')::bigint as views, (o.metadata->>'likes')::bigint as likes,
       (o.metadata->>'seguidores')::bigint as seguidores,
       (o.metadata->>'heat_score')::numeric as heat_score,
       o.metadata->>'calificacion' as calificacion, o.estado,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.calificado_en is not null
order by o.calificado_en desc;

create or replace view v_selecciones_por_dia as
select date(o.calificado_en) as dia, o.metadata->>'voz' as voz, o.estado, count(*) as videos,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.calificado_en is not null
group by 1, 2, 3, o.instance_id
order by dia desc;

-- ⚠️ `v_senal_seleccion` es la ÚNICA vista que leen los workflows —
--     `v_senal_seleccion?select=referente,idioma,tasa_seleccion` (motor) y
--     `?select=referente,tasa_seleccion,calificados` (descubrimiento)—, así que agruparla también
--     por instancia le agrega FILAS, no columnas. Con un tenant es idéntica; con dos, cada
--     workflow tiene que filtrar por la suya o el heat-score aprende del vecino.
--     👉 Va al checklist de la Fase 4: los dos GET necesitan `&instance_id=eq.<uuid>`.
create or replace view v_senal_seleccion as
select o.metadata->>'referente' as referente, o.metadata->>'idioma' as idioma,
       count(*) filter (where o.estado in ('aprobado', 'publicado')) as seleccionados,
       count(*) as calificados,
       round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric / count(*), 2) as tasa_seleccion,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.calificado_en is not null
group by 1, 2, o.instance_id;

create or replace view v_senal_tema as
select o.metadata->>'tema' as tema,
       count(*) filter (where o.estado in ('aprobado', 'publicado')) as seleccionados,
       count(*) as calificados,
       round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric / count(*), 2) as tasa_seleccion,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.calificado_en is not null
  and coalesce(o.metadata->>'tema', '') <> ''
group by 1, o.instance_id;

-- ── app: las analíticas ───────────────────────────────────────────────────────────────────

create or replace view app.v_metricas_calidad as
select date_trunc('week', o.calificado_en)::date as semana, o.metadata->>'proyecto' as proyecto,
       count(*) as calificados,
       count(*) filter (where o.estado in ('aprobado', 'publicado')) as aprobados,
       count(*) filter (where o.estado = 'descartado') as descartados,
       round(count(*) filter (where o.estado in ('aprobado', 'publicado'))::numeric / count(*), 2) as "precision",
       round(avg((o.metadata->>'relevancia_score')::numeric) filter (where o.estado in ('aprobado', 'publicado')), 2) as score_aprobados,
       round(avg((o.metadata->>'relevancia_score')::numeric) filter (where o.estado = 'descartado'), 2) as score_descartados,
       round(avg((o.metadata->>'relevancia_score')::numeric) filter (where o.estado in ('aprobado', 'publicado'))
           - avg((o.metadata->>'relevancia_score')::numeric) filter (where o.estado = 'descartado'), 2) as separacion_gate,
       o.instance_id
from outputs o
where o.tipo = 'guion_reel' and o.calificado_en is not null
group by 1, 2, o.instance_id;

create or replace view app.v_embudo_semana as
select date_trunc('week', r.inicio)::date as semana,
       count(*) filter (where r.estado = 'ok') as runs_ok,
       count(*) filter (where r.estado in ('fallo', 'parcial')) as runs_fallo,
       sum((r.metricas->>'colectados')::int) as colectados,
       sum((r.metricas->>'asignados')::int)  as asignados,
       sum((r.metricas->>'pretrim')::int)    as pretrim,
       sum((r.metricas->>'filtrados')::int)  as filtrados,
       sum((r.metricas->>'gate')::int)       as gate_pass,
       sum((r.metricas->>'outputs')::int)    as entregados,
       sum((r.metricas->>'sin_guion')::int)  as sin_guion,
       sum((r.metricas->>'descartes_expuestos')::int) as descartes_expuestos,
       round(sum(extract(epoch from (r.fin - r.inicio)) / 60)::numeric, 0) as duracion_min,
       r.instance_id
from runs r
where r.params->>'workflow' = 'motor'
group by 1, r.instance_id;

create or replace view app.v_embudo_descubrimiento as
select date_trunc('week', r.inicio)::date as semana,
       count(*) filter (where r.estado = 'ok') as runs_ok,
       count(*) filter (where r.estado in ('fallo', 'parcial')) as runs_fallo,
       sum((r.metricas->>'semillas')::int)          as semillas,
       sum((r.metricas->>'sugeridos_unicos')::int)  as sugeridos_unicos,
       sum((r.metricas->>'propuestos')::int)        as propuestos,
       sum((r.metricas->>'promovidos')::int)        as promovidos,
       r.instance_id
from runs r
where r.params->>'workflow' = 'descubrimiento'
group by 1, r.instance_id;

create or replace view app.v_costos_semana as
with uso as (
  select date_trunc('week', r.inicio)::date as semana, r.instance_id, s.servicio, s.unidades
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
  select date_trunc('week', r.inicio)::date, r.instance_id, s.servicio, s.unidades
  from runs r
  cross join lateral (values
    ('perfiles_semilla',  (r.metricas->>'perfiles_semilla')::numeric),
    ('detalle_sugeridos', (r.metricas->>'detalle_sugeridos')::numeric),
    ('lookalikes_tt',     (r.metricas->>'lookalikes_tt')::numeric)
  ) as s (servicio, unidades)
  where r.params->>'workflow' = 'descubrimiento'
)
select u.semana, u.servicio, t.unidad,
       sum(u.unidades)::numeric as unidades,
       round(sum(u.unidades) * t.usd_por_unidad, 2) as costo_usd,
       u.instance_id
from uso u
join app.tarifas t on t.servicio = u.servicio
where u.unidades is not null and u.unidades > 0
group by u.semana, u.servicio, t.unidad, t.usd_por_unidad, u.instance_id;

create or replace view app.v_auditoria_descartes as
select date_trunc('week', creado_en)::date as semana,
       count(*) as expuestos,
       count(*) filter (where veredicto is not null) as auditados,
       count(*) filter (where veredicto = 'era bueno') as falsos_negativos,
       instance_id
from app.descartes
group by 1, instance_id;

-- ── `v_salud_referentes`: la delicada ─────────────────────────────────────────────────────
-- ⚠️ Regla heredada de la `015`, y es la que gobierna este bloque: **todo join nuevo tiene que
-- garantizar UNA fila por referente.** Agregar el eje de tenant es exactamente el tipo de cambio
-- que reintroduce el fan-out que la `015` arregló (18 filas para 17 referentes), y el síntoma
-- sería otra vez una tasa que se ve razonable y está mal.
--
-- El referente es de la EMPRESA (grano `client_id`), pero todo lo que se deriva de él —el gate,
-- la selección, los seguidores— vive en tablas de grano INSTANCIA. Así que cada CTE sube de
-- instancia a cliente y se agrupa por `(client_id, handle)`, y el join va por las dos columnas:
-- una fila por referente, sin mezclar empresas. La alternativa —una fila por (referente ×
-- instancia)— era justamente el fan-out prohibido.
create or replace view app.v_salud_referentes as
with instancia_cliente as (
  select i.id as instance_id, i.client_id from instances i
),
semana as (
  select ic.client_id,
         (jsonb_each(r.metricas->'por_referente')).key   as handle,
         (jsonb_each(r.metricas->'por_referente')).value as conteos
  from runs r
  join instancia_cliente ic on ic.instance_id = r.instance_id
  where r.params->>'workflow' = 'motor'
    and r.inicio >= now() - interval '7 days'
),
gate as (
  select client_id, lower(handle) as handle,
         sum((conteos->>'evaluados')::int) as videos_evaluados,
         sum((conteos->>'gate_pass')::int) as gate_pass
  from semana group by 1, 2
),
-- Colapsa la señal por referente cruzando IDIOMAS (lo que arregló la `015`) y ahora también
-- cruzando las instancias del mismo cliente — pero nunca cruzando clientes.
seleccion as (
  select ic.client_id, lower(coalesce(s.referente, '')) as handle,
         sum(s.seleccionados) as seleccionados,
         sum(s.calificados)   as calificados
  from v_senal_seleccion s
  join instancia_cliente ic on ic.instance_id = s.instance_id
  group by 1, 2
),
ultimo_visto as (
  select distinct on (ic.client_id, lower(replace(c.referente, '@', '')))
         ic.client_id, lower(replace(c.referente, '@', '')) as handle, c.seguidores
  from app.candidatos c
  join instancia_cliente ic on ic.instance_id = c.instance_id
  where c.referente is not null and c.seguidores is not null
  order by ic.client_id, lower(replace(c.referente, '@', '')), c.creado_en desc
),
propuesto as (
  select distinct on (ic.client_id, lower(replace(p.handle, '@', '')))
         ic.client_id, lower(replace(p.handle, '@', '')) as handle, p.seguidores
  from app.referentes_propuestos p
  join instancia_cliente ic on ic.instance_id = p.instance_id
  where p.seguidores is not null
  order by ic.client_id, lower(replace(p.handle, '@', '')), p.creado_en desc
)
select
  ref.id,
  ref.handle,
  gate.videos_evaluados,
  case when gate.videos_evaluados > 0
       then round(gate.gate_pass::numeric / gate.videos_evaluados, 2) end as tasa_gate,
  case when sel.calificados > 0
       then round(sel.seleccionados::numeric / sel.calificados, 2) end as tasa_aprobacion,
  coalesce(uv.seguidores, pr.seguidores) as seguidores,
  ref.client_id
from app.referentes ref
left join gate         on gate.client_id = ref.client_id and gate.handle = lower(replace(ref.handle, '@', ''))
left join seleccion sel on sel.client_id  = ref.client_id and sel.handle  = lower(replace(ref.handle, '@', ''))
left join ultimo_visto uv on uv.client_id = ref.client_id and uv.handle   = lower(replace(ref.handle, '@', ''))
left join propuesto    pr on pr.client_id = ref.client_id and pr.handle   = lower(replace(ref.handle, '@', ''));


-- ═══════════════════════════ Verificación (correr y mirar) ═══════════════════════════
-- 1. Una fila por referente — la regresión de la `015`. Los tres números tienen que dar igual:
--      select (select count(*) from app.v_salud_referentes) as filas_vista,
--             (select count(distinct id) from app.v_salud_referentes) as ids_vista,
--             (select count(*) from app.referentes) as referentes;
--
-- 2. Nada quedó sin tenant (todo tiene que dar 0):
--      select
--        (select count(*) from app.voces      where client_id   is null) as voces,
--        (select count(*) from app.proyectos  where client_id   is null) as proyectos,
--        (select count(*) from app.referentes where client_id   is null) as referentes,
--        (select count(*) from app.usuarios   where client_id   is null) as usuarios,
--        (select count(*) from app.candidatos where instance_id is null) as candidatos,
--        (select count(*) from app.descartes  where instance_id is null) as descartes,
--        (select count(*) from app.ajustes    where instance_id is null) as ajustes,
--        (select count(*) from outputs        where instance_id is null) as outputs,
--        (select count(*) from processed_items where instance_id is null) as procesados;
--
-- 3. El árbol rechaza ciclos (las dos tienen que fallar, y la base tiene que seguir viva):
--      update clients set parent_id = id;                    -- "no puede ser su propio padre"
--
-- 4. Lo que SIGUE MAL a propósito hasta la `017` (para que nadie lo lea como hecho):
--      · el dedup sigue siendo global — `processed_items_platform_external_id_key` vive;
--      · `outputs_external_id_key` sigue siendo global;
--      · casi todas las columnas de tenant siguen nullables y con default al piloto.
