# ADR-011 — Tabla `Ajustes` en Airtable: knobs del scoring editables sin código

- **Estado:** aceptada — 2026-06-17 (sesión de ejecución de las decisiones lockeadas del cierre 4;
  decisión #2 / #19, objetivo **O11 = equipo-redes-friendly**).
- **Contexto:** los parámetros del scoring del motor (`peso_views`/`peso_likes`/`peso_eng`,
  `peso_relevancia`, `boost_idioma`, `umbral_viral`, el `top_n` de fallback) vivían **hardcodeados en
  el nodo `Config`** del workflow. Cambiar cualquiera obliga a un dev a abrir n8n y editar el JSON.
  El norte (ROADMAP §1) y O11 piden que el equipo de redes (Majo, Jero) opere **casi solo, no-code**:
  arman la búsqueda y califican desde Airtable sin tocar la sala de máquinas. Tunear cómo rankea el
  motor es justo el tipo de ajuste que querrán iterar (más peso a engagement, premiar más lo
  extranjero, subir un piso de views) sin pedir un dev. Sumado: la decisión #3 agrega un **piso duro**
  `min_views`/`min_likes` pre-`top_n` que también debe ser del equipo.
- **Decisión:**
  1. **Una tabla `Ajustes` (clave→valor) en Airtable** con los knobs del scoring. El motor la lee
     cada corrida (nodo `Leer Ajustes`), igual que lee Proyectos/Keywords/Referentes.
  2. **Claves amigables + merge sobre Config:** las `clave` están en **español claro** para el equipo
     (ej. "Peso de vistas", "Resultados Instagram por corrida"); `Armar plan` las traduce a la key
     interna vía `AJUSTE_MAP` y arma el objeto `ajustes` con keys internas. En `Heat-score v1` y `Gate
     de relevancia` el config efectivo es `Object.assign({}, Config, ajustes)` → un knob en Ajustes
     **sobrescribe** el default; lo que no esté (o una clave fuera del mapa) cae al default de Config.
     Config pasa a ser **el piso de defaults** (solo IDs dev-only quedan ahí). *(Decisión 2026-06-17:
     las claves son amigables, no técnicas — a pedido de Mani, el equipo de redes no debe ver jerga.)*
  3. **Fail-open:** `Leer Ajustes` es `continueOnFail` + `alwaysOutputData`. Si Airtable no responde
     o la tabla está vacía, el motor corre con los defaults de Config (invariante #1, PLAN §2.5). No
     se convierte un knob no-code en dependencia de ejecución.
  4. **Knobs incluidos:** `peso_views`, `peso_likes`, `peso_eng`, `peso_relevancia`, `boost_idioma`,
     `umbral_viral`, `top_n_fallback`, y los nuevos `min_views`/`min_likes` (piso duro, default 0 —
     "nada corta", ROADMAP §1). **Fuera:** los operativos (`ig_results_limit`, `tt_results_limit`,
     `airtable_base_id`/`supabase_url`/`instance_id`) quedan en Config (dev-only); y la **detección**
     de idioma queda en el código (dev-only) — el knob es solo el `boost_idioma`.
- **Alternativas descartadas:**
  - *Dejar los knobs en Config (status quo):* contradice O11 — cada tuning necesita un dev en n8n.
  - *Sacar solo el `DICT` de idiomas a Config (opción (a) del gap #19):* junta los knobs en un lugar,
    pero sigue siendo dev-only (n8n). No le da el control al equipo.
  - *Una columna por knob en una fila única (en vez de clave→valor):* agregar un knob nuevo obligaría
    a un cambio de schema (campo nuevo) en vez de una fila nueva. Clave→valor es extensible sin tocar
    la tabla.
  - *Knobs por Proyecto (cada Proyecto sus pesos):* sobre-ingeniería para el MVP; el `top_n` ya es
    per-Proyecto donde tiene sentido. Los pesos del scoring son globales por ahora.
- **Consecuencias:**
  - (+) El equipo tunea el ranking desde Airtable, sin dev ni n8n → cierra el núcleo de O11.
  - (+) Extensible: un knob nuevo es una fila + leerlo en el código, sin tocar la tabla.
  - (+) Seguro por defecto: tabla vacía o caída = motor con defaults; el merge nunca rompe.
  - (−) Una lectura más de Airtable por corrida (1 API call; irrelevante en el plan free con cron
    semanal). Subsumible en el `Armar plan` si alguna vez molesta.
  - (−) El equipo puede meter valores sin sentido (peso negativo, min_views gigante que vacía la
    entrega). Mitigación: la columna `descripcion` documenta cada knob; los pesos son tolerantes
    (`Number(...) || default`). Validación dura = post-MVP si hace falta.
- **Toca `core/`:** `setup-airtable.mjs` (crea+siembra la tabla), `core/contracts/airtable-cockpit.md`
  (6ª tabla). Aplicado en la base viva por API (tabla `Ajustes` + 9 defaults sembrados).
