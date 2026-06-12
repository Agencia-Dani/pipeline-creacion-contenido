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

**2026-06-12** — Fundación lista (diseño, contratos, schemas, scripts). Nada deployado aún:
Supabase, Airtable y n8n no existen todavía. Arranca la construcción.

## Tablero de tasks

| ID | Task (detalle en ROADMAP §3) | Depende de | Estado | Dev |
|---|---|---|---|---|
| M0.2 | Cuentas/accesos de cada carril → gestor | — | ⬜ | cada uno la suya |
| M0.3 | Pedir al jefe la voz/proyecto inicial (no bloquea: se siembra provisional) | — | ⬜ | Mani |
| A1–A4 | Supabase: proyecto + schemas 001–003 + cliente/instancia | — | ⬜ | Dev 2 |
| A5–A9 | Airtable: PAT + base por script + vista 🔥 + accesos Majo/Jero + semillas (referentes EN/PT/IT/FR) | — | ⬜ | Dev 2 |
| A10 | Entregar credenciales/IDs a B y C por el gestor | A1–A9 | ⬜ | Dev 2 |
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

### 2026-06-12 — Fundación: norte del jefe + repo consolidado *(Mani + Claude)*

- **Hecho:** visto bueno del jefe procesado → [ADR-009](./docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md)
  (scripts literales/traducción, multiidioma, histórico exportable, link por script, aprendizaje
  → scoring) · schema [`003`](./core/schema/003_seleccion_e_historico.sql) (idioma, calificado_en,
  vistas de histórico/selecciones/señal) · cockpit Airtable actualizado (campos `idioma`,
  `link_doc`, `fecha_calificacion` + vista 🔥; `setup-airtable.mjs` los crea) · heat-score v1
  definido (ROADMAP §1) · consolidación de docs: blueprint/runbook/MEJORAS/HOSTING/one-pager-jefe
  absorbidos en README+ROADMAP+PLAN+ADRs (~900 líneas menos).
- **Decisiones de la sesión:** formato del script flexible (Doc = default, lo innegociable es el
  link) · reach no existe en scrapers → proxy `engagement_rate` (en la fórmula) · voces = registros
  de Airtable editables por el equipo cuando quieran · equipo de redes se llama **Majo y Jero**.
- **Pendiente/abierto:** voz/proyecto inicial sin definir por el jefe (M0.3, no bloquea) ·
  presupuesto techo sin validar (PLAN §3.2) · Dev 2 y Dev 3 sin nombre asignado en el tablero.
- **Gotcha para el que siga:** el `workflow.json` actual es el template VIEJO (genera en voz) —
  el rework B3 lo cambia; no "arreglar" el template viejo, rehacerlo según ROADMAP carril B.
