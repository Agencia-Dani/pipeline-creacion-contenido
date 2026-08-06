-- 022_poda_balde_2.sql — la primera mitad de la limpieza de D8: se va lo que nadie escribe.
-- Gobernada por ADR-059 (lo que no se usa no existe). Inventario: docs/agents/plan-cockpit-propio.md
-- §D8 "La balde 2".
--
-- ✅ **Esta migración se corre sola y no coordina con nadie.** Es toda la gracia de partir la poda
--    en dos: acá solo caen objetos que **ningún escritor toca** —cinco vistas (una vista no la
--    escribe nadie, por definición) y cuatro columnas que ningún workflow ni la app mandan en un
--    body—, así que no hay forma de que un drop deje un `POST` mandando una columna que ya no
--    existe. No lleva gate humano, a diferencia de la `017` y la `019`, porque no hay nada que
--    confirmar: el `insert` que la habilitaría no tendría qué preguntar.
--
-- ⛔ **Lo que NO está acá, y por qué (leer antes de "completar" la poda):**
--
--    1. **Las 7 columnas write-only van a la `023`**, no acá: `processed_items.url`,
--       `.seguidores`, `.flag_viral`, `.idioma`, `.run_id`, `outputs.source_items` y
--       `transcripciones.pedido_por`. Hoy alguien las escribe, y PostgREST rechaza el **insert
--       entero** con `PGRST204` si el body trae una columna inexistente (medido el 2026-08-05).
--       Los dos POST que las mandan son `onError: continueRegularOutput`, o sea que el 400 **se
--       traga**: el motor cerraría en verde sin escribir la memoria del dedup (⇒ la corrida
--       siguiente re-trae y re-paga los mismos videos, los 15 duplicados del 20→21/07 otra vez), y
--       el archivado cerraría en verde habiendo **borrado los calificados sin archivarlos**. Por
--       eso la `023` va DESPUÉS del `n8n:push` que deja de escribirlas, con corrida verde encima, y
--       lleva el gate `§0` de la `019`.
--
--    2. **`clients.parent_id` se queda**, con su índice, su función y su trigger anti-ciclo.
--       Está en 0 de 3 y ningún código la lee, pero no es un vestigio: **ADR-051 §4 la conservó a
--       propósito** como linaje (facturación, agrupar el selector, reportes) al sacarle el gobierno
--       del acceso. Decisión de Mani, 2026-08-05: se queda. No la agregues acá.
--
-- 📌 **Orden interno:** las vistas primero, las columnas después. `v_corpus_aprobados` lee
--    `outputs.publicado_en` y `v_outputs_recientes` lee `runs.costo_estimado`: al revés, los dos
--    `drop column` necesitarían `cascade` y se llevarían la vista por el costado, en silencio.
--
-- 🔁 **Cache de PostgREST:** Supabase la recarga sola con su event trigger de DDL. Si algún cliente
--    queda viendo el schema viejo, `notify pgrst, 'reload schema';`.
--
-- 🧪 **Para el rebuild `001→022` desde cero** (el Postgres en Docker con el que se verificaron la
--    `017`, la `019` y la `021`): esta migración corre **al final y sin cambios**. Las 5 vistas
--    nacen en la `001`/`002`/`003`/`006`, la `016` las recrea y la `021` les pone `security_invoker`
--    — todo eso sigue pasando, y recién acá caen. Es feo (se crea algo para borrarlo 20 archivos
--    después) y es lo correcto: **una migración es un hecho histórico, no el estado deseado.**
--    Editar la `021` para que no las nombre haría que el archivo dejara de describir lo que pasó en
--    prod el 2026-08-03, que es justo lo que hace confiable a esta carpeta.


-- ═════════════════════════ §1 · Las 5 vistas sin consumidor ═════════════════════════
-- Medido el 2026-08-05 contra los 5 `workflow.json` vivos, `apps/dashboard/` y las definiciones del
-- propio schema: ninguna aparece en un `select` de código. Las 6 vistas de `app.` NO se tocan —
-- esas son *Entender* y `referentes.ts`, y están todas vivas.
--
-- Ninguna de las 5 sostiene a otra vista (verificado: cero `from`/`join` entre ellas), así que el
-- orden entre ellas da igual y no hace falta `cascade`. Los grants y el `security_invoker` que les
-- puso la `021` se van con el drop.
--
-- ⚠️ Cuatro de las cinco tenían dueño DOCUMENTADO, y por eso esto necesitó un ADR y no un commit:
--   · `v_senal_tema`             → ADR-019 §4 la dejó inerte a propósito y descartó por escrito
--                                  esta misma migración; ADR-017 la quería como sustrato para
--                                  reactivar el eje keyword. ADR-059 lo enmienda, apoyado en la
--                                  salida que el propio ADR-019 dejó escrita ("si el eje vuelve,
--                                  se reconstruye desde este ADR y el historial de git").
--   · `v_corpus_aprobados`       → "en pausa" desde ADR-009 (few-shot por voz; el motor v1 nunca
--                                  la consultó).
--   · `v_historico_seleccionados`
--     y `v_selecciones_por_dia`  → criterio de aceptación de ROADMAP §C3, de ítems ya cerrados.
--                                  El histórico que servían hoy lo sirve `/curar/historicos` +
--                                  el export CSV de ADR-057, los dos sobre `outputs`.
--   · `v_outputs_recientes`      → la citaba §Verificación de `core/contracts/ingesta-registro.md`
--                                  como el chequeo post-corrida en el SQL Editor. El contrato se
--                                  recorta en el mismo commit, con una query sobre `outputs`.

drop view if exists v_outputs_recientes;
drop view if exists v_selecciones_por_dia;
drop view if exists v_corpus_aprobados;
drop view if exists v_historico_seleccionados;
drop view if exists v_senal_tema;


-- ═══════════════ §2 · Las 3 columnas que nadie escribe ni lee ═══════════════

-- `outputs.publicado_en` — 0 de 88 filas no-null: en toda la vida del sistema nadie la escribió.
-- Su único lector era `v_corpus_aprobados`, que acaba de caer en el §1. Nace en la `001`, del
-- diseño donde una pieza se publicaba desde el sistema; el MVP nunca publicó nada.
alter table outputs drop column publicado_en;

-- `runs.costo_estimado` — 41 corridas: 36 NULL y 5 en 0, y los ceros son viejos, de cuando alguien
-- copió la plantilla del contrato al pie de la letra. Ninguno de los 5 workflows la manda hoy
-- (grep: 0 en los cinco).
-- **No es un dato que falte: es una segunda fuente de verdad.** El costo de este sistema es
-- *contadores en `runs.metricas` × `app.tarifas`*, y eso ya vive y funciona en `app.v_costos_semana`
-- (`008`/`016`). Un número guardado por corrida competiría con ese cálculo y, encima, se
-- desactualizaría solo cuando alguien edite una tarifa.
-- ⚠️ Se recorta EN EL MISMO COMMIT de `core/contracts/ingesta-registro.md` §3, que la declaraba en
-- el PATCH de cerrar run. Sin eso, el próximo pipeline (LinkedIn, ADR-055) copia la plantilla y su
-- primer cierre de corrida se come un 400.
alter table runs drop column costo_estimado;

-- `instances.config_ref` — 1 de 4, y vale `clients/piloto/short-form-content.yaml`: la ruta a un
-- archivo de config por-cliente del mundo de `core/scripts/deploy.mjs`, que está **deprecado**
-- (CLAUDE.md §Feedback loops). La config de una instancia vive en Postgres desde D5 y se sirve por
-- la fachada (ADR-028). La columna apunta a un archivo que ya no gobierna nada.
alter table instances drop column config_ref;


-- ═════════════════ §3 · Las 6 `airtable_id` — el último vestigio del corte ═════════════════
-- La identidad de la sombra (`009`): cada tabla espejada llevaba el record id de Airtable, y el
-- import upserteaba por esa clave. Su único lector vivo era `apps/dashboard/scripts/cortar-feed.ts`,
-- cuyo trabajo terminó con D7. `app.ajustes` ya la había perdido en la `013`, por lo mismo.
--
-- 🔎 **No están gateadas por el export final de Airtable, y eso se decidió midiendo:** eran la
-- clave de join para reconciliar el export contra las filas vivas, pero el dato de estas 6 tablas
-- ya vive en Postgres y se verificó **idéntico** antes de cortar (D7, cierre 76). Reconciliar sería
-- comparar una copia contra su original. (De paso: el export CSV de Airtable no trae el record id
-- salvo que se agregue un campo `RECORD_ID()`, así que ese join tampoco existiría.)
--
-- ✅ **Y el export final tampoco hace falta, medido el 2026-08-05.** Las 2 tablas que nunca se
--    migraron —`Métricas Proyectos` y `Métricas Global`— eran **proyección derivada y regenerable**
--    (lo dice el propio contrato congelado): su verdad cruda es `runs.metricas` + `outputs`, que
--    están acá. Las 4 vistas de `app.` las reconstruyen campo por campo —`v_metricas_calidad`,
--    `v_embudo_semana`, `v_costos_semana`, `v_embudo_descubrimiento`— y cubren **desde el
--    2026-06-29**, o sea más historia que la que esas tablas llegaron a tener (se partieron en dos
--    el 2026-07-15). **Cancelar la cuenta no pierde nada.**

alter table app.voces                 drop column airtable_id;
alter table app.proyectos             drop column airtable_id;
alter table app.referentes            drop column airtable_id;
alter table app.candidatos            drop column airtable_id;
alter table app.descartes             drop column airtable_id;
alter table app.referentes_propuestos drop column airtable_id;


-- ═════════════════════════════ §4 · Verificación ═════════════════════════════
-- Después de correr esto, en el SQL Editor. Las tres tienen que dar CERO filas.
--
--   -- 1. Las 5 vistas se fueron (y las 6 de `app.` siguen):
--   select table_schema, table_name from information_schema.views
--    where table_name in ('v_outputs_recientes','v_selecciones_por_dia','v_corpus_aprobados',
--                         'v_historico_seleccionados','v_senal_tema');
--
--   -- 2. Las 3 columnas se fueron:
--   select table_name, column_name from information_schema.columns
--    where (table_name, column_name) in
--          (('outputs','publicado_en'), ('runs','costo_estimado'), ('instances','config_ref'));
--
--   -- 3. Ninguna `airtable_id` quedó viva:
--   select table_schema, table_name from information_schema.columns
--    where column_name = 'airtable_id';
--
-- Y una que tiene que seguir dando SEIS, porque es lo que esta migración NO tocó:
--
--   select count(*) from information_schema.views where table_schema = 'app';   -- 6
--
-- 🩸 **El chequeo que de verdad importa es el de afuera**, y no lo puede hacer el SQL: que la
-- corrida siguiente del motor cierre en verde **y escriba la memoria del dedup**. Nada de lo que
-- cae acá lo toca —la clave del dedup es el unique `(instance_id, platform, external_id)` de la
-- `016` y `Leer procesados` pide `select=external_id,platform`—, pero es el invariante que no se
-- puede perder, y es barato mirarlo:
--
--   select count(*) from processed_items where run_id = '<el run de la corrida>';
--
-- (Ese `run_id` se va en la `023`; hasta entonces sirve para exactamente esto.)
