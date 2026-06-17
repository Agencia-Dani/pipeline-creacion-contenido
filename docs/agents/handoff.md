# HANDOFF — estado vivo del MVP de reels

> **Si vas a trabajar en el repo, leé esto primero (2 min).** Acá vive el estado real: qué task
> está libre, quién tiene qué, y qué pasó en las últimas sesiones. El *qué hacer y cómo* de cada
> task vive en [ROADMAP §3](./ROADMAP.md) (este tablero usa sus mismos IDs); el contexto de
> producto en [ROADMAP §1](./ROADMAP.md) y el diseño en [PLAN.md](./PLAN.md).

## Protocolo (lo único que hay que respetar)

1. **Al tomar un task:** ponete como dev y pasalo a 🔧 en el tablero. Commit chico ("toma B1").
   Así nadie duplica trabajo.
2. **Al terminar la sesión** (termines o no el task): actualizá el tablero, y agregá una entrada
   al log de abajo — *qué se hizo · qué quedó a medias · gotchas/aprendizajes · qué sigue*.
   Marcá `[x]` lo completado en el checklist del ROADMAP. Commit + push de todo junto.
3. **Credenciales e IDs: JAMÁS acá ni en ningún archivo del repo.** Todo va al gestor de
   contraseñas compartido (el validador escanea secretos en cada corrida).
4. Si un task revela que el diseño está mal → no parchear en silencio: anotarlo en el log y
   discutirlo (si es estructural, termina en ADR).

**Estados:** ⬜ libre · 🔧 en curso · ✅ hecho · ⛔ bloqueado

## Estado en una línea

**2026-06-17 (cierre 6) — Las 6 decisiones lockeadas EJECUTADAS en código (Mani + Claude).** Sesión
larga de build. **#1** ya estaba (V-run cierre 5). Hechas esta pasada: **#6 idempotencia** del archivado
(migración `005`: índice `outputs.external_id` parcial→completo — verificado en vivo que el parcial daba
`42P10`; POST con `on_conflict=external_id`+`ignore-duplicates`; delete con reintento 3×); **#2 tabla
Ajustes** (ADR-011: knobs del scoring clave→valor en Airtable, `Leer Ajustes`→`Armar plan`→`cfg=Config⊕
Ajustes` en Heat-score y Gate; tabla creada+sembrada en la base viva, 9 defaults); **#3 piso duro**
`min_views`/`min_likes` pre-`top_n` (default 0); **#5 idioma** (guessLang detecta scripts no-latinos +
de/nl, lo desconocido→`ot` recibe boost; binario se queda); **#4 descubrimiento SIMÉTRICO** (4 Apify:
referentes+keywords en IG **y** TikTok; `Asignar` matchea por cuenta y por hashtag en ambas; keywords
multi-palabra colapsan; subsume #15/#16/#17); **señal bi-eje O7** (ADR-012: `tema` matcheado viaja
motor→`Candidatos.tema`→archivado→`outputs.metadata`; `v_senal_tema` migración `006`; Heat-score combina
referente⊕tema con max; campo `tema` creado en la base viva). **Motor: 30→34 nodos. Validador 963/0.**
6 commits a `main`. **🔴 PENDIENTE MANUAL (Mani): aplicar `005`+`006` en el SQL Editor de Supabase
(DDL, no va por PostgREST); V-run de re-validación en n8n (gate fix + 4 nodos nuevos); sembrar
Referentes TikTok (el eje TT-perfil queda vacío hoy); ROTAR el PAT Airtable + service_role (expuestos
hoy).**
> **Personalización del equipo (pedido de Mani, misma sesión):** 3 controles no-code más — *Resultados
> Instagram/TikTok por corrida* (volumen/costo, a Ajustes), **toggles de eje por Proyecto** (4 checkboxes
> "Buscar en IG/TikTok por cuentas/palabras clave"; ninguno marcado = los 4 corren), y *Relevancia mínima*
> (umbral del Gate). **Nombres en Airtable en español claro** (sin jerga): `Armar plan` mapea la clave
> amigable → key interna (`AJUSTE_MAP`). Base viva actualizada (12 claves Ajustes + 4 checkboxes).

**2026-06-17 (cierre 5) — V-run de ESTE repo VALIDADA + fix del no-transcript (Mani).** Se levantó el 🔴
de cierre 4: la **V-run corrió sobre el motor de este repo** (Supabase `runs` 61b1b5d5, `ok`, embudo
`151 colectados → 10 filtrados → 9 candidatos`) → **decisión #1 (validar primero) HECHA**. Análisis del output
con credenciales vivas (PAT + service_role): el **gate funciona** — dropeó `chris_stocks_` ("rescate animal con
ChatGPT" tangencial), justo el viral-off-topic que el refactor venía a matar; el composite re-rankea bien; el
script sale literal en español. **Hallazgo:** los **3 candidatos sin script esquivaban el gate** (sin texto salían
del lote → pasaban ciegos sin juzgar); uno (`tradingsharks` "Anthropic lanza Claude Fable 5") era hype que el
criterio rechaza. **FIX hecha en código (nueva decisión, ver log):** el nodo `Gate de relevancia` ahora **juzga el
caption como fallback** cuando no hay transcript; los relevantes-sin-script se **mantienen flageados**
`[SIN TRANSCRIPT: juzgado por caption, revisar manual]`, los irrelevantes ahora **sí se dropean**. Smoke test 5/5
+ validador 927/0. **Timeout de IG revisado:** NO es timeout (el community node espera al run de Apify, sin tope);
IG sale flaco por referente-only + ventana 7d + competencia métrica contra TikTok → la palanca real es el
descubrimiento simétrico. **🔴 SIN COMMIT (la fix está en el working tree) + falta V-run de re-validación. Rotar
PAT Airtable + service_role Supabase (expuestos hoy).** De las 6 decisiones: #1 ✅; quedan **#2-#6**.

**2026-06-16 (cierre 4) — Objetivos del MVP afilados + grill-me de cumplimiento (Mani).** Sesión de
alineación (sin tocar código): se destiló el norte (ROADMAP §1) a **11 objetivos verificables (O1–O11)**,
sumando **O11 = equipo-redes-friendly** (Majo/Jero operan casi solos, no-code). `/grill-me` objetivo por
objetivo sobre el motor real (30 nodos verificados en código) → **6 decisiones lockeadas, ninguna ejecutada
aún:** (1) postura **validar primero, barato** (la V-run corre el motor tal cual); (2) **#19/O11: tabla
Ajustes (clave→valor) en Airtable** para los knobs de scoring → no-code (ADR + contrato del cockpit); (3)
**piso duro `min_views`/`min_likes` pre-enriquecimiento** dentro de `Heat-score` antes del `top_n`, **default
0** (respeta "nada corta"), editable por el equipo vía Ajustes; (4) **O7: el aprendizaje se monta sobre el
descubrimiento simétrico** + extender `v_senal_seleccion` a keyword/tema (ADR), MVP IG-referente-only; (5)
**#18/O2: ampliar la detección de idioma** (DICT/librería), boost binario se queda, `boost_idioma` a Ajustes;
(6) **#2 idempotencia del archivado: fix ANTES de V3** (`resolution=ignore-duplicates` + delete con reintento).
Hallazgos del código: el boost de idioma corre sobre el caption **pre-transcripción** (Supadata-lang no
disponible ahí); la señal O7 solo acredita IG (en TikTok-por-hashtag el poster no es referente sembrado).
**🔴 La V-run que corrió Mani fue sobre un workflow VIEJO → el motor de ESTE repo sigue sin validar
end-to-end** (O1/O7 en rojo de validación). **Pendiente nuevo (prio ALTA): dev-doc nodo-por-nodo** del
workflow + conexión Airtable + esquema de la base (cada tabla/campo, qué lo escribe/lee). **Por escribir:
2 ADRs** (tabla Ajustes · señal bi-eje). Próximo: ejecutar las 6 decisiones + seguir el grill-me restante.

**2026-06-16 (cierre 3) — Bugfix de orden + refactor front-to-back (grilling) en `main` (Mani).**
La V-run real expuso un **bug de ejecución**: `Abrir run en el registro` colgaba en paralelo de
`Config` → n8n corría el pipeline entero antes que esa rama → `Preparar outputs Supabase` rompía con
"node hasn't been executed". **Fix:** `Abrir run` ahora va **en serie** (Config → Abrir run → Leer
Proyectos). Después, sesión `/grill-me` punta a punta → decisiones lockeadas y **ejecutadas esta
pasada:** (a) Candidatos expone `relevancia_score` + `relevancia_razon` (el gate los calculaba y los
tiraba) + `thumbnail` (portada de Apify como attachment); (b) **#12** resuelto (`external_id` en
outputs Supabase → el índice parcial corta los duplicados de los re-runs); (c) **limpieza de campos
muertos** (`link_doc`, `categoria`, `min_likes`/`min_views`, y los de generación de `Voces`) en
`setup-airtable.mjs` + contrato + manifest, y **3 campos nuevos agregados a la base viva por API**;
(d) **#10 resuelto:** README + CLAUDE.md del workflow reescritos al motor real. Validador en verde
(927). **Diferido a post-V-run:** descubrimiento simétrico (4 Apify, los actores actuales ya cubren
ambos ejes). **Diferido a pre-cron:** #4 paginación, #5 tope dedup. **Manual de Mani en la base viva:**
borrar los 4 campos muertos + los de Voces (la API no borra campos) y `fecha → Created time`.
**🔴 ROTAR el PAT de Airtable** (re-expuesto en chat esta sesión).

**2026-06-16 (cierre 2) — Stage 4 del refactor cerrado en `main` (Mani).** Limpieza estructural:
el motor mapea 1:1 a las 8 etapas de PLAN §2.4 (verificado nodo a nodo: 30 nodos, 0 rotas, 0 huérfanos),
único `merge` es **append** (0 mergeByPosition), adaptadores de descubrimiento prolijos (mismo
`content_item` desde IG/TT — patrón ADR-007). **Docs sincronizadas a la realidad:** PLAN §2.4 (CALIDAD
deja de ser hueco ❌, sale `tema`, GENERAR = texto sin Doc, NOTIFICAR n/a) y §2.3 (30 nodos, ADR-009+010).
**Verificado en la base viva (PAT):** `criterios_relevancia` existe en `Proyectos`+`Voces`, piloto
sembrado → **cierra el manual de Stage 1**; la Voz provisional tiene el criterio vacío (opcional, sembrar
en Stage 5). Falta **Stage 5 = V-run + calibración** (llenar 3×`<ANTHROPIC_API_KEY>` + 1×`<SUPADATA_API_KEY>`
en n8n). **🔴 ROTAR el PAT de Airtable** (expuesto de nuevo en chat esta sesión). Deuda aparte: README/CLAUDE.md
del workflow siguen en el template viejo (#10).

**2026-06-16 (cierre) — Refactor de relevancia Stages 1-3 en `main` (Mani).** Doble gate Haiku
operativo en código: **pre-trim** laxo (recall) sobre el caption antes de transcribir + **Gate**
jurado estricto (precision) sobre el transcript; el `heat_score` ahora es **composite**
(semántico ⊕ métrico, knob `peso_relevancia` 0.7). Campo `criterios_relevancia` editable por el equipo
en **Proyectos + Voces** (piloto sembrado). El enriquecimiento se **reconstruyó en 2 Code nodes**
(`Transcribir`/`Traducir`) → mata #7/#8 (la rama `fix/altos-auditoria` se había perdido). Cadena:
`Heat-score → Transcribir → Traducir → Gate → Armar candidato` (30 nodos). Valida (933) + smoke tests;
**falta V-run** (llenar 3×`<ANTHROPIC_API_KEY>` + 1×`<SUPADATA_API_KEY>` en n8n; **rotar el PAT de
Airtable**). Sigue en otra sesión: **Stage 4** (limpieza, casi hecha) + **Stage 5** (calibrar pesos/rubric).

**2026-06-16 (noche) — V1 corrió y pobló Candidatos; abierto el refactor de relevancia (Mani).** El
re-import (post-fix timestamp IG) funcionó end-to-end. Gap detectado: el ranking deja pasar
viral-pero-irrelevante (substring de keyword, sin juicio de contenido). Sesión de grilling
(`/grill-with-docs`) → decisiones lockeadas + **plan por stages** en
[refactor-relevancia.md](./refactor-relevancia.md). Núcleo: doble gate Haiku (pre-trim recall en
FILTRAR/SCOREAR + jurado precision en CALIDAD) + heat-score composite (semántico ⊕ métricas, sin
substring). **Stage 0 ✅** (ADR-010 escrito + ambos manifests sincronizados a las 8 etapas →
validador en verde, resuelve #1). Próximo: Stage 1 (campo `criterios_relevancia` en Airtable). El
micro-fix de idioma (#7) y la limpieza de merges (#8) ya están en `fix/altos-auditoria` →
precondición de los stages intrusivos.

**2026-06-16 (tarde) — Bloqueante #6 resuelto: Apify migrado a community node (Mani).** Los dos
nodos Apify (`run-sync-get-dataset-items`, tope 300s) → `@apify/n8n-nodes-apify.apify` op
**"Run actor and get dataset"** (espera al run, sin tope de 5 min) en `workflow.json`. Mismos
nombre/id/posición → conexiones intactas; el token sale de la URL a la credencial `apifyApi`.
**Falta:** re-importar en InstaPods, asignar credencial Apify en los 2 nodos, verificar
`actorId`/`customBody`, y re-correr V1. **Convención nueva:** `temp/` (gitignored) guarda la copia
viva del workflow descargada de InstaPods — la fuente sobre la que probamos; no commitear (trae
secretos).

**2026-06-16** — **Carril C completo. C2 ✅ + C3 ✅ (Dev 3).** Dev 3 creó su propia cuenta GCP,
configuró OAuth2 (Client ID + Secret, APIs habilitadas, test user), conectó Google Sheets en n8n y
ejecutó el workflow completo exitosamente: candidatos archivados en Supabase + fila en Sheet Histórico
+ records borrados de Airtable. **Carril C cerrado.** Camino crítico ahora: V1–V6 (validación en
vivo del motor B3, depende también de carril A terminando A5–A9). ⚠️ GCP en créditos gratuitos
($300 USD) — ver gotcha en log.

**2026-06-14** — **Motor B3 construido + n8n listo para correr.** `workflow.json` (ADR-009, 35
nodos, valida estructural) importado; **B1/B4/B5 ✅**: TZ `America/Bogota` confirmada, credenciales
nativas (Airtable PAT + Supabase Registro) creadas/asignadas, nodo Config con los IDs, keys
placeholder en los nodos HTTP, error workflow publicado e instalado. **Único pendiente del carril B:
validación en vivo V1–V6** (camino crítico V1–V3 también depende de C2/Sheet del carril C). **Decisión
estructural abierta para el equipo: Airtable vs Supabase / alcance del registro central** — ver
§"Decisiones a consultar con el equipo".

**2026-06-13** — Carril A en curso (Alejo): Supabase con la `service_role`/secret key a mano,
**base Airtable creada por script** (`baseId` en el gestor). Faltan 2 pasos manuales en
Airtable (campo `fecha_calificacion` + vista 🔥), accesos a Majo/Jero, **semillas (A9, en pausa
hasta definir nicho)**.

## ⏳ Pendiente inmediato (manual de Mani, cierre 6)

> Las 6 decisiones están en código y commiteadas. Para que corran en vivo falta lo **manual** (no lo
> puedo hacer yo):
> 1. **Aplicar `005_idempotencia_outputs.sql` + `006_senal_tema_bieje.sql`** en el SQL Editor de
>    Supabase (es DDL: `drop/create index` y `create view` → no va por PostgREST/service_role).
> 2. **Re-importar el motor en n8n** (34 nodos; asignar credencial `apifyApi` a los 2 Apify nuevos —
>    *IG Hashtag* y *TikTok Perfil* — y la key `<ANTHROPIC_API_KEY>`/`<SUPADATA_API_KEY>` en los Code
>    nodes) + el archivado, y correr la **V-run de re-validación** (gate-fix + Ajustes + simétrico).
> 3. **Sembrar Referentes de TikTok** (hoy las 3 cuentas son IG → el eje *TikTok Perfil* sale vacío).
> 4. **🔴 ROTAR el PAT de Airtable + la service_role de Supabase** (expuestos en el chat de hoy).

## Próxima sesión — calibrar + cerrar pre-producción

> **Estado (cierre 6):** las **6 decisiones lockeadas están EJECUTADAS** (ver §"Estado en una línea").
> El motor pasó a 34 nodos, descubrimiento simétrico, knobs en Airtable, señal bi-eje. Validador 963/0.
> Lo que sigue tras la V-run de re-validación: **calibrar** pesos/rubric con data real; resolver los
> **pendientes pre-cron** (§Mejoras: #4 paginación, #5 tope dedup, #9 OAuth Sheets) y la **dev-doc
> nodo-por-nodo**; después **D0 limpieza pre-producción → D1–D3 activación**.

**Las 6 decisiones lockeadas — TODAS HECHAS (cierre 6; #1 en cierre 5):**

1. **✅ Validar primero (cierre 5).** Motor de ESTE repo corrió end-to-end (run 61b1b5d5, `ok`).
2. **✅ Tabla Ajustes (#19/O11) — ADR-011.** Knobs del scoring clave→valor en Airtable; `Leer Ajustes`
   → `Armar plan` → `cfg = Config ⊕ Ajustes` en Heat-score y Gate. Tabla creada+sembrada en la base viva.
3. **✅ Piso duro (Q1).** `min_views`/`min_likes` en `Heat-score` antes del `top_n`, default 0, vía Ajustes.
4. **✅ Señal bi-eje (O7) — ADR-012.** `tema` matcheado motor→`Candidatos.tema`→archivado→`outputs.metadata`;
   `v_senal_tema` (006); Heat-score combina referente⊕tema (max). Inerte hasta tener historial.
5. **✅ Idioma (#18/O2).** `guessLang` ampliado (scripts no-latinos + de/nl, desconocido→`ot`→boost);
   binario se queda; `boost_idioma` ya vive en Ajustes; detección dev-only.
6. **✅ Idempotencia del archivado (#2) — migración 005.** Índice `outputs.external_id` parcial→completo
   (verificado en vivo: el parcial daba `42P10`); POST con `on_conflict`+`ignore-duplicates`; delete 3×.

**Bonus de la misma sesión:** **#4 descubrimiento SIMÉTRICO** (4 Apify: referentes+keywords en IG **y**
TikTok; subsume #15/#16/#17) — ya **construido**, no diferido. Las TT-referentes hay que sembrarlas.

**Pendiente nuevo (prio ALTA, NO bloquea):** **dev-doc nodo-por-nodo** del workflow (los 34 nodos + orden
de ejecución), la conexión con Airtable, y el esquema de la base (cada tabla/campo, qué lo escribe/lee).

**7ª decisión (cierre 4, post-handoff inicial):** **O1 — el cron del motor queda SEMANAL** (lunes 8am, lo
que ya trae el nodo y menciona el CLAUDE.md). Más barato y no estresa la cuota free de Airtable. **Corregir
ROADMAP §D1 y §B3** que dicen "diario/cada-2-días" (quedaron desalineados). **O5 verificado en código:** el
prompt de `Traducir` fuerza literalidad (sin reescribir/resumir/embellecer), usa `idioma_detectado` de
Supadata y es fail-open → riesgo de embellecimiento del ROADMAP §6 está mitigado a nivel prompt (igual
confirmar en V2 con muestras reales). Detalle menor: trunca el transcript a 6000 chars (sobra para reels).

## Tablero de tasks

| ID | Task (detalle en ROADMAP §3) | Depende de | Estado | Dev |
|---|---|---|---|---|
| M0.2 | Cuentas/accesos de cada carril → gestor | — | ⬜ | cada uno la suya |
| M0.3 | Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra provisional) | — | ⬜ | Mani |
| A1–A4 | Supabase: schemas 001–003 ✅ (verificado) + cliente `piloto` + instancia ✅ (`instance_id` generado, en gestor/Config) | — | ✅ | Alejo + Mani |
| A5–A9 | Airtable: base + semillas provisionales ✅ (proyecto "IA y Productividad", 1 voz, 9 keywords multiidioma, 3 referentes IG); faltan **campo `fecha_calificacion` a mano + vista 🔥 + accesos Majo/Jero** | — | 🔧 | Alejo |
| A10 | Entregar credenciales/IDs a B y C por el gestor | A1–A9 | ✅ | **Alejo** (Supabase URL+key, PAT, baseId → Mani) |
| B1 | n8n online en InstaPods + TZ `America/Bogota` | — | ✅ | **Mani** (server + TZ confirmada) |
| B2 | Smoke-test del piloto (`deploy.mjs piloto` → corrida manual) | B1 + keys | ⬜ | Mani — *omitido: fuimos directo a B3* |
| B3 | **Rework del motor** (Airtable→heat v1→dedup→transcribe/traduce→candidatos) | A10 | 🔧 | **Mani** (motor construido + setup completo; falta validar V1–V6) |
| B4 | Credenciales en n8n (Apify, Anthropic/Haiku, Supadata, Airtable PAT, Supabase) — **sin Google** | A10 + B1 | ✅ | **Mani** (cred. nativas creadas/asignadas, Config con IDs, keys placeholder en HTTP) |
| B5 | Error workflow del registro instalado | B1 | ✅ | **Mani** (publicado e instalado como error workflow) |
| C1 | Google Sheet "Histórico" (13 columnas, con **SCRIPT** texto) + compartir | — | ✅ | **Dev 3** (Sheet en `https://docs.google.com/spreadsheets/d/1Ngzjjsw2sMU-y6NienN-YHxro6o8BcOzmszZH9C3Av4`, pestaña `Historico`; ID va en `<<GOOGLE_SHEET_ID>>` del C2) |
| C2 | Workflow de archivado — desplegado, configurado y probado en n8n | A10 + B1 + C1 | ✅ | **Dev 3** (2026-06-16) |
| C3 | Verificar tracking (`v_selecciones_por_dia` responde) | C2 | ✅ | **Dev 3** (2026-06-16 — corrida exitosa) |
| V1–V6 | Corridas de validación (backfill, literalidad, curación, re-rank, dedup, resiliencia) | B3 + C2 | ⬜ | los 3 |
| D0 | **Limpieza pre-producción (entregar limpio):** borrar la data de prueba — Candidatos de Airtable, filas de Supabase (`outputs`/`runs`/`processed_items`), y **reemplazar las semillas provisionales** (Proyecto "IA y Productividad", Voz provisional, 9 keywords, 3 referentes) por la config real del cliente. Último paso antes de activar crons. | V1–V6 | ⬜ | los 3 |
| D1–D3 | Activación: TZ validada + crons + manifest `active` + demo a Majo/Jero | D0 | ⬜ | los 3 |

> Paralelismo real: **A** (Alejo) y **B** (Mani) y **C** (Dev 3) corren en paralelo. Ahora que
> A10 está entregado, el camino crítico es **B4 → V1–V6**.

## Decisiones a consultar con el equipo (estructurales — no resolver en silencio)

> Surgieron al construir B3. No bloquean avanzar (el motor corre igual), pero conviene cerrarlas
> con Andrés/el equipo porque tocan el alcance y posiblemente un ADR.

1. **✅ RESUELTA (2026-06-15): se mantiene Supabase + Airtable.** Decisión al arrancar carril C:
   Supabase queda **acotado a dedup + histórico + señal de aprendizaje** (la recomendación de Mani).
   C2 se construyó completo (escribe a `outputs` Y al Sheet). Texto original abajo por contexto.
   Pregunta de Mani 2026-06-14: ambas son bases de datos, ¿no sobra Supabase? Estado actual del
   motor: **el equipo SOLO toca Airtable** (input, búsqueda, mapa de calor, selección). Supabase es
   *sala de máquinas*, invisible al equipo, y hace **dos cosas que Airtable free no hace bien**:
   (a) **dedup permanente** (`processed_items`, UNIQUE) para **no re-scrapear/re-transcribir y no
   re-pagar Apify/Supadata/Claude** — sirve directo al objetivo de minimizar costo; Airtable free
   topa a 1.000 records y se purga; (b) **histórico permanente + señal de aprendizaje**
   (`v_senal_seleccion` alimenta el heat) que sobrevive a la purga de Airtable. **Todos los nodos
   de Supabase son continue-on-fail** → si el equipo decide sacarlo, el motor IGUAL entrega a
   Airtable (se pierde solo el dedup entre corridas y el histórico permanente). **Recomendación de
   Mani:** mantener Supabase **acotado a dedup + histórico**, no expandirlo. **A decidir con el
   equipo:** ¿se mantiene, o MVP solo-Airtable + Sheet aceptando reprocesar? (Si se saca, también
   cambia carril C.)
2. **✅ RESUELTA (2026-06-15): el script va como TEXTO, sin Google Doc.** El Sheet Histórico lleva el
   **texto del script** — implementado en [`004_historico_script_texto.sql`](./core/schema/004_historico_script_texto.sql)
   (la vista `v_historico_seleccionados` expone `outputs.contenido_o_link` como `script` en vez de
   `link_doc`) y en C2. **Falta aplicar el `004` en Supabase.** Pendiente menor de docs: nota de 1
   línea en ADR-009 y en `airtable-cockpit.md` (`link_doc` queda vestigial). Texto original:
   Decisión de Mani 2026-06-14: nada de un Google Doc por script (llenaría el Drive). El script vive
   como **campo de texto** en Airtable y en Supabase `outputs.contenido_o_link`; el "link" es la URL
   del video original. → El motor **no usa ninguna credencial de Google**.
   - **📍 Ciclo de vida del script traducido (traza punta a punta):** motor `Traducir (Claude Haiku)`
     → campo `script` (traducción literal al español, o el transcript si ya estaba en español) →
     **Airtable `Candidatos.script`** (área de trabajo temporal donde el equipo cura). Al calificarse,
     el archivado (cron diario) copia `script` a **Supabase `outputs.contenido_o_link`** + columna
     **`SCRIPT`** del Google Sheet "Histórico" (los dos sumideros permanentes) y **borra el record de
     Airtable**. ✅ `link_doc` **eliminado del cockpit** (script/contrato/manifest, cierre 3); falta
     borrarlo a mano en la base viva (la API no borra campos). ADR-009 ya nota que el script es texto.
3. **`deploy.mjs` quedó obsoleto** para este motor (resolvía placeholders en voz/categorías). El MVP
   es 1 instancia editada a mano en el nodo Config. Rewrite multi-cliente = F5.

## Mejoras pendientes (motor completo — esto es lo que sigue)

> Carriles A, B y C cerrados: el motor entrega y el equipo cura. Esta es la **lista única** de lo que
> falta, ordenada por impacto: primero la **auditoría técnica** (correctitud/rendimiento, pasada
> 2026-06-16 sobre los artefactos reales — `workflow.json` del motor y del archivado, schemas
> `001`–`004`, `validate.mjs`, manifests), y al final las mejoras de **producto/alcance** (modelo de
> búsqueda y tuning, salidas al documentar el flujo para el equipo de redes). Nada de esto bloquea el
> MVP. **#1, #2, #4 y #9 deberían cerrarse ANTES de activar los crons (D1–D3): fallan en silencio en
> producción.**

**🔴 Crítico (correctitud / rompe en prod):**

0. **🔶 RESUELTO EN CÓDIGO (2026-06-17, cierre 5) — falta V-run + commit. No-transcript esquivaba el gate.**
   Cuando Supadata no transcribe (`script=''`), el `Gate de relevancia` sacaba el item del lote
   (`.filter(x => x.texto)`) → pasaba **sin juzgar** a Candidatos (incluido contenido que el criterio rechaza,
   ej. el reel de hype "Anthropic lanza Claude Fable 5"). **Fix:** el gate juzga el **caption como fallback**;
   relevantes-sin-script se mantienen flageados `[SIN TRANSCRIPT: juzgado por caption, revisar manual]`,
   irrelevantes se dropean. Smoke 5/5 + validador 927/0. **Pendiente:** re-importar + V-run + commit.
1. **✅ RESUELTO (2026-06-16, Stage 0 del refactor).** Validador en verde (933 checks, 0 errores).
   Se arreglaron los manifests al contrato: (a) creado `workflow-archivado/workflow.yaml`; (b)
   `short-form-content/workflow.yaml` reescrito a las 8 etapas canónicas + `client_config` + `filters`
   + `registered: yes`. *(Original: 13 errores — archivado sin manifest, short-form-content con stages
   inventados, sin `client_config`/`filters`, `registered: supabase` inválido.)*
2. **✅ RESUELTO (2026-06-17, cierre 6).** Migración `005`: índice `outputs.external_id` parcial→completo
   (verificado en vivo que el parcial daba `42P10` en `on_conflict`); el POST de `outputs` ahora usa
   `on_conflict=external_id` + `Prefer: resolution=ignore-duplicates`, y `Borrar de Airtable` reintenta
   3× (2s). Re-correr ya no duplica el Sheet ni pierde candidatos. *(Aplicar `005` en SQL Editor — manual.)*
   *(Original abajo.)* **El archivado NO es idempotente si falla el borrado de Airtable.** Orden: `outputs → Sheet →
   borrar Airtable`. `Borrar de Airtable` no es continue-on-fail; si el delete falla DESPUÉS del
   append, los records quedan en Airtable y la corrida siguiente los re-toma. Como `outputs.external_id`
   tiene índice UNIQUE (`outputs_external_id_key`, schema 001) y el POST no usa `on_conflict`, el batch
   entero falla en PostgREST → como `Registrar outputs` es continue-on-fail, sigue igual → **fila
   duplicada en el Sheet** y los candidatos nuevos del mismo batch **nunca llegan a `outputs`** (se
   pierden del histórico y de la señal de aprendizaje). Fix: `Prefer: resolution=ignore-duplicates` en
   el POST de outputs (igual que `processed_items`) y/o delete con reintento.
   **🔒 Decidido (cierre 4): fix ANTES de V3** (la V3 ejercita el archivado → si no, la propia validación
   duplica filas). Sale del bucket "pre-cron" para adelantarse.
3. **La dedup NO ahorra costo de Apify (contradice el HANDOFF §Decisiones 1a).** El scrape (Apify) corre
   ANTES del dedup (`Apify → … → Leer procesados → Heat-score filtra`). Apify se paga en cada corrida;
   el dedup solo ahorra Supadata + Claude. La justificación de mantener Supabase está sobredimensionada.

**🟠 Alto (escala / costo):**

4. **Sin paginación en NINGUNA lectura de Airtable.** Airtable devuelve máx. 100 records/página y exige
   seguir `offset`. Ni el motor (`Leer Keywords/Referentes/Proyectos/Voces`) ni el archivado
   (`Leer Candidatos`, `pageSize 100`) iteran el offset → en cuanto algo pase de 100 se **trunca en
   silencio** (keywords ignoradas, candidatos sin archivar).
5. **Dedup con tope fijo de 20 000 filas.** `Leer procesados` hace `...&limit=20000`. Cuando
   `processed_items` lo supere, las filas viejas no se cargan → dedup parcial → re-pago de
   Supadata/Claude. Mejor: filtrar por los `external_id` de la corrida (`in.(...)`), no traer toda la tabla.
6. **✅ RESUELTO (2026-06-16, Mani): Apify migrado a community node.** Era el bloqueante de V1:
   `run-sync-get-dataset-items` topa a 300 s y el run de IG dura 6-7 min → entregaba 0 candidatos
   (confirmado en vivo: IG `ECONNABORTED`). **Fix:** los dos nodos Apify pasaron de
   `n8n-nodes-base.httpRequest` a `@apify/n8n-nodes-apify.apify` op **"Run actor and get dataset"**
   (espera al run, sin tope sync) en `workflow.json`. Se eligió el community node sobre el patrón
   async a mano (Mani ya lo instaló en InstaPods). Mismos nombre/id/posición → conexiones intactas;
   el token sale de la URL a la credencial `apifyApi`. **Pendiente:** re-importar, asignar credencial
   Apify en los 2 nodos, verificar `actorId` (string vs resourceLocator) + `customBody`, re-correr V1. *(🔶 PARCIAL en rama
   `fix/altos-auditoria`: agregada solo la **visibilidad** — el run cierra como `degradado` si el heat no
   produjo items, para que el timeout no quede como "ok" con 0 candidatos. El **async sigue pendiente** —
   es el fix obligatorio.)*
7. **Detección de idioma por conteo de stopwords (`guessLang`), default `'es'`.** Frágil: un video EN con
   pocas stopwords cae a `'es'` → se salta la traducción → el equipo recibe el script en inglés. Además el
   idioma alimenta un boost del heat-score. Usar el `lang` de Supadata como fuente primaria. *(✅ RESUELTO
   2026-06-16 — reconstruido sobre `main` en el Code node `Transcribir (Supadata)`: `lang` de Supadata
   primario, fallback que adivina sobre el transcript. La rama `fix/altos-auditoria` se perdió. Pendiente V-run.)*
8. **`Merge transcripción`/`Merge traducción` por posición (`mergeByPosition`).** Recombina por índice; si
   Supadata reordena o cambia el conteo de items, pega la transcripción al metadato equivocado. Hoy se
   sostiene por `batchSize:1`+`neverError`, pero es alineación implícita peligrosa → merge por `external_id`.
   *(✅ RESUELTO 2026-06-16 — reconstruido sobre `main`: enriquecimiento consolidado en 2 Code nodes
   (`Transcribir`/`Traducir`, `this.helpers.httpRequest`); ambos Merge por posición eliminados, el
   `external_id` queda atado al item. Pendiente V-run.)*

**🟡 Medio (deuda / operativo):**

9. **OAuth de Google Sheets en modo "Testing" → vence cada 7 días.** El cron de archivado es diario →
   falla en silencio ~1 vez/semana hasta re-autorizar. Sumado a los créditos gratuitos de GCP ($300) que
   se agotan, el carril C tiene dos relojes corriendo. Publicar la app OAuth / mover a la cuenta GCP
   permanente ANTES de activar el cron.
10. **✅ RESUELTO (2026-06-16 cierre 3).** README + CLAUDE.md del workflow **reescritos al motor real**
    (Haiku traductor/jurado, doble gate, Apify community node, sin Sheets/categorías/loop, orden de
    ejecución). *(Original: describían el template VIEJO — Sonnet escritor, Loop+Wait, prompt caching,
    categorías, Sheets — nada de eso existe. Trampa para el próximo dev.)*
11. **`core/scripts/deploy.mjs` es código muerto** (HANDOFF §3 lo declara obsoleto). Borrar o marcar claro.
12. **✅ RESUELTO (2026-06-16 cierre 3).** `Preparar outputs Supabase` ahora setea `external_id` → el
    índice parcial `outputs_external_id_key` hace de backstop (en re-runs el POST 409ea, continue-on-fail,
    sin fila duplicada). *(Original: `external_id` NULL → el índice no aplicaba → cada re-run manual
    duplicaba en `outputs`.)*
13. **Percentiles del heat-score sobre muestras chicas** (IG ~8×3 + TT 30) → ranking ruidoso; `flag_viral`
    por seguidores (>700k) es proxy grueso. Modelo v1 conocido; documentar que es poco estable sin volumen.
14. **Metadata residual del template original** (`instanceId`, `tags`) quedó en el `workflow.json` del motor
    (líneas ~1283-1306). No es secreto, pero ensucia el diff.

**🔵 Producto / alcance (modelo de búsqueda y tuning — post-MVP):**

Contexto — **cómo busca hoy el motor (asimétrico por plataforma)**, verificado en `workflow.json` (nodo
*Armar plan de corrida* + nodos Apify):
- **Instagram = por cuenta.** Baja los posts recientes de cada `Referentes` con `plataforma=instagram`
  (`directUrls`, `searchType:user`). Las **Keywords NO aplican a IG**: un reel entra por venir de una
  cuenta seguida, tenga o no las palabras.
- **TikTok = por hashtag.** Busca con las `Keywords` (cada `termino` → un hashtag). Es un **OR**: entra
  el video con **al menos una** keyword, no todas. Un TikTok sin esos hashtags es invisible al motor.
  *(Las keywords tienen un uso secundario en el heat-score: el "boost de tema" matchea la descripción,
  pero solo ordena, no filtra.)*

> **🎯 DIRECCIÓN (Mani, 2026-06-16; lockeada en el grilling cierre 3) — descubrimiento simétrico: ambos
> ejes en ambas plataformas.** Hoy es asimétrico (IG solo por referentes, TikTok solo por keywords). El
> objetivo: que **referentes Y keywords apliquen a IG Y a TikTok**. Diseño: **4 llamadas Apify** (2 por
> plataforma) → IG-referentes (existe) + IG-hashtag (nuevo) + TikTok-hashtag (existe) + TikTok-perfil
> (nuevo); cada par converge a su `Normalizar` → `Merge scrapes` (ya `append`). **Hallazgo del grilling:
> NO hacen falta actores nuevos** — `apify~instagram-scraper` soporta `searchType:hashtag` y
> `clockworks~free-tiktok-scraper` acepta `profiles`. Costo real = más corridas Apify (revisar
> presupuesto), no más actores. **Decidido:** IG-hashtag **descubre cuentas nuevas** (el doble gate
> filtra el ruido); keywords multi-palabra **colapsan a un hashtag** (`liderazgo efectivo →
> #liderazgoefectivo`). Subsume **#15 (TT-perfil) + #16 (multi-palabra) + #17 (IG-hashtag)**.
> **✅ CONSTRUIDO (2026-06-17, cierre 6).** 4 Apify (IG Reels/IG Hashtag/TikTok/TikTok Perfil), cada par
> a su `Normalizar` → `Merge scrapes`; `Asignar` matchea por cuenta y por hashtag en ambas plataformas;
> keywords multi-palabra colapsan. Subsume #15/#16/#17. **Falta sembrar Referentes TikTok** (hoy las 3
> son IG → el eje TikTok-perfil sale vacío) + V-run de validación.

15. **Scrapear Referentes de TikTok por perfil.** Hoy las cuentas con `plataforma=tiktok` se ignoran (el
    código las junta en `tt_handles` pero no las usa). Requiere un actor de perfil de TikTok en Apify.
    Sin esto, en TikTok solo se pueden seguir hashtags, no cuentas.
16. **Keywords multi-palabra.** La keyword se pasa como hashtag literal → una palabra (`liderazgo`)
    matchea, una frase con espacios (`liderazgo efectivo`) no. Mejora: tokenizar/mapear frases a
    hashtags o buscar también por texto. Mientras tanto: cargar Keywords como hashtags de una palabra.
17. **Instagram por tema/hashtag (descubrimiento).** Hoy IG solo trae lo de cuentas ya seguidas. Para
    descubrir cuentas nuevas por tema (no solo curar a las conocidas) habría que scrapear IG por hashtag
    además de por cuenta.
18. **Idioma: detección limitada + boost binario** (nodo `Heat-score v1` + `Config.boost_idioma`; ver
    también **#7**, que pide usar el `lang` de Supadata como fuente primaria de detección).
    - El **boost es binario**: español = 0, cualquier no-español = `+boost_idioma` (0.3 default). No
      distingue inglés/portugués/etc., los premia igual. Mejora: boost por idioma con pesos propios.
    - La **detección** (diccionario `DICT` de stopwords en `Heat-score v1`) solo conoce **es/en/pt/it/fr**.
      Un video en otro idioma (alemán, japonés…) cae a `es` por defecto y **no recibe boost**. Mejora:
      ampliar el `DICT` o detectar con librería/LLM. *(Premiar más fuerte lo no-español sí se puede ya,
      sin tocar código: subir `boost_idioma` en el nodo `Config`.)*
    - **🔒 Decidido (cierre 4):** **boost binario se queda** (cualquier no-español se premia, que es lo que
      pidió el jefe — O2); **ampliar la detección** (DICT/librería) para que más idiomas reciban boost en vez
      de caer a `es`. La detección queda **dev-only**; `boost_idioma` viaja a la tabla Ajustes (ver #19).
      **Límite estructural:** el boost corre sobre el caption **pre-transcripción** → Supadata-`lang` (#7) NO
      está disponible ahí; la detección del boost es caption-based por diseño. Pesos por idioma → post-MVP §5.
19. **No hay forma de que el equipo de redes ajuste los parámetros del scoring.** Hoy los knobs
    (`peso_views`/`peso_likes`/`peso_eng`, `boost_tema`, `boost_idioma`, `umbral_viral`, `top_n_fallback`
    y la lista de idiomas) viven en el motor: los pesos/boosts en el nodo `Config`, pero la lista de
    idiomas hardcodeada en el `DICT` del nodo `Heat-score v1`. Cambiar cualquiera requiere un dev
    editando n8n. **Puede quedar dev-only, pero debería ser fácil:** (a) sacar el `DICT` de idiomas a
    `Config` para que todos los knobs vivan en **un solo lugar obvio**; (b) idealmente, mover esos
    ajustes a una tabla **Ajustes** en Airtable (no-code, consistente con el resto del diseño) para que
    el equipo los toque sin depender de un dev. Mientras tanto, documentar dónde está cada knob.
    **🔒 Decidido (cierre 4): opción (b) — tabla Ajustes en Airtable.** El motor lee los knobs de una tabla
    clave→valor (incluidos los nuevos `min_views`/`min_likes` del piso duro, ver Q1). Núcleo de O11.
    **→ ADR nuevo + update del contrato `airtable-cockpit.md` + `setup-airtable.mjs`** (toca `core/`).

## Log de avance (más reciente arriba)

### 2026-06-17 (cierre 5) — V-run de ESTE repo validada + fix del no-transcript *(Mani + Claude)*

- **Validación end-to-end (decisión #1 HECHA).** La V-run corrió sobre el **motor de este repo** (no el viejo de
  cierre 4): Supabase `runs` 61b1b5d5, `estado: ok`, 9 min, `metricas {colectados:151, filtrados:10, outputs:9}`.
  El embudo real es `151 → (Pre-trim + Heat-score métrico, top_n=10) → 10 → (Gate) → 9`.
- **Análisis del output con credenciales vivas** (PAT Airtable + service_role Supabase — **a rotar**). Se leyó
  Airtable `Candidatos` (9) y Supabase `runs`/`outputs`/`processed_items` por API. Hallazgos:
  - **El gate funciona.** Comparado con el run viejo (4ad9d4cf, sin gate, top métrico = "Bionic Girlfriend",
    "fruit brainrot", heat >1.8), el run nuevo NO tiene esa basura. El gate dropeó **1 de 10**: `chris_stocks_`
    ("Feeding 500k rescue animals" con ChatGPT tangencial, IG, heat métrico 0.84) → drop **correcto** (viral pero
    off-topic). El composite re-rankea bien (verificado a mano: `0.7·sHaiku + 0.3·percentil`). Script literal en es.
  - **🐛 Hoyo del no-transcript (raíz de "3 sin script"):** Supadata no transcribió 3 videos → `script=''` →
    el Gate los **sacaba del lote** (`.filter(x => x.texto)`) → pasaban **sin juzgar** (`relevancia_score=null`).
    Uno (`tradingsharks` "Anthropic lanza Claude Fable 5") es hype que el criterio rechaza, y solo sobrevivió por
    no tener transcript. El fail-open tenía la dirección equivocada.
- **FIX (decidida con Mani — opción "mantener flageado"):** el nodo `Gate de relevancia` ahora **juzga el caption
  (`descripcion`) como fallback** cuando no hay script; los relevantes-sin-script se **mantienen** con
  `relevancia_razon` prefijada `[SIN TRANSCRIPT: juzgado por caption, revisar manual]` y los irrelevantes se
  **dropean** (antes pasaban ciegos). Editado por script (no a mano, por el escaping del JSON). **Smoke test 5/5**
  (4 casos reales del run) + **validador 927/0**. **SIN COMMIT** (working tree) y **sin V-run de re-validación**.
- **Timeout de IG (pregunta de Mani):** NO es timeout. Los nodos Apify son el community node
  `@apify/n8n-nodes-apify` op "Run actor and get dataset" → **espera al run, sin tope** (eso resolvió #6); no tienen
  campo `timeout`, el workflow no tiene `executionTimeout`, y el run cerró `ok` en 9 min. IG sale flaco por
  **referente-only** (`searchType:user`, 3 referentes) + ventana **7 días** + `ig_results_limit=8` + **competencia
  métrica** contra TikTok (`resultsPerPage:30` × 9 hashtags) en el `top_n=10` combinado. La palanca real = el
  **descubrimiento simétrico** (IG-por-hashtag). Knobs (no-código) si urge: subir `ig_results_limit`, ampliar
  `dias_recencia`, más referentes IG. Para confirmar volumen crudo de IG: contar el output de `Normalizar IG` o el
  dataset del actor en Apify.
- **Qué sigue:** cerrar lo de hoy (commit del gate + V-run de re-validación + rotar credenciales), después
  **#2-#6**. Orden y skills en §"Próxima sesión".

### 2026-06-16 (cierre 4) — Objetivos del MVP afilados + grill-me de cumplimiento *(Mani + Claude)*

- **Sesión de alineación, sin tocar código.** Se destiló el norte (ROADMAP §1 + realidad ADR-009/010) a
  **11 objetivos verificables (O1–O11)**, con O11 = **equipo-redes-friendly** (Majo/Jero operan casi solos,
  no-code) agregado a pedido de Mani. La rúbrica O1–O11 es el contrato de "cumple / no cumple" del motor.
- **Verificación contra el código real** (no la prosa): se leyeron los 30 nodos y los Code nodes clave
  (`Heat-score v1`, `Gate de relevancia`). **Hallazgos:**
  - El **boost de idioma corre sobre el caption ANTES de transcribir** (`guessLang(descripcion+bio)`), así
    que el `lang` de Supadata (#7) no está disponible en ese punto — la detección del boost es caption-based
    por diseño. Hay dos "idioma": el del boost (caption) y el de entrega (Supadata, en `Transcribir`).
  - La **señal O7 solo acredita IG**: `Heat-score` indexa `signal[username|idioma]` y `v_senal_seleccion`
    agrupa por `referente`. En TikTok-por-hashtag el `username` es quien posteó, casi nunca un referente
    sembrado → `sel=0`. El aprendizaje es ciego en TikTok hasta el descubrimiento simétrico.
  - **O9 confirmado:** `fresh.filter(!seen)` corta DESPUÉS del scrape → el dedup ahorra Supadata+Claude, no Apify.
- **`/grill-me` objetivo por objetivo → 6 decisiones lockeadas** (ver §"Próxima sesión" para el detalle
  ejecutable): postura validar-primero-barato · tabla Ajustes (#19/O11) · piso duro pre-enriquecimiento default
  0 (Q1) · señal bi-eje montada sobre el simétrico (O7) · ampliar detección de idioma binaria (#18/O2) ·
  idempotencia archivado antes de V3 (#2). **Ninguna ejecutada todavía** — son el trabajo de la próxima sesión.
- **🔴 La V-run que corrió Mani fue sobre un workflow VIEJO**, no el de este repo → el motor actual **sigue
  sin validar end-to-end** (O1/O7 en rojo de validación). Primer paso de la próxima sesión: re-importar ESTE
  motor y correr la V-run cheap.
- **Pendiente nuevo (prio ALTA):** dev-doc nodo-por-nodo del workflow + conexión Airtable + esquema de la base
  (cada tabla/campo). **Por escribir: 2 ADRs** (tabla Ajustes · señal bi-eje de aprendizaje).
- **Validación:** no aplica (cero cambios de código). Solo se editó este handoff.
- **Qué sigue:** ejecutar las 6 decisiones (empezando por la V-run real de validación) y **continuar el
  grill-me** sobre los objetivos que aún no se cubrieron rama por rama. Skills sugeridos: `/tdd` o builder Node
  para la tabla Ajustes + el piso duro; `/diagnose` si la V-run real rompe.

### 2026-06-16 (cierre 3) — Bugfix de orden en la V-run + refactor front-to-back *(Mani + Claude)*

- **Bug de ejecución (V-run real):** el primer Execute del motor reworkeado rompió en `Preparar outputs
  Supabase` con *"Node 'Abrir run en el registro' hasn't been executed"*. Causa: `Abrir run` colgaba en
  **paralelo** de `Config` como dead-end; n8n ejecuta las ramas en orden de conexión y `Leer Proyectos`
  iba primera → corría el pipeline entero (hasta `Preparar outputs`) **antes** de tocar `Abrir run` → la
  referencia `$('Abrir run…')` tiraba. (El error cosmético "Cannot assign to read only property 'name'"
  es un bug de n8n encima del real.) **Fix:** `Abrir run` pasa a **serie** entre `Config` y `Leer
  Proyectos`; como es `continueRegularOutput`, si Supabase falla igual pasa el item y el pipeline sigue
  (y trae `return=representation`, así `run_id` se puebla). Documentado en el CLAUDE.md del workflow.
- **Grilling `/grill-me` punta a punta** → decisiones lockeadas (todas ejecutadas salvo lo diferido):
  - **COLECTAR (post-V-run):** descubrimiento **simétrico**. Hallazgo clave: **no hacen falta actores
    nuevos** — `apify~instagram-scraper` soporta `searchType:hashtag` (IG-por-keyword) y
    `clockworks~free-tiktok-scraper` acepta `profiles` (TT-por-perfil). Diseño: 4 llamadas Apify (2 por
    plataforma) → cada una a su `Normalizar` → `Merge scrapes` (ya append). IG-hashtag **descubre cuentas
    nuevas** (el gate filtra el ruido). Keywords multi-palabra **colapsan a un hashtag**
    (`liderazgo efectivo → #liderazgoefectivo`). Subsume #15 + #17 + #16. Costo real = más corridas Apify.
  - **CALIDAD:** la Voz sigue como eje **opcional** del gate (Proyecto ⊕ Voz; vacía = solo Proyecto).
  - **ENTREGAR (hecho):** Candidatos ahora expone `relevancia_score` (juicio semántico limpio) +
    `relevancia_razon` (por qué pasó) — el gate los calculaba y los descartaba — y `thumbnail`
    (portada de Apify como attachment, para que el equipo escanee sin clickear afuera).
  - **Integridad Airtable (hecho en script/contrato/manifest):** fuera `link_doc` (ADR-009),
    `categoria` (el motor no clasifica), `min_likes`/`min_views` (el heat nunca los ponderaba — el
    contrato mentía), y los campos de generación de `Voces` (`few_shot`/`frase_credencial`/`cta`/
    `tratamiento`/`registro`/`pais_acento`, pausados por ADR-009). `fecha` → "Created time" nativo.
  - **Correctitud:** **#12** resuelto (`external_id` en `Preparar outputs Supabase` → el índice parcial
    `outputs_external_id_key` hace de backstop: en re-runs el POST 409ea, que es continue-on-fail, sin
    duplicado). #4 paginación + #5 tope dedup → **diferidos a pre-cron** (no muerden al volumen del piloto).
  - **Docs (#10) resuelto:** README + CLAUDE.md del workflow **reescritos al motor real** (Haiku
    traductor/jurado, doble gate, sin Sheets, sin categorías, Apify community node, orden de ejecución).
- **Aplicado a la base viva (por API, aditivo):** 3 campos creados en `Candidatos` (`relevancia_score`
  number/2, `relevancia_razon` long, `thumbnail` attachment). **Manual de Mani** (la API de Airtable no
  borra ni crea campos computados): borrar `link_doc`/`categoria`/`min_likes`/`min_views` + los de Voces,
  y crear `fecha` tipo "Created time".
- **Validación:** validador en verde (927; bajó de 933 por los campos quitados del manifest) · JSON +
  `jsCode` parsean (30 nodos) · smoke de los reemplazos (6 patches, 1 match c/u). **Falta la V-run** con
  los campos nuevos en vivo. **🔴 Rotar el PAT de Airtable** (re-expuesto en chat).

### 2026-06-16 (cierre 2) — Refactor de relevancia: Stage 4 (limpieza estructural) *(Mani + Claude)*

- **Verificación estructural (no hubo que tocar el `workflow.json`):** el flujo ya mapeaba limpio a las
  8 etapas de PLAN §2.4 — trazado nodo a nodo (COLECTAR→…→CALIDAD→ENTREGAR, NOTIFICAR n/a). **30 nodos,
  0 conexiones rotas, 0 huérfanos.** Único `merge` = **Merge scrapes** (`append`, une IG+TT sin índice);
  `mergeByPosition` = 0 (los eliminó Stage 3 Paso 1). Adaptadores de descubrimiento prolijos: `Armar plan`
  emite `ig_urls` (referentes) + `tt_hashtags` (términos) y `Normalizar IG`/`Normalizar TT` producen el
  **mismo `content_item`** (idénticas keys) → patrón enchufable ADR-007, sin generalizar de más. El
  `tt_handles` junta-y-no-usa es el gap #15 (pre-existente, flageado, no se toca por YAGNI).
- **Docs a la realidad (lo único que cambió):** PLAN §2.4 (tabla canónica) — CALIDAD deja de ser hueco
  ❌ (Gate Haiku), sale el substring `tema` de FILTRAR, GENERAR = script de texto sin Doc, NOTIFICAR =
  n/a; PLAN §2.3 (mapa del repo) — 30 nodos, motor ADR-009+010, sin Google. El manifest `workflow.yaml`
  ya coincidía desde Stage 0-3.
- **Stage 1 manual cerrado (verificado por PAT, read-only):** `criterios_relevancia` (*Long text*) existe
  en `Proyectos` **y** `Voces` de la base viva (`Reels Cockpit`); el piloto "IA y Productividad" tiene su
  criterio sembrado. La Voz provisional tiene el criterio **vacío** (opcional por diseño — sembrar en
  Stage 5 al calibrar el fit de cliente).
- **Validación:** validador en verde (933) + escaneo confirmó **0 secretos** (PAT/baseId) en el repo.
- **Qué sigue:** **Stage 5** = V-run + calibración (re-importar en n8n, llenar 3×`<ANTHROPIC_API_KEY>` +
  1×`<SUPADATA_API_KEY>`, correr, confirmar que el viral-irrelevante desaparece, calibrar
  `peso_relevancia`/pesos/rubric/ancho del embudo). **🔴 ROTAR el PAT de Airtable** (re-expuesto en chat).
  Deuda aparte: README/CLAUDE.md del workflow al template viejo (#10).

### 2026-06-16 (cierre) — Refactor de relevancia: Stages 1-3 *(Mani + Claude)*

- **Stage 1 (cockpit):** campo `criterios_relevancia` (texto largo) en `Proyectos` **y `Voces`**
  (`setup-airtable.mjs` + contrato `airtable-cockpit.md`); **creado en la base viva por API** en ambas
  tablas y **sembrado el piloto** "IA y Productividad". `Armar plan` lo lee (`criterios` del Proyecto +
  `voz_criterios` de la Voz del `voz_default`) y lo pasa en el plan. Decisión: **Proyecto = tema, Voz =
  cliente**; el gate combina ambos.
- **Stage 2 (filtrar/scorear):** nodo **Pre-trim relevancia** (Code + Haiku) cuela off-topic obvio sobre
  el caption **antes de transcribir** (laxo, fail-open, no descarta sin criterios). Sale el substring
  `tema` del `Heat-score v1` → prescore métrico limpio; `boost_tema` fuera de Config y del manifest.
- **Stage 3 (CALIDAD, el corazón) en 2 pasos** (la rama `fix/altos-auditoria` se perdió → se decidió
  reconstruir #7/#8 y montar el gate encima):
  - **Paso 1:** 9 nodos de enriquecimiento → **2 Code nodes** (`Transcribir (Supadata)`/`Traducir
    (Claude Haiku)`, `this.helpers.httpRequest`). `external_id` atado al item (#8), `lang` de Supadata
    primario con fallback sobre el transcript (#7), fail-open. Mata los merge-by-position.
  - **Paso 2:** nodo **Gate de relevancia** (Haiku estricto) sobre el transcript → dropea irrelevantes;
    `heat_score` = **composite** `peso_relevancia·semántico + (1-peso)·percentil(prescore)`. Knob
    `peso_relevancia` (0.7) en Config. Guarda `prescore_metrico`/`relevancia_score`/`relevancia_razon`
    en el item (la `razon` aún no se sube a Airtable → posible campo de cockpit futuro).
- **Validación:** validador en verde (933) en cada stage + **smoke tests de la lógica** de los 4 Code
  nodes nuevos (cuela/dropea, composite correcto, fail-open, passthrough es, sin-criterios pasa todo).
  Cadena final: `Heat-score → Transcribir → Traducir → Gate → Armar candidato` (30 nodos, 0 rotas, sin
  huérfanos). **CALIDAD dejó de ser hueco** en el manifest. Construido con builder Node (no a mano).
- **Qué sigue (otra sesión):** **Stage 4** (limpieza estructural — casi hecha: los merges ya salieron,
  falta dejar prolijos los adaptadores de descubrimiento) + **Stage 5** = la **V-run**: re-importar en
  n8n, **llenar 3×`<ANTHROPIC_API_KEY>` + 1×`<SUPADATA_API_KEY>`** (ahora son strings en Code nodes, no
  headers de HTTP node), correr, confirmar que el viral-irrelevante desaparece, y **calibrar**
  `peso_relevancia`/pesos/rubric/ancho del embudo con data real. **Rotar el PAT de Airtable** (expuesto).

### 2026-06-16 (noche) — Refactor de relevancia: grilling + Stage 0 *(Mani + Claude)*

- **Contexto:** V1 corrió end-to-end y pobló Candidatos (re-import tras el fix del timestamp IG, que
  asumía epoch cuando Apify manda ISO). Mani detectó el gap real: el ranking deja pasar
  viral-pero-irrelevante porque el heat-score juzga tópico por **substring** de keyword, sin mirar el
  contenido. Sesión `/grill-with-docs` completa.
- **Decidido (lockeado, ver [refactor-relevancia.md](./refactor-relevancia.md) + ADR-010):**
  descubrimiento = 2 ejes (referentes + términos); relevancia por **doble gate Haiku** (pre-trim
  amplio/recall en FILTRAR/SCOREAR + jurado estricto/precision en CALIDAD, que llena el hueco ❌);
  heat-score nuevo = **composite** semántico ⊕ métricas (sale el substring); criterios editables por
  el equipo en Airtable; gates **fail-open**; un solo workflow expresando las 8 etapas (ADR-006 +
  invariante #7).
- **Hecho (Stage 0, commiteado):** ADR-010 escrito · `context.md` afinado (Heat-score + Relevancia
  tópica/Utilidad/Criterios de relevancia) · **ambos manifests sincronizados a las 8 etapas
  canónicas** (creado el de archivado; reescrito el del motor) → **validador en verde** (resuelve #1
  de esta lista) · plan por stages escrito para continuar en sesiones distintas.
- **Qué sigue:** Stage 1 = campo `criterios_relevancia` en Airtable (Carril A, chico). Stages 2-4
  (intrusivos) van con builder Node + validación por re-import; **precondición: mergear primero
  `fix/altos-auditoria`** (trae #7 idioma + #8 merges, sobre los que construyen).

### 2026-06-16 — Altos #6(parcial)/#7/#8/#3 en rama `fix/altos-auditoria` *(Claude)*

- **Contexto:** mientras se cierra lo crítico (otra persona), se atacaron los Altos de **baja colisión**
  en un **worktree aislado** (`../pipeline-altos`, rama `fix/altos-auditoria`) para no pisar el motor en vivo.
  **#5 se difiere** hasta que #4 (paginación) cierre.
- **Hecho (rama, sin mergear):**
  - **#7 + #8:** enriquecimiento consolidado en 2 Code nodes (`Transcribir (Supadata)` + `Traducir (Claude
    Haiku)`) con `this.helpers.httpRequest`. Elimina los 6 nodos frágiles (Supadata HTTP + 2 Merge por
    posición + 2 Parsear + Claude HTTP). Mata el `mergeByPosition` (#8 — `external_id` queda atado al item)
    y usa el `lang` de Supadata como fuente primaria, con fallback que adivina sobre el transcript (#7).
    Misma llamada Anthropic (`claude-haiku-4-5`, `anthropic-version: 2023-06-01`) — no cambia modelo ni
    semántica (confirmado con el skill `claude-api`).
  - **#6 (parcial):** el run cierra como `degradado` si el heat no produjo items → el timeout de Apify se ve
    en el registro. **El async sigue pendiente** (es el fix obligatorio — ver #6, escaló a 🔴).
  - **#3:** corregida en §Decisiones 1a la justificación de Supabase (la dedup NO ahorra Apify).
- **Validación:** estructural OK (31 nodos, 0 conexiones rotas, sin huérfanos, `jsCode` async parsea).
  **NO probado en n8n** → requiere iteración en la V-run (norma del repo).
- **Qué toca hacer:** **mergear `fix/altos-auditoria` a `main` cuando lo crítico (#1/#2/#4) quede listo y
  commiteado**, luego `git worktree remove ../pipeline-altos`. La rama toca solo la etapa de enriquecimiento
  (entre Heat-score y Merge candidatos); no solapa con los nodos Apify (#6 async) ni con `outputs` (#12),
  así que el merge debería ser limpio. Tras mergear: probar en V-run.

### 2026-06-16 (tarde) — Apify async vía community node: bloqueante #6 resuelto *(Mani + Claude)*

- **Contexto:** Mani descargó de InstaPods la copia viva del workflow a `temp/` para trabajar sobre
  ella. Diff contra el repo: **estructuralmente idéntica** (35 nodos, mismas conexiones — el cable
  TikTok ya estaba; timeouts ya en 300000). Única diferencia: el live trae los **tokens reales**
  embebidos (Apify/Anthropic/Supadata) + IDs. → `temp/` agregado a `.gitignore` (traía secretos y no
  estaba ignorado). **Recordatorio:** rotar esas keys al cerrar pruebas.
- **Hecho:** resuelto el bloqueante #6. Mani instaló el community node `@apify/n8n-nodes-apify` en
  InstaPods. Los dos nodos Apify pasaron de HTTP `run-sync-get-dataset-items` (tope 300s) a
  `@apify/n8n-nodes-apify.apify` op **"Run actor and get dataset"** (espera al run, sin tope sync)
  en `Workflows/workflow-short-form-content/workflow.json`. Preservados nombre/id/posición y las
  expresiones `customBody` (IG con `onlyPostsNewerThan`; TT con hashtags) → conexiones intactas
  (validado: 0 rotas; `Armar plan → Apify IG/TT → Normalizar IG/TT`). El token salió de la URL → va
  en la credencial `apifyApi`.
- **Decisión:** community node sobre patrón async a mano (Mani lo prefirió y ya lo instaló). Schema
  confirmado del fuente del paquete (type `@apify/n8n-nodes-apify.apify` tv1, resource `Actors`,
  op `Run actor and get dataset`, `actorId`, `customBody`, cred `apifyApi`).
- **Convención nueva:** `temp/` (gitignored) = copia viva del workflow de InstaPods, fuente de las
  pruebas. No commitear (secretos).
- **Pendiente:** re-importar en InstaPods → asignar credencial Apify en los 2 nodos → verificar
  `actorId` (si aparece como dropdown/resourceLocator en vez de string, reseleccionar el actor) +
  `customBody` → **re-correr V1**. Si IG trae posts reales al `Merge scrapes`, #6 queda cerrado en
  vivo. Independientes y aún abiertos: paginación Airtable (#4), idempotencia archivado (#2).

### 2026-06-16 — V1 primera corrida del motor: debug en vivo *(Mani + Claude)*

- **Contexto:** primer Execute manual del motor B3 (parte de V1, backfill 180d). Tres síntomas
  encadenados, todos diagnosticados a partir del output real de los nodos:
  1. **Apify TikTok no recibía input** → faltaba el cable `Armar plan de corrida → Apify — TikTok`
     en el canvas (el `workflow.json` del repo ya lo trae en paralelo; la copia importada estaba
     desincronizada). **Mani lo dibujó.**
  2. **Normalizar TT no corría** → puro efecto dominó del #1.
  3. **`Asignar proyecto+voz` frenaba con output vacío** → no era match de proyecto: el único ítem
     que llegaba venía **vacío y sin `url`**, y el nodo descarta `if (!d.url) continue`. La causa del
     ítem vacío era el nodo Apify IG: **timeout a los 120 s (`ECONNABORTED`)** con
     `run-sync-get-dataset-items` → con `onError: continueRegularOutput` + `alwaysOutputData` deja el
     objeto de error como 1 ítem, que `Normalizar IG` mapea a campos vacíos. (Esto es el ítem **#6**
     de la auditoría, ahora confirmado en vivo.)
- **Hecho:** timeout de los dos nodos Apify subido **120000 → 300000 ms** en `workflow.json`
  (techo útil del endpoint sync de Apify). Verificado que la **config de Airtable está sana** (el
  output de `Armar plan de corrida` muestra 1 proyecto activo, voz linkeada, 9 keywords, 3 handles IG).
- **Pendiente:** re-correr V1 con los dos fixes (cable TikTok + timeout 300s) y confirmar que llegan
  posts reales al Merge. Recordatorios ya trackeados: `deploy.mjs` obsoleto/crashea con los nombres de
  nodo viejos (#11), referentes de TikTok sin usar (#15).
- **🔴 BLOQUEANTE para V1 (actualización tarde 2026-06-16):** subir el timeout a 300000 **no alcanza** —
  el run de IG dura **6-7 min** y el endpoint `run-sync-get-dataset-items` de Apify topa a 300 s. El motor
  no puede traer scrapes con el patrón sync actual. **Hay que migrar los dos nodos Apify a patrón async
  antes de que V1 pueda correr** (ver #6 para el detalle de endpoints). Es el próximo paso real del carril B.

### 2026-06-16 — Carril C completo: C2 + C3 ✅ *(Dev 3)*

- **Hecho:** workflow de archivado C2 corriendo en producción y verificado.
  - Dev 3 creó su propia cuenta de **Google Cloud Console** para obtener las credenciales OAuth2
    que n8n self-hosted requiere (Client ID + Client Secret).
  - Configuró la app OAuth: tipo "Web application", redirect URI de n8n como URI autorizado,
    habilitó **Google Sheets API** y **Google Drive API** (desactivadas por defecto en GCP).
  - Resolvió error **403 `access_denied`**: la app estaba en modo Testing sin usuario de prueba
    → solución: agregar `danieltovartech@gmail.com` como test user en la pantalla de consentimiento.
  - Nodo `Append al Sheet Histórico` quedó con credencial OAuth2 activa (tick verde en n8n).
  - **Corrida manual exitosa:** candidato calificado → archivado en Supabase + fila en Google Sheet
    "Histórico" + record borrado de Airtable.
- **C3 ✅:** tracking verificado — `v_selecciones_por_dia` responde con datos post-corrida.
- **Carril C cerrado.** Todos los tasks C1–C3 en ✅.
- **Gotcha — GCP en créditos gratuitos ($300 USD):** Dev 3 usó créditos de prueba de GCP que
  eventualmente se agotan. Google Sheets API y Drive API son gratuitas en volumen MVP (no generan
  costo por sí solas), pero si el proyecto GCP de Dev 3 tiene otras cosas corriendo o si Google
  empieza a cobrar por algo, los créditos se consumen. **Acción futura:** antes de que se agoten,
  mover el OAuth client a la cuenta/proyecto GCP permanente de la agencia (es solo exportar las
  credenciales y reemplazarlas en n8n — 10 min).

### 2026-06-15 — C2: primera corrida bloqueada por Google Sheets OAuth *(Dev 3 + Claude)*

- **Hecho:** corrida manual ejecutada en n8n. Todos los nodos anteriores al Sheet pasaron OK
  (Config, Supabase, Airtable). Fallo en `Append al Sheet Histórico`: `"Unable to sign without
  access token"`. Causa raíz: la credencial Google Sheets OAuth2 tiene Client ID y Client Secret
  vacíos/incorrectos — se llenó el campo "Client ID" con un email de Gmail, que NO es lo que
  pide el formulario.
- **Por qué:** n8n self-hosted requiere que creés tu propia app OAuth en Google Cloud Console para
  poder autenticar con Google APIs. No alcanza con "Sign in with Google" directo — primero hay que
  crear el Client ID/Secret en GCP.
- **Dev 3 no tiene acceso a la cuenta de GCP.** Todo lo demás está listo. Quien tenga acceso puede
  desbloquear esto en ~15 minutos siguiendo el step-by-step de abajo.

#### ⚙️ MISE EN PLACE — Quien tiene GCP: hacé esto para desbloquear C2 (~15 min)

**Qué necesitás:** acceso a la cuenta de Google Cloud Console de la agencia.

**URL de callback de n8n** (la necesitás en el paso 3):
```
https://workflow-shortform-content.nbg1-5.instapods.app/rest/oauth2-credential/callback
```

**Paso 1 — Habilitá las APIs en GCP**
1. Andá a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta de la agencia
2. Seleccioná el proyecto (o creá uno nuevo, ej: `n8n-reels`)
3. "APIs & Services" → "Library"
4. Buscá **"Google Sheets API"** → Enable
5. Buscá **"Google Drive API"** → Enable

**Paso 2 — Configurá la pantalla de consentimiento OAuth**
1. "APIs & Services" → "OAuth consent screen"
2. User Type: **External** → Create
3. App name: cualquiera (ej: `n8n pipeline`)
4. User support email: email de la agencia
5. "Save and Continue" en todos los pasos siguientes
6. En el paso **"Test users"** → agregá `DanielTovarTech@gmail.com`
7. Guardá

**Paso 3 — Creá el OAuth Client ID**
1. "APIs & Services" → "Credentials" → "+ Create Credentials" → "OAuth client ID"
2. Application type: **Web application**
3. Name: `n8n` (o cualquiera)
4. En **"Authorized redirect URIs"** → agregá exactamente:
   ```
   https://workflow-shortform-content.nbg1-5.instapods.app/rest/oauth2-credential/callback
   ```
5. "Create" → copiá el **Client ID** (termina en `.apps.googleusercontent.com`) y el **Client Secret**

**Paso 4 — Completá la credencial en n8n**
1. En n8n → "Credentials" → buscá "Google Sheets account" (la que creó Dev 3)
2. **Client ID** → pegá el código que termina en `.apps.googleusercontent.com`
3. **Client Secret** → pegá el secret
4. Guardá → **"Sign in with Google"** → autorizá con `DanielTovarTech@gmail.com`
5. Debería quedar con un tick verde de conexión exitosa

**Paso 5 — Avisale a Dev 3**
Dev 3 ya tiene el candidato de prueba y el workflow listo. Solo necesita que le confirmes que la
credencial quedó autorizada (tick verde) para correr Execute Workflow y completar C3.

> **Importante:** si la pantalla de consentimiento queda en modo "Testing", la autorización vence
> cada 7 días. Para producción publicar la app (o agregar todos los usuarios necesarios como test
> users). Para el MVP con 1–3 usuarios, modo Testing alcanza.

### 2026-06-15 — Carril C: C2 desplegado en n8n *(Dev 3 + Claude)*

- **Hecho:** C2 completamente configurado y listo para correr.
  - Credenciales recibidas de Alejo/gestor: `supabase_url`, `service_role_key`, `airtable_PAT`,
    `baseId`, `instance_id`.
  - Nombre de pestaña del Sheet confirmado: `Historico` (sin tilde) — corregido en todo el HANDOFF
    (antes decía `Sheet1`).
  - `Workflows/workflow-archivado/workflow.json` importado en n8n (reemplaza el import anterior de
    Dev 3, que era inferior — 11 nodos vs 16).
  - Nodo **Config** completado con los 5 valores: `AIRTABLE_BASE_ID`, `SUPABASE_URL`,
    `INSTANCE_ID`, `GOOGLE_SHEET_ID`, `NOMBRE_PESTANA_SHEET=Historico`.
  - Credenciales asignadas en n8n: `Airtable PAT`, `Supabase Registro`, Google Sheets OAuth2.
  - `004_historico_script_texto.sql` aplicado en Supabase (ya estaba, confirmado por Alejo).
  - Dev 3 tiene acceso directo a Supabase (dashboard + SQL Editor).
- **Pendiente:** corrida de prueba manual (C3) → calificar 1 candidato en Airtable → Execute
  Workflow → verificar fila en Sheet + `v_selecciones_por_dia` + candidato borrado de Airtable.
  Luego activar cron diario.
- **Gotcha:** las credenciales reales (Supabase service_role key + Airtable PAT) se compartieron
  en el chat en esta sesión — **rotarlas** antes de la corrida en producción (igual que pasó con el
  PAT de sesiones anteriores). Nada de secretos en chat: van al gestor compartido.

### 2026-06-15 — Carril C: archivado construido (C2) *(Alejo + Claude)*

- **Hecho:** workflow de archivado **C2** creado en
  [`Workflows/workflow-archivado/`](./Workflows/workflow-archivado/) (`workflow.json` + README) —
  16 nodos, **valida estructural** (JSON ok · 15 conexiones a nodos existentes · sin huérfanos ·
  todos los `jsCode` parsean). Flujo: cron diario → Config → Abrir run → leer Proyectos/Voces (mapa
  id→nombre) → leer `Candidatos` con `calificacion` → IF ¿hay? → Armar filas → `outputs` Supabase
  (continue-on-fail) → append Sheet → borrar de Airtable (batch 10) → cerrar run.
  **`004_historico_script_texto.sql`** creado: la vista del histórico expone el **texto** del script
  (`contenido_o_link`) en vez de `link_doc`.
- **Decisiones de diseño (registradas en el README):** (1) **idempotencia por borrado** + índice
  único parcial como backstop — **no** se usa upsert `on_conflict` porque el índice de
  `outputs.external_id` es parcial y PostgREST no lo soporta limpio; (2) **orden**: el Sheet NO es
  continue-on-fail → si falla, corta **antes** de borrar de Airtable (no se pierde curación);
  (3) `proyecto`/`voz` son links en Airtable → se resuelven leyendo Proyectos/Voces (id→nombre).
  **Decisiones #1 (mantener Supabase) y #2 (script texto) cerradas** — ver §arriba.
- **C1 ✅** — Sheet "Histórico" ya existía con las 13 columnas exactas (pestaña `Historico` — sin
  tilde, confirmado por Dev 3). `sheet_id` y `sheet_tab=Historico` → al gestor.
- **`004` ✅ aplicado** en Supabase (2026-06-15, por Alejo en el SQL Editor) → `v_historico_seleccionados`
  ya expone `script` (texto).
- **Pendiente para terminar C (todo en n8n — lo retoma Alejo en la próxima sesión):**
  1. Importar `Workflows/workflow-archivado/workflow.json`, completar el nodo **Config** (`base_id`,
     `supabase_url`, `instance_id`, `sheet_id`, `sheet_tab=Sheet1`) y mapear la **credencial OAuth de
     Google Sheets** (única dependencia de Google del pipeline → configurar test user del OAuth).
  2. **C3** — corrida de prueba: calificar 1 candidato → ver fila en el Sheet con su script, salir
     de Airtable, y `v_selecciones_por_dia` responder. Luego activar el cron diario.
- **Gotcha para el que siga:** el workflow es JSON sin correr (validado solo estructural) → probable
  iteración en la primera corrida real, sobre todo el nodo *Append al Sheet* (autoMap exige que los
  encabezados del Sheet coincidan **exactos** con las keys que emite *Preparar filas Sheet*). Sin
  paginación: lee 1 página (≤100 calificados/corrida) — suficiente con cron diario.

### 2026-06-14 (tarde) — Verificación carril A + semillas piloto *(Mani + Claude)*

- **Verificado por API (read-only) el estado real de A:** Supabase **schemas 001+002+003 aplicados**
  (las 8 tablas/vistas responden; `workflows` con 2 seeds) → **A2 ✅**. Credenciales Supabase
  (URL+service_role) y Airtable (PAT+baseId) **funcionan**. Airtable: 5 tablas existían pero
  **vacías**.
- **Sembrado (A4 + A9 provisional):** insertado en Supabase **cliente `piloto` + instancia**
  (`instance_id` generado → va en el nodo **Config** de n8n; es un ID, no se commitea). En Airtable:
  **Proyecto "IA y Productividad"** (`activo`, `dias_recencia=180` = backfill 1ª corrida, `top_n=15`),
  **1 Voz** provisional, **9 Keywords** multiidioma (es/en/pt/it/fr → hashtags TikTok), **3
  Referentes IG** (garyvee/thedankoe/openai, marcados "provisional — verificar/cambiar"). El motor
  ve 1 proyecto activo / 9 kw / 3 ref / 1 voz con el filtro `{activo}`.
- **Pendiente para V1 (primera corrida real):** **B4** en n8n (importar + Config con `instance_id` +
  credenciales `Airtable PAT`/`Supabase Registro` + pegar keys Apify/Anthropic/Supadata) · **B1**
  TZ del InstaPods · **B5** error workflow. Luego Execute manual = backfill 180d → candidatos en
  Airtable. Tras validar, bajar `dias_recencia` a 7 (semanal).
- **Aviso:** el PAT de Airtable se expuso en chats → **rotarlo** (la base ya existe). Faltan los
  pasos manuales de Airtable (campo `fecha_calificacion` tipo *Last modified time* sobre
  `calificacion`, vista 🔥 `estado=aprobado` orden `heat_score` desc, accesos Majo/Jero) — los hace
  el equipo/Alejo; no bloquean la corrida del motor pero sí la curación/tracking.

### 2026-06-14 — Rework B3: motor de reels construido *(Mani + Claude)*

- **Hecho:** `workflow.json` **rehecho de cero** (builder Node, no a mano) al motor ADR-009 —
  35 nodos, valida estructural (JSON ok · sin conexiones rotas · todas las expresiones `={{…}}`
  evalúan · `jsCode` parsea). Flujo: **Config** (base_id/supabase_url/instance_id + pesos) →
  **leer Airtable** (Proyectos/Voces/Keywords/Referentes) → **Armar plan** → **Apify** IG+TT →
  Normalizar (+`external_id`) → Merge → **Asignar proyecto/voz** → **heat-score v1** (percentil
  views/likes/eng × boosts tema/idioma/selección; `flag_viral` marca; top_n por proyecto) →
  **recencia 2 capas** (Apify `onlyPostsNewerThan` + guardia por `dias_recencia` del proyecto) →
  **dedup** vs `processed_items` → **Supadata** transcribe → **IF idioma=es** (passthrough) /
  **Claude Haiku** traduce literal (`claude-haiku-4-5`, sin thinking/effort) → **candidatos a
  Airtable** (batch 10) + **registro Supabase** (runs/outputs, schema 003) + insert
  `processed_items`. Manifest (`workflow.yaml`) reescrito al estado nuevo; banner de "desactualizado"
  en README; `CLAUDE.md` actualizado.
- **Decisiones de la sesión (con Mani):** Opción A (transcribir/traducir los top_n del heat antes
  de entregar, no post-selección — los videos vienen en muchos idiomas y el equipo no entendería
  sin traducir) · Claude = **Haiku** y **solo traduce si NO es español** · cron **semanal** por el
  presupuesto Apify free ($5/mes) · **sin Google Doc** (script = campo de texto) · **Form trigger
  eliminado** (Airtable es la única config). Las 4 decisiones estructurales → §arriba.
- **Pendiente/abierto:** **B4** (pegar en n8n: keys Apify/Anthropic/Supadata como placeholders
  `<…>` + credenciales `Airtable PAT` y `Supabase Registro`) · **editar nodo Config** tras importar
  (base_id, supabase_url, **instance_id** — confirmar A4 con Alejo) · **B1** confirmar TZ del
  InstaPods · **B5** error workflow · **V1–V6** validación en vivo (probable iteración: es JSON sin
  correr) · reescribir README (quedó banner) · cerrar las 4 decisiones de arriba.
- **Gotcha para el que siga:** secretos van como placeholders `<APIFY_TOKEN>`/`<ANTHROPIC_API_KEY>`/
  `<SUPADATA_API_KEY>` en los nodos HTTP (se pegan en n8n), y Airtable/Supabase como **credenciales
  nativas de n8n** (`airtableTokenApi` "Airtable PAT", `supabaseApi` "Supabase Registro"). El
  `baseId`/`supabase_url`/`instance_id` se editan en el nodo **Config** (no son secretos pero son
  IDs → no se commitean: quedan como `<<…>>`).

### 2026-06-13 — Carril A: Supabase + base Airtable creada *(Alejo + Claude)*

- **Hecho:** ubicada la key de Supabase (ojo: con el renombrado de Supabase, la **publishable**
  key = vieja `anon` (respeta RLS, NO sirve); la que va a n8n es la **Secret key** `sb_secret_…`
  = equivalente al `service_role`, o el `service_role` legacy si el proyecto lo tiene) ·
  **base Airtable "Reels Cockpit" creada** con `setup-airtable.mjs` → **`baseId` (en el gestor)**
  (5 tablas + links OK).
- **Gotcha confirmado (era riesgo, ahora es hecho):** Airtable **ya no permite crear campos
  `lastModifiedTime` por API** (`422 UNSUPPORTED_FIELD_TYPE_FOR_CREATE`). El script lo previó y no
  se cayó. → **`Candidatos.fecha_calificacion` hay que crearlo a mano**: tipo "Last modified time",
  monitoreando SOLO el campo `calificacion` (si no, ensucia el tracking de selecciones).
- **Pendiente del carril A (manual, no bloquea a otros carriles salvo A10):**
  1. Campo `fecha_calificacion` a mano (arriba).
  2. Vista **"🔥 Seleccionados"** en `Candidatos` (filtro `estado=aprobado`, orden `heat_score` desc).
  3. **A8** acceso editor a Majo y Jero.
  4. **A9 semillas EN PAUSA** — el nicho/voz provisional no se definió en sesión; sigue atado a
     **M0.3** (el jefe no dio voz/proyecto). El piloto usa IA/productividad pero solo con referentes
     en español → faltan referentes EN/PT/IT/FR (prioridad del jefe). Retomar al sembrar.
  5. Confirmar que **A2 (schemas 001–003)** y **A4 (cliente/instancia → `instance_id`)** quedaron
     corridos en Supabase (la sesión no lo verificó).
  6. **A10** — entregar a Mani (B) y Dev 3 (C) por el gestor: `supabase_url` + secret key +
     `instance_id` + `baseId` + PAT de Airtable.
- **Seguridad:** el PAT de Airtable original se expuso en el chat de trabajo → **se debe revocar y
  regenerar** uno nuevo para n8n (la base ya está creada, el viejo no hace falta). El gestor
  compartido **sigue sin definirse** (hueco real de M0.2; por ahora Alejo lo guarda local).

### 2026-06-12 — Fundación: norte del jefe + repo consolidado *(Mani + Claude)*

- **Hecho:** visto bueno del jefe procesado → [ADR-009](./docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md)
  (scripts literales/traducción, multiidioma, histórico exportable, link por script, aprendizaje
  → scoring) · schema [`003`](./core/schema/003_seleccion_e_historico.sql) (idioma, calificado_en,
  vistas de histórico/selecciones/señal) · cockpit Airtable actualizado (campos `idioma`,
  `link_doc`, `fecha_calificacion` + vista 🔥; `setup-airtable.mjs` los crea) · heat-score v1
  definido (ROADMAP §1) · consolidación de docs: blueprint/runbook/MEJORAS/HOSTING/one-pager-jefe
  absorbidos en README+ROADMAP+PLAN+ADRs (~900 líneas menos) · PLAN.md adelgazado: la tabla
  D1–D7 ahora apunta a los ADRs (dueños del porqué), §2.2 apunta al SQL, F0/F1 cerradas, F2
  delega al ROADMAP, costos refrescados (~$7–8/mes con InstaPods) · pasada de integridad:
  diagrama y etapas canónicas de PLAN al estado ADR-009 (destino = Airtable, heat v1,
  traducción literal), estructura real del repo en §2.3, dependencia C2→B1 explícita en
  ROADMAP, y **one-pager v2** con la visión aprobada (la v1 presentada quedó en git).
- **Decisiones de la sesión:** formato del script flexible (Doc = default, lo innegociable es el
  link) · reach no existe en scrapers → proxy `engagement_rate` (en la fórmula) · voces = registros
  de Airtable editables por el equipo cuando quieran · equipo de redes se llama **Majo y Jero**.
- **Pendiente/abierto:** voz/proyecto inicial sin definir por el jefe (M0.3, no bloquea) ·
  presupuesto techo sin validar (PLAN §3.2) · Dev 2 y Dev 3 sin nombre asignado en el tablero.
- **Gotcha para el que siga:** el `workflow.json` actual es el template VIEJO (genera en voz) —
  el rework B3 lo cambia; no "arreglar" el template viejo, rehacerlo según ROADMAP carril B.
