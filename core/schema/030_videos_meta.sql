-- 030_videos_meta.sql — Lo que se sabe de un video y ninguna otra tabla guarda.
-- Aplicar DESPUÉS de la `029`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-072](../../docs/adr/ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, por la misma razón que la `029`
--
-- Desde el flip de la Capa 2 (ADR-058) el cockpit lee con la sesión del usuario. Una tabla con
-- tenant y sin policy devuelve **cero filas** (si el grant está) o **`42501`** (si no). Acá el
-- primero es especialmente peligroso: cero filas de metadata es **indistinguible del estado real
-- de hoy** (0 de 130 en Transcribir), así que la falla se leería como "todavía no se enriqueció
-- nada" y nadie la vería.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 📏 **Por qué existe, con el número.** Medido contra prod el 2026-08-21:
--
--   · Transcribir (`app.transcripciones`)          → **0 de 130** tienen título/referente/métricas.
--   · Grabados cargados a mano (`app.grabados`)    → **3 de 294**.
--   · Históricos del Feed (`outputs.guion_reel`)   → 172 de 172, pero **0 con miniatura**.
--   · Feed vivo (`app.candidatos`)                 → 101 de 101, y **34 con miniatura**.
--
-- Y no hay de dónde sacarlo gratis: **Supadata devuelve `content`, `lang` y `availableLangs`, nada
-- más** (se corrió la llamada exacta del nodo `Transcribir`), **Instagram bloquea las `og:` tags
-- sin login**, y TikTok —que sí tiene oEmbed gratis— es **2 videos de 424**. La única fuente que
-- sirve es `apify~instagram-scraper`, que ya está en el motor y ya se paga.
--
-- 🔑 **Por qué una tabla y no columnas en las tablas que ya existen.** El mismo argumento de la
-- `029`: hay **tres orígenes** (Feed, Transcribir, cargado a mano) y el tercero **no tiene fila en
-- ninguna tabla**. Una columna por tabla serían tres escritores de un mismo hecho que pueden
-- contradecirse, y el tercero sin dónde vivir. Un hecho, un dueño.
--
-- 🔑 **Por qué NO hay una vista `v_videos` acá.** Fue lo primero que se diseñó y se descartó
-- (ADR-072 §2). `outputs.external_id` significa dos cosas según el carril, así que la vista tendría
-- que derivar la identidad de `metadata->>'url_referente'` **con un regex de Postgres** — una
-- segunda implementación de lo que `domain/enlace.ts` ya hace y que este repo prohíbe por escrito:
-- *"dos derivaciones de la misma identidad serían dos bugs mudos el día que una cambie"*
-- (`domain/grabados.ts:29-32`). El cruce vive en `domain/video.ts`, en memoria, con la misma
-- función de identidad que usan el pegote y el histórico.
--
-- 🔑 **`traido_en` NO es una fecha de vencimiento.** Nada re-scrapea por antigüedad: la PK es la
-- guardia y se pide solo lo que falta. Está para contestar *"¿cuándo se pagó esto?"* cuando alguien
-- mire la factura de Apify, y para poder invalidar a mano si algún día hace falta.
--
-- Idempotente: `create table if not exists` + `drop policy if exists`. Correrla dos veces es
-- inofensivo y no hay que adivinar si entró.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo qué correr. Mismo molde que
-- la `024`, la `025`, la `027` y la `029`.

do $guardas$
begin
  if to_regtype('app.plataforma') is null then
    raise exception 'Falta el tipo app.plataforma. Corré antes core/schema/009_app_config_sombra.sql';
  end if;

  if to_regclass('app.grabados') is null then
    raise exception 'Falta app.grabados. Corré antes core/schema/029_grabados.sql';
  end if;

  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception 'Falta app.instancias_visibles(). Corré antes core/schema/021_rls_capa_2.sql';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La metadata comprada, por video ═══════════════════════

create table if not exists app.videos_meta (
  instance_id   uuid not null references instances (id),

  -- La misma llave de ADR-070. Tercera tabla que la usa, y a propósito: es la identidad del
  -- sistema, no una columna de conveniencia.
  plataforma    app.plataforma not null,
  external_id   text not null,

  -- 🔑 **Todo nullable menos la fuente.** Un scrape puede volver a medias (Instagram no siempre
  -- da `videoViewCount` en un carrusel, la miniatura firmada a veces ya venció). Una fila con
  -- título y sin vistas es información real; exigir todo obligaría a no guardar nada o a guardar
  -- ceros, y un cero es un número que miente. La tarjeta ya sabe dibujar un `null`.
  titulo        text,
  referente     text,
  thumbnail_url text,
  views         bigint,
  likes         bigint,
  seguidores    bigint,

  -- De dónde salió, para poder distinguir lo que se pagó de lo que se dedujo el día que alguien
  -- audite la factura o quiera re-pedir solo una parte.
  fuente        text not null check (fuente in ('apify', 'archivado', 'manual')),

  traido_en     timestamptz not null default now(),

  primary key (instance_id, plataforma, external_id)
);

comment on table app.videos_meta is
  'Lo que se sabe de un video y ninguna otra tabla guarda (ADR-072). Existe porque Supadata solo '
  'devuelve texto e idioma, e Instagram bloquea las og: tags: al 2026-08-21, 0 de 130 '
  'transcripciones y 3 de 294 marcas tenían título o referente. Se llena comprándolo a '
  'apify~instagram-scraper. La PK es la guardia contra re-scrapear: se pide solo lo que falta.';

comment on column app.videos_meta.traido_en is
  'Cuándo se trajo. NO es vencimiento: nada re-scrapea por antigüedad. Es para auditar el gasto.';


-- ═══════════════════════ §2 · Quién puede ver y escribir metadata ═══════════════════════
-- Grano **instancia**, como `app.grabados`: lo que se compró lo pagó un cockpit.
-- `drop … if exists` antes del `create` (Postgres no tiene `create or replace policy`).

alter table app.videos_meta enable row level security;

-- ⚠️ **Sin `delete`, y es la diferencia con la `029`.** Allá desmarcar *es* borrar, así que el
-- `delete` era la mitad del toggle. Acá borrar una fila es **tirar algo que se pagó**, y no hay
-- ninguna acción del producto que lo pida. `update` sí: un re-scrape a pedido pisa la fila con
-- datos más frescos, que es distinto de perderla.
grant select, insert, update on app.videos_meta to authenticated;

drop policy if exists "tenant" on app.videos_meta;
create policy "tenant" on app.videos_meta for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 🩸 **Una migración no se da por aplicada porque haya corrido: se da por aplicada cuando se mide
-- su efecto.** Las tres preguntas, en orden:
--
--   -- 1. ¿La tabla existe con la forma esperada? (esperado: 9 columnas)
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'app' and table_name = 'videos_meta'
--    order by ordinal_position;
--
--   -- 2. ¿La policy quedó? (esperado: 1 fila, "tenant", cmd = ALL)
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'app' and tablename = 'videos_meta';
--
--   -- 3. ¿PostgREST la ve? (desde el .env de la raíz; esperado: `[]`, NO un 404)
--   --    curl -s -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
--   --         -H "Accept-Profile: app" "$SUPABASE_URL/rest/v1/videos_meta?limit=1"
--   --    Un 404 acá significa que PostgREST no recargó su schema cache: esperar o tocar la tabla.
--
-- El canario de si esto sirvió NO es esta migración: es que `select count(*) from app.videos_meta`
-- suba cuando el equipo empiece a armar colecciones (ADR-073).
