# Plan de ejecución — Pipeline Central de Creación de Contenido

> **Qué es este documento:** el plan concreto y por etapas para construir el pipeline central,
> derivado del diagnóstico completo del repo (2026-06-11) y de las decisiones tomadas con Mani.
> El [README](./README.md) da la visión; el [system-blueprint](./system-blueprint.md) da el método;
> este plan da el **orden de ejecución**. Si el plan y la realidad se contradicen, gana la realidad:
> se actualiza el plan.
>
> **Estado:** aprobado en diseño · pendiente validación de presupuesto con el jefe (ver §3.2).

---

## 1. Punto de partida (diagnóstico)

Lo que existe hoy en el repo:

| Pieza | Qué es | Estado |
|---|---|---|
| `README.md` | Visión del sistema central | ✅ Escrito |
| `system-blueprint.md` | Plantilla de diseño (10 principios, 14 secciones) | ⬜ Sin llenar — se llena en F0 |
| `Workflows/workflow-short-form-content/` | **Máquina**: workflow n8n (19 nodos, JSON importable). Cron semanal → Apify (IG+TikTok) → filtro top-25 viral → Supadata transcribe → Claude escribe guiones en voz del cliente → Google Sheets + email | ✅ Funcional como plantilla · ❌ **no hosteado** · placeholders `<<...>>` por cliente |
| `Workflows/workflow-substack/` | **Procedimiento**: kit de 16 plantillas + guía de 14 fases que configura un bot OpenClaw (Telegram) → research diario con scoring → Notion (2 DBs) → borradores → publicación manual a Substack | ✅ Probado en producción real (mar–abr 2026, *AI for Executives*) |

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
| C8 | **Documentación viva** | Blueprint lleno, ADRs, runbooks por workflow | `system-blueprint.md` + `docs/` |
| C9 | **Entrada bajo demanda (dispatcher)** | Formulario simple (no técnico) que dispara corridas con filtros — cliente, plataforma, hashtags, tema, mínimos de views/likes/seguidores — y las rutea al workflow correspondiente | workflow interno de n8n (se construye en F5) |

### 2.2 Modelo de datos del registro (v0, se refina en F2)

```
clients      (id, nombre, estado)
workflows    (id, slug, nombre, motor [n8n|openclaw|script], version, estado)
instances    (id, workflow_id, client_id, config_ref, estado)      ← "wf reels para cliente X"
runs         (id, instance_id, inicio, fin, estado [ok|fallo|parcial],
              trigger [cron|manual|on_demand],
              params jsonb,                    ← los filtros pedidos en esa corrida
              costo_estimado, metricas jsonb, error)
outputs      (id, run_id, tipo [guion|borrador|nugget|research_item],
              titulo, contenido_o_link, estado [draft|aprobado|publicado],
              publicado_en,
              metadata jsonb)                  ← métricas del item fuente (views, likes,
                                                 seguidores, hashtags) para filtrar en dashboard
```

Reglas: ningún dato con dos dueños — el registro es dueño del *historial*; Sheets/Notion son
dueños del *espacio de trabajo* de cada workflow. La entidad `client` existe desde el día 1
aunque hoy haya un solo cliente (decisión D3).

### 2.3 Estructura objetivo del repo

```
pipeline-creacion-contenido/
├── README.md                  ← visión (existe)
├── PLAN.md                    ← este documento
├── system-blueprint.md        ← se llena en F0 (deja de ser plantilla vacía)
├── docs/
│   ├── adr/                   ← ADR-001..N (decisiones con su porqué)
│   └── runbooks/              ← cómo operar/arrancar/arreglar cada pieza
├── core/                      ← EL NÚCLEO: solo cambia con ADR
│   ├── contracts/             ← schema del workflow.yaml
│   ├── schema/                ← SQL de Supabase, versionado
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

---

## 3. Decisiones

### 3.1 Tomadas (2026-06-11, con Mani — se formalizan como ADRs en F0)

| # | Decisión | Resumen del porqué | Alternativa descartada |
|---|---|---|---|
| D1 | **Motores heterogéneos, contrato común.** No se unifican los engines; se estandariza cómo se describen, configuran y reportan | Los dos workflows son extremos a propósito (README); unificar motor = reescribir trabajo probado sin ganancia | Migrar todo a n8n o a agents en VPS |
| D2 | **Supabase (Postgres) como registro central** de runs/outputs; Sheets/Notion se mantienen como destinos nativos | DB real con SQL, API REST lista (fácil desde n8n), free tier $0, habilita dashboards/queries; el registro es sink adicional, no dependencia | Notion como DB central (queries/dashboards limitados, rate limits) · Sheets central (sin schema, frágil) |
| D3 | **Multi-cliente desde el día 1** en modelo de datos y config | Retrofittear `client` después es caro; tenerlo ahora cuesta casi nada; el wf de reels ya es "una copia por cliente" | Modelar solo la agencia y migrar después |
| D4 | **Interfaz del jefe: simple.** Dashboard solo-lectura + resumen push (email/Telegram). Notion curado queda como extensión futura, no se construye ahora | Jefe no técnico: necesita ver outputs y estado sin poder romper nada; herramientas existentes, cero UI custom | Construir web app propia · Notion como UI obligatoria |
| D5 | **Hosting del wf de reels: n8n managed (fase 1)** según [HOSTING.md](./Workflows/workflow-short-form-content/HOSTING.md) — se eleva a decisión del sistema | Ya investigado y decidido ahí: ~$4/mes, sin administrar servidor, suficiente para el volumen; VPS Hetzner como fase 2 si escala | n8n Cloud ($24/mes) · reescribir a script · Make/Zapier |
| D6 | **El pipeline central es plano de datos, no un "workflow padre".** No hay orquestador único que dispare a los demás: cada workflow corre en su motor con su propio trigger y reporta al registro. El *dispatcher* de entrada bajo demanda (C9) es un componente opcional dentro de n8n, no el centro del sistema | Un workflow maestro es un punto único de falla (viola el no-negociable de aislamiento: si el padre se rompe, nada corre) y no puede manejar el bot de OpenClaw (conversacional, humano en el loop). La unificación real ocurre en los datos (registro) y en el contrato, no en la ejecución | Workflow padre en n8n/Zapier con un nodo de entrada que rutea a cada workflow hijo |
| D7 | **Convergencia gradual hacia un motor de research único — dirección, no compromiso.** Las costuras se diseñan ya (adaptadores de fuente en COLECTAR, perfiles de output en GENERAR, §2.4); la unificación se evalúa después del MVP, usando el workflow de búsqueda bajo demanda (F5) como primer slice del motor común | Los workflows comparten esencia (research → filtro → generación tailored) y difieren sobre todo en fuentes y formato destino; pero fusionarlos hoy es un big-bang que rompe lo probado y choca con el valor diferencial del wf substack (proceso editorial con humano en el loop, no solo fuentes) | Fusionar los dos workflows en uno ahora |

### 3.2 Abiertas (sección 14 del blueprint — bloquean lo que se indica)

- [ ] **Presupuesto mensual definitivo** — rango tentativo $10–30/mes; el costo fijo proyectado
      es ~$4–5/mes (ver §4), así que no bloquea F0–F2, pero **hay que validarlo con el jefe**
      junto con la idea general. *Bloquea:* fase 2 de hosting (VPS) y suscripciones a fuentes.
- [ ] **PikaPods vs InstaPods** (cuál da mejor persistencia/backup en el plan barato). *Bloquea:* F2.
- [ ] **Looker Studio vs Metabase** para el dashboard (Looker = $0 y cero infra pero conecta a
      Postgres con limitaciones; Metabase = más potente pero hay que hostearlo). Se decide en F4
      con un spike de 1 hora. *Bloquea:* F4.
- [ ] **Zona horaria oficial de los crons** del sistema. *Bloquea:* activación en F2.
- [ ] **Taxonomía y personalización de outputs** — qué tipos de output existen, con qué campos,
      y qué quiere ver/filtrar el jefe tanto en el dashboard como en la entrada bajo demanda
      (los specs que ya pidió: views, likes, suscriptores, reach, hashtags, tipo de contenido,
      temas — se confirman con prototipo en mano, no en abstracto). *Bloquea:* cierre de F1 y F4.

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

### F0 — Fundación de diseño *(en curso)*
Llenar el blueprint y formalizar decisiones. **Nada de código.**
- Llenar secciones 1–5 del `system-blueprint.md` (objetivo, usuarios, no-negociables,
  requerimientos, escalabilidad) — sesión de trabajo Mani + Claude. ✅ borrador listo
  (pendiente: Mani confirma no-negociables y métricas de éxito).
- Escribir ADR-001…007 en `docs/adr/` (las 7 decisiones de §3.1, con alternativas y porqués). ✅
- Preparar un one-pager para la conversación con el jefe: qué es, qué le da, qué cuesta (§4),
  y qué se le va a pedir: presupuesto, prioridades, **taxonomía de outputs** (qué quiere ver y
  cómo) y **los filtros de búsqueda que necesita** (sus specs de views/likes/suscriptores/reach/
  hashtags/tipo/temas entran acá y alimentan F1 y F5). ✅ `docs/one-pager-jefe.md`
- **Hecho cuando:** blueprint 1–5 sin `<<...>>` · 7 ADRs escritos · one-pager listo · Mani
  confirmó no-negociables y métricas de éxito · conversación con el jefe realizada.

### F1 — El contrato de workflow
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

### F2 — Esqueleto que camina: registro central + primer workflow conectado
La rebanada fina end-to-end: una corrida real registrada centralmente.
- Levantar n8n managed (checklist fase 1 de HOSTING.md: importar JSON, credenciales,
  placeholders del cliente real, corrida manual de prueba).
- Crear proyecto Supabase + aplicar `core/schema/` v0 (las 5 tablas de §2.2).
- Agregar al final del wf de reels un nodo HTTP que reporta a Supabase: 1 fila en `runs` +
  N filas en `outputs` (una por guion). Google Sheets sigue funcionando igual.
- Registrar también las corridas fallidas (el nodo de error de n8n → `runs` con estado `fallo`).
- **Hecho cuando:** una corrida real del lunes aparece en Supabase con sus ~25 guiones,
  consultable por SQL · una falla simulada queda registrada como `fallo`.

### F3 — Segundo workflow conectado
La prueba de fuego del contrato: el extremo opuesto entra al mismo registro.
- Sync job Notion → Supabase (`core/sync/`): lee las 2 DBs de Notion del newsletter y registra
  research items, borradores y nuggets como `runs`/`outputs`. Puede ser un workflow más de n8n
  (cron diario) — cero infra nueva.
- Mapear estados de Notion (Nuevo/En producción/Publicado…) al ciclo de vida de `outputs`.
- **Hecho cuando:** los outputs de ambos workflows conviven en el mismo registro con el mismo
  schema · el sync es idempotente (correrlo dos veces no duplica).

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
  la guía/el contrato, no se parchea a mano (test del blueprint, sección 5).
- **Hecho cuando:** el jefe lanza una búsqueda filtrada él solo desde el formulario · el
  workflow #3 nació de la plantilla sin tocar `core/` · las guías quedaron corregidas con lo
  aprendido.

### F6 — Operación sostenible
El sistema sobrevive sin Mani en la cabeza.
- Runbooks de operación: arrancar/parar/redeployar n8n, rotar keys, recuperar de backup,
  modos de falla conocidos (Apify cambia formato, fuente bloqueada, Supabase pausado, TZ mal).
- Backups: export periódico de workflows n8n al repo + backup del schema/datos de Supabase.
- Revisión mensual de costos (query sobre `runs.costo_estimado`).
- Evaluar disparador de fase 2 de hosting (VPS Hetzner) según D5/HOSTING.md.
- **Hecho cuando:** checklist de salud del blueprint pasa entero, incluido "¿un recién llegado
  podría operarlo solo con esto?".

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
| Bus factor: solo Mani entiende el sistema | Insostenible (viola principio #10) | F6 completo + blueprint vivo + ADRs |
| Crons en TZ equivocada (ya pasó — incidente real documentado en la master guía) | Corridas a horas equivocadas | Validación explícita de TZ en runbooks (ya es práctica del kit; se hereda como convención del sistema) |
| Costo variable crece con clientes sin que nadie lo vea | Sorpresa en la factura | `costo_estimado` por corrida desde F2 + panel de costos en F4 |

---

## 8. Próximos pasos inmediatos

1. **[Mani + jefe]** Presentar la idea con el one-pager de F0 → validar presupuesto y prioridades.
2. **[Mani + Claude]** Sesión F0: llenar blueprint secciones 1–5 + escribir los 5 ADRs.
3. **[Claude]** F1: primer draft del schema `workflow.yaml` + manifests de los dos workflows,
   para revisión de Mani.
