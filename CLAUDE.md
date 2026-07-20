# Pipeline de Creación de Contenido

Central única de los workflows de n8n de creación de contenido de la agencia (Agencia-Dani).
Hoy: el MVP de reels (motor de detección/transcripción + cockpit Airtable + histórico). El núcleo
está hecho para que sumar un flujo o un cliente sea clonar y configurar, no construir de cero.

## Mapa de docs

Dónde vive cada cosa, para revisar, cambiar o no perderse. El **cómo usar** las 4 docs de trabajo está
en §Agent skills; acá solo se ubican.

**Norte y producto (qué/por qué)**
- [README.md](README.md) — visión del sistema central (puerta de entrada).
- [ROADMAP.md](ROADMAP.md) — norte + checklist del MVP. **Gana sobre cualquier otro doc** (ROADMAP §1).
- [PLAN.md](PLAN.md) — arquitectura, invariantes (§2.5), fases, tabla-resumen de ADRs (§3.1).
- [docs/one-pager-reels-mvp.md](docs/one-pager-reels-mvp.md) — one-pager no técnico para el jefe.

**Estado y dominio (para trabajar)**
- [docs/agents/handoff.md](docs/agents/handoff.md) — estado vivo del repo (leelo al empezar la sesión).
- [docs/agents/context.md](docs/agents/context.md) — glosario de dominio (lenguaje ubicuo).
- [docs/agents/dev-doc.md](docs/agents/dev-doc.md) — los 3 workflows nodo por nodo + mapa de datos (por tabla).
- [docs/agents/mapa-campos.md](docs/agents/mapa-campos.md) — mapa del cockpit: **por campo** (9 tablas) y **por página** (12 + 1 form), con huérfanos, hallazgos y reconciliación repo↔live (A.2 + A.3 del refactor, cerrados).

- [docs/agents/plan-cockpit-propio.md](docs/agents/plan-cockpit-propio.md) — el plan del **cockpit propio**
  que reemplaza a Airtable (ADR-025..028): componentes, stack y roadmap D0–D8.

**Decisiones**
- [docs/adr/](docs/adr/) — ADRs 001–028, una decisión por archivo con su porqué ([índice](docs/adr/README.md)).

**Contratos del núcleo (`core/`, solo cambia con ADR)**
- [core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md) — contrato del manifest (lo valida `npm run validate`).
- [core/contracts/airtable-cockpit.md](core/contracts/airtable-cockpit.md) — modelo de datos del cockpit (las 6 tablas Airtable).
- [core/contracts/ingesta-registro.md](core/contracts/ingesta-registro.md) — cómo un workflow reporta runs/outputs a Supabase.
- [core/schema/](core/schema/) — migraciones SQL de Supabase (001–009; se aplican en el SQL Editor).

**Operación / equipo de redes**
- [docs/onboarding-equipo-redes.md](docs/onboarding-equipo-redes.md) — guía no-code para Majo y Jero (qué cargar + cómo calificar). *(También compartido como Google Doc.)*

**Por workflow**
- [Workflows/workflow-short-form-content/CLAUDE.md](Workflows/workflow-short-form-content/CLAUDE.md) — el motor de reels (qué es, orden). Fuente de verdad: su `workflow.json`.
- [Workflows/workflow-descubrimiento-referentes/README.md](Workflows/workflow-descubrimiento-referentes/README.md) — el descubrimiento de referentes (ADR-020): propone cuentas nuevas cada semana, el equipo aprueba, se siembran solas.

## Agent skills

Este repo está preparado para ingeniería con agentes. Leé esto antes de trabajar:

- **Handoff** ([docs/agents/handoff.md](docs/agents/handoff.md)) — estado vivo: tablero de tasks +
  log entre devs. Leelo al empezar cada sesión para recuperar el estado; actualizalo al cerrar.
  Es cómo el próximo agente (o vos en el futuro) no arranca de cero. Lo escribe `/handoff`.
- **Context** ([docs/agents/context.md](docs/agents/context.md)) — el glosario de dominio (lenguaje
  ubicuo). Leelo antes de nombrar variables/funciones/archivos y antes de discutir el dominio.
  Se afina con `/grill-with-docs`.
- **Dev-doc** ([docs/agents/dev-doc.md](docs/agents/dev-doc.md)) — referencia técnica nodo-por-nodo de
  los dos workflows (orden de ejecución, qué tabla Airtable lee/escribe cada nodo, esquema Supabase y
  trazabilidad de campos). Leela antes de tocar un `workflow.json`; la fuente de verdad sigue siendo el JSON.
- **ADRs** ([docs/adr/](docs/adr/)) — decisiones de arquitectura con su porqué (ADR-001..012).
  Leé los relevantes antes de cambiar un área ya decidida; no las re-litigues.

El **qué/por qué** del producto y el diseño viven en [ROADMAP.md](ROADMAP.md) (norte + checklist del
MVP) y [PLAN.md](PLAN.md) (arquitectura, invariantes §2.5, fases). Si un doc contradice el norte,
gana el norte (ROADMAP §1).

Skills disponibles: `/grill-me`, `/grill-with-docs` (alinear + documentar antes de construir),
`/tdd` (red-green-refactor), `/diagnose` (debugging disciplinado), `/improve-codebase` (profundizar
módulos), `/handoff` (compactar una sesión).

## Feedback loops

- **Test / validar:** `cd core/scripts && npm run validate` — valida el contrato del manifest de
  workflows ([core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md)) y escanea
  secretos. Corre siempre, sobre todo el repo.
- **Dashboard (cockpit propio, ADR-026):** en `apps/dashboard/` — `npm run typecheck` (tsc) +
  `npm test` (dominio con `node:test`, corre los `.ts` directo en Node 26). Si tocaste rutas o
  auth, además `npm run build`. Cómo correrlo y sus pasos manuales:
  [apps/dashboard/README.md](apps/dashboard/README.md).
- **Test de los code nodes del motor:** `node Workflows/workflow-short-form-content/test-nodos.mjs` —
  ejercita `Armar plan de corrida` y `Armar candidato` fuera de n8n con un `$` mockeado (N por proyecto,
  gate por `Voces.activo`, orden dedup→corte, piso, y las regresiones que ya nos mordieron). **Corrélo
  antes de re-importar** si tocaste esos nodos. Sin dependencias: es node pelado.
- **Typecheck / lint:** no hay — los scripts son ESM `.mjs` plano, sin TS ni linter.
- **Run:** el motor **corre en n8n**, no localmente: se importa el `workflow.json` (una instancia,
  editada a mano en el nodo `Config`) y se dispara con *Execute Workflow* (manual) o el cron semanal.
  *(`core/scripts/deploy.mjs` está **deprecado** — resolvía placeholders por-cliente que el MVP no usa;
  queda como semilla del multi-cliente F5.)* Las corridas de fuego son V1–V6 del
  [ROADMAP §3](ROADMAP.md).

## Convenciones

- **`core/` solo cambia con ADR.** Es el núcleo (contratos, schemas SQL, scripts). Si un task obliga
  a tocarlo fuera de lo previsto, se para y se discute (puede terminar en un ADR nuevo).
- **Secretos JAMÁS en git** — ni credenciales ni IDs en ningún archivo del repo. Todo va al gestor de
  contraseñas compartido; el validador escanea el patrón `pat...` y otros secretos en cada corrida.
- **Commits en español, concisos, directo a `main`** (repo de la agencia).
- **Docs lean:** un hecho, un dueño. Antes de crear un doc nuevo, mirá si encaja en uno existente
  (README, ROADMAP, PLAN, handoff, ADRs). El histórico vive en git, no en prosa duplicada.
