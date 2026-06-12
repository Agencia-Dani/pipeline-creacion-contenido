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
> [HANDOFF.md](./HANDOFF.md)** — actualizalo al tomar un task y al cerrar cada sesión; los `[x]`
> de este checklist se marcan al completar.

---

## 1. El norte (lo que pidió el jefe)

**El objetivo en una frase:** una máquina que corre sola — busca videos de referentes
(priorizando otros idiomas), los ordena de caliente a frío, entrega cada uno
**transcrito/traducido al español** con link al original y al script, deja que el equipo de
redes (**Majo y Jero**) elija en Airtable — y **aprende de esa elección** mientras todo queda en
un **histórico exportable a Sheets**.

✅ Visto bueno dado · ✅ flag viral confirmado como concepto (~700K marca "high-end", no excluye)
· ✅ división por proyectos/voces confirmada · ⬜ voz/proyecto inicial: aún no la dan — **y no
bloquea**: las voces son registros de Airtable que el equipo crea/edita a gusto; el motor las
lee en cada corrida.

Los 7 puntos, con qué cambia cada uno:

1. **Scripts literales, no reescritura** *(reemplaza lo anterior)* — el script es la
   transcripción del video, **traducida al español solo si hace falta**. Claude pasa de escritor
   a traductor literal. El few-shot por voz queda en pausa (ADR-009).
2. **Prioridad multiidioma** *(complementa)* — referentes en EN/PT/IT/FR en la semilla y boost
   de idioma en el heat-score.
3. **Histórico de selecciones** *(requisito visible)* — "el lunes 20 seleccionaron 5 videos para
   tal voz": campo `calificado_en` + vistas `v_selecciones_por_dia` / `v_historico_seleccionados`
   (schema `003`).
4. **Cada script linkeado** *(nuevo)* — link al video original + link al script. Default: un
   Google Doc por script; **el formato es flexible** (cualquier destino con link estable sirve si
   conviene más — lo innegociable es el link, no la herramienta).
5. **Mapa de calor re-rankeado de seleccionados** *(nuevo)* — vista de Airtable: filtro
   `estado = aprobado` + orden `heat_score` desc. Se "rehace" sola, cero código.
6. **El sistema aprende de la selección** *(redirige ADR-008)* — la curación alimenta el scoring
   (`v_senal_seleccion`), no la escritura.
7. **Histórico exportable** *(nuevo)* — se materializa en un **Google Sheet** (el equipo ya vive
   en Sheets; Excel sale nativo). Supabase sigue siendo la fuente de verdad del historial.

**Transversal:** Airtable es **el punto de entrada único** de quienes manejan el pipeline
(proyectos, voces, keywords, referentes, calificación) — no-code e imposible de romper. El Sheet
es la salida histórica. n8n y Supabase son sala de máquinas: ningún no-dev necesita tocarlos.

### Heat-score v1 (los criterios, concretos)

Base = **las tres métricas combinadas**: likes, views y engagement. *(El "reach" real no lo dan
los scrapers — es dato privado de cada cuenta; `engagement_rate` es el proxy acordado
2026-06-12.)* Sobre la base, multiplicadores; nada corta:

```
heat = [ 0.4·norm(views) + 0.4·norm(likes) + 0.2·norm(engagement_rate) ]
       × (1 + tema)            ← matchea temas/keywords del proyecto
       × (1 + idioma)          ← original en EN/PT/IT/FR
       × (1 + selección)       ← tasa de selección histórica del referente/idioma (v_senal_seleccion)

norm() = percentil dentro de la corrida (robusto a outliers)
flag_viral (seguidores > ~700K): marca, NO altera el score ni excluye
min_likes/min_views del proyecto: ponderan hacia abajo, NO cortan
```

Pesos iniciales razonables, no sagrados: se calibran con datos reales de curación (§5.2).

---

## 2. Equipo y carriles

| Dev | Carril | Foco |
|---|---|---|
| **Mani** | **B — Motor** | n8n online + rework del workflow (Airtable → dedup → heat → transcribe/traduce → link → candidatos) |
| **Dev 2** *(¿Alejo?)* | **A — Capa de datos** | Supabase (schemas 001–003) + cockpit Airtable + semillas |
| **Dev 3** | **C — Curación e histórico** | Sheet Histórico + workflow de archivado + tracking de selecciones |

Usuarios del sistema (no devs): **Majo y Jero** — equipo de redes, operan solo Airtable + Sheet.

Los tres carriles corren **en paralelo** tras M0. Único sync duro: **A10** (credenciales por el
gestor — nunca por el repo).

```
M0 ─► A1–A10 (datos listos) ──┬─► B1–B5 (motor v1) ──┬─► V1–V6 (validación) ─► D1–D3 (activación)
                              └─► C1–C3 (histórico) ──┘
```

---

## 3. Checklist ejecutable

### M0 — Arranque (½ día) · los 3

- [ ] **M0.1** Leer este doc completo (los 3) — cada dev sabe qué carril tiene y por qué.
- [ ] **M0.2** Cuentas: Supabase, Airtable, InstaPods, Google Cloud (OAuth Sheets/Docs) — cada
      carril la suya; accesos al gestor de contraseñas.
- [ ] **M0.3** Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra una provisional;
      el equipo la cambia cuando quiera desde Airtable).

### Carril A — Capa de datos · 👤 Dev 2 · ~1.5 h

- [ ] **A1.** Crear proyecto en [supabase.com](https://supabase.com) (free, nombre `pipeline-contenido`).
- [ ] **A2.** SQL Editor → correr en orden [`001`](./core/schema/001_registro_inicial.sql),
      [`002`](./core/schema/002_cockpit_y_dedup.sql) y [`003`](./core/schema/003_seleccion_e_historico.sql).
      Verificar: `select * from workflows;` (2 seeds), `select * from processed_items;` (vacía),
      `select * from v_historico_seleccionados;` (existe, vacía).
- [ ] **A3.** Guardar en el gestor (NUNCA en git): URL del proyecto + `service_role` key (Settings → API).
- [ ] **A4.** Insertar cliente + instancia (snippet comentado al final del `001`) → anotar `instance_id`.
- [ ] **A5.** Crear cuenta [airtable.com](https://airtable.com) (free) + workspace → copiar el `workspaceId` (`wsp...`) del URL.
- [ ] **A6.** Generar un **Personal Access Token** (scopes `schema.bases:write`,
      `data.records:read/write`) → al gestor (es secreto).
- [ ] **A7.** Crear la base de un comando — incluye los campos ADR-009 (`idioma`, `link_doc`,
      `fecha_calificacion`):
      ```bash
      export AIRTABLE_PAT='pat...'; export AIRTABLE_WORKSPACE_ID='wsp...'
      node core/scripts/setup-airtable.mjs        # imprime el baseId (app...)
      ```
      Crear a mano la vista **"🔥 Seleccionados"** en `Candidatos` (filtro `estado=aprobado`,
      orden `heat_score` desc — el re-rank del jefe). Modelo completo:
      [core/contracts/airtable-cockpit.md](./core/contracts/airtable-cockpit.md).
- [ ] **A8.** Dar acceso de **editor** a Majo y Jero (Share — hasta 5 en el plan free).
- [ ] **A9.** Datos semilla: 1+ `Proyectos`, 1 `Voz` (provisional si el jefe no definió),
      `Keywords`/`Referentes` del nicho — **incluyendo referentes en EN/PT/IT/FR**.
- [ ] 🔗 **A10.** Pasar por el gestor a B y C: `supabase_url` + `service_role` + `instance_id` ·
      `baseId` + `PAT`.

**Hecho cuando:** las vistas de Supabase responden · la base Airtable tiene las 5 tablas +
campos ADR-009 + vista "🔥 Seleccionados" · Majo y Jero tienen acceso · A10 entregado.

### Carril B — Motor n8n · 👤 Mani · ~4–5 h

- [ ] **B1.** Levantar n8n online: [InstaPods](https://instapods.com) (~$7/mes, confirmar storage
      persistente; decisión de hosting: [ADR-005](./docs/adr/ADR-005-hosting-n8n-managed-fase1.md)).
      Envs `GENERIC_TIMEZONE=America/Bogota` y `TZ=America/Bogota` + reiniciar.
- [ ] **B2.** *(smoke-test opcional)* `node core/scripts/deploy.mjs piloto` → importar
      `dist/piloto.workflow.json`, pegar keys, Execute Workflow → confirma el espinazo
      Apify→Claude→entrega antes del rework.
- [ ] **B3. Rework del workflow** (el build del MVP — ADR-009), sobre el JSON del piloto:
  - **Config:** leer de Airtable (Proyectos activos + Keywords/Referentes/Voz/filtros) en vez del `Set` de params.
  - **COLECTAR:** Apify con ventana `dias_recencia` (backfill=180 la 1ª vez, diario=1–2). Cuentas/hashtags desde `Referentes`/`Keywords` (incluidos multiidioma).
  - **DEDUP:** consultar `processed_items` antes de transcribir; insertar lo nuevo con su `idioma` al final (`Prefer: resolution=ignore-duplicates`).
  - **SCOREAR:** heat-score v1 (fórmula de §1) — ordenar caliente→frío, tomar `top_n`; `flag_viral` marca.
  - **TRANSCRIBIR + TRADUCIR** *(reemplaza GENERAR)*: Supadata transcribe; Claude detecta idioma y **traduce literal al español solo si hace falta** — sin reescribir, sin embellecer. En español = transcripción tal cual (sin llamada de traducción).
  - **LINK:** crear el destino del script (default: un Google Doc — título + link original + script; formato flexible, ver §1.4) → guardar URL como `link_doc`.
  - **ENTREGAR:** candidatos a Airtable `Candidatos` (estado `nuevo`, con `idioma` + `link_doc`, batch 10/call) + registro Supabase (`runs`/`outputs`/`processed_items`, patrón [ingesta-registro](./core/contracts/ingesta-registro.md)). En `outputs.metadata`: proyecto, voz, referente, url_referente, link_doc, idioma, métricas, heat_score, calificacion.
- [ ] **B4.** Credenciales en n8n: Apify ×2, Anthropic, Supadata, Airtable (PAT), Supabase
      Registro (service_role), Google Docs/Sheets (OAuth).
- [ ] **B5.** Importar [`error-workflow-registro.json`](./core/n8n/README.md), fijarlo como Error Workflow.

**Hecho cuando:** una corrida manual de backfill (180 días) deja candidatos en Airtable con
script en español, `idioma` y `link_doc` funcionales, y su rastro completo en Supabase.

### Carril C — Curación e histórico · 👤 Dev 3 · ~2–3 h *(tras A10; paralelo a B3)*

- [ ] **C1. Sheet "Histórico":** crear el Google Sheet del histórico de seleccionados (columnas =
      `v_historico_seleccionados`: `FECHA CALIFICACION · PROYECTO · VOZ · TITULO · URL ORIGINAL ·
      LINK DOC · IDIOMA · VIEWS · LIKES · SEGUIDORES · HEAT SCORE · CALIFICACION · ESTADO`).
      Compartirlo con el equipo — es SU base descargable (Excel sale nativo de Sheets).
- [ ] **C2. Workflow de archivado (n8n, cron diario):** lee `Candidatos` con `calificacion`
      puesta → por cada uno: (1) inserta en Supabase `outputs` (estado según calificación,
      `calificado_en` = `fecha_calificacion`, metadata completa), (2) append al Sheet Histórico,
      (3) borra el record de Airtable (retención del free). Idempotente: `external_id` = id del
      record de Airtable.
- [ ] **C3. Tracking:** `select * from v_selecciones_por_dia;` responde "el lunes X seleccionaron
      N videos para tal voz".

**Hecho cuando:** calificar un candidato de prueba termina en (1) fila en el Sheet con sus dos
links, (2) contado en `v_selecciones_por_dia` para su voz, (3) fuera de Airtable.

### Validación — corridas de fuego (los 3 juntos) · ~1.5 h

- [ ] **V1. Backfill:** `dias_recencia=180` → candidatos en Airtable con script en español,
      `idioma` y `link_doc` · `runs` ok · `processed_items` poblada.
- [ ] **V2. Literalidad:** muestrear 2–3: uno en español (script == transcripción tal cual) y
      uno en otro idioma (traducción literal, sin reescritura). El link abre y coincide.
- [ ] **V3. Curación + histórico:** Majo/Jero califican (🔥/👍/👎 + estado) → archivado corre →
      filas en el Sheet con sus dos links · fuera de Airtable · `v_selecciones_por_dia` responde.
- [ ] **V4. Re-rank:** la vista "🔥 Seleccionados" muestra solo aprobados, caliente→frío.
- [ ] **V5. Incremental + dedup:** correr con `dias_recencia=1` → no reaparece lo ya procesado.
- [ ] **V6. Resiliencia:** romper la credencial Supabase a propósito → el workflow IGUAL escribe
      a Airtable (el registro es sumidero, no dependencia — invariante #1 de PLAN). Restaurar.
      Un fallo real queda como `run` estado `fallo`.

### Activación

- [ ] **D1.** Validación explícita de timezone (`America/Bogota`) → activar cron diario/cada-2-días
      (motor) + cron diario (archivado).
- [ ] **D2.** `status: active` en el manifest + tabla `workflows` · actualizar el manifest al
      estado real del motor (stages/outputs post-rework) · commit.
- [ ] **D3.** Demo de 10 min con Majo y Jero: calificar, ver el re-rank, bajar el histórico.
      El sistema solo sirve si lo usan.

## 4. MVP declarado cuando

Backfill real deja candidatos (script literal en español + links) que Majo/Jero califican · el
histórico aparece en el Sheet y `v_selecciones_por_dia` dice cuántos y para qué voz · una corrida
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

## 6. Riesgos de este roadmap

| Riesgo | Mitigación |
|---|---|
| La traducción "literal" deriva en reescritura (el LLM embellece) | Prompt con instrucción explícita + V2 compara contra la transcripción original |
| Cuota free de Airtable (1.000 records / 1.000 calls/mes) con backfill grande | Solo el top_n por proyecto entra a Airtable; el archivado diario limpia calificados |
| OAuth de Google (Docs/Sheets) en n8n self-host pide verificación de app | La cuenta dueña del Sheet/Docs entra como "test user" del OAuth client — documentar al hacerlo |
| El equipo no adopta la vista de re-rank | D3: demo obligatoria al activar |
| `fecha_calificacion` por API falla al crear la base | El script ya lo maneja: warning + creación manual documentada |
