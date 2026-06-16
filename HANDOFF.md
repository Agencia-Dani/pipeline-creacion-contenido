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
| D1–D3 | Activación: TZ validada + crons + manifest `active` + demo a Majo/Jero | V1–V6 | ⬜ | los 3 |

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
3. **`deploy.mjs` quedó obsoleto** para este motor (resolvía placeholders en voz/categorías). El MVP
   es 1 instancia editada a mano en el nodo Config. Rewrite multi-cliente = F5.

## Mejoras pendientes (motor completo — esto es lo que sigue)

> Carriles A, B y C cerrados: el motor entrega y el equipo cura. Lo de abajo **no bloquea el MVP**,
> son los límites conocidos del **modelo de búsqueda** que salieron al documentar el flujo para el
> equipo de redes (2026-06-16, verificado en `workflow.json` → nodo *Armar plan de corrida* + nodos
> Apify). Priorizar después de validar V1–V6.

**Cómo busca hoy el motor (asimétrico por plataforma):**
- **Instagram = por cuenta.** Baja los posts recientes de cada `Referentes` con `plataforma=instagram`
  (`directUrls`, `searchType:user`). Las **Keywords NO aplican a IG**: un reel entra por venir de una
  cuenta seguida, tenga o no las palabras.
- **TikTok = por hashtag.** Busca con las `Keywords` (cada `termino` → un hashtag). Es un **OR**: entra
  el video con **al menos una** keyword, no todas. Un TikTok sin esos hashtags es invisible al motor.
  *(Las keywords tienen un uso secundario en el heat-score: el "boost de tema" matchea la descripción,
  pero solo ordena, no filtra.)*

**Mejoras:**
1. **Scrapear Referentes de TikTok por perfil.** Hoy las cuentas con `plataforma=tiktok` se ignoran (el
   código las junta en `tt_handles` pero no las usa). Requiere un actor de perfil de TikTok en Apify.
   Sin esto, en TikTok solo se pueden seguir hashtags, no cuentas.
2. **Keywords multi-palabra.** La keyword se pasa como hashtag literal → una palabra (`liderazgo`)
   matchea, una frase con espacios (`liderazgo efectivo`) no. Mejora: tokenizar/mapear frases a
   hashtags o buscar también por texto. Mientras tanto: cargar Keywords como hashtags de una palabra.
3. **Instagram por tema/hashtag (descubrimiento).** Hoy IG solo trae lo de cuentas ya seguidas. Para
   descubrir cuentas nuevas por tema (no solo curar a las conocidas) habría que scrapear IG por hashtag
   además de por cuenta.
4. **Idioma: detección limitada + boost binario** (nodo `Heat-score v1` + `Config.boost_idioma`).
   - El **boost es binario**: español = 0, cualquier no-español = `+boost_idioma` (0.3 default). No
     distingue inglés/portugués/etc., los premia igual. Mejora: boost por idioma con pesos propios.
   - La **detección** (diccionario `DICT` de stopwords en `Heat-score v1`) solo conoce **es/en/pt/it/fr**.
     Un video en otro idioma (alemán, japonés…) cae a `es` por defecto y **no recibe boost**. Mejora:
     ampliar el `DICT` o detectar con librería/LLM. *(Premiar más fuerte lo no-español sí se puede ya,
     sin tocar código: subir `boost_idioma` en el nodo `Config`.)*
5. **No hay forma de que el equipo de redes ajuste los parámetros del scoring.** Hoy los knobs
   (`peso_views`/`peso_likes`/`peso_eng`, `boost_tema`, `boost_idioma`, `umbral_viral`, `top_n_fallback`
   y la lista de idiomas) viven en el motor: los pesos/boosts en el nodo `Config`, pero la lista de
   idiomas hardcodeada en el `DICT` del nodo `Heat-score v1`. Cambiar cualquiera requiere un dev
   editando n8n. **Puede quedar dev-only, pero debería ser fácil:** (a) sacar el `DICT` de idiomas a
   `Config` para que todos los knobs vivan en **un solo lugar obvio**; (b) idealmente, mover esos
   ajustes a una tabla **Ajustes** en Airtable (no-code, consistente con el resto del diseño) para que
   el equipo los toque sin depender de un dev. Mientras tanto, documentar dónde está cada knob.

### Auditoría técnica 2026-06-16 — limitaciones de correctitud/rendimiento *(Claude)*

> Pasada completa sobre los artefactos reales (`workflow.json` del motor y del archivado, schemas
> `001`–`004`, `validate.mjs`, manifests). Ordenado por impacto. **#1, #2, #4 y #9 deberían cerrarse
> ANTES de activar los crons (D1–D3): son los que fallan en silencio en producción.**

**🔴 Crítico (correctitud / rompe en prod):**

1. **El validador del proyecto está en rojo (13 errores).** `node core/scripts/validate.mjs` falla
   (además requería `npm install` en `core/scripts`, que no estaba hecho). El protocolo dice que
   escanea secretos "en cada corrida" → hoy no protege de nada. Causas: (a) `workflow-archivado/`
   **no tiene `workflow.yaml`** (carril C fuera del contrato); (b) el manifest de `short-form-content`
   usa stages inventados (`config/scorear/dedup/transcribir/traducir/registrar`) en vez de las 8
   canónicas, le falta `inputs.client_config` e `inputs.filters`, y `registered: supabase` es inválido
   (debe ser `pending|yes`). → Decidir: arreglar manifests al contrato, o actualizar el contrato al
   motor real.
2. **El archivado NO es idempotente si falla el borrado de Airtable.** Orden: `outputs → Sheet →
   borrar Airtable`. `Borrar de Airtable` no es continue-on-fail; si el delete falla DESPUÉS del
   append, los records quedan en Airtable y la corrida siguiente los re-toma. Como `outputs.external_id`
   tiene índice UNIQUE (`outputs_external_id_key`, schema 001) y el POST no usa `on_conflict`, el batch
   entero falla en PostgREST → como `Registrar outputs` es continue-on-fail, sigue igual → **fila
   duplicada en el Sheet** y los candidatos nuevos del mismo batch **nunca llegan a `outputs`** (se
   pierden del histórico y de la señal de aprendizaje). Fix: `Prefer: resolution=ignore-duplicates` en
   el POST de outputs (igual que `processed_items`) y/o delete con reintento.
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
6. **Timeout de Apify de 120 s con `run-sync-get-dataset-items`.** El backfill inicial (`dias_recencia=180`)
   puede pasar los 2 min → el nodo hace timeout (`continueRegularOutput` → sigue vacío) **pero el run de
   Apify sigue y se paga**, entregando 0 candidatos sin error visible. Subir timeout o usar patrón async.
7. **Detección de idioma por conteo de stopwords (`guessLang`), default `'es'`.** Frágil: un video EN con
   pocas stopwords cae a `'es'` → se salta la traducción → el equipo recibe el script en inglés. Además el
   idioma alimenta un boost del heat-score. Usar el `lang` de Supadata como fuente primaria.
8. **`Merge transcripción`/`Merge traducción` por posición (`mergeByPosition`).** Recombina por índice; si
   Supadata reordena o cambia el conteo de items, pega la transcripción al metadato equivocado. Hoy se
   sostiene por `batchSize:1`+`neverError`, pero es alineación implícita peligrosa → merge por `external_id`.

**🟡 Medio (deuda / operativo):**

9. **OAuth de Google Sheets en modo "Testing" → vence cada 7 días.** El cron de archivado es diario →
   falla en silencio ~1 vez/semana hasta re-autorizar. Sumado a los créditos gratuitos de GCP ($300) que
   se agotan, el carril C tiene dos relojes corriendo. Publicar la app OAuth / mover a la cuenta GCP
   permanente ANTES de activar el cron.
10. **`Workflows/workflow-short-form-content/CLAUDE.md` está desactualizado.** Describe el template VIEJO
    (Claude **Sonnet** escritor, `Loop Over Items`+`Wait` 13s, prompt caching, categorías, salida a
    Sheets) — nada de eso existe en el `workflow.json` actual (Haiku traductor, sin loop, sin caching, sin
    Sheets). Trampa para el próximo dev. El README también está marcado como viejo.
11. **`core/scripts/deploy.mjs` es código muerto** (HANDOFF §3 lo declara obsoleto). Borrar o marcar claro.
12. **`outputs.external_id` siempre NULL en el motor** (`Preparar outputs Supabase` no lo setea) → el índice
    de idempotencia no protege re-ejecuciones manuales del motor (inserta duplicados).
13. **Percentiles del heat-score sobre muestras chicas** (IG ~8×3 + TT 30) → ranking ruidoso; `flag_viral`
    por seguidores (>700k) es proxy grueso. Modelo v1 conocido; documentar que es poco estable sin volumen.
14. **Metadata residual del template original** (`instanceId`, `tags`) quedó en el `workflow.json` del motor
    (líneas ~1283-1306). No es secreto, pero ensucia el diff.

## Log de avance (más reciente arriba)

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
