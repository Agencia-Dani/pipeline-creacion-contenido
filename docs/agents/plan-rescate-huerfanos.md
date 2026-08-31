# Plan — Rescatar los videos que la ráfaga quemó

> **Para agentes:** este plan se ejecuta tarea por tarea con
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`. Los pasos usan
> checkbox (`- [ ]`) para llevar la cuenta.

**Objetivo:** que los videos que el motor bajó, metió en la memoria del dedup y **nunca entregó**
por culpa de la ráfaga contra Supadata vuelvan a tener una oportunidad de llegar al feed, sin
código nuevo en el motor, sin migración y sin volver a pagarle a Apify.

**Arquitectura:** ninguna. Es una **operación sobre datos**, no una feature: un script que borra
filas de `processed_items` para que la corrida siguiente vuelva a ver esos videos como nuevos y los
pase por el camino de siempre (asignar proyecto y voz → heat → transcribir → gate → feed).

**Decisión que lo gobierna:** [ADR-030 §Enmienda](../adr/ADR-030-descarte-duro-sin-transcript.md)
(la ráfaga y su arreglo) y [ADR-029](../adr/ADR-029-dedup-blindado-fail-closed-y-feed.md) (por
qué la memoria se escribe **antes** de transcribir, que es la causa de que el video quemado no se
reintente nunca). Contexto de la medición: [ADR-081](../adr/ADR-081-el-candidato-sabe-de-que-corrida-salio.md),
que es lo que hace posible verificar el rescate.

---

## §1 · El problema, medido

`POST processed_items` corre **antes** de `Transcribir` (ADR-029 §2). Un video que se comió un `429`
ya está en la memoria del dedup: vuelve sin transcript, el gate lo descarta duro como `sin_guion`
(ADR-030) y **ninguna corrida futura lo vuelve a mirar**. No es que la corrida perdiera media
cosecha: la quemó.

Medido contra prod el 2026-08-31 (timestamps en UTC, como los guarda la base):

| | |
|---|---|
| Corridas del motor con métricas | 29 |
| Videos distintos mandados a Supadata | 1.755 |
| **Transcripciones vacías acumuladas** | **593 (34%)** |

Las tres corridas cuya cosecha trabajó Majo son las que peor la pasaron:

| corrida | transcribió | quemó | % |
|---|---|---|---|
| 2026-08-24 13:00 (`a80d8d3`) | 219 | 88 | 40% |
| 2026-08-26 03:29 (`364905d`) | 250 | 159 | **64%** |
| 2026-08-26 04:25 (`0d45a26`) | 250 | 144 | **58%** |

El arreglo del 30/08 ya se nota: la corrida de `2026-08-31 00:56` quemó **18 de 164 (11%)**.

### 🩸 Lo que la base NO sabe, y hay que decirlo antes de prometer nada

**Nadie registra quién dispara una corrida.** Las 29 figuran como `on_demand` sin autor, y en
`app.eventos` hay `operar.archivar` y `sugeridos.buscar` pero **no existe ningún evento de "correr
el motor"**. O sea que *"las corridas que hizo Majo"* no es una consulta que se pueda escribir. Lo
que sí se sabe es **cuándo trabajó** (20, 21, 26 y 31 de agosto, 176 eventos), y de ahí sale la
ventana de este plan.

**Un video quemado y un video que el gate rechazó de verdad se ven idénticos.** Los dos son una
fila de `processed_items` que no llegó a candidato. De los **1.056 huérfanos** que hay hoy, ~593 son
quemados y ~460 son rechazos legítimos, y **no hay forma de separarlos desde la base**. Este plan
los rescata a los dos y deja que el gate vuelva a decidir. Ese es el precio, y está aceptado.

---

## §2 · Qué es un huérfano

Una fila de `processed_items` que **no** es ninguna de estas tres cosas:

1. un **candidato vivo** (`app.candidatos.external_id`, match directo)
2. un **archivado** (`outputs.metadata->>'url_referente'`)
3. un **descarte auditable** (`app.descartes.url_referente`)

Al 2026-08-31: **1.056 huérfanos** de 1.802 filas. 1.029 son de Instagram.

### 🔑 El decodificado de shortcode es la pieza que sostiene el punto 2 y el 3

`processed_items` guarda `platform + external_id + primera_vez` y nada más: la columna `url` se la
llevó la migración [`023`](../../core/schema/023_poda_write_only.sql). Pero `outputs` y
`app.descartes` guardan **la URL**, no el id. Para cruzarlos hay que convertir uno en el otro.

Se puede, y es exacto: **el `external_id` de Instagram es el shortcode de la URL en base64** con el
alfabeto `A-Za-z0-9-_`. Verificado contra **200 candidatos reales** que tienen los dos campos al
lado (`external_id` y `url_referente`): reconstruyó **200 de 200**, cero fallas.

**Sin ese cruce el script borraría de más.** La ventana de este rescate tiene **574 filas de
Instagram**: 153 son candidatos vivos, **61 son archivados y 50 son descartes**, y 337 son los
huérfanos. O sea que el decodificado es lo único que protege a **111 videos ya resueltos** de que se
les borre la memoria del dedup y la próxima corrida se los vuelva a poner a Majo en el feed para que
califique lo que ya calificó. No es una optimización, es lo que evita ese daño.

**TikTok queda afuera**, y no por olvido: son 27 filas (1,5%) y su `external_id` no reconstruye una
URL sin conocer la cuenta, que `processed_items` tampoco guarda.

---

## §3 · Por qué borrar la memoria y no reconstruir los videos

Se consideraron tres caminos. Gana el primero por costo, no por elegancia.

| | Código nuevo | Plata extra | Llega al feed | Riesgo |
|---|---|---|---|---|
| **A. Borrar la memoria del dedup** | cero | cero de Apify | sí, por el camino normal | depende de que el video siga en el top 50 de su cuenta |
| B. Modo rescate en el motor (correr sobre una lista de URLs) | rama de colección nueva | 1 Apify por video | sí | el más caro en las dos monedas |
| C. Pegar las URLs en *Transcribir* | cero | 1 Supadata por video | **no** | va a `app.transcripciones`, sin proyecto, sin voz y sin gate |

**Por qué A alcanza, y es lo que cambió hace poco:** los knobs de hoy son *Días de recencia* = **150**
y *Resultados por cuenta de referente* = **50**. O sea que la antigüedad del video **ya no es el
límite**; el único límite es que siga entre los últimos 50 de su cuenta. Con 40 referentes activos
eso es holgado para videos de hace una semana. El scraper ya baja esos 50 en **cada** corrida y el
dedup los tira, así que borrarles la fila no le agrega ni una llamada a Apify: lo único que se paga
de más es la transcripción, que es exactamente lo que se quiere pagar.

**Por qué C no sirve aunque cueste cero:** la [`010`](../../core/schema/010_transcripciones.sql) lo
dice a propósito — un enlace pegado *"no pasó por el gate ni tiene heat-score, así que NO es un
Candidato: es una lista suelta"*. Traería los guiones al lugar equivocado.

**Qué haría falta para que B se justifique:** que la verificación de §5 muestre que volvieron pocos.
Ahí B deja de ser una corazonada y pasa a tener un número atrás.

---

## §4 · Restricciones

Aplican a todas las tareas:

- **No se toca `core/`.** Ni contratos, ni `core/schema/`, ni `core/scripts/` (CLAUDE.md
  §Convenciones). Este plan no pide migración: `processed_items` no cambia de forma, pierde filas.
- **No se toca el motor.** Ni `workflow.json`, ni `n8n:push`. Si una tarea parece necesitarlo, se
  para: eso ya es el camino B y merece su propia discusión.
- **No se toca la app.** El dashboard no participa de este rescate.
- El script es **ESM `.mjs` plano, sin dependencias**, como sus hermanos `verificar-corrida.mjs` y
  `test-nodos.mjs`. Node pelado.
- Credenciales por `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`). Ningún valor se imprime.

---

## §5 · Las tareas

### Tarea 1 — El script, en modo que solo mira

- [ ] Crear `Workflows/workflow-short-form-content/rescatar-huerfanos.mjs`.
- [ ] Implementar `shortcodeAId(sc)` y `idDeUrl(url)` (base64 con alfabeto
      `A-Za-z0-9-_`), y probarlo contra candidatos reales que tengan `external_id` y
      `url_referente`: **tiene que dar 100%**, no "casi todos".
- [ ] Leer de Supabase, paginando de a 1000: `processed_items`, `app.candidatos`, `outputs`,
      `app.descartes`.
- [ ] Calcular los huérfanos **al correr**, nunca desde una lista guardada de antes.
- [ ] Aceptar `--desde <YYYY-MM-DD>` (filtra por `primera_vez`) y `--plataforma` (default
      `instagram`).
- [ ] Salida: cuántos huérfanos, cuántos quedan afuera por cada una de las tres razones, y el
      desglose por corrida.

**Verificación:** correrlo con `--desde 2026-08-24` tiene que reportar **337 huérfanos de
Instagram**, y ningún id que esté en candidatos, outputs o descartes.

### Tarea 2 — Guardar la lista, y recién después borrar

- [ ] Antes de cualquier `DELETE`, escribir `rescate-<YYYYMMDD-HHMM>.json` al lado del script, con
      los ids, la ventana pedida y el momento.
- [ ] Implementar el borrado: `DELETE` por **lista explícita de ids**, en lotes, acotado por
      `instance_id`. Nunca un filtro de fecha suelto contra la tabla.
- [ ] **Dry-run por defecto**; escribe solo con `--apply`, igual que `n8n:push`.
- [ ] Con `--apply`, imprimir cuántas filas se borraron de verdad (del `Prefer: count`), no cuántas
      se pidieron.

**Por qué el archivo va primero y no es burocracia:** el borrado **destruye la única evidencia de
qué se rescató**. Las filas dejan de existir y `runs.metricas` solo tiene contadores, no ids. Sin la
lista guardada, la pregunta *"¿volvieron?"* deja de tener respuesta posible. Es el mismo cuidado que
los canarios de este repo: si el acto de medir borra el rastro, se guarda el rastro antes.

**Verificación:** correr sin `--apply` no cambia ningún conteo en `processed_items`.

### Tarea 3 — Soltar los 337 y correr el motor

- [ ] `node rescatar-huerfanos.mjs --desde 2026-08-24 --apply`.
- [ ] Confirmar contra prod que `processed_items` bajó **exactamente** en la cantidad reportada.
- [ ] Disparar una corrida del motor desde *Operar* (⚠️ paga: Apify + Supadata + Haiku).

**Lo que hay que saber antes de apretar:**
- El techo es *Videos a transcribir por corrida* = **350**, así que los rescatados **compiten con el
  material nuevo**. Una o dos corridas van a traer menos videos frescos de lo normal.
- De los 337, **~150 los rechazó el gate de verdad** y los va a volver a rechazar. El número es una
  estimación, no una cuenta: sale de aplicar la proporción global (593 quemados sobre 1.056
  huérfanos) a esta ventana, porque separarlos uno por uno es justo lo que la base no puede hacer
  (§1). Transcripción pagada dos veces, y es el precio conocido.

### Tarea 4 — Verificar, con el dato y no con la sensación

- [ ] Implementar `--verificar <archivo.json>`: lee los ids guardados y los cruza contra
      `app.candidatos` filtrando por la corrida (`run_id`), que existe desde ADR-081.
- [ ] Reportar: cuántos de los N rescatados volvieron a aparecer, cuántos llegaron al feed, y
      cuántos se quemaron otra vez.

**🐤 Esto es además el primer uso real de `candidatos.run_id`.** Su canario nació en cero a
propósito (0 filas rellenadas, sin backfill) justamente para que la primera fila con corrida la
escriba el motor y no una verificación. Esa corrida lo despierta.

**Criterio de éxito, escrito antes de medir para no acomodarlo después:**

| volvieron | lectura | qué se hace |
|---|---|---|
| **> 60%** | el supuesto del top 50 se sostiene | soltar el resto de los 1.029 por tandas |
| **20–60%** | vuelven algunos | soltar por tandas y medir cada una; no dar por buena la tasa |
| **< 20%** | el video ya se cayó del top 50 | **A no alcanza**: acá sí se discute B, con este número atrás |

---

## §6 · Lo que este plan NO hace

- **No arregla la ráfaga.** Eso ya está hecho y empujado al live (ADR-030 §Enmienda): concurrencia
  24 → 8, reintentos 1 → 4 con backoff y jitter, y corte definitivo en `transcript-unavailable`.
- **No registra quién dispara una corrida.** El hueco de §1 queda abierto y anotado. Es una decisión
  aparte: hoy `runs` no tiene autor y `app.eventos` no tiene un `operar.correr`.
- **No rescata TikTok** (27 filas, 1,5%): su id no reconstruye la URL.
- **No toca los huérfanos de julio** (394). Si la Tarea 4 da verde, entran por tandas.
