-- 031_colecciones.sql — La bolsa de videos: el sustantivo que faltaba.
-- Aplicar DESPUÉS de la `030`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-073](../../docs/adr/ADR-073-la-coleccion-es-una-bolsa-de-videos.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, como la `029` y la `030`
--
-- Desde el flip de la Capa 2 (ADR-058) el cockpit lee con la sesión del usuario. Una tabla con
-- tenant y sin policy devuelve **cero filas** (si el grant está) o **`42501`** (si no). Acá cero
-- filas se leería como *"todavía no hay colecciones"* — que es el estado real del día uno, o sea
-- **indistinguible de la falla**.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🔑 **Membresía explícita, no una vista guardada.** Una fila por video, no un filtro que se
-- re-evalúa. Lo que se pidió es agrupar **a mano**, con criterio humano que ningún filtro expresa;
-- y una vista guardada cambia sola, así que el guion limpio quedaría colgando de una colección que
-- ya no contiene ese video.
--
-- 🔑 **Apunta a la LLAVE del video, no a la fila del candidato.** No hay FK a `app.candidatos`, y es
-- lo que hace que la colección **sobreviva al barrido**: el archivado borra candidatos sin calificar
-- cada domingo y la colección sigue entera. Resuelve el *"los videos quedan atrapados en el Feed"*
-- sin tocar n8n.
--
-- 📏 **Y es lo único que deja entrar los tres orígenes.** Medido el 2026-08-21: los links cargados a
-- mano (294) **no tienen fila en ninguna tabla de contenido**. Cualquier FK a una tabla concreta los
-- dejaría afuera, y son la mayoría del inventario.
--
-- Idempotente: `create table if not exists` + `drop policy if exists`.


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
begin
  if to_regtype('app.plataforma') is null then
    raise exception 'Falta el tipo app.plataforma. Corré antes core/schema/009_app_config_sombra.sql';
  end if;

  if to_regclass('app.videos_meta') is null then
    raise exception 'Falta app.videos_meta. Corré antes core/schema/030_videos_meta.sql';
  end if;

  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception 'Falta app.instancias_visibles(). Corré antes core/schema/021_rls_capa_2.sql';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La colección ═══════════════════════

create table if not exists app.colecciones (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references instances (id),

  nombre         text not null check (length(trim(nombre)) between 1 and 80),

  -- Quién la creó. Nullable porque `app.usuarios` puede perder una fila y la colección no tiene por
  -- qué irse con ella: el trabajo es del equipo, no de la persona.
  creado_por     uuid references app.usuarios (id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Dos colecciones con el mismo nombre en el mismo cockpit serían indistinguibles en la pantalla
  -- que las lista, que es exactamente donde se elige a cuál agregar.
  unique (instance_id, nombre)
);

-- El objetivo del FK compuesto de abajo. Redundante con la PK, y esa redundancia es el punto:
-- permite que la tabla puente lleve el `instance_id` y que Postgres garantice que coincide con el
-- de su colección. Sin esto, un bug podría meter un video en la colección de otra empresa.
create unique index if not exists colecciones_id_instancia_key
  on app.colecciones (id, instance_id);

comment on table app.colecciones is
  'Una bolsa de videos con nombre (ADR-073). El sustantivo que faltaba para decir "estos videos, '
  'juntos, para hacerles algo": limpiarles el guion, bajarlos como documento. Acepta los tres '
  'orígenes (Feed, Transcribir, cargados a mano) porque apunta a la llave del video y no a la fila '
  'de ninguna tabla de contenido.';


-- ═══════════════════════ §2 · Qué videos tiene ═══════════════════════

create table if not exists app.colecciones_videos (
  coleccion_id uuid not null references app.colecciones (id) on delete cascade,

  -- 🔑 **Denormalizado a propósito, y atado por el FK compuesto de abajo.** Llevarlo permite que la
  -- Capa 2 filtre sin subconsulta y que la Capa 1 pueda scopear si algún día hace falta; el FK hace
  -- **imposible** que se desincronice del padre. Es más barato que confiar en que nadie lo escriba
  -- mal.
  instance_id  uuid not null,

  -- La llave de ADR-070, cuarta tabla que la usa.
  plataforma   app.plataforma not null,
  external_id  text not null,

  -- Igual que en `app.grabados`: para TikTok la URL canónica lleva el handle y no es derivable, y
  -- un video huérfano no tiene otra fila de donde sacarla. Sin esto media tarjeta no se dibuja.
  url          text not null,

  agregado_en  timestamptz not null default now(),

  -- El mismo video dos veces en la misma colección no significa nada. Agregarlo de nuevo es un
  -- no-op, no un error (ver `ignoreDuplicates` en lib/colecciones.ts).
  primary key (coleccion_id, plataforma, external_id),

  foreign key (coleccion_id, instance_id) references app.colecciones (id, instance_id)
);

-- "¿En qué colecciones está este video?" es la pregunta de la tarjeta, y la PK no la resuelve
-- porque empieza por `coleccion_id`.
create index if not exists colecciones_videos_por_video_idx
  on app.colecciones_videos (instance_id, plataforma, external_id);


-- ═══════════════════════ §3 · Quién puede ver y escribir ═══════════════════════
-- `app.colecciones`: grano **instancia**, como todo lo que rodea al trabajo de un cockpit.

alter table app.colecciones enable row level security;

-- `delete` va: borrar una colección es tirar una agrupación, no trabajo pagado. El guion limpio y
-- la metadata comprada viven en sus propias tablas y NO se van con ella (`on delete cascade` llega
-- solo hasta `colecciones_videos`). Esa asimetría es deliberada: la bolsa es descartable, lo que se
-- pagó no.
grant select, insert, update, delete on app.colecciones to authenticated;

drop policy if exists "tenant" on app.colecciones;
create policy "tenant" on app.colecciones for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

-- `app.colecciones_videos`: lleva su propio `instance_id`, así que la policy no necesita el
-- `exists` a la tabla padre que usan `app.referentes_proyectos` y su hermana. Mismo efecto, un join
-- menos por fila — y el FK compuesto garantiza que el `instance_id` no puede mentir.
alter table app.colecciones_videos enable row level security;

grant select, insert, delete on app.colecciones_videos to authenticated;

drop policy if exists "tenant" on app.colecciones_videos;
create policy "tenant" on app.colecciones_videos for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
--   -- 1. Las dos tablas y sus policies (esperado: 2 filas, las dos "tenant" / ALL)
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'app' and tablename in ('colecciones', 'colecciones_videos')
--    order by tablename;
--
--   -- 2. El FK compuesto existe (esperado: 1 fila)
--   select conname from pg_constraint
--    where conrelid = 'app.colecciones_videos'::regclass and contype = 'f'
--      and array_length(conkey, 1) = 2;
--
--   -- 3. PostgREST las ve (esperado: `[]` las dos, NO 404)
--   --    curl -s -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
--   --         -H "Accept-Profile: app" "$SUPABASE_URL/rest/v1/colecciones?limit=1"
--
-- El canario de si esto sirvió: `select count(*) from app.colecciones` a las dos semanas,
-- **contando las creadas por otras personas que no sean quien construyó la pantalla** (la lección
-- medida de ADR-069).
