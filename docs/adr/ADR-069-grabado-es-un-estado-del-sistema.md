# ADR-069 — Grabado es un estado del sistema, no un dato que vive en la cabeza del equipo

- **Estado:** aceptada — 2026-08-18. **Extiende [ADR-031](./ADR-031-transcriptor-a-pedido.md)** (la
  cola de enlaces pegados gana una marca) y **[ADR-062](./ADR-062-el-transcriptor-deja-de-ser-un-callejon-sin-salida.md)**
  (el transcriptor deja de ser un callejón sin salida; esto le cierra el último tramo). Toca `core/`:
  la migración `028`. Sale de contrastar contra prod un reporte de Majo.

> **Se escribe ANTES de construir.** El código de esta ADR todavía no existe.

## Contexto

El 2026-08-18 Majo reportó dos fallas de la herramienta sobre dos entregables. Las dos se
contrastaron contra el sistema vivo antes de tocar una línea, y **la más ruidosa era falsa**:

- *"la herramienta saca repetidos"* → **no**. `processed_items` tiene **977 filas y 977
  `external_id` distintos**: cero duplicados entre corridas. Los 12 eventos `transcribir.pegar` de
  la base dan **`ya_estaban: 0` en los 12**. Los 50 links del doc de Mile entraron por 5 pegotes el
  2026-08-07 y los 50 tienen `primera_vez` ese mismo día: eran nuevos para el sistema.
- *"hay links que no sirven"* → los videos se cayeron solos. De los 64 links que la herramienta
  entregó en los dos docs, **1 está borrado**; los otros 6 caídos están en la mitad de un doc que
  **alguien armó a mano**, con guiones que no existen en ninguna de las tres tablas que guardan
  `script` (medido: similitud 0.03–0.16 contra un corpus de 509 guiones guardados, contra 0.99–1.00
  de los que sí produjo la herramienta).

**Pero adentro del reporte falso había un hecho verdadero:** el equipo grabó videos que después
volvieron a aparecer en una lista. Dos de las 50 filas del doc de Mile están marcadas a mano *"Este
ya se grabó"*. Eso pasó de verdad, y **el sistema no tenía cómo saberlo**:

- `outputs.estado` admite `'publicado'` desde la `001` y tiene **0 filas** con ese valor.
- `app.candidatos.estado` llega hasta `aprobado` / `descartado`: el juicio del equipo.
- **El ciclo se corta en la calificación.** Un guion aprobado sale del sistema hacia un Google Doc,
  se graba, y nada vuelve.

Y `revisarPegote` —el chequeo previo que ya existe— **contestó bien**: avisa tres cosas (*ya está en
la cola*, *ya lo pediste y falló*, *ya lo vio el motor*) y ninguna aplicaba, porque los 50 eran
nuevos. No le faltaba lógica: le faltaba un hecho que nadie le había contado nunca.

## Decisión

**Grabar deja una marca en el sistema, y el pegote la mira antes de cobrar.**

### 1. `grabado_en` es una columna nueva, no un valor más de `estado`

Meterlo en `transcripciones.estado` era lo barato y es incorrecto: ahí `estado` es el ciclo de vida
del **trabajo de transcribir** (`pendiente → listo | sin_transcript | fallo | abandonado`), y
grabar es **ortogonal** a que la transcripción haya salido bien. Un `listo` puede estar grabado o no;
pisarlo con `grabado` perdería el resultado por el que ya se pagó, y `reclamarPendientes`,
`reencolar` y `abandonar` filtran por ese campo.

Es un **timestamp y no un booleano** porque *"¿cuándo?"* es la pregunta que sigue siempre a *"¿ya se
grabó?"* y cuesta lo mismo guardarla. `null` significa *no grabado*, que es el estado normal de casi
toda fila — el mismo criterio con el que `titulo` quedó nullable en la `027`.

### 2. Va en `app.transcripciones` y **no** en `app.candidatos`, y eso no es un recorte

Era tentador ponerla en las dos tablas por simetría. **Medir mostró que la segunda no hace falta, y
que ponerla igual dejaría una columna sin escritor** — exactamente lo que la `023` (ADR-059) acaba
de podar del schema.

El argumento es de dedup, no de comodidad: **el motor no puede proponer dos veces el mismo video.**
`processed_items` tiene un `unique (instance_id, platform, external_id)` y se escribe con todo lo que
el motor *consideró*, antes del gate. Medido el 2026-08-18: **los 298 videos que alguna vez se
entregaron tienen su marca ahí, 298/298, en las 7 fechas de entrega**. Cero huecos. O sea que en el
carril del motor la repetición **ya es imposible por construcción**.

**El pegote es el único carril donde un humano puede re-introducir un video**, porque escribe la
lista a mano desde afuera. Ahí es donde la marca sirve, y ahí es la única donde va.

Queda un caso sin cubrir y conviene nombrarlo: un video que trajo el motor, se grabó, y que alguien
pega después en Transcribir. Hoy ese caso **ya avisa** (`vistosPorElMotor`, "ya lo vio el motor"),
solo que con un mensaje más flojo. Cubrirlo con dureza pide que `outputs` tenga una clave por video,
que hoy no tiene (§3), y eso es otra decisión.

### 3. NO se reusa `outputs.estado = 'publicado'`, aunque existe y está vacío

Era la opción de rung 1 —el valor ya está en el `check` de la `001` y no lo usa nadie— y **se cae por
un dato medido**: `outputs.external_id` significa **dos cosas distintas según el carril**.

| tipo | forma de `external_id` | quién lo escribe | filas |
|---|---|---|---|
| `guion_reel` | uuid del candidato | el archivado | 93 |
| `guion_reel` | record id de Airtable | el archivado (era Airtable) | 79 |
| `transcripcion_a_pedido` | id numérico del video | `registrarEnHistorico` | 128 |

Sin una clave por video no se puede preguntar *"¿este video ya se grabó?"*, que es toda la pregunta.
Y hay un segundo motivo, más caro: `leerAprobados` filtra `estado = 'aprobado'`, así que mover una
fila a `'publicado'` **la borraría del histórico que lee el jefe**.

### 4. El aviso nuevo gana precedencia sobre los otros tres

`repartirEnlaces` reparte por precedencia, y `grabadas` va **primero**. Hoy un video grabado que está
en la cola cae en `enCola` (*"el guion está o viene en camino"*) y uno que vio el motor cae en
`vistosPorElMotor` (*"eso no garantiza que exista el guion"*). Las dos frases son verdad y las dos
son **el mensaje equivocado**: la pregunta que el operador tiene enfrente es *"¿lo grabo otra vez?"*,
y la respuesta es no. Es la misma lección que ADR-062 §4 dejó con `abandonado` y que el `fallados` de
la `Revision` dejó el 07/08: **contar dos cosas distintas en el mismo montón manda a la acción
equivocada.**

### 5. Se marca desde la fila, con un clic, y **se deshace**

A diferencia de `Abandonar` —que pide confirmación porque no se deshace— marcar por error acá no
destruye nada: desmarcar devuelve el estado exacto. Por eso es un toggle sin confirmación, y por eso
el servidor acepta las dos direcciones en la misma acción.

La superficie es la **fila de la tanda**, que es literalmente el documento que el equipo tiene
enfrente: ADR-064 hizo que una tanda sea el pegote de una persona, así que marcar ahí es marcar sobre
la misma lista que se entregó.

## Alternativas descartadas

- **`outputs.estado = 'publicado'`** — §3. Cero columnas nuevas y no funciona: `external_id` está
  sobrecargado y el cambio borraría filas del histórico.
- **Un valor más en `transcripciones.estado`** — §1. Ortogonalidad: pisaría el resultado de la
  transcripción y rompería los tres filtros que leen ese campo.
- **Una tabla `app.grabados (instance_id, plataforma, external_id, grabado_en, grabado_por)`** — es
  la forma "bien normalizada" y es **de más**. Una columna nullable resuelve lo mismo sin tabla, sin
  policy nueva, sin grants nuevos y sin un join en el camino caliente. El día que grabar tenga datos
  propios (quién grabó, cuándo se publica, qué versión salió) eso **sí** es una entidad y va con su
  ADR. Hoy sería inventarle campos a un evento que nadie pidió.
- **Marcarlo solo al descargar el CSV del histórico** — descargar no es grabar. El equipo descarga
  para leer, y una marca automática ahí volvería la señal ruido en la primera semana.
- **Marcarlo desde `/curar/historicos`** — es donde vive el guion final, pero esa pantalla lee
  `outputs`, que no tiene clave por video (§3). Marcar ahí pide primero arreglar `external_id`.

## Consecuencias

- **Migración `028`**: una columna y su `comment`. Sin backfill, sin índice nuevo (el filtro entra
  siempre junto al `in (external_id)`, que ya usa `transcripciones_pendientes_idx` y el unique).
- **No repara lo que ya pasó.** Las listas que el equipo grabó antes del 2026-08-07 no están en el
  sistema: los dos videos que Majo marcó *"ya se grabó"* entraron por primera vez ese día. Esto
  **empieza a proteger desde la primera marca**, no antes. Decírselo al equipo es parte de entregarlo.
- **La marca vale lo que valga el hábito.** Si nadie marca, el aviso no aparece nunca y la columna es
  peso muerto. El canario: `select count(*) from app.transcripciones where grabado_en is not null`
  en un mes. Si da 0, la decisión estaba equivocada y lo que falta es otra cosa.
- Lo que **no** cambia: el dedup del motor, el `ignoreDuplicates` del encolado, el costo por link, y
  las tres advertencias que ya existían.
