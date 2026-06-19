# Dev-doc — motor + archivado: nodos, orden y mapa de datos

> Referencia técnica para un dev que va a tocar los workflows. Responde tres cosas: **qué hace cada
> nodo y en qué orden corre**, **qué tabla de Airtable lee/escribe cada uno**, y **cómo viaja cada
> campo** por Supabase y el Sheet. No re-explica el porqué (eso son los ADRs ni el qué-de-producto
> (ROADMAP/PLAN); acá está el cómo, mapeado al `workflow.json` real.
>
> **Fuente de verdad:** los dos `workflow.json`. Si esta doc y el JSON difieren, gana el JSON —
> avisá y corregí esta doc. Generada leyendo el código nodo a nodo (no de memoria), 2026-06-17.
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
| **Motor** (`short-form-content`) | Cron + Execute manual | **Semanal**, lunes 8am | 34 | Descubre reels (IG+TikTok, Apify) → prescore métrico → transcribe/traduce → gate de relevancia (Haiku) → escribe **Candidatos** en Airtable + registra la corrida en Supabase |
| **Archivado** (`archivado`) | Cron + Execute manual | **Diario**, 9am (`0 9 * * *`) | 16 | Toma los Candidatos **calificados** en Airtable → los archiva en Supabase (`outputs`) + append al **Sheet Histórico** → los borra de Airtable (para no pasar el límite free) |

Ambos comparten el patrón `Config → Abrir run → … → Cerrar run`: la corrida se registra en la tabla
`runs` de Supabase (abre `en_curso`, cierra `ok` con métricas). Todos los nodos de Supabase son
**continue-on-fail** (invariante: si el registro falla, el trabajo útil igual se entrega).

---

## 2. Motor (`short-form-content`) — 34 nodos

### 2.1 Orden de ejecución (topología real)

```
Cron semanal ┐
             ├─► Config ─► Abrir run en el registro ─► Leer Proyectos ─► Leer Voces
Ejecutar     ┘                                                                     │
manual                                                                             ▼
                                            Leer Referentes ◄─ Leer Keywords ◄─────┘
                                                  │
                                                  ▼
                                            Leer Ajustes ─► Armar plan de corrida
                                                                    │  (fan-out a 4 Apify en paralelo)
       ┌──────────────────────┬──────────────────────┬────────────┴──────────┐
       ▼                      ▼                      ▼                        ▼
 Apify IG Reels        Apify IG Hashtag        Apify TikTok          Apify TikTok Perfil
       └──────┬───────────────┘                      └──────────┬─────────────┘
              ▼                                                  ▼
        Normalizar IG ──────► Merge scrapes ◄────────────  Normalizar TT
                                    │
                                    ▼
                          Asignar proyecto+voz ─► Pre-trim relevancia
                                                          │
                                                          ▼
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
                               Preparar batch Airtable              Preparar outputs Supabase
                                          ▼                                      ▼
                              POST Airtable Candidatos          Reportar outputs al registro ─► Cerrar run
```

Notas de orden que muerden si las ignorás:
- **`Abrir run` va EN SERIE** entre `Config` y `Leer Proyectos`, no colgado en paralelo. `Preparar
  outputs Supabase` y `Cerrar run` lo referencian por nombre (`$('Abrir run…')`); n8n corre las ramas
  en orden de conexión, así que si `Abrir run` cuelga en paralelo, corre **después** del pipeline y la
  referencia rompe (`hasn't been executed`). (Bug ya pisado, cierre 3.)
- **Las 5 lecturas de Airtable son una cadena serial** (Proyectos→Voces→Keywords→Referentes→Ajustes→
  Armar plan), no un fan-out. Una sola página por tabla (sin paginación → ver deuda #4 del handoff).
- **Las 3 lecturas de Supabase** (señal selección → señal tema → procesados) van enhebradas **después
  de Pre-trim**, no al inicio: así no bloquean el fan-out de Apify.
- **`Heat-score v1` tiene dos salidas:** una al pipeline de enriquecimiento (Transcribir→…→candidato)
  y otra a `Preparar procesados`. Esta segunda registra en `processed_items` **todo el top_n que se
  transcribió**, no solo los candidatos que sobreviven al gate → el dedup no re-procesa lo ya visto
  aunque el gate lo haya descartado.
- **`Armar candidato` también tiene dos salidas:** Airtable (los candidatos al equipo) y Supabase
  (registro de `outputs` como `draft`).

### 2.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace · lee → emite |
|---|---|---|---|
| 1 | Cron — semanal (lunes 8am) | scheduleTrigger | Dispara la corrida los lunes 8am (`weeks`, día 1, hora 8). |
| 2 | Ejecutar manual | manualTrigger | Execute Workflow a mano (las V-runs). |
| 3 | Config | set | Define los **IDs** (`airtable_base_id`, `supabase_url`, `instance_id` — placeholders `<<…>>`) y los **defaults de scoring** (`ig_results_limit` 8, `tt_results_limit` 30, `peso_views` .4, `peso_likes` .4, `peso_eng` .2, `peso_relevancia` .7, `boost_idioma` .3, `umbral_viral` 700000, `top_n_fallback` 25). Los Ajustes de Airtable caen **encima** de estos. |
| 4 | Abrir run en el registro | http POST | `POST runs` (`instance_id`, `trigger_type:'cron'`, `estado:'en_curso'`, `params:{}`), `Prefer: return=representation` → devuelve `id`. continue-on-fail. |
| 5 | Leer Proyectos | http GET | Airtable `Proyectos` con `filterByFormula={activo}`. |
| 6 | Leer Voces | http GET | Airtable `Voces` (todas — el id→nombre y `criterios_relevancia`). |
| 7 | Leer Keywords | http GET | Airtable `Keywords` con `{activo}`. |
| 8 | Leer Referentes | http GET | Airtable `Referentes` con `{activo}`. |
| 9 | Leer Ajustes | http GET | Airtable `Ajustes` (todas). continue-on-fail → fail-open: sin tabla, usa los defaults de Config. |
| 10 | Armar plan de corrida | code | El cerebro de la config. Construye `projects{}` (con `criterios`, `voz_criterios`, `top_n`, `dias_recencia`, `min_views/likes`, toggles de eje), las listas de descubrimiento (`ig_urls` de referentes, `tt_profiles`, `ig_hashtags`, `tt_hashtags` de keywords colapsadas a un hashtag), los mapas `*_owner_to_proj`/`kw_to_proj`, `max_dias_recencia`, y `ajustes` (traduce la `clave` española → key interna vía **`AJUSTE_MAP`**). Lee los nodos 5–9. |
| 11 | Apify — IG Reels | apify | Actor `apify~instagram-scraper`, `directUrls=ig_urls` (referentes IG), `searchType:'user'`, `resultsLimit`, `onlyPostsNewerThan` si hay ventana. |
| 12 | Apify — IG Hashtag | apify | Mismo actor, `directUrls` = `instagram.com/explore/tags/<h>/` por cada `ig_hashtag` → **descubre cuentas nuevas**. |
| 13 | Apify — TikTok | apify | Actor `clockworks~free-tiktok-scraper`, `hashtags=tt_hashtags`, `resultsPerPage`. |
| 14 | Apify — TikTok Perfil | apify | Mismo actor, `profiles=tt_profiles` (referentes TikTok). *Hoy `tt_profiles` sale vacío hasta sembrar Referentes TikTok.* |
| 15 | Normalizar IG | code | Mapea cada post IG (de **11 y 12**) al `content_item` común: `plataforma`, `external_id`, `username`, `seguidores`, `descripcion` (caption), `likes`, `comentarios`, `reproducciones`, `url`, `video_url`, `thumbnail_url` (`displayUrl`), `hashtags`, `engagement_rate`, `fecha_publicacion`. |
| 16 | Normalizar TT | code | Idem para TikTok (de **13 y 14**): `authorMeta`, `diggCount`→likes, `playCount`→reproducciones, `videoMeta.coverUrl`→thumbnail. Mismas keys que IG. |
| 17 | Merge scrapes | merge (append) | Une IG + TikTok en un solo lote, sin índice (append puro). |
| 18 | Asignar proyecto+voz | code | A cada item le asigna `proyecto_id`/`voz_id`/`_tema`: **1)** por referente (cuenta sembrada, IG por cuenta / TT por perfil), **2)** por keyword (hashtag del caption → ambas plataformas, setea `_tema`), **3)** fallback al único proyecto activo. Descarta sin `url`, sin proyecto, y lo más viejo que `dias_recencia` (guardia de recencia capa 2). Emite `_top_n`, `_dias`, `_keywords`, `_tema`. |
| 19 | Pre-trim relevancia | code + Haiku | Colador **laxo** (recall) sobre el caption, por proyecto, contra `criterios` (Proyecto⊕Voz). Descarta solo lo **obviamente** off-topic. Sin criterios no descarta nada. **Fail-open** (si Haiku falla, pasa todo). `claude-haiku-4-5`. |
| 20 | Leer señal selección | http GET | Supabase `v_senal_seleccion` (`referente`, `idioma`, `tasa_seleccion`). continue-on-fail. |
| 21 | Leer señal tema | http GET | Supabase `v_senal_tema` (`tema`, `tasa_seleccion`). continue-on-fail. |
| 22 | Leer procesados | http GET | Supabase `processed_items` (`external_id`, `platform`, `limit=20000`) → el set de dedup. continue-on-fail. |
| 23 | Heat-score v1 | code | **Prescore métrico** = `peso_views·pct(views) + peso_likes·pct(likes) + peso_eng·pct(eng)` por proyecto; × `(1+boost_idioma)` si `guessLang(caption+bio)≠es`; × `(1+sel)` con `sel = max(señal_referente, señal_tema)` (bi-eje O7). **Piso duro** `min_views`/`min_likes` y **dedup** (`!seen`) antes del `top_n` por proyecto. Emite `heat_score`, `idioma_guess`, `viral_por_tamano`. Lee 19, 20, 21, 22 + Config⊕ajustes. |
| 24 | Transcribir (Supadata) | code | Transcribe cada item del top_n (Supadata, `&text=true&mode=auto`), throttle 1.5s, trunca 6000 chars. `idioma_detectado` = `lang` de Supadata (primario) → fallback `guessLang(transcript)` → `idioma_guess`. **Fail-open** (sin transcript, sigue). `<SUPADATA_API_KEY>`. |
| 25 | Traducir (Claude Haiku) | code | Traduce **literal** al español **solo si** `idioma_detectado≠es` (sin reescribir/resumir/embellecer). **Fail-open**: si falla, `script = transcript`. Emite `script`, `idioma`. `claude-haiku-4-5`. |
| 26 | Gate de relevancia | code + Haiku | **Jurado estricto** (precision) contra `criterios`, sobre el `script` (o el caption como **fallback** si no hubo transcript). Dropea `relevante:false` y `score < min_relevancia`. Recalcula `heat_score` **composite** = `peso_relevancia·sHaiku + (1-peso)·percentil(prescore_metrico)`. Marca `[SIN TRANSCRIPT: …]` en `relevancia_razon`. Emite `prescore_metrico`, `relevancia_score`, `relevancia_razon`, `heat_score`. **Fail-open**. |
| 27 | Armar candidato | code | Reconstruye el objeto candidato final (lista explícita de campos — ver §7). Toma `titulo` del caption (80 chars), `script`, `idioma`, proyecto/voz, `referente`(=username), `url_referente`(=url), métricas, `heat_score`, `viral_por_tamano`, `external_id`, `relevancia_*`, `thumbnail_url`, `tema`(=`_tema`). |
| 28 | Preparar batch Airtable | code | Arma `records[]` de Airtable (`fields` + links `proyecto`/`voz` + `thumbnail` attachment), en **batches de 10**, `typecast:true`, `estado:'nuevo'`. |
| 29 | POST Airtable Candidatos | http POST | `POST Candidatos`. **stop-on-fail** (si Airtable rechaza, la corrida falla — es la entrega real). |
| 30 | Preparar outputs Supabase | code | Arma `outputs[]` (`run_id`, `external_id`=**id del video**, `tipo:'guion_reel'`, `titulo`, `contenido_o_link`=script, `estado:'draft'`, `source_items`, `metadata`). Lee `Abrir run` para el `run_id`. |
| 31 | Reportar outputs al registro | http POST | `POST outputs?on_conflict=external_id`, `Prefer: resolution=ignore-duplicates,return=minimal` → **idempotente** (re-run o `external_id` duplicado entre proyectos por fan-out no revienta el batch). Mismo patrón que el nodo 11 del archivado. continue-on-fail. |
| 32 | Cerrar run en el registro | http PATCH | `PATCH runs?id=eq.<id>` con `fin`, `estado:'ok'`, `metricas:{colectados, filtrados, outputs}`. continue-on-fail. |
| 33 | Preparar procesados | code | Arma el batch `processed_items` (`instance_id`, `platform`, `external_id`, `url`, `seguidores`, `flag_viral`, `idioma`) de **todo lo que salió de Heat-score** (el top_n transcrito). |
| 34 | POST processed_items | http POST | `POST processed_items`, `Prefer: resolution=ignore-duplicates`. continue-on-fail. |

### 2.3 El scoring en una frase

`Heat-score v1` produce un **prescore métrico** (percentiles de views/likes/engagement, con boost por
idioma no-español y por señal de aprendizaje bi-eje), corta por piso duro + dedup, y deja el `top_n`
por proyecto. El `Gate de relevancia` lo **re-rankea** con el juicio semántico de Haiku:
`heat_score = peso_relevancia·score_Haiku + (1-peso_relevancia)·percentil(prescore)`. Todos los knobs
salen de **Config** y los pisa la tabla **Ajustes** de Airtable (ADR-011). El detalle del modelo y sus
límites: ADR-010 + handoff §Mejoras #13/#18.

---

## 3. Archivado (`archivado`) — 16 nodos

### 3.1 Orden de ejecución

```
Cron diario 9am ┐
                ├─► Config ─► Abrir run ─► Leer Proyectos ─► Leer Voces ─► Leer Candidatos calificados
Ejecutar manual ┘                                                                       │
                                                                                        ▼
                                                                            IF — hay calificados
                                                              (no) │                    │ (sí)
                                                                   ▼                    ▼
                                                             Cerrar run        Armar filas archivado
                                                                   ▲                    ▼
                                                                   │           Preparar outputs Supabase
                                                                   │                    ▼
                                                                   │           Registrar outputs (Supabase)
                                                                   │                    ▼
                                                                   │             Preparar filas Sheet
                                                                   │                    ▼
                                                                   │            Append al Sheet Histórico
                                                                   │                    ▼
                                                                   │            Preparar borrado Airtable
                                                                   │                    ▼
                                                                   └────────────  Borrar de Airtable
```

**Orden de los sumideros = intencional:** Supabase (`outputs`) → Sheet → **recién entonces** borra de
Airtable. El append al Sheet **no** es continue-on-fail: si el Sheet falla, corta **antes** de borrar
→ no se pierde la curación del equipo. `Borrar de Airtable` reintenta **3× cada 2s**.

### 3.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace |
|---|---|---|---|
| 1 | Cron — diario 9am | scheduleTrigger | `0 9 * * *`. |
| 2 | Ejecutar manual | manualTrigger | Execute a mano. |
| 3 | Config | set | `airtable_base_id`, `supabase_url`, `instance_id`, `sheet_id`, `sheet_tab` (placeholders `<<…>>`). |
| 4 | Abrir run en el registro | http POST | `POST runs` con `params:{workflow:'archivado'}`, `return=representation`. continue-on-fail. |
| 5 | Leer Proyectos | http GET | Airtable `Proyectos` (`pageSize 100`) → mapa `id→nombre`. |
| 6 | Leer Voces | http GET | Airtable `Voces` (`pageSize 100`) → mapa `id→nombre`. |
| 7 | Leer Candidatos calificados | http GET | Airtable `Candidatos` con `filterByFormula=NOT({calificacion}='')`, `pageSize 100`. **1 sola página** (sin offset → deuda #4: trunca a 100/corrida). |
| 8 | IF — hay calificados | if | `records.length > 0` → Armar filas; si no → Cerrar run directo. |
| 9 | Armar filas archivado | code | Por cada calificado arma `{record_id, output, sheet}`. Normaliza `estado` (aprobado/publicado/descartado, default descartado), resuelve proyecto/voz por nombre, `calificado_en = fecha_calificacion`. **`output.external_id = r.id`** (el id del record de Airtable, ver §7). `metadata` lleva `tema`, `calificacion`, `link_doc`. |
| 10 | Preparar outputs Supabase | code | Extrae `outputs[]` del nodo 9. |
| 11 | Registrar outputs (Supabase) | http POST | `POST outputs?on_conflict=external_id`, `Prefer: resolution=ignore-duplicates,return=minimal` → **idempotente** (re-correr no duplica). continue-on-fail. |
| 12 | Preparar filas Sheet | code | Extrae `sheet[]` del nodo 9. |
| 13 | Append al Sheet Histórico | googleSheets | `append`, `autoMapInputData` → las keys de la fila deben **coincidir exacto** con los encabezados del Sheet. Credencial **OAuth2** (única dependencia de Google del pipeline). **stop-on-fail** (a propósito). |
| 14 | Preparar borrado Airtable | code | Arma URLs `DELETE` en **batches de 10** (`records[]=…`). |
| 15 | Borrar de Airtable | http DELETE | Borra los calificados de `Candidatos`. **retry 3× / 2s.** |
| 16 | Cerrar run en el registro | http PATCH | `PATCH runs` con `fin`, `estado:'ok'`, `metricas:{archivados}`. continue-on-fail. |

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
| `runs` | tabla | **ambos workflows** (`Abrir run` POST, `Cerrar run` PATCH) | dashboard futuro | Una fila por corrida; `metricas` jsonb distinto por workflow (motor: colectados/filtrados/outputs; archivado: archivados). |
| `outputs` | tabla | **motor** (`Reportar outputs`, `draft`) **y archivado** (`Registrar outputs`, estado calificado + `calificado_en`) | las 4 vistas de abajo | Ver §7 — los dos writers usan `external_id` con **semántica distinta**. |
| `processed_items` | tabla | **motor** (`POST processed_items`, ignore-duplicates) | **motor** (`Leer procesados`) | El dedup. `unique(platform, external_id)`. |
| `v_corpus_aprobados` | vista | — | (en pausa, ADR-009) | Few-shot por voz; el motor v1 no la consulta. |
| `v_historico_seleccionados` | vista | — | Sheet / dashboard | `004` la cambió para exponer `contenido_o_link` como `script` (no `link_doc`). Filtra `calificado_en is not null`. |
| `v_selecciones_por_dia` | vista | — | tracking | "el lunes seleccionaron N para tal voz". |
| `v_senal_seleccion` | vista | — | **motor** (`Leer señal selección`) | Tasa de selección por `referente`/`idioma` → boost del heat. |
| `v_senal_tema` | vista | — | **motor** (`Leer señal tema`) | Tasa por `metadata->>'tema'` (`006`, ADR-012). El segundo eje del aprendizaje. |

**`outputs.metadata` (jsonb), convención para `guion_reel`:** `proyecto`, `voz`, `referente`,
`url_referente`, `idioma`, `views`, `likes`, `seguidores`, `engagement`, `heat_score`, `link_doc`
(vestigial, siempre `''`) — y, **solo cuando lo escribe el archivado**, también `tema` y
`calificacion`. Las vistas de señal/histórico leen de acá.

---

## 6. El Sheet "Histórico" (sumidero exportable)

Lo escribe **solo el archivado** (`Append al Sheet Histórico`, `autoMapInputData`). Columnas (las keys
de `Preparar filas Sheet` deben matchear **exacto** los encabezados, mayúsculas incluidas):

`FECHA CALIFICACION` · `PROYECTO` · `VOZ` · `TITULO` · `URL ORIGINAL` · `SCRIPT` · `IDIOMA` · `VIEWS` ·
`LIKES` · `SEGUIDORES` · `HEAT SCORE` · `CALIFICACION` · `ESTADO` (13 columnas).

---

## 7. Trazabilidad de campos clave (lineage)

De dónde sale y a dónde llega cada campo que importa:

- **`external_id`** — **¡dos semánticas!**
  - En `processed_items` y en las `outputs` del **motor**: es el **id del video** en la plataforma
    (shortcode IG / id TikTok). Lo setea `Normalizar IG/TT` y viaja hasta `Preparar outputs Supabase`.
  - En las `outputs` del **archivado**: es el **id del record de Airtable** (`rec…`), que `Armar filas
    archivado` pone como `external_id`. Sirve de clave de idempotencia del archivado (`on_conflict`).
  - ⚠ **Consecuencia:** por cada video seleccionado quedan en `outputs` **dos filas** — una `draft` del
    motor (`external_id`=video, `calificado_en` null) y una calificada del archivado (`external_id`=
    record, `calificado_en` seteada). No colisionan (namespaces distintos) y las vistas de
    histórico/señal filtran `calificado_en is not null` → solo ven las del archivado. Las `draft` del
    motor quedan como traza de "todo lo generado". *Verificar si esa acumulación de drafts es deseada.*
- **`tema`** — el keyword/hashtag que matcheó. Lo setea `Asignar proyecto+voz` (`_tema`) → `Armar
  candidato` (`tema`) → `Candidatos.tema` (Airtable). De ahí el **archivado** lo copia a
  `outputs.metadata.tema` → alimenta `v_senal_tema`. *El motor NO mete `tema` en sus `outputs` draft;
  el aprendizaje por tema se nutre solo de las filas del archivado (correcto: filtran por calificado).*
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
