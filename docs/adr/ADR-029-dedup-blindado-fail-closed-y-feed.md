# ADR-029 — Dedup blindado: lectura fail-closed, memoria antes de entregar, `external_id` en el feed

> 🔴 **BANDERA 2026-07-31 (cierre 70): la parte "memoria ANTES de entregar" de este ADR NO ESTÁ EN
> VIGOR.** El reorden se hizo en el **array de conexiones**, pero el motor corre con
> `executionOrder: v1`, que ordena las ramas paralelas por **posición en el canvas** (y, luego x).
> Posiciones reales: `POST Airtable Candidatos` x=7560 · `Resumen del run` x=8200 ·
> `POST processed_items` x=8960 ⇒ **se entrega primero y se graba después**. Verificado con datos de
> la corrida del 31/07: `registro_dedup` reportó `no_corrio` (el nodo aún no había ejecutado al
> consultarlo) y aun así las 191 filas se escribieron. **Corolario:** el tripwire `registro_dedup`
> **nunca puede dispararse** — dice `no_corrio` en toda corrida. **La decisión de este ADR sigue
> siendo la correcta; lo que falta es hacerla efectiva** moviendo `Preparar procesados` y
> `POST processed_items` a x < 4480. Se ataca con un plan aparte (handoff §Pendiente vivo).
> *No borres esta bandera hasta que el fix esté re-importado y una corrida real muestre
> `registro_dedup: 'ok'`.*

- **Estado:** aceptada — 2026-07-24 (audit del run manual de Jero, con Mani). Endurece el dedup del
  motor sin tocar su semántica. No enmienda una decisión previa; cubre un modo de falla que
  [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md) (dedup del fan-out **intra-corrida**) no
  toca: la memoria **entre corridas**.
- **Contexto:** el motor dedupea contra `processed_items` (unique `(platform, external_id)`, schema
  002): `Leer procesados` trae los ya vistos, `Heat-score v1` filtra, `Preparar procesados → POST
  processed_items` graba la memoria. Tres agujeros observados en el run del 20→21/07 (15 videos
  duplicados llegaron al feed, descartados a mano por el equipo):
  1. **Lectura fail-open:** `Leer procesados` tenía `onError: continueRegularOutput`. Si el GET a
     Supabase fallaba, `seen` quedaba vacío y el motor **re-entregaba todo lo ya visto**. Un dedup sin
     memoria no degrada suave: produce exactamente la basura que el equipo tira.
  2. **La memoria se grababa al final, en rama paralela y fail-open:** `POST processed_items` corría
     después de entregar y podía fallar en silencio. La corrida del 20/07 no dejó ni una fila en
     `processed_items` → la del 21/07 no tenía cómo saber que ya los había traído.
  3. **El feed no guardaba `external_id`:** Airtable `Candidatos` no tenía el id de plataforma, así que
     ni había forma de dedupear contra el feed vivo, ni de borrar duplicados sin un `join` frágil por
     `url`. La limpieza manual del cierre 57 (borrar 65 `Candidatos` + sus `processed_items`) nació de
     acá; si borra la memoria pero deja el candidato, el video **resucita** en la próxima corrida.
- **Decisión:** tres capas, cada una tapa un agujero distinto.
  1. **La lectura de `processed_items` es fail-closed.** Se le quita el `onError`: si el GET falla, el
     run **aborta** (queda `en_curso` y lo barre `Barrer runs zombie`, C.3). Justificación contra el
     invariante "el registro es un sumidero, no una dependencia" (ingesta-registro §1): ese invariante
     protege las **escrituras** al registro (observar sin bloquear). La **lectura** de `processed_items`
     no es registro: es un **insumo** del pipeline, igual que `Leer Proyectos` o `Leer Referentes`, que
     ya son fail-closed. Sin memoria, la única salida honesta es no entregar.
  2. **La memoria se graba antes de entregar.** Se invierte el orden de las ramas de `Heat-score v1` a
     `[Preparar procesados, Transcribir]`: con execution order v1 (depth-first), `POST processed_items`
     corre **primero**, antes de gastar Supadata/Haiku y antes del `POST Airtable Candidatos`.
     `processed_items` siempre significó "evaluado" (registra la salida de Heat-score, no la de Armar
     candidato); solo cambia el momento. `POST processed_items` **queda fail-open**: la escritura sí es
     sumidero. `Resumen del run` verifica el resultado y lo reporta en `metricas.registro_dedup`
     (`ok`/`fallo`) + `metricas.avisos`.
  3. **`external_id` en el feed, como última línea.** Campo nuevo en Airtable `Candidatos`; el motor lo
     escribe en cada candidato. `Heat-score v1` suma a `seen` los `external_id` del **feed vivo**
     (nodo nuevo `Leer feed vivo`, GET paginado a Airtable). Es la única defensa contra "la memoria de
     `processed_items` se borró pero el candidato sigue en el feed". Y de paso, borrar candidatos deja
     de exigir el `join` por `url`.
- **Asimetría fail-closed / fail-open (refinamiento sobre el plan):** `Leer procesados` es
  **fail-closed** (memoria primaria: sin ella hay duplicados garantizados). `Leer feed vivo` es
  **fail-open** (defensa secundaria): si Airtable no responde, se degrada a `processed_items`, que
  cubre el caso normal. Hacer `Leer feed vivo` fail-closed metería un **punto único de falla nuevo** —
  un hipo de lectura de Airtable abortaría corridas sanas cuya memoria primaria está intacta. No vale
  la pena: el escenario que el feed cubre (memoria borrada a mano) es raro y no urgente.
- **Alternativas descartadas:**
  - *`unique (platform, external_id)` en `app.candidatos` (schema 009):* la tabla sombra no es el feed
    que usa el equipo; un unique ahí no frena un duplicado en Airtable. **Diferido:** el día que el
    cockpit propio (ADR-025/026) sea el feed, el unique migra con él.
  - *Modo reparación automática de `processed_items`:* con el aviso de (2), la reparación es manual y
    rara; automatizarla es complejidad sin caso de uso.
  - *Feed vivo también fail-closed (como pedía el plan):* descartado por la asimetría de arriba.
- **Consecuencias:**
  - (+) Duplicados entre corridas: imposibles en operación normal (memoria grabada antes de entregar +
    lectura que aborta si no está). El feed agrega defensa contra memoria borrada a mano.
  - (+) Borrar candidatos ya no necesita `join` por `url`: `external_id` está en el feed.
  - (−) Un run cuya memoria no se puede leer **aborta** (antes entregaba basura). Es el trade correcto.
  - (−) Un run que muere a mitad ya grabó su lote en `processed_items` → esos videos no se re-evalúan.
    Aceptado: es el mismo destino que hoy tienen los que pierden el corte.
- **Toca:** `Heat-score v1` (union de memorias + tripwire si `processed_items` trae `.error`),
  `Leer procesados` (sin `onError`), nodo nuevo `Leer feed vivo`, reorden de ramas de `Heat-score v1`,
  `Preparar batch Airtable` (+`external_id`), `Resumen del run` (`registro_dedup` + `avisos`). Fuera
  del motor: campo `external_id` en Airtable `Candidatos` (prerequisito del re-import) y en
  `core/scripts/setup-airtable.mjs`. Probado en `test-nodos.mjs` (harness `runHeatScore`, 6 casos).
  Sin cambio de schema SQL ni de contrato de datos.

## Enmienda (2026-07-28) — el fail-closed necesitaba una lectura que no se cayera sola

- **Estado:** aceptada — 2026-07-28 (Mani, tras el cron caído del 27/07). No cambia la decisión de
  arriba: la hace ejecutable. La lectura sigue siendo fail-closed.
- **Contexto — la falla que este ADR describió sin nombrar.** El cron del 27/07 abortó en
  `Leer procesados` con `timeout of 15000ms exceeded`. La causa no era la red ni Supabase: un
  `httpRequest` de n8n corre **una vez por item de entrada**, y el nodo está después del fan-out
  video×proyecto (280 videos → 635 filas), así que disparaba **cientos de GETs idénticos** — cada uno
  con la misma URL de 5,1 KB, porque arma el `in.(…)` desde `$('Pre-trim relevancia').all()`, no desde
  el item que procesa. Trabajo O(N²): N requests idénticos de tamaño N. El error trae la prueba en el
  payload (`"itemIndex": 2`).

  Lo importante para este ADR: **ese timeout ya ocurría antes**, cuando `Leer procesados` era
  `onError: continueRegularOutput`. Se lo tragaba en silencio, `seen` quedaba vacío y el motor
  re-entregaba todo. Es decir, **el agujero (1) del contexto original ("lectura fail-open") no era
  hipotético: se estaba disparando, y es la explicación mecánica de los 15 duplicados del 20→21/07**.
  El fail-closed no introdujo el problema; lo volvió visible en el primer cron que corrió con él.
- **Decisión:**
  1. **Los tres lookups del segmento de dedup son `executeOnce`** (`Leer señal selección`,
     `Leer procesados`, `Leer feed vivo`). Son lookups **de corrida**, no de item: su URL es idéntica
     para todos los items. Es seguro porque `Heat-score v1` no usa su input directo — lee todo por
     referencia (`$('…').all()`). `Leer feed vivo` lo necesita tanto o más: sin él son cientos de
     ejecuciones × hasta 30 páginas contra Airtable, que limita a 5 req/s.
  2. **`Leer procesados` deja de filtrar por `in.(…)` y lee la columna entera**
     (`select=external_id,platform&limit=50000`). Revierte el "dedup acotado #5" (cierre 15), que se
     decidió sin medir la tabla: `processed_items` son **408 filas / 26 KB**, o sea el filtro de 5,1 KB
     existía para evitar leer 408 filas. Además elimina un techo real: a ~700 `external_id` distintos
     la URL pasa los 8 KB y el proxy la rechaza con 414.
  3. **Retry nativo (3 intentos, 2s) antes de abortar**, timeout 30s. Un hipo de red ya no mata la
     corrida; la semántica fail-closed se conserva intacta — si tras 3 intentos la memoria sigue sin
     leerse, el run aborta.
  4. **Tripwire de truncado** en `Heat-score v1`: si la lectura vuelve en el límite
     (`_proc.length >= 50000`), aborta. Una memoria truncada en silencio produce exactamente los
     duplicados que este ADR previene, y el `limit` es la única forma en que puede pasar ahora.
- **Alternativas descartadas:**
  - *Solo subir el timeout:* no arregla nada. Cientos de requests secuenciales a 2s son ~20 minutos;
    el problema es la cantidad, no la paciencia.
  - *Lotear los `external_id` en chunks (Code node nuevo que emite lotes):* resuelve el techo de 414
    pero agrega un nodo y complejidad al harness para evitar leer una tabla de 26 KB. Con la lectura
    completa el problema no existe.
  - *Volver a fail-open para que el run no muera:* es literalmente la falla que se está arreglando.
    Los duplicados son inservibles para el equipo; un run que aborta es recuperable, un feed sucio es
    trabajo manual.
- **Consecuencias:**
  - (+) El segmento de dedup hace **1 request por nodo**, con URLs constantes y sin techo de escala.
  - (+) El fail-closed pasa de teórico a operable: ahora aborta por indisponibilidad real, no por una
    autolesión del propio motor.
  - (−) La lectura crece con la tabla, no con la corrida. A ~250 videos/semana el límite de 50000 está
    a años de distancia, y el tripwire avisa antes de que degrade en silencio.
- **Regla que sobrevive a este cambio:** en este workflow, **cualquier lookup de corrida nuevo va
  `executeOnce`**. Después del fan-out entran cientos de items y n8n ejecuta el nodo una vez por cada
  uno. Anotado en el [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md) y en
  [dev-doc §2.1](../agents/dev-doc.md).
- **Toca:** `Leer señal selección`, `Leer procesados` (URL + settings), `Leer feed vivo` (settings),
  `Heat-score v1` (tripwire de truncado). Probado en `test-nodos.mjs` (+1 caso). Sin nodos nuevos, sin
  conexiones nuevas, sin cambio de schema ni de contrato.
