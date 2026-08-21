-- 032_guiones_limpios.sql — El guion limpio, al lado del crudo y nunca encima.
-- Aplicar DESPUÉS de la `031`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-074](../../docs/adr/ADR-074-el-guion-limpio-es-un-artefacto-nuevo.md), que **enmienda
-- ADR-009 y ROADMAP §1.1**.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, como la `029`, la `030` y la `031`
--
-- Tabla con tenant y sin policy = **cero filas** (si el grant está) o `42501` (si no). Acá cero
-- filas se lee como *"todavía no limpiaron nada"*, que es el estado real del día uno: la falla
-- sería invisible.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🔑 **El crudo NO se toca.** `app.candidatos.script` y `app.transcripciones.script` siguen siendo
-- la transcripción literal de ADR-009. Esto es una capa derivada, opcional, que se puede tirar y
-- rehacer. Es lo que permite enmendar el norte sin romperlo: lo que ADR-009 prohíbe es entregar una
-- reescritura **en vez** del contenido tal cual, y eso sigue sin pasar.
--
-- 🩸 **Y hay un modo de falla que ya ocurrió, antes de que existiera el feature.** Majo corrigió a
-- mano un video de **dos voces** (una pregunta y su respuesta) y el resultado lo volvió un monólogo:
-- *"no respetó que el formato estuviera pensado para dos voces"*. El guion se veía mejor y era peor,
-- y eso se descubre en grabación. Por eso los dos artefactos conviven en pantalla: el crudo es el
-- punto de comparación, no un respaldo.
--
-- 🔑 **Una fila por video, que se pisa al rehacer.** No se versiona: un historial de limpiezas es
-- una pantalla que nadie pidió, y el crudo ya es la comparación que importa.
--
-- Idempotente: `create table if not exists` + `add column if not exists` + `drop policy if exists`.


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
begin
  if to_regtype('app.plataforma') is null then
    raise exception 'Falta el tipo app.plataforma. Corré antes core/schema/009_app_config_sombra.sql';
  end if;

  if to_regclass('app.colecciones') is null then
    raise exception 'Falta app.colecciones. Corré antes core/schema/031_colecciones.sql';
  end if;

  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception 'Falta app.instancias_visibles(). Corré antes core/schema/021_rls_capa_2.sql';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · El guion limpio ═══════════════════════

create table if not exists app.guiones_limpios (
  instance_id    uuid not null references instances (id),

  -- La llave de ADR-070, quinta tabla que la usa. Un guion limpio sirve igual venga el video del
  -- Feed, de Transcribir o de un link pegado — y **no muere con el candidato** cuando el archivado
  -- barre, porque no lo referencia.
  plataforma     app.plataforma not null,
  external_id    text not null,

  texto          text not null check (length(trim(texto)) > 0),

  -- Con qué voz se limpió. Nullable: un video puede limpiarse sin voz asignada (queda solo con los
  -- criterios de la casa), y si la voz se borra el guion no se va con ella.
  voz_id         uuid references app.voces (id) on delete set null,

  -- Con qué modelo. Sin default a propósito: el día que se suba a Sonnet hay que poder contestar
  -- "¿cuáles limpió Haiku?" para comparar, y un default lo escondería.
  modelo         text not null,

  -- 🔑 **La huella de con qué criterios se limpió**, para saber si un guion quedó viejo cuando
  -- alguien edita el perfil de la voz. NO dispara nada solo: es información para la pantalla, no un
  -- gatillo. Re-limpiar cuesta plata y esa decisión es de una persona.
  criterios_hash text,

  creado_por     uuid references app.usuarios (id),
  actualizado_en timestamptz not null default now(),

  primary key (instance_id, plataforma, external_id)
);

comment on table app.guiones_limpios is
  'El guion pulido de un video (ADR-074). Artefacto NUEVO al lado del crudo, nunca encima: '
  'app.candidatos.script y app.transcripciones.script siguen siendo la transcripción literal de '
  'ADR-009. Una fila por video, que se pisa al rehacer.';

comment on column app.guiones_limpios.criterios_hash is
  'Huella de los criterios con los que se limpió. Sirve para avisar que quedó viejo si el perfil de '
  'la voz cambió. No re-limpia solo: eso cuesta plata y lo decide una persona.';


-- ═══════════════════════ §2 · Cómo habla cada voz ═══════════════════════
--
-- 🔑 **Grano EMPRESA (`app.voces`), no instancia.** Es la diferencia con `app.voces_linkedin`
-- (ADR-067), y tiene razón de ser: la firma y los horarios de LinkedIn son del cockpit, pero **cómo
-- habla Milena no depende del cockpit desde el que se mire**.
--
-- 🔴 **Esto NO reemplaza a `voces.activo` ni lo toca.** Ese flag significa de facto "corre en
-- reels" y lo consume `leerConfigOperar` para armar el plan del motor. Escribirlo desde la pantalla
-- de limpieza apagaría proyectos en producción sin un solo error (ADR-067 §2).
--
-- Nullable y sin default: una voz sin perfil se limpia solo con los criterios de la casa, que es un
-- resultado útil. Exigirlo bloquearía la feature detrás de un formulario que nadie llenó todavía.

alter table app.voces add column if not exists perfil_limpieza text;

comment on column app.voces.perfil_limpieza is
  'Cómo habla esta voz, en texto libre: muletillas, tratamiento, largo de frase, lo que nunca '
  'diría. Se SUMA a los criterios de la casa, que viven en código. Null = se limpia solo con la '
  'base. Lo llena el equipo de redes desde curar/voces.';


-- ═══════════════════════ §3 · Quién puede ver y escribir ═══════════════════════

alter table app.guiones_limpios enable row level security;

-- `delete` va: tirar un limpio es rehacerlo, y el crudo —que es lo que costó Supadata y Haiku— está
-- intacto en otra tabla. `update` también: re-limpiar pisa la fila.
grant select, insert, update, delete on app.guiones_limpios to authenticated;

drop policy if exists "tenant" on app.guiones_limpios;
create policy "tenant" on app.guiones_limpios for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

-- `app.voces` ya tiene su policy de la `021` (grano empresa) y la columna nueva viaja con ella: no
-- hay nada que agregar acá. Se deja dicho para que nadie la busque.


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
--   -- 1. La tabla y su policy (esperado: 1 fila, "tenant", ALL)
--   select policyname, cmd from pg_policies
--    where schemaname = 'app' and tablename = 'guiones_limpios';
--
--   -- 2. La columna nueva de voces (esperado: 1 fila, text, YES)
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'app' and table_name = 'voces' and column_name = 'perfil_limpieza';
--
--   -- 3. PostgREST la ve (esperado: `[]`, NO 404)
--   --    curl -s -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
--   --         -H "Accept-Profile: app" "$SUPABASE_URL/rest/v1/guiones_limpios?limit=1"
--
-- 🔴 **El canario, y es el que decide si el feature sirvió** (la lección medida de ADR-069: una
-- marca puesta por quien construyó el botón no es evidencia de adopción):
--
--   select count(*) from app.guiones_limpios where creado_por <> '<el uuid de Mani>';
--
-- A las dos semanas. Si da cero, o si Majo sigue limpiando a mano en Claude, el feature no sirvió y
-- lo que hay que revisar es el prompt o el modelo — no agregarle más pantalla.
