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
| `Workflows/workflow-short-form-content/` | **Máquina**: workflow n8n (21 nodos, JSON importable). Cron semanal + formulario bajo demanda → Apify (IG+TikTok) → filtro parametrizado top-N → Supadata transcribe → Claude escribe guiones en voz del cliente → Google Sheets (guion + métricas) + email con filtros. *El rework ADR-009 (ROADMAP, carril B) cambia generación y destinos.* | ✅ Funcional como plantilla · ❌ **no hosteado** · placeholders `<<...>>` por cliente |
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
   │ destino nativo: G. Sheets    │    │ destino nativo: Notion       │
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

```
clients      (id, nombre, estado)
workflows    (id, nombre, motor [n8n|openclaw|script], estado)
instances    (id, workflow_id, client_id, config_ref, estado)      ← "wf reels para cliente X"
runs         (id, instance_id, inicio, fin, estado [en_curso|ok|fallo|parcial],
              trigger_type [cron|manual|on_demand|conversation],
              params jsonb,                    ← los filtros pedidos en esa corrida
              costo_estimado, metricas jsonb, error)
outputs      (id, run_id, tipo [guion_reel|research_item|borrador_newsletter|nugget],
              titulo, contenido_o_link, estado [draft|aprobado|publicado|descartado],
              publicado_en, source_items jsonb,
              external_id,                     ← id en el destino nativo → sync idempotente (F3)
              metadata jsonb)                  ← métricas del item fuente (views, likes,
                                                 seguidores, hashtags) para filtrar en dashboard
```

Reglas: ningún dato con dos dueños — el registro es dueño del *historial*; Sheets/Notion son
dueños del *espacio de trabajo* de cada workflow. La entidad `client` existe desde el día 1
aunque hoy haya un solo cliente (decisión D3).

### 2.3 Estructura objetivo del repo

```
pipeline-creacion-contenido/
├── README.md                  ← visión + mapa de documentos
├── PLAN.md                    ← este documento (diseño + fases)
├── ROADMAP.md                 ← ejecución del MVP de reels (norte + checklist)
├── docs/
│   ├── adr/                   ← ADR-001..N (decisiones con su porqué)
│   └── transcripciones/       ← fuentes de decisiones (conversaciones con el jefe)
├── core/                      ← EL NÚCLEO: solo cambia con ADR
│   ├── contracts/             ← schema del workflow.yaml + schemas de datos
│   ├── schema/                ← SQL de Supabase, versionado
│   ├── scripts/               ← validador del contrato
│   ├── sync/                  ← sync Notion → registro
│   └── templates/             ← scaffolding de workflow/cliente nuevo
├── clients/
│   └── <cliente>/<wf>.yaml    ← config por cliente (sin secretos)
└── Workflows/
    ├── workflow-short-form-content/   (+ workflow.yaml)
    └── workflow-substack/             (+ workflow.yaml)
```

### 2.4 Anatomía estándar de un workflow de contenido (etapas canónicas)

Los workflows **no se implementan igual, pero se describen y se conectan igual**: todo workflow
de contenido se mapea contra estas 8 etapas en su manifest (las que no aplican se declaran `n/a`):

| Etapa | Responsabilidad | En reels hoy | En substack hoy |
|---|---|---|---|
| 1. COLECTAR | Fuentes → items crudos. **Las fuentes son adaptadores enchufables** — acá vive la diferencia principal entre workflows | Apify IG + TikTok | Bot recorre fuentes validadas |
| 2. NORMALIZAR | Todo item cae al schema común `content_item` | Nodos "Normalizar IG1/TT1" | Implícito en el playbook |
| 3. FILTRAR / SCOREAR | Params de la corrida + criterios del cliente → selección | Filtro viral top-25 (umbrales hardcodeados) | Pregunta filtro + scoring 5 criterios |
| 4. ENRIQUECER | Transcribir, extraer, research profundo | Supadata Whisper | Research profundo del brief |
| 5. GENERAR | LLM con **perfil de output** (voz del cliente + formato de la plataforma destino) | Claude → guion de reel | Bot → borrador / nugget |
| 6. CALIDAD | Checklist antes de entregar | ❌ no tiene (hueco conocido) | Checklist de 5 preguntas |
| 7. ENTREGAR | Destino nativo + registro central | Google Sheets | Notion |
| 8. NOTIFICAR | Resumen / alerta | Email (Gmail) | Telegram |

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

### 3.1 Tomadas (2026-06-11, con Mani — se formalizan como ADRs en F0)

| # | Decisión | Resumen del porqué | Alternativa descartada |
|---|---|---|---|
| D1 | **Motores heterogéneos, contrato común.** No se unifican los engines; se estandariza cómo se describen, configuran y reportan | Los dos workflows son extremos a propósito (README); unificar motor = reescribir trabajo probado sin ganancia | Migrar todo a n8n o a agents en VPS |
| D2 | **Supabase (Postgres) como registro central** de runs/outputs; Sheets/Notion se mantienen como destinos nativos | DB real con SQL, API REST lista (fácil desde n8n), free tier $0, habilita dashboards/queries; el registro es sink adicional, no dependencia | Notion como DB central (queries/dashboards limitados, rate limits) · Sheets central (sin schema, frágil) |
| D3 | **Multi-cliente desde el día 1** en modelo de datos y config | Retrofittear `client` después es caro; tenerlo ahora cuesta casi nada; el wf de reels ya es "una copia por cliente" | Modelar solo la agencia y migrar después |
| D4 | **Interfaz del jefe: simple.** Dashboard solo-lectura + resumen push (email/Telegram). Notion curado queda como extensión futura, no se construye ahora | Jefe no técnico: necesita ver outputs y estado sin poder romper nada; herramientas existentes, cero UI custom | Construir web app propia · Notion como UI obligatoria |
| D5 | **Hosting del wf de reels: n8n managed (fase 1)** ([ADR-005](./docs/adr/ADR-005-hosting-n8n-managed-fase1.md)) | Ya investigado y decidido ahí: ~$4/mes, sin administrar servidor, suficiente para el volumen; VPS Hetzner como fase 2 si escala | n8n Cloud ($24/mes) · reescribir a script · Make/Zapier |
| D6 | **El pipeline central es plano de datos, no un "workflow padre".** No hay orquestador único que dispare a los demás: cada workflow corre en su motor con su propio trigger y reporta al registro. El *dispatcher* de entrada bajo demanda (C9) es un componente opcional dentro de n8n, no el centro del sistema | Un workflow maestro es un punto único de falla (viola el no-negociable de aislamiento: si el padre se rompe, nada corre) y no puede manejar el bot de OpenClaw (conversacional, humano en el loop). La unificación real ocurre en los datos (registro) y en el contrato, no en la ejecución | Workflow padre en n8n/Zapier con un nodo de entrada que rutea a cada workflow hijo |
| D7 | **Convergencia gradual hacia un motor de research único — dirección, no compromiso.** Las costuras se diseñan ya (adaptadores de fuente en COLECTAR, perfiles de output en GENERAR, §2.4); la unificación se evalúa después del MVP, usando el workflow de búsqueda bajo demanda (F5) como primer slice del motor común | Los workflows comparten esencia (research → filtro → generación tailored) y difieren sobre todo en fuentes y formato destino; pero fusionarlos hoy es un big-bang que rompe lo probado y choca con el valor diferencial del wf substack (proceso editorial con humano en el loop, no solo fuentes) | Fusionar los dos workflows en uno ahora |

### 3.2 Abiertas (bloquean lo que se indica)

- [ ] **Presupuesto mensual definitivo** — rango tentativo $10–30/mes; el costo fijo proyectado
      es ~$4–5/mes (ver §4), así que no bloquea F0–F2, pero **hay que validarlo con el jefe**
      junto con la idea general. *Bloquea:* fase 2 de hosting (VPS) y suscripciones a fuentes.
- [x] **PikaPods vs InstaPods** — investigado 2026-06-11: **InstaPods recomendado** ($3/mes,
      SSH y terminal web en todos los planes, útil para debug); PikaPods ($3.80/mes) no da SSH
      y sus backups son *best-effort* cuando la app usa su propia DB. En ambos el riesgo real es
      bajo: los workflows viven versionados en el repo y el registro en Supabase — lo único en
      juego en n8n es el historial de ejecuciones. Decisión liviana (migrar = export/import);
      Mani confirma al crear la cuenta.
- [ ] **Looker Studio vs Metabase** para el dashboard (Looker = $0 y cero infra pero conecta a
      Postgres con limitaciones; Metabase = más potente pero hay que hostearlo). Se decide en F4
      con un spike de 1 hora. *Bloquea:* F4.
- [x] **Zona horaria oficial de los crons** — **America/Bogota (GMT-5)**, confirmado por Mani
      2026-06-12. Ya es el valor del manifest del wf de reels; resta validar la interpretación
      TZ explícitamente al activar (D1 del runbook F2).
- [ ] **Taxonomía y personalización de outputs** — qué tipos de output existen, con qué campos,
      y qué quiere ver/filtrar el jefe tanto en el dashboard como en la entrada bajo demanda
      (los specs que ya pidió: views, likes, suscriptores, reach, hashtags, tipo de contenido,
      temas — se confirman con prototipo en mano, no en abstracto). *Bloquea:* cierre de F1 y F4.
      **Parcialmente resuelto (2026-06-12):** *reach* no se exige — se acepta `views + engagement_rate`
      como proxy (no cambia herramienta de colecta ni costo). *Qué filtros exponer en el formulario*
      se decide al montar el dashboard (D3), con datos reales en mano.

---

## 4. Herramientas y costos

Costo **fijo nuevo** del pipeline (el costo variable por corrida — Apify, Supadata, Claude —
existe igual con o sin pipeline y domina el gasto total; se registra por corrida en `runs.costo_estimado`
para tener visibilidad real):

| Concepto | Herramienta | Costo/mes | Nota |
|---|---|---|---|
| Ejecución wf reels | n8n en PikaPods/InstaPods | ~$3–4 | Decisión D5; ejecuciones ilimitadas |
| Registro central | Supabase free tier | $0 | Límite 500 MB (años de outputs de texto). ⚠️ El free tier pausa proyectos tras ~7 días sin actividad — la actividad semanal del cron debería mantenerlo vivo; si molesta: Pro $25 o Postgres en el VPS de fase 2 |
| Dashboard | Looker Studio o Metabase self-host | $0 | Se decide en F4 |
| Resumen + alertas | El mismo n8n (workflow interno) → Gmail/Telegram | $0 | |
| Bot newsletter | OpenClaw | (ya se paga hoy) | Sin cambio |
| **Total fijo nuevo** | | **~$4–5/mes** | Dentro del rango tentativo con margen amplio |

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
Formalizar el diseño y las decisiones. **Nada de código.**
- Objetivo, usuarios, no-negociables y escalabilidad definidos (hoy consolidados en §1, §2.5
  y los ADRs; el system-blueprint de trabajo se retiró al absorberse acá). ✅
- Escribir ADR-001…007 en `docs/adr/` (las 7 decisiones de §3.1, con alternativas y porqués). ✅
- Preparar un one-pager para la conversación con el jefe: qué es, qué le da, qué cuesta (§4),
  y qué se le va a pedir: presupuesto, prioridades, **taxonomía de outputs** (qué quiere ver y
  cómo) y **los filtros de búsqueda que necesita** (sus specs de views/likes/suscriptores/reach/
  hashtags/tipo/temas entran acá y alimentan F1 y F5). ✅ `docs/one-pager-jefe.md`
- **Hecho cuando:** invariantes confirmados · ADRs escritos · one-pager presentado ·
  conversación con el jefe realizada (✅ visto bueno 2026-06-12 — ver ROADMAP §1).

### F1 — El contrato de workflow *(borrador completo 2026-06-11 — pendiente revisión de Mani y taxonomía con el jefe)*
La unidad de extensión queda definida y los dos workflows existentes la cumplen *sin tocar su funcionamiento*.
- Diseñar el schema de `workflow.yaml`: identidad, motor, trigger, inputs (config + credenciales
  requeridas + **filtros que acepta por corrida**), outputs (tipos + dónde caen), runbook
  (arrancar/parar/probar), estado, costo por corrida.
- Definir el **catálogo de outputs** (taxonomía: tipos, campos por tipo, métricas del item
  fuente) y los schemas `content_item` / `output` de §2.4 — validados con lo que diga el jefe
  en la conversación de F0.
- Mapear ambos workflows existentes a las **etapas canónicas** (§2.4) dentro de sus manifests.
- Escribir el `workflow.yaml` de los dos workflows existentes.
- Definir el formato de `clients/<cliente>/<wf>.yaml` (mapea 1:1 a los `<<placeholders>>` del
  wf de reels y a las `{{LLAVES}}` del kit Substack — los dos sistemas de variables de hoy quedan
  unificados en una sola convención).
- Script validador (`core/scripts/validate`): manifest completo, config sin claves faltantes,
  **sin secretos en git** (las convenciones se hacen cumplir, no se esperan — principio #8).
- **Hecho cuando:** el validador pasa en verde · una persona nueva entiende ambos workflows
  leyendo solo sus manifests.

### F2 — Esqueleto que camina: puesta en marcha del workflow de reels + registro central
La rebanada fina end-to-end: el workflow de reels montado de cero y una corrida real registrada
centralmente. Checklist ejecutable: [ROADMAP.md §3](./ROADMAP.md) (carriles A/B/C).
- **Montar el workflow de reels** (hoy no opera): levantar n8n managed (InstaPods), importar el
  JSON, cargar credenciales, resolver placeholders con la config del cliente real, corrida
  manual de prueba (= carril B del ROADMAP).
- Crear proyecto Supabase + aplicar `core/schema/001_registro_inicial.sql` (las 5 tablas de §2.2).
- Agregar al final del wf de reels un nodo HTTP que reporta a Supabase: 1 fila en `runs` +
  N filas en `outputs` (una por guion). Google Sheets sigue funcionando igual.
- Registrar también las corridas fallidas (el nodo de error de n8n → `runs` con estado `fallo`).
- **Hecho cuando:** una corrida real del lunes aparece en Supabase con sus ~25 guiones,
  consultable por SQL · una falla simulada queda registrada como `fallo`.

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
- **UI web custom** — dashboard de herramienta existente cubre la necesidad; una UI propia es
  mantenimiento permanente sin ganancia hoy.
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
