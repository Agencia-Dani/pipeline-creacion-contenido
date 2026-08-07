# ROADMAP — MVP de reels: el norte, los milestones y el checklist (3 devs)

> **El doc de trabajo del MVP.** Junta tres cosas que antes vivían separadas: la dirección del
> jefe (el norte), el plan por milestones y el checklist ejecutable. Fuentes: la
> [transcripción del visto bueno](./docs/transcripciones/2026-06-12-visto-bueno-workflow.md)
> (2026-06-12, sobre el [one-pager](./docs/one-pager-reels-mvp.md)) y
> [ADR-009](./docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md).
> **Si otro doc contradice el norte, gana el norte.** El sistema general (arquitectura,
> invariantes, fases post-MVP) vive en [PLAN.md](./PLAN.md).
>
> Regla de avance: ningún milestone se declara hecho sin cumplir su **"hecho cuando"**. Si una
> tarea exige tocar `core/` fuera de lo previsto, se para y se discute.
>
> **El estado vivo (quién tiene qué task, avance, log de sesiones) vive en
> [HANDOFF.md](./docs/agents/handoff.md)** — actualizalo al tomar un task y al cerrar cada sesión; los `[x]`
> de este checklist se marcan al completar.

---

## 1. El norte (lo que pidió el jefe)

**El objetivo en una frase:** una máquina que corre sola **y también a demanda** — busca videos de
referentes (priorizando otros idiomas), los ordena de caliente a frío, entrega cada uno
**transcrito/traducido al español** con link al original y al script, deja que el equipo de
redes (**Majo y Jero**) elija en el cockpit — y **aprende de esa elección** mientras todo queda en
un **histórico exportable a Excel**.

> **Enmienda 2026-07-15 (refactor Voces→Proyectos):** el cron semanal autónomo **coexiste** con un
> disparo **on-demand** (el equipo prende los proyectos que quiere, fija la N de cada uno, y corre con
> un botón — [ADR-023](./docs/adr/ADR-023-disparo-on-demand-boton-airtable.md),
> [ADR-024](./docs/adr/ADR-024-enmienda-adr016-n-por-proyecto.md)). El on-demand se **suma**; no retira
> al cron. Es el único punto del norte que este refactor mueve, y va con ADR.

✅ Visto bueno dado · ✅ flag viral confirmado como concepto (~700K marca "high-end", no excluye)
· ✅ división por proyectos/voces confirmada · ⬜ voz/proyecto inicial: aún no la dan — **y no
bloquea**: las voces las crea y edita el equipo en el cockpit a gusto; el motor las
lee en cada corrida.

Los 7 puntos, con qué cambia cada uno:

1. **Scripts literales, no reescritura** *(reemplaza lo anterior)* — el script es la
   transcripción del video, **traducida al español solo si hace falta**. Claude pasa de escritor
   a traductor literal. El few-shot por voz queda en pausa (ADR-009).
2. **Prioridad multiidioma** *(complementa)* — referentes en EN/PT/IT/FR en la semilla y boost
   de idioma en el heat-score.
3. **Histórico de selecciones** *(requisito visible)* — "el lunes 20 seleccionaron 5 videos para
   tal voz": campo `calificado_en` + las vistas `v_selecciones_por_dia` / `v_historico_seleccionados`
   (schema `003`). ⚠️ **Las dos vistas murieron en la [`022`](./core/schema/022_poda_balde_2.sql)**
   (ADR-059): el requisito **sigue vivo** y hoy lo sirven `/curar/historicos` y su export CSV
   (ADR-057), los dos sobre `outputs`. Lo que se cayó fue la implementación, no lo pedido.
4. **Cada script accesible** *(nuevo; ADR-009)* — el script vive como **texto** en
   `app.candidatos.script` (la transcripción/traducción literal), y el "link" es la **URL del video
   original**. Se descartó el Google Doc por script (llenaría el Drive); el motor no usa Google.
5. **Mapa de calor re-rankeado de seleccionados** *(nuevo)* — el filtro *aprobados* del Feed, con
   el orden por `heat_score` desc que la pantalla ya trae. Se "rehace" solo.
6. **El sistema aprende de la selección** *(redirige ADR-008)* — la curación alimenta el scoring
   (`v_senal_seleccion`), no la escritura.
7. **Histórico exportable** *(nuevo)* — se materializa en `/curar/historicos` con su botón
   **Descargar CSV** (abre nativo en Excel). *Fue un Google Sheet hasta ADR-057, que lo mató: dejaba
   el histórico de cada empresa en un archivo de Google donde el aislamiento del cockpit no llega.*
   Supabase sigue siendo la fuente de verdad del historial.

**Transversal:** el cockpit es **el punto de entrada único** de quienes manejan el pipeline
(proyectos, voces, referentes, calificación), y también la salida histórica. n8n y Supabase son
sala de máquinas: ningún no-dev necesita tocarlos.

> **Enmienda 2026-07-17 ([ADR-025](./docs/adr/ADR-025-cockpit-producto-propio.md)):** la superficie
> del equipo **migró a un producto propio** (frontend+backend+DB+auth sobre Supabase). ✅ **Completado
> en D7 (2026-08-01):** Airtable salió del sistema, y el 2026-08-05 se borró hasta la última mención
> en el repo. El resto del invariante no cambia: n8n y Supabase siguen siendo sala de máquinas.

### Heat-score v1 (los criterios, concretos)

Base = **las tres métricas combinadas**: likes, views y engagement. *(El "reach" real no lo dan
los scrapers — es dato privado de cada cuenta; `engagement_rate` es el proxy acordado
2026-06-12.)* Sobre la base, multiplicadores; nada corta:

```
prescore = [ 0.4·norm(views) + 0.4·norm(likes) + 0.2·norm(engagement_rate) ]
           × (1 + idioma)      ← original en EN/PT/IT/FR
           × (1 + selección)   ← tasa de selección histórica del referente/idioma (v_senal_seleccion)

heat = peso_relevancia·score_semántico(Haiku) + (1−peso_relevancia)·percentil(prescore)   ← ADR-010

norm() = percentil dentro de la corrida (robusto a outliers)
flag_viral (seguidores > ~700K): marca, NO altera el score ni excluye
gate Haiku (CALIDAD) dropea lo irrelevante · el substring de tema salió (ADR-010)
```

Pesos iniciales razonables, no sagrados: se calibran con datos reales de curación (§5, punto 2).

---

## 2. Equipo y carriles

| Dev | Carril | Foco |
|---|---|---|
| **Mani** | **B — Motor** | n8n online + rework del workflow (fachada → dedup → heat → transcribe/traduce → link → candidatos) |
| **Dev 2** *(¿Alejo?)* | **A — Capa de datos** | Supabase (schemas 001–003) + el cockpit + semillas |
| **Dev 3** | **C — Curación e histórico** | el histórico + workflow de archivado + tracking de selecciones |

Usuarios del sistema (no devs): **Majo y Jero** — equipo de redes, operan solo el cockpit.

Los tres carriles corren **en paralelo** tras M0. Único sync duro: **A10** (credenciales por el
gestor — nunca por el repo).

```
M0 ─► A1–A10 (datos listos) ──┬─► B1–B5 (motor v1) ──┬─► V1–V6 (validación) ─► D1–D3 (activación)
                              └─► C1–C3 (histórico) ──┘
```

---

## 3. Checklist ejecutable

> ### 📏 Marcado contra la realidad el 2026-08-06, no de memoria
>
> Este checklist se escribió antes de construir y se quedó sin marcar mientras el sistema entraba en
> producción: **M0, el carril A y el B estaban en verde hacía meses con sus casillas vacías**, y eso
> hace que quien lo lee para orientarse arranque creyendo que no hay nada hecho.
>
> Lo de abajo se midió, no se dedujo: conteos por PostgREST y `pg_policies` contra la base de prod,
> y los 5 `workflow.json` traídos por la API de n8n. **Cada `✅ medido` dice qué número lo prueba.**
> Lo que sigue sin marcar es lo que sigue sin hacerse — y son **V2, V4 y D3**.
> *(El 07/08 cayeron tres. **V6** no corriéndola: su simulacro era immontable —los 31 nodos HTTP
> comparten `Config.supabase_url`— y el invariante resultó ser una propiedad estructural que ahora
> verifica el check #6 del auditor. **V5** sí con una corrida real (~$0.24): 69 videos vueltos a
> traer, 4 sobrevivieron, intersección ∅. **D2** con el UPDATE en prod.
> **V2 quedó a mitad por la misma clase de hallazgo que V6:** su mitad española es una garantía del
> código con test verde, no una muestra. Lo que queda son **dos verificaciones de ojo** —V2 (la
> traducción) y V4— más **D3**, la demo.)*

### M0 — Arranque (½ día) · los 3

- [x] **M0.1** Leer este doc completo (los 3) — cada dev sabe qué carril tiene y por qué.
- [x] **M0.2** Cuentas: Supabase, InstaPods, Vercel, Resend (magic link) — cada
      carril la suya; accesos al gestor de contraseñas.
      *(✅ medido 06/08: proyecto Supabase `ACTIVE_HEALTHY` desde el 2026-06-13 · n8n responde por su
      API pública con los 5 workflows · `DASHBOARD_URL/login` da **200** y `/` da **307** · el magic
      link de Resend es por donde entra el equipo desde el cierre 63.)*
- [x] **M0.3** Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra una provisional;
      el equipo la cambia cuando quiera desde el cockpit).
      *(✅ medido 06/08: **4 voces** en toda la base —las **3 de Retia**, activas, + una de 30X en
      pausa— y **6 proyectos**, 5 activos, todos de Retia. ⚠️ `voces` y `proyectos` son de **grano
      empresa**: el cockpit de Retia muestra 3 y 6, no 4 y 6.)*

### Carril A — Capa de datos · 👤 Dev 2 · ~1.5 h

- [x] **A1.** Crear proyecto en [supabase.com](https://supabase.com) (free, nombre `pipeline-contenido`).
      *(✅ el proyecto real se llama `pipeline-creacion-contenido`, `us-east-1`, Postgres 17.)*
- [x] **A2.** SQL Editor → correr en orden [`001`](./core/schema/001_registro_inicial.sql),
      [`002`](./core/schema/002_cockpit_y_dedup.sql) y [`003`](./core/schema/003_seleccion_e_historico.sql).
      Verificar: `select * from workflows;` (2 seeds), `select * from processed_items;` (vacía),
      `select * from outputs;` (existe, vacía). *(Era `v_historico_seleccionados`, dropeada por la
      [`022`](./core/schema/022_poda_balde_2.sql).)*
      *(✅ medido 07/08, y ya son muchas más que 3: **las 25 de 25 migraciones aplicadas**, verificadas
      por su efecto — la `022` no dejó viva ninguna de sus 5 vistas ni de sus columnas, la `024` tiene
      sus 4 policies, y la [`023`](./core/schema/023_poda_write_only.sql) **cerró su gate el 07/08**:
      sus 6 columnas dan `42703` y las 2 que se quedan (`run_id`, `primera_vez`) siguen con dato. **No
      queda ninguna pendiente.**)*
- [x] **A3.** Guardar en el gestor (NUNCA en git): URL del proyecto + `service_role` key (Settings → API).
- [x] **A4.** Insertar cliente + instancia (snippet comentado al final del `001`) → anotar `instance_id`.
      *(✅ medido 06/08: **3 clientes** —`retia`, `30x`, `estadox`— y **4 instancias**: `retia/reels`
      `active` y las 3 de LinkedIn, 2 `active` + `retia/linkedin` en `draft`.)*
- [x] ~~**A5–A8.** Crear la cuenta de Airtable, el PAT, la base por `setup-airtable.mjs` y los
      accesos del equipo.~~ ☠️ **MUERTOS.** El cockpit es producto propio desde
      [ADR-025](./docs/adr/ADR-025-cockpit-producto-propio.md) y Airtable salió del sistema en D7
      ([ADR-035](./docs/adr/ADR-035-contrato-de-escritura-por-postgrest.md)). El equivalente hoy:
      **correr las migraciones de [`core/schema/`](./core/schema/) en orden** (ahí vive el modelo,
      tablas y vistas) y **deployar `apps/dashboard`** — el alta de personas es una fila en
      `app.usuarios` + su membresía ([ADR-051](./docs/adr/ADR-051-el-acceso-es-membresia-explicita.md)),
      no un "Share". Los pasos vivos están en [apps/dashboard/README.md](./apps/dashboard/README.md).
- [x] **A9.** Datos semilla: 1+ proyecto, 1 voz (provisional si el jefe no definió) y referentes del
      nicho — **incluyendo referentes en EN/PT/IT/FR**. Se cargan **desde el cockpit**, en *Curar*.
      *(✅ medido 06/08: **6 proyectos · 4 voces · 16 referentes**, y el sistema ya produjo **165
      candidatos · 88 outputs · 38 descartes** encima de eso.)*
- [x] 🔗 **A10.** Pasar por el gestor a B y C: `supabase_url` + `service_role` + `instance_id`.

**Hecho cuando:** las vistas de Supabase responden · el cockpit levanta y muestra las 4 zonas ·
Majo y Jero entran por magic link y tienen su membresía · A10 entregado.
✅ **Cumplido.** Medido el 06/08: **9 membresías** en `app.usuarios_clientes` (`retia` 5 operadores +
2 devs, `30x` y `estadox` 1 operador cada uno) sobre **8 usuarios**, 2 de ellos `es_dueno`. El alta
dejó de ser el `rol` de la fila el 2026-08-04: hoy es membresía explícita
([ADR-051](./docs/adr/ADR-051-el-acceso-es-membresia-explicita.md), migraciones `018`/`019`).

### Carril B — Motor n8n · 👤 Mani · ~4–5 h

- [x] **B1.** Levantar n8n online: [InstaPods](https://instapods.com) (~$7/mes, confirmar storage
      persistente; decisión de hosting: [ADR-005](./docs/adr/ADR-005-hosting-n8n-managed-fase1.md)).
      Envs `GENERIC_TIMEZONE=America/Bogota` y `TZ=America/Bogota` + reiniciar.
      *(✅ medido 06/08 por la API de n8n: los **5** workflows `active: true` y los 5 con
      `settings.timezone = America/Bogota`.)*
- [x] ~~**B2.** *(smoke-test opcional)* `node core/scripts/deploy.mjs piloto`.~~ ☠️ **MUERTO.**
      `deploy.mjs` está deprecado (resolvía placeholders por-cliente que el MVP no usa) y el espinazo
      quedó confirmado por las corridas reales, no por un piloto.
- [x] **B3. Rework del workflow** (el build del MVP — ADR-009), sobre el JSON del piloto:
      *(✅ en producción: el motor son **34 nodos** en el live y lleva **41 corridas** registradas
      —29 `ok`, 12 `fallo`—, la última el 2026-08-04 21:12.)*
  - **Config:** leer de la fachada del cockpit (`GET /api/engine/run-plan`, ADR-028) en vez del `Set` de params.
  - **COLECTAR:** Apify con ventana `dias_recencia` (backfill=180 la 1ª vez, diario=1–2). Cuentas/hashtags desde `Referentes`/`Keywords` (incluidos multiidioma).
  - **DEDUP:** consultar `processed_items` antes de transcribir; insertar lo nuevo con su `idioma` al final (`Prefer: resolution=ignore-duplicates`).
  - **SCOREAR:** heat-score v1 (fórmula de §1) — ordenar caliente→frío, tomar `top_n`; `flag_viral` marca.
  - **TRANSCRIBIR + TRADUCIR** *(reemplaza GENERAR)*: Supadata transcribe; Claude detecta idioma y **traduce literal al español solo si hace falta** — sin reescribir, sin embellecer. En español = transcripción tal cual (sin llamada de traducción).
  - **CALIDAD** *(ADR-010)*: gate Haiku estricto contra `criterios_relevancia` (Proyecto ⊕ Voz) → dropea lo irrelevante y compone el `heat_score`. El script vive como **texto** (sin Google Doc — ADR-009); el "link" es la URL del video original.
  - **ENTREGAR:** candidatos a `app.candidatos` por PostgREST (estado `nuevo`, con `idioma` + `thumbnail` + `relevancia_score`/`relevancia_razon`, batch 10/call) + registro Supabase (`runs`/`outputs`/`processed_items`, patrón [ingesta-registro](./core/contracts/ingesta-registro.md)). En `outputs.metadata`: proyecto, voz, referente, url_referente, idioma, métricas, heat_score.
- [x] **B4.** Credenciales en n8n: Apify (community node), Anthropic, Supadata,
      Supabase Registro (service_role). **Sin Google** (el motor no usa credenciales de Google).
      *(✅ medido 06/08, y la lista real es más corta: los 5 workflows usan **4 credenciales de n8n** —
      `apifyApi`, `supabaseApi` y 3 `httpHeaderAuth` (run-plan, webhook motor, webhook descubrimiento).
      **Anthropic y Supadata no son credenciales de n8n**: viajan como header en los nodos HTTP, que es
      por lo que la key filtrada de `d98d45a` se pudo rotar sin tocar credenciales.
      **Cero credenciales de Google en los 5**, ahora de verdad: la última se fue con los 3 nodos del
      Sheet el 05/08 ([ADR-057](./docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md)).)*
- [x] **B5.** Importar el error workflow ([`Workflows/workflow-registro-fallos/`](./Workflows/workflow-registro-fallos/)), fijarlo como Error Workflow. ✅ activo, y los 4 workflows lo apuntan en `settings.errorWorkflow`.

**Hecho cuando:** una corrida manual de backfill (180 días) deja candidatos en el Feed con
script en español, `idioma`, `thumbnail` y la razón de relevancia, y su rastro completo en Supabase.

### Carril C — Curación e histórico · 👤 Dev 3 · ~2–3 h *(C1 arranca ya; C2 necesita A10 + B1 — corre en la misma instancia n8n)*

- [x] ~~**C1. Sheet "Histórico":** crear el Google Sheet del histórico de seleccionados (columnas =
      `v_historico_seleccionados`).~~ ☠️ **MUERTO el 2026-08-05**
      ([ADR-057](./docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md)). Su reemplazo es
      **Descargar CSV** en `/curar/historicos`, con las mismas 15 columnas en el mismo orden y
      **por instancia** — que es lo que el Sheet no podía ser: era uno solo y global, así que la
      segunda empresa iba a appendear sus aprobados al de Retia.
      *(✅ medido 06/08: el archivado son **17 nodos** y **cero nodos de Google** en los 5 workflows.)*
- [x] **C2. Workflow de archivado (n8n, cron semanal):** lee `Candidatos` decididos (`NOT estado='nuevo'`)
      → por cada uno: (1) inserta en Supabase `outputs` (estado según calificación,
      `calificado_en` = `fecha_calificacion`, metadata completa), (2) ~~append al Sheet Histórico~~
      destila criterios ([ADR-022](./docs/adr/ADR-022-loop-aprendizaje-criterios.md)),
      (3) borra el candidato ya archivado. Idempotente por `external_id`.
      *(✅ validado cierre 19; **cerrado de verdad el 04/08** con la ejecución 124 — 9 archivados,
      `outputs` 79→88, candidatos 174→165. El cron es **domingo 18:00**, no diario.)*
- [x] **C3. Tracking:** `v_senal_seleccion`/`v_senal_tema` responden la tasa de selección por
      referente/tema (los descartados bajan la tasa). *(✅ cierre 19. ⚠️ **`v_senal_tema` la mató la
      [`022`](./core/schema/022_poda_balde_2.sql)**: su premisa estaba rota —agrupaba por
      `metadata->>'tema'`, que dejó de escribirse en la poda D.4— y no tenía ningún consumidor.
      La que sigue viva y en uso es `v_senal_seleccion`.)*

**Hecho cuando:** calificar un candidato de prueba termina en (1) fila en `outputs`, visible en
`/curar/historicos` *(era "en el Sheet"; ADR-057)*, (2) contado para su voz, y (3) fuera de la lista
de candidatos.
✅ **Cumplido y medido 06/08:** **88 outputs**, el último del 2026-08-04 21:12, y **165 candidatos**
vivos. *(El "contado en `v_selecciones_por_dia`" también cambió de dueño: esa vista no tenía pantalla
y murió en la [`022`](./core/schema/022_poda_balde_2.sql); hoy el conteo lo da `/curar/historicos`.)*

### Validación — corridas de fuego (los 3 juntos) · ~1.5 h

- [x] **V1. Backfill:** `dias_recencia=180` → candidatos en Airtable con script en español,
      `idioma`, `thumbnail` y la razón de relevancia · `runs` ok · `processed_items` poblada.
      *(✅ cierre 17/19: embudo verificado + `processed_items` 10→30 sin dup.)*
- [ ] **V2. Literalidad:** muestrear 2–3: uno en español (script == transcripción tal cual) y
      uno en otro idioma (traducción literal, sin reescritura). El link abre y coincide.
      *(🟡 **La mitad española está cerrada, y no por muestreo: por construcción** (medido 07/08).
      En `Traducir (Claude Haiku)` un video `es` nunca entra al `order`, y el reparto es
      `script: (cache[id] || transcript)` ⇒ con el cache vacío el script **es** el transcript. Tiene
      test verde en `test-nodos.mjs`. Y no hay material que mirar igual: los **170 candidatos son
      169 `en` + 1 `otro`, cero español**.
      ⬜ **Queda la traducción, y hay que verla en caliente:** el transcript original **no se persiste
      en ningún lado** (cero solape entre las 57 `transcripciones` y las URLs de los candidatos), así
      que comparar después de la corrida es imposible sin volver a pagar. La forma barata es abrir el
      video y juzgar contra la fuente — [verificaciones-humanas §6](./docs/verificaciones-humanas.md).)*
- [x] **V3. Curación + histórico:** Majo/Jero califican (🔥/👍/👎 + estado) → archivado corre →
      el aprobado queda en `outputs` y se ve en `/curar/historicos` · sale de la lista de candidatos.
      *(✅ cierre 19 (run `687027e2`, archivados:14) y **re-verificado el 04/08** con la ejecución 124
      después de arreglar el IF que llevaba desde D7 archivando cero: `outputs` 79→88.)*
- [ ] **V4. Re-rank:** el filtro *aprobados* de `/curar/feed` muestra solo aprobados, caliente→frío.
      *(Era "la vista 🔥 Seleccionados", que era de Airtable y murió con él. Lo pedido —punto 5 del
      norte— sigue igual y hoy lo sirve el Feed, que ya ordena por `heat_score` desc. **Falta el ojo:**
      está en el checklist de B5, [plan-multi-tenant §15.B](./docs/agents/plan-multi-tenant.md).)*
- [x] **V5. Incremental + dedup:** correr con `dias_recencia=1` → no reaparece lo ya procesado.
      *(✅ **CORRIDA el 07/08 con ventana de 3 días, `ok`, 13.8 min, ~$0.24.** Se usó 3 y no 1 a
      propósito: con 1 el riesgo era que Apify trajera cero y **la prueba pasara en falso**.
      **Apify volvió a traer 69 videos** —la ventana cubre entera la corrida de ayer— y **sobrevivieron
      4**: se le pagó a Supadata **4 transcripciones, no 69**. `intersección: 0 ✓` por `run_id`
      (4 filas nuevas contra las 48 de ayer), feed en 171 con **0 sin-guion, 171/171 `external_id` y
      0 urls duplicadas**. **El ∅ es de un dedup que filtra, no de una tabla vacía.**
      `Días de recencia` restaurado a 100 y verificado por la fachada.)*
- [x] **V6. Resiliencia:** romper la credencial Supabase a propósito → el workflow IGUAL entrega
      (el registro es sumidero, no dependencia — invariante #1 de PLAN). Restaurar. Un fallo real
      queda como `run` estado `fallo`.
      *(⚠️ **El enunciado envejeció con D7.** Decía "IGUAL escribe a Airtable", y Airtable ya no
      existe: hoy la entrega **también** es Supabase, así que romper esa credencial ya no separa
      entrega de registro — las tumba a las dos. **La prueba sigue teniendo sentido en su mitad
      medible**: un fallo real deja el `run` en `fallo`, y eso ya pasa solo — **12 de las 41 corridas
      están en `fallo`** y el error handler de ADR-054 las marca. Lo que hay que decidir antes de
      correr V6 es qué credencial se rompe ahora que el invariante #1 cambió de forma.
      🩸 **Y la respuesta, medida el 07/08: ninguna, porque la palanca no existe.** Los **20 nodos
      HTTP** del motor y el archivado comparten `Config.supabase_url` ⇒ no hay forma de tumbar el
      registro sin tumbar la entrega. Pero el invariante **ya está declarado nodo por nodo**: los 11
      de registro llevan `onError: continueRegularOutput` y los 5 fail-closed (`POST Candidatos`,
      `Leer plan`, `Leer procesados`, `Leer Candidatos calificados`, `Borrar candidatos`) lo son cada
      uno con su ADR. **Es una propiedad estructural, no una conducta que se descubre rompiendo algo.**
      ✅ **CERRADA POR AUDITORÍA el 07/08:** el **check #6** de
      [`auditar-workflows.mjs`](./Workflows/auditar-workflows.mjs) exige `onError:
      continueRegularOutput` en los 31 nodos HTTP, con `FAIL_CLOSED` como única excepción —
      **9 nodos, cada uno con su porqué escrito**. Verificado **poniéndolo rojo** con los 3 modos de
      falla (onError sacado · lista vieja · lista fantasma): los 3 disparan, exit 1. Detalle y lo que
      se dejó sin hacer a propósito, en
      [verificaciones-humanas §8](./docs/verificaciones-humanas.md).)*

### Activación

- [x] **D1.** Validación explícita de timezone (`America/Bogota`) → activar los crons.
      *(✅ medido 06/08: los **5** workflows con `settings.timezone = America/Bogota`, y los **dos**
      crons del sistema viven en el dispatcher ([ADR-050](./docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md)).
      ⚠️ **La cadencia no es la que decía este item:** no son diarios. Son **semanales** —
      `Cron — motor (lunes 8am)` y `Cron — archivado (domingo 6pm)`.)*
- [x] **D2.** `status: active` en el manifest + tabla `workflows` · actualizar el manifest al
      estado real del motor (stages/outputs post-rework) · commit.
      *(🔧 **La mitad del manifest se hizo el 06/08**: los 4 `workflow.yaml` de los pipelines vivos
      decían `status: draft` con comentarios ya falsos —"cron sin activar", "sin importar aún en la
      instancia n8n"— mientras corrían en producción hacía meses. Corregidos a `active` contra lo
      medido.
      ⬜ **Falta la otra mitad, y es de Mani porque escribe en prod:** la tabla `workflows` de la base
      dice `short-form-content: draft`, `linkedin: draft`, `substack: inactive`. Nada la lee —
      [`scoped.ts:43`](./apps/dashboard/lib/supabase/scoped.ts) deja `clients`/`instances`/`workflows`
      fuera del mapa a propósito— así que es cosmético, no un bug. Es un UPDATE:
      `update workflows set estado = 'active' where id = 'short-form-content';`
      **`linkedin` se queda en `draft` a propósito**: su workflow no existe en n8n (ADR-055).
      ✅ **APLICADO el 07/08 y verificado leyendo la tabla de vuelta:** `short-form-content: active` ·
      `linkedin: draft` · `substack: inactive`. **D2 cerrada entera.**)*
- [ ] **D3.** Demo de 10 min con Majo y Jero: calificar, ver el re-rank, bajar el histórico.
      El sistema solo sirve si lo usan.
      *(Sigue abierto y es de las cosas más viejas sin cerrar. Está en el checklist de ojo humano de
      B5, [plan-multi-tenant §15.B](./docs/agents/plan-multi-tenant.md).)*

## 4. MVP declarado cuando

Backfill real deja candidatos (script literal en español + links) que Majo/Jero califican · el
histórico aparece en `/curar/historicos` y dice cuántos y para qué voz *(era el Sheet +
`v_selecciones_por_dia`; ADR-057 y ADR-059)* · una corrida
incremental no reprocesa · una falla simulada no tumba la entrega · los crons corren en
`America/Bogota` · **el equipo de redes usa el sistema un día completo sin ayuda de un dev**.

## 5. Horizonte post-MVP (no arrancar antes de declarar el MVP)

1. **Dashboard de métricas con filtros** (lo acordado con Alejo): primero vistas/interfaces de
   Airtable + el Sheet Histórico (cero infra); Looker Studio sobre Supabase solo si se queda corto.
2. **Calibrar el heat-score** con 2+ semanas de curación real (`v_senal_seleccion`): pesos de
   idioma vs selección vs métricas. Opcional: scoring semántico de temas con Claude (1 llamada
   batch) si el substring-matching se queda corto.
3. **Costo por corrida medido** (`runs.costo_estimado` real) + revisión mensual.
4. **Pipeline general** ([PLAN.md §5](./PLAN.md)): Substack + sync Notion (F3), capa del jefe
   completa (F4), templatización cliente N+1 (F5), operación sostenible (F6).
5. **Motor de descubrimiento de referentes** (cierra el loop de aprendizaje) — **✅ CONSTRUIDO
   ([ADR-020](./docs/adr/ADR-020-motor-descubrimiento-referentes.md), 2026-07-10; falta importar en
   n8n y la 1ª corrida)**: `Workflows/workflow-descubrimiento-referentes/` propone **referentes
   nuevos** parecidos a los que mejor convierten (semillas rankeadas por `v_senal_seleccion` →
   sugeridos del propio Instagram vía Apify **+ lookalikes de TikTok** vía dataovercoffee, rama
   paralela — ADR-020 §8, enmienda 2026-07-13 → vetting Haiku contra criterios), a la tabla
   `Referentes propuestos` para que el equipo apruebe; los aprobados se siembran solos. Es el
   reemplazo definitivo del eje keyword, removido por ADR-019 (el descubrimiento ciego por hashtag
   no dio calidad). Workflow aparte, no toca el motor actual.

## 6. Riesgos de este roadmap

| Riesgo | Mitigación |
|---|---|
| La traducción "literal" deriva en reescritura (el LLM embellece) | Prompt con instrucción explícita + V2 compara contra la transcripción original |
| Cuota free de Airtable (1.000 records / 1.000 calls/mes) con backfill grande | Solo el top_n por proyecto entra a Airtable; el archivado diario limpia calificados |
| OAuth de Google (Docs/Sheets) en n8n self-host: el consent screen **External + Testing** caduca el refresh token a los **7 días** → el archivado moría cada domingo | **Resuelto (2026-07-12):** publicar la app a **Producción** (Audience → Publish app). El dueño del Sheet es un Gmail personal → "Internal" no aplica y Service Account está bloqueado (política de org `iam.disableServiceAccountKeyCreation`). Producción para uso personal (<100 usuarios) no pide verificación (solo warning de "app no verificada" al autorizar) y quita la expiración de 7 días. Tokens solo caducan tras 6 meses de inactividad; el cron semanal nunca lo está |
| El equipo no adopta la vista de re-rank | D3: demo obligatoria al activar |
| `fecha_calificacion` por API falla al crear la base | El script ya lo maneja: warning + creación manual documentada |
