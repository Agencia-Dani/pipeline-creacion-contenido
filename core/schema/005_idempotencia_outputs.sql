-- 005_idempotencia_outputs.sql — índice de outputs.external_id parcial → completo (idempotencia #6)
-- Aplicar DESPUÉS de 001–004. SQL Editor de Supabase → pegar → Run.
-- No edita los anteriores; reemplaza un índice. Cambios futuros = 006_*.sql.
--
-- Por qué:
--   El archivado (carril C) debe ser idempotente: re-correr no debe duplicar filas del histórico ni
--   perder candidatos nuevos del batch. El plan era usar el upsert de PostgREST
--   (POST + Prefer: resolution=ignore-duplicates, on_conflict=external_id), pero el índice creado en
--   001 era PARCIAL (`where external_id is not null`) y Postgres NO lo acepta como arbiter de
--   ON CONFLICT sin repetir el predicado en la cláusula — algo que PostgREST no emite.
--   Verificado en vivo (2026-06-17): on_conflict=external_id → 42P10 "no unique or exclusion
--   constraint matching the ON CONFLICT specification".
--
-- Qué cambia:
--   Se quita el predicado `where external_id is not null`. El comportamiento para NULLs es IDÉNTICO
--   (Postgres trata los NULL como distintos en un índice UNIQUE → siguen permitidos múltiples NULL),
--   pero ahora el índice SÍ sirve como arbiter de ON CONFLICT (external_id) → el upsert del archivado
--   ignora duplicados sin reventar el batch.

drop index if exists outputs_external_id_key;

create unique index outputs_external_id_key on outputs (external_id);
