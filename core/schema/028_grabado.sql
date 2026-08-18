-- 028_grabado.sql — La marca de "ya se grabó" en la cola de enlaces pegados.
-- Aplicar DESPUÉS de la `027`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-069](../../docs/adr/ADR-069-grabado-es-un-estado-del-sistema.md).
--
-- 🩸 **De dónde sale.** Majo reportó que la herramienta "saca repetidos". Se midió y es falso: 977
-- filas en `processed_items` con 977 `external_id` distintos, y los 12 eventos `transcribir.pegar`
-- con `ya_estaban: 0` en los 12. Pero adentro del reporte había un hecho verdadero: el equipo grabó
-- videos que después volvieron a aparecer en una lista, y **el sistema no tenía dónde anotarlo**.
-- El ciclo se corta en la calificación: un guion sale hacia un Google Doc, se graba, y nada vuelve.
--
-- 🔑 **Por qué una columna y no un valor de `estado`** (ADR-069 §1). Acá `estado` es el ciclo de
-- vida del TRABAJO de transcribir (`pendiente → listo | sin_transcript | fallo | abandonado`), y
-- grabar es **ortogonal**: un `listo` puede estar grabado o no. Pisarlo perdería el resultado por el
-- que ya se pagó, y hay tres funciones que filtran por ese campo (`reclamarPendientes`, `reencolar`,
-- `abandonar`) — las tres empezarían a mentir en silencio.
--
-- 🔑 **Por qué NO va también en `app.candidatos`** (ADR-069 §2), que era lo simétrico: el motor **no
-- puede** proponer dos veces el mismo video. `processed_items` tiene su unique y se escribe con todo
-- lo que el motor consideró, antes del gate — medido el 2026-08-18: **los 298 videos entregados
-- tienen su marca ahí, 298/298, en las 7 fechas de entrega**. En ese carril la repetición ya es
-- imposible por construcción, así que la columna habría nacido sin escritor, que es exactamente lo
-- que la `023` (ADR-059) acaba de podar.
--
-- 🔑 **Por qué no se reusa `outputs.estado = 'publicado'`**, que existe en el check de la `001` desde
-- siempre y tiene 0 filas. Porque `outputs.external_id` significa **dos cosas distintas** según el
-- carril, medido: uuid del candidato en 93 `guion_reel`, record id de Airtable en otros 79, e id
-- numérico del video en los 128 `transcripcion_a_pedido`. Sin clave por video no se puede preguntar
-- "¿este video ya se grabó?". Y `leerAprobados` filtra `estado = 'aprobado'`, así que mover una fila
-- a `publicado` **la sacaría del histórico que lee el jefe**.
--
-- Sin backfill: ninguna fila existente pasa a grabada sola. Nadie sabe cuáles se grabaron —esa es
-- justamente la información que falta— y adivinarlo llenaría la señal de ruido en el día uno.
--
-- Sin índice: el filtro nunca entra solo. `cualesGrabadas` pregunta
-- `where external_id in (...) and grabado_en is not null`, y el `in` ya lo resuelve el unique
-- `(instance_id, plataforma, external_id)` de la `016`. Un índice sobre `grabado_en` sería una
-- estructura para una pregunta que nadie hace.
--
-- Idempotente: `add column if not exists`, así correrla dos veces es inofensivo (mismo criterio que
-- la `024`, la `025` y la `026`) y no hay que adivinar si el primer intento entró.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo qué correr. La lección de la
-- `019` es que un `raise` sobre estado dudoso aborta la transacción entera y deja la migración
-- "corrida" sin haber entrado, así que acá solo se afirma lo que es binario.

do $guardas$
begin
  if to_regclass('app.transcripciones') is null then
    raise exception '028: falta app.transcripciones. Corré la 010 primero.';
  end if;

  -- La app escribe la marca con la sesión del usuario (Capa 2, ADR-058), no con `service_role`.
  -- Sin `update` sobre la tabla, el toggle muere con `42501` y la fila se queda sin marcar. El
  -- grant está desde la `021` §2 — pero ese grant es una foto del momento en que corrió, no una
  -- regla, así que afirmarlo cuesta menos que asumirlo.
  if not has_table_privilege('authenticated', 'app.transcripciones', 'update') then
    raise exception '028: authenticated no puede escribir app.transcripciones — el toggle daría 42501. Corré la 021 primero.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La marca ═══════════════════════

alter table app.transcripciones
  add column if not exists grabado_en timestamptz;

comment on column app.transcripciones.grabado_en is
  'Cuándo el equipo grabó el video de este enlace. NULL = no grabado, que es el estado normal. '
  'Es ORTOGONAL a `estado`: un `listo` puede estar grabado o no (ADR-069 §1). Lo escribe el toggle '
  'de la fila en la zona Transcribir, en las dos direcciones — marcar por error no destruye nada. '
  'Lo lee `revisarPegote` para avisar "N de estos ya se grabaron" ANTES de pagar Supadata + Haiku, '
  'y ese aviso gana precedencia sobre los otros tres (ADR-069 §4).';


-- ── Verificación (correr después, en el mismo SQL Editor) ────────────────────────────────────
--
-- 1. La columna existe y arranca vacía. Tiene que dar `0` sobre las 129 filas de hoy:
--
--      select count(*) filter (where grabado_en is not null) as grabadas,
--             count(*)                                       as total
--        from app.transcripciones;
--
-- 2. La marca se pone y se saca, en una transacción que se revierte:
--
--      begin;
--        update app.transcripciones set grabado_en = now()
--         where id = (select id from app.transcripciones where estado = 'listo' limit 1);
--        -- 1 fila, sin error
--        update app.transcripciones set grabado_en = null
--         where id = (select id from app.transcripciones where grabado_en is not null limit 1);
--        -- 1 fila, sin error: desmarcar devuelve el estado exacto
--      rollback;
--
-- 3. **La que de verdad importa: que `estado` no se haya tocado.** El punto entero de que sea una
--    columna aparte es que grabar no pisa el resultado de la transcripción:
--
--      begin;
--        update app.transcripciones set grabado_en = now() where estado = 'listo';
--        select estado, count(*) from app.transcripciones group by estado;
--        -- el reparto tiene que ser IDÉNTICO al de antes del update
--      rollback;
--
-- 4. Y el modo de falla de la app, medido desde afuera sin escribir nada — un PATCH con la forma
--    exacta del toggle y un `id` inexistente:
--
--      PATCH /rest/v1/transcripciones?id=eq.00000000-0000-0000-0000-000000000000
--            {"grabado_en": "2026-08-18T00:00:00Z"}       (Content-Profile: app)
--
--      ANTES de la migración → PGRST204 (no existe la columna `grabado_en`)
--      DESPUÉS              → 200 con `[]` (la columna existe; 0 filas porque el id es falso)
--
--    El `[]` es el verde: significa que el body pasó la validación de schema entera y lo único que
--    no matcheó fue el id, que es lo único que se puso mal a propósito. **No escribe ninguna fila.**
