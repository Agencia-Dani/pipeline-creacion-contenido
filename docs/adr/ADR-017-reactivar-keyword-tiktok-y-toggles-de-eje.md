# ADR-017 — Reactivar el eje keyword TikTok como toggle + tres toggles de eje + knob de resultados por keyword

- **Estado:** aceptada — 2026-06-25 (decisión con Mani sobre dejar el motor listo para producción).
  **Enmienda [ADR-015](./ADR-015-busqueda-solo-referente-retiro-keywords.md)** (el eje TikTok-keyword
  deja de estar dormante: pasa a toggle editable, default ON) y **extiende
  [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md)** (suma un cuarto knob global con
  su propio cap dev-only).
- **Contexto:** ADR-015 dejó la búsqueda **solo por referente** y el eje TikTok-keyword **dormante**
  tras el flag `buscar_keyword_tiktok` (default OFF), para ahorrar créditos hasta tener un motor de
  recomendación. En la práctica el referente-only se quedó corto para la etapa actual: el eje keyword
  TikTok traía contenido on-topic con métricas reales (la basura era el IG-hashtag, ya retirado), y el
  equipo lo quiere de vuelta **solo en TikTok** mientras se construye el discovery asistido (ROADMAP §5).
  Mani además quiere que la **configuración del eje** sea visible y editable por el equipo (no un flag
  escondido en `Config`), pero **a prueba de errores**: que no puedan disparar el costo. Toda la cablería
  del eje keyword ya quedó **inerte pero completa** por ADR-015, así que reactivar es prender, no construir.
- **Decisión:**
  1. **Tres toggles de eje de búsqueda, expuestos en `Ajustes`** (la tabla no-code de ADR-011), default
     **todos ON**: `Buscar por referentes en Instagram` (`buscar_referente_ig`), `Buscar por referentes
     en TikTok` (`buscar_referente_tiktok`), `Buscar por keywords en TikTok` (`buscar_keyword_tiktok`).
     1/0. Reemplazan el flag oculto único; el equipo gobierna qué ejes corren sin tocar n8n. **No hay
     toggle de IG-keyword** (retirado de verdad, ADR-015): el eje keyword es solo TikTok.
  2. **El eje keyword TikTok se reactiva** (`buscar_keyword_tiktok` default 1, antes 0). Cuando está on y
     hay `Keywords` activas, el motor arma `tt_hashtags` y el `Apify — TikTok` busca por hashtag (unión).
     La señal por tema (`Candidatos.tema`, `v_senal_tema`) vuelve a escribirse/leerse — deja de estar
     inerte. **Se vuelve a mostrar la página `Keywords`** del dashboard.
  3. **Knob propio de volumen para el eje keyword:** `Resultados por keyword` (`resultados_keyword`),
     **separado** de `Resultados por cuenta de referente`. Default **más chico (10)** porque el hashtag
     es **descubrimiento ciego** (cuentas desconocidas → más riesgo de basura y de gastar transcripción
     en ruido): se trae menos por hashtag que de una fuente curada. El `Apify — TikTok` (hashtags) usa
     `resultsPerPage = resultados_keyword`; los nodos de referente siguen con `resultados_referente`.
  4. **Cap dev-only del knob keyword:** `cap_resultados_keyword` en `Config` (**20**), análogo a
     `cap_resultados_referente` (30): el motor usa `min(resultados_keyword, cap)`. El equipo no puede
     subir el volumen del descubrimiento ciego por encima del tope → no rompe el workflow ni quema
     créditos. Como el resto, **fail-open**: sin cap definido, no acota.
  5. **El resto del modelo de costo de ADR-016 no cambia y sigue gobernando:** `cap_top_n` (200) es el
     techo duro de transcripción por corrida (el gobernador de créditos real, vale para todos los ejes
     juntos), el dedup intra-corrida y entre-corridas se mantiene, y el corte final a `top_n` videos
     distintos va después del gate. Reactivar keyword **no afloja ningún techo**: solo
     cambia de dónde sale el contenido que compite por esos 200 cupos de transcripción.
  6. **Piso por cuenta fuente en el corte final** (`piso_referente`, Config dev-only, **5**) — **enmienda
     el corte de [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md)**. Con varios ejes y
     varias cuentas compitiendo por los `top_n` cupos, el corte por heat puro deja que **una sola cuenta
     prolífica acapare** el top-N (problema visto en vivo: @bayavoce monopolizaba el corte IG). El corte
     en `Armar candidato` ahora hace **round-robin por rank de heat hasta `piso_referente` videos por
     cuenta** antes de **rellenar el resto por heat global** hasta `top_n` videos distintos. Garantiza que
     cada cuenta con contenido entre al menos sus mejores `piso_referente` videos al corte; el resto sigue
     gobernado por heat. **Fail-open:** `piso_referente=0` → corte por heat puro, idéntico a ADR-016. No
     toca el techo de costo (sigue cortando a `top_n` videos distintos), solo **reparte** esos cupos.
- **Alternativas descartadas:**
  - *Solo un toggle de keyword (referentes fijos siempre):* más simple, pero Mani quiere control de eje
    completo para el equipo (poder apagar una plataforma de referentes sin tocar n8n). Se eligen los 3.
  - *Flag dev-only, no en `Ajustes`:* lo más a prueba de errores, pero contradice el pedido de que el
    equipo lo gobierne. Se mitiga el riesgo con el cap dev-only en vez de escondiendo el toggle.
  - *Keyword comparte `resultados_referente`:* un solo número, pero hace pesar el descubrimiento ciego
    igual que la fuente curada en el presupuesto de transcripción. Se rechaza: knob propio más chico.
  - *Sin cap en el knob keyword:* el equipo podría subirlo y disparar Apify + transcripción. Se rechaza;
    el cap es justo el seguro que pidió Mani.
- **Consecuencias:**
  - (+) Vuelve el contenido on-topic del eje TikTok-keyword sin perder el techo de créditos (cap_top_n
    sigue clavado; el cap del knob keyword acota el volumen ciego).
  - (+) El equipo gobierna los ejes desde Airtable, en español claro, sin poder romper el costo.
  - (+) El substrato de aprendizaje por tema (`v_senal_tema`) vuelve a alimentarse → mejor base para el
    futuro motor de recomendación (ROADMAP §5).
  - (−) El descubrimiento ciego puede meter cuentas nuevas de baja calidad: lo filtran el pre-trim
    (Haiku laxo) y el gate (Haiku estricto), pero algo de ruido llega al equipo a calificar. Acotado por
    `resultados_keyword` chico + su cap.
  - (−) Más superficie de config para el equipo (3 toggles + 1 knob nuevo). Mitigación: defaults sanos
    (todo ON, keyword chico) → la corrida estándar sale sin tocar nada.
  - (−) Reabre parcialmente ADR-015: el modelo deja de ser "un solo eje activo". Aceptado: era el punto.
  - (+) El piso por cuenta fuente reparte el corte entre cuentas → diversidad de fuentes al equipo, sin
    que una cuenta prolífica monopolice; el costo no se mueve (sigue cortando a `top_n` distintos).
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (suma los 3 toggles + `Resultados por keyword`
  a `Ajustes`; nota la tabla `Keywords` como **activa** de nuevo y el cap dev-only),
  `setup-airtable.mjs` (seed de las 4 filas nuevas de `Ajustes`). El motor: `Config`
  (`buscar_referente_ig`/`buscar_referente_tiktok`=1, `buscar_keyword_tiktok` 0→1, `resultados_keyword`=10,
  `cap_resultados_keyword`=20, `piso_referente`=5), `Armar plan` (`AJUSTE_MAP` + lee los toggles vía `pick`
  + cap del knob keyword + gatea las ramas IG-ref/TT-ref/keyword + pasa `resultados_keyword` al plan),
  `Apify — TikTok` (`resultsPerPage = resultados_keyword`), `Armar candidato` (round-robin de piso por
  cuenta + fill por heat). **Barredor de zombies del motor** (parte de dejar el motor listo para prod):
  `Abrir run` ahora marca `params.workflow="motor"` y un nodo nuevo `Barrer runs zombie` (entre `Abrir
  run` y `Leer Proyectos`) marca `fallo` los runs de motor `en_curso` anteriores — análogo al del
  archivado (ADR cierre 19). **Pendiente manual en la base viva:** ya quedan las 4 filas en `Ajustes`
  (verificado en vivo); falta **volver a mostrar la página `Keywords`** del dashboard, sembrar
  **referentes TikTok** (hoy 0) y **keywords TikTok** activas para que el eje haga algo.
