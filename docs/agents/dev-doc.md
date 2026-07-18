# Dev-doc — motor + descubrimiento + archivado: nodos, orden y mapa de datos

> Referencia técnica para un dev que va a tocar los workflows. Responde tres cosas: **qué hace cada
> nodo y en qué orden corre**, **qué tabla de Airtable lee/escribe cada uno**, y **cómo viaja cada
> campo** por Supabase y el Sheet. No re-explica el porqué (eso son los ADRs ni el qué-de-producto
> (ROADMAP/PLAN); acá está el cómo, mapeado al `workflow.json` real.
>
> **Fuente de verdad:** los tres `workflow.json`. Si esta doc y el JSON difieren, gana el JSON —
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
> ⚠️ **Enmienda 2026-07-09 (ADR-019) — remoción total del eje keyword; motor 36 → 30 nodos.** El motor
> descubre **solo por referentes**. Salen 6 nodos: `Leer Keywords`, `Apify — TikTok` (hashtags),
> `Apify — IG Hashtag`, `Merge IG`, `Merge TT` (cada Apify va directo a su Normalizador) y `Leer señal
> tema`. Salen también: `buscar_keyword_tiktok`/`resultados_keyword`/`cap_resultados_keyword` (Config +
> Ajustes), el reclamo por keyword y `_tema` en `Asignar`, la rama por eje del pre-trim (vuelve a
> mono-eje: caption pobre → exento), el `max(selRef, selTema)` del Heat-score (señal solo por
> referente) y el campo `tema` de la salida. `v_senal_tema` queda **inerte** en Supabase (sin lectores;
> el archivado sigue copiando `tema: ''` fail-safe). Las filas/tabla keyword de Airtable se borran a
> mano (checklist ADR-019). Las menciones keyword en las filas de abajo quedan como histórico; el JSON
> manda.
>
> ⚠️ **Enmienda 2026-07-16 (ADR-024) — la N vuelve a ser por proyecto; el corte final deja de ser
> global.** Enmienda los puntos 1 y 2 de ADR-016 (arriba). `Armar plan de corrida` lee **`Proyectos.N`**
> por proyecto y el global `Candidatos por corrida` (`top_n`) pasa a ser el **default** (`N` vacía/0 →
> global). `Armar candidato` corta **por proyecto**, cada uno a su N. **El orden interno cambió y
> importa:** ahora **dedup primero** (una copia por video, ADR-018) y **corte después**; al revés, dos
> proyectos que pescan el mismo video colisionaban y los dos quedaban cortos (N era un techo, no una
> entrega). `cap_top_n` **no se toca**: sigue siendo el techo duro de transcripción y ya mordió antes,
> en `Heat-score v1`. **El motor tolera que `Proyectos.N` no exista** (cae al global) → se puede
> re-importar antes de crear el campo. Misma semántica en cron y on-demand. *(C.1 del refactor.)*
>
> ⚠️ **Enmienda 2026-07-17 (spillover, enmienda de ADR-024) — el corte gana un paso 3.** La V-run
> destapó que con referentes compartidos el dedup concentra el pool en el proyecto de mayor relevancia
> y, si llenó su N, los sobrantes se tiraban aunque otro proyecto hambriento también los hubiera
> gateado. Ahora `Armar candidato` hace **dedup → corte → spillover**: los sobrantes se entregan al
> proyecto con cupo que también los gateó, usando **la copia de ese proyecto** (su
> `relevancia_score`/`razon`). **Garantía dura: un video sale en UN solo proyecto, siempre**; N sigue
> siendo techo exacto y la entrega es best-effort sobre el supply real. Probado en `test-nodos.mjs`.
>
> ⚠️ **Enmienda 2026-07-16 (C.2) — el motor respeta `Voces.activo`.** `Leer Voces` del **motor** (solo
> el motor) pasa a filtrar **server-side** con `filterByFormula={activo}`, igual que `Leer Proyectos`.
> **Por qué server-side y no en el code node:** Airtable **omite los checkbox destildados** del payload,
> así que ahí `activo` ausente es indistinguible de *el campo no existe* → no hay forma de decidir
> fail-open sin ambigüedad. `Armar plan de corrida` saltea todo proyecto cuyo `voz_default[0]` no esté
> entre las voces que llegaron (= voz apagada), y lo **loguea**. Un proyecto **sin** voz no está gateado.
> El gate corta **antes del scrape**: los referentes de un proyecto salteado no se pagan en Apify.
> **El archivado y el descubrimiento NO lo respetan** — el archivado necesita todas las voces para
> resolver nombres al archivar (correcto); el descubrimiento es una **decisión abierta** (hoy propondría
> referentes para proyectos de una voz apagada; ver plan §Descubrimiento). *(E.1 creó el campo.)*
>
> ⚠️ **Enmienda 2026-07-16 (C.5) — podados 2 knobs muertos del `Config` del motor:**
> `banda_descarte_min` (0.35) y `banda_descarte_max` (0.6). Nadie los leía desde la enmienda
> 2026-07-13 que reemplazó la banda fija por el top-K (`cap_descartes`). Config: 21 → **19 knobs**.
> Cero cambio de conducta.
>
> ⚠️ **Nuevo 2026-07-10 (ADR-020) — workflow de descubrimiento de referentes (27 nodos).** Tercer
> workflow del sistema; propone cuentas nuevas cada semana y promueve las aprobadas. **Enmienda
> 2026-07-13 (ADR-020 §8): eje TikTok** (actor dataovercoffee lookalike, rama paralela, 24→27 nodos +
> 2 toggles `Descubrir en IG/TikTok`). Documentado nodo por nodo en §3.
>
> ⚠️ **Fase M1 2026-07-10 (ADR-021) — medición: motor 30 → 33 nodos, archivado 18 → 24 nodos.**
> El motor expone los **top-K rechazos del gate por score** a la tabla `Descartes del gate`
> (nodos 23b/23c) y arma `runs.metricas` completas en un nodo propio (`Resumen del run`, 26b:
> embudo + `sin_guion` + llamadas estimadas + desglose `por_referente`). El archivado copia
> `relevancia_score`/`relevancia_razon` al histórico, computa las filas semanales de
> **`Métricas Proyectos`** (calidad) y **`Métricas Global`** (salud + costos) — split 2026-07-15,
> routea por `_tabla` — y limpia los descartes auditados (nodos
> 17b–17f). Cockpit 6 → 9 tablas; páginas *Métricas — Calidad*, *Métricas — Salud*, *Costos* y
> *Descartes (auditar)*.
>
> ⚠️ **Fase M2 2026-07-14 (ADR-022) — loop de aprendizaje de criterios: archivado 30 → 37 nodos.**
> Dos ramas laterales nuevas colgadas de `Cerrar run` (§4.2): **`Destilar criterios` → `PATCH Proyectos
> criterios`** escribe `Proyectos.criterios_aprendidos` con lo aprendido de la curación, y el motor lo
> lee (`Armar plan de corrida` + `Gate de relevancia`) → el loop cierra; **`Leer señal selección
> (archivado)` → `Leer Referentes (archivado)` → `Computar salud referentes` → `PATCH Referentes salud`**
> escribe la salud por referente. Suma **`Leer runs descubrimiento`** (costos, cierre 37) entre `Leer runs
> de la semana` y `Leer Descartes del gate`. El **motor no gana nodos** (sigue en 33): ADR-022 le cambia
> qué lee, no su topología.
>
> ⚠️ **Verificado contra el JSON vivo 2026-07-16 (A.1 del refactor).** Los tres grafos: 0 conexiones
> rotas · 0 refs `$('…')` colgadas · 0 nodos inalcanzables · 0 huérfanos · 0 deshabilitados. Conteos
> reales: **motor 33 · descubrimiento 27 · archivado 37**. Motor y descubrimiento calzan nodo por nodo
> con §2.2/§3.2; §4 se actualizó en esta pasada (documentaba 30, y §1/§4.2 se contradecían).
>
> Pies de página: el motor en
> [`workflows/workflow-short-form-content/`](../../workflows/workflow-short-form-content/), el
> descubrimiento en
> [`workflows/workflow-descubrimiento-referentes/`](../../Workflows/workflow-descubrimiento-referentes/), el
> archivado en [`workflows/workflow-archivado/`](../../workflows/workflow-archivado/). El cockpit
> Airtable en [`core/contracts/airtable-cockpit.md`](../../core/contracts/airtable-cockpit.md); los
> schemas Supabase en [`core/schema/`](../../core/schema/) (`001`–`006`).

---

## 1. Los workflows de un vistazo

| Workflow | Trigger | Cadencia | Nodos | Qué hace |
|---|---|---|---|---|
| **Motor** (`short-form-content`) | Cron + Execute manual + **webhook on-demand (ADR-023)** | **Semanal**, lunes 8am + a demanda (botón Airtable) | 37 | Descubre reels (IG+TikTok, Apify, solo por referentes — ADR-019) → prescore métrico → transcribe/traduce → gate de relevancia (Haiku) → escribe **Candidatos** + los descartes borderline (**Descartes del gate**, ADR-021) en Airtable + registra la corrida en Supabase. §2. |
| **Descubrimiento** (`descubrimiento-referentes`, ADR-020) | Cron + Execute manual | **Semanal**, lunes 9am (1h después del motor) | 27 | Promueve a `Referentes` los propuestos que el equipo marcó `aprobado` → busca cuentas nuevas parecidas a las que funcionan (IG: sugeridos, 2 pasadas Apify; TikTok: lookalike, rama paralela — ADR-020 §8) → dedup → vetting Haiku **FAIL-CLOSED** → escribe **Referentes propuestos**. §3. |
| **Archivado** (`archivado`) | Cron + Execute manual | **Semanal**, domingo 6pm (`0 18 * * 0`) | 37 | Toma los Candidatos **calificados** en Airtable → los archiva en Supabase (`outputs`, con relevancia — ADR-021) + append al **Sheet Histórico** → los borra de Airtable → **computa las filas semanales de `Métricas Proyectos` + `Métricas Global`** (calidad / salud+costos, routea por `_tabla`), limpia `Descartes del gate`, y **destila criterios aprendidos + salud por referente** (ADR-022). §4. |

Los tres comparten el patrón de registro `runs` en Supabase (abre `en_curso` con `params.workflow`
propio, cierra `ok` con métricas; el barredor marca `fallo` los zombies de su propio workflow).
Archivado y descubrimiento: `Config → Abrir run → Barrer runs zombie → …`. El **motor** (desde C.3,
ADR-023) reordena el arranque a `Config → Barrer runs zombie → Leer corridas vivas → Guard
single-flight → Abrir run → …`: el barrido pasa **antes** de abrir el run (así ya no excluye su
propio id) y solo barre `en_curso` más viejos que `ventana_corrida_min` (120); el guard bloquea la
corrida si hay otra **viva** (más joven que la ventana) — aplica a los 3 triggers, no solo al
webhook. Todos los nodos de Supabase son **continue-on-fail** (invariante: si el registro falla, el
trabajo útil igual se entrega; el guard con Supabase caído **deja pasar** — fail-open). Cadencia
semanal encadenada a propósito: **domingo 6pm** archiva la curación de la semana → **lunes 8am** el
motor trae la tanda nueva → **lunes 9am** el descubrimiento propone cuentas con la señal fresca del
archivado.

---

## 2. Motor (`short-form-content`) — 37 nodos

### 2.1 Orden de ejecución (topología real)

```
Cron semanal ─┐
Ejecutar      ├─► Config ─► Barrer runs zombie ─► Leer corridas vivas ─► Guard single-flight
manual        │              (solo en_curso                                  │           │
Disparo       │               > ventana)                              (libre)▼           ▼(hay corrida viva)
on-demand ────┘                                                         Abrir run    Bloqueada (NoOp, fin)
(webhook,                                                                    │
 ADR-023)                                                                    ▼
                                                    Leer Proyectos ─► Leer Voces
                                                                          │
                                            Armar plan ◄─ Leer Ajustes ◄─ Leer Referentes
                                                        │  (fan-out a 2 ramas Apify)
                             ┌──────────────────────────┴───────────────┐
                             ▼                                          ▼
                       Split IG referentes                     Apify TikTok Perfil
                             ▼                                          │
                       Apify IG Reels                                   │
                             ▼                                          ▼
                       Normalizar IG ──────► Merge scrapes ◄──── Normalizar TT
                                    │
                                    ▼
                          Asignar proyecto+voz ─► Pre-trim relevancia
                                                          │
                            Leer señal selección ─► Leer procesados ─► Heat-score v1
                                                                                              │
                                              ┌───────────────────────────────────────────────┤
                                              ▼                                               ▼
                                  Transcribir (Supadata)                            Preparar procesados
                                              ▼                                               ▼
                                  Traducir (Claude Haiku)                            POST processed_items
                                              ▼
                                    Gate de relevancia
                                          │         │
                                          ▼         └──────► Preparar batch Descartes ─► POST Airtable Descartes
                                   Armar candidato                    (top-K rechazos, ADR-021)
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                    ▼
             Preparar batch Airtable                  Resumen del run
                        ▼                                    ▼
             POST Airtable Candidatos              Cerrar run (executeOnce)
```

Notas de orden que muerden si las ignorás:
- **El guard single-flight (C.3, ADR-023) aplica a los 3 triggers**, no solo al webhook (decisión de
  Mani, 2026-07-16): así el cron del lunes no puede pisar una corrida on-demand viva (doble Apify).
  Vivo vs. zombie lo decide `ventana_corrida_min` (Config, 120): `en_curso` más joven = corrida viva
  (el guard bloquea → rama `Bloqueada`, la ejecución termina sin abrir run — un click bloqueado NO
  suma a `runs_fallo`); más viejo = zombie (el barredor lo marca `fallo` **antes** del guard, así un
  zombie jamás deja el motor trabado). Con Supabase caído el guard **deja pasar** (fail-open,
  invariante #1). Queda una ventana check-then-act de ~1-2s entre dos clicks casi simultáneos:
  aceptada a conciencia (peor caso: costo doble + candidatos duplicados en el feed esa vez;
  `processed_items` no se ensucia y la corrida siguiente ya no los repite).
- **`Abrir run` va EN SERIE** entre el guard y `Leer Proyectos`, no colgado en paralelo. `Cerrar run`
  lo referencia por nombre (`$('Abrir run…')`); n8n corre las ramas en orden de conexión, así que si
  `Abrir run` cuelga en paralelo, corre **después** del pipeline y la referencia rompe (`hasn't been
  executed`). (Bug ya pisado, cierre 3.) Desde C.3 registra el `trigger_type` real
  (`on_demand`/`manual`/`cron` vía `isExecuted` del trigger — antes todo se registraba `cron`).
- **Las 4 lecturas de Airtable son una cadena serial** (Proyectos→Voces→Referentes→Ajustes→
  Armar plan), no un fan-out. **Paginan** (cierre 15, #4): `options.pagination` sigue el `offset` de
  Airtable hasta agotar páginas → no se truncan a 100 records.
- **`Split IG referentes`** corre el Apify IG Reels **1× por referente** (por eso el límite de
  resultados es cap **por-referente**, no global). Cada Apify va **directo a su Normalizador**
  (ADR-019): los `Merge IG`/`Merge TT` salieron junto con las ramas hashtag — con una sola fuente por
  plataforma no unifican nada (el bug F1 era de 2 fuentes al mismo input). ⚠️ Ojo: con un toggle de
  plataforma en 0 (o 0 referentes de esa plataforma), esa rama entera puede no ejecutar — verificar que
  `Merge scrapes` no se quede esperando (test de borde del re-import ADR-019).
- **Las 2 lecturas de Supabase** (señal selección → procesados) van enhebradas **después
  de Pre-trim**, no al inicio: así no bloquean el fan-out de Apify. `Leer procesados` consulta solo los
  `external_id` de la corrida (`in.(…)`, dedup acotado #5) — ya no `limit=20000`.
- **`Heat-score v1` tiene dos salidas:** una al pipeline de enriquecimiento (Transcribir→…→candidato)
  y otra a `Preparar procesados`. Esta segunda registra en `processed_items` **todo el top_n que se
  transcribió**, no solo los candidatos que sobreviven al gate → el dedup no re-procesa lo ya visto
  aunque el gate lo haya descartado.
- **`Armar candidato` tiene dos salidas:** `Preparar batch Airtable` (los candidatos al equipo) y
  `Resumen del run` → `Cerrar run` (ADR-021: el resumen arma `runs.metricas` completas; Cerrar run
  solo persiste `$json.metricas`). El motor **ya no escribe filas por-item a `outputs`** (ADR-014);
  `Cerrar run` conserva `executeOnce: true`.
- **`Gate de relevancia` emite dos clases de items:** los que pasan (van a `Armar candidato`) y los
  descartes top-K marcados **`_descarte: true`** (ADR-021). `Armar candidato` filtra los
  `_descarte`; la rama `Preparar batch Descartes → POST Airtable Descartes` los sube a la tabla
  `Descartes del gate` (continue-on-fail: si Airtable rechaza, la corrida sigue — los descartes son
  nice-to-have, los Candidatos no).
- **`Transcribir (Supadata)` es un Code node SERIAL bajo el watchdog del task runner**
  (`N8N_RUNNERS_TASK_TIMEOUT`, 900s en el pod). Transcribe los videos distintos uno por uno (HTTP a
  Supadata + `SLEEP_MS`); si el loop pasa de 900s el runner mata el nodo (no es timeout de la API).
  Reventó el 2026-06-29 con **106 videos distintos** (top_n=100 × 2 proyectos activos, deduped).
  - **El cuello real es Supadata, no el tiempo.** Free tier = **100 créditos/mes**, **~1-2 créditos/video**,
    **1 request/segundo**. Una sola corrida a top_n=100×2proy ≈ 106-212 créditos → **excede el mes entero
    en una corrida**. La throughput meta (~100 scripts/sem) es **imposible en free tier**: o se sube de
    plan en Supadata, o se baja top_n drásticamente (decisión de costo, va con el jefe).
  - **El límite 1 req/s descarta la concurrencia** (un Promise pool violaría el rate limit) → el loop
    DEBE ser serial mientras se esté en este tier. `SLEEP_MS=1000` es el piso correcto (≤1 req/s aun si
    una respuesta vuelve instantánea). El pool de concurrencia solo se vuelve viable **si se sube de plan**
    en Supadata (más req/s); ahí sí colapsaría el HTTP serial — pero es decisión post-upgrade.
  - **Mitigación de tiempo (no de costo):** desde el cierre 31 el nodo tiene **presupuesto propio**
    (`presupuesto_transcribir_s` 780, Config dev-only): si el loop lo excede, corta y el resto pasa
    SIN transcript (fail-open, marcado SIN GUION) — entrega degradada en vez de run muerto. Subir
    `N8N_RUNNERS_TASK_TIMEOUT` (InstaPods = VPS con SSH, va en el `.env`/compose de n8n) sigue
    valiendo para ampliar el headroom real; el presupuesto debe quedar por debajo del watchdog.

### 2.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace · lee → emite |
|---|---|---|---|
| 1 | Cron — semanal (lunes 8am) | scheduleTrigger | Dispara la corrida los lunes 8am (`weeks`, día 1, hora 8). |
| 2 | Ejecutar manual | manualTrigger | Execute Workflow a mano (las V-runs). |
| 2b | Disparo on-demand (webhook) | webhook | **ADR-023 (C.3):** POST de Producción, path = `<<WEBHOOK_PATH_MOTOR>>` (se reemplaza al importar; la URL va a la automation de Airtable y al gestor, jamás a git). **Señal desnuda:** sin payload; el motor lee Airtable (toggles + N). Responde 200 inmediato (`onReceived`) — el veredicto del guard se ve en la ejecución de n8n y en `runs`, no en la respuesta. |
| 3 | Config | set | Define los **IDs** (`airtable_base_id`, `supabase_url`, `instance_id` — placeholders `<<…>>`), los **defaults de knobs** que el equipo puede pisar desde Ajustes (`resultados_referente` 20, `top_n` 100, `dias_recencia` 7, toggles `buscar_referente_ig`/`buscar_referente_tiktok` 1) , los **caps dev-only** que NADIE pisa desde Ajustes (`cap_resultados_referente` 50, `cap_top_n` **100** — subido de 30 el 2026-07-13 ahora que Apify/Supadata son pagos; es el techo de videos transcritos/corrida, `piso_referente` 5, `cap_descartes` 10 — ADR-021 (top-K por score, enmienda 2026-07-13), `presupuesto_transcribir_s` 780 — cierre 31; con el pool de 8 del cierre 55 cubre ~200 videos, sin tocar el watchdog del pod; `ventana_corrida_min` 120 — C.3/ADR-023, frontera vivo/zombie del single-flight; **`banda_descarte_min`/`max` podados 2026-07-16, C.5**) y los **defaults de scoring** (`peso_views` .4, `peso_likes` .4, `peso_eng` .2, `peso_relevancia` .7, `boost_idioma` .3, `umbral_viral` 700000). Los Ajustes de Airtable caen **encima** de los defaults, nunca de los caps. |
| 4 | Barrer runs zombie | http PATCH | **Auto-sanador del motor (ADR-017; reordenado en C.3), entre `Config` y el guard.** `PATCH runs` → marca `fallo` los runs de motor `en_curso` **más viejos que `ventana_corrida_min`** (scoped `params->>workflow=eq.motor`; corre antes de `Abrir run`, así ya no necesita excluir su propio id). Barrer ANTES del guard es lo que garantiza que un zombie nunca bloquee el single-flight. continue-on-fail. |
| 4b | Leer corridas vivas | http GET | **Guard single-flight, mitad lectura (C.3, ADR-023).** `GET runs` con `estado=en_curso` + `inicio>=now−ventana_corrida_min`, `limit=1` → si devuelve fila, hay corrida viva. `alwaysOutputData` + continue-on-fail (Supabase caído = item sin `id` = pasa, fail-open). |
| 4c | Guard single-flight | if | Evalúa `Boolean($json.id)`: **false** (no hay corrida viva) → `Abrir run` y la corrida sigue; **true** → `Bloqueada: ya hay corrida viva` (NoOp) y la ejecución muere ahí — **sin abrir run**, así un click bloqueado no ensucia `runs_fallo` ni las métricas de salud. Aplica a los 3 triggers (decisión Mani 2026-07-16). |
| 4d | Abrir run en el registro | http POST | `POST runs` (`instance_id`, **`trigger_type` real: `on_demand`/`manual`/`cron`** vía `isExecuted` del trigger — C.3; antes siempre `'cron'`), `estado:'en_curso'`, `params:{workflow:'motor'}`, `Prefer: return=representation` → devuelve `id`. continue-on-fail. El tag `workflow:'motor'` es lo que scopea el barredor (4) y el guard (4b). |
| 5 | Leer Proyectos | http GET | Airtable `Proyectos` con `filterByFormula={activo}`. **Pagina** (`options.pagination` sigue el `offset` → todas las páginas, #4). |
| 6 | Leer Voces | http GET | Airtable `Voces` con `filterByFormula={activo}` (**C.2, 2026-07-16** — antes traía todas). Da el id→nombre y `criterios_relevancia`; lo que **no** llega está apagado y sus proyectos se saltean en `Armar plan`. Pagina (#4). |
| 7 | Leer Referentes | http GET | Airtable `Referentes` con `{activo}`. Pagina (#4). |
| 8 | Leer Ajustes | http GET | Airtable `Ajustes` (todas). Pagina (#4). continue-on-fail → fail-open: sin tabla, usa los defaults de Config. |
| 9 | Armar plan de corrida | code | El cerebro de la config. Construye `projects{}` (con `criterios`, `voz_criterios`, **`n`** = `Proyectos.N` con fallback al global `top_n` — ADR-024), **saltea los proyectos con la voz apagada** (C.2; loguea cuál) y **avisa si un proyecto tiene >1 voz linkeada** (usa la primera). Arma las listas de descubrimiento (`ig_urls` de referentes, `tt_profiles`), los mapas `*_owner_to_proj`, los knobs globales (`top_n`, `dias_recencia`, `resultados_referente` con su cap) y `ajustes` (traduce la `clave` española → key interna vía **`AJUSTE_MAP`**). Gatea cada plataforma por su toggle (`buscar_referente_ig`/`buscar_referente_tiktok`). Los consumidores de las lecturas 5–8 agregan todas las páginas (`flatMap` sobre `.records`). **Solo referentes** (ADR-019): no arma hashtags ni mapas de keyword. |
| 10 | Split IG referentes | code | Emite **1 item por referente IG** → hace que `Apify — IG Reels` corra una vez por cuenta. Por eso el límite de resultados es cap **por-referente**, no global. |
| 11 | Apify — IG Reels | apify | Actor `apify~instagram-scraper`, `directUrls` = la URL del referente del item (vía Split), `searchType:'user'`, `resultsLimit`, `onlyPostsNewerThan` si hay ventana. |
| 12 | Apify — TikTok Perfil | apify | Actor `clockworks~free-tiktok-scraper`, `profiles=tt_profiles` (referentes TikTok), `resultsPerPage=resultados_referente`. |
| 13 | Normalizar IG | code | Mapea cada post IG (de **Apify — IG Reels**, directo — ADR-019) al `content_item` común: `plataforma`, `external_id`, `username`, `seguidores`, `descripcion` (caption), `likes`, `comentarios`, `reproducciones`, `url`, `video_url`, `thumbnail_url` (`displayUrl`), `hashtags`, `engagement_rate`, `fecha_publicacion`. Descarta no-video (`type !== 'Video'`) y el stub de Apify (`{error:'no_items'}`). |
| 14 | Normalizar TT | code | Idem para TikTok (de **Apify — TikTok Perfil**, directo): `authorMeta`, `diggCount`→likes, `playCount`→reproducciones, `videoMeta.coverUrl`→thumbnail. Mismas keys que IG. Descarta el stub `{}` (0 referentes TikTok). |
| 15 | Merge scrapes | merge (append) | Une IG + TikTok en un solo lote, sin índice (append puro). |
| 16 | Asignar proyecto+voz | code | **Fan-out (ADR-013):** emite **1 item por cada proyecto activo que reclama** el video. Reclama **solo el referente** (ADR-019): IG por cuenta / TT por perfil, con fallback al único proyecto activo. Descarta sin `url`, sin proyecto, y lo más viejo que `dias_recencia` (recencia capa 2). Emite `proyecto_id`/`voz_id`. |
| 17 | Pre-trim relevancia | code + Haiku | Colador **laxo** (recall) sobre el caption, por proyecto, contra `criterios` (Proyecto⊕Voz). Descarte por **`(proyecto, external_id)`** (no global, para no matar la copia del otro proyecto del fan-out). Descarta solo lo **obviamente** off-topic; sin criterios no descarta nada. **Caption pobre** (<25 chars de texto real, sin hashtags/menciones/urls/emojis): pasa **sin juicio** — lo juzga el gate con el transcript (mono-eje desde ADR-019; la fuente siempre es curada). **Fail-open**. `claude-haiku-4-5`. Logea descartes: `[Pre-trim] descartados off-topic: n/total -> ids` (cierre 15) y `[Pre-trim] captions pobres pid=…: N exentos`. |
| 18 | Leer señal selección | http GET | Supabase `v_senal_seleccion` (`referente`, `idioma`, `tasa_seleccion`). continue-on-fail. |
| 19 | Leer procesados | http GET | Supabase `processed_items` filtrado a los `external_id` de **esta corrida** (`external_id=in.(…)`, dedup acotado #5) → el set de dedup. Ya no `limit=20000`. continue-on-fail. |
| 20 | Heat-score v1 | code | **Prescore métrico** = `peso_views·pct(views) + peso_likes·pct(likes) + peso_eng·pct(eng)` por proyecto; × `(1+boost_idioma)` si `guessLang(caption+bio)≠es`; × `(1+sel)` con `sel` = señal por referente (`v_senal_seleccion`; mono-eje desde ADR-019). **Piso duro** `min_views`/`min_likes` y **dedup** (`!seen`); `cap_top_n` recorta por videos distintos. Emite `heat_score`, `idioma_guess`, `viral_por_tamano`. Lee 17, 18, 19 + Config⊕ajustes. |
| 21 | Transcribir (Supadata) | code | Transcribe cada **video distinto** del top_n UNA vez (dedup por `external_id`, reparte a las copias del fan-out; Supadata `&text=true&mode=auto`) con un **pool de 8 llamadas concurrentes** (cierre 55 — plan pago Supadata 10 req/s; 84 videos ≈ 5 min, antes ~38 serial; un solo nodo con pool y NO 8 nodos+Merge: partir el fan-out rompería el dedup y pagaría doble), trunca 6000 chars. `idioma_detectado` = `lang` de Supadata (primario) → fallback `guessLang(transcript)` → `idioma_guess`. **Presupuesto de tiempo** (`presupuesto_transcribir_s` 780, cierre 31): pasado el límite no se arrancan videos nuevos y el resto pasa sin transcript — evita que el watchdog de 900s mate el nodo y el run. Con el pool, 780s cubren ~200 videos (la degradación del 07-17 — 28/84 con el loop serial — no vuelve). **Fail-open** (sin transcript, sigue). `<SUPADATA_API_KEY>`. |
| 22 | Traducir (Claude Haiku) | code | Traduce **literal** al español **solo si** `idioma_detectado≠es` (sin reescribir/resumir/embellecer). **Dedup intra-corrida** (cierre 31, espejo de Transcribir): 1 llamada por video distinto, el script se reparte a todas las copias del fan-out. **Fail-open**: si falla, `script = transcript`. Emite `script`, `idioma`. `claude-haiku-4-5`. |
| 23 | Gate de relevancia | code + Haiku | **Jurado estricto** (precision) contra `criterios`, sobre el `script` (o el caption como **fallback** si no hubo transcript). **Juzga en chunks de 25 videos por llamada** (cierre 31: el JSON de ~100 juicios excedía `max_tokens` → parse fallaba → el fail-open dejaba pasar todo sin score; un chunk caído solo apaga su tanda). Dropea `relevante:false` y `score < min_relevancia`. Recalcula `heat_score` **composite** = `peso_relevancia·sHaiku + (1-peso)·percentil(prescore_metrico)`. Marca `[SIN TRANSCRIPT: …]` en `relevancia_razon`. Emite `prescore_metrico`, `relevancia_score`, `relevancia_razon`, `heat_score`. **Además emite los descartes top-K** (ADR-021, enmienda 2026-07-13): de los rechazos con score numérico toma los `cap_descartes` con **mayor score** (near-miss, los más probables falsos negativos) → item marcado `_descarte: true`. *(Reemplaza la banda fija `[0.35,0.6]`, que nunca se poblaba porque Haiku rechaza bimodal.)* **Fail-open** (Haiku caído = pasan todos y 0 descartes). Logea: `[Gate] DESCARTE …` + `[Gate] descartes top-K expuestos: n/m`. |
| 23b | Preparar batch Descartes | code | Toma los `_descarte` del gate y arma `records[]` para la tabla **`Descartes del gate`** (`titulo` del caption, `script`, `referente`, `url_referente`, `relevancia_score/razon`, link `proyecto`, `thumbnail`), batches de 10, `typecast`. Sin borderline → `[]` (la rama muere sin ruido). |
| 23c | POST Airtable Descartes | http POST | `POST Descartes del gate` (URL-encoded). **continue-on-fail** (los descartes son auditoría, no entrega). |
| 24 | Armar candidato | code | **Filtra los `_descarte` del gate** (ADR-021: no son candidatos). Luego, **en este orden (ADR-024)**: **1) dedup — UNA copia por video (ADR-018):** del fan-out gana la de mayor `relevancia_score` (empate: heat), así cada video queda en **un solo** proyecto; items sin `external_id` se conservan. **2) corte final POR PROYECTO**, cada uno a **su N** (`projects[pid].n`, fallback al global `top_n`) **con piso por cuenta** (`piso_referente`, ADR-017): dentro del proyecto ordena por heat, hace round-robin hasta `piso` videos por cuenta fuente, y rellena por heat hasta N (fail-open con piso=0). **3) spillover (enmienda ADR-024, 2026-07-17):** los sobrantes (pasaron el gate de ≥2 proyectos, su ganador llenó su N) van al proyecto **con cupo** que también los gateó, con **la copia de ese proyecto** (su `relevancia_*`); garantía: un video sale en UN solo proyecto, N jamás se supera. *(El orden importa: cortar antes de dedupear hacía que 2 proyectos que pescan el mismo video quedaran los dos cortos.)* Loguea `[Corte] proyecto=… N=… disponibles=… entregados=…` por proyecto y `[Spillover] <id> → proyecto=… (k/N)` por sobrante repartido. Luego reconstruye el objeto candidato final (lista explícita — ver §8): `titulo` del caption (80 chars; **prefijo `⚠️ SIN GUION |` si `script` vacío**, decisión #6 cierre 27), `script`, `idioma`, proyecto/voz, `referente`(=username), `url_referente`(=url), métricas, `heat_score`, `viral_por_tamano`, `external_id`, `relevancia_*`, `thumbnail_url`. |
| 25 | Preparar batch Airtable | code | Arma `records[]` de Airtable (`fields` + links `proyecto`/`voz` + `thumbnail` attachment), en **batches de 10**, `typecast:true`, `estado:'nuevo'`. |
| 26 | POST Airtable Candidatos | http POST | `POST Candidatos`. **stop-on-fail** (si Airtable rechaza, la corrida falla — es la entrega real). |
| 26b | Resumen del run | code | **Arma `runs.metricas` completas (ADR-021):** embudo `{colectados, asignados, pretrim, filtrados, gate, outputs}` (`gate` cuenta solo los NO-`_descarte`), `sin_guion` (candidatos con script vacío), `descartes_expuestos`, `llamadas` **estimadas** por servicio (`supadata` = videos distintos transcritos; `haiku_lotes_pretrim` = proyectos con items, cota superior; `haiku_lotes_gate` = chunks de 25 por proyecto; `haiku_traducciones` = videos **distintos** no-ES — cierre 31) y `por_referente {evaluados, gate_pass}` en **videos distintos** (la mitad-motor de la higiene de fuentes, ADR-022). Entre `Armar candidato` y `Cerrar run`. |
| 27 | Cerrar run en el registro | http PATCH | `PATCH runs?id=eq.<id>` con `fin`, `estado:'ok'` y `metricas` = lo que armó el Resumen (26b). **`executeOnce: true`**. continue-on-fail. |
| 28 | Preparar procesados | code | Arma el batch `processed_items` (`instance_id`, `platform`, `external_id`, `url`, `seguidores`, `flag_viral`, `idioma`) de **todo lo que salió de Heat-score** (el top_n transcrito). |
| 29 | POST processed_items | http POST | `POST processed_items`, `Prefer: resolution=ignore-duplicates`. continue-on-fail. |

### 2.3 El scoring en una frase

`Heat-score v1` produce un **prescore métrico** (percentiles de views/likes/engagement, con boost por
idioma no-español y por la señal de selección por referente), corta por piso duro + dedup, y deja el `top_n`
por proyecto. El `Gate de relevancia` lo **re-rankea** con el juicio semántico de Haiku:
`heat_score = peso_relevancia·score_Haiku + (1-peso_relevancia)·percentil(prescore)`. Todos los knobs
salen de **Config** y los pisa la tabla **Ajustes** de Airtable (ADR-011). El detalle del modelo y sus
límites: ADR-010 + handoff §Mejoras #13/#18.

---

## 3. Descubrimiento de referentes (`descubrimiento-referentes`) — 27 nodos

> **Nuevo por [ADR-020](../adr/ADR-020-motor-descubrimiento-referentes.md) (2026-07-10).** Propone
> cuentas nuevas parecidas a los referentes que mejor convierten, y promueve a `Referentes` las que
> el equipo aprobó. **Instagram + TikTok** (ADR-020 §8, enmienda 2026-07-13): IG por `relatedProfiles`;
> TikTok por el actor `dataovercoffee~tiktok-lookalike-search` en una **rama paralela** que idlea gratis
> con 0 referentes TT. Cada eje se prende/apaga con un toggle del equipo (`descubrir_ig`/`descubrir_tt`).
> **NO toca el motor ni `Candidatos`**: nada entra al stream sin aprobación humana. El qué-de-producto
> está en su [README](../../Workflows/workflow-descubrimiento-referentes/README.md); el porqué en el ADR.

### 3.1 Orden de ejecución (cadena lineal, sin fan-out)

```
Cron semanal (lun 9am) ┐
                       ├─► Config ─► Abrir run ─► Barrer runs zombie
Ejecutar manual        ┘                                │
        Leer Proyectos ─► Leer Voces ─► Leer Referentes ─► Leer Propuestos
                                                                │
                                                        Preparar promoción
                                                                │
                                                        IF — hay aprobados
                              (sí) │                            │ (no)
                                   ▼                            │
                     POST Referentes (promoción)                │
                                   ▼                            │
                     PATCH Propuestos promovidos ──────────────►│
                                                                ▼
              Leer Ajustes ─► Leer señal selección ─► Armar plan de descubrimiento
                                                                │
                  Apify — Perfiles semilla ─► Agregar sugeridos ─► Apify — Detalle sugeridos
                                                                            │
                                              Vetting relevancia (Haiku)  [rama IG]
                                                            │
                                              IF — hay semillas TT
                              (sí) │                        │ (no)
                                  ▼                         │
              Apify — Lookalikes TikTok                     │
                                  ▼                         │
              Vetting TikTok (Haiku)  [rama TT] ───────────►│
                                                            ▼
                          Armar propuestas (junta IG + TT) ─► IF — hay propuestas
                                                       (sí) │            │ (no)
                                                            ▼            │
                                              POST Airtable Propuestos ─► Cerrar run
```

La rama TT es **paralela y aparte** para no tocar la cadena IG: el lookalike mezcla las semillas y no
atribuye por-semilla → el proyecto lo asigna su propio vetting Haiku; y juzga sobre bio + métricas (sin
captions). `Armar propuestas` lee **ambos** vettings por nombre, así cada fila arrastra su `plataforma`
y su `proyecto`. Con 0 semillas TT (toggle off o 0 referentes TT), el `IF — hay semillas TT` corta y la
rama no corre (costo 0).

Notas de diseño que muerden si las ignorás:
- **La promoción corre AL INICIO**, antes de buscar nada: los `aprobado` de la semana pasada se
  siembran como Referentes (activo ✓, razón en `notas`) y quedan `promovido` — así el motor del lunes
  siguiente ya los rastrea y el equipo nunca copia a mano. Máx 10 por corrida (un batch Airtable).
- **Dedup ANTES de pagar** (la inversión del motor): el set `conocidos` (handles en `Referentes`
  activo-o-no + `Referentes propuestos` en CUALQUIER estado) se arma en `Armar plan` y filtra en
  `Agregar sugeridos`, antes de la segunda pasada Apify. **Descartar es definitivo**: un handle
  descartado no se re-propone nunca (salvo alta manual).
- **Vetting FAIL-CLOSED, al revés del motor:** si Haiku falla o un proyecto no tiene criterios, ese
  lote NO se propone (acá el riesgo es inundar al equipo de ruido, no perder contenido). Para que la
  cadena no muera con 0 vetteados, el nodo emite un item `_vacio` que `Armar propuestas` filtra — el
  run siempre llega a `Cerrar run`.
- **TODO fail-soft:** los 3 Apify llevan `alwaysOutputData` + continue-on-fail; las lecturas de
  Ajustes/señal/Propuestos son continue-on-fail; `Cerrar run` evalúa las métricas con `try/catch`
  por nodo → el run cierra `ok` aunque toda pata externa haya fallado (con 0 propuestas).
- **Las 4 lecturas grandes de Airtable paginan** (Proyectos/Voces/Referentes/Propuestos — clave:
  el dedup necesita TODOS los propuestos históricos, no la primera página).

### 3.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace · lee → emite |
|---|---|---|---|
| 1 | Cron — semanal (lunes 9am) | scheduleTrigger | Lunes 9am (1h después del motor: señal fresca del archivado del domingo). |
| 2 | Ejecutar manual | manualTrigger | Execute a mano. |
| 3 | Config | set | IDs (`airtable_base_id`, `supabase_url`, `instance_id` — placeholders `<<…>>`) + defaults/caps: `cap_semillas` 8, `cap_perfiles_detalle` 20, `cap_lookalikes_tt` 15 (dev-only), `propuestas_max` 10, `afinidad_minima` 0.6, toggles `descubrir_ig`/`descubrir_tt` 1 (pisables desde Ajustes). |
| 4 | Abrir run en el registro | http POST | `POST runs` con `params:{workflow:'descubrimiento'}`, `return=representation`. continue-on-fail. |
| 5 | Barrer runs zombie | http PATCH | Marca `fallo` los runs de descubrimiento previos colgados `en_curso` (scoped `params->>workflow=eq.descubrimiento` + `id=neq.<run actual>`). continue-on-fail. |
| 6–8 | Leer Proyectos / Voces / Referentes | http GET | Airtable; Proyectos con `{activo}`, Voces y Referentes completas (Referentes SIN filtro `{activo}`: el dedup necesita también los inactivos). **Paginan.** |
| 9 | Leer Propuestos | http GET | Airtable `Referentes propuestos` completa (cualquier estado — el dedup + la promoción la necesitan entera). Pagina. continue-on-fail (1ª corrida: tabla vacía). |
| 10 | Preparar promoción | code | Filtra los `estado=aprobado` (máx 10) → arma `crear[]` (records de `Referentes`: handle, plataforma, proyecto, `activo:true`, `notas` con fecha+afinidad+razón) y `marcar[]` (PATCH a `promovido`). Emite `{hay, crear, marcar}`. |
| 11 | IF — hay aprobados | if | `crear.length > 0` → rama de promoción; si no → directo a `Leer Ajustes`. |
| 12 | POST Referentes (promoción) | http POST | `POST Referentes` con `crear`, `typecast:true`. **stop-on-fail** (si la siembra falla, no marcar `promovido`). |
| 13 | PATCH Propuestos promovidos | http PATCH | `PATCH Referentes propuestos` con `marcar` → los aprobados quedan `promovido`. Reconverge a `Leer Ajustes`. |
| 14 | Leer Ajustes | http GET | Airtable `Ajustes` — 4 knobs propios vía `AJUSTE_MAP`: `Propuestas por corrida`→`propuestas_max`, `Afinidad mínima de propuesta`→`afinidad_minima`, `Descubrir en Instagram`→`descubrir_ig`, `Descubrir en TikTok`→`descubrir_tt`. continue-on-fail → defaults de Config. |
| 15 | Leer señal selección | http GET | Supabase `v_senal_seleccion` (`referente`, `tasa_seleccion`, `calificados`). continue-on-fail → fail-open (sin señal, todas las semillas valen igual). |
| 16 | Armar plan de descubrimiento | code | El cerebro: **semillas IG** y **semillas TT** = referentes activos de proyectos activos de esa plataforma, rankeados por `tasa_seleccion` (desempate `calificados`), corte a `cap_semillas`, gateados por su toggle (`descubrir_ig`/`descubrir_tt`: off ⇒ semillas = []); **dedup por (plataforma, handle)**: `conocidos_ig`/`conocidos_tt` (Referentes todos + Propuestos todos, separados por plataforma); `projects{}` con criterios Proyecto⊕Voz (ADR-010); `tt_project_ids` (proyectos con semilla TT); knobs con `pick` (Ajustes > Config). Emite `{semillas, seed_to_proj, conocidos_ig, conocidos_tt, projects, propuestas_max, afinidad_minima, cap_detalle, tt_semillas, seed_to_proj_tt, tt_project_ids, cap_detalle_tt}`. |
| 17 | Apify — Perfiles semilla | apify | Actor `apify~instagram-profile-scraper`, `usernames = semillas`. **1ª pasada paga:** trae cada perfil semilla con sus `relatedProfiles` (~20 sugeridos del propio algoritmo de IG por cuenta). alwaysOutputData + continue-on-fail. |
| 18 | Agregar sugeridos | code | Junta los `relatedProfiles` de todas las semillas: fuera privados (`is_private`), fuera `conocidos_ig`; rankea por **frecuencia** (sugerido por N semillas > por 1) y corta a `cap_perfiles_detalle` ANTES de pagar el detalle. Emite `{usernames, candidatos{}, unicos}` (con qué semillas y proyectos reclama cada uno). |
| 19 | Apify — Detalle sugeridos | apify | Mismo actor, `usernames = top del 18`. **2ª pasada paga:** bio + `followersCount` + captions de `latestPosts` de cada sugerido. alwaysOutputData + continue-on-fail. |
| 20 | Vetting relevancia (Haiku) | code + Haiku | **Jurado estricto FAIL-CLOSED** por proyecto reclamante: bio (300c) + captions (8×180c) contra criterios Proyecto⊕Voz. Si una cuenta la reclaman varios proyectos, gana el mayor `afin` (acumula los proyectos). Si Haiku falla o no hay criterios → ese lote NO se propone. Emite `{username, afin, razon, proyectos, seguidores, bio, url, semillas, freq}` por cuenta (o `_vacio` para que la cadena siga). Throttle 1s entre proyectos. `claude-haiku-4-5`, `<ANTHROPIC_API_KEY>`. |
| 21 | IF — hay semillas TT | if | `tt_semillas.length > 0` → rama TikTok; si no (toggle off o 0 referentes TT) → directo a `Armar propuestas` (rama TT no corre, costo 0). |
| 22 | Apify — Lookalikes TikTok | apify | Actor `dataovercoffee~tiktok-lookalike-search`, `seed_usernames = tt_semillas`, `exclude_usernames = conocidos_tt` (dedup en la fuente), `limit = cap_lookalikes_tt` (15). **1 sola pasada paga** ($0.20/resultado): devuelve lookalikes con `score` de similitud, `signature` (bio), `follower_count`, `recent_avg_*`. alwaysOutputData + continue-on-fail. |
| 23 | Vetting TikTok (Haiku) | code + Haiku | **Jurado estricto FAIL-CLOSED** sobre bio + métricas (**sin captions** — el lookalike no los expone; prompt más conservador). Juzga cada cuenta contra los criterios de cada proyecto con semilla TT (`tt_project_ids`) y **adjunta solo el proyecto donde `afin ≥ afinidad_minima`** (así la sugerencia lleva el proyecto correcto). Dedup extra contra `conocidos_tt`. Emite `{username, plataforma:'tiktok', afin, razon, proyectos, seguidores, bio, url, semillas, freq}` (o `_vacio`). Throttle 1s entre proyectos. `claude-haiku-4-5`, `<ANTHROPIC_API_KEY>`. |
| 24 | Armar propuestas | code | Lee **ambos** vettings por nombre (`Vetting relevancia (Haiku)` IG + `Vetting TikTok (Haiku)` TT, con try/catch), junta, filtra `afin >= afinidad_minima` (0.6), ordena por afin (desempate freq), corta a `propuestas_max` (10, cap **global** IG+TT) → `records[]` de `Referentes propuestos` (`plataforma` de cada fila, `estado:'propuesto'`, afinidad 2 dec, razón/bio 500c, semillas) en batches de 10. Emite `{hay_propuestas, records, propuestos}`. |
| 25 | IF — hay propuestas | if | `records.length > 0` → POST; si no → directo a Cerrar run. |
| 26 | POST Airtable Propuestos | http POST | `POST Referentes propuestos`, `typecast:true`. **stop-on-fail** (es la entrega real). |
| 27 | Cerrar run en el registro | http PATCH | `PATCH runs` con `fin`, `estado:'ok'`, `metricas:{semillas, sugeridos_unicos, detalle, vetteados, propuestos, promovidos}` — sumas globales IG+TT (semillas = IG+TT, sugeridos/detalle suman los lookalikes, vetteados suma ambos vettings). Cada métrica con `try/catch`. continue-on-fail. |

### 3.3 El embudo en una frase

`semillas (≤8/eje, las que mejor convierten) → IG: sugeridos (~20/semilla) → dedup → top 20 por
frecuencia → detalle (bio+posts); TT: lookalikes (≤15, con score) → dedup → vetting Haiku por criterios
(IG con captions, TT solo bio+métricas) → propuestas IG+TT (afinidad ≥0.6, ≤10 total) → el equipo
aprueba → la corrida siguiente las siembra sola`. Costo acotado por diseño: IG 2 Apify (≤8 + ≤20
perfiles), TT 1 Apify (≤15 lookalikes, $0.20 c/u; $0 sin semillas TT), 1 Haiku por proyecto por eje.

---

## 4. Archivado (`archivado`) — 37 nodos

> **Validado para producción (cierre 19).** Corrió end-to-end con calificados reales (run `687027e2`):
> idempotencia, paginación, split de estados, barrido de zombies, cierre robusto y curación completa. El
> cron sigue sin activar (D1 del ROADMAP). Fuente de verdad = `workflow.json`.

### 4.1 Orden de ejecución

```
Cron semanal (dom 6pm) ┐
                ├─► Config ─► Abrir run ─► Barrer runs zombie ─► Leer Proyectos ─► Leer Voces ─► Leer Candidatos calificados
Ejecutar manual ┘                                                                                              │
                                                                                                               ▼
                                                                                                   IF — hay calificados
                                          (no) │                                                               │ (sí)
                                               │                                                               ▼
                                               │                                                    Armar filas archivado
                                               │                                                               ▼
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
                                               │                                       Borrar de Airtable
                                               ▼                                                │
                                     Leer runs de la semana ◄────────────────────────────────────┘
                                               ▼
                                     Leer runs descubrimiento   (costos, cierre 37)
                                               ▼
                                    Leer Descartes del gate ─► Computar métricas semana ─► POST Métricas (Airtable)
                                                                                              │              │
                                                                                              ▼              ▼
                                                                                       Cerrar run   Preparar borrado Descartes
                                                                                          │                   ▼
                                                                                          │        Borrar Descartes del gate
                                    (4 ramas laterales colgadas de Cerrar run) ───────────┤
      (higiene 2026-07-14)          ├─► Leer Candidatos nuevos viejos ─► Preparar barrido nuevos ─► Barrer Candidatos nuevos viejos
      (higiene 2026-07-14)          ├─► Leer Metricas viejas ─► Preparar barrido Metricas ─► Barrer Metricas viejas
      (ADR-022, M2)                 ├─► Destilar criterios ─► PATCH Proyectos criterios
      (ADR-022, M2)                 └─► Leer señal selección (archivado) ─► Leer Referentes (archivado)
                                            ─► Computar salud referentes ─► PATCH Referentes salud
```

**El SPLIT de sumideros (cierre 19):** `Registrar outputs` escribe a Supabase **todos** los decididos (con
su `estado`); el Sheet recibe **solo** `aprobado`; el borrado de Airtable toma **todos**. El
`Reconvergir tras Sheet` (Merge) garantiza que el borrado corra **aun con 0 aprobados** (rama Sheet vacía) pero
espere al Append. **Orden de sumideros = intencional:** Supabase → Sheet → **recién entonces** borra de Airtable;
el Append **no** es continue-on-fail (si el Sheet falla, corta antes de borrar → no se pierde la curación).
`Borrar de Airtable` reintenta **3× cada 2s**; el Append reintenta **3× cada 30s** (503 transitorios de Google).

**La cadena de métricas (ADR-021) corre en AMBAS ramas del IF** (con o sin calificados): converge en
`Leer runs de la semana` y termina cerrando el run. Los dos `Leer` son **fail-soft**
(`alwaysOutputData` + continue) y `Computar métricas semana` es **defensivo** (envuelve cada lectura
en try/catch y SIEMPRE emite ≥1 batch con la fila GLOBAL) → la cadena llega a `Cerrar run` aunque
Supabase o Airtable estén caídos. El borrado de descartes es una **rama lateral** después de
`POST Métricas` (si no hay nada que borrar, muere sin bloquear el cierre).

**Las 4 ramas laterales de `Cerrar run`** (todas `onError:continue` — el run ya cerró, no lo bloquean):

*Higiene (enmienda 2026-07-14):* **Barrer Candidatos nuevos viejos** purga `nuevo` con `fecha` >20
días (`filterByFormula` `AND({estado}='nuevo',IS_BEFORE({fecha},DATEADD(NOW(),-20,'days')))`) sin
archivar. **Barrer Metricas viejas** purga con `semana` >84 días. Ambas leen paginado y
borran en lotes de 10 vía un code node de `Preparar barrido`, mismo patrón que descartes. La columna
`diagnostico` la escribe `Computar métricas semana` (regla, sin IA).
> ℹ️ **El barrido de métricas cubre solo `Métricas Proyectos`, a propósito** (hardcodeado en `Leer
> Metricas viejas` **y** en la URL que arma `Preparar barrido Metricas`). `Métricas Global` **no se
> barre**: crece ~2 filas/semana (GLOBAL + DESCUBRIMIENTO) y conviene guardar más trend de costos/salud
> — decisión del contrato ([airtable-cockpit.md](../../core/contracts/airtable-cockpit.md) §Reglas para
> no salir del plan free). **No lo "arregles"**: la asimetría es intencional. Verificado en A.1 (2026-07-16).

*Loop de aprendizaje (ADR-022, M2):* **Destilar criterios → PATCH Proyectos criterios** escribe
`Proyectos.criterios_aprendidos` (lo que el motor lee en `Armar plan` + `Gate` → el loop cierra).
**Leer señal selección (archivado) → Leer Referentes (archivado) → Computar salud referentes → PATCH
Referentes salud** escribe la salud por referente.

### 4.2 Nodo por nodo

| # | Nodo | Tipo | Qué hace |
|---|---|---|---|
| 1 | Cron — semanal (domingo 6pm) | scheduleTrigger | `0 18 * * 0` (domingo 18:00, un día antes del motor). |
| 2 | Ejecutar manual | manualTrigger | Execute a mano. |
| 3 | Config | set | `airtable_base_id`, `supabase_url`, `instance_id`, `sheet_id`, `sheet_tab` (placeholders `<<…>>`) + `min_muestra_referente` 10, `min_muestra_destilar` 4 (ADR-022) + `ventana_corrida_min` 120 (matiz D.2: frontera vivo/zombie al contar `runs_ok/fallo` — mismo nombre y semántica que en el motor). |
| 4 | Abrir run en el registro | http POST | `POST runs` con `params:{workflow:'archivado'}`, `return=representation`. continue-on-fail. |
| 5 | Barrer runs zombie | http PATCH | **Auto-sanador (B5, cierre 19).** `PATCH runs` → marca `fallo` los runs de archivado anteriores colgados `en_curso` (scoped `params->>workflow=eq.archivado` + `id=neq.<run actual>`). Repara la integridad de `runs` cuando una corrida previa falló antes de *Cerrar run*. continue-on-fail. |
| 6 | Leer Proyectos | http GET | Airtable `Proyectos` (`pageSize 100`) → mapa `id→nombre`. **Pagina** (sigue el `offset`, #4). |
| 7 | Leer Voces | http GET | Airtable `Voces` (`pageSize 100`) → mapa `id→nombre`. Pagina (#4). |
| 8 | Leer Candidatos calificados | http GET | Airtable `Candidatos` con `filterByFormula=NOT({estado}='nuevo')` (trae aprobado/descartado), `pageSize 100`. **Pagina** (sigue el `offset` → todas las páginas, no trunca a 100, #4). `Armar filas` agrega todas las páginas (`flatMap`). |
| 9 | IF — hay calificados | if | `records.length > 0` → Armar filas; si no → **Leer runs de la semana** (la cadena de métricas corre igual — ADR-021). |
| 10 | Armar filas archivado | code | Por cada decidido arma `{record_id, output, sheet}`. Normaliza `estado` (aprobado/descartado, default descartado), resuelve proyecto/voz por nombre, `calificado_en = fecha_calificacion`. **`output.external_id = r.id`** (el id del record de Airtable, ver §8). `metadata` lleva `calificacion` **+ `relevancia_score`/`relevancia_razon`** (ADR-021) **+ `notas_equipo`/`viral_por_tamano`** (D.3(b), 2026-07-16 — el porqué del equipo y la marca viral dejan de morir con el record; construyen el corpus para decidir si entran al destilado). Las lecturas vestigiales `tema`/`link_doc` (no existían en `Candidatos`, archivaban `''` desde siempre) **se podaron** (D.4). El Sheet gana las keys `RELEVANCIA SCORE`/`RELEVANCIA RAZON` (pueblan solo si el Sheet tiene esas columnas — autoMap ignora las que falten). |
| 11 | Preparar outputs Supabase | code | Extrae `outputs[]` (TODOS los decididos) del nodo 10. |
| 12 | Registrar outputs (Supabase) | http POST | `POST outputs?on_conflict=external_id`, `Prefer: resolution=ignore-duplicates,return=minimal` → **idempotente** (re-correr no duplica). Sale a **2 ramas**: Preparar filas Sheet + Reconvergir (input 1). continue-on-fail. |
| 13 | Preparar filas Sheet | code | Extrae `sheet[]` del nodo 10 **filtrando a `aprobado`** (los descartados NO van al Sheet). |
| 14 | Append al Sheet Histórico | googleSheets | `append`, `autoMapInputData` → las keys de la fila deben **coincidir exacto** con los encabezados del Sheet. Credencial **OAuth2** (única dependencia de Google del pipeline). **stop-on-fail** (a propósito). **retry 3× / 30s** (503 de Google). |
| 15 | Reconvergir tras Sheet | merge | Une la rama Sheet (input 0) con la rama directa de Registrar outputs (input 1) → el borrado corre aun con 0 aprobados, pero espera al Append. |
| 16 | Preparar borrado Airtable | code | Arma URLs `DELETE` en **batches de 10** (`records[]=…`) con TODOS los decididos. |
| 17 | Borrar de Airtable | http DELETE | Borra los decididos de `Candidatos`. **retry 3× / 2s.** Sale a `Leer runs de la semana` (la cadena de métricas, ADR-021). |
| 17b | Leer runs de la semana | http GET | Supabase `runs` del motor de los últimos 7 días (`params->>workflow=eq.motor` + `inicio=gte.<now-7d>`, timestamp URL-encodeado), `select=id,estado,inicio,fin,metricas`. **Fail-soft** (`alwaysOutputData` + continue). Lo leen 17d (métricas) y 22 (salud por referente). |
| 17b′ | Leer runs descubrimiento | http GET | **Costos (cierre 37).** Supabase `runs` del **descubrimiento** de los últimos 7 días (`params->>workflow=eq.descubrimiento`) → alimenta la fila DESCUBRIMIENTO de `Métricas Global` (contadores Apify por actor). Entre `Leer runs de la semana` y `Leer Descartes del gate`. **Fail-soft.** |
| 17c | Leer Descartes del gate | http GET | Airtable `Descartes del gate` (todos; pagina). **Fail-soft.** |
| 17d | Computar métricas semana | code | **El cómputo de ADR-021.** Calidad por proyecto (de los calificados de este cierre): `precision` = aprobados/calificados, `score_aprobados/descartados`, `separacion_gate`. Salud global (de los runs del motor): embudo sumado, `sin_guion`, `descartes_expuestos`, `runs_ok/fallo`, `duracion_min`, llamadas por servicio; + `falsos_negativos` = descartes con `veredicto='era bueno'`. **Suma sobre TODOS los runs del motor de la semana** (dedup por id, sin filtrar `trigger_type` — las corridas on-demand entran solas; D.1/D.2). **Un `en_curso` más joven que `ventana_corrida_min` (Config, 120) es corrida viva y se saltea** (ni ok ni fallo — un click del botón cerca del domingo 6pm no ensucia la salud; matiz D.2, 2026-07-16); un `en_curso` más viejo es zombie y cuenta fallo. Emite batches de `records[]` para `Métricas` (fila por proyecto + fila GLOBAL); el 1er batch lleva `_resumen` para Cerrar run. **Defensivo:** try/catch por lectura, SIEMPRE ≥1 batch. La "semana" = semana de calificación (este cierre). |
| 17e | POST Métricas (Airtable) | http POST | POST a la tabla del batch (`$json._tabla`: `Métricas Proyectos` o `Métricas Global` — split 2026-07-15) con `typecast`. **continue-on-fail** (las métricas no bloquean el cierre). Sale a 2 ramas: Cerrar run + Preparar borrado Descartes. |
| 17f | Preparar borrado Descartes → Borrar Descartes del gate | code + http DELETE | Limpia `Descartes del gate` (batches de 10) — auditados o no, no se acumulan; el conteo de falsos negativos ya quedó en Métricas. Rama lateral, **continue-on-fail**, sin nada aguas abajo. |
| 18 | Cerrar run en el registro | http PATCH | `PATCH runs` con `fin`, `estado:'ok'`, `metricas:{archivados, falsos_negativos, filas_metricas}` (los últimos 2 del `_resumen` de 17d). **El conteo `archivados` se hace sobre `Leer Candidatos calificados`** (corre en ambas ramas del IF) → robusto en el caso 0 calificados. continue-on-fail. **De acá cuelgan las 4 ramas laterales** (19–20 higiene, 21–24 ADR-022). |
| 19 | Leer Candidatos nuevos viejos → Preparar barrido nuevos → Barrer Candidatos nuevos viejos | http GET + code + http DELETE | *Higiene (2026-07-14).* Purga `Candidatos` en `nuevo` con `fecha` >20 días, sin archivar (nunca se calificaron). Lee paginado, borra en lotes de 10. Rama lateral, continue-on-fail. |
| 20 | Leer Metricas viejas → Preparar barrido Metricas → Barrer Metricas viejas | http GET + code + http DELETE | *Higiene (2026-07-14).* Purga filas con `semana` >84 días, en lotes de 10. Apunta **solo a `Métricas Proyectos`** (hardcodeado en los 2 nodos): `Métricas Global` no se barre **a propósito** (ver §4.1). Rama lateral, continue-on-fail. |
| 21 | Destilar criterios | code + Haiku | **El loop de aprendizaje (ADR-022/M2).** Por proyecto, Haiku resume los calificados de la semana en patrones (lo que SÍ / lo que NO), priorizando los 🔥 como ejemplos positivos (fallback: aprobados). La **misma llamada** lintea los criterios manuales y deja `advertencia_criterios`. No destila con menos de `min_muestra_destilar` (4) calificados. **NUNCA pisa `criterios_relevancia` manual** — escribe al campo aparte `criterios_aprendidos`. Fail-soft: si Haiku falla, ese proyecto se salta. `<ANTHROPIC_API_KEY>`. |
| 22 | PATCH Proyectos criterios | http PATCH | `PATCH Proyectos` con `criterios_aprendidos` + `advertencia_criterios`. **Cierra el loop:** el motor lo lee en `Armar plan de corrida` + `Gate de relevancia`. continue-on-fail. |
| 23 | Leer señal selección (archivado) → Leer Referentes (archivado) | http GET ×2 | Supabase `v_senal_seleccion` (tasa acumulada por referente) + Airtable `Referentes` (pagina) → insumos de la salud por referente. Fail-soft. |
| 24 | Computar salud referentes → PATCH Referentes salud | code + http PATCH | **La mitad-archivado de la higiene de fuentes (ADR-022).** Por referente: `tasa_gate` (`gate_pass/evaluados` del desglose `por_referente` de `runs.metricas` de la semana — 17b), `tasa_aprobacion` (acumulada de `v_senal_seleccion`) y `videos_evaluados`. Exige `min_muestra_referente` (10) para no juzgar con pocos videos. Matchea por **handle normalizado** (sin `@`, minúscula). Escribe la salud a `Referentes`. continue-on-fail. |

---

## 5. Conexión con Airtable (mapa lee/escribe)

Base "Reels Cockpit", 9 tablas (contrato completo en
[`airtable-cockpit.md`](../../core/contracts/airtable-cockpit.md)). La API es REST: el motor pega a
`https://api.airtable.com/v0/<base_id>/<Tabla>`. Quién toca qué:

> El mapa **por campo** (quién escribe/lee cada campo + huérfanos) vive en
> [mapa-campos.md](./mapa-campos.md) — acá la tabla y el nodo, allá el campo.

| Tabla | Motor | Descubrimiento | Archivado | Notas |
|---|---|---|---|---|
| `Proyectos` | **lee** (`{activo}`, incl. `criterios_aprendidos`) | **lee** (`{activo}`, criterios) | **lee** (`id→nombre`) + **PATCH** (`criterios_aprendidos`, `advertencia_criterios` — ADR-022) | El motor lee config (criterios manuales ⊕ aprendidos, voz_default); el descubrimiento los criterios para el vetting; el archivado resuelve el nombre **y destila los criterios aprendidos**. |
| `Voces` | **lee** | **lee** (criterios) | **lee** (`id→nombre`) | `criterios_relevancia` afina gate y vetting (Proyecto⊕Voz, ADR-010). |
| `Referentes` | **lee** (`{activo}`) | **lee** (TODOS, para dedup) + **escribe** (promoción de aprobados) | **lee** + **PATCH** (salud por referente — ADR-022) | `handle` + `plataforma` → IG por cuenta / TikTok por perfil. **La única fuente del motor** (ADR-019); el descubrimiento la alimenta (ADR-020); el archivado le escribe `tasa_gate`/`tasa_aprobacion`/`videos_evaluados`. |
| `Ajustes` | **lee** | **lee** (2 knobs propios) | — | Knobs clave→valor; pisa los defaults de Config (fail-open). |
| `Candidatos` | **escribe** (`POST`, `typecast`, batch 10) | — | **lee** (calificados) + **borra** (`DELETE`, batch 10) | El único write del motor a Airtable. El equipo califica acá; el archivado lo vacía. |
| `Referentes propuestos` | — | **lee** (dedup+promoción) + **escribe** (`estado:'propuesto'`) + **PATCH** (`promovido`) | — | La bandeja del descubrimiento (ADR-020). El equipo marca `aprobado`/`descartado`; el motor NO la lee. |
| `Descartes del gate` | **escribe** (banda borderline, cap ~10/corrida) | — | **lee** (cuenta `veredicto='era bueno'`) + **borra** (limpieza semanal) | Auditoría de falsos negativos (ADR-021). El equipo marca `veredicto`. |
| `Métricas Proyectos` | — | — | **escribe** (fila por semana×proyecto) + **borra** (retención 84d) | Calidad por proyecto (`precision`, scores, `separacion_gate`). Split del 2026-07-15; el routing es `_tabla` en 17d/17e. Proyección solo-lectura, regenerable desde Supabase. |
| `Métricas Global` | — | — | **escribe** (fila GLOBAL + fila DESCUBRIMIENTO por semana) | Salud + costos (embudo, `sin_guion`, runs ok/fallo, llamadas y $ por servicio, contadores Apify). **Sin barrido a propósito** (~2 filas/semana; se guarda el trend largo — ver contrato). |

**Campos de `Candidatos` que escribe el motor** (nodo `Preparar batch Airtable`): `titulo`, `script`,
`idioma`, `referente`, `url_referente`, `views`, `likes`, `seguidores`, `engagement`, `heat_score`,
`viral_por_tamano`, `relevancia_score`, `relevancia_razon`, `estado:'nuevo'`, `proyecto`
(link), `voz` (link), `thumbnail` (attachment). *(`tema` salió con el eje keyword — ADR-019.)*
**Campos que NO toca el motor** (los pone el equipo o Airtable): `calificacion`, `notas_equipo`,
`fecha` (created time), `fecha_calificacion` (last modified de `calificacion`). El `estado` lo escribe
el motor como `nuevo` y luego lo cambia el equipo.

---

## 6. Esquema Supabase (cada tabla/vista, quién la escribe/lee)

Schemas en [`core/schema/`](../../core/schema/). Acceso por REST con la `service_role` (bypassa RLS;
vive en n8n, jamás en git). Tablas y quién las toca:

| Objeto | Tipo | Lo escribe | Lo lee | Notas |
|---|---|---|---|---|
| `clients` · `workflows` · `instances` | tablas config | seed manual (SQL) | — (referencia) | `instance_id` → nodo Config de los tres workflows. |
| `runs` | tabla | **los tres workflows** (`Abrir run` POST, `Cerrar run` PATCH, `params.workflow` = motor/descubrimiento/archivado) | **el archivado** (`Leer runs de la semana`, ADR-021) + dashboard futuro | Una fila por corrida; `metricas` jsonb distinto por workflow (motor: colectados/asignados/pretrim/filtrados/gate/outputs **+ sin_guion/descartes_expuestos/llamadas/por_referente** — ADR-021; descubrimiento: semillas/sugeridos_unicos/detalle/vetteados/propuestos/promovidos; archivado: archivados **+ falsos_negativos/filas_metricas**). |
| `outputs` | tabla | **solo el archivado** (`Registrar outputs`, estado calificado + `calificado_en`) | las 4 vistas de abajo | **Histórico canónico (ADR-014):** el motor ya no escribe filas `draft`; cada fila es una pieza calificada. |
| `processed_items` | tabla | **motor** (`POST processed_items`, ignore-duplicates) | **motor** (`Leer procesados`) | El dedup. `unique(platform, external_id)`. |
| `v_corpus_aprobados` | vista | — | (en pausa, ADR-009) | Few-shot por voz; el motor v1 no la consulta. |
| `v_historico_seleccionados` | vista | — | Sheet / dashboard | `004` la cambió para exponer `contenido_o_link` como `script` (no `link_doc`). Filtra `calificado_en is not null`. |
| `v_selecciones_por_dia` | vista | — | tracking | "el lunes seleccionaron N para tal voz". |
| `v_senal_seleccion` | vista | — | **motor** (boost del heat) + **descubrimiento** (ranking de semillas) | Tasa de selección por `referente`/`idioma`. |
| `v_senal_tema` | vista | — | **nadie (inerte, ADR-019)** | Tasa por `metadata->>'tema'` (`006`, ADR-012). Era el segundo eje del aprendizaje; quedó sin lectores al remover el eje keyword (DB inerte, sin migración). |

**`outputs.metadata` (jsonb), convención para `guion_reel`** (lo escribe el archivado): `proyecto`,
`voz`, `referente`, `url_referente`, `idioma`, `views`, `likes`, `seguidores`, `engagement`,
`heat_score`, **`relevancia_score`/`relevancia_razon`** (ADR-021 — el juicio del gate llega al
histórico), `calificacion`, **`notas_equipo`/`viral_por_tamano`** (D.3(b), 2026-07-16 — la señal
del equipo y la marca viral entran al histórico; corpus para el futuro (a) de D.3). Las keys
vestigiales `tema` y `link_doc` (siempre `''` desde ADR-019/009) **se podaron** (D.4) — las filas
viejas las conservan en su jsonb; `v_senal_tema` (que leía `tema`) ya era inerte sin lectores. Las
vistas de señal/histórico leen de acá.

---

## 7. El Sheet "Histórico" (sumidero exportable)

Lo escribe **solo el archivado** (`Append al Sheet Histórico`, `autoMapInputData`). Columnas (las keys
de `Preparar filas Sheet` deben matchear **exacto** los encabezados, mayúsculas incluidas):

`FECHA CALIFICACION` · `PROYECTO` · `VOZ` · `TITULO` · `URL ORIGINAL` · `SCRIPT` · `IDIOMA` · `VIEWS` ·
`LIKES` · `SEGUIDORES` · `HEAT SCORE` · `CALIFICACION` · `ESTADO` (13 columnas).

---

## 8. Trazabilidad de campos clave (lineage)

De dónde sale y a dónde llega cada campo que importa:

- **`external_id`** — dos contextos, una sola semántica en `outputs` desde ADR-014:
  - En `processed_items`: es el **id del video** en la plataforma (shortcode IG / id TikTok). Lo setea
    `Normalizar IG/TT`; es el set de dedup del motor.
  - En `outputs` (las escribe **solo el archivado**): es el **id del record de Airtable** (`rec…`), que
    `Armar filas archivado` pone como `external_id` → clave de idempotencia (`on_conflict`).
  - ✅ **Desde ADR-014 el motor ya no escribe `outputs`** → no hay filas `draft` huérfanas; `outputs` es
    el histórico canónico (solo piezas calificadas, `calificado_en` seteada). Las vistas de
    histórico/señal filtran `calificado_en is not null`.
- **`tema`** — **histórico/inerte desde ADR-019** (era el keyword/hashtag que matcheaba el video). El
  motor ya no lo setea ni lo escribe; `Candidatos.tema` se retiró del contrato. El **archivado** sigue
  copiando `tema: f.tema || ''` a `outputs.metadata.tema` (fail-safe: siempre `''`) y `v_senal_tema`
  quedó sin lectores. Las filas viejas de `outputs` conservan su `tema` poblado.
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

## 9. Placeholders y credenciales (al importar en n8n)

- **API keys** (en los Code nodes, como strings): motor → `<ANTHROPIC_API_KEY>` (×3: Pre-trim,
  Traducir, Gate) + `<SUPADATA_API_KEY>` (×1: Transcribir); descubrimiento → `<ANTHROPIC_API_KEY>`
  (**×2: Vetting relevancia (Haiku) IG + Vetting TikTok (Haiku)**).
- **IDs** (en el nodo `Config`, como `<<…>>`): `<<AIRTABLE_BASE_ID>>`, `<<SUPABASE_URL>>`,
  `<<INSTANCE_ID>>` (los tres workflows); el archivado suma `<<GOOGLE_SHEET_ID>>`,
  `<<NOMBRE_PESTANA_SHEET>>`; el motor suma `<<WEBHOOK_PATH_MOTOR>>` (en el nodo webhook, no en
  Config: path aleatorio del disparo on-demand, ADR-023 — la URL de Producción resultante es
  cuasi-secreto: dispara corridas pagas, va al gestor y a la automation de Airtable, jamás a git).
- **Credenciales nativas de n8n:** `airtableTokenApi` ("Airtable PAT"), `supabaseApi` ("Supabase
  Registro"), `apifyApi` (2 nodos Apify del motor + 3 del descubrimiento — la misma cred sirve para el actor TikTok dataovercoffee), Google Sheets **OAuth2**
  (solo el archivado).
- Nada de esto se commitea. Listar placeholders: ver el snippet en el CLAUDE.md del motor.
