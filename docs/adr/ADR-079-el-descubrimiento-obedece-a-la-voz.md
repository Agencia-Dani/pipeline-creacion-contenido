# ADR-079 — El descubrimiento obedece a la voz, igual que el motor

- **Estado:** aceptada — 2026-08-29 (pedido del onboarding a Dani del 28/08: *"cuando alguien
  presiona buscar referentes no hay manera de delimitar para quién quiero que traiga"*, Majo).
  **Enmienda [ADR-020](./ADR-020-descubrimiento-de-referentes.md)** (el plan de descubrimiento gana
  el gate por voz que nunca tuvo). **No toca** [ADR-028](./ADR-028-fachada-run-plan.md): el ámbito
  del run-plan se queda en `completo` y el porqué está en la decisión #2.

- **Contexto:** el reclamo se leía como *"falta un selector"*, y la auditoría del 29/08 encontró que
  el selector **ya existe y el buscador lo obedece a medias**. `Voces.activo` gobierna el motor y no
  gobierna el descubrimiento:

  | | Motor | Descubrimiento |
  |---|---|---|
  | Pide el plan como | `?ambito=motor` | `?ambito=completo` |
  | ¿Respeta `proyecto.activo`? | Sí | Sí |
  | ¿Respeta `voz.activo`? | **Sí** | **No** |

  El camino del motor: con `?ambito=motor` la fachada filtra las voces por `activo`
  (`aRegistrosDeVoces`, `domain/proyectos.ts`) y `armarRunPlan` saltea los proyectos cuya voz no
  quedó en la lista. El descubrimiento pide `completo` —que por contrato **no filtra nada**— y su
  nodo `Armar plan de descubrimiento` chequea únicamente `proyecto.activo`. Las voces las lee solo
  para sacarles los `criterios_relevancia`, y nunca las usa como gate.

  📏 **Medido contra prod el 2026-08-29, y muerde hoy:** **3 voces, 1 sola activa** (Juan Pablo
  Vieira; Milena Morales y Rosario Gomez apagadas) y **6 proyectos, los 6 activos**. O sea que el
  motor atiende **2** proyectos y el buscador atiende **6**: cuatro de ellos pertenecen a voces
  apagadas. Apagar una voz no frena el descubrimiento de sus proyectos, y las propuestas que el
  equipo apruebe entran al banco a alimentar proyectos que no corren.

  🩸 **Lo que esto enseña sobre el reclamo:** el equipo no pedía un control nuevo — pedía que el que
  ya usa signifique lo mismo en las dos máquinas. *Un interruptor que gobierna un workflow y no el
  otro no se lee como un bug: se lee como que el interruptor no sirve.*

- **Decisión:**
  1. **`Armar plan de descubrimiento` gatea por voz activa**, con la misma semántica que
     `Armar plan de corrida`: un proyecto activo cuya voz está apagada **no** entra al plan; un
     proyecto **sin** voz sí entra (no está gateado), que es exactamente la regla del motor y no una
     nueva. El nodo ya recibe las voces con su `activo` en el plan `completo`; hoy las ignora.
  2. **El ámbito del run-plan sigue siendo `completo`, y no se cambia a `motor`.** Es el reflejo
     obvio y está mal: `?ambito=motor` **también** filtra los referentes por `activo`, y el
     descubrimiento necesita los **inactivos** para deduplicar (una cuenta apagada ya es conocida y
     no se re-propone). Cambiar el ámbito arreglaría el alcance rompiendo el dedup. La regla vive
     donde ya vivía —explícita, en el nodo— y esta ADR es lo que faltaba para que se sepa por qué.
  3. **El cockpit muestra el alcance antes de disparar** (`Qué va a correr`, en Operar), y como
     desde #1 el alcance es **el mismo para las dos máquinas**, es **una sola card** para los dos
     botones, no dos cards que repiten la misma lista. Los números propios del buscador
     (`cap_semillas`, `propuestas_max`, `afinidad_minima`) viven en Sugeridos, que es donde se
     decide sobre lo que produjo.

- **Alternativas descartadas:**
  - *Un flag nuevo por voz/proyecto, tipo `descubrir_activo`:* un segundo interruptor al lado de uno
    que el equipo ya no entendía. Multiplica los estados (activo para el motor / activo para el
    buscador / los dos / ninguno) para un caso de uso que nadie pidió, y necesita migración. Si
    alguna vez hace falta sembrar el banco de una voz pausada, sale como su propia decisión y con
    la evidencia de que se necesita.
  - *Cambiar el descubrimiento a `?ambito=motor`:* rompe el dedup (decisión #2).
  - *Un selector de voz/proyecto en el botón, mandado en el webhook:* es más de lo que hace el
    motor, obliga a versionar el contrato del disparo y deja dos fuentes de verdad sobre el alcance
    (lo tildado y lo activo). El motor ya resolvió esto: el alcance es la configuración, no el click.
  - *Dejarlo como está y solo mostrarlo:* la card diría *"busca para 6 proyectos, 4 de voces
    apagadas"*, o sea documentar la incoherencia en vez de arreglarla.

- **Consecuencias:**
  - (+) `Activo/Inactivo` pasa a significar lo mismo en las dos máquinas: **una regla, dos
    workflows**. Es lo que vuelve honesta a la card compartida de Operar.
  - (+) Deja de gastarse Apify y Haiku proponiendo cuentas para voces apagadas.
  - (+) Le da una hipótesis medible a la task del 25/08 (*«Buscar cuentas nuevas» cerró ok con CERO
    propuestas*): con `cap_semillas = 8` y dedup contra todo lo conocido, cero es un camino legítimo.
  - (−) 🩸 **Volvió invisible un estado que antes era sólo "a medias": la cuenta prendida que no
    hace nada.** Antes de esta ADR, una cuenta de voz apagada al menos seguía sembrando propuestas;
    desde acá no hace nada, y la pantalla de Referentes la seguía mostrando *Activa* con sus tasas
    al lado. 📏 **Medido el 2026-08-29, apenas aplicada: 13 de las 28 cuentas activas (46%)**
    quedaron así — incluidas `@jefferson_fisher` (49%) y `@howtoconvince` (62%), **las dos de mejor
    tasa del sistema**. Se tapó el mismo día: `noAlimentaNada` (`domain/referentes.ts`) + el aviso
    y el badge *sin trabajo* en `curar/referentes`, con el alcance pedido prestado a
    `proyectosDelPlan(armarVistaOperar(…))` para que no exista un tercer cruce. *Una decisión que
    apaga algo tiene que dejar visible lo que apagó, o el ahorro se cobra en confusión.*
  - (−) **Cambia comportamiento en producción:** el buscador pasa de atender 6 proyectos a atender
    2. Es el objetivo del cambio, pero si alguien dependía de sembrar el banco de una voz pausada,
    se entera acá. Se preguntó antes de aplicarlo.
  - (−) Un gate más que mantener en paridad con el motor. Mitigado porque es la **misma** regla
    escrita dos veces y no dos reglas: si divergen, divergen visiblemente en la card compartida.

- **Toca `core/`:** no. Sin migración y sin cambio de contrato — `run-plan` sigue igual, y el ámbito
  `completo` sigue significando lo mismo. Cambia `Workflows/workflow-descubrimiento-referentes/`
  (`Armar plan de descubrimiento`, que entra por `n8n:push` porque es `parameters.jsCode` y no
  topología) y las zonas `operar`, `curar/sugeridos` y `curar/referentes` del cockpit.
