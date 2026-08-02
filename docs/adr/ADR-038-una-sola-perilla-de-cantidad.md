# ADR-038 — Una sola perilla de cantidad: el N del proyecto, y Operar dice lo medido en vez de «hasta»

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). **Enmienda
  [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md) y
  [ADR-024](./ADR-024-enmienda-adr016-n-por-proyecto.md)** en lo que el equipo ve; no toca el motor.

- **Contexto:** en la primera versión live del cockpit, la pregunta *"¿cuántos videos trae este
  proyecto?"* no se podía responder mirando un solo lugar. Competían **tres** perillas:

  | knob | dónde vivía | qué hacía |
  |---|---|---|
  | `Resultados por cuenta de referente` | Ajustes | cuántos videos baja Apify **por cuenta** |
  | `Candidatos por corrida` | Ajustes | el default global cuando el proyecto no tenía N |
  | `N` del proyecto | Voces y proyectos | «hasta XX videos», con vacío = usá el global |

  Para el equipo de redes eso son tres números que mueven lo mismo sin decir cuál manda. Y la
  pantalla empeoraba la confusión: Operar decía **«hasta 15 candidatos»**, que le pide al lector que
  adivine.

  Al medirlo apareció que el problema no era solo de UI. **`N` es un techo duro y la entrega es
  best-effort sobre el supply real** — está escrito en `Armar candidato`: *"N es un TECHO exacto
  (jamás se pasa); la entrega es best-effort sobre el supply real"*. Las tres corridas registradas
  con `metricas.por_proyecto` dicen `razon_faltante: supply` en **todos** los proyectos, incluida la
  sana del 31/07 que entregó 49/37/30/23 contra un N de 100. Con `Resultados por cuenta = 20`, un
  proyecto de 3 referentes mira 60 videos crudos por corrida y después del gate le quedan ~10,
  contra un N de 15. Y el dedup ([ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md) /
  [ADR-029](./ADR-029-dedup-blindado-fail-closed-y-feed.md)) hace que el supply **se achique cada
  semana**: drenado el backlog, queda lo que esas cuentas publicaron nuevo.

  O sea: cambiar la etiqueta de «hasta 15» a «15» habría convertido un dato honesto en una promesa
  que la máquina no puede cumplir. Eso es lo contrario de hacerlo confiable.

- **Decisión:** tres partes.
  1. **El `N` del proyecto es la única perilla de cantidad que ve el equipo, y es obligatoria.**
     Se acabó el "vacío = usá el global": `validarProyecto` exige entero ≥ 1
     (`domain/proyectos.ts`). Un default silencioso es justo lo que impedía responder la pregunta
     mirando el proyecto.
  2. **Los tres knobs globales pasan a `visibilidad = 'dev'`** (`Candidatos por corrida`,
     `Días de recencia`, `Resultados por cuenta de referente`). `ajustesVisibles()` ya los esconde
     del rol `operador`; el dev los sigue viendo. **La recencia queda fija en 100 días**, que es el
     "ventana amplia hardcodeada" que se buscaba: con el dedup, una ventana grande no trae repetidos
     y solo puede aumentar el supply — el `resultsLimit` de Apify no cambia, así que **no cuesta más
     plata**.
  3. **Operar deja de decir «hasta» y muestra tres datos medidos por proyecto:**
     `pide N · X cuentas · la última corrida entregó Y`, con la `razon_faltante` que el motor ya
     diagnostica y la palanca concreta (más cuentas si es `supply`, criterios más flojos si es
     `gate`, las dos si es `mixta`). Se fusionaron las dos cards que antes obligaban a cruzar de
     memoria el pedido con el resultado.

  > ⚠️ **Los knobs se esconden, NO se borran, y esto es lo que no hay que "limpiar" después.**
  > `Armar plan de corrida` resuelve `pick('dias_recencia', …)` con precedencia
  > `ajustes > Config`, y el `Config` del motor tiene `dias_recencia = 7`. Borrar la fila de
  > `app.ajustes` sin re-importar el workflow **tiraría la recencia de 100 a 7 en silencio**: la
  > corrida saldría verde trayendo un tercio de la fuente. Es exactamente la familia de bug que
  > mordió cuatro veces en D7. La fachada sigue sirviendo los 18 ajustes — `visibilidad` es un
  > campo de la UI, no del contrato.

- **Consecuencias:**
  - **A favor:** el equipo tiene un número por proyecto y un solo lugar donde tocarlo. Y Operar
    dejó de pedirle que adivine: los tres números que ve fueron todos medidos.
  - **A favor:** cuando un proyecto queda corto, la pantalla nombra la palanca en vez de dejar el
    diagnóstico en los logs de n8n.
  - **En contra, y hay que decirlo en voz alta:** el pronóstico honesto va a mostrar que **varios
    proyectos no llegan a su número**. Eso no es un bug de la pantalla: es el estado real del
    sistema, que antes quedaba escondido detrás de la palabra «hasta». Las dos palancas reales son
    **sumar referentes** y **subir `Resultados por cuenta` a 40** (quedó en 20 tras la corrida
    barata del 01/08).
  - **En contra:** `N` obligatorio puede rebotar el alta de un proyecto. Mitigado: el form nace con
    `15` puesto.
  - El motor **no cambia**: sigue leyendo `N` de la fachada y resolviendo el default global para
    filas viejas con `n` en null. La app es estricta al escribir y tolerante al leer.

- **Alternativas descartadas:**
  - **Hacer que `N` sea vinculante de verdad**, escalando lo que el motor le pide a Apify por
    proyecto (`ceil(N / (referentes × tasa_histórica))`) en vez de un global de 20 para todos. Es la
    solución de fondo y probablemente la correcta a futuro, pero toca `Armar plan de corrida` y los
    dos nodos de Apify ⇒ **re-import + ADR propio**, sube el costo de Apify, y aun así no puede
    inventar videos que la cuenta no publicó. Queda para su propio ADR.
  - **Un pronóstico calculado** (mediana de las últimas K corridas, o supply × tasa de gate). Se
    descartó al mirar los datos: hay **3 corridas** con `por_proyecto` y son incomparables entre sí
    (49 · 4 · 1 para el mismo proyecto — una drenó el backlog de 100 días, dos corrieron con los
    knobs recortados). Cualquier estadística sobre eso es precisión falsa, que es peor que no dar el
    número.
  - **Borrar los knobs del catálogo y hardcodear en el `Config` del motor.** Más limpio
    conceptualmente, pero exige re-import y abre el modo de fallo silencioso descrito arriba.

---

## Enmienda — 2026-08-01, misma tarde ([ADR-042](./ADR-042-el-techo-de-gasto-se-toca-desde-el-cockpit.md))

Dos cosas que esta decisión dejó a medias y se cerraron al revisar la pantalla ya deployada:

1. **El flip a `visibilidad = 'dev'` se había aplicado a mano en el SQL Editor y no quedó en ninguna
   migración.** Como el DEFAULT de la columna es `'dev'`, una base recreada desde `core/schema/` salía
   con los 18 knobs en dev y **el equipo no veía ni una perilla**. La migración
   [014](../../core/schema/014_criterios_voz_y_perillas.sql) lo registra.

2. **«Los knobs se esconden, NO se borran» era una regla demasiado general.** El aviso nació de un
   caso real —borrar `Días de recencia` tiraría la recencia de 200 a 7, porque el `Config` del motor
   tiene 7— pero se escribió como si valiera para los tres. No vale: hay que mirar caso por caso qué
   valor tiene el `Config`, porque es ahí donde cae la clave borrada.

   `Candidatos por corrida` tenía 100 en `ajustes` y 100 en el `Config`: caía parada. Encima estaba
   inerte (ningún proyecto con `N` vacío) y su descripción describía a otro knob. **Se borró.**
   `Días de recencia` y `Resultados por cuenta de referente` siguen vivos y dev-only, y el aviso de
   arriba les sigue valiendo entero.
