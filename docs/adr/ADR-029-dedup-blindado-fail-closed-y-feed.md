# ADR-029 — Dedup blindado: lectura fail-closed, memoria antes de entregar, `external_id` en el feed

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
