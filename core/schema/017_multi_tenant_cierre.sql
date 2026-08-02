-- 017_multi_tenant_cierre.sql — el cierre de la `016`: acá el aislamiento se vuelve real.
-- Gobernada por ADR-046 y ADR-048. Plan: docs/agents/plan-multi-tenant.md §4 y §7.
--
-- ⛔ **NO se corre junto con la `016`.** Va DESPUÉS del re-import de la Fase 4, con una corrida
--    de verificación verde encima. Antes de eso rompe cosas que hoy funcionan:
--      · matar `processed_items_platform_external_id_key` deja al motor con un
--        `on_conflict=platform,external_id` sin arbiter ⇒ **42P10**, y el insert del dedup muere
--        entero, ANTES de transcribir;
--      · idem `outputs_external_id_key` con el `on_conflict=external_id` del archivado, y ese
--        muere DESPUÉS de haber pagado Apify, Supadata y Haiku;
--      · los `not null` tumban cualquier insert que todavía no mande el tenant.
--
-- La `016` dejó todo listo y funcionando con un tenant; esta es la que cobra. **Mientras esta no
-- corra, el dedup sigue siendo global y los defaults siguen atribuyendo todo al piloto** — o sea
-- que el segundo cockpit NO se puede prender.

-- ═════════════════════════════ §0 · La confirmación humana ═════════════════════════════
-- No hay forma de que el SQL verifique solo que el re-import ya pasó: desde la base, una fila
-- escrita con el default y una escrita por un workflow re-importado son idénticas. Así que el
-- gate es explícito y se firma a mano.

create temporary table if not exists _cierre (confirmado boolean);
delete from _cierre;

-- ⬇️ DESCOMENTAR solo si las tres son ciertas:
--    1. el motor y el archivado están re-importados y publicados (Fase 4, los 6 placeholders);
--    2. sus URLs de PostgREST ya llevan la instancia — ver el checklist del handoff;
--    3. hubo UNA corrida completa verde después del re-import.
-- insert into _cierre values (true);

do $gate$
begin
  if not exists (select 1 from _cierre where confirmado) then
    raise exception
      '017: falta confirmar el re-import. Leé la cabecera y descomentá el insert de _cierre. (Si todavía no re-importaste, no corras este archivo.)';
  end if;
end
$gate$;


-- ══════════════ §1 · Se cae el puente: `not null` y adiós a los defaults ══════════════
-- Los defaults de la `016` existían para que el BFF y n8n pudieran seguir insertando sin mandar
-- el tenant. Ese permiso se acaba acá: a partir de ahora, olvidarse del tenant es un error de
-- Postgres, no una fila atribuida en silencio al piloto.
--
-- ⚠️ El orden importa una vez más: primero el `not null` (que valida lo que ya está), después el
-- `drop default`. Al revés, cualquier insert que entre entre las dos sentencias falla.

alter table app.usuarios   alter column client_id set not null;
alter table app.voces      alter column client_id set not null;
alter table app.proyectos  alter column client_id set not null;
alter table app.referentes alter column client_id set not null;

alter table app.candidatos            alter column instance_id set not null;
alter table app.descartes             alter column instance_id set not null;
alter table app.referentes_propuestos alter column instance_id set not null;
alter table app.eventos               alter column instance_id set not null;
alter table app.transcripciones       alter column instance_id set not null;

alter table app.usuarios   alter column client_id drop default;
alter table app.voces      alter column client_id drop default;
alter table app.proyectos  alter column client_id drop default;
alter table app.referentes alter column client_id drop default;

alter table app.ajustes               alter column instance_id drop default;
alter table app.candidatos            alter column instance_id drop default;
alter table app.descartes             alter column instance_id drop default;
alter table app.referentes_propuestos alter column instance_id drop default;
alter table app.eventos               alter column instance_id drop default;
alter table app.transcripciones       alter column instance_id drop default;


-- ═════════════════ §2 · Muere el dedup global — la reparación de fondo ═════════════════
-- 🩸 Es la que más importa y la que menos se ve. Con el unique global, la segunda empresa que
-- vigile un referente en común recibe casi nada, y el síntoma no es un error: es "el motor no
-- trae contenido". El unique por instancia ya existe desde la `016`; acá se saca el viejo.

alter table processed_items drop constraint processed_items_platform_external_id_key;
drop index processed_items_lookup;   -- lo reemplaza processed_items_lookup_instancia (016)

-- Lo mismo en el histórico canónico: dos empresas pueden tener el mismo `external_id` en dos
-- destinos nativos distintos (dos Sheets, dos filas, mismo id) y hoy colisionan.
drop index outputs_external_id_key;  -- lo reemplaza outputs_instancia_external_id_key (016)


-- ═══════════════════════════ Verificación ═══════════════════════════
-- 1. No quedó ningún default puente vivo (tiene que dar 0 filas):
--      select table_schema, table_name, column_name, column_default
--      from information_schema.columns
--      where column_name in ('client_id', 'instance_id') and column_default is not null;
--
-- 2. El dedup ya es por instancia (tiene que aparecer `processed_items_dedup_key` y NO
--    `processed_items_platform_external_id_key`):
--      select indexname from pg_indexes where tablename = 'processed_items';
--
-- 3. La prueba que de verdad lo demuestra, y va con datos (plan §11.2, #3): el mismo
--    `external_id` entra UNA VEZ POR INSTANCIA. Con dos instancias de prueba:
--      select platform, external_id, count(*) from processed_items
--      group by 1, 2 having count(*) > 1;   -- ahora SÍ puede dar filas, y eso es lo correcto
--
-- 4. Y el paso 7 de la prueba de fuego (plan §11.3), que es un `select` y no un vistazo:
--    10 videos distintos por instancia, y que la segunda no vio nada de la primera.
