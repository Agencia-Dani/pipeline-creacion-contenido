# ADR-019 — Remoción total del eje keyword: el motor descubre solo por referentes

- **Estado:** aceptada — 2026-07-09 (decisión con Mani tras la auditoría de calidad del run 07-09).
  **Enmienda [ADR-015](./ADR-015-busqueda-solo-referente-retiro-keywords.md)** (el "dormante, no
  removido" se cierra: ahora sí removido) y **revierte
  [ADR-017](./ADR-017-reactivar-keyword-tiktok-y-toggles-de-eje.md)** (salen el toggle
  `buscar_keyword_tiktok`, el knob `resultados_keyword` y su cap; el piso por cuenta y los 2 toggles
  de referente quedan). **Reduce [ADR-012](./ADR-012-senal-de-aprendizaje-bi-eje.md)** (la señal de
  aprendizaje queda mono-eje, solo por referente; `v_senal_tema` queda inerte). **No toca**
  [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md) ni
  [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md): `top_n`, `dias_recencia`,
  `resultados_referente`, `cap_top_n`, `piso_referente` y el dedup de salida siguen tal cual.
- **Contexto:** la dirección ya estaba fijada (cierre 23, ROADMAP §5): el motor se alimenta **solo de
  referentes**; la reactivación keyword de ADR-017 era un **puente** hasta tener un motor de
  descubrimiento de referentes. La auditoría del run 07-09 le puso números al puente: el eje keyword
  TikTok produjo **2/60 videos aprobables (3%)**, el 58% del gasto Supadata+Haiku se fue en videos que
  el gate tiró después, y la calidad la definen las **fuentes** (2 referentes aportaron el 83% de los
  aprobados). Los skits con caption puro-hashtag pasaban el pre-trim y quemaban transcripción; hubo
  que parcharlo con un pre-trim por eje (caption pobre: referente pasa, keyword muere). Desde el
  cierre 27 el eje ya está **OFF en la base viva** (Ajustes). Además, ADR-015→ADR-017 demostró que el
  código dormante se re-litiga: mantenerlo "apagado pero completo" cobra impuesto en cada refactor
  (este cambio tocó 12 puntos del motor). Se decide que el repo coincida con la operación real.
- **Decisión:**
  1. **El codepath keyword se borra del motor, completo** (36→30 nodos): `Leer Keywords`,
     `Apify — TikTok` (búsqueda por hashtag), `Apify — IG Hashtag` (ya muerto desde ADR-015),
     `Merge IG`, `Merge TT` (con una sola fuente por plataforma ya no unifican nada; cada Apify va
     directo a su Normalizador) y `Leer señal tema`. Salen también: los knobs keyword de `Config`,
     el armado de `tt_hashtags`/`kw_to_proj` en `Armar plan`, el reclamo por keyword y `_tema` en
     `Asignar proyecto+voz`, la rama por eje del pre-trim (vuelve a mono-eje: caption pobre → exento,
     lo juzga el gate con transcript), el `max(selRef, selTema)` del Heat-score y el campo `tema` en
     la salida a Airtable.
  2. **Sin keywords ni para trimming.** El filtrado ya lo cubren el pre-trim (Haiku laxo + criterios)
     y el gate (criterios Proyecto⊕Voz sobre transcript); un matcheo de hashtags para trimear videos
     de referentes sería una feature nueva, no la preservación de algo existente (YAGNI).
  3. **Contrato del cockpit:** la tabla `Keywords`, el campo `Candidatos.tema` y las filas de
     `Ajustes` `Buscar por keywords en TikTok` y `Resultados por keyword` se **retiran del contrato**
     y del seed. El borrado físico en la base viva es **checklist manual** de Mani (la API no borra
     tablas ni campos). Mientras tanto son inofensivos: sin entrada en `AJUSTE_MAP`, el motor los ignora.
  4. **DB inerte (mismo criterio que ADR-015):** `v_senal_tema` y `outputs.metadata.tema` en Supabase
     **no se tocan** (sin migración). El histórico viejo tiene `tema` poblado y el archivado sigue
     copiando `tema: f.tema || ''` — fail-safe con el campo borrado en Airtable; el archivado no se toca.
  5. **El motor de descubrimiento de referentes (ROADMAP §5) se diseña aparte, después.** Esta tanda
     es solo la remoción; mientras tanto los referentes se siembran a mano. El discovery propondrá
     **referentes nuevos**, no keywords.
- **Alternativas descartadas:**
  - *Dormante otra vez (patrón ADR-015):* menos diff, pero ya se probó — el código dormante se
    re-litigó una vez (ADR-017) y complica cada cambio del motor. Si el eje vuelve algún día, se
    reconstruye desde este ADR y el historial de git.
  - *Keywords como filtro de trimming:* matchear hashtags del caption contra `Keywords` para trimear
    antes de pagar Haiku/Supadata. Rechazado: es el codepath que se quiere matar, y el caption-only
    ya demostró puntos ciegos (captions `😎 #hashtags` sin señal del contenido real).
  - *Borrar también el schema Supabase (migración que dropea `v_senal_tema`):* más limpio pero toca
    `core/schema/` por algo que no molesta ni cuesta; el histórico viejo perdería contexto.
- **Consecuencias:**
  - (+) Motor más chico (36→30 nodos) y un solo eje mental: todo lo que entra viene de una fuente
    curada por el equipo. El pre-trim vuelve a una sola regla, sin ramas por eje.
  - (+) Cero gasto en descubrimiento ciego (Apify hashtag + transcripción de ruido).
  - (+) La calidad del output pasa a depender 100% de la curación de `Referentes` — que es donde la
    auditoría mostró que ya estaba (los referentes malos se podan, los buenos se siembran).
  - (−) **Sin descubrimiento de cuentas nuevas** hasta que exista el motor de descubrimiento
    (ROADMAP §5): si un referente se agota, lo repone el equipo a mano.
  - (−) Re-agregar keywords = reconstruir (esta vez sí). Aceptado: era el punto.
  - (−) Hasta el checklist manual, la base viva queda con tabla/campo/filas huérfanas (inofensivas).
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (sale la tabla `Keywords` — 6→5 tablas —,
  el campo `Candidatos.tema`, las 2 filas keyword de `Ajustes` y el cap `cap_resultados_keyword`;
  la señal de aprendizaje queda solo por referente) y `core/scripts/setup-airtable.mjs` (seed sin
  `Keywords`, sin `tema`, sin las 2 filas de `Ajustes`). El motor: ver decisión 1. **Pendiente manual
  en la base viva (Mani):** ocultar/borrar la página `Keywords` del dashboard, borrar la tabla
  `Keywords`, el campo `Candidatos.tema` y las 2 filas de `Ajustes`; **re-import** del motor en n8n
  (arrastra además lo apilado: ADR-018, `cap_top_n` 100, pre-trim, marca `⚠️ SIN GUION`).
