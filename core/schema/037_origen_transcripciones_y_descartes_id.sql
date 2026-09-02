-- 037_origen_transcripciones_y_descartes_id.sql — Que la memoria pueda distinguir sus dos dueños,
-- y que un descarte se pueda volver a identificar.
-- Aplicar DESPUÉS de la `036`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-087](../../docs/adr/ADR-087-la-memoria-recuerda-lo-que-se-entrego-no-lo-que-se-evaluo.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- EL PORQUÉ, MEDIDO CONTRA PROD EL 2026-09-01
--
-- `public.processed_items` tiene **1.952 filas**. Solo **866** videos llegaron alguna vez al Feed
-- (`app.candidatos` ∪ `public.outputs`). O sea: **1.401 videos (71,8%) se scrapearon, se
-- transcribieron, se PAGARON, se marcaron "ya visto" para siempre — y ninguna persona los vio.**
--
-- La causa es de modelo: la memoria contesta *"¿ya lo evalué?"* cuando el dedup necesita *"¿ya se lo
-- mostré al equipo?"*. Son dos preguntas distintas con la misma llave.
--
-- Esta migración NO arregla eso sola: habilita las dos piezas que el motor necesita para poder
-- dejar de quemar lo que no entregó, sin empezar a re-pagarle a Supadata en cada corrida.
--
-- ⚠️ **`origen` NO cambia el comportamiento de nadie por existir.** Todas las filas de hoy son
-- `manual` (verificado: las 130 tienen `tanda_id`, o sea que salieron del transcriptor del cockpit,
-- y el motor escribió CERO). Lo que cambia el comportamiento es el código: el motor empezando a
-- escribir `motor`, y las 5 lecturas del cockpit empezando a filtrar `manual`.
--
-- 🔴 **Y ese filtro no es cosmético.** `leerFallidas()` en `apps/dashboard/lib/transcripciones.ts`
-- trae SIN LÍMITE las filas en `fallo`/`sin_transcript`, con el comentario *"son pocas por
-- definición"*. ADR-082 midió que **el 34% de lo que el motor manda a Supadata vuelve vacío (593 de
-- 1.755)**: sin el filtro, la pantalla del equipo se llena de filas de máquina con un botón
-- *Reintentar* que no tiene nada que reintentar.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Idempotente: `add column if not exists`. Aditiva, sin backfill de datos derivados.
--
-- 🔴 SIN BACKFILL en `app.descartes.external_id`, a propósito. Las 154 filas históricas quedan en
-- `null` **y NO se curan solas: esta tabla no se barre** (verificado — el workflow de archivado no
-- la menciona, y al 01/09 sigue habiendo filas del 01/08). Son recuperables decodificando
-- `url_referente` con el alfabeto de `rescatar-huerfanos.mjs`, probado 300/300 en ADR-070; no se
-- hace acá porque nada lo necesita todavía y un backfill derivado que se equivoque en silencio es
-- peor que un `null` que se ve.


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $$
begin
  if to_regclass('app.transcripciones') is null then
    raise exception 'app.transcripciones no existe: falta correr las migraciones anteriores';
  end if;
  if to_regclass('app.descartes') is null then
    raise exception 'app.descartes no existe: falta correr las migraciones anteriores';
  end if;
end $$;


-- ═══════════════════════ §1 · app.transcripciones.origen ═══════════════════════
--
-- `default 'manual'` es lo que hace segura la migración: las filas que ya existen y cualquier
-- insert viejo que no mande la columna caen del lado del cockpit, que es donde estaban.
-- El motor tiene que decir `motor` EXPLÍCITAMENTE para salir de ahí.

alter table app.transcripciones
  add column if not exists origen text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app.transcripciones'::regclass and conname = 'transcripciones_origen_check'
  ) then
    alter table app.transcripciones
      add constraint transcripciones_origen_check check (origen in ('manual', 'motor'));
  end if;
end $$;

comment on column app.transcripciones.origen is
  'Quien pidio esta transcripcion: manual = el transcriptor del cockpit (tiene tanda, la opera una '
  'persona, se puede reintentar); motor = el pipeline de reels, que la usa como CACHE para no '
  'pagarle dos veces a Supadata por el mismo video. Las 5 lecturas del cockpit en '
  'lib/transcripciones.ts filtran manual: sin ese filtro las filas de maquina inundan la pantalla '
  'del equipo. ADR-087.';

-- El índice que sostiene el filtro nuevo. Parcial sobre `manual` porque son las filas que la
-- pantalla lista y ordena, y van a ser la minoría en cuanto el motor empiece a escribir.
create index if not exists transcripciones_manual_idx
  on app.transcripciones (instance_id, estado, creado_en desc)
  where origen = 'manual';

-- Y el que sostiene la caché del motor: la única consulta que hace es "¿tengo este video?".
-- El unique `(instance_id, plataforma, external_id)` ya la cubre, así que NO se crea otro índice:
-- se deja escrito para que nadie lo agregue por las dudas.
--   → `transcripciones_identidad_key` UNIQUE (instance_id, plataforma, external_id) — ya existe.


-- ═══════════════════════ §2 · app.descartes.external_id ═══════════════════════
--
-- Todo video en la herramienta se identifica por `(plataforma, external_id)`. `app.descartes` era la
-- única superficie que no lo hacía, y por eso `rescatar-huerfanos.mjs` tiene que reconstruirlo
-- decodificando el shortcode desde la URL.
--
-- Nullable a propósito: las filas viejas no lo tienen y no se inventa.
-- Sin `plataforma` acompañante porque la tabla tampoco la tiene hoy y `url_referente` ya la
-- determina; agregarla sería un cambio más grande sin nadie que lo pida.

alter table app.descartes
  add column if not exists external_id text;

comment on column app.descartes.external_id is
  'Id del post en su plataforma, el mismo que usan app.candidatos y public.processed_items. Sin el, '
  'un descarte no se puede volver a encontrar ni cruzar con la memoria del dedup. Null en las filas '
  'anteriores al 2026-09-01: esta tabla no se barre, asi que no se curan solas. ADR-087.';

create index if not exists descartes_external_id_idx
  on app.descartes (instance_id, external_id)
  where external_id is not null;


-- ═══════════════════════ §3 · La RPC que el motor usa como caché ═══════════════════════
--
-- 🔑 EXISTE POR UNA LIMITACIÓN DE n8n, y conviene que quede escrito para que nadie la "simplifique"
-- después convirtiéndola en un GET.
--
-- Los Code nodes de n8n **no pueden usar credenciales**: por eso `Transcribir (Supadata)` lleva su
-- api-key como placeholder en texto plano. Los HTTP nodes sí (credencial `supabaseApi`). Entonces,
-- para que el motor consulte la caché sin meter un secreto de Supabase nuevo en código, la consulta
-- tiene que salir de un HTTP node. Y ahí aparece el segundo problema:
--
--   · Con los ids en la URL (`?external_id=in.(...)`) se pega contra el **414** — y no es teórico:
--     `apps/dashboard/lib/transcripciones.ts` trocea de a 200 justamente porque *"el límite del que
--     se entera uno es el 414 en producción"*, con 400 links. `cap_top_n` está en 350.
--   · Bajando la tabla entera se traen scripts de hasta 6.000 chars por fila, **sin techo**: esta
--     tabla no se barre y crece en cada corrida.
--
-- Una RPC recibe los ids **en el body**: sin límite de URL, sin secreto nuevo, y devuelve solo las
-- filas que la corrida pidió (≤ `cap_top_n`) en vez de la tabla completa.
--
-- Devuelve `listo` y `sin_transcript` a propósito, que son las dos respuestas DEFINITIVAS de
-- Supadata (ADR-084 §1): la primera ahorra el guion, la segunda ahorra pedirle otra vez a un video
-- que no tiene audio. Los `pendiente`/`fallo`/`abandonado` NO se devuelven: ésos todavía no son una
-- respuesta y el motor tiene que ir a preguntar.
--
-- `security invoker` + `search_path` fijo: la regla de ADR-085 — una función resuelve sus tablas
-- contra un camino fijo y no contra el de quien la llame.

create or replace function app.cache_transcripts(p_instance uuid, p_ids text[])
returns table (external_id text, plataforma text, estado text, script text, idioma text)
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select t.external_id, t.plataforma::text, t.estado, t.script, t.idioma
  from app.transcripciones t
  where t.instance_id = p_instance
    and t.external_id = any(p_ids)
    and t.estado in ('listo', 'sin_transcript')
$fn$;

comment on function app.cache_transcripts(uuid, text[]) is
  'Cache de ASR del motor: dado un lote de external_id, devuelve los que ya tienen respuesta '
  'DEFINITIVA de Supadata (listo o sin_transcript). Los ids van en el body y no en la URL porque '
  'un GET con ~350 ids da 414 en produccion. ADR-087.';

-- 🩸 El grant va EXPLÍCITO. `011_grants_app_service_role.sql` puso
-- `alter default privileges in schema app grant all privileges on TABLES / SEQUENCES`, y **las
-- funciones no están en esa lista**: una función nueva NO nace accesible. Es la misma clase de
-- error que la `011` vino a reparar — dar por sentado un grant que nadie otorgó — y su síntoma
-- sería un `42501 permission denied` desde el motor, con `onError: continueRegularOutput`
-- tragándoselo y la corrida cerrando en verde sin caché, re-pagándole a Supadata en silencio.
grant execute on function app.cache_transcripts(uuid, text[]) to service_role;
grant execute on function app.cache_transcripts(uuid, text[]) to authenticated;


-- ═══════════════════════ §4 · Verificación (por efecto, no por haber corrido) ═══════════════════════
--
-- Correr esto DESPUÉS y pegar el resultado en el handoff:
--
--   select
--     (select count(*) from app.transcripciones)                            as transcripciones,
--     (select count(*) from app.transcripciones where origen = 'manual')    as manual,
--     (select count(*) from app.transcripciones where origen = 'motor')     as motor,
--     (select count(*) from app.descartes)                                  as descartes,
--     (select count(*) from app.descartes where external_id is not null)    as descartes_con_id;
--
-- Esperado JUSTO DESPUÉS de aplicar:
--   transcripciones = manual  (las dos iguales)   ·  motor = 0  ·  descartes_con_id = 0
--
-- Los dos ceros son el dato: prueban que el "sin backfill" es un hecho medido y no una intención.
--
-- Y la segunda señal, que no sale de un `count`: el check tiene que rechazar un valor inventado.
--
--   -- debe fallar con 23514 (transcripciones_origen_check)
--   update app.transcripciones set origen = 'cualquiera' where false;
--   -- (el `where false` no toca filas; para probarlo de verdad hace falta un insert de prueba
--   --  y borrarlo después, como se hizo con la `031`)
--
-- 🐤 Canario de ADR-087: `select count(*) from app.transcripciones where origen = 'motor'` nace en
-- CERO por definición — esta migración no backfillea nada. **La primera fila la escribe el motor**,
-- así que la primera ya es uso real y no una verificación de nadie. Si alguien inserta una a mano
-- para probar, este canario deja de servir y hay que redefinirlo por fecha, como ya pasó con los de
-- ADR-069 y ADR-074.
--
-- ── Y la RPC, que es la pieza cuyo fallo sería MUDO ──────────────────────────────────────────
-- Un `42501` acá lo esconde el `onError: continueRegularOutput` del nodo que la llama: la corrida
-- cierra en verde, sin caché, re-pagándole a Supadata. Por eso se prueba a mano y no se asume.
--
--   -- 1) existe y contesta (con una instancia real y un id que exista en app.transcripciones)
--   select * from app.cache_transcripts(
--     (select id from public.instances where slug = 'reels' limit 1),
--     array(select external_id from app.transcripciones limit 3)
--   );
--   -- Esperado: hasta 3 filas, todas con estado 'listo' o 'sin_transcript'.
--
--   -- 2) un id inventado no devuelve nada (y no revienta)
--   select count(*) from app.cache_transcripts(
--     (select id from public.instances where slug = 'reels' limit 1), array['no-existe-999']);
--   -- Esperado: 0
--
--   -- 3) el grant existe (esto es lo que la 011 dio por sentado y no era cierto)
--   select has_function_privilege('service_role', 'app.cache_transcripts(uuid, text[])', 'execute')
--       as service_role_puede;
--   -- Esperado: true. Si da false, el motor no va a poder usar la caché.
