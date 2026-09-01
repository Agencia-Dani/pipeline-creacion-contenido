# Motor de reels — detector de referentes virales → guiones

> 🛑 **AVISO DE VIGENCIA (2026-08-31).** Este documento describía la arquitectura de **Airtable**
> como si fuera la actual, y Airtable se purgó el **2026-08-03** con su PAT revocado. Decía que la
> config se lee de Airtable, que los candidatos se entregan a Airtable, listaba la credencial
> `airtableTokenApi` como dependencia viva, le pedía al operador llenar `airtable_base_id` y llamaba
> al trigger *"el botón de Airtable"*. Su archivo hermano [CLAUDE.md](./CLAUDE.md) decía lo
> contrario **en la misma carpeta** desde D7, y `CLAUDE.md` de la raíz ya mandaba a leer ése.
>
> Corregido acá. **La fuente de verdad es `workflow.json`**, y `npm run n8n:diff` dice si el live
> corre lo que ese archivo declara: si algo de este README lo contradice, gana el JSON.

Workflow de **n8n** que es el motor del MVP de reels: lee la config del equipo de redes en
**Supabase**, descubre reels de IG + TikTok, los ordena por relevancia y viralidad, transcribe y
**traduce literal al español**, y entrega **candidatos a `app.candidatos`** (PostgREST, ADR-035) para que el equipo (Majo, Jero)
los califique. El estado de producto vive en [ROADMAP §3](../../ROADMAP.md); el porqué de las
decisiones en [ADR-009](../../docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) +
[ADR-010](../../docs/adr/ADR-010-scoring-semantico-y-etapa-calidad.md); el contrato del manifest en
[workflow.yaml](./workflow.yaml).

> **Archivo:** [`workflow.json`](./workflow.json) — importable en n8n (`Workflows → Import from File`).
> Un solo cliente/voz por copia (multi-instancia real = F5). **El motor no usa ninguna credencial de
> Google.**

---

## Qué hace (36 nodos, 3 entradas: cron + manual + webhook on-demand)

> 🆕 **Dos nodos nuevos el 2026-08-31: `IF — hay videos nuevos` y `Cerrar run (sin novedades)`.**
> Una corrida que miraba todo y no encontraba nada nuevo **se registraba como `fallo`**, y era el
> defecto más caro del sistema por lo que arrastraba: `Heat-score v1` devolvía 0 items ⇒ en n8n nada
> río abajo corre ⇒ `Cerrar run` nunca se ejecutaba ⇒ la fila quedaba `en_curso` ⇒ el barredor de
> zombies de la corrida siguiente la marcaba `fallo`. En n8n la ejecución figuraba **success**.
> Medido: **26 de 87 corridas decían `fallo` y solo ~2 eran errores de verdad**. Y como las 26
> quedaban con `metricas` en NULL, y `app.v_costos_semana` filtra por `unidades > 0`, **el 26% de
> las corridas del motor no sumaba nada al costo** — incluidas las que se cayeron *después* de
> pagarle a Apify y a Supadata.
> Ahora `Heat-score v1` lleva `alwaysOutputData` (sin eso la cadena se corta y no hay IF que valga),
> el IF separa *"hay algo nuevo"* de *"miré y no había nada"*, y la rama vacía cierra en `ok` con
> `sin_novedades: true` y un aviso que dice cuántos videos se miraron. **No encontrar nada es un
> éxito, no un fallo.**

Cron semanal (lunes 8am) o **Execute manual** → ambos entran a `Config`.

1. **COLECTAR** — `Config` → abre el run en el registro (Supabase) → lee la config por la fachada `run-plan` (Proyectos, Voces,
   Referentes, **Ajustes**) → `Armar plan de corrida` arma la búsqueda por referentes → **2 nodos
   Apify** (IG por cuenta-referente + TikTok por perfil-referente): **solo referentes** (ADR-019).
2. **NORMALIZAR** — `Normalizar IG`/`Normalizar TT` mapean el shape crudo de cada API al mismo
   `content_item` (incluida la portada del video) → `Merge scrapes` (append) → `Asignar proyecto+voz`.
3. **FILTRAR / SCOREAR** — `Pre-trim relevancia` (Haiku laxo sobre el caption, cuela off-topic antes
   de transcribir) → `Heat-score v1` (prescore métrico: percentil de views/likes/eng × boost idioma ×
   señal de selección; dedup contra `processed_items`; top_n por proyecto).
4. **ENRIQUECER** — `Transcribir (Supadata)` → `Traducir (Claude Haiku)` (literal, solo si no está en
   español; `lang` de Supadata como fuente primaria). Ambos **dedupean por video** (1 llamada por
   `external_id`, el resultado se reparte a las copias del fan-out), y Transcribir tiene **presupuesto
   de tiempo** (780s, con un pool de 8 llamadas concurrentes — cierre 55, plan pago Supadata 10 req/s): si se agota, el resto de la corrida sigue sin transcript en vez de morir por el
   watchdog de n8n (cierre 31).
5. **CALIDAD** — `Gate de relevancia` (Haiku **estricto** sobre el transcript): juzga contra
   `criterios_relevancia` (Proyecto ⊕ Voz), dropea lo irrelevante, y compone
   `heat_score = peso_relevancia·score_haiku + (1-peso)·percentil(prescore)`. Los descartes con score
   **borderline** (banda 0.35–0.6, cap ~10/corrida) no mueren en silencio: se suben a la tabla
   **`Descartes del gate`** del cockpit para auditar falsos negativos (ADR-021).
6. **ENTREGAR** — `Armar candidato` → `Preparar candidatos` → POST a `Candidatos` (estado `nuevo`,
   con script, idioma, thumbnail, `relevancia_score`/`relevancia_razon`) + registro en Supabase
   (`runs` con las métricas completas del embudo: `sin_guion`, llamadas por servicio y desglose por
   referente — nodo `Resumen del run`, ADR-021; continue-on-fail).

Todos los gates son **fail-open**: si Haiku o Supadata fallan, el item pasa (no se vacía la entrega).

---

## Descubrimiento (cómo busca)

**Solo por referentes** (ADR-019) — una llamada Apify por plataforma:

| Plataforma | Nodo |
|---|---|
| **Instagram** | `Apify — IG Reels`: reels recientes de cada `Referente` IG (`directUrls`, 1 llamada por cuenta vía `Split IG referentes`) |
| **TikTok** | `Apify — TikTok Perfil`: cada `Referente` TikTok (`profiles`) |

Cada rama va a su `Normalizar` (mismo `content_item`) → `Merge scrapes` (append) → `Asignar
proyecto+voz` matchea **por cuenta**: cada video se asigna a los proyectos activos que sembraron a su
referente (fan-out ADR-013; la salida dedupea a un Candidato por video, ADR-018). El descubrimiento de
cuentas nuevas no lo hace el motor: es el futuro motor de descubrimiento de referentes (ROADMAP §5).
Para activar cada plataforma hay que **sembrar `Referentes`** (las llamadas con lista vacía no traen
nada, fail-open) y tener su toggle de `Ajustes` en 1.

---

## Knobs

Los del **scoring y el volumen viven en la tabla `app.ajustes`** de Supabase (clave→valor, ADR-011), en
**español claro** → el equipo los edita sin tocar n8n: *Peso de vistas/likes/interacción* (prescore
métrico) · *Peso de relevancia* (0.7, IA vs métricas en el orden) · *Bonus idioma extranjero* ·
*Seguidores para marcar viral* (700k) · *Candidatos por proyecto* · *Mínimo de vistas/likes* (**piso
duro** pre-`top_n`) · *Resultados Instagram/TikTok por corrida* (**volumen/costo** Apify) ·
*Relevancia mínima* (**umbral** del gate). Default = "nada corta". El motor (`Armar plan`) **mapea
cada clave amigable → su parámetro interno** (`AJUSTE_MAP`) y la aplica **sobre los defaults del nodo
`Config`** (tabla vacía/caída = defaults, fail-open). En `Config` quedan solo los **IDs** y los caps
dev-only. La **personalización del descubrimiento** vive en `Referentes` (qué cuentas, por proyecto)
y los 2 toggles de plataforma de `Ajustes`; `criterios_relevancia` en `Proyectos`/`Voces`.

---

## Credenciales

| Servicio | Uso | Cómo |
|---|---|---|
| Apify | Scrape IG (`apify/instagram-scraper`) + TikTok (`clockworks/free-tiktok-scraper`) | community node `@apify/n8n-nodes-apify`, credencial `apifyApi` |
| Anthropic | Pre-trim + Gate + traducción (Claude Haiku) | placeholder `<ANTHROPIC_API_KEY>` en **3** Code nodes |
| Supadata | Transcripción | placeholder `<SUPADATA_API_KEY>` en `Transcribir (Supadata)` |
| Supabase | Cockpit (lee config por `run-plan`, escribe candidatos por PostgREST) | credencial nativa `supabaseApi` "Supabase account" |
| Supabase | Registro (dedup + histórico + señal) | credencial nativa `supabaseApi` "Supabase Registro" |

`SUPABASE_URL` / `INSTANCE_ID` no son secretos pero son IDs → se editan en el
nodo `Config` al importar (placeholders `<<...>>`), no se commitean.

---

## Cómo correrlo

1. Importá `workflow.json` en n8n.
2. Asigná las credenciales nativas (Apify, Supabase account, Supabase Registro).
3. Llená en el nodo `Config`: `instance_id`, `supabase_url`, `instance_id`.
4. Reemplazá `<<WEBHOOK_PATH_MOTOR>>` en el nodo `Disparo on-demand (webhook)` por un path aleatorio
   largo. La URL de Producción resultante dispara corridas **pagas**: va al gestor de contraseñas y a
   el cockpit (ADR-023), jamás a git.
5. Pegá las API keys: 3× `<ANTHROPIC_API_KEY>` (pre-trim, gate, traductor) + 1× `<SUPADATA_API_KEY>`.
6. **Execute Workflow** para una corrida manual (la primera con `dias_recencia` alto = backfill),
   dejá el cron semanal, o disparo on-demand por el botón ▶ del cockpit (webhook).

> El registro a Supabase (`Abrir run` / `Cerrar run`) es **continue-on-fail**: sin Supabase el motor
> entrega igual, solo no reporta — y el guard single-flight **deja pasar** (fail-open).
> El arranque va **en serie**: `Config → Barrer runs zombie → Leer corridas vivas → Guard
> single-flight → Abrir run → Leer plan (fachada)`. El guard (ADR-023) bloquea si hay una corrida viva
> (`en_curso` más joven que `ventana_corrida_min` — el valor vigente vive en
> [workflow.yaml](./workflow.yaml)) y aplica a los 3 triggers; el barrido corre antes, así un zombie
> nunca deja el motor trabado. `Abrir run` en serie es lo que permite que `Cerrar run` referencie el
> `run_id`: colgado en paralelo, **el orden lo decidiría la posición en el canvas** y la referencia
> puede romper (`hasn't been executed`). Toda dependencia entre nodos va en serie — cierre 70.

---

## Editar el workflow

Construido por **builder Node**, no a mano: cargá el JSON, mutá `node.parameters.*` por nombre de
nodo, reescribí con `JSON.stringify`/`json.dump` (UTF-8, 2 espacios). No edites a mano las
expresiones grandes `={{ ... }}`. Validá con `cd core/scripts && npm run validate` (contrato del
manifest + escaneo de secretos).

**Llevarlo al live ya no es re-importarlo** ([ADR-053](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)):
`npm run n8n:push -- motor --nodos "<nodos tocados>"` parchea los `parameters` por la API (dry-run;
`--apply` escribe, `n8n:restore` revierte), y `npm run n8n:diff` verifica que el live corra lo que dice
el repo. Desde el 30/08 el push **también cubre la topología** (ADR-053 §Enmienda) y el re-import
queda solo para **crear el workflow de cero**. La conducta
final se valida en n8n con *Execute* — el motor corre ahí, no localmente. Detalle en
[CLAUDE.md §Operación](./CLAUDE.md).
