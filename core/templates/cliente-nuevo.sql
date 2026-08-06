-- ════════════════════════════════════════════════════════════════════════════════════════
-- cliente-nuevo.sql — alta de una empresa y su cockpit, en una transacción
--
-- Se corre en el SQL Editor de Supabase. Su guía es docs/runbooks/agregar-cliente.md; acá está
-- el SQL y nada más. NO es una migración: no lleva número, no va en core/schema/, y se corre
-- una vez por empresa nueva en vez de una vez por base.
--
-- 🔑 Por qué esto puede ser solo SQL, y no un deploy: el motor es UN workflow parametrizado que
--    le pregunta a la fachada qué instancias correr (ADR-050 + ADR-048). Una fila en `instances`
--    con estado 'active' ES el alta operativa — el dispatcher la levanta en la próxima corrida
--    sin que nadie toque n8n.
--
-- ⚠️ EDITÁ SOLO EL §0. Todo lo de abajo se deriva de ahí.
-- ════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────── §0 · Los 4 datos ───────────────────────────────
create temp table _alta on commit drop as select
  'nuevocliente'    as cliente_id,     -- slug en minúscula, sin espacios. ES LA URL: /nuevocliente/reels
  'Nombre Visible'  as cliente_nombre,
  'short-form-content' as workflow_id, -- 'short-form-content' | 'linkedin' (tiene que existir en `workflows`)
  'reels'           as cockpit_slug,   -- el segundo tramo de la URL
  -- El cockpit del que se copian las 18 perillas con sus textos. Tiene que ser del MISMO
  -- workflow_id, o el check del AJUSTE_MAP rechaza claves que ese pipeline no conoce.
  '83abbf60-18ae-4072-a7da-48f04bf39f54'::uuid as cockpit_modelo;  -- retia/reels


-- ────────────────── §1 · Guardas: fallar acá es barato, fallar después no ──────────────────
do $guardas$
declare a record;
begin
  select * into a from _alta;

  if a.cliente_id = 'nuevocliente' then
    raise exception 'Editá el §0: cliente_id sigue siendo el placeholder';
  end if;
  if exists (select 1 from clients where id = a.cliente_id) then
    raise exception 'El cliente % ya existe. Si querés sumarle un cockpit, saltá el §2', a.cliente_id;
  end if;
  if not exists (select 1 from workflows where id = a.workflow_id) then
    raise exception 'No existe el workflow %. Un pipeline nuevo va por agregar-workflow.md', a.workflow_id;
  end if;
  -- El modelo tiene que ser del mismo pipeline: las perillas son por workflow, no globales.
  if not exists (select 1 from instances i where i.id = a.cockpit_modelo and i.workflow_id = a.workflow_id) then
    raise exception 'El cockpit modelo no existe o es de otro pipeline que %', a.workflow_id;
  end if;
end
$guardas$;


-- ─────────────────────────────── §2 · La empresa ───────────────────────────────
insert into clients (id, nombre) select cliente_id, cliente_nombre from _alta;


-- ─────────────────────────── §3 · El cockpit (la instancia) ───────────────────────────
-- Nace en 'draft' A PROPÓSITO: el dispatcher solo dispara las 'active', así que la empresa se
-- configura entera (voces, proyectos, referentes) antes de que le corra el motor y le cobre.
-- Prenderla es el último paso del runbook, no este.
insert into instances (client_id, workflow_id, slug, nombre, estado)
select cliente_id, workflow_id, cockpit_slug, cliente_nombre || ' — ' || cockpit_slug, 'draft'
from _alta;


-- ────────────────── §4 · Las 18 perillas, copiadas del cockpit modelo ──────────────────
-- Se COPIAN en vez de listarse acá con sus valores: una lista hardcodeada en este archivo
-- envejece sola cada vez que alguien agrega un knob o corrige una descripción, y el síntoma
-- sería un cockpit nuevo con perillas viejas o sin texto. El modelo es la fuente.
insert into app.ajustes (instance_id, clave, valor, descripcion, visibilidad)
select nueva.id, modelo.clave, modelo.valor, modelo.descripcion, modelo.visibilidad
  from _alta alta
  join instances nueva
    on nueva.client_id = alta.cliente_id
   and nueva.slug      = alta.cockpit_slug
  join app.ajustes modelo
    on modelo.instance_id = alta.cockpit_modelo;


-- ══════════════════════ VERIFICACIÓN — leerla fila por fila, no contarla ══════════════════════
-- La lección de la `019` (plan-multi-tenant §14.1): una migración no está aplicada porque haya
-- corrido, sino cuando se mide su efecto. Esto tiene que devolver UNA fila, con ajustes = 18.
select c.id as cliente, i.slug as cockpit, i.estado, i.id as instance_id,
       (select count(*) from app.ajustes a where a.instance_id = i.id) as ajustes
  from clients c
  join instances i on i.client_id = c.id
  join _alta alta on alta.cliente_id = c.id and alta.cockpit_slug = i.slug;

-- Si la fila está bien: `commit`. Si no: `rollback` y no quedó nada.
-- ⚠️ NO hagas commit sin leer el resultado. Es el paso donde el runbook se gana el sueldo.
commit;
