-- 033_grabado_en.sql — Se va la columna que la marca de grabado dejó de usar.
-- Aplicar DESPUÉS de la `029`. SQL Editor de Supabase → pegar → Run.
--
-- Es el paso **contract** de [ADR-070](../../docs/adr/ADR-070-la-marca-de-grabado-es-por-video.md);
-- no decide nada nuevo. La `028` puso `grabado_en` en `app.transcripciones`, la `029` mudó la marca
-- a `app.grabados` (clave por VIDEO, que alcanza a los tres carriles) y copió lo que había. Desde
-- entonces la columna **no la lee ni la escribe nadie** — sale del tipo `Transcripcion` en
-- `lib/transcripciones.ts` y las únicas menciones que quedan en el repo son comentarios contando
-- esta historia.
--
-- ⏳ **Por qué recién ahora y no el mismo día.** Expand/contract: mientras la columna existe, un
-- rollback del deploy al código anterior vuelve a encontrarla. Dropearla el día uno no rompe nada y
-- deja sin red al rollback, así que se espera. La `029` se aplicó el 2026-08-20 y llegó a prod ese
-- mismo día; esto es un día después, con el código nuevo corriendo y sin incidentes.
--
-- 🔬 **Medido contra prod el 2026-08-21, antes de escribir una línea de esto:**
--
--   · `app.transcripciones`                       → **130** filas.
--   · con `grabado_en` no nulo                    → **1**.
--   · esa 1, ¿está en `app.grabados`?             → **sí**.
--   · marcas que viven SOLO en la columna         → **0**.
--
-- O sea que el drop no pierde ni un hecho. La única marca que la columna tenía es del canario del
-- 18/08 (Mani probando el botón), y la `029` ya la copió.
--
-- 🔒 **Y aun así el drop es CONDICIONAL, no a ciegas.** El §1 vuelve a hacer esa cuenta **en el
-- momento de correr**, contra los datos que haya ese día, y solo dropea si da cero. Si alguien
-- marcó algo entre la medición y el Run —o si esto se corre en otra base— la migración **no borra y
-- avisa**, en vez de tirar la única copia de un dato que nadie puede reconstruir. Medir el martes no
-- autoriza a borrar el jueves.
--
-- Idempotente: si la columna ya no está, no hace nada y lo dice.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Mismo molde que la `029`: afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo
-- qué correr. La lección de la `019` es que un `raise` aborta la transacción entera, así que acá
-- solo se levanta por lo que hace **imposible** seguir, nunca por estado dudoso.

do $guardas$
begin
  if to_regclass('app.transcripciones') is null then
    raise exception '033: falta app.transcripciones. Corré la 010 primero.';
  end if;

  -- Sin la tabla nueva, dropear la columna deja al sistema SIN NINGÚN lugar donde vivan las marcas.
  -- Es el único error irreversible que esta migración podría cometer.
  if to_regclass('app.grabados') is null then
    raise exception '033: falta app.grabados — sin ella el drop borraría la única copia de las marcas. Corré la 029 primero.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · El drop, si y solo si no pierde nada ═══════════════════════

do $contract$
declare
  huerfanas bigint;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'app' and table_name = 'transcripciones' and column_name = 'grabado_en'
  ) then
    raise notice '033: la columna ya no está. Nada que hacer.';
    return;
  end if;

  -- La cuenta que autoriza el borrado: marcas de la columna vieja que NO tienen fila en la tabla
  -- nueva. La comparación es por la clave entera (instancia + video), que es la de `app.grabados`.
  select count(*)
    into huerfanas
    from app.transcripciones t
   where t.grabado_en is not null
     and not exists (
       select 1 from app.grabados g
        where g.instance_id = t.instance_id
          and g.plataforma  = t.plataforma
          and g.external_id = t.external_id
     );

  if huerfanas > 0 then
    -- No se levanta excepción: abortar dejaría la duda de si algo entró. Se dice qué pasa, qué
    -- correr para arreglarlo, y la columna se queda donde está.
    raise notice '033: NO se dropeó nada. Hay % marca(s) que solo viven en app.transcripciones.grabado_en.', huerfanas;
    raise notice '033: copialas primero con el insert del §2 (comentado abajo) y volvé a correr esto.';
    return;
  end if;

  alter table app.transcripciones drop column grabado_en;
  raise notice '033: columna grabado_en dropeada. La marca vive solo en app.grabados.';
end
$contract$;


-- ═══════════════════════ §2 · El rescate, si hiciera falta ═══════════════════════
--
-- Solo si el §1 avisó que hay huérfanas. Es el mismo backfill de la `029`, acotado a lo que quedó
-- afuera. Después de correrlo, volver a correr esta migración entera.
--
--   insert into app.grabados (instance_id, plataforma, external_id, url, grabado_en)
--   select t.instance_id, t.plataforma, t.external_id, t.url, t.grabado_en
--     from app.transcripciones t
--    where t.grabado_en is not null
--   on conflict (instance_id, plataforma, external_id) do nothing;


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
--   -- 1. La columna ya no está (esperado: 0 filas)
--   select column_name from information_schema.columns
--    where table_schema = 'app' and table_name = 'transcripciones' and column_name = 'grabado_en';
--
--   -- 2. Las marcas siguen enteras (esperado: el mismo número que antes de correr esto — 294 al 21/08)
--   select count(*) from app.grabados;
--
--   -- 3. La pantalla sigue viva: Transcribir carga, una tanda abre y sus badges "✓ Grabado" están.
--      Es la prueba de que nadie leía la columna, medida donde se ve y no en el código.
