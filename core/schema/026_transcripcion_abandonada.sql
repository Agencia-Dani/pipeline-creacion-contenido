-- 026 — El transcriptor entra al sistema: `abandonado` y `transcripcion_a_pedido`.
--
-- ADR-062 §4. La cierra el equipo desde la pantalla, no la máquina: el caso que la pidió es un
-- video sin voz (solo música), donde el reintento —construido el 2026-08-07 y que funciona— no
-- puede ganar nunca, porque el problema no es transitorio.
--
-- 🔑 **Por qué NO se llama `descartado`, que era la palabra obvia.** En este dominio *descartar* es
-- siempre un **juicio de mérito**: el gate rechazó el video (Descarte del gate) o el equipo le puso
-- 👎 (`candidatos.estado = 'descartado'`). Un video sin voz no es malo, es **inservible como
-- insumo** — y la diferencia no es filosófica: un `descartado` de candidatos alimenta el
-- aprendizaje como clase negativa, y esto no debe alimentar nada. El commit del día anterior a esta
-- migración se llama *«Sin voz» nombraba dos cosas distintas en la misma app*; esto es no volver a
-- hacerlo.
--
-- 🩸 **La fila QUEDA, y ese es el punto.** Borrarla habría sido la migración cero, pero la fila es
-- la memoria de que ese link ya se pidió: sin ella, el `ignoreDuplicates` de `encolarEnlaces` no
-- tiene contra qué chocar, alguien vuelve a pegar el mismo link, se vuelve a pagar y vuelve a
-- fallar. El costo por vuelta es de centavos; el que molesta es que el problema **vuelve**.
--
-- No hay backfill: ninguna fila existente pasa a `abandonado` sola. Las 57 de hoy (56 `listo` + 1
-- `pendiente`) se quedan donde están.
--
-- Idempotente: `drop constraint if exists` antes del `add`, así correrla dos veces es inofensivo
-- —el mismo criterio de la `024` y la `025`— y no hay que adivinar si el primer intento entró.

alter table app.transcripciones
  drop constraint if exists transcripciones_estado_check;

alter table app.transcripciones
  add constraint transcripciones_estado_check
  check (estado in ('pendiente', 'listo', 'sin_transcript', 'fallo', 'abandonado'));

comment on column app.transcripciones.estado is
  'pendiente → listo | sin_transcript | fallo | abandonado. Los tres primeros los escribe el '
  'transcriptor; `abandonado` lo cierra el equipo cuando el enlace nunca va a dar un script '
  '(ADR-062). Abandonar NO es descartar: descartar es juicio de mérito, esto es insumo roto.';


-- ═══════════════════ §2 · El tipo con el que el transcriptor entra al histórico ═══════════════════
--
-- 🩸 **Esto NO estaba previsto, y la ADR-062 decía lo contrario cuando se escribió.** El header de
-- la `001` dice *"el catálogo de outputs.tipo queda SIN check duro a propósito"* — y la frase sigue:
-- *"cuando se selle, se agrega el check en 002"*. **La `002` lo selló** (`outputs_tipo_chk`, línea
-- 55). Leer la primera mitad del comentario y no la segunda es lo que hizo creer que un tipo nuevo
-- no pedía migración.
--
-- Lo cazó un sondeo contra prod **sin escribir nada**: el POST con la forma exacta de
-- `registrarEnHistorico` devolvió **23514** (check violado), y el mismo POST con `tipo =
-- 'guion_reel'` devolvió **23503** (pasó la validación, abortó por la FK del `run_id` falso). O sea
-- que el resto de la fila —`estado`, `metadata`, `calificado_en`, `external_id`— ya estaba bien y
-- lo único que faltaba era el catálogo.
--
-- 🔑 **Por qué un tipo propio y no `guion_reel`.** Un enlace pegado produce el mismo *artefacto*
-- que el motor —un guion literal de un reel— así que por forma podría ser `guion_reel`. Pero en
-- este esquema `tipo` no es solo taxonomía: **es el discriminador que usan las vistas**
-- (`v_metricas_calidad` y las 5 de la `016` filtran `tipo = 'guion_reel'`). Compartir el valor
-- metería transcripciones a mano en la precisión de entrega y en la señal por referente, que miden
-- el juicio del equipo sobre lo que trajo el MOTOR. Un tipo propio las deja fuera por construcción,
-- sin un solo `where` nuevo.

alter table outputs drop constraint if exists outputs_tipo_chk;

alter table outputs
  add constraint outputs_tipo_chk
  check (tipo in ('guion_reel', 'research_item', 'borrador_newsletter', 'nugget',
                  'transcripcion_a_pedido'));


-- ── Verificación (correr después, en el mismo SQL Editor) ────────────────────────────────────
--
-- El check acepta el valor nuevo y sigue rechazando basura:
--   select 'abandonado'::text = any (enum_range(null::text)::text[]);  -- no aplica: es un CHECK
--
-- Lo honesto es probarlo contra la tabla, en una transacción que se revierte:
--
--   begin;
--     update app.transcripciones set estado = 'abandonado'
--      where id = (select id from app.transcripciones where estado = 'listo' limit 1);
--     -- tiene que dar 1 fila actualizada, sin error
--     update app.transcripciones set estado = 'inventado'
--      where id = (select id from app.transcripciones where estado = 'listo' limit 1);
--     -- tiene que fallar con 23514 (violates check constraint)
--   rollback;
--
-- Y el §2, que es el que este archivo casi no tiene. Se mide por su efecto desde afuera, con el
-- mismo POST que hace la app y un `run_id` inexistente:
--
--   POST /rest/v1/outputs  {"run_id":"00000000-…","tipo":"transcripcion_a_pedido", …}
--
--   ANTES de la migración → 23514 (violates check constraint "outputs_tipo_chk")
--   DESPUÉS              → 23503 (violates foreign key "outputs_run_id_fkey")
--
-- El 23503 es el verde: significa que pasó la validación de schema entera y solo abortó por el
-- `run_id` falso, que es lo único que se puso mal a propósito. **No escribe ninguna fila.**
