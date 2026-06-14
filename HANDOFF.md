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

**2026-06-14** — **Motor B3 reworkeado y construido** (`workflow.json` nuevo, ADR-009): 35 nodos,
valida estructural. Alejo entregó las credenciales a Mani (Supabase URL + secret key, Airtable PAT
+ `baseId`). Falta **B4** (pegar credenciales/keys en n8n), **B1** (confirmar TZ del InstaPods ya
creado) y la **validación en vivo V1–V6**. **Decisión estructural abierta para el equipo: Airtable
vs Supabase / alcance del registro central** — ver §"Decisiones a consultar con el equipo".

**2026-06-13** — Carril A en curso (Alejo): Supabase con la `service_role`/secret key a mano,
**base Airtable creada por script** (`baseId` en el gestor). Faltan 2 pasos manuales en
Airtable (campo `fecha_calificacion` + vista 🔥), accesos a Majo/Jero, **semillas (A9, en pausa
hasta definir nicho)**.

## Tablero de tasks

| ID | Task (detalle en ROADMAP §3) | Depende de | Estado | Dev |
|---|---|---|---|---|
| M0.2 | Cuentas/accesos de cada carril → gestor | — | ⬜ | cada uno la suya |
| M0.3 | Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra provisional) | — | ⬜ | Mani |
| A1–A4 | Supabase: proyecto + schemas 001–003 + cliente/instancia (confirmar `instance_id`) | — | 🔧 | **Alejo** |
| A5–A9 | Airtable: base creada; faltan campo `fecha_calificacion` + vista 🔥 + accesos Majo/Jero + semillas | — | 🔧 | **Alejo** |
| A10 | Entregar credenciales/IDs a B y C por el gestor | A1–A9 | ✅ | **Alejo** (Supabase URL+key, PAT, baseId → Mani) |
| B1 | n8n online en InstaPods + TZ `America/Bogota` | — | 🔧 | **Mani** (server creado; falta confirmar TZ) |
| B2 | Smoke-test del piloto (`deploy.mjs piloto` → corrida manual) | B1 + keys | ⬜ | Mani — *omitido: fuimos directo a B3* |
| B3 | **Rework del motor** (Airtable→heat v1→dedup→transcribe/traduce→candidatos) | A10 | 🔧 | **Mani** (motor construido; falta B4 + validar V1–V6) |
| B4 | Credenciales en n8n (Apify, Anthropic/Haiku, Supadata, Airtable PAT, Supabase) — **sin Google** | A10 + B1 | ⬜ | Mani |
| B5 | Error workflow del registro instalado | B1 | ⬜ | Mani |
| C1 | Google Sheet "Histórico" (columnas de `v_historico_seleccionados`) + compartir | — | ⬜ | Dev 3 |
| C2 | Workflow de archivado (Airtable→Supabase+Sheet→limpieza; idempotente; corre en el mismo n8n) | A10 + B1 + C1 | ⬜ | Dev 3 |
| C3 | Verificar tracking (`v_selecciones_por_dia` responde) | C2 | ⬜ | Dev 3 |
| V1–V6 | Corridas de validación (backfill, literalidad, curación, re-rank, dedup, resiliencia) | B3 + C2 | ⬜ | los 3 |
| D1–D3 | Activación: TZ validada + crons + manifest `active` + demo a Majo/Jero | V1–V6 | ⬜ | los 3 |

> Paralelismo real: **A** (Alejo) y **B** (Mani) y **C** (Dev 3) corren en paralelo. Ahora que
> A10 está entregado, el camino crítico es **B4 → V1–V6**.

## Decisiones a consultar con el equipo (estructurales — no resolver en silencio)

> Surgieron al construir B3. No bloquean avanzar (el motor corre igual), pero conviene cerrarlas
> con Andrés/el equipo porque tocan el alcance y posiblemente un ADR.

1. **¿Airtable + Supabase, o solo Airtable? (alcance del registro central — toca ADR-002)**
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
2. **Sin "link al script" separado (desvío de ADR-009 §4).** Decisión de Mani 2026-06-14: nada de
   un Google Doc por script (llenaría el Drive). El script vive como **campo de texto** en Airtable
   y en Supabase `outputs.contenido_o_link`; el "link" es la URL del video original. → El motor
   **no usa ninguna credencial de Google**. Falta: nota de 1 línea en ADR-009 y en
   `airtable-cockpit.md` (`link_doc` queda vestigial), y el Sheet Histórico (carril C) debe llevar
   el **texto del script** en vez de `link_doc` → posible `004_*.sql` para `v_historico_seleccionados`.
3. **TikTok solo por hashtag (keywords).** El motor scrapea TikTok por hashtags; los Referentes con
   `plataforma=tiktok` no se scrapean aún (requiere actor de perfil). Enhancement posterior.
4. **`deploy.mjs` quedó obsoleto** para este motor (resolvía placeholders en voz/categorías). El MVP
   es 1 instancia editada a mano en el nodo Config. Rewrite multi-cliente = F5.

## Log de avance (más reciente arriba)

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
