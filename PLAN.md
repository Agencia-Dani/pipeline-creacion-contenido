# Plan de ejecución — Pipeline Central de Creación de Contenido

> **Qué es este documento:** el diseño del sistema y el plan por etapas del pipeline central.
> El [README](./README.md) da la visión y el mapa de documentos; el [ROADMAP](./ROADMAP.md) da
> la ejecución del MVP de reels (la prioridad actual); este plan da la arquitectura, los
> invariantes y el **orden de las fases**. Si el plan y la realidad se contradicen, gana la
> realidad: se actualiza el plan.
>
> **Estado:** aprobado en diseño · MVP de reels con visto bueno (2026-06-12) · pendiente
> validación de presupuesto con el jefe (ver §3.2).

---

## 1. Punto de partida (diagnóstico)

Lo que existe hoy en el repo:

| Pieza | Qué es | Estado |
|---|---|---|
| `README.md` | Visión del sistema central | ✅ Escrito |
| `Workflows/workflow-short-form-content/` | **Máquina**: motor de reels n8n (30 nodos, JSON importable; ADR-009 + ADR-010 + ADR-011 + ADR-019). Cron semanal + Execute manual → lee la config del equipo en Airtable (incl. Ajustes) → Apify (solo por referentes: IG + TikTok, 2 llamadas) → pre-trim Haiku + heat-score métrico + dedup → Supadata transcribe + Claude Haiku traduce literal → Gate Haiku (CALIDAD) → candidatos a Airtable + registro Supabase. Sin Google en el motor. | ✅ Corrió manual (V1) · ❌ **cron sin activar** · placeholders `<<...>>` por cliente |
| `Workflows/workflow-descubrimiento-referentes/` | **Máquina**: descubrimiento de referentes n8n (27 nodos; ADR-020). Cron semanal → semillas = referentes que mejor convierten (`v_senal_seleccion`) → IG: sugeridos del propio IG (Apify `relatedProfiles`); TikTok: lookalikes (Apify dataovercoffee, rama paralela — ADR-020 §8) → dedup → vetting Haiku contra criterios → propuestas a la tabla `Referentes propuestos` + promoción de aprobados a `Referentes`. No toca el motor de reels. | ✅ Construido · ❌ **sin importar en n8n** · placeholders `<<...>>` por cliente |
| `Workflows/workflow-substack/` | **Procedimiento**: kit de 16 plantillas + guía de 14 fases que configura un bot OpenClaw (Telegram) → research diario con scoring → Notion (2 DBs) → borradores → publicación manual a Substack | ✅ Probado en producción real (mar–abr 2026, *AI for Executives*) · ❌ **hoy inactivo** — se re-monta en F3 |

> **Estado operativo (2026-06-11):** ninguno de los dos workflows está sirviendo hoy. La puesta
> en producción de ambos **es parte del plan** (reels → F2, Substack → F3), no un prerequisito.

**El hueco que el pipeline llena:** los outputs viven en dos lados desconectados (Google Sheets
vs Notion), no hay registro central de corridas, ni config estandarizada, ni forma de saber si
algo falló sin ir a mirar. No se pueden hacer dashboards, reportes ni queries sobre "todo lo que
el sistema produce".

**La restricción de diseño más importante:** los dos workflows tienen formas radicalmente
distintas (máquina autónoma vs bot con humano en el loop) **y eso no se va a "arreglar"** — la
base común debe aguantar ambos extremos. Por eso el centro del sistema es un **contrato + un
registro de outputs**, no un motor de ejecución único.

---

## 2. Arquitectura objetivo (alto nivel)

```
                         BORDES VOLÁTILES (cambian seguido)
   ┌──────────────────────────────┐    ┌──────────────────────────────┐
   │ workflow-short-form-content  │    │ workflow-substack            │
   │ motor: n8n (managed host)    │    │ motor: OpenClaw + Telegram   │
   │ destino: Airtable + Sheet    │    │ destino nativo: Notion       │
   └─────────────┬────────────────┘    └─────────────┬────────────────┘
                 │ push directo                      │ sync job
                 │ (nodo HTTP al final                │ (lee Notion,
                 │  de cada corrida)                  │  escribe registro)
                 ▼                                    ▼
   ╔══════════════════════════════════════════════════════════════════╗
   ║                NÚCLEO ESTABLE (se protege, casi no cambia)        ║
   ║                                                                   ║
   ║  REGISTRO CENTRAL — Supabase (Postgres)                           ║
   ║  clients · workflows · instances · runs · outputs                 ║
   ║                                                                   ║
   ║  CONTRATO DE WORKFLOW — workflow.yaml por carpeta                 ║
   ║  qué hace · qué necesita · qué produce · cómo se opera            ║
   ╚═══════════════════╦══════════════════════════╦════════════════════╝
                       ▼                          ▼
        ┌──────────────────────────┐  ┌───────────────────────────┐
        │ DASHBOARD (solo lectura) │  │ RESUMEN PUSH              │
        │ Looker Studio / Metabase │  │ email / Telegram semanal  │
        │ → el jefe                │  │ + alertas de fallo        │
        └──────────────────────────┘  └───────────────────────────┘
```

**Propiedad de resiliencia (no-negociable #2):** cada workflow escribe primero a su destino
nativo (Sheets/Notion) y *además* reporta al registro central. Si el registro se cae, los
workflows siguen produciendo; el sync reconcilia después. Si un workflow se rompe, el otro ni
se entera. **El registro central es un sumidero adicional, nunca una dependencia de ejecución.**

### 2.1 Componentes del sistema

| # | Componente | Responsabilidad (una frase) | Vive en |
|---|---|---|---|
| C1 | **Contrato de workflow** | Describir todo workflow igual por fuera: qué hace, qué necesita, qué produce, cómo se opera — incluidas sus etapas canónicas (§2.4) | `Workflows/<wf>/workflow.yaml` + schema en `core/contracts/` |
| C2 | **Config de clientes** | Única fuente de verdad de lo que parametriza cada workflow para cada cliente (los `<<...>>` y `{{...}}` de hoy) | `clients/<cliente>/<wf>.yaml` |
| C3 | **Registro central** | Persistir toda corrida y todo output de todo workflow, consultable | Supabase (schema versionado en `core/schema/`) |
| C4 | **Adaptadores de ingesta** | Llevar los resultados de cada motor al registro: nodo HTTP en n8n (push) y sync job para Notion (pull) | dentro de cada workflow / `core/sync/` |
| C5 | **Capa de visibilidad** | Dashboard solo-lectura + resumen push para el jefe | Looker Studio o Metabase + workflow de resumen |
| C6 | **Observabilidad y alertas** | Saber que corrió, cuánto costó, y enterarse de una falla antes que el cliente (heartbeat: "el cron del lunes no corrió") | registro central + workflow de alertas |
| C7 | **Plantillas y scaffolding** | Que agregar workflow/cliente N+1 sea clonar-y-configurar, con validación automatizada del contrato | `core/templates/` + script validador |
| C8 | **Documentación viva** | Invariantes (§2.5), ADRs con su porqué, checklists ejecutables | este PLAN + `docs/adr/` + `ROADMAP.md` |
| C9 | **Entrada bajo demanda (dispatcher)** | Formulario simple (no técnico) que dispara corridas con filtros — cliente, plataforma, hashtags, tema, mínimos de views/likes/seguidores — y las rutea al workflow correspondiente | workflow interno de n8n (se construye en F5) |

### 2.2 Modelo de datos del registro (v0 — SQL real: `core/schema/001_registro_inicial.sql`)

La fuente de verdad es el SQL versionado y comentado en [`core/schema/`](./core/schema/):
`001` = entidades (`clients · workflows · instances · runs · outputs`) + vista de outputs
recientes · `002` = dedup (`processed_items`) + corpus · `003` = selecciones e histórico
(ADR-009). La entidad `client` existe desde el día 1 aunque hoy haya un solo cliente (D3);
la regla de dueños únicos está en §2.5.

### 2.3 Estructura objetivo del repo

```
pipeline-creacion-contenido/
├── README.md                  ← visión + mapa de documentos
├── ROADMAP.md                 ← ejecución del MVP de reels (norte + checklist)
├── PLAN.md                    ← este documento (diseño + fases)
├── CLAUDE.md                  ← constitución para agentes (feedback loops + skills + punteros)
├── docs/
│   ├── agents/                ← handoff.md (estado vivo) + context.md (glosario de dominio)
│   ├── adr/                   ← ADR-001..009 (decisiones con su porqué)
│   ├── transcripciones/       ← fuentes de decisiones (conversaciones con el jefe)
│   └── one-pager-reels-mvp.md ← la visión del MVP en una página (no técnica)
├── core/                      ← EL NÚCLEO: solo cambia con ADR
│   ├── contracts/             ← contrato del manifest · cockpit Airtable · ingesta · schemas de datos
│   ├── schema/                ← SQL de Supabase, versionado (001–003)
│   ├── scripts/               ← validate.mjs · deploy.mjs · setup-airtable.mjs
│   ├── n8n/                   ← piezas n8n del núcleo (error workflow del registro)
│   ├── sync/                  ← (se crea en F3) sync Notion → registro
│   └── templates/             ← (se crea en F5) scaffolding de workflow/cliente nuevo
├── clients/
│   └── <cliente>/<wf>.yaml    ← config por cliente (sin secretos)
└── Workflows/                 ← un subfolder autocontenido por workflow (+ workflow.yaml)
    ├── workflow-short-form-content/   (workflow.json plantilla · dist/ generado, gitignored)
    └── workflow-substack/             (kit OpenClaw: plantillas + guía)
```

### 2.4 Anatomía estándar de un workflow de contenido (etapas canónicas)

Los workflows **no se implementan igual, pero se describen y se conectan igual**: todo workflow
de contenido se mapea contra estas 8 etapas en su manifest (las que no aplican se declaran `n/a`):

| Etapa | Responsabilidad | En reels (MVP — ADR-009) | En substack hoy |
|---|---|---|---|
| 1. COLECTAR | Fuentes → items crudos. **Las fuentes son adaptadores enchufables** — acá vive la diferencia principal entre workflows | Apify IG + TikTok (cuentas de referentes desde el cockpit Airtable — ADR-019) | Bot recorre fuentes validadas |
| 2. NORMALIZAR | Todo item cae al schema común `content_item` | Nodos "Normalizar IG/TT" (mismas keys desde cada API) | Implícito en el playbook |
| 3. FILTRAR / SCOREAR | Params de la corrida + criterios del cliente → selección | Pre-trim Haiku laxo (descarta off-topic obvio del caption, recall) + heat-score v1 métrico: likes+views+engagement × idioma/selección (fórmula: ROADMAP §1) + dedup contra `processed_items`. El substring `tema` salió (ADR-010) | Pregunta filtro + scoring 5 criterios |
| 4. ENRIQUECER | Transcribir, extraer, research profundo | Supadata Whisper + traducción literal al español (Claude Haiku, solo si hace falta), en 2 Code nodes | Research profundo del brief |
| 5. GENERAR | **Perfil de output** del workflow (formato + voz si aplica) | Perfil "script literal": el script es la transcripción/traducción en español tal cual, campo de texto (sin Doc, voz propia en pausa — ADR-009) | Bot → borrador / nugget |
| 6. CALIDAD | Checklist antes de entregar | Gate de relevancia (Haiku) sobre el transcript: jurado estricto vs `criterios_relevancia` → heat-score composite (semántico ⊕ métricas), dropea irrelevantes (ADR-010) | Checklist de 5 preguntas |
| 7. ENTREGAR | Destino nativo + registro central | Airtable `Candidatos` + registro Supabase; seleccionados → Sheet Histórico | Notion |
| 8. NOTIFICAR | Resumen / alerta | n/a (el equipo vive en Airtable; sin email en el MVP) | Telegram |

Interfaces estándar entre etapas (se definen en F1, viven en `core/contracts/`):

- **`content_item`** — el formato común de "una pieza encontrada": plataforma, url, autor, fecha,
  métricas (views, likes, seguidores, reach), tema/hashtags, transcripción/extracto.
- **`output`** — el formato común de "una pieza producida": tipo, plataforma destino, contenido,
  estado, y trazabilidad al `content_item` de origen.

Dos consecuencias de diseño:

1. **Agregar una fuente nueva = agregar un adaptador** que produzca `content_item`, sin tocar
   el resto del workflow.
2. **Cambiar de plataforma destino = cambiar el perfil de la etapa 5** — un mismo research puede
   generar guion de reel y borrador de newsletter. Esto deja abierta la convergencia hacia un
   motor único (decisión D7) sin comprometerla hoy.

### 2.5 Invariantes del diseño (no-negociables — confirmados con Mani 2026-06-11)

Los que nunca se doblan; toda decisión nueva se chequea contra esta lista:

1. **Aislamiento de fallos:** la caída de un workflow — o del registro central — nunca detiene a
   los demás. **El registro es sumidero de datos, jamás dependencia de ejecución.**
2. **Lo que el equipo no técnico toca es no-code e imposible de romper** (Airtable, Sheets,
   formularios, vistas de solo lectura).
3. **Agregar un workflow o cliente N+1 no toca el núcleo** (`core/`): solo plantilla + config.
   Las unidades de extensión: un *cliente* = carpeta en `clients/` · un *workflow* = carpeta en
   `Workflows/` con manifest · una *fuente* = un adaptador que produce `content_item`.
4. **Ningún dato de un cliente se mezcla con otro** — separados por `client` desde el día 1.
5. **Ningún secreto en git** — keys y tokens viven en los motores; en el repo solo placeholders.
   El validador (`core/scripts/validate.mjs`) lo hace cumplir, junto con el contrato del manifest.
6. **Toda corrida queda registrada** (éxito o fallo) con trazabilidad corrida → output → fuente.
7. **El refactor nunca rompe un workflow operativo** (descriptivo primero, intrusivo después).

**Una sola fuente de verdad por cada cosa:** la *config* vive en el repo (`clients/`,
`workflow.yaml`); el *historial* en Supabase; el *espacio de trabajo* en el destino nativo de
cada workflow (Airtable/Sheets/Notion). Ningún dato con dos dueños.

**Límites conocidos (cuándo repensar):** Supabase free (500 MB, pausa por inactividad) → upgrade
o Postgres en VPS · n8n managed single-instance → suficiente hasta decenas de clientes; después
VPS (fase 2 de D5) · Apify/scrapers = la dependencia más frágil · OpenClaw no se orquesta desde
afuera (humano en el loop por diseño).

---

## 3. Decisiones

### 3.1 Tomadas — viven en [`docs/adr/`](./docs/adr/README.md) (porqué + alternativas allá, no acá)

| # | Decisión (una frase) | ADR |
|---|---|---|
| D1 | Motores heterogéneos, contrato común | [ADR-001](./docs/adr/ADR-001-motores-heterogeneos-contrato-comun.md) |
| D2 | Supabase como registro central; Sheets/Notion siguen como destinos nativos | [ADR-002](./docs/adr/ADR-002-supabase-registro-central.md) |
| D3 | Multi-cliente desde el día 1 | [ADR-003](./docs/adr/ADR-003-multicliente-desde-dia-1.md) |
| D4 | Interfaz del jefe simple: dashboard solo-lectura + resumen push | [ADR-004](./docs/adr/ADR-004-interfaz-jefe-dashboard-y-push.md) |
| D5 | Hosting n8n: managed (fase 1) → VPS (fase 2) | [ADR-005](./docs/adr/ADR-005-hosting-n8n-managed-fase1.md) |
| D6 | Plano de datos, sin "workflow padre" orquestador | [ADR-006](./docs/adr/ADR-006-plano-de-datos-sin-workflow-padre.md) |
| D7 | Convergencia gradual a motor único — dirección, no compromiso | [ADR-007](./docs/adr/ADR-007-convergencia-gradual-motor-unico.md) |
| — | Airtable como cockpit del equipo de redes (revisa D4) | [ADR-008](./docs/adr/ADR-008-airtable-cockpit-equipo-redes.md) |
| — | Scripts literales + aprendizaje en el scoring (revisa ADR-008) | [ADR-009](./docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) |

### 3.2 Abiertas (bloquean lo que se indica)

- [ ] **Presupuesto mensual definitivo** — rango tentativo $10–30/mes; el fijo proyectado es
      ~$7–8/mes (§4), así que no bloquea el MVP, pero **hay que validarlo con el jefe**.
      *Bloquea:* fase 2 de hosting (VPS) y suscripciones a fuentes.
- [x] **PikaPods vs InstaPods** — InstaPods (SSH y terminal web, útil para debug). Decisión
      liviana: migrar = export/import. Mani confirma al crear la cuenta (B1 del ROADMAP).
- [ ] **Looker Studio vs Metabase** para el dashboard central — se decide en F4 con un spike de
      1 hora. *Bloquea:* F4. *(El dashboard del equipo de redes no espera a esto: Airtable +
      Sheet Histórico, ROADMAP §5.)*
- [x] **Zona horaria de los crons** — **America/Bogota**, confirmado 2026-06-12. Resta la
      validación explícita al activar (D1 del ROADMAP).
- [ ] **Taxonomía y filtros del dashboard del jefe** — para reels quedó sellada (tipo
      `guion_reel`, check en `002`; *reach* → proxy `views + engagement_rate`). Lo que falta:
      qué quiere ver/filtrar el jefe en el dashboard central — se confirma con prototipo en
      mano. *Bloquea:* F4.
- [ ] **Voz/proyecto inicial del MVP de reels** — el jefe no la ha dado; no bloquea (las voces
      son registros de Airtable editables por el equipo). *Seguimiento:* M0.3 del ROADMAP.

---

## 4. Herramientas y costos

Costo **fijo nuevo** del pipeline (el costo variable por corrida — Apify, Supadata, Claude —
existe igual con o sin pipeline y domina el gasto total; se registra por corrida en `runs.costo_estimado`
para tener visibilidad real):

| Concepto | Herramienta | Costo/mes | Nota |
|---|---|---|---|
| Ejecución workflows n8n | InstaPods (D5) | ~$7 | Ejecuciones ilimitadas; motor + archivado + futuros en la misma instancia |
| Cockpit del equipo | Airtable free | $0 | 1.000 records/base · 1.000 API calls/mes (reglas en el contrato del cockpit) |
| Registro central | Supabase free | $0 | 500 MB ≈ años de texto. ⚠️ Pausa tras ~7 días sin actividad — el cron diario lo mantiene vivo; plan B: Pro $25 o Postgres en VPS |
| Histórico + dashboard equipo | Google Sheets + Looker (si hace falta) | $0 | |
| Bot newsletter | OpenClaw | (ya se paga hoy) | Sin cambio |
| **Total fijo nuevo** | | **~$7–8/mes** | Dentro del rango tentativo con margen |

---

## 5. Etapas de construcción (esqueleto que camina primero)

> Cada etapa termina con un entregable demostrable y su criterio de "hecho". No se avanza a la
> siguiente con la anterior "casi". El refactor de los workflows existentes es **descriptivo
> primero** (se les pone contrato encima) y solo después intrusivo (se les agrega el reporte
> al registro) — nunca se rompe lo que ya funciona.
>
> **Nota de prioridad (2026-06-12, visto bueno del jefe):** el MVP de reels va primero y por
> aparte, con dirección de producto nueva — scripts **literales** (transcripción/traducción, no
> reescritura en voz), prioridad multiidioma, histórico de selecciones exportable, script
> linkeado, aprendizaje dirigido al scoring
> ([ADR-009](./docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md)). El norte y la
> ejecución con los 3 devs viven en [ROADMAP.md](./ROADMAP.md), que manda sobre el orden de F2
> para el workflow de reels; las fases F3–F6 del pipeline general siguen vigentes después.

### F0 — Fundación de diseño *(✅ completada 2026-06-12)*
Diseño formalizado sin código: invariantes (§2.5), ADR-001…009, one-pager presentado y
**visto bueno del jefe dado** (ROADMAP §1).

### F1 — El contrato de workflow *(✅ construida — cierre formal con el manifest post-rework)*
El contrato ([workflow-manifest](./core/contracts/workflow-manifest.md)), los schemas
`content_item`/`output`, el formato de `clients/<cliente>/<wf>.yaml` y el validador existen y
pasan en verde; el manifest del wf de reels mapea las 8 etapas. Resta solo actualizar ese
manifest al estado real del motor tras el rework (D2 del ROADMAP).

### F2 — Esqueleto que camina: el MVP de reels *(en curso — vive en el [ROADMAP](./ROADMAP.md))*
La rebanada fina end-to-end con la dirección ADR-009: cockpit Airtable + motor n8n
(dedup/heat/transcribe-traduce) + registro Supabase + histórico en Sheets. Todo el detalle
(carriles, tasks, validación, criterio de hecho) está en el ROADMAP y el avance en
[handoff](./docs/agents/handoff.md) — no se duplica acá.

### F3 — Puesta en marcha del workflow de Substack + conexión al registro
La prueba de fuego del contrato: el extremo opuesto se monta de cero y entra al mismo registro.
- **Montar el sistema editorial** (hoy inactivo): el jefe llena
  [INTAKE-AGENCIA.md](./Workflows/workflow-substack/INTAKE-AGENCIA.md), se traduce a
  `kit/VARIABLES.md` + `clients/`, y se corre el runbook de 25 mensajes (~8 h de conversación
  con el bot en 1–2 días). Decisión previa (sale de la conversación de F0 con el jefe):
  ¿newsletter de la agencia o de un cliente primero?
- Sync job Notion → Supabase (`core/sync/`): lee las 2 DBs de Notion del newsletter y registra
  research items, borradores y nuggets como `runs`/`outputs`. Puede ser un workflow más de n8n
  (cron diario) — cero infra nueva.
- Mapear estados de Notion (Nuevo/En producción/Publicado…) al ciclo de vida de `outputs`.
- **Hecho cuando:** el cron diario del bot corre en producción · los outputs de ambos workflows
  conviven en el mismo registro con el mismo schema · el sync es idempotente (correrlo dos
  veces no duplica).

### F4 — La capa del jefe *(línea de MVP)*
El sistema se vuelve útil para su usuario final.
- Spike (1h): Looker Studio vs Metabase contra Supabase → decidir y documentar (ADR-006).
- Dashboard v1: outputs recientes listos para usar (con link), corridas por semana, estado
  por workflow/cliente, costo estimado acumulado.
- Resumen semanal push (email/Telegram): "esta semana: X guiones, Y borradores, Z alertas — links".
- Alertas de fallo + heartbeat: si el cron del lunes no corrió a tiempo, alguien se entera
  **sin ir a mirar** (workflow interno que consulta `runs`).
- Validar con el jefe con el prototipo en mano; iterar una vez.
- **Hecho cuando:** el jefe encuentra el último output él solo, sin ayuda · un fallo simulado
  genera alerta antes de 24h · MVP declarado.

### F5 — Workflow N+1 real: búsqueda bajo demanda + templatización
El test de clonar-y-configurar se hace con un workflow real pedido por el jefe, no con un
dry-run ficticio. Este workflow es además el **primer slice del motor de research común** (D7).
- `core/templates/`: esqueleto de workflow nuevo (manifest + estructura + checklist) y de
  cliente nuevo (config + pasos por motor: duplicar wf en n8n / correr kit OpenClaw).
- Guías: `docs/runbooks/agregar-workflow.md` y `agregar-cliente.md`.
- Construir el **workflow #3 — búsqueda de contenido bajo demanda**, siguiendo SOLO la guía:
  - Entrada: **Form Trigger de n8n** (formulario web simple, apto para no técnicos) con los
    filtros validados con el jefe: cliente, plataforma, hashtags, temas, tipo de contenido,
    mínimos de views/likes/suscriptores/reach.
  - Defaults por cliente desde `clients/<cliente>/`; lo elegido en el formulario los sobreescribe
    solo para esa corrida.
  - Reutiliza las etapas COLECTAR/NORMALIZAR del wf de reels (mismos adaptadores Apify); el
    filtro de la etapa 3 lee los params de la corrida en vez de umbrales hardcodeados.
  - Output tailored según perfil elegido + registro en Supabase con `runs.params`.
- Si algún paso de la guía exige "modificar el núcleo", el diseño no está listo — se corrige
  la guía/el contrato, no se parchea a mano (invariante #3, §2.5).
- **Hecho cuando:** el jefe lanza una búsqueda filtrada él solo desde el formulario · el
  workflow #3 nació de la plantilla sin tocar `core/` · las guías quedaron corregidas con lo
  aprendido.

### F6 — Operación sostenible
El sistema sobrevive sin Mani en la cabeza.
- Runbooks de operación: arrancar/parar/redeployar n8n, rotar keys, recuperar de backup,
  modos de falla conocidos (Apify cambia formato, fuente bloqueada, Supabase pausado, TZ mal).
- Backups: export periódico de workflows n8n al repo + backup del schema/datos de Supabase.
- Revisión mensual de costos (query sobre `runs.costo_estimado`).
- Evaluar disparador de fase 2 de hosting (VPS Hetzner) según D5/ADR-005.
- **Hecho cuando:** la prueba de salud pasa entera: ¿§1–§2 siguen siendo verdad? · ¿cada
  decisión estructural tiene su porqué en un ADR? · ¿sigue siendo barato agregar el N+1? ·
  ¿los docs reflejan lo que el sistema *realmente* hace? · ¿un recién llegado podría operarlo
  solo con esto?

---

## 6. Qué se difiere a propósito (y por qué no se pierde nada)

- **Reescribir el wf de Substack a n8n / el de reels a código** — los motores actuales funcionan;
  el contrato los cubre. Se reevalúa solo si un motor se vuelve el problema.
- ~~**UI web custom**~~ — **dejó de estar diferida (2026-07-19):** Airtable free bloqueó el disparo
  del operador y el eje analítico, así que el cockpit pasa a producto propio
  ([ADR-025](./docs/adr/ADR-025-cockpit-producto-propio.md), stack en
  [ADR-026](./docs/adr/ADR-026-stack-del-cockpit-propio.md)). Plan:
  [plan-cockpit-propio.md](./docs/agents/plan-cockpit-propio.md).
- **Publicación automática** a Substack/Instagram — Substack no tiene API pública; el paso manual
  con humano en el loop es además un control de calidad, no solo una limitación.
- **Notion curado para el jefe** — D4: solo si el dashboard + resumen se quedan cortos.
- **Redis, colas, workers, multi-tenant auth** — el volumen (1 cron semanal + 1 diario) está a
  órdenes de magnitud de necesitarlo. Se deja la costura (el registro central es el cuello único
  por diseño), no la feature.

---

## 7. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Apify/scrapers cambian formato o se rompen silenciosamente | Corridas vacías o basura en Sheets | Alertas de corrida vacía/anómala en F4; registro de fallos en F2 |
| OpenClaw (servicio externo, bot semi-autónomo) cambia comportamiento | El workflow de newsletter degrada sin aviso | Playbooks versionados en el repo (ya existen en el kit); log de revisión semanal; el sync de F3 detecta caída de actividad |
| Supabase free tier pausa el proyecto por inactividad | Registro inaccesible (los workflows siguen — D2) | Actividad semanal real + heartbeat; upgrade documentado como plan B |
| Secretos en el JSON de n8n / en configs | Filtración de API keys | Convención F1: credenciales solo en n8n/bot, placeholders en git, validador lo verifica |
| Bus factor: solo Mani entiende el sistema | Insostenible | F6 completo + PLAN/ROADMAP vivos + ADRs |
| Crons en TZ equivocada (ya pasó — incidente real documentado en la master guía) | Corridas a horas equivocadas | Validación explícita de TZ en runbooks (ya es práctica del kit; se hereda como convención del sistema) |
| Costo variable crece con clientes sin que nadie lo vea | Sorpresa en la factura | `costo_estimado` por corrida desde F2 + panel de costos en F4 |

---

## 8. Próximos pasos inmediatos

1. **[los 3 devs]** Ejecutar el [ROADMAP](./ROADMAP.md) del MVP de reels (M0 → activación).
2. **[Mani + jefe]** Validar presupuesto techo (§3.2) y la voz/proyecto inicial.
3. **Después del MVP:** retomar F3 (Substack) y F4 (capa del jefe) de este plan.
