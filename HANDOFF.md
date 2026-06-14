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

**2026-06-13** — Carril A en curso (Alejo): Supabase con la `service_role`/secret key a mano,
**base Airtable creada por script** (`baseId appkdNLlN1v6XdKHn`). Faltan 2 pasos manuales en
Airtable (campo `fecha_calificacion` + vista 🔥), accesos a Majo/Jero, **semillas (A9, en pausa
hasta definir nicho)** y A10. Motor (B1) lo monta Mani.

## Tablero de tasks

| ID | Task (detalle en ROADMAP §3) | Depende de | Estado | Dev |
|---|---|---|---|---|
| M0.2 | Cuentas/accesos de cada carril → gestor | — | ⬜ | cada uno la suya |
| M0.3 | Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra provisional) | — | ⬜ | Mani |
| A1–A4 | Supabase: proyecto + schemas 001–003 + cliente/instancia | — | 🔧 | **Alejo** |
| A5–A9 | Airtable: base creada (`appkdNLlN1v6XdKHn`); faltan campo `fecha_calificacion` + vista 🔥 + accesos Majo/Jero + semillas | — | 🔧 | **Alejo** |
| A10 | Entregar credenciales/IDs a B y C por el gestor | A1–A9 | ⬜ | **Alejo** |
| B1 | n8n online en InstaPods + TZ `America/Bogota` | — | 🔧 | **Mani** |
| B2 | Smoke-test del piloto (`deploy.mjs piloto` → corrida manual) | B1 + keys Apify/Anthropic/Supadata | ⬜ | Mani |
| B3 | **Rework del motor** (Airtable→dedup→heat v1→transcribe/traduce→link→candidatos) | A10 + B2 | ⬜ | Mani |
| B4 | Credenciales en n8n (Apify ×2, Anthropic, Supadata, Airtable, Supabase, Google) | A10 + B1 | ⬜ | Mani |
| B5 | Error workflow del registro instalado | B1 | ⬜ | Mani |
| C1 | Google Sheet "Histórico" (columnas de `v_historico_seleccionados`) + compartir | — | ⬜ | Dev 3 |
| C2 | Workflow de archivado (Airtable→Supabase+Sheet→limpieza; idempotente; corre en el mismo n8n) | A10 + B1 + C1 | ⬜ | Dev 3 |
| C3 | Verificar tracking (`v_selecciones_por_dia` responde) | C2 | ⬜ | Dev 3 |
| V1–V6 | Corridas de validación (backfill, literalidad, curación, re-rank, dedup, resiliencia) | B3 + C2 | ⬜ | los 3 |
| D1–D3 | Activación: TZ validada + crons + manifest `active` + demo a Majo/Jero | V1–V6 | ⬜ | los 3 |

> Paralelismo real: **A** (Dev 2) y **B1–B2** (Mani) y **C1** (Dev 3) arrancan ya, sin esperarse.
> El cuello es **A10**: destranca B3/B4 y C2.

## Log de avance (más reciente arriba)

### 2026-06-13 — Carril A: Supabase + base Airtable creada *(Alejo + Claude)*

- **Hecho:** ubicada la key de Supabase (ojo: con el renombrado de Supabase, la **publishable**
  key = vieja `anon` (respeta RLS, NO sirve); la que va a n8n es la **Secret key** `sb_secret_…`
  = equivalente al `service_role`, o el `service_role` legacy si el proyecto lo tiene) ·
  **base Airtable "Reels Cockpit" creada** con `setup-airtable.mjs` → **`baseId appkdNLlN1v6XdKHn`**
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
