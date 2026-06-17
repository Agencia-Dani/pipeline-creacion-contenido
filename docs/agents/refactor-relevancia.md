# Refactor de relevancia — plan por stages

> **Qué es esto:** el plan para que el motor entregue **videos que de verdad se alinean al Proyecto**,
> no solo virales. Pensado para ejecutarse en **sesiones distintas**: cada stage es autónomo, tiene su
> "hecho cuando", y arranca leyendo este doc + el [handoff](./handoff.md). El **porqué** de las
> decisiones grandes vive en ADR-010 (se escribe en Stage 0); los términos, en
> [context.md](./context.md) (Heat-score, Relevancia tópica, Utilidad, Criterios de relevancia).
>
> **Disparador:** V1 corrió end-to-end y pobló `Candidatos`, pero el ranking deja pasar contenido
> viral-pero-irrelevante (hashtag farming, viral sin razón). El heat-score solo mira métricas + match
> de keyword por **substring** (gameable). Falta un juicio sobre el **contenido** del video.

## Norte (decisiones lockeadas en la sesión de grilling 2026-06-16)

1. **Driver:** relevancia (alineación real al Proyecto). Transcripción exacta = secundario (confiamos
   en Supadata; el único arreglo es el micro-fix de idioma, ya hecho — ver Stage 3).
2. **Descubrimiento = 2 ejes:** referentes (cuentas) + términos (hashtags/keywords). Las métricas son
   señal de **ranking** transversal, no un modo de búsqueda.
3. **Relevancia en doble capa Haiku:**
   - **Pre-trim** (sobre caption, etapa FILTRAR/SCOREAR): colador **amplio**, optimiza *recall*. Tira
     solo lo obviamente off-topic para no transcribir basura. En la duda, deja pasar.
   - **Gate / jurado** (sobre transcript, etapa **CALIDAD**): **estricto**, optimiza *precision*.
     Produce el score de relevancia/calidad. Llena el hueco ❌ de CALIDAD en PLAN §2.4.
4. **Heat-score nuevo = composite:** juicio semántico de Haiku ⊕ métricas objetivas
   (views/likes/eng/selección). El substring `tema` **sale**. Haiku es el eje principal; las métricas
   pesan (ordenan fino entre los relevantes). Pesos exactos = a calibrar con data real.
5. **Criterios en Airtable** (`Proyectos.criterios_relevancia`, opcional `Voces`), editables por el
   equipo — no-code, consistente con el norte (ROADMAP §1: Airtable es el punto de entrada único).
6. **Gates fail-open:** si Haiku falla, el video **pasa** (no se vacía la entrega). Invariante #1
   (servicios externos no son dependencia de ejecución).
7. **Estructura:** un solo workflow (ADR-006: sin workflow padre), expresando las **8 etapas
   canónicas** (PLAN §2.4). Incremental, nunca rompe el V1 operativo (invariante #7). Se construye con
   el builder Node, se valida por re-import + Execute (CLAUDE.md del workflow).

## Stages

> Orden recomendado. Stages 0-1 son baratos y sin riesgo de runtime; 2-4 son intrusivos (builder Node
> + validar por re-import). **Precondición de 3-4:** mergear primero la rama `fix/altos-auditoria`
> (trae #7 idioma + #8 merges consolidados en 2 Code nodes de enriquecimiento) o rebasar sobre ella;
> Stage 3/4 construyen encima de esos nodos. Ver handoff §"Mejoras pendientes" #7/#8.

### ✅ Stage 0 — Capturar (docs · descriptivo-first · cero riesgo runtime) — HECHO 2026-06-16
- ✅ **ADR-010** escrito ([../adr/ADR-010-scoring-semantico-y-etapa-calidad.md](../adr/ADR-010-scoring-semantico-y-etapa-calidad.md)):
  scoring semántico con LLM + etapa CALIDAD (revisa el scoring de ADR-009), con el trade-off registrado.
- ✅ **Manifests sincronizados** a las 8 etapas canónicas: `workflow-short-form-content/workflow.yaml`
  reescrito (stages canónicas, `client_config` + `filters`, `registered: yes`) y creado
  `workflow-archivado/workflow.yaml` (faltaba). **Validador en verde** (933 checks, 0 errores) →
  resuelve handoff #1.
- ✅ context.md ya refleja los términos (Heat-score redefinido + Relevancia tópica/Utilidad/Criterios).

### 🔧 Stage 1 — Cockpit: criterios de relevancia (Carril A · prerequisito chico)
- ✅ Campo **`criterios_relevancia`** (texto largo) agregado a `Proyectos` **y `Voces`** en
  `setup-airtable.mjs`. Pregunta abierta resuelta a favor de incluir la Voz: **Proyecto = relevancia de
  tema, Voz = fit del cliente/persona**; el gate de Stage 3 los combina, los pesos se calibran en Stage 5.
- ✅ Contrato [core/contracts/airtable-cockpit.md](../../core/contracts/airtable-cockpit.md) actualizado
  (campo en `Proyectos` + `Voces` + nota en "Cómo lo usa el motor").
- ✅ Motor lo lee: `Armar plan` mete `criterios` (proyecto) y `voz_criterios` (voz) en cada
  `projects[id]` del plan de corrida (el gate de Stage 3 los consume vía `proyecto_id`). Validador en
  verde, jsCode parsea.
- ✅ **Manual (Carril A) — verificado en la base viva 2026-06-16:** el campo `criterios_relevancia`
  (*Long text*) existe en `Proyectos` **y** `Voces`; el piloto "IA y Productividad" tiene su criterio
  sembrado. **Pendiente menor:** la Voz provisional tiene el criterio **vacío** (es opcional — el gate
  combina Proyecto ⊕ Voz; con la Voz vacía manda solo el Proyecto). Sembrarla cuando se calibre (Stage 5).
- **Hecho cuando:** el equipo puede editar criterios en Airtable y el motor los lee en `Armar plan`. ✅

### 🔧 Stage 2 — FILTRAR/SCOREAR: heat-score limpio + pre-trim (motor)
- ✅ Substring `tema` fuera de `Heat-score v1`: el prescore queda métrico limpio
  (views/likes/eng percentil ×(1+idioma)×(1+selección) + `flag_viral` marca). `boost_tema` quitado
  de Config y del manifest (filters).
- ✅ Nodo nuevo **Pre-trim relevancia** (Code + `this.helpers.httpRequest`): agrupa por proyecto,
  manda caption+hashtags a Haiku con los `criterios` (Proyecto ⊕ Voz), descarta el off-topic obvio
  **antes de transcribir**. Laxo (recall), **fail-open**, y si el proyecto no tiene criterios no
  descarta nada. Va entre `Asignar proyecto+voz` y el heat-score; el heat-score lee del pre-trim.
- ✅ API key como placeholder `<ANTHROPIC_API_KEY>` en el Code node (mismo token que el traductor →
  2 ocurrencias a llenar en n8n).
- ✅ Validado: contrato en verde + smoke test de la lógica (cuela off-topic, fail-open, sin-criterios
  pasa todo, heat-score puntúa sin tema). **Falta la V-run** (re-import + Execute en n8n — norma del repo).
- **Hecho cuando:** re-import + Execute → candidatos fluyen, la basura obvia ya no se transcribe,
  el orden por métricas se mantiene sano. *(Código ✅; pendiente la corrida en vivo.)*

### 🔧 Stage 3 — CALIDAD: el gate / jurado (motor · el corazón)
> La rama `fix/altos-auditoria` se perdió (worktree borrado, sin ref). Se decidió **reconstruir #7/#8
> primero** y montar el gate encima. Hecho en 2 pasos.

**Paso 1 — enriquecimiento reconstruido (#7/#8):** los 9 nodos frágiles (Supadata HTTP + 2 Merge por
posición + 2 Parsear + IF + Script-desde-transcripción + Claude HTTP + Merge candidatos) → **2 Code
nodes**: `Transcribir (Supadata)` + `Traducir (Claude Haiku)` (vía `this.helpers.httpRequest`).
`external_id` atado al item (mata #8); `lang` de Supadata primario con fallback sobre el **transcript**
(mata #7); traduce literal solo si no es español; **fail-open** en ambos. Smoke test OK.

**Paso 2 — el gate:**
- ✅ Nodo nuevo **Gate de relevancia (Haiku)** sobre el transcript (entre `Traducir` y `Armar
  candidato`): jurado **estricto** (precision) contra `criterios` del Proyecto ⊕ Voz →
  `{relevante, score 0-1, razon}`. Dropea los `relevante:false`.
- ✅ **Composite:** `heat_score = peso_relevancia·score_haiku + (1-peso_relevancia)·percentil(prescore
  métrico)`. Knob `peso_relevancia` (default 0.7) en Config. Guarda `prescore_metrico`,
  `relevancia_score`, `relevancia_razon` en el item (razón aún no se sube a Airtable — campo futuro).
- ✅ **Fail-open**: sin criterios o si Haiku falla, pasa todo y ordena por el prescore métrico.
- ✅ Validado: contrato en verde (933) + smoke test (dropea irrelevante, composite correcto, fail-open,
  sin-criterios pasa todo). **Falta la V-run** en n8n (3 ocurrencias de `<ANTHROPIC_API_KEY>` a llenar).
- **Hecho cuando:** una corrida deja pasar solo lo relevante y el orden refleja relevancia ⊕ métricas;
  un fallo simulado de Haiku no vacía la entrega. *(Código ✅; pendiente la corrida en vivo.)*

### ✅ Stage 4 — Limpieza estructural (expresar las 8 etapas) — HECHO 2026-06-16
- ✅ El flujo mapea 1:1 a PLAN §2.4 (verificado nodo a nodo): COLECTAR (Config→leer Airtable→Armar
  plan→Apify IG/TT) · NORMALIZAR (Normalizar IG/TT→Merge append→Asignar proyecto+voz) · FILTRAR/SCOREAR
  (Pre-trim→señal/procesados→Heat-score) · ENRIQUECER (Transcribir→Traducir) · GENERAR (perfil script
  literal, sin nodo) · **CALIDAD** (Gate de relevancia) · ENTREGAR (Armar candidato→Airtable+registro) ·
  NOTIFICAR n/a. 30 nodos, **0 conexiones rotas, 0 huérfanos**.
- ✅ Merges-by-position fuera: el único `merge` es **Merge scrapes** (mode `append`, une IG+TT sin
  alinear por índice); `grep mergeByPosition` = 0.
- ✅ Adaptadores de descubrimiento prolijos: `Armar plan` emite los 2 ejes (`ig_urls` por referente,
  `tt_hashtags` por término) y `Normalizar IG`/`Normalizar TT` producen **el mismo `content_item`**
  (idénticas keys) desde el shape crudo de cada API → patrón enchufable ADR-007, sin generalizar de más.
  *(El `tt_handles` que se junta y no se usa es el gap #15 — referentes TikTok por perfil; pre-existente
  y flageado, no se toca por YAGNI.)*
- ✅ **Docs a la realidad:** PLAN §2.4 sincronizada (CALIDAD deja de ser hueco ❌; sale el substring
  `tema`; GENERAR = script de texto sin Doc; NOTIFICAR = n/a) y el mapa del repo en PLAN §2.3
  (30 nodos, motor ADR-009+010, sin Google). El manifest `workflow.yaml` ya coincidía (Stage 0-3).
- **Hecho cuando:** el workflow expresa las etapas sin alineación frágil; manifest coincide con la
  realidad. ✅ *(Deuda separada, NO de este stage: README/CLAUDE.md del workflow siguen describiendo el
  template viejo — handoff #10.)*

### Stage 5 — Validación + calibración
- Corrida de fuego: confirmar que el viral-pero-irrelevante **desaparece** (muestrear contra la corrida
  V1 previa).
- Calibrar: **ancho del embudo** (cuánto transcribir de más), **pesos del composite** (Haiku vs
  métricas), y el **rubric** del jurado, con data real.
- **Hecho cuando:** Majo/Jero validan la calidad de los candidatos sobre data real.

## Abierto a propósito (no bloquea; se cierra con data en Stage 5)
- El **rubric exacto** del pre-trim y del gate (qué reglas, qué tan estricto).
- Cuánto pesa **Haiku vs métricas** en el composite.
- Si la **Voz** entra en los criterios o queda solo el Proyecto.
- Ancho del embudo de transcripción (top_n × factor).

## Relación con la auditoría del handoff
Este refactor toca o supersede varios items de handoff §"Mejoras pendientes":
- **#1** (manifest/validador) → Stage 0.
- **#7** (idioma) y **#8** (mergeByPosition) → ya en `fix/altos-auditoria`, precondición de Stage 3-4.
- **#13, #15-#19** (modelo de búsqueda y tuning) → quedan enmarcados acá; #16/#17/#15 (más fuentes de
  descubrimiento) son extensiones de COLECTAR para después, no parte del corazón de este refactor.
