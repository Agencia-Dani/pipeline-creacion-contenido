---
type: blueprint
name: pipeline-creacion-contenido
description: Contrato de diseño del Pipeline Central de Creación de Contenido — versión llenada del system-blueprint para este sistema.
---

# 🏗️ System Blueprint — Pipeline Central de Creación de Contenido

> **Cómo usar este documento.** Es el contrato vivo entre Mani y su AI building partner. Se
> revisita en cada decisión grande. Cada sección existe para evitar un error caro y para que
> cualquier IA (o persona) que entre tenga TODO el contexto sin re-derivarlo.
>
> Reglas: toda decisión estructural se registra con su porqué (sección 8 → `docs/adr/`); lo que
> no se sabe se escribe como pregunta abierta (sección 14), no se inventa; **si una sección y la
> realidad se contradicen, gana la realidad: se actualiza el doc.**
>
> Documentos hermanos — cada hecho tiene UN dueño:
> - [README.md](./README.md) — la visión y orientación.
> - [PLAN.md](./PLAN.md) — arquitectura detallada (§2), decisiones y abiertas (§3), costos (§4),
>   etapas de construcción (§5), riesgos (§7).
> - `docs/adr/` — el porqué de cada decisión estructural.
> - Este blueprint — el contrato: objetivo, usuarios, no-negociables, requerimientos, escalabilidad.

---

## 🧭 Principios a tener en mente EN TODO MOMENTO

Estos no son fases — son lentes que aplicás a cada decisión, siempre. Si una decisión los viola, parás.

1. **Separá el núcleo estable de los bordes volátiles.** Lo que casi nunca cambia (el motor, el modelo de datos, las interfaces) va al centro y se protege; lo que cambia seguido (un cliente nuevo, un flujo nuevo, una fuente nueva) vive en los bordes como *configuración* o *plugins*, nunca tocando el núcleo. **Esta separación ES lo que hace al sistema escalable.**
2. **La unidad de crecimiento tiene que ser barata.** Preguntá siempre: *"¿qué cuesta agregar el flujo/cliente número N+1?"* Si la respuesta es "tocar código del núcleo", el diseño está mal. El objetivo es **clonar-y-configurar**, no programar de nuevo.
3. **Una sola fuente de verdad por cada cosa.** Config en un lado, estado en un lado. Datos duplicados = bugs garantizados y mantenimiento que no escala.
4. **Diseñá contra interfaces, no contra implementaciones.** Definí *qué* hace cada pieza y *qué* le entra/sale (el contrato); la implementación interna puede cambiar sin romper a los vecinos.
5. **Esqueleto que camina primero.** Construí una rebanada fina end-to-end que funcione (input real → output real) antes de engordar cualquier parte. Un sistema que hace el 10% completo > uno que tiene el 90% de una pieza y nada conectado.
6. **Reversibilidad y observabilidad desde el día 1.** Si no podés ver qué pasó (logs, métricas) y deshacerlo (rollback, idempotencia), no está listo para crecer. Lo barato de agregar hoy es carísimo de retrofittear.
7. **YAGNI, pero dejá las costuras.** No construyas la feature que *quizás* necesites. Sí dejá el *punto de extensión* (la interfaz, el hook) donde esa feature entraría. Abstracción prematura y rigidez prematura matan por igual.
8. **Las convenciones se hacen cumplir, no se esperan.** Un naming/estructura "acordado" pero no enforced (linter, template, validación) se erosiona. Automatizá lo que pueda romperse por descuido.
9. **Optimizá para el que mantiene, no para el que escribe.** El código/config se lee 10× más de lo que se escribe. Claridad > inteligencia. El "yo de dentro de 6 meses" es un usuario más.
10. **Sostenibilidad = el sistema sobrevive sin vos.** Si solo vos sabés cómo arrancarlo, arreglarlo o extenderlo, no es sostenible. Documentá los runbooks y los puntos de falla (sección 11).

---

## 1. Objetivo y problema (el *por qué*)

- **Problema que resuelve:** los flujos de creación de contenido de la agencia viven como
  proyectos sueltos y desconectados — cada uno con su propia forma, su propia config y sus
  outputs en lugares distintos (Google Sheets, Notion). Sumar un flujo o cliente nuevo es
  empezar de cero, y nadie puede ver qué produce el sistema sin ir a mirar pieza por pieza.
- **¿A quién le duele hoy y cómo se las arregla sin el sistema?** Al jefe (dueño de la agencia,
  no técnico): no tiene visibilidad de lo producido ni forma simple de pedir contenido a su
  medida — depende de pedirle todo a Mani. Y a Mani (operador): mantiene cada pieza a mano,
  re-derivando contexto en cada cambio.
- **Objetivo del sistema:** un sistema central donde todos los workflows comparten contrato,
  config estandarizada y un registro persistente de corridas y outputs — de modo que pedir
  contenido filtrado, ver lo producido y agregar flujos/clientes sea barato, seguro y no
  requiera entender la máquina por dentro.
- **Cómo se ve el éxito** *(señales concretas — ⚠️ propuestas, confirmar con Mani/jefe)*:
  1. El jefe lanza una búsqueda de contenido filtrada y encuentra el output él solo, sin ayuda.
  2. El 100% de las corridas de todos los workflows quedan registradas en el registro central
     (cero outputs "huérfanos" que solo viven en un Sheet o un Notion).
  3. Agregar el cliente N+1 toma < 1 hora y cero cambios en `core/`.
  4. Una falla se conoce por alerta en < 24 h, nunca porque alguien fue a mirar.
  5. Costo fijo de infraestructura dentro del presupuesto acordado.
- **Qué NO es esto (anti-objetivos):**
  - NO es un motor de ejecución único — los workflows siguen corriendo en sus motores (n8n, OpenClaw).
  - NO publica automáticamente en las plataformas (Substack/IG) — el humano aprueba y publica.
  - NO es una web app / UI custom — la capa visual usa herramientas existentes.
  - NO es un producto SaaS para vender — es la infraestructura interna de la agencia.
- **¿Por qué ahora? ¿Qué pasa si no se construye?** Hay dos workflows probados a punto de operar
  para clientes reales, y el jefe ya pidió capacidades (búsqueda filtrada) que exigen la
  estandarización. Cada cliente o flujo que entre antes de tener la base común agranda el costo
  del refactor y multiplica el trabajo manual repetido.
- **El caso de uso más chico que ya entrega valor:** una corrida real del workflow de reels
  registrada en el registro central y visible (etapa F2 del plan). Todo lo demás se monta encima.

---

## 2. Usuarios y stakeholders (el *para quién*)

| Tipo | Quién es | Qué necesita del sistema | Qué le importa (y qué NO le importa) |
|---|---|---|---|
| Usuario final | **El jefe** — dueño de la agencia, no técnico | Pedir contenido con filtros (formulario simple); ver outputs listos para usar y el estado del sistema; recibir resúmenes | Le importa: simplicidad, resultados usables, confiabilidad. NO le importa: los motores, el repo, la máquina por dentro |
| Operador / mantenedor | **Mani** | Contratos claros, runbooks, validadores, alertas; agregar/arreglar piezas sin arqueología | Le importa: mantenibilidad, documentación, aislamiento de fallos. NO le importa: ceremonia sin función |
| Dueño / negocio | **La agencia (30X)** | Contenido de calidad por cliente, a bajo costo, escalable a más clientes | Le importa: costo/valor, tiempo ahorrado, calidad del output. NO le importa: el detalle técnico |

- **Interfaz principal de cada uno:** jefe → formulario de búsqueda (n8n Form Trigger) +
  dashboard solo-lectura + resumen por email/Telegram. Mani → repo + n8n + Supabase. Agencia →
  reportes derivados del dashboard.
- **Nivel técnico del que lo opera:** el jefe = ninguno → **todo lo que él toca es no-code
  estricto e imposible de romper** (formularios y vistas de solo lectura). Mani = técnico →
  opera el resto.

---

## 3. No-negociables (los invariantes que nunca se doblan)

> ⚠️ Propuestos a partir de las decisiones tomadas — confirmar con Mani antes de darlos por sellados.

- [ ] **Aislamiento de fallos:** la caída de un workflow — o del registro central — nunca
      detiene a los demás. El registro es sumidero de datos, jamás dependencia de ejecución.
- [ ] **Lo que el jefe toca es no-code e imposible de romper** (formularios, vistas de solo lectura).
- [ ] **Agregar un workflow o cliente N+1 no toca el núcleo** (`core/`): solo plantilla + config.
- [ ] **Ningún dato de un cliente se mezcla con otro** — config y outputs separados por `client`
      desde el día 1.
- [ ] **Ningún secreto en git.** API keys y tokens viven en los motores (credentials de n8n,
      workspace del bot) — en el repo solo placeholders. El validador lo verifica.
- [ ] **Toda corrida queda registrada** (éxito o fallo) con trazabilidad completa:
      corrida → outputs → item fuente.
- [ ] **Los dos workflows existentes nunca dejan de funcionar** durante el refactor
      (refactor descriptivo primero, intrusivo después).

---

## 4. Requerimientos

### 4.1 Funcionales (QUÉ hace)

| # | Capacidad | Prioridad | Notas |
|---|---|---|---|
| F1 | El sistema registra toda corrida y todo output de todo workflow en el registro central, para que la agencia tenga historial consultable | Must | Núcleo del valor; etapas F2–F3 del plan |
| F2 | El jefe lanza búsquedas de contenido bajo demanda con filtros (views, likes, suscriptores, reach, hashtags, tipo de contenido, temas) desde un formulario simple | Must | Spec pedido por el jefe; etapa F5; filtros exactos a confirmar (sección 14) |
| F3 | El jefe consulta outputs y corridas en un dashboard (por cliente, workflow, fecha, métricas del item fuente) | Must | Etapa F4 |
| F4 | El sistema avisa de fallos y de crons que no corrieron (alerta + heartbeat), sin que nadie vaya a mirar | Must | Etapa F4 |
| F5 | El sistema envía un resumen periódico push (email/Telegram) de lo producido | Should | Etapa F4 |
| F6 | Agregar un cliente nuevo = llenar una config + checklist (clonar-y-configurar) | Must | Etapa F5 |
| F7 | Agregar un workflow nuevo = clonar plantilla + manifest, sin tocar el núcleo | Should | Etapa F5; validado construyendo el workflow #3 |
| F8 | Los outputs del workflow de Substack (Notion) se sincronizan al registro de forma idempotente | Must | Etapa F3 |
| F9 | Vistas curadas en Notion para el jefe | Could | Diferido (ADR-004) — solo si dashboard + resumen se quedan cortos |

### 4.2 No funcionales (QUÉ TAN BIEN lo hace)

- **Rendimiento / volumen:** hoy ~1 corrida semanal de reels (~25 outputs) + cron diario del
  newsletter (~5–10 research items/día) + búsquedas bajo demanda esporádicas. Todo es batch:
  una corrida que tarda 10–20 min es perfectamente aceptable. Sin requisitos de tiempo real.
- **Confiabilidad:** las corridas fallidas se registran como `fallo` (no desaparecen); el sync
  Notion→registro es idempotente (re-correrlo no duplica); lo que NO puede perderse: los outputs
  ya generados y su historial. Reintentos: manuales, documentados en runbook (volumen no
  justifica retry automático).
- **Escalabilidad:** ver sección 5.
- **Costo:** fijo objetivo ~$4–5/mes (techo a acordar con el jefe: rango tentativo $10–30);
  detalle en [PLAN.md §4](./PLAN.md). El costo variable (Apify, Claude, Supadata) domina y se
  registra por corrida (`runs.costo_estimado`) para tener visibilidad real por cliente.
- **Seguridad / secretos:** credenciales solo en los motores (n8n credentials, workspace del
  bot) y en Supabase (service keys fuera de git). En el repo: únicamente placeholders. Datos
  sensibles: contenido y voz de clientes de la agencia — nunca se mezclan entre clientes ni se
  publican.
- **Observabilidad:** toda corrida reporta inicio/fin/estado/costo; heartbeat detecta crons que
  no corrieron; alerta llega por email/Telegram en < 24 h. Nos enteramos antes que el cliente.
- **Mantenibilidad:** un tercero entiende cualquier workflow leyendo solo su `workflow.yaml`;
  convenciones verificadas por el validador (principio #8); decisiones con su porqué en
  `docs/adr/`; runbooks en `docs/runbooks/`.
- **Privacidad / compliance:** sin datos personales de terceros más allá de contenido público
  scrapeado; el contenido generado es propiedad de la agencia/cliente. Nada del repo se hace público.

---

## 5. Escalabilidad y crecimiento (el *cómo crece*)

- **Ejes de crecimiento:** (1°, principal) **más clientes** · (2°) más workflows / tipos de
  contenido · (3°) más fuentes. Más volumen NO es eje relevante: el diseño tiene órdenes de
  magnitud de holgura.
- **La "unidad de extensión"** — tres, concretas y clonables:
  - **Un cliente** = carpeta `clients/<cliente>/` con un yaml por workflow que usa (la unión
    estandarizada de los `<<placeholders>>` del wf de reels y las `{{LLAVES}}` del kit Substack).
  - **Un workflow** = carpeta en `Workflows/` con `workflow.yaml` que cumple el contrato
    (incl. mapeo a las 8 etapas canónicas de [PLAN.md §2.4](./PLAN.md)) + su implementación en
    el motor que sea.
  - **Una fuente** = un adaptador de la etapa COLECTAR que produce `content_item`.
- **Costo de agregar el N+1 (objetivo):**
  - Cliente: 1 config + duplicar workflow en su motor + checklist → **< 1 hora, 0 líneas en el núcleo**.
  - Workflow: clonar plantilla + llenar manifest + implementar en su motor + pasar validador → **0 cambios en `core/`**.
  - Fuente: 1 adaptador nuevo → **0 cambios en el resto del workflow**.
- **Puntos de extensión (las costuras):** adaptadores de fuente (etapa 1) · perfiles de output
  (etapa 5) · tipos de output en el catálogo · motores nuevos vía contrato + adaptador de
  ingesta (C4) · filtros nuevos declarados en el manifest.
- **Qué se comparte vs. qué es propio:** compartido = registro central, contrato, schemas
  (`content_item`, `output`), dispatcher, dashboard, alertas, convenciones, plantillas. Propio
  de cada workflow = su implementación, sus fuentes, sus prompts/voz, su destino nativo, su cadencia.
- **Límites conocidos (cuándo repensar):** Supabase free tier (500 MB, pausa por inactividad)
  → upgrade o Postgres en VPS · n8n managed single-instance sin workers → suficiente hasta
  decenas de clientes con corridas semanales; después, VPS con cola (fase 2 de D5) · Apify y
  scrapers son la dependencia más frágil del sistema · OpenClaw no se orquesta desde afuera
  (humano en el loop por diseño — es feature, no bug).
- **Test del AI partner** ("agregá el flujo #5 sin modificar el núcleo"): el paso a paso vive en
  `docs/runbooks/agregar-workflow.md` (se escribe y se valida en la etapa F5 construyendo el
  workflow #3 real). Si algún paso exige tocar `core/`, se corrige el diseño, no se parchea.

---

## 6. Overview del sistema (el *qué es*, alto nivel)

> **Dueño único de esta vista: [PLAN.md §2](./PLAN.md)** — diagrama, componentes C1–C9, flujo de
> datos y núcleo-vs-bordes. Resumen de 60 segundos: los workflows corren cada uno en su motor y
> escriben a su destino nativo; *además* reportan a un **registro central** (Supabase) que
> alimenta el dashboard, los resúmenes y las alertas. El **núcleo estable** = contrato +
> registro + convenciones; los **bordes volátiles** = cada workflow, cada cliente, cada fuente.

---

## 7. Datos y estado (la *fuente de verdad*)

- **Fuente de verdad de la configuración:** el repo — `clients/<cliente>/*.yaml` y
  `Workflows/<wf>/workflow.yaml`. Los secretos NO (viven en los motores).
- **Fuente de verdad del estado/resultados:** Supabase — el **historial** (corridas y outputs).
  Sheets/Notion son dueños del **espacio de trabajo** de cada workflow (donde se edita/aprueba),
  no del historial. Ningún dato tiene dos dueños.
- **Modelo de datos:** `clients · workflows · instances · runs · outputs` — schema en
  [PLAN.md §2.2](./PLAN.md), SQL versionado en `core/schema/`.
- **Ciclo de vida de un dato:** item encontrado (`content_item`) → seleccionado/scoreado →
  output generado (`draft`) → aprobado → publicado → queda en el historial permanente.
  Política de archivado/purga: no definida aún (no urge a este volumen — sección 14).

---

## 8. Decisiones estructurales (ADRs)

> Viven en **`docs/adr/`**, una por archivo, con contexto, alternativas descartadas y
> consecuencias. Índice actual: ADR-001 motores heterogéneos · ADR-002 Supabase como registro ·
> ADR-003 multi-cliente día 1 · ADR-004 interfaz del jefe · ADR-005 hosting n8n ·
> ADR-006 plano de datos sin workflow padre · ADR-007 convergencia gradual a motor único.
> Tabla-resumen en [PLAN.md §3.1](./PLAN.md).

---

## 9. Convenciones y estándares (lo que se *hace cumplir*)

> El detalle fino se consolida en F1 junto con el validador; esto es lo ya decidido:

- **Naming:** carpetas de workflow `workflow-<slug>` en kebab-case; slugs estables (son keys en
  el registro).
- **Estructura del repo:** la de [PLAN.md §2.3](./PLAN.md) — `core/` solo cambia con ADR.
- **Cómo se define un flujo/cliente nuevo:** plantilla en `core/templates/` + runbook
  correspondiente (se construyen en F5).
- **Config vs. secretos:** config parametrizable en yaml versionado; secretos solo en los
  motores; en git únicamente placeholders. Convención única de placeholder a definir en F1
  (hoy conviven `<<...>>` y `{{...}}` — sección 14).
- **Commits:** en español, concisos (práctica ya establecida del repo).
- **Prohibido (anti-patrones conocidos):** `pinData` con datos reales en JSONs de n8n · tokens
  o keys en cualquier archivo versionado · editar a mano el `jsonBody` del nodo Claude (usar
  script, ver CLAUDE.md del workflow de reels) · duplicar una fuente de verdad "por comodidad" ·
  activar un cron sin validación explícita de timezone (incidente real documentado en la master guía).

---

## 10. Plan de construcción (el *en qué orden*)

> **Dueño único: [PLAN.md §5](./PLAN.md)** — etapas F0–F6 con entregables y criterio de "hecho"
> por etapa. MVP = fin de F4 (el jefe ve outputs y el sistema avisa fallos). Lo diferido a
> propósito: [PLAN.md §6](./PLAN.md).

---

## 11. Mantenimiento y operación (el *cómo sobrevive*)

> Se llena en la etapa F6. Por ahora: opera Mani (técnico). Runbooks pendientes de escribir:
> arrancar/parar/redeployar n8n · rotar keys · recuperar de backup · modos de falla (Apify
> cambia formato, fuente bloqueada, Supabase pausado, TZ de cron mal configurada) ·
> agregar-workflow · agregar-cliente.

---

## 12. Riesgos y supuestos

> **Dueño único de la tabla de riesgos: [PLAN.md §7](./PLAN.md).** Supuestos aún no verificados:

- El free tier de Supabase no se pausa con la actividad semanal real (verificar en F2–F3).
- El Form Trigger de n8n alcanza como UX para el jefe (verificar con prototipo en F5).
- PikaPods/InstaPods ofrece Postgres y backup razonable en el plan barato (verificar antes de F2).
- El presupuesto tentativo ($10–30/mes) será aprobado por el jefe (conversación de F0).

---

## 13. Glosario

- **Workflow** — unidad funcional de creación de contenido (carpeta en `Workflows/` + manifest).
- **Motor** — donde se ejecuta un workflow (n8n, OpenClaw; mañana otros).
- **Corrida (run)** — una ejecución de una instancia de workflow, con trigger, params, estado y costo.
- **Instancia** — un workflow desplegado para un cliente concreto (workflow × cliente).
- **Output** — pieza producida (guion, borrador, nugget, research item), trazable a su corrida y fuente.
- **`content_item`** — schema común de "pieza encontrada" en las fuentes (etapa NORMALIZAR).
- **Adaptador de fuente** — pieza de la etapa COLECTAR que convierte una fuente en `content_item`s.
- **Perfil de output** — parametrización de la etapa GENERAR: voz del cliente + formato de la plataforma destino.
- **Dispatcher** — formulario/entrada que lanza corridas bajo demanda con filtros y las rutea (C9).
- **Registro central** — Supabase: historial de corridas y outputs de todo el sistema.
- **Destino nativo** — donde cada workflow deposita su trabajo para edición/uso (Sheets, Notion).
- **Kit** — el paquete de plantillas del workflow de Substack que configura el bot OpenClaw.
- **Etapas canónicas** — las 8 fases contra las que se describe todo workflow ([PLAN.md §2.4](./PLAN.md)).

---

## 14. Decisiones abiertas / pendientes

> **Dueño único: [PLAN.md §3.2](./PLAN.md)** (presupuesto definitivo · PikaPods vs InstaPods ·
> Looker vs Metabase · timezone de crons · taxonomía y personalización de outputs + catálogo
> exacto de filtros). Además, de este blueprint: confirmar los no-negociables (sección 3) y las
> métricas de éxito (sección 1) · convención única de placeholders (sección 9) · política de
> archivado de datos (sección 7).

---

> **Checklist de salud del blueprint** (revisalo cada tanto):
> ☐ ¿Las secciones 1-3 siguen siendo verdad? ☐ ¿Cada decisión estructural tiene su porqué registrado?
> ☐ ¿Sigue siendo barato agregar el flujo N+1? ☐ ¿El doc refleja lo que el sistema *realmente* hace hoy?
> ☐ ¿Un recién llegado podría operarlo solo con esto?
