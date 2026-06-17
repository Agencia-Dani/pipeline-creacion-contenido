# Motor de reels — short-form-content

Workflow de **n8n** que es el motor del MVP de reels: lee la config del equipo de redes en
**Airtable**, descubre reels de IG + TikTok, los ordena por relevancia y viralidad, transcribe y
**traduce literal al español**, y entrega **candidatos a Airtable** para que el equipo (Majo, Jero)
los califique. El estado de producto vive en [ROADMAP §3](../../ROADMAP.md); el porqué de las
decisiones en [ADR-009](../../docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) +
[ADR-010](../../docs/adr/ADR-010-scoring-semantico-y-etapa-calidad.md); el contrato del manifest en
[workflow.yaml](./workflow.yaml).

> **Archivo:** [`workflow.json`](./workflow.json) — importable en n8n (`Workflows → Import from File`).
> Un solo cliente/voz por copia (multi-instancia real = F5). **El motor no usa ninguna credencial de
> Google.**

---

## Qué hace (30 nodos, 2 entradas)

Cron semanal (lunes 8am) o **Execute manual** → ambos entran a `Config`.

1. **COLECTAR** — `Config` → abre el run en el registro (Supabase) → lee Airtable (Proyectos, Voces,
   Keywords, Referentes activos) → `Armar plan de corrida` arma los 2 ejes de descubrimiento → 2
   nodos **Apify** (IG Reels por cuenta-referente, TikTok por hashtag-keyword).
2. **NORMALIZAR** — `Normalizar IG`/`Normalizar TT` mapean el shape crudo de cada API al mismo
   `content_item` (incluida la portada del video) → `Merge scrapes` (append) → `Asignar proyecto+voz`.
3. **FILTRAR / SCOREAR** — `Pre-trim relevancia` (Haiku laxo sobre el caption, cuela off-topic antes
   de transcribir) → `Heat-score v1` (prescore métrico: percentil de views/likes/eng × boost idioma ×
   señal de selección; dedup contra `processed_items`; top_n por proyecto).
4. **ENRIQUECER** — `Transcribir (Supadata)` → `Traducir (Claude Haiku)` (literal, solo si no está en
   español; `lang` de Supadata como fuente primaria).
5. **CALIDAD** — `Gate de relevancia` (Haiku **estricto** sobre el transcript): juzga contra
   `criterios_relevancia` (Proyecto ⊕ Voz), dropea lo irrelevante, y compone
   `heat_score = peso_relevancia·score_haiku + (1-peso)·percentil(prescore)`.
6. **ENTREGAR** — `Armar candidato` → `Preparar batch Airtable` → POST a `Candidatos` (estado `nuevo`,
   con script, idioma, thumbnail, `relevancia_score`/`relevancia_razon`) + registro en Supabase
   (`outputs`/`runs`, continue-on-fail).

Todos los gates son **fail-open**: si Haiku o Supadata fallan, el item pasa (no se vacía la entrega).

---

## Descubrimiento (cómo busca, por eje y plataforma)

| | Por referente (cuenta) | Por keyword (hashtag) |
|---|---|---|
| **Instagram** | ✅ baja los reels recientes de cada `Referente` IG | ⏳ post-V-run (IG-por-hashtag, descubre cuentas nuevas) |
| **TikTok** | ⏳ post-V-run (TT-por-perfil) | ✅ busca cada `Keyword` como hashtag (OR) |

El objetivo es **simétrico** (ambos ejes en ambas plataformas, 4 llamadas Apify); las dos celdas ⏳
se construyen tras la V-run que valida el refactor de relevancia. Hoy: IG solo por referentes, TikTok
solo por keywords. Las keywords se cargan **como se hashtaggean** (una palabra; multi-palabra colapsa
a `#palabrapalabra`).

---

## Knobs (nodo `Config`)

`ig_results_limit` / `tt_results_limit` (volúmenes Apify) · `peso_views`/`peso_likes`/`peso_eng`
(prescore métrico) · `peso_relevancia` (0.7 — Haiku vs métricas en el composite) · `boost_idioma`
(premia no-español) · `umbral_viral` (700k) · `top_n_fallback`. Los pesos exactos se calibran con data
real (Stage 5). `criterios_relevancia` los edita el equipo en Airtable, no acá.

---

## Credenciales

| Servicio | Uso | Cómo |
|---|---|---|
| Apify | Scrape IG (`apify/instagram-scraper`) + TikTok (`clockworks/free-tiktok-scraper`) | community node `@apify/n8n-nodes-apify`, credencial `apifyApi` |
| Anthropic | Pre-trim + Gate + traducción (Claude Haiku) | placeholder `<ANTHROPIC_API_KEY>` en **3** Code nodes |
| Supadata | Transcripción | placeholder `<SUPADATA_API_KEY>` en `Transcribir (Supadata)` |
| Airtable | Cockpit (lee config, escribe candidatos) | credencial nativa `airtableTokenApi` "Airtable PAT" |
| Supabase | Registro (dedup + histórico + señal) | credencial nativa `supabaseApi` "Supabase Registro" |

`AIRTABLE_BASE_ID` / `SUPABASE_URL` / `INSTANCE_ID` no son secretos pero son IDs → se editan en el
nodo `Config` al importar (placeholders `<<...>>`), no se commitean.

---

## Cómo correrlo

1. Importá `workflow.json` en n8n.
2. Asigná las credenciales nativas (Apify, Airtable PAT, Supabase Registro).
3. Llená en el nodo `Config`: `airtable_base_id`, `supabase_url`, `instance_id`.
4. Pegá las API keys: 3× `<ANTHROPIC_API_KEY>` (pre-trim, gate, traductor) + 1× `<SUPADATA_API_KEY>`.
5. **Execute Workflow** para una corrida manual (la primera con `dias_recencia` alto = backfill), o
   dejá el cron semanal.

> El registro a Supabase (`Abrir run` / `Reportar outputs` / `Cerrar run`) es **continue-on-fail**:
> sin Supabase el motor entrega igual a Airtable, solo no reporta. `Abrir run` corre **primero, en
> serie** (Config → Abrir run → Leer Proyectos): así `Preparar outputs Supabase` puede referenciar el
> `run_id` (si quedara en paralelo, n8n lo ejecutaría después y la referencia rompe).

---

## Editar el workflow

Construido por **builder Node**, no a mano: cargá el JSON, mutá `node.parameters.*` por nombre de
nodo, reescribí con `JSON.stringify`/`json.dump` (UTF-8, 2 espacios). No edites a mano las
expresiones grandes `={{ ... }}`. Validá con `cd core/scripts && npm run validate` (contrato del
manifest + escaneo de secretos) y por **re-import + Execute** en n8n (el motor corre en n8n, no
localmente).
