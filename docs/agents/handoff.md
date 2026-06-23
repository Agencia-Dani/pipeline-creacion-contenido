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

**2026-06-23 (cierre 18) — Run de Fase 3 DIAGNOSTICADO = éxito + bug fan-out×dedup encontrado y arreglado (Mani + Claude).** Mani corrió el run de Fase 3 (2 proyectos *parejas*+*empresas*, `top_n=10`, `dias=200`, referentes compartidos) y subió outputs + los 3 outputs HTTP (`POST-processed-items`/`POST-airtable`/`cerrar-run`). **El primer intento salió SIN scripts (0/20 transcripción): NO fue Supadata ni créditos, fue la `SUPADATA_API_KEY` sin llenar** — Mani la puso y re-corrió. **Run con key VERIFICADO punta a punta:** transcripción ✅ 19/20 (el vacío = fail-open normal, video sin voz); script ES ✅ 19/20 (Haiku literal); **fan-out ADR-013 ✅** (el video compartido `7629904064448449814` entra a `Asignar` por los 2 proyectos; queda 1× en candidatos finales — el gate filtró la copia de *empresas* — grado 1 funciona; 6 parejas + 4 empresas, sin `external_id` dup en el resultado); **recencia 200 ✅** (normalize trae TikTok all-time 2021→2026 + 4 IG viejos, pero el corte capa 2 en `Asignar` los elimina: `Asignar` 304 y pretrim 264 tienen 0 fuera de 200d); **embudo** `360 → 304 asignados → 264 pretrim → 20 heatscore (top_n 10×2) → 10 gate → 10 candidatos`, cruza exacto con `runs.metricas`. **🐞 BUG NUEVO encontrado y ARREGLADO — fan-out × dedup #5:** el run escribió **0 `processed_items`** (debía ~20). Causa: `POST processed_items` mandaba `Prefer: resolution=ignore-duplicates` pero **sin `on_conflict` en la URL** → PostgREST hacía INSERT plano y la `unique(platform, external_id)` (schema 002:25) tiraba 409; el **fan-out mete el video compartido 2× en el mismo batch** (Heat-score 20 filas / 19 únicos) → duplicado intra-batch → batch entero rebota → `onError continueRegularOutput` se traga el 409 → 0 registrados. El V1 no lo pegó (1 proyecto = sin duplicado intra-batch). **Consecuencia:** sin fix, la próxima corrida incremental no se salta ningún video → re-transcribe todo → re-paga Supadata+Claude, justo en multi-proyecto que es el modo por defecto. **FIX aplicado** (`workflow.json:706`, builder/convención): `?on_conflict=platform,external_id` en la URL → ahora emite `INSERT … ON CONFLICT (platform,external_id) DO NOTHING` (tolera intra-batch Y cross-run); mismo patrón que archivado nodo 11 y `Reportar outputs` (fix D3 cierre 14); cumple lo que el schema 002:30 ya documentaba. Diff 1 línea, validador **1143/0**. **SIN COMMIT, FALTA RE-IMPORT + Execute** para verificar `processed_items` poblado (~19 filas, compartido 1×). **Limpieza DB pre-redo** (Mani eligió "solo Fase 3"): borrados 10 Candidatos Fase 3 + su fila `runs`; V1 intacto (6 candidatos, run, 10 `processed_items`). **Núcleo del motor validado end-to-end (V1 + Fase 3); lo que falta para producción quedó consolidado en §Próxima sesión.** Credenciales **A ROTAR** (re-expuestas).

**2026-06-23 (cierre 17) — V1 en vivo DIAGNOSTICADO = éxito + Fase 2 y código de Fase 3 hechos (Mani + Claude).** Mani corrió el V1 (1 proyecto, `top_n=10`, `dias=200`→en realidad la corrida fue con `dias=75`, `boost_idioma=1`) y subió los outputs de todos los nodos a `outputs/` + el de `Armar plan de corrida`. **Revisión punta-a-punta sobre los JSON + Supabase (PAT/service_role inline, A ROTAR).** **Embudo:** `120 IG + 80 TT → 202 normalizados → 160 asignados → 99 pre-trim → 10 heat-score → 6 gate → 6 candidatos`; cruza EXACTO con `runs.metricas` (`{colectados:202,asignados:160,pretrim:99,filtrados:10,gate:6,outputs:6}`) → **instrumentación cierre 15 verificada en vivo.** **VERIFICADO ✅:** **F3 resuelto** (3 referentes IG, `bayavoce=40/howtoconvince=40/jefferson_fisher=39`, monopolio muerto — el fix cierre 14 + cupo por-referente #24 funcionaron); **F2** IG-hashtag devolvió `no_items` (apagado, hard-coded en `Armar plan`: línea `ig_hashtags.push` removida, toggle `tg_ig_kw` ignorado); **TT-perfil** vacío (0 referentes TT); **recencia** (TT all-time 2021→2026 cortado a recientes en `Asignar` capa 2; IG ya filtra en origen); **pre-trim** tira `#fyp/#viral` sin sustancia, deja lo sustantivo; **transcripción 9/10** (campo `transcripcion` en el nodo Transcribir, `script` se rellena en Traducir — solo el no-inglés `ot` falló); **gate** scores reales 0.65–0.9, razones ES on-topic, dropea off-topic (`diaryofasalesgirl`); **boost idioma O2** los 6 candidatos finales son TODOS inglés (`boost_idioma=1`→×2); **atribución bi-eje** referente (`tema=''`) + keyword (`tema=relationships/communication`); **ADR-014 verificado en vivo** (tabla `outputs`=0 filas, el motor ya no escribe draft); **sin runs zombie**, `processed_items=10`. **NO se pudo verificar (no es falla, es setup):** fan-out ADR-013 (1 solo proyecto activo en el run), paginación #4 (tablas config <100 filas — quizá nunca se ejerce salvo `Candidatos`>100 en el archivado), dedup #5 (`processed_items` arrancó vacío). **Veredicto: el V1 es un éxito, no hay bugs que bloqueen.** **Fase 2 hecha:** guard de stubs en `Normalizar IG` (descarta sin `id/shortCode` ni `url`) y `Normalizar TT` (sin `id` ni `webVideoUrl`) — los stubs `{error:"no_items"}` (IG-Hashtag vacío) y `{}` (TT-Perfil vacío) ya no generan fila basura (probado contra los outputs reales: stubs dropeados, 0 reales afectados). Builder Node (convención CLAUDE.md), diff 2 líneas/2 nodos. **Código de Fase 3 hecho:** campos muertos `Referentes.seguidores`+`flag_viral` sacados de `airtable-cockpit.md` + `setup-airtable.mjs` (confirmado muertos: motor solo hace GET a Referentes, en la base viva los 7 están `null`; el contrato MENTÍA con "lo llena el motor"); `workflow.yaml` corregido `flag_viral`→`viral_por_tamano`. Validador **1116/0**. **Mani armó la config del próximo run (Fase 3):** 2 proyectos activos (*Comunicación de parejas* + *Comunicación en empresas*), ambos `top_n=10`/`dias=200`, con referentes compartidos. **Próxima sesión = diagnosticar ESE run** (ver §Próxima sesión). **TODO/Airtable:** `fecha`=createdTime, `link_doc`, restos de Voces YA hechos; falta borrar en UI `Referentes.seguidores`+`flag_viral` (la API no borra campos). Credenciales **A ROTAR**.

**2026-06-23 (cierre 16) — Fase 0 (artefacto final) hecha:** #14 metadata template limpia, #11 deploy.mjs deprecado, #20 = **ADR-014** (motor deja de escribir `outputs` por-item, 37→35 nodos), docs resync a 35. Validador 1107/0. Commit `41f06a5`. **Detalle en §Plan a producción.**

**2026-06-23 (cierre 15) — 4 mejoras pre-cron de código aplicadas: #4 paginación, #5 dedup acotado, instrumentación de descartes, F2 IG-hashtag apagado (Mani + Claude).** Sesión de código en **ambos** workflows. **Sin commit aún** (working tree); validador **1098/0**; **NO corrió en vivo — falta re-import + Execute** (Mani verifica ahí; la paginación de n8n no se puede probar localmente). Diffs quirúrgicos: motor 81+/9-, archivado 8 líneas (el archivado se editó por replace de texto crudo para no reexpandir su formato compacto). **(1) #4 Paginación Airtable** — `options.pagination` (modo `updateAParameterInEachRequest`, query `offset`={{`$response.body.offset`}}, completa cuando `!offset`) en las 4 lecturas del motor (`Leer Proyectos/Voces/Keywords/Referentes`) y las 3 del archivado (`Leer Proyectos/Voces/Candidatos calificados`). Los consumidores agregan **todas las páginas**: motor `recs` helper → `$(n).all().flatMap(it => it.json.records||[])`; archivado `Armar filas` igual para Candidatos/Proyectos/Voces. Robusto a 1-item-por-página **o** item único (flatMap cubre ambos). El `IF — hay calificados` del archivado no necesita cambio: `Armar filas` es Code run-once-for-all → corre 1× aunque pasen varias páginas. **Resuelve el truncado silencioso a 100 records.** **(2) #5 Dedup acotado** — `Leer procesados` ya no trae `limit=20000`; la URL arma `external_id=in.(<ids de la corrida>)` desde `$('Pre-trim relevancia').all()` (corre antes). Mismo resultado de dedup, query chica → no re-paga Supadata/Claude al escalar `processed_items`. IDs (shortcodes IG / numéricos TT) no necesitan comillas en PostgREST. **(3) Instrumentación de descartes** — `console.log` en Pre-trim (`[Pre-trim] descartados off-topic: n/total -> ids`) y Gate (`[Gate] DESCARTE pid=… id=… score=… motivo=irrelevante|score<min|sin-juicio :: razon`). Visible vía `journalctl -u n8n` (no la pestaña Logs, que esta versión no muestra — mismo patrón que `Transcribir`). Además el embudo entero entra a `runs.metricas`: ahora `colectados/asignados/pretrim/filtrados/gate/outputs` (antes solo colectados/filtrados/outputs) → visible en Supabase sin tocar logs. **Habilita calibrar pesos/rubric viendo qué se tira.** **(4) F2 IG-hashtag apagado** — en `Armar plan` se quitó `if (p.tg_ig_kw) ig_hashtags.push(kk)` (queda comentario): `ig_hashtags` siempre vacío → el Apify IG Hashtag recibe 0 URLs y no trae nada; **TikTok-hashtag intacto**. Reversible (re-agregar la línea) y soft (el toggle por-proyecto sigue existiendo, solo se ignora). **Pendiente:** commit + re-import + Execute para verificar en vivo (paginación, dedup acotado, métricas del embudo, IG-hashtag en 0). **Mani pidió plan mode para atacar el handoff completo y dejar motor + archivado en versión final de producción** (ver §Próxima sesión + §Mejoras). Credenciales Airtable/Supabase **siguen a ROTAR**.

**2026-06-19 (cierre 14) — F3 resuelto (era bug de código), fan-out multi-proyecto (ADR-013) + D3 cerrado (Mani + Claude).** Sesión de código de motor. Commit `76ea422` en `main` (validador 1098/0). **El motor NO corrió en vivo: falta re-import + Execute en n8n.** **F3 RESUELTO ✅ — la causa NO era datos ni Apify, era un bug de `Armar plan de corrida`.** Pista de Mani: las 2 cuentas con 0 reels (@jefferson_fisher, @howtoconvince) tienen contenido reciente y están ligadas a **varios** proyectos; @bayavoce a uno solo (el activo). Causa raíz: `Leer Proyectos` filtra `activo` → el dict `projects` solo tiene el proyecto activo; los loops de referentes/keywords tomaban `f.proyecto[0]` (el **primer** proyecto ligado) → si ese primero está inactivo, `projects[proy]` es `undefined` → `return` → **el referente nunca se mandaba a Apify**. jefferson lista líderes (inactivo) primero, howtoconvince lista empresas (inactivo) primero → ambos descartados; bayavoce lista parejas (activo) → único que pasaba. **Fix 1:** ambos loops iteran **todos** los proyectos ligados y suman a cada activo. Resuelve F3 para cualquier config. **Fan-out multi-proyecto (ADR-013, decisión de grilling):** Mani pidió que el motor sirva para cualquier combinación de Proyectos/Voces/Keywords activos manteniendo coherencia. La estructura ya escala (todo keyed por `proyecto_id`); el punto frágil era cuando 2+ proyectos activos reclaman el mismo video (referente o keyword compartida) — `ig/tt_owner_to_proj` escalar (gana el último) y `kw[t][0]` (gana el primero). **Decisión: fan-out grado 1 (MVP, sin tocar schema).** Un video se evalúa contra **cada proyecto activo que lo reclama**, con su voz y juicio; la unidad de curación pasa a ser **(video, proyecto)** → puede salir como 2 Candidatos. El gate limita el duplicado solo (solo duplica lo que pasa los 2 gates). El dedup sigue **global por `external_id`** (caveat aceptado: el video se ofrece 1× al descubrirlo, no re-surge; histórico guarda 1 fila → aprendizaje por-proyecto más grueso, refinable post-MVP = grado 2, migración 007). **3 nodos:** `Armar plan` (owner maps escalar→array), `Asignar proyecto+voz` (emite 1 item por proyecto que reclama; referente reclama con tema='', keyword con su término; `pid in claims` preserva prioridad referente), `Pre-trim relevancia` (descarte por `(proyecto, external_id)` — si no, el drop de un proyecto mataba la copia del otro). Glosario actualizado (Proyecto + Candidato contradecían la decisión). **D3 RESUELTO ✅** — nodo 31 (`Reportar outputs`) ahora `POST outputs?on_conflict=external_id` + `Prefer: resolution=ignore-duplicates,return=minimal` (mismo patrón que el archivado nodo 11). Con fan-out los `external_id` repetidos entre proyectos son normales → sin este fix el batch rebotaría 409 seguido. dev-doc:124 actualizado. **Verificar en el re-import:** (1) `apify-igreels` trae owners de los 3 handles de parejas, no solo @bayavoce; (2) con 2 proyectos que comparten referente, un video cross-relevante sale como 2 Candidatos (distinto proyecto/voz); (3) archivado ya no rebota 409. Keys (`<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>`, `apifyApi`) llenas en el workflow que se corra, no en el sandbox. **Sigue abierto (ver §Próxima sesión):** F2 (decidir IG-hashtag), TODO Airtable (campos muertos), referentes TikTok sin sembrar, instrumentar descartes gate/pretrim, pre-cron (#4/#5/#9), grado 2 de fan-out (post-MVP). Credenciales Airtable/Supabase **a ROTAR**.

**2026-06-18 (cierre 13) — Run post-F1 verificado: embudo coherente, F1/F4/F5 en verde (Mani + Claude).** Mani re-importó + corrió con el fix de los `Merge` y dejó los outputs frescos del run en `outputs/` (una sola ejecución, 22:35–22:40). Revisión punta-a-punta sobre los JSON. **F1 RESUELTO ✅** — las 2 ramas concatenan: `normalizar-ig`=70 (40 reels + 30 hashtag) y `normalizar-tt`=41 (40 + 1 perfil basura); el Normalizador corre 1×. **F4 RESUELTO ✅ (el más caro)** — TikTok atraviesa todo por primera vez: **17 asignados → 11 pretrim → 4 heatscore → 1 candidato final**, y **@nadirainwonderland es el #1** (heat 0.825, rel 0.75, transcript 849c). 15 creadores TikTok distintos en `asignar`, todos por descubrimiento hashtag/keyword (0 referentes TT sembrados) → el eje **TikTok-keyword es la estrella**. **F5 RESUELTO ✅** — el Gate emite 4 items con scores reales (0.7–0.85), no `[{}]`. **El refactor de relevancia trabaja como se diseñó:** el Gate tiró los 2 TikTok de más views del run (@emmastoomuch 3.5M / heat 1.99 y @mayaaa_speaks 2.7M / heat 1.96) → viral-off-topic muerto. **#7 TikTok nativo aplicó** (`idioma_nativo` ya en `normalizar-tt`; @nadira cayó a `guessLang`=ot porque el actor mandó `textLanguage` vacío en ese item). `viral_por_tamano` marcó solo a @sabrina.zohar (1.7M) y el Gate igual la dropeó por relevancia. **Sigue abierto:** **(F3, 🟠 re-diagnosticado)** IG referentes — los 40 reels son **todos @bayavoce**. **#24 era teoría vieja:** existe un nodo `Split IG referentes` que corre el Apify IG Reels **1× por referente**, así que `ig_results_limit` es **por-referente, NO cap global**. La causa real: de los **3** referentes IG ligados a "parejas" (@bayavoce, @jefferson_fisher, @howtoconvince), **solo @bayavoce devolvió reels**; los otros 2 dieron 0 (¿sin reels en 75d? ¿privados? ¿handle mal? ¿actor falló?). **= lead #1 próxima sesión.** **(F2, 🟠 cambió de cara)** IG-hashtag = peso muerto pero **ahora lo mata el pretrim semántico**, no el ranking ciego: los 30 items (`seguidores=0`, captions hi/pl/en) llegan a `asignar` y el pretrim los elimina a los 30 → 0 finalistas, gasta Apify. Contraste con TikTok-hashtag (métricas completas, inglés, on-topic) → **decisión clave abierta: retirar/apagar eje IG-hashtag, conservar TikTok-hashtag** (ver abajo). **Gaps de auditoría:** Gate/pretrim **no logea descartes**; **2 escalas de heat** conviven (heatscore métrico 1.5–2.0 vs armar-candidato composite 0.6–0.83). **Bloque D HECHO:** **D1 ✅** 4 Candidatos en Airtable calzan exacto (rel/heat/razón/links/thumbnail; `Candidatos` no tiene campo `plataforma` → no se guarda). **D2 ✅** run `31e3d2be` cerró `ok`, sin zombie, `metricas` calza (colectados 111 = 70+41, filtrados 10, outputs 4). **D3 🔴 BUG NUEVO:** el write de `outputs` del **motor no es idempotente** — nodo 31 (`Reportar outputs`) hace `POST` **sin `on_conflict`** (dev-doc:124); como 3 de los 4 ext_ids ya existían (bayavoce del run previo), el **batch entero rebotó 409** → continue-on-fail → **no entró nada, ni el TikTok nuevo** (run igual cerró `ok`). Empeora con el tiempo. Fix = mismo patrón que el archivado (nodo 11, migración 005): `on_conflict=external_id` + `resolution=ignore-duplicates`. `processed_items`=10 (6 IG+4 TT) coherente. **Actores Apify (notas):** los 2 actores aceptan arrays; instagram-scraper IG-Hashtag ya pasa todos los hashtags juntos; TikTok hashtags = **OR/unión** (1 video califica por ≥1 hashtag); IG Reels va de-a-1 **por el Split**, no por límite del actor. **Próxima sesión:** (1) F3 — por qué 2 de 3 referentes IG dan 0; (2) decidir IG-hashtag; (3) fix idempotencia nodo 31; (4) revisión general de Airtable (borrar campos muertos, ver TODO). Credenciales Airtable/Supabase en mano (**a ROTAR**). Sin código de motor esta sesión; outputs siguen untracked.

**2026-06-18 (cierre 12) — F1 cerrado en código: Merge ANTES de cada Normalizador (Mani + Claude).** Confirmado **desde código + outputs** (sin necesidad del log de n8n) que el cableado mandaba las 2 ramas de cada plataforma al **mismo input** del Normalizador (IG Reels + IG Hashtag → `Normalizar IG` in#0; TikTok + Perfil → `Normalizar TT` in#0). n8n ejecuta el nodo **1× por conexión** → el Normalizador y todo downstream corrían **2× como pasadas separadas**. Evidencia inequívoca: `normalizar-ig`=30 (=conteo hashtag exacto, no 40+30) y `normalizar-tt`=1 (=`[{}]` perfil, no 40+1) → **no concatenó**; `armar-candidato`=9 @bayavoce (pasada Reels, congelada porque en la pasada Hashtag el gate salió vacío) vs `pretrim/heat/transcribir`=3 ids hashtag (`39220…`). **Fix aplicado:** 2 nodos `Merge` (append) nuevos — `Merge IG` (IG Reels⊕IG Hashtag) y `Merge TT` (TikTok⊕Perfil) → cada uno a su Normalizador; `Merge scrapes` (IG⊕TT) intacto. Motor **34→36 nodos**, validador **1089/0**, diff limpio (56+/6-). Sin riesgo de stall del Merge: los 4 Apify cuelgan del mismo `Armar plan de corrida` y **siempre ejecutan** (Perfil corrió y devolvió `[{}]` con 0 referentes; los toggles de eje viven en `directUrls`, no cortan el nodo). **F4 (TikTok 0) debería caer con esto** (era colateral de F1: la pasada TT se perdía en la carrera del `Merge scrapes`). **Working tree, SIN commit, SIN re-import.** **Verificar en n8n:** re-import → Execute → `Normalizar IG/TT` corren **1×** con dataset combinado (IG ~70, TT ~41) + candidatos TikTok downstream. **Pendiente del plan (corregido el orden, gracias a Mani):** seguir **en orden de ejecución** → Bloque A (apify-tiktok campos/idiomas, apify-tiktokperfil) + cerrar F2/F3/F5 (upstream), luego Bloque C (pre-trim 30→3) y D (cross-check en vivo). Credenciales para D ya en mano (a ROTAR).

**2026-06-18 (cierre 11) — Revisión nodo-por-nodo del último run con `outputs/*.json` (Mani + Claude).** `outputs/` **sacado del .gitignore** (los compañeros ven los JSON; quedan untracked, sin commitear aún). Plan de revisión completo y resumible abajo (§Próxima sesión). Hallazgos confirmados de este run (volúmenes nuevos: IG Reels 40, IG Hashtag 30, TikTok 40): **(F1, 🔴 estructural) las 2 ramas de cada plataforma NO se unifican** — IG Reels (40, todas @bayavoce) e IG Hashtag (30, 29 cuentas descubiertas) entran al **mismo** `Normalizar IG` (1 input, 2 conexiones) y el snapshot del nodo muestra **solo las 30 de hashtag**; idéntico en TikTok (`Normalizar TT` muestra **solo el `[{}]` de Perfil**, no los 40 del hashtag). Los snapshots por-nodo **no son un run coherente**: `armar-candidato`=**9 reels @bayavoce** (on-topic parejas, rel_score 0.75–0.95, gate OK) mientras `heat-score/transcribir/gate`=**3 cuentas hashtag** (en/hi/pl) → **pasadas separadas** por el pipeline (verificar en el execution log de n8n si el Code node corre 1×concatenando o 2×por rama; si 2×, falta un **Merge ANTES** de Normalizar). Explica la nota de Mani (gate vacío pero armar-candidato sacó 9: vienen de pasadas distintas). **(F2, 🟠) la pasada IG-Hashtag rankea CIEGA:** sus items no traen `followersCount`/`videoViewCount` (solo `metaData` sin followers) → `Normalizar IG` los deja `seguidores/bio/views=0` (30/30), el fix #22 **no los cubre**; y **Supadata no transcribió ninguno** (`script_len=0` en Transcribir; idioma hi/pl/en) → ruido multiidioma sin métricas ni guion. **(F3, 🟠) la pasada IG-Reels sí funciona** (9 candidatos scoreados) **pero los 40 reels son TODOS @bayavoce** → 7 referentes IG y solo 1 aporta (#24, peor que cierre 10). **(F4, 🔴) TikTok aportó 0** pese a 40 items bien formados y on-topic ("Soulmate facts… #relationship", fans 1.8M) — el hallazgo más caro. **(F5, 🟡) Gate emitió `[{}]`** sobre los 3 de hashtag (transcript vacío → fallback caption). **(✅) IG Hashtag `reels` (#23) funciona:** los 30 son `type:Video`. **Pendiente:** cerrar bloques A/C-detalle/D (cross-check Airtable+Supabase) con el plan de abajo; el lead a atacar primero es **F1** (2-into-1 en los Normalizadores), que arrastra F4.

**2026-06-18 (cierre 10) — Revisión del embudo Apify con los 4 outputs reales + estado vivo (Mani + Claude).** Fix **#22 (seguidores IG) aplicado en código** (`item.followersCount || item.ownerFollowersCount || metaData.followersCount`, validador 972/0, **falta re-import**). Revisión de `outputs/*.json` (4 nodos, run del 17-06; folder temporal de la sesión): **(1) IG Reels sano** — `followersCount`+`biography` 8/8, todos `type:Video`; **pero los 8 reels son de un solo referente (@bayavoce)** pese a 7 referentes IG activos → `Resultados Instagram=8` (ig_results_limit) se lo come una cuenta y deja a las otras 6 sin cupo (parte del "IG no aporta"). **(2) IG Hashtag = eje muerto:** sigue en `resultsType:'posts'` → trae 8 `Image`/`Sidecar` → el guard de video de `Normalizar IG` **descarta los 8** (0 aportan al embudo). Peor: los items de hashtag **no traen** `followersCount`/`videoViewCount`/`videoDuration` (solo `ownerUsername/FullName/Id`) → aunque fueran reels, `seguidores=0` y `reproducciones=0` **por shape del actor**, no por bug. **(3) `bio` = mismo bug que seguidores:** `Normalizar IG` lee `item.ownerBio` (no existe) → `bio=''` siempre; real = `item.biography` / `metaData.biography`; alimenta `guessLang` en Heat-score (impacto bajo). **(4) TikTok sano** (30 items, todos los campos de `Normalizar TT` presentes; 1 sin `text`/caption, 1 en polaco que pasó el gate). **(5) TikTok Perfil = `[{}]`** (0 referentes TT) → inocuo: lo dropea `Asignar` por `!d.url`. **Estado vivo (Airtable+Supabase por curl inline, a rotar):** ✅ **el Gate YA puntúa** (`relevancia_score=0.65` en el único candidato vivo) → **se levanta el #1 crítico del cierre 9** (era null por key Anthropic vacía); ✅ **`criterios_relevancia` sembrado en los 3 proyectos** (~420c c/u, antes vacíos) → solo "Comunicación de parejas" activo (top_n=2); `processed_items` **vaciado por Mani** (era el dedup lo que hundía el volumen de la pasada anterior, no el actor ni el filtro); **3 `runs` colgados `en_curso`** (fin/metricas null → zombies). **Por aplicar tras OK de Mani:** `bio` (1 línea, mismo origen que seguidores) + **decisión sobre IG Hashtag** (probar `resultsType:'reels'` sobre `explore/tags/` o retirar el eje, ver #23) + revisar `ig_results_limit` por-cuenta (#24). Referentes TikTok siguen pendientes (equipo).

**2026-06-18 (cierre 9) — Fix reels-only en IG + auditoría del estado vivo (Mani + Claude).** Sesión sin re-import aún. **Reels-only (pedido de Mani):** dos cambios en `workflow.json` — (a) `Apify — IG Reels` `resultsType: 'posts'→'reels'` (reels en origen para el eje de perfil; no se paga Apify por scrapear fotos); (b) guard en `Normalizar IG` (`if (item.type && item.type !== 'Video') return null`) que descarta fotos/carruseles en **ambas** ramas IG (perfil + hashtag). Validador 972/0. *No hace falta `instagram-reel-scraper`: es solo-perfil (no cubre el nodo IG Hashtag) y rompería el `Normalizar IG` compartido; el mismo actor con `resultsType:'reels'` ya da reels al origen.* Pendiente menor: probar si la rama IG Hashtag respeta `'reels'` sobre URLs `explore/tags/` (hoy queda en `'posts'`+guard). **Auditoría del estado vivo (PAT+service_role, a rotar):** corrige dos cosas del cierre 8 — **(1) el "8 vs 4" NO es bug de `top_n`:** las `runs` muestran `{outputs:4}` (= 2 proyectos × top_n 2, correcto) y `{outputs:2}`; los 8 candidatos en Airtable son **acumulación de varias corridas** (Candidatos no se purga hasta que el equipo califica). **(2) Hallazgo nuevo y más grave: `relevancia_score=null` en los 8 candidatos** → el Gate de relevancia **no puntúa** (probable `<ANTHROPIC_API_KEY>` sin llenar en el sandbox, o Haiku fallando → fail-open). El refactor de relevancia está **inerte**. Además **`criterios_relevancia` vacío en los 3 proyectos** (solo la Voz "Milena Morales" tiene criterios). **Config real ya sembrada** (supera el "config pendiente" del cierre 7): 3 proyectos (1 activo: *Comunicación de parejas*; *empresas* y *líderes* inactivos), 7 referentes IG / **0 TikTok**, 4 keywords EN (Relationships/Communication/Leadership/Corporate), 12 Ajustes en defaults. **29 drafts en `outputs`** (acumulan, #20) + 1 run colgado `en_curso` (#9 OAuth Sheets). **Próximo:** Mani re-importa + corre; verificar que el Gate puntúe (key Anthropic), sembrar criterios de proyecto + referentes TikTok.

**2026-06-17 (cierre 8) — Primera corrida con config real + diagnóstico de timeout *(Dev3).*** `N8N_RUNNERS_TASK_TIMEOUT=900` activado en InstaPods (`/etc/systemd/system/n8n.service`); creado "Motor de Reels - Prueba" como sandbox. Corrida: top_n=2, 2 proyectos activos ("Comunicación de parejas" + "Comunicación en empresas"). **El workflow llegó a Airtable sin timeout** — la variable resolvió el corte técnico. **Hallazgos de la corrida:** (a) **8 outputs en vez de 4** (top_n=2 × 2 proyectos = 4 esperados) — causa desconocida, investigar; (b) **Instagram: sin transcripciones** — Apify trajo posts de foto (no videos/reels) y contenido posiblemente irrelevante para los proyectos activos; (c) **TikTok: transcripción OK** — incluido un video musical sin voz (Supadata transcribió la letra = fail-open correcto). Logs de debug en Transcribir (Supadata) ya estaban en el `workflow.json` (commit anterior) pero **no son visibles en la UI de esta versión de n8n** (la pestaña "Logs" del Code node requiere versión más reciente). **Deuda técnica documentada:** Opción 3 — **SplitInBatches** (ver §Mejoras #21): solución estructural al timeout del Code node; diseño aprobado esta sesión, pendiente de implementar cuando el volumen escale. `N8N_RUNNERS_TASK_TIMEOUT=900` es temporal. **Próximo:** investigar 8 vs 4 outputs; revisar config Apify IG (¿filtrando reels?); evaluar relevancia del contenido traído.

**2026-06-17 (cierre 7) — Docs + verificación + cierre de manuales del cierre 6 (Mani + Claude).** Sesión
sin código de motor. **Fase 2 del handoff:** corregido `33→34 nodos` (CLAUDE.md del motor + PLAN.md) y
anotada la **#20** (las `draft` del motor en `outputs` no se cierran nunca — doble semántica de `external_id`,
dev-doc §7). **Ajustes (ADR-011) verificado punta a punta en código:** 12 claves Airtable ↔ `AJUSTE_MAP` 12/12,
0 huérfanos; `_nrm` normaliza acentos/mayúsculas (TikTok, interacción); `cfg=Config⊕ajustes` consumido por
Heat-score (8 knobs), Gate (`peso_relevancia`/`min_relevancia`) y los 4 Apify (`ig/tt_results_limit`); fail-open.
Correcto por construcción, **falta correr en vivo**. **🔴 manuales:** **`005`+`006` APLICADAS y verificadas**
(en vivo: `v_senal_tema` pasó de 404 a 200; índice `outputs_external_id_key` quedó completo, sin `WHERE`).
Quedan: re-import + V-run (#2, en curso), sembrar Referentes TikTok (#3, lo hace redes), rotar credenciales
(#4, en producción). **Onboarding del equipo de redes:** el doc **ya existía** ([docs/onboarding-equipo-redes.md](../onboarding-equipo-redes.md))
→ se comparte como Google Doc + acceso al Airtable. Quedó **stale tras el cierre 6** (dice "5 tablas", falta la
**Ajustes**; describe el descubrimiento asimétrico, no el simétrico nuevo) → actualizar **después de la V-run**.
**Diagnóstico de la base viva** (vía PAT/service_role): 1 proyecto provisional, 1 voz, 9 keywords, **3 referentes
IG / 0 TikTok**, 9 candidatos de prueba, 24 `outputs`. **D0 — limpieza HECHA (cierre 7):** Airtable (Candidatos +
config provisional) y Supabase (`outputs`/`runs`/`processed_items`) **a 0**; se conservaron `Ajustes` (12 knobs),
el esquema/vistas y la identidad (`instances`/`clients`). Falta la otra mitad de D0: **sembrar la config real**
cuando el equipo entregue el brief. **Integridad:** sin tokens auth en el árbol ni en la historia (validador 972/0,
escaneo OK); única observación menor → 2 identificadores (base ID + project ref Supabase) quedaron en commits viejos
vía `temp/` (ya gitignored), bajo riesgo y neutralizado al rotar credenciales.

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

## 🗺️ PLAN A PRODUCCIÓN (cierre 15) — implementar desde 0

> **Aprobado por Mani (2026-06-23). Este es el plan vivo para llevar motor + archivado a su versión
> final de producción.** Empezar acá la próxima sesión. Copia espejo en `~/.claude/plans/` (efímera);
> **esta es la fuente durable.** Alcance = **núcleo**: los 2 pipelines validados en vivo (V1–V6) + en
> cron (D1–D3). Calibración fina e interface Airtable quedan fuera (ver §Diferido al final del plan).
> El grueso es **manual en n8n/Airtable/cloud + corridas en vivo** (las hace Mani; Claude no accede a
> n8n), intercalado con tramos de código de Claude.
>
> **Decisiones de Mani que enmarcan el plan:** alcance = núcleo; hacer las limpiezas de código/docs
> seguras AHORA (Fase 0) para re-importar un artefacto final; **`outputs` de Supabase debe ser el
> histórico canónico que alimente el Sheet correctamente** (reencuadre de #20 — ver Fase 0.3).

### Fase 0 — Artefacto final (Claude, código + docs) → commit · ✅ HECHA (commit `41f06a5`, 2026-06-23)

> **Cierre 16:** #14 (meta.instanceId + tags limpios), #11 (deploy.mjs deprecado), #20 hecho como
> **ADR-014** (motor deja de escribir `outputs` por-item; quita 2 nodos → 37→35; `Cerrar run` con
> executeOnce y métrica `outputs`=`$('Armar candidato').all().length`; contrato ingesta-registro
> actualizado), dev-doc resync a 35 nodos reales + cambios cierre 15 + paginación archivado, conteos
> a 35 en PLAN/README/CLAUDE. Validador 1107/0. **Nota:** el onboarding ya estaba al día (6 tablas +
> simétrico). **Pendiente menor (no en scope):** el checkbox "Buscar en Instagram por palabras clave"
> del onboarding quedó no-op por F2 (IG-hashtag apagado) — revisar al confirmar F2 en V1. **Empezar en
> Fase 1.**

1. **#14 — limpiar metadata residual del template** en `Workflows/workflow-short-form-content/workflow.json`
   (`instanceId`, bloque `tags` "Content Strategy/Scraping/AI Automation", ~líneas 1273–1306). Cosmético.
   Vía script builder (no a mano), validar parse + `npm run validate`.
2. **#11 — `core/scripts/deploy.mjs` legacy.** Marcar deprecado con cabecera clara (resolvía placeholders
   de voz/categorías que ya no existen; el MVP es 1 instancia en el nodo Config). **No borrar** (semilla de
   multi-cliente F5). Ajustar la referencia en `CLAUDE.md` §Feedback loops si queda engañosa.
3. **#20 / Supabase = histórico canónico** *(toca `core/` → necesita OK explícito de Mani + ADR-014).* Hoy
   el **motor** escribe filas `draft` a `outputs` y el **archivado** las calificadas; las vistas filtran
   `calificado_en not null` (solo ven archivado) pero `outputs` crudo acumula draft que nunca se cierran.
   **Propuesta:** el motor **deja de escribir filas por-item a `outputs`** (el tracking por corrida sigue en
   `runs.metricas`); `outputs` = solo filas del archivado = histórico limpio que el Sheet espeja 1:1. Quita
   2 nodos del motor (`Preparar outputs Supabase`, `Reportar outputs al registro`) y reapunta la métrica
   `outputs` de `Cerrar run` a `$('Armar candidato').all().length`. Toca `core/contracts/ingesta-registro.md`
   + `dev-doc §7` → **ADR-014 nuevo**. *Alternativa: mantener draft pero a tabla/estado aparte. **Confirmar
   con Mani antes de tocar `core/`.***
4. **Sync de docs:** `dev-doc.md` (motor = **37** nodos, no 34; + los 4 cambios cierre 15; + resultado #20).
   `onboarding-equipo-redes.md` (stale cierre 6: dice "5 tablas", falta **Ajustes** = 6; describe
   descubrimiento asimétrico, ya es simétrico).
5. **Commit** de todo (cierre 15 + Fase 0) a `main`, español, conciso.
   *Verificación: `npm run validate` verde; `jsCode` parsea; diff quirúrgico (no reexpandir el archivado).*

### Fase 1 — Re-import + V1 en vivo (Mani, manual) · ✅ HECHA (cierre 17) — V1 = éxito

> **Cierre 17:** el V1 corrió y se diagnosticó (1 proyecto, embudo 202→6, todo verde). Verificados F3,
> F2, recencia, pre-trim, gate, transcripción, boost idioma, ADR-014, instrumentación. Pendiente de
> verificar (necesita setup, no es falla): fan-out, paginación, dedup → se prueban en el run de Fase 3.
> **Detalle completo en §Estado en una línea (cierre 17).**

1. Re-importar **ambos** workflow.json. Llenar en el workflow que se corre (no el sandbox):
   `<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>`, `apifyApi` en los 4 Apify, `Airtable PAT`, `Supabase Registro`;
   IDs en `Config`.
2. Pre-run: `Candidatos` a 0; `processed_items` vacío (o dejar para V5).
3. **V1 backfill** (`dias_recencia` alto) → Execute manual. Verificar de un saque: **F3** (apify-igreels trae
   los 3 referentes, no solo @bayavoce) · **fan-out ADR-013** (2 proyectos que comparten referente → 2
   Candidatos) · **paginación #4** (no trunca a 100) · **dedup acotado #5** (URL con `in.()`, no re-transcribe)
   · **métricas embudo** (`runs.metricas`: colectados/asignados/pretrim/filtrados/gate/outputs) · **IG-hashtag
   = 0** (F2) · **D3** (archivado sin 409).
4. Leer instrumentación: `journalctl -u n8n` para `[Pre-trim]`/`[Gate]` + `runs.metricas`. Anotar hallazgos.
   *Riesgo: la paginación de n8n no se probó localmente; si el schema falla se ajusta en Fase 2 (downside
   acotado: con ≤100 records el comportamiento = hoy).*

### Fase 2 — Fixes reactivos del V1 (Claude, código) · ✅ HECHA (cierre 17)

El V1 salió limpio: el único item de código fue el **guard de stubs** (`Normalizar IG`/`TT` descartan los
stubs vacíos `{error:"no_items"}` y `{}` de los ejes sin datos). Hecho + probado contra outputs reales.
Nada más que corregir. Si el run de Fase 3 expone algo nuevo (edge de fan-out, schema de paginación,
idioma TikTok #7), se itera acá.

### Fase 3 — Resto de V-runs + higiene de producción (Mani, manual)

> **Cierre 18:** el **run de Fase 3 corrió y se diagnosticó = éxito** (2 proyectos, fan-out ADR-013 ✅,
> recencia 200 ✅, transcripción 19/20 ✅). Surgió y se arregló el **bug fan-out×dedup** (`POST
> processed_items` sin `on_conflict` → 0 procesados; fix `workflow.json:706`). **Falta re-import +
> Execute** para verificar el fix en vivo. **El detalle de TODO lo que queda para producción está
> consolidado en §Próxima sesión** (los V-runs restantes están abajo, pero la lista completa y ordenada
> vive en esa sección única).

- **Sembrar 2–3 referentes TikTok** (hoy 0 → eje TT-perfil vacío) + subir `top_n` de parejas (2 es test).
- **V2 literalidad** · **V3 curación + archivado** (verifica #20: Sheet alimentado desde el histórico limpio)
  · **V4 re-rank** · **V5 incremental + dedup** · **V6 resiliencia** (ver ROADMAP §3 para el detalle de cada V).
- **#9 OAuth Google Sheets** — sacar de modo Testing / GCP permanente **antes** del cron del archivado
  (vence cada 7 días → falla en silencio).
- **TODO Airtable** — borrar campos muertos (`Referentes.seguidores`/`flag_viral`, restos de Voces, `link_doc`);
  `fecha → Created time`.
- **🔴 ROTAR credenciales** — Airtable PAT + Supabase service_role (expuestas en chats cierres 13–15).

### Fase 4 — Activación (D1–D3)

- **D1** validar TZ `America/Bogota` → activar cron motor + cron archivado.
- **D2** *(Claude)* `status: active` en manifest + tabla `workflows`; manifest al estado real post-cierre-15.
  Commit.
- **D3** demo de 10 min con Majo y Jero (calificar, ver re-rank, bajar histórico).

### Archivos críticos · Verificación · Diferido

- **Archivos:** motor + archivado `workflow.json`; `core/scripts/deploy.mjs` (legacy); `core/contracts/
  ingesta-registro.md` + `docs/adr/ADR-014-*` (nuevo, #20); `dev-doc.md` + `onboarding-equipo-redes.md`
  (sync); `Workflows/*/workflow.yaml` + `validate.mjs` (manifest `active`, D2).
- **Verificación:** código → `cd core/scripts && npm run validate` verde tras cada fase. En vivo → V1–V6 +
  cross-check Airtable/Supabase (`runs`, `outputs`, vistas histórico/señal) + Sheet. **Producción cuando:** un
  backfill deja candidatos correctos en Airtable con rastro en Supabase; calificar termina en el Sheet vía el
  histórico limpio; ambos crons activos en `America/Bogota`.
- **Diferido (fuera de este empuje):** calibración de pesos/rubric con data real (#13/#18/#25/#26) ·
  interface Airtable + onboarding (#30/#31/#32) · grado 2 de fan-out (migración 007) · SplitInBatches (#21).

## ⏳ Pendiente inmediato (manual de Mani, cierre 6)

> Las 6 decisiones están en código y commiteadas. Para que corran en vivo falta lo **manual** (no lo
> puedo hacer yo):
> 1. ~~**Aplicar `005` + `006`**~~ → ✅ **HECHO y verificado (cierre 7).** `v_senal_tema` responde 200;
>    el índice `outputs_external_id_key` quedó completo (sin `WHERE`).
> 2. **Re-importar el motor en n8n** (34 nodos; asignar credencial `apifyApi` a los 2 Apify nuevos —
>    *IG Hashtag* y *TikTok Perfil* — y la key `<ANTHROPIC_API_KEY>`/`<SUPADATA_API_KEY>` en los Code
>    nodes) + el archivado, y correr la **V-run de re-validación** (gate-fix + Ajustes + simétrico).
> 3. **Sembrar Referentes de TikTok** (hoy las 3 cuentas son IG → el eje *TikTok Perfil* sale vacío).
> 4. **🔴 ROTAR el PAT de Airtable + la service_role de Supabase** (expuestos en el chat de hoy).

## Próxima sesión — LO QUE FALTA PARA PRODUCCIÓN (consolidado, cierre 18)

> **🧭 PARA RETOMAR (cierre 18).** El **núcleo del motor está validado end-to-end** (V1 cierre 17 +
> run Fase 3 cierre 18: fan-out, recencia 200, transcripción, embudo — todo ✅). El último bug
> (fan-out×dedup) ya está arreglado en código, **falta verificarlo en vivo**. Lo que queda para sacar
> esto a producción está **todo acá, en una sola lista ordenada** (antes estaba disperso entre §Plan a
> producción, §Mejoras y los PARA RETOMAR viejos). Atacar de arriba hacia abajo. **Camino crítico = A → B.**
>
> ### A. Verificar el fix de dedup en vivo (camino crítico, Mani manual)
> 1. **Re-import del motor `workflow.json`** (trae el fix `?on_conflict=platform,external_id` en `POST
>    processed_items`, línea 706) + llenar keys/IDs en el workflow que se corre (no el sandbox):
>    `<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>` (¡la que faltó en el cierre 18!), `apifyApi` en los 4 Apify,
>    `Airtable PAT`, `Supabase Registro`, IDs en `Config`.
> 2. **Execute** con ≥2 proyectos que compartan referente/keyword (para ejercer el fan-out) → verificar
>    que `processed_items` quede **poblado** (~19 filas, el video compartido **1×** gracias al ON CONFLICT
>    DO NOTHING). Si queda en 0 otra vez, el fix no enganchó → re-diagnosticar.
>
> ### B. Workflows complementarios — los MENOS validados (cerrar antes del cron)
> 3. **Archivado (`workflow-archivado`) — nunca re-corrió desde sus fixes.** Tiene cambios **sin verificar
>    en vivo**: idempotencia (migración 005: `on_conflict=external_id` + `Prefer: ignore-duplicates` +
>    delete con reintento 3×, cierre 6); **paginación** de sus 3 lecturas (`Leer Proyectos/Voces/
>    Candidatos`, cierre 15); y **el SPLIT (cierre 19, sin correr aún):** filtro de lectura ahora
>    `NOT({estado} = 'nuevo')` (antes `calificacion` no-vacía) → trae aprobado/publicado/descartado; el
>    **Sheet recibe solo aprobado/publicado**, mientras Supabase `outputs` + borrado toman **todos** los
>    decididos (descartados alimentan `v_senal_seleccion` y se limpian del cockpit, sin ensuciar el
>    histórico). Nodo nuevo `Reconvergir tras Sheet` (Merge) para que el borrado corra aun con 0 aprobados
>    pero espere al Append. **La V-run que lo ejercita (V3) NUNCA corrió.** Es el eslabón menos probado que
>    va a prod. Con **ADR-014** (el motor ya no escribe `outputs`), el archivado es **el único que puebla
>    `outputs` = el histórico canónico que alimenta el Sheet** → V3 debe confirmar: calificar en Airtable
>    (mezclar aprobados Y descartados) → `outputs` recibe ambos con su `estado` · el Sheet **solo** los
>    aprobados · todos se borran de Airtable · sin 409, sin duplicar, sin perder candidatos. **Probar el
>    caso lote 100% descartado** (rama Sheet vacía): el Merge debe dejar pasar el borrado igual (si se
>    cuelga ahí, el Merge no tolera la entrada vacía en esta versión de n8n → re-evaluar). El archivado
>    **no gasta Apify/Supadata** → se puede validar gratis, desacoplado del run del motor.
> 4. **#9 OAuth de Google Sheets — BLOQUEANTE de lanzamiento.** Está en modo *Testing* → el token vence
>    cada 7 días y el cron del archivado (diario) falla en silencio ~1×/semana; además GCP corre con
>    créditos gratuitos ($300). Publicar la app OAuth / mover a cuenta GCP permanente **antes** de activar
>    el cron del archivado.
> 5. **Error workflow (B5) — instalado pero nunca probado.** Verificar que **dispare y reporte** ante un
>    fallo real (forzar un error en una corrida y confirmar que el error workflow lo captura). Riesgo bajo,
>    pero hoy es fe ciega.
>
> ### C. Resto de V-runs (Mani manual; ver ROADMAP §3 para el detalle de cada V)
> 6. **V2** literalidad (muestras reales del script ES) · **V3** curación + archivado (cubre el punto 3) ·
>    **V4** re-rank · **V5** incremental + dedup (ahora con el fix del punto A) · **V6** resiliencia.
>
> ### D. Higiene de producción (Mani manual)
> 7. **Sembrar 2–3 referentes TikTok** (hoy 0 → el eje TT-perfil sale vacío) + subir `top_n` real (10 ya es
>    razonable; 2 era test).
> 8. **TODO Airtable (borrar en UI, la API no borra campos):** `Referentes.seguidores` + `flag_viral`
>    (muertos), restos de Voces, `link_doc`; `fecha → Created time`.
> 9. **🔴 ROTAR credenciales** — Airtable PAT + Supabase service_role (expuestas en chats cierres 13–18).
>
> ### E. Fase 4 — Activación
> 10. **D1** validar TZ `America/Bogota` → activar **cron del motor** (semanal, lunes 8am) + **cron del
>     archivado** (diario, depende del punto 4).
> 11. **D2** *(Claude, código + commit)* `status: active` en `workflow.yaml` + tabla `workflows`; manifest
>     al estado real post-cierre-18.
> 12. **D3** demo de 10 min con Majo y Jero (calificar, ver re-rank, bajar histórico).
> 13. **🔁 RECURRENTE — verificar que el motor aprende de las selecciones de Majo/Jero.** El loop YA
>     está cableado (motor lee `v_senal_seleccion`+`v_senal_tema`; Heat-score: `heat = base*(1+idioma)*
>     (1+sel)`, `sel=max(selRef,selTema)`; las vistas cuentan `outputs` aprobados/publicados que escribe
>     el archivado). **Hoy inerte: no hay historial** (ADR-012 #4). Una vez en producción, tras varias
>     rondas de calificación archivadas, confirmar que un referente/tema que el equipo elige seguido
>     **sube de heat** en corridas posteriores. No es one-shot: chequear periódicamente que la señal no
>     esté en 0 (si `v_senal_seleccion` no devuelve filas → el archivado no está poblando `estado`).
>
> ### F. Gate de lanzamiento real (externo al repo — reunión con el jefe)
> 14. **#32 interface user-friendly + #30/#31 dashboard/vistas Airtable.** Decisión transversal de Dani:
>     **nadie usa la herramienta hasta que la interface esté lista.** Es el gate REAL de lanzamiento, no
>     código del motor. (Detalle en §Mejoras #30–#32.)
>
> ### G. Refactor de búsqueda (#34/#35) — POST-MVP, NO ahora ⛔
> 15. La **DIRECCIÓN del embudo de dos etapas** (descubrir CREADORES ≠ curar CONTENIDO; keywords →
>     pestaña de **Criterios** estructurados *Sirve/No Sirve/Keywords*; búsqueda por hashtag pasa a proponer
>     referentes que marketing vetea, no a alimentar candidatos directo) es el **refactor de producto más
>     importante**, pero es un **build grande** (tabla/vista "Creadores propuestos" + superficie de review +
>     reestructurar `Keywords`→`Criterios` + filtro de relevancia propio + dedup contra `Referentes`).
>     **Explícitamente decidido: después del núcleo en producción.** NO tocarlo hasta que A–F estén cerrados.
>     Detalle completo en §Mejoras (DIRECCIÓN 2026-06-23 + #34/#35).
>
> **Sugeridos:** `/diagnose` si el re-import del punto A no puebla `processed_items`; si no, seguir la
> lista a mano. `/tdd` no aplica (el motor corre en n8n, se valida por re-import + Execute).
>
> ---
> *Histórico (cierre 14, el plan de revisión de outputs Bloques A–D está completo; F1/F3/F4/F5 + D3 cerrados):*
> 1. **🔴 Re-import + Execute en n8n (camino crítico).** Verifica de un saque los fixes sin correr en vivo aún:
>    (a) F3 — `apify-igreels` trae owners de los 3 referentes de parejas, no solo @bayavoce; (b) fan-out
>    (ADR-013) — con 2 proyectos que comparten un referente, un video cross-relevante sale como 2 Candidatos
>    (distinto proyecto/voz); (c) D3 — el archivado ya no rebota 409, los outputs entran; **(d cierre 15)**
>    paginación (lecturas no se truncan a 100), dedup acotado (`Leer procesados` con `in.()`), `runs.metricas`
>    con el embudo completo, IG-hashtag en 0. Keys llenas (`<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>`,
>    `apifyApi`) en el workflow que se corre, **no** el sandbox.
> 2. **✅ F2 RESUELTO (cierre 15) — IG-hashtag apagado en código.** `ig_hashtags` siempre vacío; TikTok-hashtag
>    intacto. Reversible. (Si Mani prefiere el toggle por-proyecto en vez del kill global, re-evaluar.)
> 3. **Sembrar referentes TikTok** (hoy 0 → eje TT-perfil vacío) + ajustar `top_n` de parejas para curación real.
> 4. **TODO Airtable** — revisión general; concreto: borrar `Referentes.seguidores`/`flag_viral` (campos muertos).
> 5. **✅ Instrumentación RESUELTA (cierre 15) — falta correr.** Pre-trim/Gate logean descartes (journalctl) +
>    embudo en `runs.metricas`. Con eso ya se puede **calibrar** pesos/rubric leyendo qué se tira.
> 6. **Pre-cron:** ~~#4 paginación~~ ✅, ~~#5 tope dedup~~ ✅ (cierre 15); queda **#9 OAuth Sheets** (vence 7d).
> 7. **Grado 2 de fan-out** (post-MVP, diferido en ADR-013): dedup por `(platform, external_id, proyecto)` →
>    migración 007 en `core/` + tocar el archivado → aprendizaje por-proyecto limpio + re-surgimiento.
> 8. **🔴 ROTAR credenciales** Airtable PAT + Supabase service_role (expuestas en chat, cierres 13–14).
>
> **Estado (cierre 10):** revisados los 4 outputs Apify + el estado vivo. Lo que queda, en orden de prioridad:
> 1. **✅ RESUELTO (cierre 10) — el Gate YA puntúa** (`relevancia_score=0.65` en el candidato vivo; era null por
>    `<ANTHROPIC_API_KEY>` vacía en el sandbox). Confirmar que se mantiene en la próxima corrida con la key llena.
> 2. **✅ RESUELTO (cierre 10) — `criterios_relevancia` sembrado en los 3 proyectos** (~420c c/u). El gate ya tiene
>    rúbrica de tema por proyecto, no solo la Voz.
> 3. **✅ Reels-only — RESUELTO en código (cierre 9), falta re-import.** `IG Reels` a `resultsType:'reels'`
>    + guard de video en `Normalizar IG`. Confirmar en la corrida que no llegan fotos y que IG transcribe.
>    **OJO:** la rama **IG Hashtag NO** quedó cubierta — sigue trayendo fotos y aporta 0 (§Mejoras #23).
> 4. **Sembrar Referentes TikTok** (hoy 0 → `Apify — TikTok Perfil` devuelve `[{}]`, eje vacío).
> 5. **✅ `bio` (#22) + IG Hashtag→`reels` (#23) aplicados en código (cierre 10).** Falta re-import. `ig_results_limit`
>    (#24) es un knob de Airtable (ver config recomendada abajo).
>
> **Config recomendada para el próximo run "real" (cierre 10).** Los 3 fixes de IG están en código (validador 1008/0);
> el resto se ajusta en Airtable sin re-import (el motor lee Ajustes/Proyectos en runtime):
> - **Ajustes:** `Resultados Instagram por corrida` **8 → ~35** (es tope **global**, no por cuenta: con 8 una sola
>   cuenta consume todo el cupo de los 7 referentes; ~5/referente. **Ojo:** el mismo knob alimenta también IG
>   Hashtag → sube el costo de las dos ramas IG). `Resultados TikTok` 30 (ok, o 50). `Mínimo de vistas/likes` y
>   `Relevancia mínima` en **0** (que el gate puntúe pero no corte, para leer el ranking completo). Pesos/boost: **no tocar** (calibración va después).
> - **Proyectos:** `top_n` de *parejas* **2 → 5–8** (2 es valor de test; el equipo necesita cola de curación real).
>   `dias_recencia` 75 (ok) o 30 si se quiere solo reciente. `activo` = lo que sea producción (si el cliente real es
>   solo *parejas*, 1 activo **es** lo real).
> - **Pre-run obligatorio (lo que rompió antes):** (1) re-importar el `workflow.json` (3 fixes); (2) **keys llenas
>   en el workflow que se corre, no el sandbox** — `<ANTHROPIC_API_KEY>` (Pre-trim/Gate/Traducir) + `<SUPADATA_API_KEY>`
>   (esto fue lo que dejó el gate en null); (3) credencial `apifyApi` en los 4 nodos; (4) **Candidatos a 0** (embudo
>   limpio); `processed_items` ya vacío. (5) Sembrar 2-3 referentes TikTok si se quiere ejercitar el eje TT-perfil.
>
> **🔍 PLAN DE REVISIÓN DEL ÚLTIMO RUN (cierre 11) — completo y resumible. Data: `outputs/*.json` (ya versionado).**
>
> **Método:** un nodo a la vez, en orden de ejecución (dev-doc §2.1). Por nodo: leer el JSON completo →
> contrastar con lo que la dev-doc dice que debe emitir (§2.2) → cruzar con Airtable/Supabase en vivo →
> anotar *bug / mejora / conexión errada*. **NO** pasada general simultánea. Empezar por los leads calientes.
>
> **⚠️ Los snapshots por-nodo de `outputs/*.json` NO son un run coherente** (ver F1): para leer un embudo
> punta-a-punta hay que abrir **UNA ejecución concreta en el execution log de n8n**, no los paneles por-nodo.
>
> **Hallazgos confirmados (run del 18-06, leídos de `outputs/`):**
>
> | # | Hallazgo | Evidencia | Sev. |
> |---|---|---|---|
> | **F1** | ✅ **RESUELTO y VERIFICADO en el run post-fix (cierre 13).** Las 2 ramas ya concatenan. | normalizar-ig=70 (40 reels+30 hashtag) · normalizar-tt=41 (40+1 perfil) · Normalizador corre 1× | ✅ cerrado |
> | **F2** | 🟠 **cambió de cara (cierre 13):** IG-hashtag sigue dando 0 finalistas, **pero ahora lo mata el pretrim semántico**, no el ranking ciego: 30 items (30 cuentas, `seguidores=0`, captions hi/pl/en) llegan a `asignar` y el pretrim los elimina a los 30. Gasta Apify → retiro o targeting por idioma/geo. | asignar IG seg=0: 30/30 · pretrim IG seg=0: 0 | 🟠 producto |
> | **F3** | ✅ **RESUELTO (cierre 14) — era bug de código, NO datos/Apify.** `Armar plan` tomaba `f.proyecto[0]`; si el primer proyecto ligado está inactivo, el referente/keyword se descartaba y nunca se mandaba a Apify. jefferson/howtoconvince listan un proyecto inactivo primero → nunca se scrapearon. **Fix 1:** iterar todos los proyectos ligados. | commit 76ea422 · falta verificar en re-import (owners de los 3 handles) | ✅ cerrado |
> | **F4** | ✅ **RESUELTO y VERIFICADO (cierre 13).** TikTok atraviesa el embudo: 17→11→4→**1 candidato final, el #1** (@nadirainwonderland heat 0.825). | 15 creadores TT en asignar · armar-candidato 1 TT + 3 IG | ✅ cerrado |
> | **F5** | ✅ **RESUELTO (cierre 13).** El Gate emite 4 items con scores reales 0.7–0.85 (no `[{}]`). | gate-de-relevancia.json=4 items | ✅ cerrado |
> | ✅ | IG Hashtag `reels` (#23) funciona: los 30 son `type:Video`. | ighashtags types={Video:30} | resuelto |
> | 🔵 | **El refactor de relevancia trabaja:** el Gate tiró los 2 TikTok de más views del run (@emmastoomuch 3.5M/heat 1.99, @mayaaa_speaks 2.7M/heat 1.96) = viral-off-topic muerto. **Pero no logea descartes** → instrumentar antes de calibrar. | heatscore top2 TT ausentes del gate | mejora |
>
> **Checklist nodo-por-nodo A1–D4** (definido por Mani, sesión previa; estado al cierre 12). Mapeo Fs↔ítem:
> **F1=B2 · F2=A2+B1 · F3=A1 · F4=consecuencia de B2 · F5=C4**. **⚠️ A/B1/C/C4 se leyeron de snapshots del
> run VIEJO (pre-F1, pasadas separadas);** los conteos del embudo (B3, C1 30→3, C4) hay que **re-leerlos del
> run post-F1** (el embudo será coherente). Los campos del actor (A1–A4, idiomas) no dependen de F1.
>
> **Bloque A — Ingesta Apify (qué entró). ✅ COMPLETO (A1/A2 cierre 11; A3/A4 cierre 12).**
> - **A1 `apify-igreels` (40): ✅** owners={bayavoce:40} → **1 de 7 referentes aporta** (=F3/#24); `type:Video` 100%; `followersCount` presente (#22, bayavoce 360200).
> - **A2 `apify-ighashtags` (30): ✅** ahora `type:Video` 30/30 (fix #23 OK) **pero sin métricas** (no `followersCount`/`videoViewCount`/`videoDuration`, solo `metaData`) → **rankean ciegos** (=F2). Límite del actor, no bug.
> - **A3 `apify-tiktok` (40): ✅ data sana** — campos completos (huecos menores: `text` 39/40, `signature` 36/40); idioma **36 `en` + 4 `un`, limpio** (sin ruido hi/pl/en de IG-Hashtag); recencia **39/40 ≤30d** (1 stale 2021); on-topic 100%; 0 ads/sponsored/slideshow. **Confirma F4 = puro F1** (la data nunca fue el problema). 🔵 **Mejora candidata:** el actor trae `textLanguage` nativo pero `Normalizar TT` lo ignora → idioma cae a `guessLang` (caso #7 para TikTok).
> - **A4 `apify-tiktokperfil` (`[{}]`): ✅** inocuo (0 referentes TT). Con el nuevo `Merge TT` se anexa 1 item basura → `Asignar` lo dropea por `!d.url`.
>
> **Bloque B — Normalización + asignación. ✅ COMPLETO (cierre 13).**
> - **B1 `normalizar-ig` (70): ✅** concatena reels+hashtag; los 37 bayavoce traen `seguidores` poblados (#22 OK, 360238), los 30 hashtag con `seguidores=0` (F2, límite del actor).
> - **B2 `normalizar-tt` (41): ✅ F1 RESUELTO** — 40 TikTok + 1 perfil basura; `idioma_nativo` ya presente (#7 aplicado).
> - **B3 `asignar-proyecto+voz` (84): ✅** 67 IG + 17 TikTok, todos a "Comunicación de parejas" (único proyecto activo). IG: 37 bayavoce + 30 hashtag-cuentas; TikTok: 15 creadores distintos. Recencia dropeó 3 bayavoce (40→37) y ~24 TT (41→17).
>
> **Bloque C — Relevancia + scoring. ✅ COMPLETO (cierre 13).**
> - **C1 `pretrim-relevancia` (84→45): ✅** mata los 30 hashtag-IG (semántico, captions no-inglés) + ~9 más. **Sigue sin logear descartes** → instrumentar antes de calibrar.
> - **C2 `heatscore-v1` (10): ✅** top-4 son TikTok (heat 1.85–1.99), luego 6 bayavoce (1.5–1.81); `viral_por_tamano` marcó solo a @sabrina.zohar (1.7M). **Dos escalas conviven** (heatscore métrico 1.5–2.0 vs armar-candidato composite 0.6–0.83 con relevancia) → confirmar que no es bug.
> - **C3 `transcribir-supadata` (10) + `traducir` (10): ✅** los 4 TikTok transcribieron (191–836c, idi_det=en); 4/6 bayavoce sí (719–1228c), 2 con `script_len=0` (Supadata falló → fallback caption).
> - **C4 `gate-de-relevancia` (4) + `armar-candidato` (4): ✅ = F5 cerrado.** Gate 10→4 (rel 0.7–0.85); tiró los 2 TikTok de más views (viral-off-topic) + 4 IG. armar-candidato: 1 TT (#1) + 3 bayavoce, todos con `relevancia_score`.
>
> **Bloque D — Cierre + cross-check en vivo. ✅ COMPLETO (cierre 13). PAT Airtable + service_role Supabase en mano, A ROTAR.**
> - **D1 Airtable `Candidatos`: ✅** 4 records, calzan exacto con `armar-candidato` (rel 0.85/0.75/0.8/0.7, heat, razón, links proyecto+voz, thumbnail). `Candidatos` no tiene campo `plataforma` (no es bug, no está en el esquema).
> - **D2 Supabase `runs`: ✅** run `31e3d2be` (22:32 Bogotá) `estado=ok`, `fin` poblado (no zombie); `metricas` calza: colectados=111 (=70 IG+41 TT), filtrados=10, outputs=4.
> - **D3 Supabase `outputs` ✅ RESUELTO (cierre 14) + `processed_items` ✅.** Era: el nodo 31 (`Reportar outputs`) hacía `POST` **sin `on_conflict`** (dev-doc:124); 3 de 4 ext_ids ya existían → **batch entero 409** → continue-on-fail → no entró nada. **Fix (commit 76ea422):** `POST outputs?on_conflict=external_id` + `Prefer: resolution=ignore-duplicates,return=minimal`, simetría con el archivado (nodo 11, migración 005). Con fan-out (ADR-013) los ext_ids repetidos entre proyectos son normales → el fix es doblemente necesario. Falta verificar en re-import que los outputs entran. `processed_items`=10 coherente.
> - **D4 Veredicto:** **bug de código** → F1/F4/F5 ✅ + **F3 ✅** (era `f.proyecto[0]`, no config) + **D3 ✅** (idempotencia nodo 31), todos cerrados al cierre 14. **config Airtable** → 0 referentes TikTok (sembrar). **límite del actor** → F2 (IG-hashtag sin métricas). **producto** → decidir IG-hashtag (abierto).
>
> **✅ F3 cerrado (cierre 14) — la respuesta no era ninguna de las hipótesis del re-diagnóstico.** No era recencia, ni privados, ni handle mal escrito, ni el actor: era un **bug de `Armar plan de corrida`** (`f.proyecto[0]` tomaba solo el primer proyecto ligado; si está inactivo, el referente se descartaba antes de Apify). jefferson y howtoconvince tienen contenido reciente (de hoy) en IG pero **nunca se consultaron**. Fix 1 aplicado (commit 76ea422). Verificar en el re-import que `apify-igreels` trae owners de los 3 handles, no solo bayavoce.
>
> **🔑 Decisión clave abierta (cierre 13) — eje hashtag, NO simétrico.** **Retirar/apagar IG-Hashtag** (actor IG sobre `explore/tags/` devuelve items sin métricas + multiidioma → 0 finalistas en 2 runs, gasta Apify) vía el toggle por-proyecto que ya existe. **Conservar TikTok-Hashtag** (actor clockworks devuelve métricas completas + inglés on-topic → produjo el candidato #1; única fuente TT hoy). La idea de "hashtag solo como contexto/refuerzo para el gate" no es viable tal cual (los items IG-hashtag ni llegan a transcribirse, el pretrim los mata antes). Mani lo decide sin apurar.
>
> **📋 TODO Airtable (pedido de Mani, cierre 13) — al cerrar todo:** revisión general de la base para dejar solo lo relevante. Concreto ya detectado: borrar de `Referentes` los campos `seguidores`/`flag_viral` (nunca se llenan — el motor solo **lee** Referentes, esos datos viven en `processed_items`/`outputs.metadata` por-contenido, dev-doc:207).
>
> **Notas de los Actores Apify (cierre 13):** ambos aceptan arrays. **clockworks (TikTok):** `hashtags:[]` y `profiles:[]` muchos a la vez; hashtags = OR/unión (1 video califica por ≥1). **apify/instagram-scraper:** `directUrls:[]` muchos a la vez — IG-Hashtag ya pasa todos los hashtags juntos; IG-Reels va de-a-1 **por el `Split`**, no por límite del actor. Params clave: semilla (`directUrls`/`profiles`/`hashtags`), `resultsType:'reels'` (#23), `resultsLimit`/`resultsPerPage`, `onlyPostsNewerThan`.
>
> Cuando el embudo mezcle IG+TikTok (post-F1): **calibrar** pesos/rubric con data real; resolver
> **pendientes pre-cron** (#4 paginación, #5 tope dedup, #9 OAuth Sheets); después **D1–D3** de activación.

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
| D0 | **Limpieza pre-producción (entregar limpio):** ✅ **limpieza HECHA (cierre 7)** — Candidatos de Airtable + config provisional (Proyecto/Voz/9 keywords/3 referentes) + `outputs`/`runs`/`processed_items` de Supabase **a 0** (conservados: `Ajustes`, esquema/vistas, `instances`/`clients`). **Config real YA sembrada (verificado cierre 9):** 3 proyectos (1 activo: *Comunicación de parejas*), 1 Voz ("Milena Morales", con criterios), 7 referentes IG / 0 TikTok, 4 keywords EN. **Falta:** criterios de relevancia por proyecto (hoy vacíos) + referentes TikTok. Último paso antes de activar crons. | V1–V6 | 🔧 | los 3 |
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

4. **✅ RESUELTO EN CÓDIGO (2026-06-23 cierre 15) — falta re-import.** Paginación `options.pagination`
   (offset) en las 4 lecturas del motor (`Leer Keywords/Referentes/Proyectos/Voces`) y las 3 del archivado
   (`Leer Proyectos/Voces/Candidatos`); los consumidores agregan todas las páginas con `.all().flatMap()`.
   *(Original: sin paginación → truncado silencioso a 100 records.)*
5. **✅ RESUELTO EN CÓDIGO (2026-06-23 cierre 15) — falta re-import.** `Leer procesados` ya no usa
   `limit=20000`; filtra `external_id=in.(<ids de la corrida>)` (de `$('Pre-trim relevancia').all()`).
   Dedup idéntico, query chica. *(Original: tope fijo 20 000 → dedup parcial al escalar.)*
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
21. **[Deuda técnica] Timeout estructural del Code node `Transcribir (Supadata)`.** `N8N_RUNNERS_TASK_TIMEOUT=900` es el workaround temporal (activado en InstaPods, cierre 8). El problema de fondo: el Code node hace un for-loop secuencial de todos los items — con volumen crece lineal y eventualmente supera cualquier timeout. **Opción 3 — SplitInBatches (diseño aprobado 2026-06-17, no implementado):** reemplazar el loop con 4 nodos: `SplitInBatches(batchSize=1)` → `HTTP Request Supadata` → `Code parsear respuesta` → `Wait 1.5s` → (loop) → `Traducir`. El timer de n8n se resetea por item, eliminando el techo duro independientemente del volumen. Conexiones: `Heat-score v1` → `SplitInBatches` (output 0 → cuerpo del loop; output 1 → `Traducir`). El nodo `Transcribir (Supadata)` se elimina. Detalle completo de topología en el chat del cierre 8. **Implementar cuando el volumen escale** (con top_n=2 actual no es urgente). No bloquea.

20. **Dos filas por video en `outputs`; las `draft` del motor nunca se cierran.** `external_id` tiene **dos
    semánticas** (ver [dev-doc §7](./dev-doc.md)): el **motor** escribe una fila `draft` con `external_id`=id del
    video (shortcode IG / id TikTok); el **archivado** escribe la fila calificada con `external_id`=id del record
    de Airtable (`rec…`). No colisionan (namespaces distintos) y las vistas de histórico/señal filtran
    `calificado_en is not null` → solo ven las del archivado. Pero las `draft` del motor **se acumulan sin
    cerrarse nunca**. Decidir si esa acumulación es traza deseada ("todo lo generado") o necesita cleanup/marcado.
    No bloquea.

22. **✅ FIX EN CÓDIGO (cierre 10) — `seguidores = 0` en IG (bug pre-existente, cierre 9). Falta re-import.**
    `Normalizar IG` leía `item.ownerFollowersCount`, pero `apify/instagram-scraper` (eje perfil) los devuelve en
    **`item.followersCount`** (y `item.metaData.followersCount`) — confirmado en `outputs/apify-igreels.json` 8/8
    (bayavoce: `followersCount: 360200`). **Consecuencias (resueltas para IG Reels):** `engagement_rate` caía al
    fallback `'0'` y `viral_por_tamano` (`>700k`) nunca se cumplía → reels sub-rankeados vs TikTok. **Fix aplicado:**
    `const seguidores = item.followersCount || item.ownerFollowersCount || (item.metaData && item.metaData.followersCount) || 0;`
    (validador 972/0). **⚠️ La rama IG Hashtag NO se arregla con esto:** sus items no traen ningún campo de
    seguidores (ni `metaData`) — ver #23. **`bio` tiene el mismo bug y queda pendiente:** `Normalizar IG` lee
    `item.ownerBio` (no existe) → `bio=''` siempre; real `item.biography`/`metaData.biography`; alimenta `guessLang`.
    **✅ `bio` también aplicado (cierre 10):** `bio: item.biography || item.ownerBio || (item.metaData && item.metaData.biography) || '',`.
    Ambos fixes en código (validador 1008/0), **falta re-import**.

23. **🔶 IG Hashtag = eje muerto → cambiado a `reels` en código (cierre 10), falta verificar en vivo.** El nodo
    `Apify — IG Hashtag` traía `resultsType:'posts'` → **fotos/carruseles** (`Image`/`Sidecar`, 0 videos en
    `outputs/apify-ighashtags.json`) → el guard de video de `Normalizar IG` los descartaba los 8 → aporte **0**.
    **Decisión de Mani (opción A): cambiado a `resultsType:'reels'`** (validador 1008/0). **⚠️ Falta verificar en la
    próxima corrida** que (1) el actor respete `'reels'` sobre URLs `explore/tags/` (devuelva videos, no fotos) y
    (2) qué métricas trae: en modo `'posts'` los items de hashtag venían **sin** `followersCount`/`videoViewCount`/
    `videoDuration`/`metaData` (solo `ownerUsername/FullName/Id`) → si en modo `'reels'` siguen sin métricas, esos
    items rankean ciegos (`seguidores=0`, `reproducciones=0`, solo likes+comments) y habría que decidir si vale la
    pena el eje (opción B: retirar IG-hashtag, dejar IG solo-perfil). No bloquea.

24. **🟠 `ig_results_limit` se lo come un solo referente (encontrado cierre 10).** Con `Resultados Instagram por
    corrida = 8` y 7 referentes IG activos, `outputs/apify-igreels.json` trajo **8 reels todos de @bayavoce** → las otras
    6 cuentas quedaron sin cupo. Es parte estructural del "IG no aporta". Verificar cómo aplica el actor `resultsLimit`
    (¿global vs por `directUrl`?) y subir el límite o repartir por cuenta. Sumado a la ventana `dias_recencia=75`
    (cortó ~3 de los 8 reels, viejos de 2025), el eje IG-perfil entrega poquísimo. No bloquea.

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

**🟣 Del checkup con el jefe + equipo de redes (18-jun) — pendientes nuevos:**

> 10 puntos que salieron en la reunión (Andrés + Majo + Jero). Varios son **externos al repo** (Airtable /
> dashboard / curación de datos): se anotan igual porque son el **gate de lanzamiento** real. Cada uno con
> dónde se revisa en el plan. Decisión transversal de Dani: **nadie usa la herramienta hasta que la interface
> esté lista** (#32).

25. **Hashtags más útiles — scraping más semántico/ajustable.** El hashtag literal trae ruido
    (`communication` → videos de autismo). Hoy `Armar plan` mapea cada keyword a un hashtag literal y Apify
    busca por ese tag. Falta criterio más semántico y ajustable por el equipo. 📍 **Plan:** Bloque A (ingesta
    Apify) + §Producto/alcance (modelo de búsqueda); emparentado con #16 (multi-palabra) y #26. **Límite:**
    depende de lo que el actor de Apify permita filtrar en origen (puede que el grueso del filtro tenga que vivir
    en el pre-trim, ver #26).
26. **Hashtags con fuerza semántica en pre-trim + gate.** Que la relevancia se juzgue contra el script/caption
    del video (contexto, sinónimos), no contra el hashtag literal ni por match exacto. Impacta directo el
    `relevancia_score` de Claude. 📍 **Plan:** Bloque C (Pre-trim relevancia + Gate de relevancia) +
    [refactor-relevancia.md](./refactor-relevancia.md). Es extensión del doble gate ya construido: el
    `criterios_relevancia` por proyecto debería incorporar el intent del hashtag/keyword.
27. **ML del modelo — que aprenda de patrones de éxito, no solo lea aprobados.** Ya parcial: al inicio el motor
    lee la señal de seleccionados como referencia. Falta que **analice activamente los patrones** de los videos
    exitosos y ajuste el scoring. 📍 **Plan:** O7 / señal de aprendizaje (ADR-012, `v_senal_seleccion`/
    `v_senal_tema`, el factor `sel` del Heat-score). Hoy la señal es una tasa de selección lineal por
    referente/tema; "analizar patrones" es el salto post-MVP del learning loop.
28. **Idioma: prioridad fuerte a lo extranjero sobre el español (aclarado por Mani).** No es filtro duro ni
    solo-inglés: dar **mucha más prioridad a cualquier idioma no-español** que al español. 📍 **Plan:** Bloque C /
    #18 (idioma) — el mecanismo **ya existe** (`boost_idioma` binario en Heat-score: es=0, cualquier no-es=+boost,
    default 0.3). Para "mucha prioridad" basta **subir `boost_idioma` en Ajustes** (no-code); si el boost binario
    se queda corto se evalúa amplificarlo (multiplicador mayor / boost por idioma, ver #18). **Sin filtro duro de
    español.**
29. **Verificar proyecto y voz en TODO script saliente.** Crítico para correr varios proyectos/voces en
    paralelo: cada script que sale del pipeline debe llevar **proyecto y voz correctos** en metadata. 📍 **Plan:**
    Bloque D (cross-check) + ADR-012 (traza tema/proyecto/voz: `Asignar proyecto+voz` → `Armar candidato` →
    `Candidatos` → archivado → `outputs.metadata`). Verificable en código + en el cross-check D1/D3. Hoy solo
    parejas está activo → el riesgo aparece al activar múltiples proyectos.
30. **[EXTERNO al repo — Airtable] Dashboard visual para Majo/Jero.** Vista amigable sin tocar el backend.
    📍 **Plan:** operación/equipo de redes ([onboarding-equipo-redes.md](../onboarding-equipo-redes.md)) +
    contrato [airtable-cockpit.md](../../core/contracts/airtable-cockpit.md) (sin romper el modelo) + D1. Paraguas
    con #31 y #32.
31. **[EXTERNO al repo — Airtable] Vista por voz/avatar + bloquear pestaña Ajustes.** (a) Filtro para ver solo
    candidatos de un proyecto/avatar (pedido directo de Majo). (b) Bloquear la pestaña Ajustes (pesos, mínimos,
    relevancia mínima, candidatos por proyecto, resultados Apify): configurable pero peligrosa si la tocan sin
    saber. 📍 **Plan:** contrato airtable-cockpit.md + onboarding + O11. Permisos/vistas de Airtable, no código.
    Atado a multi-proyecto (#29).
32. **[EXTERNO al repo — gate de lanzamiento] Interface user-friendly antes de lanzar.** Majo/Jero no tocan la
    herramienta hasta que esté lista. Es el **gate real de lanzamiento**. 📍 **Plan:** O11 + D1 (activación).
    Paraguas de #30/#31.
33. **[FUTURO, no MVP] Perfilador de avatar.** Herramienta que perfile al avatar del cliente y sugiera
    referentes con más autonomía (pedido de Jero). 📍 **Plan:** backlog post-MVP, fuera del alcance actual.
    **Lo concreta #35** (descubrimiento de creadores como output revisado).

> **🎯 DIRECCIÓN (Mani, 2026-06-23) — embudo de dos etapas: descubrir creadores ≠ curar contenido.**
> Pedida después de plantar la macro-estructura (NO antes del V1; el núcleo se valida con el modelo
> actual). Hoy la **keyword hace doble trabajo**: descubre videos nuevos (hashtag-search) Y atribuye/
> rankea. La dirección separa los dos trabajos en dos etapas y cambia el rol de las keywords:
>
> - **Etapa A — descubrimiento de CREADORES (output nuevo, revisado).** La búsqueda amplia (hashtag,
>   todos los idiomas) deja de alimentar Candidatos directo; pasa a proponer **referentes potenciales**
>   en un output aparte que marketing revisa y decide promover (o no) a la pestaña `Referentes`. La lista
>   de referentes se vuelve un **activo curado que compone**. Mete al humano en el loop justo en la parte
>   ruidosa (vetting de cuentas nuevas) en vez de dejar el ruido entrar al stream de candidatos.
> - **Etapa B — curación de CONTENIDO (el motor actual, pero solo-referentes).** Con referentes ya
>   curados, el motor de contenido busca **solo por referentes**. Las keywords dejan de ser eje de
>   descubrimiento.
> - **Keywords → criterios de relevancia estructurados.** La pestaña `Keywords` se transforma (o se
>   reemplaza) por una de **criterios**, cada entrada con campos **Sirve / No Sirve / Keywords / etc.**
>   Reemplaza el `criterios_relevancia` de texto libre por algo estructurado y no-code-friendly que afina
>   pre-trim + gate (el campo **No Sirve** = criterio negativo explícito, justo lo que mata el viral-off-
>   topic). Subsume **#25/#26** (hashtags con fuerza semántica) y la idea previa de "keywords → criterios".
>
> **Por qué es coherente:** resuelve la objeción de "solo-referentes mata TikTok" — TikTok no muere
> porque la búsqueda por hashtag **sigue existiendo**, solo que alimenta el descubrimiento de creadores
> (Etapa A), no los candidatos. Es el loop que hoy falta: descubrir creadores (amplio, humano-vetted) →
> minar contenido (curado). **Notas/riesgos a resolver al construir:** (a) el stream de creadores igual
> necesita un filtro de relevancia o inunda a marketing de ruido (reusar la lógica del gate, no el
> hashtag crudo); (b) **dedup** — creadores ya en `Referentes` no deben re-surgir; (c) build grande
> (tabla/vista "Creadores propuestos" + superficie de review + reestructurar `Keywords` → `Criterios`).
> **Post-MVP, después del núcleo en producción.** Concretiza **#33** y absorbe el "descubrir cuentas
> nuevas" de **#17**.

34. **[Producto, post-MVP] Keywords → pestaña de criterios estructurados (Sirve/No Sirve/Keywords).**
    Reemplaza `criterios_relevancia` (texto libre por Proyecto/Voz) por filas estructuradas que el equipo
    llena no-code. Afina pre-trim + gate; el campo **No Sirve** da criterio negativo explícito. Las
    keywords dejan de ser eje de descubrimiento (ver Etapa B de la DIRECCIÓN arriba). Subsume #25/#26.
35. **[Producto, post-MVP] Descubrimiento de creadores como output revisado.** El motor usa la búsqueda
    por hashtag (todos los idiomas) para proponer **referentes potenciales** en un output aparte; marketing
    elige cuáles promover a `Referentes`. Concretiza #33 y el "descubrir cuentas nuevas" de #17. Requiere:
    tabla/vista de creadores propuestos, filtro de relevancia propio (no hashtag crudo), dedup contra
    `Referentes` ya cargados.

## Log de avance (más reciente arriba)

### 2026-06-23 (cierre 18) — Run de Fase 3 diagnosticado + bug fan-out×dedup arreglado *(Mani + Claude)*

**Qué se hizo.** Diagnóstico punta a punta del run de Fase 3 (2 proyectos *parejas*+*empresas*, `top_n=10`,
`dias=200`, referentes compartidos) sobre `outputs/*.json` + cross-check Supabase/Airtable con credenciales
vivas (PAT/service_role inline, **A ROTAR**).
- **Lead inicial (transcripción vacía 0/20):** descartado que fuera Supadata o créditos — era la
  `SUPADATA_API_KEY` **sin llenar** en el workflow. Mani la puso y re-corrió.
- **Run con key — verificado:** transcripción 19/20 (el vacío = fail-open, video sin voz), script ES 19/20
  (Haiku literal), **fan-out ADR-013** (video compartido `7629904064448449814` → entra por 2 proyectos a
  `Asignar`, queda 1× en candidatos porque el gate filtró la copia de *empresas* — grado 1 OK), **recencia 200**
  (corte capa 2 en `Asignar` elimina los 41 TT all-time + 4 IG viejos; `Asignar`/pretrim quedan 0 fuera de
  200d), embudo `360→304→264→20→10→10` cruza exacto con `runs.metricas`.
- **Limpieza DB pre-redo:** Mani pidió borrar "este run", eligió alcance "solo Fase 3" → borrados 10 Candidatos
  Fase 3 (Airtable) + su fila `runs` (Supabase); V1 intacto (6 candidatos, run, 10 `processed_items`).

**Bug encontrado y arreglado — fan-out × dedup #5.** El run escribió **0 `processed_items`** (debía ~20). Raíz:
`POST processed_items` usaba `Prefer: resolution=ignore-duplicates` **sin `on_conflict` en la URL** → INSERT
plano → la `unique(platform, external_id)` (schema 002:25) tiraba 409; el fan-out mete el video compartido **2×
en el mismo batch** (Heat-score 20 filas / 19 únicos) → duplicado intra-batch → batch entero rebota →
`onError continueRegularOutput` traga el 409. Confirmado por el output del nodo (`duplicate key value violates
unique constraint processed_items_platform_external_id_key`). El V1 no lo pegó (1 proyecto = sin duplicado
intra-batch). **Fix** (`workflow.json:706`, builder/convención): `?on_conflict=platform,external_id` → emite
`INSERT … ON CONFLICT (platform,external_id) DO NOTHING` (tolera intra-batch + cross-run); mismo patrón que
archivado nodo 11 y `Reportar outputs` (D3 cierre 14); cumple lo que el schema 002:30 ya documentaba. Diff 1
línea, validador **1143/0**.

**Gotcha / aprendizaje.** El re-dump completo del `workflow.json` con `json.dump` **no es surgical** acá: el
archivo mezcla 24 escapes `\uXXXX` con 87 chars unicode crudos → cualquier dump reformatea 100+ caracteres. Para
un cambio puntual de URL conviene un Edit de string exacto (diff 1 línea) en vez del builder full-dump, validando
después que el JSON parsee + connections + jsCode. (Los 4 "FALLA" de `new Function()` sobre los Code nodes son
falsos positivos: usan top-level `await`, válido en n8n.)

**Qué quedó a medias.** El fix de dedup **sin commit** y **sin verificar en vivo** (necesita re-import + Execute).

**Qué sigue.** Reorganizada §Próxima sesión en **una sola lista consolidada A–G** (todo lo que falta para
producción, antes disperso). Camino crítico: A (verificar el fix en vivo) → B (archivado + #9 OAuth + error
workflow, los menos validados). El refactor de búsqueda #34/#35 queda explícitamente **post-MVP**. Sugerido
`/diagnose` si el re-import no puebla `processed_items`.

### 2026-06-18 (cierre 9) — Fix reels-only + auditoría del estado vivo *(Mani + Claude)*

- **Problema (Mani):** IG traía posts normales (fotos/carruseles) que no se pueden transcribir; solo
  TikTok traía videos. Objetivo: que el motor traiga **únicamente reels, 0 fotos**.
- **Fix en `workflow.json` (2 cambios, por script — convención del motor):**
  - `Apify — IG Reels` (eje perfil): `resultsType: 'posts' → 'reels'`. El mismo `apify/instagram-scraper`
    soporta `'reels'` → trae reels al origen, sin gastar Apify en fotos que después se descartan.
  - `Normalizar IG` (compartido por las 2 ramas IG): guard `if (item.type && item.type !== 'Video') return null`
    → descarta fotos/carruseles en perfil **y** hashtag. Garantiza el "0 fotos" aunque el actor traiga otros tipos.
  - Validador **972/0**, JSON + jsCode parsean. **SIN re-import aún** (corre en n8n).
- **Jerarquía de criterios explícita en el prompt (pedido de Mani).** `Pre-trim` y `Gate` pegaban
  Proyecto+Voz planos (mismo peso). Ahora etiquetan: `CRITERIOS DE TEMA (principal)` = criterio del
  Proyecto, `AJUSTE DE VOZ (complementa, no manda)` = criterio de la Voz; el `sys` aclara "el TEMA manda".
  Sin criterio de Proyecto (como hoy) sigue cayendo solo la Voz (fail-open intacto). Validador 972/0.
- **Sobre `instagram-reel-scraper` (sugerido por Mani):** descartado. Su input es solo perfil/username/URL
  (no descubre por hashtag → no cubre el nodo *IG Hashtag*), y su schema distinto rompería el `Normalizar IG`
  compartido. `resultsType:'reels'` en el actor actual logra lo mismo sin sumar dependencia. Pendiente menor:
  verificar si la rama *IG Hashtag* respeta `'reels'` sobre URLs `explore/tags/` (hoy queda `'posts'`+guard).
- **Auditoría del estado vivo** (PAT + service_role por curl, **inline, nunca a disco** — a rotar):
  - **El "8 vs 4" del cierre 8 NO es bug de `top_n`.** `runs` reales: `{outputs:4, filtrados:4, colectados:25}`
    (= 2 proyectos activos × top_n 2, correcto) y `{outputs:2,...}`. Los 8 candidatos en Airtable son
    **acumulación entre corridas** (Candidatos no se purga hasta que el equipo califica → el archivado borra).
    Verificación limpia: vaciar Candidatos + correr 1 vez.
  - **🔴 Hallazgo nuevo: `relevancia_score=null` en los 8 candidatos** → el `Gate de relevancia` no puntúa.
    Probable `<ANTHROPIC_API_KEY>` vacía en el workflow corrido (sandbox "Motor de Reels - Prueba") o Haiku
    fallando → fail-open. **El refactor de relevancia está inerte en producción.** A verificar antes del run.
  - **`criterios_relevancia` vacío en los 3 proyectos**; solo la Voz "Milena Morales" tiene criterios. El gate
    corre sobre la Voz, pero falta la rúbrica de tema por proyecto.
  - **Config real sembrada** (supera el "pendiente" del cierre 7): 3 proyectos (activo: *Comunicación de
    parejas*, top_n 2; *empresas* y *líderes* inactivos), 7 referentes IG / **0 TikTok**, 4 keywords EN, 12
    Ajustes en defaults. `outputs`: **29 drafts** acumulados (#20). 1 run colgado `en_curso` (#9 OAuth Sheets).
- **Corrida de prueba (misma sesión, ya con la config nueva):** Mani sembró los `criterios_relevancia` de los
  3 proyectos + movió la keyword "Corporate" a *empresas* + corrió. **Confirmado en vivo:**
  - **El Gate ya puntúa** (`relevancia_score: 0.65` en el candidato, con razón en español) → la key Anthropic
    quedó bien, el refactor de relevancia está **vivo**. (Antes salía null = inerte.)
  - **El `resultsType:'reels'` trae reels reales y on-topic** (item de bayavoce, referente IG: `type:Video`,
    `productType:clips`, `videoUrl`, 82s, caption de comunicación en pareja). Reels-fix validado en vivo.
  - **El "IG no aporta" era dedup**, no el actor ni el filtro: los reels de los referentes ya estaban en
    `processed_items` de pruebas viejas. **Se vació `processed_items` (33→0)** para el test limpio.
  - Salió **1 candidato** (TikTok, `emmastoomuch`, no-referente) — vino por el **fallback de proyecto único**
    (1 solo proyecto activo → todo lo no-matcheado cae en *parejas*), no por referente. `top_n=2` es techo, no
    objetivo: salió 1 porque el embudo solo produjo 1, no por el top_n.
  - El run quedó `en_curso` en Supabase = es el **archivado** colgado por OAuth Sheets (#9), no el motor (Mani
    confirmó que "Cerrar run" del motor sí completó).
  - **2 pendientes nuevos → §Próxima sesión #6 y #7:** bug `seguidores=0` en IG (§Mejoras #22) + capturar el
    embudo completo de Apify por conteos de nodo.
- **Qué sigue:** aplicar el fix de `seguidores` (#22) + re-import; capturar los conteos del embudo Apify;
  sembrar referentes TikTok; calibrar con data real. **Rotar PAT + service_role.**

### 2026-06-17 (cierre 8) — Primera corrida con config real + diagnóstico de timeout *(Mani + Claude)*

- **`N8N_RUNNERS_TASK_TIMEOUT=900` activado en InstaPods.** Agregado a `/etc/systemd/system/n8n.service`;
  daemon recargado (`systemctl daemon-reload`) y servicio reiniciado. La variable está activa. Eleva el techo
  del task runner de n8n que mataba el Code node de Transcribir antes de terminar el loop secuencial.
- **Workflow "Motor de Reels - Prueba" creado** como sandbox en n8n para testear modificaciones sin tocar
  el workflow principal. El workflow de producción queda intacto.
- **Logs de debug en Transcribir (Supadata).** Los `console.log` de timing ya estaban en el `workflow.json`
  del repo (commit `debug: logs de timing en Transcribir (Supadata)` de sesión anterior). Confirmado que el
  código está correcto pero **la UI de esta versión de n8n no muestra la pestaña "Logs" del Code node**
  (feature de versiones más recientes). Para leerlos: acceder a los logs del proceso n8n en el servidor.
- **Corrida de prueba: top_n=2, 2 proyectos activos.** Config real: "Comunicación de parejas" + "Comunicación
  en empresas". El workflow llegó a Airtable completo — `N8N_RUNNERS_TASK_TIMEOUT=900` resolvió el corte
  técnico. Hallazgos:
  - **🐛 8 outputs en vez de 4.** Esperado: top_n=2 × 2 proyectos = 4. Salieron 8. Causa desconocida.
    Hipótesis: el `top_n` puede estar operando sobre el pool combinado de ambos proyectos en vez de por separado,
    o el `Asignar proyecto+voz` está asignando items al proyecto equivocado, o el `Heat-score` no está
    separando bien por `proyecto_id`. **Investigar.**
  - **🐛 Instagram: sin transcripciones; Apify trae fotos.** Apify trajo posts de foto (no reels/videos) y
    contenido que no parece cercano a los proyectos activos. Supadata no puede transcribir fotos → transcripción
    vacía en todos los IG. Posibles causas: (a) `resultsType: 'posts'` en el actor trae todos los tipos de
    media sin filtrar por video; (b) los referentes IG sembrados no son cuentas relevantes para los proyectos.
    **Revisar configuración del actor Apify IG y los referentes sembrados.**
  - **✅ TikTok: transcripción OK.** Supadata transcribió correctamente los videos de TikTok. Un video era
    musical sin voz — Supadata transcribió la letra de la canción. Comportamiento correcto del fail-open (el
    Gate de relevancia lo filtraría si no cumple criterios).
- **Estado del problema de timeout.** `N8N_RUNNERS_TASK_TIMEOUT=900` es temporal: con más proyectos/items el
  techo vuelve a ser un límite. Documentada como **deuda técnica #21** la **Opción 3 — SplitInBatches**:
  reemplazar el for-loop del nodo `Transcribir (Supadata)` con un nodo `SplitInBatches(batchSize=1)` que itera
  externamente — el timer se resetea por item, elimina el techo duro. 4 nodos nuevos, 1 eliminado. Diseño
  completo (topología antes/después, conexiones, manejo del sleep) aprobado en el chat. **Implementar cuando
  el volumen escale**, no urgente hoy.
- **Qué sigue:** investigar los 8 vs 4 outputs; revisar config Apify IG (tipo de media + relevancia de los
  referentes sembrados); cuando el embudo sea estable, calibrar pesos/rubric con data real.

### 2026-06-17 (cierre 7) — Docs + verificación de Ajustes + cierre de manuales *(Mani + Claude)*

- **Fase 2 del handoff (anotaciones pendientes):** corregido `33→34 nodos` en
  [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md) y [PLAN.md](../../PLAN.md)
  (el conteo real son 34). Agregada la **#20** a §Mejoras: las `draft` que el motor escribe en `outputs`
  **nunca se cierran** (la doble semántica de `external_id` deja 2 filas por video — dev-doc §7). Los 🔴
  manuales y los ✅ de §Mejoras se dejaron como están (varios "resueltos" son parciales; el registro tachado
  sirve de arco problema→fix).
- **Ajustes (ADR-011) verificado punta a punta — pedido de Mani.** Contra la base viva + el `workflow.json`:
  tabla `Ajustes` con **12 filas** (claves+valores = defaults); `Leer Ajustes` → `Armar plan` normaliza cada
  `clave` con `_nrm` (lower + strip acentos) y la mapea con `AJUSTE_MAP` → **12/12 match, 0 huérfanos**
  (incluidos los casos peludos: "TikTok", "interacción", "mínimo"). El plan expone `ajustes`; Heat-score y Gate
  hacen `cfg = Object.assign({}, Config, ajustes)` → los ajustes **pisan** los defaults, **fail-open** (clave
  faltante/vacía/mal escrita → cae al literal del código). Consumo confirmado de los 12 knobs: 8 en Heat-score,
  2 en Gate (`peso_relevancia`/`min_relevancia`), 2 (`ig/tt_results_limit`) en los 4 Apify. **Ningún knob muerto.**
  Correcto en código; **falta probarlo en una corrida real** (depende del re-import + V-run).
- **🔴 manuales del cierre 6 — cerrado el #1.** Mani aplicó `005`+`006` en el SQL Editor; **verificado en vivo:**
  `v_senal_tema` pasó de **404 → 200** (existe, vacía — correcto, sin calificados aún) y el índice
  `outputs_external_id_key` quedó **completo** (`CREATE UNIQUE INDEX ... (external_id)` sin `WHERE`) → el
  `on_conflict` del archivado ya no dará `42P10`. Quedan: **#2** re-import + V-run (en curso, camino crítico),
  **#3** Referentes TikTok (lo carga el equipo de redes en Airtable), **#4** rotar credenciales (en producción).
- **Onboarding del equipo de redes:** se va a compartir como **Google Doc** + acceso al Airtable para que el
  equipo junte la config real. El doc **ya existía** ([docs/onboarding-equipo-redes.md](../onboarding-equipo-redes.md));
  detectado que quedó **stale tras el cierre 6**: dice "5 tablas" (ya son 6, falta la **Ajustes**) y describe el
  descubrimiento **asimétrico** (IG=cuentas / TikTok=hashtags) como tope, cuando el cierre 6 construyó el
  **simétrico** (sin validar en vivo aún). **Decisión: actualizarlo DESPUÉS de la V-run** (no antes, para no
  prometerle al equipo algo no probado). *(Claude creó por error un duplicado `onboarding-redes.md` sin chequear
  que ya había uno → descartado en el acto.)*
- **Diagnóstico de la base viva** (PAT + service_role — **a rotar**): 1 proyecto provisional ("IA y Productividad"),
  1 voz provisional, 9 keywords, **3 referentes IG / 0 TikTok**, 9 candidatos de prueba; 24 filas en `outputs` y
  varias runs de archivado colgadas en `en_curso` (síntoma del OAuth de Sheets, #9).
- **D0 — limpieza ejecutada (Mani lo pidió tras compartir el cockpit).** Vía API: Supabase `outputs` 24→0,
  `processed_items` 40→0, `runs` 7→0 (orden FK; `processed_items` vacío = el primer run real no saltea por dedup);
  Airtable `Candidatos` 9→0, `Keywords` 9→0, `Referentes` 3→0, `Proyectos` 1→0, `Voces` 1→0. **Conservados a
  propósito:** `Ajustes` (12 knobs), estructura/campos/vista 🔥, y la identidad Supabase (`instances`/`clients`/
  `workflows`). Solo se borraron **registros**, nunca esquema. Cockpit en blanco para que el equipo cargue la config
  real siguiendo el onboarding. Falta la **siembra real** (segunda mitad de D0).
- **Pasada de integridad (para que el equipo tome esto sin sorpresas):** validador 972/0; `git grep` de los valores
  exactos en TODO el historial → **ningún token auth** (PAT/service_role) en ningún commit ni en el árbol. Única
  observación: el base ID de Airtable y el project-ref de Supabase (identificadores, no secretos auth) quedaron en
  2 commits viejos (`2224446`, `64023e4`) dentro de `temp/...json` antes de que `temp/` se gitignoreara. **Bajo
  riesgo** (sin tokens no abren nada) y **neutralizado al rotar credenciales**. Si se quiere higiene total = reescribir
  historia (`git filter-repo`/BFG) — **operación coordinada con el equipo, NO unilateral** (repo compartido).
- **Validación:** validador en verde (**972 checks, 0 errores**) + escaneo de secretos OK (las credenciales que pasó
  Mani por chat **no** se escribieron a disco; se usaron como env vars inline en `/tmp`, borrado tras correr).
- **Qué sigue:** **rotar PAT + service_role**; Mani re-importa el motor y corre la **V-run de re-validación** (ahora
  sobre data limpia) → revisar output como en el cierre 5; el equipo entrega el brief → **sembrar la config real**
  (segunda mitad de D0, incl. Referentes TikTok).

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
