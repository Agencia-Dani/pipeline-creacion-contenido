# ADR-029 — Dedup blindado: lectura fail-closed, memoria antes de entregar, `external_id` en el feed

> 🟠 **BANDERA 2026-07-31: la parte "memoria ANTES de entregar" está ARREGLADA EN EL REPO y espera
> el re-import.** Estuvo sin efecto desde que se escribió este ADR — ver la
> [enmienda del 2026-07-31](#enmienda-2026-07-31--la-memoria-antes-de-entregar-no-se-ordena-con-el-array-sino-con-la-topología),
> que cuenta por qué. *No borres esta bandera hasta que el motor esté re-importado y una corrida
> real muestre `registro_dedup: 'ok'`* — hasta entonces, en producción sigue entregándose antes de
> grabar.

- **Estado:** aceptada — 2026-07-24 (audit del run manual de Jero, con Mani). Endurece el dedup del
  motor sin tocar su semántica. No enmienda una decisión previa; cubre un modo de falla que
  [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md) (dedup del fan-out **intra-corrida**) no
  toca: la memoria **entre corridas**.
- **Contexto:** el motor dedupea contra `processed_items` (unique `(platform, external_id)`, schema
  002): `Leer procesados` trae los ya vistos, `Heat-score v1` filtra, `Preparar procesados → POST
  processed_items` graba la memoria. Tres agujeros observados en el run del 20→21/07 (15 videos
  duplicados llegaron al feed, descartados a mano por el equipo):
  1. **Lectura fail-open:** `Leer procesados` tenía `onError: continueRegularOutput`. Si el GET a
     Supabase fallaba, `seen` quedaba vacío y el motor **re-entregaba todo lo ya visto**. Un dedup sin
     memoria no degrada suave: produce exactamente la basura que el equipo tira.
  2. **La memoria se grababa al final, en rama paralela y fail-open:** `POST processed_items` corría
     después de entregar y podía fallar en silencio. La corrida del 20/07 no dejó ni una fila en
     `processed_items` → la del 21/07 no tenía cómo saber que ya los había traído.
  3. **El feed no guardaba `external_id`:** Airtable `Candidatos` no tenía el id de plataforma, así que
     ni había forma de dedupear contra el feed vivo, ni de borrar duplicados sin un `join` frágil por
     `url`. La limpieza manual del cierre 57 (borrar 65 `Candidatos` + sus `processed_items`) nació de
     acá; si borra la memoria pero deja el candidato, el video **resucita** en la próxima corrida.
- **Decisión:** tres capas, cada una tapa un agujero distinto.
  1. **La lectura de `processed_items` es fail-closed.** Se le quita el `onError`: si el GET falla, el
     run **aborta** (queda `en_curso` y lo barre `Barrer runs zombie`, C.3). Justificación contra el
     invariante "el registro es un sumidero, no una dependencia" (ingesta-registro §1): ese invariante
     protege las **escrituras** al registro (observar sin bloquear). La **lectura** de `processed_items`
     no es registro: es un **insumo** del pipeline, igual que `Leer Proyectos` o `Leer Referentes`, que
     ya son fail-closed. Sin memoria, la única salida honesta es no entregar.
  2. **La memoria se graba antes de entregar.** ~~Se invierte el orden de las ramas de `Heat-score v1` a
     `[Preparar procesados, Transcribir]`: con execution order v1 (depth-first), `POST processed_items`
     corre **primero**~~ — **el mecanismo era falso y nunca funcionó** (enmienda 2026-07-31: el orden
     de las ramas lo decide la posición en el canvas, no el array). La decisión se mantiene y hoy se
     implementa **en serie**: `Heat-score v1 → Preparar procesados → POST processed_items →
     Transcribir`, o sea antes de gastar Supadata/Haiku y antes del `POST Airtable Candidatos`.
     `processed_items` siempre significó "evaluado" (registra la salida de Heat-score, no la de Armar
     candidato); solo cambia el momento. `POST processed_items` **queda fail-open**: la escritura sí es
     sumidero. `Resumen del run` verifica el resultado y lo reporta en `metricas.registro_dedup`
     (`ok`/`fallo`) + `metricas.avisos`.
  3. **`external_id` en el feed, como última línea.** Campo nuevo en Airtable `Candidatos`; el motor lo
     escribe en cada candidato. `Heat-score v1` suma a `seen` los `external_id` del **feed vivo**
     (nodo nuevo `Leer feed vivo`, GET paginado a Airtable). Es la única defensa contra "la memoria de
     `processed_items` se borró pero el candidato sigue en el feed". Y de paso, borrar candidatos deja
     de exigir el `join` por `url`.
- **Asimetría fail-closed / fail-open (refinamiento sobre el plan):** `Leer procesados` es
  **fail-closed** (memoria primaria: sin ella hay duplicados garantizados). `Leer feed vivo` es
  **fail-open** (defensa secundaria): si Airtable no responde, se degrada a `processed_items`, que
  cubre el caso normal. Hacer `Leer feed vivo` fail-closed metería un **punto único de falla nuevo** —
  un hipo de lectura de Airtable abortaría corridas sanas cuya memoria primaria está intacta. No vale
  la pena: el escenario que el feed cubre (memoria borrada a mano) es raro y no urgente.
- **Alternativas descartadas:**
  - *`unique (platform, external_id)` en `app.candidatos` (schema 009):* la tabla sombra no es el feed
    que usa el equipo; un unique ahí no frena un duplicado en Airtable. **Diferido:** el día que el
    cockpit propio (ADR-025/026) sea el feed, el unique migra con él.
  - *Modo reparación automática de `processed_items`:* con el aviso de (2), la reparación es manual y
    rara; automatizarla es complejidad sin caso de uso.
  - *Feed vivo también fail-closed (como pedía el plan):* descartado por la asimetría de arriba.
- **Consecuencias:**
  - (+) Duplicados entre corridas: imposibles en operación normal (memoria grabada antes de entregar +
    lectura que aborta si no está). El feed agrega defensa contra memoria borrada a mano.
  - (+) Borrar candidatos ya no necesita `join` por `url`: `external_id` está en el feed.
  - (−) Un run cuya memoria no se puede leer **aborta** (antes entregaba basura). Es el trade correcto.
  - (−) Un run que muere a mitad ya grabó su lote en `processed_items` → esos videos no se re-evalúan.
    Aceptado: es el mismo destino que hoy tienen los que pierden el corte.
- **Toca:** `Heat-score v1` (union de memorias + tripwire si `processed_items` trae `.error`),
  `Leer procesados` (sin `onError`), nodo nuevo `Leer feed vivo`, reorden de ramas de `Heat-score v1`,
  `Preparar batch Airtable` (+`external_id`), `Resumen del run` (`registro_dedup` + `avisos`). Fuera
  del motor: campo `external_id` en Airtable `Candidatos` (prerequisito del re-import) y en
  `core/scripts/setup-airtable.mjs`. Probado en `test-nodos.mjs` (harness `runHeatScore`, 6 casos).
  Sin cambio de schema SQL ni de contrato de datos.

## Enmienda (2026-07-28) — el fail-closed necesitaba una lectura que no se cayera sola

- **Estado:** aceptada — 2026-07-28 (Mani, tras el cron caído del 27/07). No cambia la decisión de
  arriba: la hace ejecutable. La lectura sigue siendo fail-closed.
- **Contexto — la falla que este ADR describió sin nombrar.** El cron del 27/07 abortó en
  `Leer procesados` con `timeout of 15000ms exceeded`. La causa no era la red ni Supabase: un
  `httpRequest` de n8n corre **una vez por item de entrada**, y el nodo está después del fan-out
  video×proyecto (280 videos → 635 filas), así que disparaba **cientos de GETs idénticos** — cada uno
  con la misma URL de 5,1 KB, porque arma el `in.(…)` desde `$('Pre-trim relevancia').all()`, no desde
  el item que procesa. Trabajo O(N²): N requests idénticos de tamaño N. El error trae la prueba en el
  payload (`"itemIndex": 2`).

  Lo importante para este ADR: **ese timeout ya ocurría antes**, cuando `Leer procesados` era
  `onError: continueRegularOutput`. Se lo tragaba en silencio, `seen` quedaba vacío y el motor
  re-entregaba todo. Es decir, **el agujero (1) del contexto original ("lectura fail-open") no era
  hipotético: se estaba disparando, y es la explicación mecánica de los 15 duplicados del 20→21/07**.
  El fail-closed no introdujo el problema; lo volvió visible en el primer cron que corrió con él.
- **Decisión:**
  1. **Los tres lookups del segmento de dedup son `executeOnce`** (`Leer señal selección`,
     `Leer procesados`, `Leer feed vivo`). Son lookups **de corrida**, no de item: su URL es idéntica
     para todos los items. Es seguro porque `Heat-score v1` no usa su input directo — lee todo por
     referencia (`$('…').all()`). `Leer feed vivo` lo necesita tanto o más: sin él son cientos de
     ejecuciones × hasta 30 páginas contra Airtable, que limita a 5 req/s.
  2. **`Leer procesados` deja de filtrar por `in.(…)` y lee la columna entera**
     (`select=external_id,platform&limit=50000`). Revierte el "dedup acotado #5" (cierre 15), que se
     decidió sin medir la tabla: `processed_items` son **408 filas / 26 KB**, o sea el filtro de 5,1 KB
     existía para evitar leer 408 filas. Además elimina un techo real: a ~700 `external_id` distintos
     la URL pasa los 8 KB y el proxy la rechaza con 414.
  3. **Retry nativo (3 intentos, 2s) antes de abortar**, timeout 30s. Un hipo de red ya no mata la
     corrida; la semántica fail-closed se conserva intacta — si tras 3 intentos la memoria sigue sin
     leerse, el run aborta.
  4. **Tripwire de truncado** en `Heat-score v1`: si la lectura vuelve en el límite
     (`_proc.length >= 50000`), aborta. Una memoria truncada en silencio produce exactamente los
     duplicados que este ADR previene, y el `limit` es la única forma en que puede pasar ahora.
- **Alternativas descartadas:**
  - *Solo subir el timeout:* no arregla nada. Cientos de requests secuenciales a 2s son ~20 minutos;
    el problema es la cantidad, no la paciencia.
  - *Lotear los `external_id` en chunks (Code node nuevo que emite lotes):* resuelve el techo de 414
    pero agrega un nodo y complejidad al harness para evitar leer una tabla de 26 KB. Con la lectura
    completa el problema no existe.
  - *Volver a fail-open para que el run no muera:* es literalmente la falla que se está arreglando.
    Los duplicados son inservibles para el equipo; un run que aborta es recuperable, un feed sucio es
    trabajo manual.
- **Consecuencias:**
  - (+) El segmento de dedup hace **1 request por nodo**, con URLs constantes y sin techo de escala.
  - (+) El fail-closed pasa de teórico a operable: ahora aborta por indisponibilidad real, no por una
    autolesión del propio motor.
  - (−) La lectura crece con la tabla, no con la corrida. A ~250 videos/semana el límite de 50000 está
    a años de distancia, y el tripwire avisa antes de que degrade en silencio.
- **Regla que sobrevive a este cambio:** en este workflow, **cualquier lookup de corrida nuevo va
  `executeOnce`**. Después del fan-out entran cientos de items y n8n ejecuta el nodo una vez por cada
  uno. Anotado en el [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md) y en
  [dev-doc §2.1](../agents/dev-doc.md).
- **Toca:** `Leer señal selección`, `Leer procesados` (URL + settings), `Leer feed vivo` (settings),
  `Heat-score v1` (tripwire de truncado). Probado en `test-nodos.mjs` (+1 caso). Sin nodos nuevos, sin
  conexiones nuevas, sin cambio de schema ni de contrato.

## Enmienda (2026-07-31) — la "memoria antes de entregar" no se ordena con el array, sino con la topología

- **Estado:** aceptada — 2026-07-31 (cierre 70/71, con Mani). No cambia la decisión de arriba: la hace
  **efectiva**, porque durante 3 corridas no lo estuvo.
- **Contexto — la decisión #2 nunca entró en vigor.** El "se invierte el orden de las ramas de
  `Heat-score v1`" se implementó reordenando el **array de `connections`**. Eso no hace nada: el motor
  corre con `executionOrder: v1`, y **cuando un nodo abre dos ramas n8n elige cuál va primero por la
  POSICIÓN de cada destino en el canvas** (arriba primero, después izquierda), recorriendo esa rama
  entera antes de empezar la otra. Las posiciones reales dejaban la entrega a la izquierda de la
  memoria (`POST Airtable Candidatos` x=7560 · `POST processed_items` x=8960), o sea exactamente al
  revés de lo decidido. **Probado con datos de la corrida del 31/07:** `Resumen del run` reportó
  `registro_dedup: 'no_corrio'` —su `$('POST processed_items')` tiró porque ese nodo todavía no había
  ejecutado— **y aun así las 191 filas de memoria existen**. Dos consecuencias vividas: el tripwire
  `registro_dedup` era **incapaz de dispararse** (decía `no_corrio` siempre, así que la alarma que
  este ADR puso para detectar el fallo de dedup no servía), y la ventana de riesgo de los 15
  duplicados **seguía abierta** — si el motor moría entre entregar y grabar, esos videos volvían a
  entregarse en la corrida siguiente.
- **Decisión — la rama de memoria deja de ser una rama.** `Heat-score v1 → Preparar procesados →
  POST processed_items → Transcribir (Supadata)`, en serie. Se descartó la alternativa barata (mover
  las dos posiciones a la izquierda de `Transcribir`): funciona, pero deja la garantía central del ADR
  viviendo en dos coordenadas de canvas, o sea la próxima limpieza visual la rompe otra vez y en
  silencio. **En serie, "la memoria se graba antes de entregar" es una propiedad de la topología.**
- **Consecuencias:**
  - (+) La garantía es verificable estáticamente y **está verificada**: `node Workflows/auditar-workflows.mjs`
    exige que todo `$('X')` apunte a un ancestro topológico. Ese chequeo marcaba **exactamente este
    bug** (`Resumen del run` → `POST processed_items`) y hoy los 3 workflows dan cero.
  - (+) `registro_dedup` **revive**: `POST processed_items` pasó a ser ancestro de `Resumen del run`,
    así que el tripwire por fin puede reportar `ok`/`fallo`.
  - (−) Con la memoria antes de la entrega, un abort **en** la entrega deja videos recordados y no
    entregados (supply quemado). Es el trade que este ADR ya había elegido: mejor perder supply que
    duplicar.
  - (−) `Transcribir` ya no recibe los videos por `$input` (su input es la respuesta del POST): los
    lee con `$('Heat-score v1').all()`. Y `POST processed_items` necesita `alwaysOutputData`, porque
    PostgREST devuelve body vacío con `resolution=ignore-duplicates` y sin item de salida el nodo
    siguiente no dispararía.
- **La regla que sobrevive al fix, y vale para cualquier cambio futuro:** **si B depende de que A ya
  haya corrido, B va detrás de A en serie.** Reordenar el array de conexiones no ordena nada.
  Anotado en el [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md) y en
  [dev-doc §2.1](../agents/dev-doc.md), y chequeado por el auditor.
- **Toca:** `connections` de `Heat-score v1` y `POST processed_items`, `alwaysOutputData` del POST,
  1 línea de `Transcribir`, y las posiciones (ya cosméticas). De paso, `Preparar procesados` empieza a
  escribir **`run_id`** (`null` si el run no se abrió: la columna es FK a `runs(id)`), sin lo cual la
  memoria no se puede atribuir a su corrida. Probado en `test-nodos.mjs` (+4 casos). Sin nodos nuevos,
  sin cambio de schema ni de contrato. **Pide re-import del motor.**

## Enmienda (2026-08-31) — el fail-closed comparaba contra un techo que no existe

**El guard que este ADR puso para que la memoria nunca llegue truncada nunca disparó, y por eso el
motor llevaba meses ciego a un tercio de su propio dedup.**

### 📏 Lo medido

`Leer procesados` pedía `…&limit=50000` y el guard abortaba con `if (_proc.length >= 50000)`. Pero
**PostgREST tiene `max-rows` en 1.000**: pedir 50.000 devuelve 1.000 igual, sin error y sin aviso.
Medido el 31/08 con la URL exacta del nodo, y con dos señales:

| | |
|---|---|
| filas que devuelve la URL del nodo (`limit=50000`) | **1.000** |
| filas que hay de verdad (`Prefer: count=exact`) | **1.547** |

⇒ **el motor veía el 65% de su memoria de dedup.** Y el guard escrito justo para cazar esto comparaba
contra 50.000, un número que la lectura no podía alcanzar ni queriendo. *Un fail-closed que mide
contra un techo inexistente no protege de nada; solo tranquiliza.*

**Se descubrió leyendo la ejecución de n8n para otra pregunta** (por qué el embudo entrega poco,
[ADR-082](./ADR-082-un-video-quemado-se-rescata-borrandole-la-memoria.md)), no por un síntoma. Es la
forma que tienen de aparecer estos bugs: **la sobre-lectura de duplicados no falla en rojo, sale en
la factura.**

### 🕰️ La causa: una suposición escrita que caducó

El `notes` del propio nodo la tenía escrita: *"Lectura completa: la tabla es chica (~400 filas /
26 KB)"*. Era **cierta cuando se escribió**, y dejó de serlo sola, porque **`processed_items` no se
barre nunca**: el archivado borra `candidatos`, no la memoria. La tabla crece ~80-250 filas por
corrida, sin techo. *Una suposición sobre un tamaño se vence igual que un canario: se re-mide.*

### La decisión

**`Leer procesados` pagina por `offset`** (páginas de 1.000, tope de 50 páginas = 50.000 filas), con
la paginación nativa del nodo HTTP de n8n. Nada más cambia: sigue siendo un nodo HTTP con
`executeOnce`, `retryOnFail ×3` y fail-closed, que es lo que este ADR decidió.

**Y el guard pasa a ser dos**, porque uno solo no cubre las dos formas de fallar:

1. `_proc.length >= 50000` — el tope de páginas. **Recién ahora ese número ES el techo real**, así que
   el guard original empieza a funcionar como estaba escrito. Está acoplado a `maxRequestsPerPage`:
   si uno se mueve, el otro también, y eso queda dicho en los dos lados.
2. `_proc.length === 1000` — **el guard que sí habría cazado este bug.** 1.000 exacto es el `max-rows`
   de PostgREST, o sea *una sola página*: con la paginación andando no puede pasar salvo que la
   paginación se haya apagado. El falso positivo posible (que la tabla mida 1.000 justo) es **una
   corrida en toda la vida de la tabla** y termina en un aborto ruidoso que un humano resuelve
   leyendo el mensaje — que es exactamente el intercambio que este ADR ya eligió sobre re-pagar en
   silencio.

### ✅ Verificación

**La configuración de paginación se probó en un workflow DESECHABLE antes de tocar el motor, que está
activo:** creado por API, disparado por webhook, borrado en el `finally` con el 404 confirmado.
Devolvió **1.547 filas y 1.547 ids distintos**, contra las 1.547 que dice `count=exact`. Recién con
ese número se empujó al live.

Después: `test-nodos.mjs` en verde con **3 casos sobre los guards** —el tope de 50.000, el de 1.000
exacto, y **el contraejemplo de 999 y 1.001 que NO abortan**, sin el cual "abortá si hay muchas
filas" pasaría el test igual—, `auditar-workflows.mjs` sin hallazgos, `n8n:push` de los 2 nodos con
el workflow **activo**, `n8n:diff` verde en los 5, y la config leída de vuelta de la API del live.

### 🩸 Y lo que la medición final desmintió: las dos líneas se habían INVERTIDO de rol

El primer borrador de esta enmienda decía *"el costo era plata: re-colectar y re-transcribir lo ya
visto"*. **Se midió sobre la corrida del 31/08 y es falso ahí: la fuga fue CERO.** Los números, sobre
los 465 videos distintos que llegaron al corte:

| | |
|---|---|
| muertos por `processed_items` (la línea **fail-closed**, primaria) | **0** |
| muertos por `Leer feed vivo` (la línea **fail-open**, secundaria) | **95** |
| ciegos: en la memoria pero invisibles al nodo | **95** |
| ¿son el mismo conjunto? | **sí, idéntico** |
| ciegos que el feed vivo **no** tapaba (la fuga real) | **0** |

**La primaria aportó nada y la secundaria hizo el 100% del trabajo.** No es coincidencia: un
candidato vivo está en las dos tablas, así que los 95 que la truncadura escondía de
`processed_items` seguían estando en `candidatos`. La red de abajo atajó todo.

**Ese es el hallazgo, y es peor que la plata.** Este ADR eligió a propósito qué línea es
fail-closed *(la memoria: sin ella el run aborta)* y cuál es best-effort *(el feed vivo: si se cae,
la corrida sigue)*. **Los roles se habían dado vuelta en silencio**: la que sostenía el dedup era la
que puede fallar sin abortar nada. Un fail-open haciendo de único guardia se ve idéntico a un
sistema sano — hasta que se cae.

⚠️ **Y las dos se cortan en el mismo 1.000.** `Leer feed vivo` va contra `app.candidatos`, que hoy
tiene **274 filas**. El día que pase de 1.000 se trunca igual, **con la misma falla muda y sin guard
propio**, y ahí caen las dos líneas a la vez. Queda anotado, no resuelto acá.

### Lo que NO cambia

- **No hay duplicados visibles**, y se midió: 0 `external_id` repetidos en el feed y 0 videos vivos
  que ya estuvieran archivados. Ahora se sabe **por qué**: la secundaria los atajó a todos.
- **El costo en plata no está medido y no se afirma.** En la corrida del 31/08 fue 0. Podría no serlo
  en otras —un video **archivado** sale de `candidatos` y queda solo en `processed_items`, o sea sin
  red de abajo— pero eso no se midió y no se escribe como si sí.
