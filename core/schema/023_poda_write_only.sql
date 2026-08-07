-- 023_poda_write_only.sql — la segunda mitad de la limpieza de D8: se van las columnas que
-- alguien escribía y nadie leía. Gobernada por ADR-059. Hermana de la `022`, que ya está aplicada.
--
-- ⛔ **ESTA NO SE CORRE SOLA.** La `022` podía porque nada escribía lo que dropeaba; acá es al
--    revés, y el modo de falla es de los mudos:
--
--      PostgREST rechaza el **insert entero** con `PGRST204` si el body trae una columna que no
--      existe (medido el 2026-08-05). Y los dos POST que mandaban estas columnas son
--      **`onError: continueRegularOutput`** — fail-open conservado a propósito por ADR-029. O sea
--      que el 400 **se traga**:
--
--        · `POST processed_items` → la corrida cierra **EN VERDE** sin escribir la memoria del
--          dedup ⇒ la corrida siguiente re-trae y **re-paga** los mismos videos. Es exactamente
--          el modo de falla de los 15 duplicados del 20→21/07.
--        · `Registrar outputs` → el archivado cierra **EN VERDE** habiendo **borrado los
--          calificados sin archivarlos** (`Borrar candidatos` está aguas abajo). Pérdida
--          irreversible del histórico.
--
--    Por eso el orden es: **primero se deja de escribir, después se dropea**, con una corrida
--    verde en el medio. El §0 lo hace cumplir.
--
-- ✅ **El lado "dejar de escribir" YA SALIÓ** (2026-08-05, commit de la sesión de ADR-059):
--    · `Preparar procesados` (motor) — empujado al live con `n8n:push`, `n8n:diff` limpio.
--    · `Armar filas archivado` (archivado) — ídem.
--    · `apps/dashboard/lib/transcripciones.ts` — `encolarEnlaces` ya no manda `pedido_por` y
--      `registrarEnDedup` ya no manda `url`/`flag_viral`. **Esto viaja por el deploy de Vercel**,
--      no por n8n: es la mitad que se olvida.
--    Lo que falta es **verlo correr**, que es lo único que el SQL no puede saber.
--
-- 🔎 **Qué NO está acá, y por qué** — `processed_items.run_id` y `.primera_vez` **se quedan**. El
--    inventario las había marcado write-only y estaba mal: las lee
--    `Workflows/workflow-short-form-content/verificar-corrida.mjs`, que es justamente la
--    herramienta que prueba que el dedup no trae duplicados (`run_id` = atribución exacta,
--    `primera_vez` = el fallback para corridas viejas), y `test-nodos.mjs` tiene 4 asserts sobre
--    `run_id`. *Fue la tercera vez que el método de la balde 2 sub-contó consumidores: el corpus
--    medía `apps/dashboard` y los `workflow.json`, y dejaba afuera los `.mjs` de herramientas.*


-- ═════════════════════════ §0 · La confirmación humana ═════════════════════════
-- El gate se firma a mano, igual que en la `017` y la `019`.
--
-- 🩸 **Pero la premisa de esta sección era falsa, y se corrigió midiendo (2026-08-07).** Decía:
-- *"Desde la base no hay forma de distinguir una corrida que ya no manda estas columnas de una que
-- todavía las manda: las dos escriben filas idénticas."* **No son idénticas: la que ya no las manda
-- las deja en NULL.** El contraste, contra prod:
--
--   · `processed_items` del run del **03/08** (`aa51af79`): `url` con la URL de Instagram,
--     `seguidores` 563277, `idioma` 'en'.
--   · `processed_items` del run del **06/08** (`12dcafa3`, el primero posterior al `n8n:push`):
--     `url` NULL, `seguidores` NULL, `idioma` NULL. Las 48 filas.
--   · Agregado: **772 de 820** filas tienen `url` — las 772 viejas. Las 48 nuevas, ninguna.
--   · `outputs` del archivado del **07/08** (`73dac44a`): `source_items` NULL en las 5.
--     Agregado: **88 de 93** lo tienen, y los 5 que faltan son los de esta corrida.
--
-- O sea que las condiciones 3 y 4 **sí se pueden verificar por su efecto**, y no solo por la
-- palabra de quien firma. Es la lección de la `019` aplicada acá: una migración con gate no se da
-- por lista porque alguien diga que sí, sino cuando se mide.
--
-- ⚠️ La que **no** se pudo medir así es `transcripciones.pedido_por`: solo la escribe la pantalla
-- de Transcribir, y nadie la usó desde el deploy. Ahí el gate sigue apoyado en la condición 2 (que
-- el deploy esté vivo), y hoy lo está — se comprobó por otra vía: las 5 calificaciones del 07/08
-- aterrizaron en `retia/reels` y no en el tenant que el bug del cockpit elegía antes del deploy.
-- Quedan **2 filas** con `pedido_por` no nulo, todas viejas.

create temporary table if not exists _cierre_poda (confirmado boolean);
delete from _cierre_poda;

-- ⬇️ DESCOMENTAR solo si las CUATRO son ciertas:
--    1. `npm run n8n:diff` limpio en los 5 (el live corre el repo, con los 2 nodos ya cambiados);
--    2. el deploy de Vercel con `lib/transcripciones.ts` está en producción;
--    3. hubo **una corrida del motor verde** después de eso, y escribió memoria de dedup:
--         select count(*) from processed_items where run_id = '<el run de esa corrida>';   -- > 0
--    4. hubo **un archivado verde** después de eso, y escribió histórico:
--         select count(*) from outputs where run_id = '<el run del archivado>';            -- > 0
--       (si esa semana no hubo calificados, el archivado cierra con 0 y NO sirve de prueba:
--        califiquen algo en `/curar/feed` y esperen al domingo, o dispárenlo a mano.)
--
-- ✅ **LAS CUATRO, MEDIDAS EL 2026-08-07 (madrugada UTC). Firmado por Mani; los números los tomó
--    el agente contra prod y contra la API de n8n, y están arriba.**
--
--    | # | Evidencia |
--    |---|---|
--    | 1 | `n8n:diff` → *"Los 5 workflows corren lo que dice el repo"* |
--    | 2 | deploy hecho por Mani el 06/08 de noche. Verificado por su efecto: las 5 calificaciones del 07/08 escribieron en `retia/reels`, cosa que antes del deploy no pasaba (bug del cockpit adivinado, `c267980`) |
--    | 3 | run `12dcafa3` (motor, 06/08 21:24→21:40, `ok`, exec 125) → **48 `processed_items` por `run_id`**, y `verificar-corrida.mjs 2` da `intersección: 0 ✓` sin caer en `⛔ NO CUENTA` |
--    | 4 | run `73dac44a` (archivado, 07/08 00:42, `ok`, exec 126, `archivados: 5`) → **5 `outputs` por `run_id`**, con `source_items` NULL en las 5 |
insert into _cierre_poda values (true);

do $gate$
begin
  if not exists (select 1 from _cierre_poda where confirmado) then
    raise exception
      '023: falta confirmar el push + el deploy + las 2 corridas verdes. Leé la cabecera y descomentá el insert de _cierre_poda. (Si todavía no corriste nada, NO corras este archivo: dropear antes deja al motor cerrando en verde sin memoria de dedup.)';
  end if;
end
$gate$;


-- ═══════════ §1 · `processed_items` — 4 columnas que el dedup nunca leyó ═══════════
-- El dedup lee `select=external_id,platform` (`Leer procesados`) y su clave es el unique
-- `(instance_id, platform, external_id)` de la `016`. Ninguna de estas 4 participa de ninguna de
-- las dos cosas, así que **la garantía de no-duplicados no se toca**. Tenían dato real (url 772/772,
-- seguidores 770, flag_viral 282 en true, idioma 770) y eso es traza forense, no lectura: la
-- decisión de ADR-059 es que lo que nadie lee no existe.

alter table processed_items drop column url;
alter table processed_items drop column seguidores;
alter table processed_items drop column flag_viral;
alter table processed_items drop column idioma;


-- ═══════════ §2 · `outputs.source_items` — trazabilidad que nadie consultó ═══════════
-- La escribía `Armar filas archivado` (y la declaraba `ingesta-registro.md` §2). Ninguna vista, ni
-- la app, ni ningún workflow la leyó nunca. Lo que sí se consulta del origen —el referente y su
-- url— vive en `outputs.metadata`, que la pantalla de Históricos y el export CSV sí usan.
-- ⚠️ Sale de `core/contracts/ingesta-registro.md` §2 en el mismo commit que esta migración: si el
-- contrato la sigue declarando, el primer pipeline nuevo (LinkedIn, ADR-055) copia la plantilla y
-- su primer `POST outputs` se come un 400.

alter table outputs drop column source_items;


-- ═══════════ §3 · `transcripciones.pedido_por` — auditoría duplicada ═══════════
-- La escribía `encolarEnlaces` y no la leía nadie: ninguna pantalla muestra quién pidió una
-- transcripción. **Quién pidió qué no se pierde** — el acto queda en `app.eventos`, que es donde
-- vive la auditoría desde D7. Es la única de las 6 que también borra una FK (a `app.usuarios`).

alter table app.transcripciones drop column pedido_por;


-- ═════════════════════════════ §4 · Verificación ═════════════════════════════
--
-- ✅✅ **APLICADA EL 2026-08-07 POR MANI, Y VERIFICADA POR SU EFECTO CONTRA PROD.** No hace falta
--     correr las dos queries de abajo: ya se midió lo mismo por PostgREST, que además prueba que
--     su schema cache se refrescó (si no, seguiría sirviendo las columnas viejas).
--
--       · `select=url` · `seguidores` · `flag_viral` · `idioma` · `outputs.source_items`
--         · `transcripciones.pedido_por`  →  **`42703` en las 6.**
--       · `select=external_id,platform,run_id,primera_vez`  →  **200 con dato.** Las 2 que se
--         quedan siguen ahí, que es la mitad de la verificación que se olvida.
--
-- 🔬 **Y se sondeó el camino de escritura sin escribir una sola fila**, que es lo que este gate
--    protegía y lo que ninguna de las queries de abajo contesta:
--
--       POST /processed_items  con la forma EXACTA del motor
--       ({instance_id, run_id, platform, external_id}) y un instance_id inexistente
--         → **23503** (FK). Pasó la validación de schema: con una instancia real, entra.
--
--       el mismo POST + "url"
--         → **PGRST204**. O sea que el modo de falla sigue siendo real y detectable — lo que
--           cambió es que ya nadie manda esa columna.
--
--    Nada quedó escrito: la FK aborta el insert antes de tocar la tabla.
--
-- Las dos primeras tienen que dar CERO filas:
--
--   select table_name, column_name from information_schema.columns
--    where (table_name, column_name) in
--          (('processed_items','url'), ('processed_items','seguidores'),
--           ('processed_items','flag_viral'), ('processed_items','idioma'),
--           ('outputs','source_items'), ('transcripciones','pedido_por'));
--
--   -- y las dos que NO se tocaron tienen que seguir:
--   select column_name from information_schema.columns
--    where table_name = 'processed_items' and column_name in ('run_id','primera_vez');   -- 2 filas
--
-- 🩸 **La verificación de verdad es la corrida siguiente, y es la misma de siempre:**
--
--   node Workflows/workflow-short-form-content/verificar-corrida.mjs 2
--
-- Tiene que decir **`intersección: 0 ✓ (∅, el dedup funciona)`** y contar los `processed_items`
-- **por `run_id`**, no por la ventana de `primera_vez`. Si cae a la ventana, la memoria de esa
-- corrida no se escribió y hay que mirar por qué antes de dejar pasar otro lunes.
--
-- ✅ **Desde el 2026-08-06 esto ya no depende de que quien firme se acuerde de mirarlo.** El script
-- distingue el ∅ del dedup del ∅ de una tabla vacía: si alguna de las dos corridas no dejó ninguna
-- fila, imprime **`⛔ NO CUENTA`** en vez del ✓. Era el agujero exacto de este gate — el modo de
-- falla es `PGRST204` tragado por `onError: continue`, o sea motor en verde y sin memoria, que es
-- indistinguible de un dedup perfecto si solo se lee el número.
