# Pipeline de Creación de Contenido

Central única de los workflows de n8n de creación de contenido de la agencia (Agencia-Dani).
Hoy: el MVP de reels (motor de detección/transcripción + cockpit propio + histórico). El núcleo
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
  que reemplazó a Airtable (ADR-025..028): componentes, stack y roadmap D0–D8.

**Decisiones**
- [docs/adr/](docs/adr/) — ADRs 001–059, una decisión por archivo con su porqué ([índice](docs/adr/README.md)).

**Contratos del núcleo (`core/`, solo cambia con ADR)**
- [core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md) — contrato del manifest (lo valida `npm run validate`).
- *(`airtable-cockpit.md` **ya no existe.** Era el modelo de datos de Airtable, congelado en D7 como registro histórico y borrado el 2026-08-05 con el resto de la purga. **El modelo vivo es [core/schema/](core/schema/)** — las migraciones son el modelo, no su descripción en prosa. Está en git si hace falta arqueología.)*
- [core/contracts/ingesta-registro.md](core/contracts/ingesta-registro.md) — cómo un workflow reporta runs/outputs a Supabase.
- [core/contracts/run-plan.md](core/contracts/run-plan.md) — cómo el motor **pregunta qué correr** a la fachada del cockpit (`GET /api/engine/run-plan`, ADR-028): hermano de *lectura* de ingesta-registro.
  **La regla que gobierna los dos desde D7 (ADR-035):** *n8n lee su config por la fachada, escribe sus resultados por PostgREST.*
- [core/schema/](core/schema/) — migraciones SQL de Supabase (001–024; se aplican a mano en el SQL Editor,
  en orden). Al 2026-08-06, **medido contra prod por su efecto** (PostgREST + `pg_policies`), están
  **23 de 24 aplicadas**. **La única que falta es la `023`**, y es la de abajo.
  🧹 **La `022` (ADR-059) podó la "balde 2"**: 5 vistas sin consumidor, `outputs.publicado_en`,
  `runs.costo_estimado`, `instances.config_ref` y las 6 `airtable_id`. Su hermana, la `023` (las 5
  columnas write-only de `processed_items` + `outputs.source_items` + `transcripciones.pedido_por`),
  **va después del `n8n:push` que deja de escribirlas** y lleva gate humano: PostgREST rechaza el
  insert entero con `PGRST204` y esos POST son `onError: continue`, así que el 400 se traga y deja
  al motor cerrando en verde **sin memoria de dedup**.
  ✅ **La ventana del expand se cerró**: la `019` mató `usuarios.rol` y `usuarios.client_id`, y el
  acceso vive solo en `app.usuarios_clientes` (**9 filas** al 06/08 — `retia` 5 operadores + 2 devs,
  `30x` y `estadox` 1 operador cada uno, sobre 8 usuarios, 2 de ellos `es_dueno`) + el flag
  `es_dueno` (ADR-051).
  ⚠️ **Una migración con gate humano no se da por aplicada porque se haya corrido, sino cuando se
  mide su efecto**: la `019` se corrió el 03/08 sin error visible y **no había entrado** — el
  `raise exception` del §0 abortaba la transacción entera. Se midió, se firmó el gate y entró el 04/08.
  ✅ **La `021` (RLS, Capa 2 de ADR-047) DEJÓ DE SER INERTE el 2026-08-05** (`d8edea2`): el flip de
  `scoped.ts` está en producción y el cockpit lee con la sesión del usuario, así que sus policies
  se evalúan de verdad. *(Son **19**, contadas en el SQL el 06/08 — los docs venían diciendo 17.)* **El `service_role` quedó solo donde no hay sesión**: la fachada de ADR-028 y
  las escrituras de n8n por PostgREST (ADR-035).
  🔑 **Cómo sabe `scoped()` bajo qué autoridad corre:** el `TenantContext` lleva
  `origen: "sesion" | "fachada"`, estampado en los dos únicos constructores que existen
  (`armarContexto` en `domain/tenant.ts` y `contextoDeFachada` en `lib/tenant.ts`). **No es
  cosmético**: la fachada comparte `scoped()` con el cockpit —`run-plan` llega por `lib/config.ts`—
  así que sin esa marca el flip dejaba al motor con `42501` y sin plan que leer. El porqué completo,
  y la ventana de ADR-047 que se cerró **sin** suspender cockpits, en
  [ADR-058](docs/adr/ADR-058-el-flip-de-la-capa-2.md).
  ✅ **El agujero que la `021` NO cubría está tapado:** las 4 tablas `*_linkedin` de la `020` nacieron
  con RLS enabled y **cero policies**; la [`024`](core/schema/024_rls_linkedin.sql) se aplicó el
  2026-08-06 y les puso las suyas, **grano instancia** (`instancias_visibles` en el `qual`, no
  `clientes_`, que era el error fácil porque su hermana de reels es por empresa).
  📏 **Medido el 06/08 en `pg_policies`: 18 policies sobre 18 tablas de `app` + 6 sobre 6 de `public`**,
  y el check *"¿queda alguna tabla con tenant, RLS y sin policy?"* corrido **contra prod** por primera
  vez da **cero filas**. ⏳ Lo que falta es ejercitarlas **con filas** (las 4 están vacías): es la
  prueba de [plan-multi-tenant §14.6](docs/agents/plan-multi-tenant.md), escrita paso a paso.

**Operación / equipo de redes**
- [docs/onboarding-equipo-redes.md](docs/onboarding-equipo-redes.md) — guía no-code para Majo y Jero (qué cargar + cómo calificar). *(También compartido como Google Doc.)*
- [docs/verificaciones-humanas.md](docs/verificaciones-humanas.md) — **lo que falta mirar con los ojos**
  y ningún agente puede cerrar (el clic al CSV, el feed paginado, V2/V4/V5/V6, la demo D3). Cada item
  con quién, cuánto tarda y qué significa si falla. ⚠️ **Trae los números esperados por pantalla,
  medidos el 06/08 — y corrige 5 que estaban mal**: eran el `count(*)` crudo de la tabla donde la
  pantalla filtra, así que habrían disparado una falsa alarma de RLS.

**Por workflow** — los 5 que corren en n8n. Cada doc abre con **§Operación**, y los 5 dicen lo mismo
porque es una sola regla (ADR-053): **cambiar un workflow es `n8n:push`, no re-importarlo**; el
re-import queda solo para topología, y solo ahí aplican sus placeholders y credenciales.
- [Workflows/workflow-short-form-content/CLAUDE.md](Workflows/workflow-short-form-content/CLAUDE.md) — el motor de reels (qué es, orden). Fuente de verdad: su `workflow.json`.
- [Workflows/workflow-descubrimiento-referentes/README.md](Workflows/workflow-descubrimiento-referentes/README.md) — el descubrimiento de referentes (ADR-020): propone cuentas nuevas cada semana, el equipo aprueba, se siembran solas.
- [Workflows/workflow-archivado/README.md](Workflows/workflow-archivado/README.md) — el archivado: manda los calificados a `outputs`, destila criterios (ADR-022) y barre. ✅ **17 nodos desde el 2026-08-05**: [ADR-057](docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) quedó **cerrada entera** — los 3 nodos del Sheet se borraron a mano en el editor (no re-import: importar crea un workflow con id nuevo) y con ellos se fue **la última dependencia de Google del pipeline**.
- [Workflows/workflow-dispatcher/README.md](Workflows/workflow-dispatcher/README.md) — el que convierte **un** workflow parametrizado en **N corridas aisladas**, una por instancia (ADR-050). Los dos crons del sistema viven acá.
- [Workflows/workflow-registro-fallos/README.md](Workflows/workflow-registro-fallos/README.md) — el error handler global: marca como `fallo` el run de la ejecución que se cayó, encontrado por `params.execution_id` (ADR-054). Activo y verificado end-to-end; lo apuntan los 4 workflows. Se rompió **dos veces** por un `<<SUPABASE_URL>>` sin resolver que `onError: continue` silenciaba: por eso `npm run n8n:diff` va después de cada import.

*(`workflow-linkedin/` y `workflow-substack/` son pipelines del repo que todavía **no** corren en n8n:
LinkedIn ya tiene su `020` aplicada y sus 3 cockpits en `instances`, pero no existe el workflow en
n8n ni tiene cron en el dispatcher, ADR-055.)*

## Agent skills

Este repo está preparado para ingeniería con agentes. Leé esto antes de trabajar:

- **Handoff** ([docs/agents/handoff.md](docs/agents/handoff.md)) — estado vivo: tablero de tasks +
  log entre devs. Leelo al empezar cada sesión para recuperar el estado; actualizalo al cerrar.
  Es cómo el próximo agente (o vos en el futuro) no arranca de cero. Lo escribe `/handoff`.
- **Context** ([docs/agents/context.md](docs/agents/context.md)) — el glosario de dominio (lenguaje
  ubicuo). Leelo antes de nombrar variables/funciones/archivos y antes de discutir el dominio.
  Se afina con `/grill-with-docs`.
- **Dev-doc** ([docs/agents/dev-doc.md](docs/agents/dev-doc.md)) — referencia técnica nodo-por-nodo de
  los tres workflows (orden de ejecución, qué tabla de Postgres lee/escribe cada nodo, esquema Supabase y
  trazabilidad de campos). Leela antes de tocar un `workflow.json`; la fuente de verdad sigue siendo el JSON.
- **ADRs** ([docs/adr/](docs/adr/)) — decisiones de arquitectura con su porqué (ADR-001..059).
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
- **¿el live corre lo que dice el repo?** `cd core/scripts && npm run n8n:diff` — compara los **5**
  workflows (los 4 del pipeline + el error handler) contra n8n por la API (ADR-053). Clasifica cada campo, así que solo grita lo accionable:
  **drift** (los dos lados tienen valor y difieren), **topología**, **orden de ramas** y placeholders
  que no pudo aprender. Lo benigno (defaults que n8n borra, campos que agrega, resourceLocators de
  Apify) va a un contador; `-- --todo` los lista. Solo lee. **Corrélo antes de tocar un workflow.json
  y después de cualquier cambio en n8n.**
- **Aplicar un cambio del repo al live:** `npm run n8n:push -- <alias> --nodos "Nodo A,Nodo B"` —
  dry-run; agregá `--apply` para escribir. Toma el live como base y le pone los `parameters` del repo
  con los placeholders resueltos; jamás toca credenciales, ids, posiciones ni `settings`. Snapshotea
  antes (`.n8n-snapshots/`, gitignored) y verifica contra la instancia después; el rollback es
  `npm run n8n:restore -- <alias> <snapshot> --apply`. Alias: `motor · descubrimiento · dispatcher ·
  archivado · errores`. **Cambios de topología (nodos o conexiones nuevas) siguen siendo re-import
  completo: el push los detecta y se niega.** Su test: `npm run n8n:test` (⚠️ crea y borra un
  workflow desechable e inactivo en n8n; corrélo si tocaste `n8n-sync.mjs`).
  🟡 *La topología es el **único ritual manual que queda**, y ya no por un límite de la API:
  `GET /credentials` existe y responde, así que el mapa nombre→id se puede aprender igual que los
  placeholders. Falta decidir la red de seguridad (`nodes` **reemplaza**: un push que crea nodos
  también puede borrarlos). Escrito para retomarlo en
  [plan-multi-tenant §14.2](docs/agents/plan-multi-tenant.md).*
- **Arreglar el orden de ejecución de las ramas:** `npm run n8n:orden -- <alias> [--apply]`. En n8n
  v1 las hermanas corren por posición en el canvas (Y menor primero, desempata X — **medido**, no
  asumido), así que arrastrar un nodo cambia la semántica sin tocar código. El comando permuta las
  posiciones que los hermanos **ya ocupan** (cada uno se lleva su cadena exclusiva, así no quedan
  líneas cruzadas) y aborta si alguna otra ramificación cambiaría de orden de rebote. Es lo que
  reporta `n8n:diff` como `[orden]`.
- **Audit estructural de los 3 workflows:** `node Workflows/auditar-workflows.mjs` — conexiones rotas,
  nodos inalcanzables, **`$('X')` que apunte a un nodo que no es ancestro suyo** (la clase de bug que
  dejó el dedup de ADR-029 sin efecto durante 3 corridas: en n8n el orden de las ramas lo decide la
  posición en el canvas, no el array de conexiones), `jsCode` que compile como AsyncFunction, e
  inventario de placeholders del re-import. **Corrélo si tocaste conexiones o posiciones.** Solo lee.
- **Test de los code nodes del motor:** `node Workflows/workflow-short-form-content/test-nodos.mjs` —
  ejercita `Armar plan de corrida`, `Armar candidato`, `Heat-score v1`, `Preparar procesados` y los dos
  nodos caros (`Transcribir`, `Traducir`) fuera de n8n, con `$` y `this.helpers` mockeados: N por
  proyecto, gate por `Voces.activo`, orden dedup→corte, piso, **concurrencia real en vuelo del pool y
  el corte del presupuesto** (ADR-044), y las regresiones que ya nos mordieron. **Corrélo antes de
  empujar al live** (`n8n:push`, o el re-import si es topología) si tocaste esos nodos. Sin
  dependencias: es node pelado.
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
- **Credenciales para trabajar: `.env` en la raíz** (gitignored, local, no versionado). Es el hub
  único: Supabase, el webhook del motor (el botón "Ejecutar"), run-plan, Apify, Anthropic,
  Supadata y la **API pública de n8n** (`N8N_API_KEY`). *(Airtable se podó el 2026-08-03 y su PAT
  está revocado.)* **Usalo proactivamente** — si
  necesitás pegarle a un componente del pipeline, cargá `set -a && source .env && set +a` y usá
  `"$VAR"`, no le pidas la key a Mani.
  Nunca imprimas un valor en el chat. Si una var está vacía, decílo y seguí con lo que sí se pueda.
  El propio archivo está comentado var por var (de dónde sale, quién la consume, qué rompe).
  ⚠️ `POST "$MOTOR_WEBHOOK_URL"` arranca una corrida real y paga: confirmá antes.
- **Cambiar un workflow ya no es re-importarlo** (ADR-053): `core/scripts/n8n-sync.mjs` parchea el
  live por la API de n8n. El live es la base y el repo aporta los `parameters`; los placeholders se
  resuelven solos porque se **aprenden** del propio live. Ver §Feedback loops.
- **Commits en español, concisos, directo a `main`** (repo de la agencia).
- **Docs lean:** un hecho, un dueño. Antes de crear un doc nuevo, mirá si encaja en uno existente
  (README, ROADMAP, PLAN, handoff, ADRs). El histórico vive en git, no en prosa duplicada.
