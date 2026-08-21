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
- [docs/agents/plan-motor-linkedin.md](docs/agents/plan-motor-linkedin.md) — de **esqueleto a motor**:
  las fases 0–4 para que el pipeline de LinkedIn corra. Su hallazgo ordenador: **los dos carriles no
  comparten bloqueos** — el personal está a un pedido (los few-shot) y el copiable necesita los tres.

**Decisiones**
- [docs/adr/](docs/adr/) — ADRs 001–069, una decisión por archivo con su porqué ([índice](docs/adr/README.md)).

**Contratos del núcleo (`core/`, solo cambia con ADR)**
- [core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md) — contrato del manifest (lo valida `npm run validate`).
- *(`airtable-cockpit.md` **ya no existe.** Era el modelo de datos de Airtable, congelado en D7 como registro histórico y borrado el 2026-08-05 con el resto de la purga. **El modelo vivo es [core/schema/](core/schema/)** — las migraciones son el modelo, no su descripción en prosa. Está en git si hace falta arqueología.)*
- [core/contracts/ingesta-registro.md](core/contracts/ingesta-registro.md) — cómo un workflow reporta runs/outputs a Supabase.
- [core/contracts/run-plan.md](core/contracts/run-plan.md) — cómo el motor **pregunta qué correr** a la fachada del cockpit (`GET /api/engine/run-plan`, ADR-028): hermano de *lectura* de ingesta-registro.
  **La regla que gobierna los dos desde D7 (ADR-035):** *n8n lee su config por la fachada, escribe sus resultados por PostgREST.*
- [core/schema/](core/schema/) — migraciones SQL de Supabase. **Se aplican a mano en el SQL Editor, en
  orden**; el modelo vivo son las migraciones, no su descripción en prosa. Al 2026-08-20 están
  **aplicadas las 001–029**, medidas contra prod **por su efecto** (PostgREST + `pg_policies`), no por
  haberse corrido: *una migración con gate humano no se da por aplicada porque se haya ejecutado,
  sino cuando se mide su efecto.*
  ✅ **La [`028`](core/schema/028_grabado.sql) (ADR-069) y la
  [`029`](core/schema/029_grabados.sql) (ADR-070) están aplicadas** (Mani, 18/08 y 20/08). La `029`
  crea `app.grabados` —la marca de *ya se grabó*, **por video** y no por carril— y **jubila** la
  columna de la `028`.
  ✅ **La [`030`](core/schema/030_videos_meta.sql) (ADR-072) está aplicada** (Mani, 21/08) — crea
  `app.videos_meta`, la metadata que se le compra a Apify porque ninguna otra tabla la tiene
  (medido: 0 de 130 en Transcribir, 3 de 294 en los links cargados a mano). Verificada por su
  efecto, no por haber corrido: PostgREST devuelve `[]` y no un 404, y un insert de prueba rebota
  con `23503` contra la FK de `instances`. *Falta mirar `pg_policies` en el SQL Editor: PostgREST
  no lo expone, así que esa pata queda sin medir.*
  ⏳ **La [`031`](core/schema/031_colecciones.sql) (ADR-073) está escrita y NO aplicada** — crea
  `app.colecciones` + `app.colecciones_videos`, la bolsa de videos que apunta a la llave y por eso
  **sobrevive al barrido del archivado**. Gate humano: SQL Editor.
  ⏳ **Y el *contract* de ADR-070 pasa a ser la `032`, que todavía no existe.** Tiene que dropear
  `app.transcripciones.grabado_en`, que ya **no la lee ni la escribe nadie**. Va **después** de que
  ADR-070 lleve un tiempo en prod: dropearla hoy no rompe nada, pero deja sin red un rollback del
  deploy. *Se corrió de número dos veces el 21/08, porque `videos_meta` y `colecciones` llegaron
  antes — que es la regla escrita:
  **el número se toma cuando el archivo existe, no cuando un doc lo reserva**.*
  🔴 **El canario de ADR-069/070 sigue en CERO, y lo que parecía moverlo era ruido.** Este doc llegó a
  decir que la marca del 18/08 era *"primera señal de que el equipo usa el botón"*: **es falso, y se
  midió el 20/08**. Los 4 eventos `transcribir.grabado` de la base son **los 4 de Mani**, sobre **la
  misma fila**, en una ventana de 9 minutos — la sesión de verificación, no uso. *Una marca puesta
  por quien construyó el botón no es evidencia de adopción.* El canario de verdad es
  `select count(*) from app.grabados` a un mes, contando **marcas de otras personas**.
  *El historial migración por migración (qué midió cada una, sus modos de falla, sus verificaciones)
  vive en sus ADRs, en [handoff.md](docs/agents/handoff.md) y en git — acá no se duplica.*

**Runbooks (el N+1)**
- [docs/runbooks/agregar-cliente.md](docs/runbooks/agregar-cliente.md) — dar de alta **una empresa**.
  ✅ **Pasa el criterio de PLAN §F5**: SQL de datos + clics, **cero código, cero n8n, cero migraciones**.
  Su plantilla es [core/templates/cliente-nuevo.sql](core/templates/cliente-nuevo.sql), probada contra
  prod en una transacción revertida.
- [docs/runbooks/agregar-workflow.md](docs/runbooks/agregar-workflow.md) — agregar **un pipeline**.
  🔴 **NO pasa F5, y el runbook lo dice con el número**: LinkedIn costó ~2.500 líneas, 2 migraciones
  en `core/schema/`, 2 ADRs y ~15 archivos de la app, para un pipeline que todavía no corre.
  *Una empresa es un parámetro; un pipeline es un dominio.*
- [core/templates/](core/templates/) — los esqueletos. Crearlo **es ejecutar F5**, que ya lo nombra
  por su ruta; cambiar lo de adentro sí pide ADR si cambia el contrato.

**Operación / equipo de redes**
- [docs/onboarding-equipo-redes.md](docs/onboarding-equipo-redes.md) — guía no-code para Majo y Jero (qué cargar + cómo calificar). *(También compartido como Google Doc.)*
- [docs/verificaciones-humanas.md](docs/verificaciones-humanas.md) — **lo que falta mirar con los ojos**
  y ningún agente puede cerrar (el clic al CSV, los 3 arreglos de Transcribir, V2/V4/V5/V6, la demo D3). Cada item
  con quién, cuánto tarda y qué significa si falla. ⚠️ **Trae los números esperados por pantalla,
  medidos el 06/08 — y corrige 4 que estaban mal**: eran el `count(*)` crudo de la tabla donde la
  pantalla filtra, así que habrían disparado una falsa alarma de RLS.

**Por workflow** — los 5 que corren en n8n. Cada doc abre con **§Operación**, y los 5 dicen lo mismo
porque es una sola regla (ADR-053): **cambiar un workflow es `n8n:push`, no re-importarlo**; el
re-import queda solo para topología, y solo ahí aplican sus placeholders y credenciales.
- [Workflows/workflow-short-form-content/CLAUDE.md](Workflows/workflow-short-form-content/CLAUDE.md) — el motor de reels (qué es, orden). Fuente de verdad: su `workflow.json`.
- [Workflows/workflow-descubrimiento-referentes/README.md](Workflows/workflow-descubrimiento-referentes/README.md) — el descubrimiento de referentes (ADR-020): propone cuentas nuevas cada semana, el equipo aprueba, se siembran solas.
- [Workflows/workflow-archivado/README.md](Workflows/workflow-archivado/README.md) — el archivado: manda los calificados a `outputs`, destila criterios (ADR-022) y barre. ✅ **17 nodos desde el 2026-08-05**: [ADR-057](docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) quedó **cerrada entera** — los 3 nodos del Sheet se borraron a mano en el editor (no re-import: importar crea un workflow con id nuevo) y con ellos se fue **la última dependencia de Google del pipeline**.
- [Workflows/workflow-dispatcher/README.md](Workflows/workflow-dispatcher/README.md) — el que convierte **un** workflow parametrizado en **N corridas aisladas**, una por instancia (ADR-050). Los dos crons del sistema viven acá.
- [Workflows/workflow-registro-fallos/README.md](Workflows/workflow-registro-fallos/README.md) — el error handler global: marca como `fallo` el run de la ejecución que se cayó, encontrado por `params.execution_id` (ADR-054). Activo y verificado end-to-end; lo apuntan los 4 workflows. Se rompió **dos veces** por un `<<SUPABASE_URL>>` sin resolver que `onError: continue` silenciaba: por eso `npm run n8n:diff` va después de cada import.

*(`workflow-linkedin/` está **INACTIVO y sin cron**. Su `workflow.json` tiene **16 nodos** desde el
2026-08-11: los 11 de infraestructura (triggers, `Config`, guard single-flight, abrir/cerrar run,
`Leer plan` fail-closed) más la **espina del carril personal** — `Colectar (stub personal)` →
`Calidad (R-1 + R-2)` → `Preparar candidatos` → `POST Candidatos`. **`calidad` está entera** (R-1 y
R-2 de ADR-055 §4, con `node Workflows/workflow-linkedin/test-nodos.mjs`); **`colectar` es un stub
que emite piezas fijas** y lo reemplaza la Fase 1.4. 🔴 **En n8n vive todavía el esqueleto de 11**:
los 5 nodos nuevos son topología, no entran por `n8n:push` y `n8n:diff` los grita a propósito. Lo que
falta no es plomería: `generar` sigue bloqueada por los few-shot y el carril copiable por el banco de
referentes. `workflow-substack/` sigue siendo solo manifest, sin `workflow.json`.)*

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
- **ADRs** ([docs/adr/](docs/adr/)) — decisiones de arquitectura con su porqué (ADR-001..069).
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
- **¿el live corre lo que dice el repo?** `cd core/scripts && npm run n8n:diff` — compara los **6**
  workflows (los 4 del pipeline + el error handler + el esqueleto de LinkedIn) contra n8n por la API
  (ADR-053). Clasifica cada campo, así que solo grita lo accionable:
  **drift** (los dos lados tienen valor y difieren), **topología**, **orden de ramas** y placeholders
  que no pudo aprender. Lo benigno (defaults que n8n borra, campos que agrega, resourceLocators de
  Apify) va a un contador; `-- --todo` los lista. Solo lee. **Corrélo antes de tocar un workflow.json
  y después de cualquier cambio en n8n.**
- **Aplicar un cambio del repo al live:** `npm run n8n:push -- <alias> --nodos "Nodo A,Nodo B"` —
  dry-run; agregá `--apply` para escribir. Toma el live como base y le pone los `parameters` del repo
  con los placeholders resueltos; jamás toca credenciales, ids, posiciones ni `settings`. Snapshotea
  antes (`.n8n-snapshots/`, gitignored) y verifica contra la instancia después; el rollback es
  `npm run n8n:restore -- <alias> <snapshot> --apply`. Alias: `motor · descubrimiento · dispatcher ·
  archivado · errores`, **más los que se descubren solos** — desde ADR-068 los 5 apodos se escriben
  (`motor` no se deriva de `workflow-short-form-content`) y cualquier otro dir con `workflow.json`
  entra por su id, sin tocar el script. Un alias descubierto sin su `N8N_WF_<ALIAS>` en el `.env`
  todavía no está importado: el barrido lo **saltea con aviso**, nunca en silencio.
  **Cambios de topología (nodos o conexiones nuevas) siguen siendo re-import
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
  🛡️ **Desde el 2026-08-07 también verifica el invariante #1** (el registro es sumidero, jamás
  dependencia de ejecución): los **31 nodos HTTP** llevan `onError: continueRegularOutput` salvo los
  **9** de la constante `FAIL_CLOSED`, cada uno con su porqué escrito. **El default es "sos
  sumidero"**, así que un nodo HTTP nuevo entra pidiendo su `onError`. *Esto **es** V6 del ROADMAP:
  el simulacro que pedía romper una credencial no se puede montar —los 31 comparten
  `Config.supabase_url`, así que romper el registro rompe la entrega— y lo que quería probar se lee
  del JSON en cada commit.* **Corrélo también si agregaste o tocaste un nodo HTTP.**
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
