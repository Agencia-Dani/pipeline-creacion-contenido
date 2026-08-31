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

**Decisión que lo gobierna:** [ADR-082](../adr/ADR-082-un-video-quemado-se-rescata-borrandole-la-memoria.md).
El porqué de *borrar la memoria y no reconstruir el video*, con las alternativas descartadas, vive
ahí; acá viven los pasos.

**Contexto:** [ADR-030 §Enmienda](../adr/ADR-030-descarte-duro-sin-transcript.md)
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

**Stack:** ESM `.mjs` plano corriendo en Node 26, **sin dependencias y sin transpilar**, igual que
sus hermanos `verificar-corrida.mjs` y `test-nodos.mjs`. Se invoca siempre así:

```bash
set -a && source .env && set +a && node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs [flags]
```

**Interfaz del script** (esto es lo que las tareas siguientes consumen, y no cambia):

| flag | qué hace |
|---|---|
| *(ninguno)* | dry-run: calcula y reporta, no escribe nada |
| `--desde <YYYY-MM-DD>` | acota por `processed_items.primera_vez` |
| `--plataforma <p>` | default `instagram` |
| `--apply` | escribe: guarda el JSON y borra |
| `--verificar <archivo.json>` | lee un rescate pasado y mide si volvieron |

---

### Tarea 1 — El decodificado de shortcode, probado antes que nada

**Archivo:** crear `Workflows/workflow-short-form-content/rescatar-huerfanos.mjs`.

**Produce** (lo usan las tareas 2 y 4):
`shortcodeAId(sc) -> string | null` · `idDeUrl(url) -> string | null` · `sb(path, esquema) -> Promise<any>`

> 🩸 **Lo que apareció construyendo, y era una falsa alarma con un hueco real adentro.** El primer
> regex solo leía URLs de Instagram, y el reporte avisó de **2 urls que no pudo decodificar**.
> Resultaron ser de TikTok, o sea inofensivas para *este* rescate (que corre con
> `--plataforma instagram`). Pero `outputs` y `app.descartes` **mezclan las dos plataformas**, así que
> un archivado de TikTok sin reconocer queda sin proteger el día que alguien corra el rescate sobre
> TikTok. Se cerró ahí mismo: la URL de TikTok trae su `external_id` literal, no hay nada que
> decodificar. El contador quedó en **0** y dejó de dar falsas alarmas.

- [ ] **Paso 1 — Escribir el auto-test que falla.** Al arrancar, con `--test`, el script compara
      `external_id` contra `url_referente` sobre **todos** los candidatos que tengan los dos campos,
      y aborta si no da 100%:

```js
const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IDX = new Map([...AL].map((c, i) => [c, i]));
// El external_id de Instagram ES el shortcode en base64 con este alfabeto. Verificado contra
// candidatos reales que traen los dos campos al lado; si algún día deja de valer, --test grita.
const shortcodeAId = (sc) => {
  let n = 0n;
  for (const c of sc) {
    const v = IDX.get(c);
    if (v === undefined) return null;
    n = n * 64n + BigInt(v);
  }
  return n > 0n ? n.toString() : null;
};
const idDeUrl = (url) => {
  const m = /\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(url || "");
  return m ? shortcodeAId(m[1]) : null;
};
```

- [ ] **Paso 2 — Correrlo y ver que falla** (todavía no hay `sb()`, tira `sb is not defined`).

Run: `node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs --test`

- [ ] **Paso 3 — Implementar `sb()` con paginado.** `fetch` contra PostgREST con `apikey` +
      `Authorization`, `Accept-Profile` opcional para el esquema `app`, y paginado de a 1000 hasta
      que una página venga corta. Copiar la forma de `verificar-corrida.mjs`, no inventar otra.

- [ ] **Paso 4 — Correr el auto-test y ver que pasa.**

Run: `set -a && source .env && set +a && node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs --test`
Esperado: `shortcode: N/N ✓` con N ≥ 200 y **cero fallas**. Si falla una sola, se para acá.

- [ ] **Paso 5 — Commit.** `git commit -m "El external_id de Instagram es el shortcode: probado contra prod, no asumido"`

---

### Tarea 2 — Calcular los huérfanos (todavía sin borrar nada)

**Archivo:** modificar `rescatar-huerfanos.mjs`.

**Consume:** `sb()`, `idDeUrl()` de la Tarea 1.
**Produce:** `huerfanos({desde, plataforma}) -> { filas, vivos: {candidatos, archivados, descartes} }`

- [ ] **Paso 1 — Leer las cuatro tablas.** `processed_items` (`external_id, platform, run_id,
      primera_vez`, esquema `public`), `app.candidatos` (`external_id`), `outputs` (`metadata`) y
      `app.descartes` (`url_referente`).

- [ ] **Paso 2 — Armar el conjunto de "vivos"** con las tres reglas de §2: `external_id` directo
      para candidatos, `idDeUrl()` para archivados y descartes.

- [ ] **Paso 3 — Restar y filtrar** por `--desde` (contra `primera_vez`) y `--plataforma`.

- [ ] **Paso 4 — Reportar.** Total de filas en la ventana, cuántas caen por cada una de las tres
      razones, cuántos huérfanos quedan, y el desglose por corrida con su
      `metricas.transcripciones_vacias` al lado.

- [ ] **Paso 5 — Verificar contra los números de §2.**

Run: `set -a && source .env && set +a && node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs --desde 2026-08-24`
Esperado: **574 filas de Instagram · 237 ya resueltos · 337 huérfanos**, y
**0 urls que el decodificado no pudo leer**.

⚠️ Los 237 son la **unión** de las tres razones, no su suma: por separado son 153 candidatos vivos,
61 archivados y 50 descartes (264), y 27 de esos caen en dos categorías a la vez. El script reporta
la unión porque es lo único que decide si una fila se borra o no.

Si alguno no da, **no se sigue**: o cambió prod (y hay que re-medir el plan) o el cálculo está mal.

- [ ] **Paso 6 — Confirmar que no escribió nada.** El conteo de `processed_items` sigue en 1.802.

- [ ] **Paso 7 — Commit.** `git commit -m "Los huerfanos se calculan al correr, no se leen de una lista vieja"`

---

### Tarea 3 — Guardar y borrar, en ese orden

**Archivo:** modificar `rescatar-huerfanos.mjs`.

**Consume:** `huerfanos()` de la Tarea 2.
**Produce:** el archivo `rescate-<YYYYMMDD-HHMM>.json` con la forma
`{ generado_en, desde, plataforma, instance_id, ids: string[] }`.

- [ ] **Paso 1 — Escribir el JSON ANTES del `DELETE`.** Si el archivo no se puede escribir, el
      script **aborta y no borra**. No es prudencia genérica: el borrado destruye la única evidencia
      de qué se rescató, y `runs.metricas` guarda contadores, no ids.

- [ ] **Paso 2 — Implementar el borrado.** `DELETE` por **lista explícita de ids**
      (`external_id=in.(...)`), en lotes de 200 para no reventar la URL, y siempre con
      `instance_id=eq.<...>` y `platform=eq.<...>`. **Nunca** un filtro de fecha suelto contra la
      tabla: si el cálculo tuviera un bug, un filtro por fecha se llevaría también los vivos.

- [ ] **Paso 3 — Contar lo borrado de verdad.** Usar `Prefer: return=representation` y contar las
      filas que devuelve, no las que se pidieron. Son dos números distintos y el que importa es el
      segundo.

- [ ] **Paso 4 — Dejar `--apply` como única puerta de escritura.** Sin el flag, el script imprime
      el plan de borrado y sale con código 0.

- [ ] **Paso 5 — Probar el dry-run.**

Run: `... --desde 2026-08-24` (sin `--apply`)
Esperado: dice que borraría 337, **no crea el JSON**, y `processed_items` sigue en 1.802.

- [ ] **Paso 6 — Commit.** `git commit -m "La lista se guarda antes de borrar: el borrado destruye su propia evidencia"`

---

### Tarea 4 — Soltar los 337

- [ ] **Paso 1 — Correr con `--apply`.**

```bash
set -a && source .env && set +a && node Workflows/workflow-short-form-content/rescatar-huerfanos.mjs --desde 2026-08-24 --apply
```

- [ ] **Paso 2 — Verificar contra prod que bajó exactamente lo reportado.** `processed_items`
      tiene que quedar en **1.802 − (lo borrado)**, y los 153 candidatos vivos + 61 archivados +
      50 descartes de la ventana tienen que **seguir teniendo su fila**. Ese segundo chequeo es el
      que prueba que el decodificado hizo su trabajo.

- [ ] **Paso 3 — Commitear el JSON del rescate.** Va al repo, no al `.gitignore`: es la evidencia.

- [ ] **Paso 4 — Disparar una corrida del motor** desde *Operar* (o `POST "$MOTOR_WEBHOOK_URL"`).
      ⚠️ **Paga**: Apify + Supadata + Haiku. Confirmar con Mani antes.

**Lo que hay que saber antes de apretar:**
- El techo es *Videos a transcribir por corrida* = **350**, así que los rescatados **compiten con el
  material nuevo**. Una o dos corridas van a traer menos videos frescos de lo normal.
- De los 337, **~150 los rechazó el gate de verdad** y los va a volver a rechazar. El número es una
  estimación, no una cuenta: sale de aplicar la proporción global (593 quemados sobre 1.056
  huérfanos) a esta ventana, porque separarlos uno por uno es justo lo que la base no puede hacer
  (§1). Transcripción pagada dos veces, y es el precio conocido.

---

### Tarea 5 — Verificar, con el dato y no con la sensación

**Archivo:** modificar `rescatar-huerfanos.mjs`.

**Consume:** el JSON de la Tarea 3, y `candidatos.run_id` (ADR-081).

- [ ] **Paso 1 — Implementar `--verificar <archivo.json>`.** Lee los ids, busca la corrida del
      motor posterior a `generado_en`, y cruza contra `app.candidatos` de esa corrida.

- [ ] **Paso 2 — Reportar tres números:** cuántos de los N rescatados volvieron a entrar a
      `processed_items`, cuántos llegaron al feed como candidatos, y cuántos se quemaron otra vez
      (los que volvieron a `processed_items` pero no a `candidatos`).

- [ ] **Paso 3 — Correrlo después de la corrida** y anotar el resultado en el handoff.

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
