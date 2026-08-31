-- 034_candidatos_run.sql — De qué corrida salió cada candidato.
-- Aplicar DESPUÉS de la `033`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-081](../../docs/adr/ADR-081-el-candidato-sabe-de-que-corrida-salio.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 POR QUÉ UNA COLUMNA Y NO DERIVARLA DE `creado_en`
--
-- La alternativa barata era *"el candidato es de la corrida cuya ventana [inicio, fin] contiene su
-- `creado_en`"*: cero migración, cero n8n. Se midió antes de descartarla, contra prod el
-- 2026-08-30, sobre los 168 candidatos vivos y los 38 runs de motor:
--
--     en 1 ventana: 100   ·   en 0 ventanas: 68 (40%)   ·   ambiguos: 0
--
-- Los 68 comparten `creado_en` AL MICROSEGUNDO (`2026-08-22T02:35:28.3151`): son el rescate manual
-- del 22/08, cuando la corrida `f3fcf3e7` murió quemando 814 transcripciones y sus filas ya armadas
-- se re-insertaron por PostgREST para no volver a pagarlas. **`creado_en` es la hora del rescate,
-- no la de la corrida.**
--
-- O sea que la derivación no falla ruidosa: le diría "sin corrida" al 40% del feed, y la corrida
-- **existe** — es la que se cayó. Los 0 ambiguos no la salvan: son 0 porque el guard single-flight
-- impide corridas de motor solapadas, así que el modo de falla que se temía es el que NO se
-- materializó.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Idempotente: `add column if not exists`. No toca datos.


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
begin
  if to_regclass('app.candidatos') is null then
    raise exception 'Falta app.candidatos. Corré antes core/schema/009_app_config_sombra.sql';
  end if;

  if to_regclass('public.runs') is null then
    raise exception 'Falta public.runs. Corré antes core/schema/001_registro_inicial.sql';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La columna ═══════════════════════

-- 🔒 **Nullable, y no es una concesión: es el invariante #1 de PLAN §2.5.**
--
-- `Abrir run en el registro` es SUMIDERO (`onError: continueRegularOutput`). Si el registro se cae,
-- la corrida entrega igual y el candidato nace sin corrida. Un `not null` acá convertiría el
-- registro en dependencia de ejecución — exactamente lo que ese invariante existe para impedir.
-- El nodo copia la forma que `Armar filas archivado` ya usa: `run.id || null`.
--
-- 🚫 **Sin índice, a propósito.** El Feed no filtra por esto en la query: la faceta de ADR-076 vive
-- en el cliente, sobre filas que ya están en memoria. Un índice acá sería para un `delete from runs`
-- que nadie hace. Cuando alguien necesite consultar por corrida en SQL, que lo agregue con su caso.
alter table app.candidatos
  add column if not exists run_id uuid references runs (id);

comment on column app.candidatos.run_id is
  'La corrida del motor que produjo este candidato (ADR-081). NULL = no se sabe: filas anteriores a '
  'la 034, o corridas donde el registro (sumidero) no pudo abrir el run. NO se deriva de creado_en: '
  'el rescate del 22/08 probó que creado_en dice cuándo se escribió la fila, no qué corrida la hizo.';


-- ═══════════════════════ §2 · El backfill que NO corre ═══════════════════════
--
-- 🚫 **La migración no rellena nada, y es deliberado.**
--
-- Escribir un valor DERIVADO en una columna de registro lo vuelve indistinguible de uno medido, y a
-- partir de ahí nadie puede saber cuál es cuál. Es el mecanismo que contaminó el canario de ADR-074
-- el 30/08. Las filas viejas quedan en `null` y el Feed dibuja la falta como falta (ADR-072 §4).
-- Con 168 vivas y un barrido de 20 días, esto se cura solo en tres semanas.
--
-- 🔓 **Excepción opt-in: las 68 del rescate.** Su corrida SE SABE por dos señales independientes
-- —`estado = 'fallo'` y `fin` = 20:24 del 21/08, la hora que el handoff registró— así que
-- atribuirlas es RECORDAR, no derivar. Descomentar y correr es decisión de Mani, no efecto de
-- aplicar esta migración. Verificá primero que el select devuelva 68 y un solo `run_id`:
--
--   select count(*) from app.candidatos where creado_en = '2026-08-22T02:35:28.3151+00';
--   select id, inicio, fin, estado from runs
--    where params->>'workflow' = 'motor' and estado = 'fallo'
--      and fin::date = date '2026-08-21';
--
-- update app.candidatos
--    set run_id = (select id from runs
--                   where params->>'workflow' = 'motor' and estado = 'fallo'
--                     and fin >= '2026-08-21T20:00:00+00' and fin < '2026-08-21T21:00:00+00')
--  where creado_en = '2026-08-22T02:35:28.3151+00'
--    and run_id is null;


-- ═══════════════════════ §3 · Verificación (por su EFECTO, no por haber corrido) ═══════════════
--
-- 1. PostgREST la ve (no un 404, y `run_id` viene en la fila):
--      GET {SUPABASE_URL}/rest/v1/candidatos?select=id,run_id&limit=1   (Accept-Profile: app)
-- 2. La FK muerde: un `run_id` inventado tiene que rebotar con `23503`.
--      update app.candidatos set run_id = gen_random_uuid() where id = (select id from app.candidatos limit 1);
--    (rollback — o corrélo dentro de una transacción revertida, como la `031`)
-- 3. Sigue nullable: `select count(*) from app.candidatos where run_id is null;` no tira.
