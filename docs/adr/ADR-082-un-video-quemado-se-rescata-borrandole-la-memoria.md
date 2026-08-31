# ADR-082 — Un video quemado se rescata borrándole la memoria, no reconstruyéndolo

- **Estado:** aceptada · **construida y aplicada** — 2026-08-31 (con Mani). Script
  [`rescatar-huerfanos.mjs`](../../Workflows/workflow-short-form-content/rescatar-huerfanos.mjs),
  **337 filas de `processed_items` borradas** en prod y verificadas por su efecto con cuatro
  señales. **No toca `core/`, no toca el motor, no toca la app, sin migración.** Plan de ejecución
  en [plan-rescate-huerfanos.md](../agents/plan-rescate-huerfanos.md).

## Contexto

Majo reportó que *"unas corridas fallaron y trajeron muy pocos videos"*. El
[cierre 123](../agents/handoff.md) ya había encontrado la causa —la ráfaga contra Supadata— y la
había arreglado ([ADR-030 §Enmienda](./ADR-030-descarte-duro-sin-transcript.md)). Lo que quedaba sin
contestar es qué pasa con **los videos que la ráfaga ya se comió**.

`POST processed_items` corre **antes** de `Transcribir`
([ADR-029 §2](./ADR-029-dedup-blindado-fail-closed-y-feed.md)). O sea que un video que se comió un
`429` **ya está en la memoria del dedup**: vuelve sin transcript, el gate lo mata como `sin_guion`
(ADR-030) y **ninguna corrida futura lo vuelve a mirar**. No es que la corrida perdiera media
cosecha: la quemaba.

### 📏 Lo que se midió contra prod (2026-08-31)

**593 transcripciones vacías sobre 1.755 videos mandados a Supadata en 29 corridas: el 34% de la
cosecha histórica.** Las tres corridas cuya cosecha trabajó Majo son las peores del registro:

| corrida | transcribió | quemó | % |
|---|---|---|---|
| 2026-08-24 13:00 (`a80d8d3`) | 219 | 88 | 40% |
| 2026-08-26 03:29 (`364905d`) | 250 | 159 | **64%** |
| 2026-08-26 04:25 (`0d45a26`) | 250 | 144 | **58%** |
| 2026-08-31 00:56 (`94ecb6d`) | 164 | 18 | **11%** ← ya con el arreglo |

### 🩸 Dos hallazgos que cambiaron la forma del problema

**1. *"Las corridas que hizo Majo"* no es una consulta que se pueda escribir.** `runs` **no guarda
quién dispara una corrida**: las 29 figuran `on_demand` sin autor, y `app.eventos` tiene
`operar.archivar` y `sugeridos.buscar` pero **ningún evento de correr el motor**. La ventana del
rescate tuvo que salir de **cuándo trabajó ella** (20, 21, 26 y 31 de agosto), no de la corrida.
*Queda como hueco abierto: hoy no hay forma de contestar quién pidió una corrida.*

**2. Un video quemado por el `429` y uno que el gate rechazó de verdad SE VEN IDÉNTICOS.** Los dos
son una fila de `processed_items` que no llegó a candidato. De los **1.056 huérfanos** que hay,
~593 son quemados y ~460 rechazos legítimos, y **la base no los puede separar**: `runs.metricas`
guarda el **contador** `transcripciones_vacias`, nunca los ids.

Esto es lo que descarta cualquier diseño que prometa *"rescatar solo los quemados"*. No hay forma.

## Decisión

**Se rescata borrándole la fila de `processed_items` al huérfano, para que la corrida siguiente lo
vuelva a ver como nuevo y lo pase por el camino de siempre.** El gate vuelve a decidir sobre los
dos grupos, porque separarlos es imposible.

Un **huérfano** es una fila de `processed_items` que no es ninguna de estas tres cosas: un candidato
vivo, un archivado en `outputs`, o un descarte en `app.descartes`.

Los tres argumentos, en orden de peso:

1. **Cuesta cero código y cero Apify.** El scraper ya baja esos 50 videos por cuenta en **cada**
   corrida y hoy el dedup los tira. Borrarles la fila no agrega ni una llamada: lo único que se
   paga de más es la transcripción, que es exactamente lo que se quiere pagar.
2. **Llegan al feed por el camino de siempre** — asignar proyecto y voz, heat, transcribir, gate —
   sin una segunda implementación de nada. El scoring, el gate y el corte siguen viviendo donde
   dice [ADR-028](./ADR-028-el-cockpit-es-la-fachada-del-plan-de-corrida.md).
3. **Es reversible en lo que importa.** La evidencia guarda los ids: re-insertarlos restaura la
   memoria del dedup.

### 🔑 La pieza que lo sostiene: el `external_id` de Instagram ES el shortcode

`processed_items` guarda `platform + external_id` y nada más — la columna `url` se la llevó la
[`023`](../../core/schema/023_poda_write_only.sql). Pero `outputs` y `app.descartes` guardan **la URL
y no el id**, así que sin convertir uno en el otro no hay forma de saber que un video ya está
archivado o ya se auditó.

**El id es el shortcode en base64** con el alfabeto `A-Za-z0-9-_`. No se asume: el script lo prueba
contra los candidatos de prod que tienen los dos campos al lado —**242/242**— y **aborta si no da
100%**.

**Sin ese cruce el borrado se llevaba la memoria de 111 videos ya resueltos** (61 archivados + 50
descartes) y la próxima corrida se los ponía al equipo en el feed para calificar lo que ya calificó.
El decodificado no es una optimización: es lo único que evita ese daño.

### 🔒 La evidencia se guarda ANTES de borrar

El borrado **destruye la única prueba de qué se rescató**: las filas dejan de existir y
`runs.metricas` guarda contadores, no ids. Por eso el script escribe el JSON **antes** del `DELETE`
y aborta si no puede, y el archivo va **al repo**. Sin él, `--verificar` no tiene contra qué medir y
la pregunta *"¿volvieron?"* deja de tener respuesta posible.

Y el `DELETE` va por **PRIMARY KEY** y acotado por instancia, **nunca por un filtro de fecha contra
la tabla**: si el cálculo de huérfanos tuviera un bug, un filtro por fecha se llevaría también los
vivos. Con la PK, lo peor que puede pasar es borrar de menos.

### ⏳ Por qué esto es viable ahora y no lo era la semana pasada

El supuesto que sostiene toda la decisión es *"el video sigue estando donde el scraper lo ve"*, y eso
depende de dos knobs que cambiaron esta semana: **Días de recencia = 150** y **Resultados por cuenta
= 50**. La antigüedad del video **ya no es el límite**; el único límite es que siga entre los últimos
50 de su cuenta.

**Es un supuesto, no un hecho medido**, y por eso el rescate arranca acotado (337 de 1.029) y trae su
propia verificación. El criterio se escribió **antes** de medir: >60% vueltos ⇒ soltar el resto por
tandas · 20–60% ⇒ tandas midiendo cada una · **<20% ⇒ esta decisión no alcanza** y hay que construir
el modo rescate en el motor.

## Alternativas descartadas

**Modo rescate en el motor (correr sobre una lista de URLs).** Es exacto y no depende del top 50,
pero pide una rama de colección nueva **y** re-comprarle a Apify la metadata video por video: el
huérfano viene desnudo —sin cuenta (o sea sin proyecto), sin vistas, sin miniatura— así que no hay
con qué armar el heat-score ni la tarjeta. El más caro en las dos monedas. **Queda como el plan B
explícito** si la verificación da <20%.

**Pegar las URLs en *Transcribir*.** Costaba cero y no servía: la
[`010`](../../core/schema/010_transcripciones.sql) dice a propósito que un enlace pegado *"no pasó
por el gate ni tiene heat-score, así que NO es un Candidato: es una lista suelta"*. Traería los
guiones al lugar equivocado.

**Rescatar solo los quemados.** Imposible, y es el hallazgo 2 del contexto. Cualquier diseño que lo
prometa está mintiendo sobre lo que la base sabe.

**Soltar los 1.029 huérfanos de una.** Se descartó por método, no por costo: el supuesto del top 50
no está medido, y soltarlo todo antes de medirlo gasta la transcripción de ~460 rechazos legítimos
**sin haber aprendido nada**. La tanda chica compra el dato.

**Borrar con un filtro de fecha en vez de por PK.** Es una línea menos y convierte cualquier bug del
cálculo en pérdida de memoria de videos vivos.

## Consecuencias

- **~150 de los 337 los va a volver a rechazar el gate**, y esa transcripción se paga dos veces. Es
  el precio conocido de no poder distinguirlos, aceptado a ojos abiertos.
- **Los rescatados compiten con el material nuevo** por el techo de *Videos a transcribir por
  corrida* (350). Una o dos corridas van a traer menos videos frescos de lo normal.
- **TikTok queda afuera** del rescate: son 27 filas (1,5%) y su `external_id` no reconstruye una URL
  sin la cuenta, que `processed_items` tampoco guarda. *El decodificado sí lo reconoce del lado de
  `outputs` y `app.descartes`, para que un archivado de TikTok no quede sin proteger el día que
  alguien corra el rescate sobre esa plataforma.*
- **Esto no arregla la causa**, que ya está arreglada (ADR-030 §Enmienda). Es la limpieza de lo que
  la causa dejó atrás.
- 🐤 **La corrida de verificación es el primer uso real de `candidatos.run_id`** (ADR-081), cuyo
  canario nació en cero a propósito para que la primera fila con corrida la escriba el motor.
