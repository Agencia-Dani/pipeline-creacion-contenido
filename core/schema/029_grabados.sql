-- 029_grabados.sql — La marca de "ya se grabó", ahora por VIDEO y no por carril.
-- Aplicar DESPUÉS de la `028`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-070](../../docs/adr/ADR-070-la-marca-de-grabado-es-por-video.md), que enmienda
-- [ADR-069](../../docs/adr/ADR-069-grabado-es-un-estado-del-sistema.md) — de dos días antes.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, como la `024`, la `025` y la `027`, y por lo mismo
--
-- Desde el flip de la Capa 2 (ADR-058) el cockpit lee con la sesión del usuario. Una tabla con
-- tenant y sin policy devuelve **cero filas** (si el grant está) o **`42501`** (si no), y el
-- primero es el peligroso: un histórico sin ninguna marca se lee como *"todavía no grabó nadie"*,
-- que es exactamente el estado real de hoy y por lo tanto **indistinguible de la falla**.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🩸 **Qué cambió en dos días.** La `028` puso `grabado_en` en `app.transcripciones` con un
-- argumento correcto para el requisito de entonces: *proteger el pegote de re-pagar un video ya
-- grabado*. El requisito nuevo (Alejo Carvajal, 2026-08-20) es otro: **llevar el registro de qué
-- guiones ya se usaron, y poder cargar links grabados por fuera de la herramienta**. Medido contra
-- prod el 2026-08-20, ahí la `028` no llega:
--
--   · El histórico del equipo (`outputs` con `estado = 'aprobado'`) son **183** guiones.
--   · **128** vinieron de Transcribir  → tienen dónde marcarse.
--   · **55** vinieron del Feed/motor   → **no tienen dónde marcarse en ninguna pantalla**.
--   · Solapamiento entre los dos carriles: **0**. No es que falte una pantalla: falta la fila.
--   · Y un link traído de afuera **no tiene fila en NINGUNA tabla**, así que no hay columna que
--     pueda representarlo. Ese caso solo, ya obliga a una clave por video.
--
-- 🔑 **Lo que ADR-069 §3 midió bien y de lo que sacó la conclusión angosta.** Dijo que
-- `outputs.external_id` significa dos cosas según el carril (uuid del candidato en `guion_reel`,
-- id del video en `transcripcion_a_pedido`) y concluyó *"no hay clave por video"*. Cierto de la
-- **columna**. Pero la **fila** sí la tiene: `metadata->>'url_referente'` está poblado en **300 de
-- 300** filas de `outputs`, y `domain/enlace.ts` deriva de esa URL la clave
-- `(plataforma, external_id)` en **300/300**, sin una sola llamada de red — con la misma función
-- que ADR-031 ya verificó contra la base viva (381/381 IG · 27/27 TikTok).
--
-- 🔑 **Por qué una tabla y no dos columnas más.** ADR-069 descartó la tabla como *"de más"* y
-- tenía razón con un solo carril. Con tres orígenes (Feed, Transcribir, cargado a mano) una
-- columna por tabla son **tres escritores de un mismo hecho que pueden contradecirse**, y el
-- tercero ni siquiera tiene tabla donde vivir. Un hecho, un dueño.
--
-- 🔑 **La presencia de la fila ES la marca.** Desmarcar borra la fila; no hay `grabado_en`
-- nullable ni booleano. Un estado que se representa de una sola forma no se puede escribir mal.
--
-- Sin índice extra: las dos únicas preguntas son *"todas las marcas de este cockpit"* y
-- *"¿están estos N videos?"*, y el unique `(instance_id, plataforma, external_id)` las resuelve
-- por prefijo. Un índice sobre `grabado_en` sería una estructura para una pregunta que nadie hace.
--
-- Idempotente: `create table if not exists` + `on conflict do nothing` en el backfill +
-- `drop policy if exists`. Correrla dos veces es inofensivo y no hay que adivinar si entró.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo qué correr. Mismo molde que
-- la `024`, la `025` y la `027`: nada de `raise` sobre estado dudoso — la lección de la `019` es
-- que un `raise` aborta la transacción entera y deja la migración "corrida" sin haber entrado.

do $guardas$
begin
  if to_regtype('app.plataforma') is null then
    raise exception '029: falta el tipo app.plataforma. Corré la 009 primero.';
  end if;

  if to_regclass('app.transcripciones') is null then
    raise exception '029: falta app.transcripciones. Corré la 010 primero.';
  end if;

  -- El backfill del §2 lee esta columna. Si no está, la `028` no entró y las marcas que el equipo
  -- ya puso se perderían en silencio — que es el único dato irrecuperable de esta migración.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'app' and table_name = 'transcripciones' and column_name = 'grabado_en'
  ) then
    raise exception '029: falta app.transcripciones.grabado_en — el backfill perdería las marcas ya puestas. Corré la 028 primero.';
  end if;

  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception '029: falta app.instancias_visibles(). Corré la 021 primero.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La marca, por video ═══════════════════════

create table if not exists app.grabados (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances (id),

  -- La clave de cruce del sistema entero. Es la misma dupla que ya usan `processed_items`,
  -- `app.transcripciones` y `app.candidatos`, y la que `domain/enlace.ts` deriva de cualquier URL
  -- de IG o TikTok sin llamadas de red (`claveDe` → `${plataforma}:${external_id}`).
  plataforma  app.plataforma not null,
  external_id text not null,

  -- 🔑 **Se guarda aunque para Instagram sea derivable, y es a propósito.** Para IG el
  -- `external_id` es el shortcode en base64, así que la URL se puede reconstruir; para **TikTok
  -- no**, porque la URL canónica lleva el handle (`/@usuario/video/<id>`) y ese handle no está en
  -- ninguna otra columna. Y una marca **huérfana** —un link cargado a mano, que por definición no
  -- tiene fila en `outputs` ni en `transcripciones`— no tiene de dónde sacar su URL para dibujarse.
  -- Sin esto, media pantalla no se puede pintar.
  url         text not null,

  grabado_en  timestamptz not null default now(),

  unique (instance_id, plataforma, external_id)
);

comment on table app.grabados is
  'Un video que el equipo ya grabó (ADR-070). La PRESENCIA de la fila es la marca: desmarcar la '
  'borra. Es por VIDEO y no por carril, así que cubre los tres orígenes a la vez — el Feed, la '
  'zona Transcribir, y los links cargados a mano que no tienen fila en ninguna otra tabla. '
  'Enmienda ADR-069, que la puso como columna de app.transcripciones y por eso alcanzaba solo a '
  'uno de los tres.';

comment on column app.grabados.url is
  'La URL canónica. No es derivable para TikTok (la canónica lleva el handle) y una marca huérfana '
  'no tiene otra fila de donde sacarla: es lo único con lo que se dibuja.';


-- ═══════════════════════ §2 · Backfill: las marcas que ya existen ═══════════════════════
--
-- Al 2026-08-20 es **1 fila** (la prueba de Mani del 18/08). El número importa poco; lo que
-- importa es que ninguna marca puesta por una persona se pierda al mudar el dueño del hecho.
--
-- `on conflict do nothing` para que correr esto dos veces no falle. Y NO se toca
-- `app.transcripciones.grabado_en` acá: la columna se queda donde está hasta que el código nuevo
-- esté deployado y verificado (expand/contract). Sale en una `030` aparte, con su propio gate.
-- Dropearla ahora sería `42703` en `COLUMNAS` de `lib/transcripciones.ts` y la zona Transcribir
-- entera dejaría de cargar.

insert into app.grabados (instance_id, plataforma, external_id, url, grabado_en)
select instance_id, plataforma, external_id, url, grabado_en
  from app.transcripciones
 where grabado_en is not null
on conflict (instance_id, plataforma, external_id) do nothing;


-- ═══════════════════════ §3 · Quién puede ver y escribir una marca ═══════════════════════
-- Grano **instancia**: una marca es del cockpit, como el resto de lo que rodea a las
-- transcripciones. `drop … if exists` antes del `create` (Postgres no tiene
-- `create or replace policy`), igual que la `024`, la `025` y la `027`.

alter table app.grabados enable row level security;

-- ⚠️ **`delete` SÍ va en el grant**, y es la diferencia con la `027`. Acá desmarcar *es* borrar la
-- fila, así que sin `delete` el toggle sería de una sola dirección: se podría marcar y nunca
-- sacar. Y no hay nada que destruir — la fila no guarda trabajo pagado, guarda un hecho que una
-- persona puede haber puesto por error. Sin `update`: ninguna columna cambia después del insert.
grant select, insert, delete on app.grabados to authenticated;

drop policy if exists "tenant" on app.grabados;
create policy "tenant" on app.grabados for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 🩸 **Una migración no se da por aplicada porque haya corrido: se da por aplicada cuando se mide
-- su efecto.** Es la lección de la `019`, que se corrió el 03/08 sin error visible y NO entró.
--
-- 1. La tabla existe y el backfill trajo lo que había. Los dos números tienen que ser IGUALES:
--
--      select (select count(*) from app.grabados)                                  as grabados,
--             (select count(*) from app.transcripciones where grabado_en is not null) as marcadas;
--      -- esperado al 2026-08-20: 1 y 1
--
-- 2. 🔴 **Que la `028` haya quedado intacta.** El punto de la mudanza es no perder nada, así que
--    el reparto de `estado` en transcripciones tiene que ser el mismo de antes:
--
--      select estado, count(*) from app.transcripciones group by estado;
--      -- esperado al 2026-08-20: 128 `listo` + 1 `abandonado`
--
-- 3. 🔴 **El aislamiento, y la pantalla NO lo puede probar**: después del flip la Capa 1 filtra por
--    el cockpit abierto antes de que la base opine, así que se ve igual con RLS funcionando y con
--    RLS inerte. Hay que preguntar **sin** el filtro de tenant:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta de EstadoX>';
--        select count(*) from app.grabados;   -- esperado: 0 (la marca es de Retia)
--      rollback;
--
--    ⚠️ **No sirve con una cuenta `es_dueno`**: alcanza todas las empresas, así que su resultado
--    es indistinguible del de RLS apagado (ADR-058: un dueño no bypassa RLS).
--
-- 4. Escribir y borrar con sesión (no con `service_role`), que es lo que los grants del §3 compran.
--    Sin dejar nada:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta de Retia>';
--        insert into app.grabados (instance_id, plataforma, external_id, url)
--          values ('<instance_id de Retia>', 'instagram', '999', 'https://x/');   -- 1 fila
--        delete from app.grabados where external_id = '999';                       -- 1 fila
--        insert into app.grabados (instance_id, plataforma, external_id, url)
--          values ('<instance_id de EstadoX>', 'instagram', '999', 'https://x/');
--        -- 42501: el `with check` la rechaza. Si ESTA pasa, el §3 está mal.
--      rollback;
--
-- 5. 🔴 **El check #1 de la `021`** — *"¿queda alguna tabla con tenant, RLS y sin policy?"*. Esta
--    migración crea justo esa clase de tabla, así que es el check que la caza si el §3 no entró.
--    Tiene que seguir dando **cero filas**. El SQL está al pie de la [`024`](./024_rls_linkedin.sql).
--
-- 6. Y el modo de falla de la app, medido desde afuera sin escribir nada:
--
--      GET /rest/v1/grabados?select=*        (Accept-Profile: app)
--
--      ANTES de la migración → PGRST205 (no existe la tabla)
--      DESPUÉS              → 200 con la fila del backfill
