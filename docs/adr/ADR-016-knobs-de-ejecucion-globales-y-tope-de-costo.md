# ADR-016 — Knobs de ejecución globales (top_n, recencia, resultados por referente) + tope de costo

- **Estado:** aceptada — 2026-06-24 (grilling con Mani sobre las mejoras post-producción).
  Extiende [ADR-011](./ADR-011-tabla-ajustes-knobs-no-code.md) (tabla `Ajustes`).
- **Contexto:** tres parámetros que controlan **volumen y costo** de cada corrida estaban repartidos y
  ambiguos. `top_n` y `dias_recencia` vivían **por Proyecto**, lo que obliga al equipo a tocarlos
  proyecto por proyecto y mezcla "qué busca este proyecto" con "cuánto corre el motor". Y `Resultados
  Instagram por corrida` / `Resultados TikTok por corrida` eran **dos** knobs con semántica distinta por
  plataforma (IG es por-referente vía el Split; TikTok-hashtag era unión), confusos para el equipo. Con
  la búsqueda solo por referente (ADR-015), ambas plataformas pasan a buscar **por cuenta**, así que el
  parámetro se unifica natural: "videos por cuenta de referente". Además, esa config es la que más pega
  en el gasto de Apify/Supadata/Claude, y hoy el equipo la puede subir sin techo → riesgo de descontrol
  de créditos.
- **Decisión:**
  1. **Tres knobs globales en `Ajustes`** (la tabla no-code de ADR-011), ya **no por Proyecto**:
     - `Candidatos por corrida` (`top_n`) — **N total por corrida, contados como videos distintos**
       (un video cross-relevante a 2 proyectos cuenta 1; sigue produciendo 2 candidatos). Reemplaza el
       `top_n` por-Proyecto y el `top_n_fallback`. Anclado al objetivo de throughput (~100 scripts/semana
       → default `top_n=100`, corrida semanal).
     - `Días de recencia` (`dias_recencia`) — ventana única de fetch para toda la corrida. Reemplaza el
       `dias_recencia` por-Proyecto y el `max(dias)` que el motor calculaba entre proyectos.
     - `Resultados por cuenta de referente` (`resultados_referente`) — un solo knob que reemplaza
       `Resultados Instagram por corrida` + `Resultados TikTok por corrida`. Aplica igual a IG y TikTok.
  2. **El corte de N va al FINAL, después del Gate, por heat compuesto (semántico ⊕ métrico).** Cambio
     clave: hoy `Heat-score v1` recorta a `top_n` **antes de transcribir**, por prescore métrico ciego al
     contenido (riesgo de tirar un video de métricas flojas pero buen guion). En su lugar se **transcribe
     y juzga todo** lo que pasa el pre-trim de caption + el dedup de "ya vistos", y el corte a N videos
     distintos se hace al final, ordenando por el heat **compuesto** (que ya incorpora el juicio del Gate).
     Así el ranking final nunca pierde contenido bueno por un corte previo a la evaluación semántica.
  3. **Tres gobernadores de costo, todos con tope dev-only en `Config`:**
     - `cap_resultados_referente` acota el knob del equipo: `min(resultados_referente, cap)`. Limita el
       volumen que entra (Apify) = referentes × resultados/referente. Es el gobernador primario.
     - **Dedup intra-corrida:** un video reclamado por varios proyectos (fan-out) se **transcribe una
       sola vez** (indexado por `external_id`), no una vez por proyecto. El transcript se reparte a las
       copias antes del Gate. Sumado al dedup entre-corridas (`processed_items`, ya existente) → el cron
       semanal solo transcribe videos nuevos.
     - `cap_top_n` (cinturón de seguridad): techo duro de cuántos videos se transcriben en una sola
       corrida. En el día a día nunca muerde; protege el **backfill** (primera corrida con `dias_recencia`
       grande) de disparar cientos de llamadas o reventar el timeout de 15 min de n8n. Cuando muerde,
       recorta por heat métrico (único disponible pre-transcripción). Default holgado (~200).
  4. **El pre-trim de caption (Haiku LAXO) pasa a ser load-bearing:** al no haber corte métrico antes de
     transcribir, es lo único que baja el volumen de transcripción descartando off-topic obvio antes de
     pagar Supadata. Se conserva y gana peso.
  5. **Fail-open (igual que ADR-011):** si un knob falta o la tabla está vacía, el motor cae a los
     defaults de `Config`. Los caps nunca rompen: sin tope definido, no acotan.
- **Alternativas descartadas:**
  - *Dejar `top_n`/`dias` por Proyecto:* da control fino pero contradice el pedido (el equipo quiere
    una pestaña de knobs globales, no tocar proyecto por proyecto) y mezcla búsqueda con ejecución.
  - *`top_n` = N por proyecto activo (en vez de N total):* es lo que hace hoy; Mani eligió N total para
    que el costo de la corrida sea predecible sin importar cuántos proyectos estén activos.
  - *Cortar a N antes de transcribir, por métrico (status quo):* transcripción más barata, pero el corte
    es ciego al contenido — puede tirar un video de métricas flojas con buen guion antes de que el Gate
    lo vea. Se rechaza para no perder calidad; el costo se controla con el cap por referente + el dedup +
    `cap_top_n`, no sacrificando la evaluación semántica.
  - *Dos knobs de resultados (IG y TikTok):* con referente-only ambos significan lo mismo (videos por
    cuenta); mantener dos confunde al equipo sin ganar nada.
  - *Cap como otra fila editable en `Ajustes`:* el tope es un límite de gobernanza, no un knob del
    equipo; si vive en `Ajustes` el equipo lo sube y se anula el propósito. Va en `Config` (dev-only).
- **Consecuencias:**
  - (+) El equipo tiene **una sola pestaña** de knobs globales que gobiernan toda la ejecución, en
    español claro, sin tocar n8n ni proyecto por proyecto.
  - (+) Costo de corrida acotado por diseño: el cap pone un techo duro a Apify (resultados/cuenta) y el
    `top_n` global a la transcripción, sin importar lo que el equipo escriba.
  - (+) Menos campos por Proyecto (se van `top_n` y `dias_recencia`): el Proyecto queda enfocado en
    *qué* busca (criterios, voz, referentes, activo).
  - (−) Se pierde la granularidad por proyecto (un proyecto que quería una ventana más larga ya no
    puede). Aceptado: el MVP corre proyectos del mismo árbol temático; si vuelve a hacer falta, se
    reabre y se re-agrega el override por Proyecto.
  - (−) Con N total, un proyecto con referentes muy "calientes" puede acaparar los N candidatos y dejar
    a otro sin ninguno. Es consecuencia buscada (el heat-score manda); si molesta, post-MVP se agrega un
    piso por proyecto.
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (`Ajustes`: renombra/unifica los knobs,
  agrega `Candidatos por corrida` y `Días de recencia`; `Proyectos`: saca `top_n` y `dias_recencia`),
  `setup-airtable.mjs` (semilla de `Ajustes` + campos del Proyecto). El motor: `Config`
  (`cap_resultados_referente`, `cap_top_n`), `Armar plan` (`AJUSTE_MAP` + lee globales en vez de
  por-proyecto + aplica el cap por referente), `Asignar proyecto+voz` (recencia global), `Heat-score v1`
  (deja de cortar a top_n; solo prescore métrico + dedup + `cap_top_n`), `Transcribir` (dedup por
  `external_id`), `Gate de relevancia` o un nodo posterior (corte final a N videos distintos por heat
  compuesto). **Pendiente manual en la base viva:** mover los knobs en `Ajustes`, borrar
  `top_n`/`dias_recencia` del Proyecto, y armar la **página Global** del dashboard (P0 del cierre 20).
