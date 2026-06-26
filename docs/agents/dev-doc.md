# Dev-doc — motor + archivado: nodos, orden y mapa de datos

> Referencia técnica para un dev que va a tocar los workflows. Responde tres cosas: **qué hace cada
> nodo y en qué orden corre**, **qué tabla de Airtable lee/escribe cada uno**, y **cómo viaja cada
> campo** por Supabase y el Sheet. No re-explica el porqué (eso son los ADRs ni el qué-de-producto
> (ROADMAP/PLAN); acá está el cómo, mapeado al `workflow.json` real.
>
> **Fuente de verdad:** los dos `workflow.json`. Si esta doc y el JSON difieren, gana el JSON —
> avisá y corregí esta doc. Generada leyendo el código nodo a nodo (no de memoria), 2026-06-17.
>
> ⚠️ **Refactor 2026-06-24 (ADR-015 + ADR-016) — varias descripciones de nodos abajo quedaron stale;
> el JSON manda.** Cambios: búsqueda **solo por referente** (eje keyword **dormante** tras el flag
> `buscar_keyword_tiktok`=off; IG-Hashtag corre vacío); knobs **globales** en `Ajustes` (`top_n` = N
> total/corrida contado como **videos distintos**, `dias_recencia`, `resultados_referente`) + topes
> dev-only en Config (`cap_resultados_referente`, `cap_top_n`); `Heat-score` **ya no corta a top_n**
> (sólo prescore + dedup + `cap_top_n`); `Transcribir` **dedup por external_id** (1 vez por video); el
> **corte final a N videos distintos** por heat compuesto vive en `Armar candidato`; `Proyectos` perdió
> `top_n`/`dias_recencia`/los 4 toggles; `estado` es binario (**`publicado` retirado**).
>
> ⚠️ **Enmienda 2026-06-25 (ADR-017) — motor listo para prod.** El eje **keyword TikTok se reactiva**
> como **toggle** (`buscar_keyword_tiktok` default 1) — deja de estar dormante; la señal por tema
> (`v_senal_tema`) vuelve a alimentarse. **Tres toggles de eje** en `Ajustes`, default todos ON:
> `buscar_referente_ig`, `buscar_referente_tiktok`, `buscar_keyword_tiktok` (1/0; `Armar plan` los lee
> vía `pick` y gatea cada rama). **Knob propio del eje keyword**: `resultados_keyword` (10) con cap
> dev-only `cap_resultados_keyword` (20); `Apify — TikTok` (hashtags) usa `resultsPerPage =
> resultados_keyword` (el de perfiles sigue con `resultados_referente`). **Piso por cuenta fuente**
> `piso_referente` (Config, 5): `Armar candidato` hace round-robin hasta `piso` videos por cuenta antes
> de rellenar por heat global hasta `top_n` (fail-open con 0). **Barredor de zombies del motor**: nodo
> nuevo `Barrer runs zombie` entre `Abrir run` y `Leer Proyectos`, y `Abrir run` ahora taggea
> `params.workflow='motor'`. **Motor: 35 → 36 nodos.**
>
> Pies de página: el motor en
> [`workflows/workflow-short-form-content/`](../../workflows/workflow-short-form-content/), el
> archivado en [`workflows/workflow-archivado/`](../../workflows/workflow-archivado/). El cockpit
> Airtable en [`core/contracts/airtable-cockpit.md`](../../core/contracts/airtable-cockpit.md); los
> schemas Supabase en [`core/schema/`](../../core/schema/) (`001`–`006`).

---

## 1. Los dos workflows de un vistazo

| Workflow | Trigger | Cadencia | Nodos | Qué hace |
|---|---|---|---|---|
| **Motor** (`short-form-content`) | Cron + Execute manual | **Semanal**, lunes 8am | 36 | Descubre reels (IG+TikTok, Apify) → prescore métrico → transcribe/traduce → gate de relevancia (Haiku) → escribe **Candidatos** en Airtable + registra la corrida en Supabase |
| **Archivado** (`archivado`) | Cron + Execute manual | **Diario**, 9am (`0 9 * * *`) | 16 | Toma los Candidatos **calificados** en Airtable → los archiva en Supabase (`outputs`) + append al **Sheet Histórico** → los borra de Airtable (para no pasar el límite free) |

Ambos comparten el patrón `Config → Abrir run → … → Cerrar run`: la corrida se registra en la tabla
`runs` de Supabase (abre `en_curso`, cierra `ok` con métricas). Todos los nodos de Supabase son
**continue-on-fail** (invariante: si el registro falla, el trabajo útil igual se entrega).

---

## 2. Motor (`short-form-content`) — 36 nodos

### 2.1 Orden de ejecución (topología real)

```
Cron semanal ┐
             ├─► Config ─► Abrir run ─► Barrer runs zombie ─► Leer Proyectos ─► Leer Voces ─► Leer Keywords
Ejecutar     ┘                                                                     │
manual                                              Armar plan ◄─ Leer Ajustes ◄─ Leer Referentes
                                                        │  (fan-out a 4 ramas Apify)
       ┌────────────────────┬────────────────────┬─────┴───────────────┐
       ▼                    ▼                    ▼                       ▼
 Split IG referentes   Apify IG Hashtag     Apify TikTok        Apify TikTok Perfil
       ▼                    │                    │                       │
 Apify IG Reels            │                    │                       │
       └──► Merge IG ◄─────┘                    └──► Merge TT ◄──────────┘
              ▼                                         ▼
        Normalizar IG ──────► Merge scrapes ◄──── Normalizar TT
                                    │
                                    ▼
                          Asignar proyecto+voz ─► Pre-trim relevancia
                                                          │
                            Leer señal selección ─► Leer señal tema ─► Leer procesados ─► Heat-score v1
                                                                                              │
                                              ┌───────────────────────────────────────────────┤
                                              ▼                                               ▼
                                  Transcribir (Supadata)                            Preparar procesados
                                              ▼                                               ▼
                                  Traducir (Claude Haiku)                            POST processed_items
                                              ▼
                                    Gate de relevancia ─► Armar candidato
                                                                │
                                          ┌─────────────────────┴───────────────┐
                                          ▼                                      ▼
                               Preparar batch Airtable                Cerrar run (executeOnce)
                                          ▼
                              POST Airtable Candidatos
```

Notas de orden que muerden si las ignorás:
- **`Abrir run` va EN SERIE** entre `Config` y `Leer Proyectos`, no colgado en paralelo. `Cerrar run`
  lo referencia por nombre (`$('Abrir run…')`); n8n corre las ramas en orden de conexión, así que si
  `Abrir run` cuelga en paralelo, corre **después** del pipeline y la referencia rompe (`hasn't been
  executed`). (Bug ya pisado, cierre 3.)
- **Las 5 lecturas de Airtable son una cadena serial** (Proyectos→Voces→Keywords→Referentes→Ajustes→
  Armar plan), no un fan-out. **Paginan** (cierre 15, #4): `options.pagination` sigue el `offset` de
  Airtable hasta agotar páginas → no se truncan a 100 records.
- **`Split IG referentes`** corre el Apify IG Reels **1× por referente** (por eso `ig_results_limit` es
  cap **por-referente**, no global). Las 2 ramas IG (Reels de perfil + Hashtag) se unen en `Merge IG`
  (append) antes de `Normalizar IG`; las 2 TikTok (hashtag + perfil) en `Merge TT`. Sin estos merge,
  n8n correría el Normalizador 1× por conexión y perdería una rama (bug F1, cierre 12).
- **Las 3 lecturas de Supabase** (señal selección → señal tema → procesados) van enhebradas **después
  de Pre-trim**, no al inicio: así no bloquean el fan-out de Apify. `Leer procesados` consulta solo los
  `external_id` de la corrida (`in.(…)`, dedup acotado #5) — ya no `limit=20000`.
- **`Heat-score v1` tiene dos salidas:** una al pipeline de enriquecimiento (Transcribir→…→candidato)
  y otra a `Preparar procesados`. Esta segunda registra en `processed_items` **todo el top_n que se
  transcribió**, no solo los candidatos que sobreviven al gate → el dedup no re-procesa lo ya visto
  aunque el gate lo haya descartado.
- **`Armar candidato` tiene dos salidas:** `Preparar batch Airtable` (los candidatos al equipo) y
  `Cerrar run` directo. El motor **ya no escribe filas por-item a `outputs`** (ADR-014); por eso
  `Cerrar run` lleva `executeOnce: true` (recibe los N candidatos pero cierra el run una sola vez).

### 2.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace · lee → emite |
|---|---|---|---|
| 1 | Cron — semanal (lunes 8am) | scheduleTrigger | Dispara la corrida los lunes 8am (`weeks`, día 1, hora 8). |
| 2 | Ejecutar manual | manualTrigger | Execute Workflow a mano (las V-runs). |
| 3 | Config | set | Define los **IDs** (`airtable_base_id`, `supabase_url`, `instance_id` — placeholders `<<…>>`) y los **defaults de scoring** (`ig_results_limit` 8, `tt_results_limit` 30, `peso_views` .4, `peso_likes` .4, `peso_eng` .2, `peso_relevancia` .7, `boost_idioma` .3, `umbral_viral` 700000, `top_n_fallback` 25). Los Ajustes de Airtable caen **encima** de estos. |
| 4 | Abrir run en el registro | http POST | `POST runs` (`instance_id`, `trigger_type:'cron'`, `estado:'en_curso'`, `params:{workflow:'motor'}`), `Prefer: return=representation` → devuelve `id`. continue-on-fail. El tag `workflow:'motor'` es lo que scopea el barredor (4b). |
| 4b | Barrer runs zombie | http PATCH | **Auto-sanador del motor (ADR-017), entre `Abrir run` y `Leer Proyectos`.** `PATCH runs` → marca `fallo` los runs de motor anteriores colgados `en_curso` (scoped `params->>workflow=eq.motor` + `id=neq.<run actual>`). Espejo del nodo homónimo del archivado. continue-on-fail. |
| 5 | Leer Proyectos | http GET | Airtable `Proyectos` con `filterByFormula={activo}`. **Pagina** (`options.pagination` sigue el `offset` → todas las páginas, #4). |
| 6 | Leer Voces | http GET | Airtable `Voces` (todas — el id→nombre y `criterios_relevancia`). Pagina (#4). |
| 7 | Leer Keywords | http GET | Airtable `Keywords` con `{activo}`. Pagina (#4). |
| 8 | Leer Referentes | http GET | Airtable `Referentes` con `{activo}`. Pagina (#4). |
| 9 | Leer Ajustes | http GET | Airtable `Ajustes` (todas). Pagina (#4). continue-on-fail → fail-open: sin tabla, usa los defaults de Config. |
| 10 | Armar plan de corrida | code | El cerebro de la config. Construye `projects{}` (con `criterios`, `voz_criterios`, `top_n`, `dias_recencia`, `min_views/likes`, toggles de eje), las listas de descubrimiento (`ig_urls` de referentes, `tt_profiles`, `ig_hashtags`, `tt_hashtags` de keywords colapsadas a un hashtag), los mapas `*_owner_to_proj`/`kw_to_proj`, `max_dias_recencia`, y `ajustes` (traduce la `clave` española → key interna vía **`AJUSTE_MAP`**). Los consumidores de las lecturas 5–9 agregan todas las páginas (`flatMap` sobre `.records`). **`ig_hashtags` queda siempre vacío** (F2 apagado, cierre 15): el eje IG-hashtag no aporta; TikTok-hashtag intacto. |
| 11 | Split IG referentes | code | Emite **1 item por referente IG** → hace que `Apify — IG Reels` corra una vez por cuenta. Por eso `ig_results_limit` es cap **por-referente**, no global. |
| 12 | Apify — IG Reels | apify | Actor `apify~instagram-scraper`, `directUrls` = la URL del referente del item (vía Split), `searchType:'user'`, `resultsLimit`, `onlyPostsNewerThan` si hay ventana. |
| 13 | Apify — IG Hashtag | apify | Mismo actor, `directUrls` = `instagram.com/explore/tags/<h>/` por cada `ig_hashtag`. **Hoy recibe 0 URLs** (`ig_hashtags` vacío, F2). |
| 14 | Apify — TikTok | apify | Actor `clockworks~free-tiktok-scraper`, `hashtags=tt_hashtags` (eje keyword, gateado por `buscar_keyword_tiktok`), `resultsPerPage=resultados_keyword` (knob propio del eje keyword, ADR-017). |
| 15 | Apify — TikTok Perfil | apify | Mismo actor, `profiles=tt_profiles` (referentes TikTok). *Hoy `tt_profiles` sale vacío hasta sembrar Referentes TikTok.* |
| 16 | Merge IG | merge (append) | Une **IG Reels ⊕ IG Hashtag** en un input → `Normalizar IG`. Sin esto n8n correría el Normalizador 1× por conexión (bug F1). |
| 17 | Merge TT | merge (append) | Une **TikTok ⊕ TikTok Perfil** → `Normalizar TT`. |
| 18 | Normalizar IG | code | Mapea cada post IG (de **Merge IG**) al `content_item` común: `plataforma`, `external_id`, `username`, `seguidores`, `descripcion` (caption), `likes`, `comentarios`, `reproducciones`, `url`, `video_url`, `thumbnail_url` (`displayUrl`), `hashtags`, `engagement_rate`, `fecha_publicacion`. Descarta no-video (`type !== 'Video'`). |
| 19 | Normalizar TT | code | Idem para TikTok (de **Merge TT**): `authorMeta`, `diggCount`→likes, `playCount`→reproducciones, `videoMeta.coverUrl`→thumbnail. Mismas keys que IG. |
| 20 | Merge scrapes | merge (append) | Une IG + TikTok en un solo lote, sin índice (append puro). |
| 21 | Asignar proyecto+voz | code | **Fan-out (ADR-013):** emite **1 item por cada proyecto activo que reclama** el video (referente con `_tema=''`, keyword con su término). Asigna `proyecto_id`/`voz_id`/`_tema`: **1)** por referente (IG por cuenta / TT por perfil), **2)** por keyword (hashtag del caption → ambas plataformas), **3)** fallback al único proyecto activo. Descarta sin `url`, sin proyecto, y lo más viejo que `dias_recencia` (recencia capa 2). Emite `_top_n`, `_dias`, `_keywords`, `_tema`. |
| 22 | Pre-trim relevancia | code + Haiku | Colador **laxo** (recall) sobre el caption, por proyecto, contra `criterios` (Proyecto⊕Voz). Descarte por **`(proyecto, external_id)`** (no global, para no matar la copia del otro proyecto del fan-out). Descarta solo lo **obviamente** off-topic; sin criterios no descarta nada. **Fail-open**. `claude-haiku-4-5`. Logea descartes: `[Pre-trim] descartados off-topic: n/total -> ids` (cierre 15). |
| 23 | Leer señal selección | http GET | Supabase `v_senal_seleccion` (`referente`, `idioma`, `tasa_seleccion`). continue-on-fail. |
| 24 | Leer señal tema | http GET | Supabase `v_senal_tema` (`tema`, `tasa_seleccion`). continue-on-fail. |
| 25 | Leer procesados | http GET | Supabase `processed_items` filtrado a los `external_id` de **esta corrida** (`external_id=in.(…)`, dedup acotado #5) → el set de dedup. Ya no `limit=20000`. continue-on-fail. |
| 26 | Heat-score v1 | code | **Prescore métrico** = `peso_views·pct(views) + peso_likes·pct(likes) + peso_eng·pct(eng)` por proyecto; × `(1+boost_idioma)` si `guessLang(caption+bio)≠es`; × `(1+sel)` con `sel = max(señal_referente, señal_tema)` (bi-eje O7). **Piso duro** `min_views`/`min_likes` y **dedup** (`!seen`) antes del `top_n` por proyecto. Emite `heat_score`, `idioma_guess`, `viral_por_tamano`. Lee 22, 23, 24, 25 + Config⊕ajustes. |
| 27 | Transcribir (Supadata) | code | Transcribe cada item del top_n (Supadata, `&text=true&mode=auto`), throttle 1.5s, trunca 6000 chars. `idioma_detectado` = `lang` de Supadata (primario) → fallback `guessLang(transcript)` → `idioma_guess`. **Fail-open** (sin transcript, sigue). `<SUPADATA_API_KEY>`. |
| 28 | Traducir (Claude Haiku) | code | Traduce **literal** al español **solo si** `idioma_detectado≠es` (sin reescribir/resumir/embellecer). **Fail-open**: si falla, `script = transcript`. Emite `script`, `idioma`. `claude-haiku-4-5`. |
| 29 | Gate de relevancia | code + Haiku | **Jurado estricto** (precision) contra `criterios`, sobre el `script` (o el caption como **fallback** si no hubo transcript). Dropea `relevante:false` y `score < min_relevancia`. Recalcula `heat_score` **composite** = `peso_relevancia·sHaiku + (1-peso)·percentil(prescore_metrico)`. Marca `[SIN TRANSCRIPT: …]` en `relevancia_razon`. Emite `prescore_metrico`, `relevancia_score`, `relevancia_razon`, `heat_score`. **Fail-open**. Logea descartes: `[Gate] DESCARTE pid=… id=… score=… motivo=…` (cierre 15). |
| 30 | Armar candidato | code | **Corte final a `top_n` videos distintos** (ADR-016) **con piso por cuenta** (`piso_referente`, ADR-017): ordena por heat, hace round-robin hasta `piso` videos por cuenta fuente, rellena el resto por heat global, conserva las copias del fan-out (fail-open con piso=0). Luego reconstruye el objeto candidato final (lista explícita — ver §7): `titulo` del caption (80 chars), `script`, `idioma`, proyecto/voz, `referente`(=username), `url_referente`(=url), métricas, `heat_score`, `viral_por_tamano`, `external_id`, `relevancia_*`, `thumbnail_url`, `tema`(=`_tema`). |
| 31 | Preparar batch Airtable | code | Arma `records[]` de Airtable (`fields` + links `proyecto`/`voz` + `thumbnail` attachment), en **batches de 10**, `typecast:true`, `estado:'nuevo'`. |
| 32 | POST Airtable Candidatos | http POST | `POST Candidatos`. **stop-on-fail** (si Airtable rechaza, la corrida falla — es la entrega real). |
| 33 | Cerrar run en el registro | http PATCH | `PATCH runs?id=eq.<id>` con `fin`, `estado:'ok'`, `metricas` del embudo completo `{colectados, asignados, pretrim, filtrados, gate, outputs}` (`outputs` = `$('Armar candidato').all().length`, ADR-014). **`executeOnce: true`** → cierra el run 1× pese a los N candidatos de entrada. continue-on-fail. |
| 34 | Preparar procesados | code | Arma el batch `processed_items` (`instance_id`, `platform`, `external_id`, `url`, `seguidores`, `flag_viral`, `idioma`) de **todo lo que salió de Heat-score** (el top_n transcrito). |
| 35 | POST processed_items | http POST | `POST processed_items`, `Prefer: resolution=ignore-duplicates`. continue-on-fail. |

### 2.3 El scoring en una frase

`Heat-score v1` produce un **prescore métrico** (percentiles de views/likes/engagement, con boost por
idioma no-español y por señal de aprendizaje bi-eje), corta por piso duro + dedup, y deja el `top_n`
por proyecto. El `Gate de relevancia` lo **re-rankea** con el juicio semántico de Haiku:
`heat_score = peso_relevancia·score_Haiku + (1-peso_relevancia)·percentil(prescore)`. Todos los knobs
salen de **Config** y los pisa la tabla **Ajustes** de Airtable (ADR-011). El detalle del modelo y sus
límites: ADR-010 + handoff §Mejoras #13/#18.

---

## 3. Archivado (`archivado`) — 18 nodos

> **Validado para producción (cierre 19).** Corrió end-to-end con calificados reales (run `687027e2`):
> idempotencia, paginación, split de estados, barrido de zombies, cierre robusto y curación completa. El
> cron sigue sin activar (D1 del ROADMAP). Fuente de verdad = `workflow.json`.

### 3.1 Orden de ejecución

```
Cron semanal (dom 6pm) ┐
                ├─► Config ─► Abrir run ─► Barrer runs zombie ─► Leer Proyectos ─► Leer Voces ─► Leer Candidatos calificados
Ejecutar manual ┘                                                                                              │
                                                                                                               ▼
                                                                                                   IF — hay calificados
                                          (no) │                                                               │ (sí)
                                               ▼                                                               ▼
                                          Cerrar run                                                Armar filas archivado
                                               ▲                                                               ▼
                                               │                                                  Preparar outputs Supabase
                                               │                                                               ▼
                                               │                              ┌──────────────  Registrar outputs (Supabase)  (TODOS los decididos)
                                               │                       (todos)│                                ▼
                                               │                              │                       Preparar filas Sheet  (SOLO aprobado)
                                               │                              │                                ▼
                                               │                              │                      Append al Sheet Histórico
                                               │                              ▼                                ▼
                                               │                            Reconvergir tras Sheet (merge) ◄───┘
                                               │                                                ▼
                                               │                                     Preparar borrado Airtable
                                               │                                                ▼
                                               └─────────────────────────────────────  Borrar de Airtable
```

**El SPLIT de sumideros (cierre 19):** `Registrar outputs` escribe a Supabase **todos** los decididos (con
su `estado`); el Sheet recibe **solo** `aprobado`; el borrado de Airtable toma **todos**. El
`Reconvergir tras Sheet` (Merge) garantiza que el borrado corra **aun con 0 aprobados** (rama Sheet vacía) pero
espere al Append. **Orden de sumideros = intencional:** Supabase → Sheet → **recién entonces** borra de Airtable;
el Append **no** es continue-on-fail (si el Sheet falla, corta antes de borrar → no se pierde la curación).
`Borrar de Airtable` reintenta **3× cada 2s**; el Append reintenta **3× cada 30s** (503 transitorios de Google).

### 3.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace |
|---|---|---|---|
| 1 | Cron — semanal (domingo 6pm) | scheduleTrigger | `0 18 * * 0` (domingo 18:00, un día antes del motor). |
| 2 | Ejecutar manual | manualTrigger | Execute a mano. |
| 3 | Config | set | `airtable_base_id`, `supabase_url`, `instance_id`, `sheet_id`, `sheet_tab` (placeholders `<<…>>`). |
| 4 | Abrir run en el registro | http POST | `POST runs` con `params:{workflow:'archivado'}`, `return=representation`. continue-on-fail. |
| 5 | Barrer runs zombie | http PATCH | **Auto-sanador (B5, cierre 19).** `PATCH runs` → marca `fallo` los runs de archivado anteriores colgados `en_curso` (scoped `params->>workflow=eq.archivado` + `id=neq.<run actual>`). Repara la integridad de `runs` cuando una corrida previa falló antes de *Cerrar run*. continue-on-fail. |
| 6 | Leer Proyectos | http GET | Airtable `Proyectos` (`pageSize 100`) → mapa `id→nombre`. **Pagina** (sigue el `offset`, #4). |
| 7 | Leer Voces | http GET | Airtable `Voces` (`pageSize 100`) → mapa `id→nombre`. Pagina (#4). |
| 8 | Leer Candidatos calificados | http GET | Airtable `Candidatos` con `filterByFormula=NOT({estado}='nuevo')` (trae aprobado/descartado), `pageSize 100`. **Pagina** (sigue el `offset` → todas las páginas, no trunca a 100, #4). `Armar filas` agrega todas las páginas (`flatMap`). |
| 9 | IF — hay calificados | if | `records.length > 0` → Armar filas; si no → Cerrar run directo. |
| 10 | Armar filas archivado | code | Por cada decidido arma `{record_id, output, sheet}`. Normaliza `estado` (aprobado/descartado, default descartado), resuelve proyecto/voz por nombre, `calificado_en = fecha_calificacion`. **`output.external_id = r.id`** (el id del record de Airtable, ver §7). `metadata` lleva `tema`, `calificacion`, `link_doc`. |
| 11 | Preparar outputs Supabase | code | Extrae `outputs[]` (TODOS los decididos) del nodo 10. |
| 12 | Registrar outputs (Supabase) | http POST | `POST outputs?on_conflict=external_id`, `Prefer: resolution=ignore-duplicates,return=minimal` → **idempotente** (re-correr no duplica). Sale a **2 ramas**: Preparar filas Sheet + Reconvergir (input 1). continue-on-fail. |
| 13 | Preparar filas Sheet | code | Extrae `sheet[]` del nodo 10 **filtrando a `aprobado`** (los descartados NO van al Sheet). |
| 14 | Append al Sheet Histórico | googleSheets | `append`, `autoMapInputData` → las keys de la fila deben **coincidir exacto** con los encabezados del Sheet. Credencial **OAuth2** (única dependencia de Google del pipeline). **stop-on-fail** (a propósito). **retry 3× / 30s** (503 de Google). |
| 15 | Reconvergir tras Sheet | merge | Une la rama Sheet (input 0) con la rama directa de Registrar outputs (input 1) → el borrado corre aun con 0 aprobados, pero espera al Append. |
| 16 | Preparar borrado Airtable | code | Arma URLs `DELETE` en **batches de 10** (`records[]=…`) con TODOS los decididos. |
| 17 | Borrar de Airtable | http DELETE | Borra los decididos de `Candidatos`. **retry 3× / 2s.** |
| 18 | Cerrar run en el registro | http PATCH | `PATCH runs` con `fin`, `estado:'ok'`, `metricas:{archivados}`. **El conteo se hace sobre `Leer Candidatos calificados`** (nodo que corre en ambas ramas del IF) → robusto en el caso 0 calificados (no se cuelga). continue-on-fail. |

---

## 4. Conexión con Airtable (mapa lee/escribe)

Base "Reels Cockpit", 6 tablas (contrato completo en
[`airtable-cockpit.md`](../../core/contracts/airtable-cockpit.md)). La API es REST: el motor pega a
`https://api.airtable.com/v0/<base_id>/<Tabla>`. Quién toca qué:

| Tabla | Motor | Archivado | Notas |
|---|---|---|---|
| `Proyectos` | **lee** (`Leer Proyectos`, `{activo}`) | **lee** (`id→nombre`) | El motor lee config (criterios, top_n, dias_recencia, min_*, toggles, voz_default); el archivado solo resuelve el nombre. |
| `Voces` | **lee** (`Leer Voces`) | **lee** (`id→nombre`) | `criterios_relevancia` afina el gate. |
| `Keywords` | **lee** (`Leer Keywords`, `{activo}`) | — | `termino` → hashtag. |
| `Referentes` | **lee** (`Leer Referentes`, `{activo}`) | — | `handle` + `plataforma` → IG por cuenta / TikTok por perfil. |
| `Ajustes` | **lee** (`Leer Ajustes`) | — | Knobs clave→valor; pisa los defaults de Config (fail-open). |
| `Candidatos` | **escribe** (`POST`, `typecast`, batch 10) | **lee** (calificados) + **borra** (`DELETE`, batch 10) | El único write del motor a Airtable. El equipo califica acá; el archivado lo vacía. |

**Campos de `Candidatos` que escribe el motor** (nodo `Preparar batch Airtable`): `titulo`, `script`,
`idioma`, `referente`, `url_referente`, `views`, `likes`, `seguidores`, `engagement`, `heat_score`,
`viral_por_tamano`, `relevancia_score`, `relevancia_razon`, `tema`, `estado:'nuevo'`, `proyecto`
(link), `voz` (link), `thumbnail` (attachment).
**Campos que NO toca el motor** (los pone el equipo o Airtable): `calificacion`, `notas_equipo`,
`fecha` (created time), `fecha_calificacion` (last modified de `calificacion`). El `estado` lo escribe
el motor como `nuevo` y luego lo cambia el equipo.

---

## 5. Esquema Supabase (cada tabla/vista, quién la escribe/lee)

Schemas en [`core/schema/`](../../core/schema/). Acceso por REST con la `service_role` (bypassa RLS;
vive en n8n, jamás en git). Tablas y quién las toca:

| Objeto | Tipo | Lo escribe | Lo lee | Notas |
|---|---|---|---|---|
| `clients` · `workflows` · `instances` | tablas config | seed manual (SQL) | — (referencia) | `instance_id` → nodo Config de ambos workflows. |
| `runs` | tabla | **ambos workflows** (`Abrir run` POST, `Cerrar run` PATCH) | dashboard futuro | Una fila por corrida; `metricas` jsonb distinto por workflow (motor: colectados/asignados/pretrim/filtrados/gate/outputs; archivado: archivados). |
| `outputs` | tabla | **solo el archivado** (`Registrar outputs`, estado calificado + `calificado_en`) | las 4 vistas de abajo | **Histórico canónico (ADR-014):** el motor ya no escribe filas `draft`; cada fila es una pieza calificada. |
| `processed_items` | tabla | **motor** (`POST processed_items`, ignore-duplicates) | **motor** (`Leer procesados`) | El dedup. `unique(platform, external_id)`. |
| `v_corpus_aprobados` | vista | — | (en pausa, ADR-009) | Few-shot por voz; el motor v1 no la consulta. |
| `v_historico_seleccionados` | vista | — | Sheet / dashboard | `004` la cambió para exponer `contenido_o_link` como `script` (no `link_doc`). Filtra `calificado_en is not null`. |
| `v_selecciones_por_dia` | vista | — | tracking | "el lunes seleccionaron N para tal voz". |
| `v_senal_seleccion` | vista | — | **motor** (`Leer señal selección`) | Tasa de selección por `referente`/`idioma` → boost del heat. |
| `v_senal_tema` | vista | — | **motor** (`Leer señal tema`) | Tasa por `metadata->>'tema'` (`006`, ADR-012). El segundo eje del aprendizaje. |

**`outputs.metadata` (jsonb), convención para `guion_reel`** (lo escribe el archivado): `proyecto`,
`voz`, `referente`, `url_referente`, `idioma`, `views`, `likes`, `seguidores`, `engagement`,
`heat_score`, `tema`, `calificacion`, `link_doc` (vestigial, siempre `''`). Las vistas de
señal/histórico leen de acá.

---

## 6. El Sheet "Histórico" (sumidero exportable)

Lo escribe **solo el archivado** (`Append al Sheet Histórico`, `autoMapInputData`). Columnas (las keys
de `Preparar filas Sheet` deben matchear **exacto** los encabezados, mayúsculas incluidas):

`FECHA CALIFICACION` · `PROYECTO` · `VOZ` · `TITULO` · `URL ORIGINAL` · `SCRIPT` · `IDIOMA` · `VIEWS` ·
`LIKES` · `SEGUIDORES` · `HEAT SCORE` · `CALIFICACION` · `ESTADO` (13 columnas).

---

## 7. Trazabilidad de campos clave (lineage)

De dónde sale y a dónde llega cada campo que importa:

- **`external_id`** — dos contextos, una sola semántica en `outputs` desde ADR-014:
  - En `processed_items`: es el **id del video** en la plataforma (shortcode IG / id TikTok). Lo setea
    `Normalizar IG/TT`; es el set de dedup del motor.
  - En `outputs` (las escribe **solo el archivado**): es el **id del record de Airtable** (`rec…`), que
    `Armar filas archivado` pone como `external_id` → clave de idempotencia (`on_conflict`).
  - ✅ **Desde ADR-014 el motor ya no escribe `outputs`** → no hay filas `draft` huérfanas; `outputs` es
    el histórico canónico (solo piezas calificadas, `calificado_en` seteada). Las vistas de
    histórico/señal filtran `calificado_en is not null`.
- **`tema`** — el keyword/hashtag que matcheó. Lo setea `Asignar proyecto+voz` (`_tema`) → `Armar
  candidato` (`tema`) → `Candidatos.tema` (Airtable). De ahí el **archivado** lo copia a
  `outputs.metadata.tema` → alimenta `v_senal_tema` (el único writer de `outputs`).
- **`idioma`** — hay **dos**: `idioma_guess` (de `guessLang` sobre el caption, en `Heat-score`, para el
  boost) y `idioma_detectado`/`idioma` (de Supadata en `Transcribir`, el de entrega). El que llega a
  Airtable/Supabase es el de entrega.
- **`heat_score`** — métrico en `Heat-score v1` → **sobrescrito por el composite** en `Gate de
  relevancia`. El prescore métrico queda preservado en `prescore_metrico`.
- **`relevancia_score` / `relevancia_razon`** — los produce el `Gate`; el `score` es el juicio Haiku
  limpio (0–1), separado del `heat_score` compuesto. Viajan a `Candidatos`.
- **`calificacion` / `estado`** — `estado` lo pone el motor (`nuevo`) y lo cambia el equipo;
  `calificacion` es 100% del equipo. El archivado los lee para decidir `outputs.estado` y filas del
  Sheet, luego borra el record.

---

## 8. Placeholders y credenciales (al importar en n8n)

- **API keys** (en los Code nodes, como strings): `<ANTHROPIC_API_KEY>` (×3: Pre-trim, Traducir,
  Gate), `<SUPADATA_API_KEY>` (×1: Transcribir).
- **IDs** (en el nodo `Config`, como `<<…>>`): `<<AIRTABLE_BASE_ID>>`, `<<SUPABASE_URL>>`,
  `<<INSTANCE_ID>>`; el archivado suma `<<GOOGLE_SHEET_ID>>`, `<<NOMBRE_PESTANA_SHEET>>`.
- **Credenciales nativas de n8n:** `airtableTokenApi` ("Airtable PAT"), `supabaseApi` ("Supabase
  Registro"), `apifyApi` (los 4 nodos Apify del motor), Google Sheets **OAuth2** (solo el archivado).
- Nada de esto se commitea. Listar placeholders: ver el snippet en el CLAUDE.md del motor.
