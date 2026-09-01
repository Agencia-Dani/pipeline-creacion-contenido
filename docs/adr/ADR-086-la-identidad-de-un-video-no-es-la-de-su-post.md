# ADR-086 — La identidad de un video no es la de su post

- **Fecha:** 2026-09-01
- **Estado:** aceptada (rung 1 aplicada; rung 2 escrita, pendiente de la `036`)
- **Enmienda a:** [ADR-029](ADR-029-dedup-por-processed-items.md) (el dedup del motor)

## Contexto

Dani Rodríguez lo reportó el 2026-09-01, sacando guiones para la voz nueva (María José Sánchez):

> *"me están apareciendo en el feed videos que ya había calificado y que grabamos ayer"*

Tenía razón, y **no era ninguno de los bugs que ya se arreglaron**. Se descartaron uno por uno, cada
uno con su medición contra prod:

| Sospecha | Medición |
|---|---|
| Filas duplicadas por `external_id` | **0**. El UNIQUE `(instance_id, external_id)` aguanta |
| Una calificación que se revirtió sola | De los **147** candidatos distintos que calificó Dani, 147 existen y **0** volvieron a `nuevo` |
| El insert del motor pisando la nota | `POST Candidatos` manda `resolution=ignore-duplicates`: nunca sobreescribe |
| El archivado devolviendo videos | Candidatos `nuevo` que ya están en `outputs`: **0** |
| La paginación del dedup rota (cierre 130) | `n8n:diff` verde en los 5. Por corrida: la fuga de 4 videos pasó **solo** en la del 31/08 04:30, antes del arreglo; las de 13:00 en adelante tienen **0** |

La causa es otra, y es de modelo:

🔑 **El dedup recuerda el ID DEL POST, no el video.** `processed_items` y `Leer feed vivo` comparan
`external_id`, que es el `id` que devuelve Apify — o sea el media pk de Instagram. Cuando un creador
**vuelve a subir el mismo reel**, Instagram le da un pk nuevo. Para el motor es un video que nunca
vio: lo re-transcribe, lo re-paga y lo deja en el Feed como nuevo. Quien califica lo ve por segunda
vez y no tiene forma de saberlo.

### Lo medido (2026-09-01, prod, 422 candidatos)

Dos señales independientes, porque el caption solo no prueba nada (los creadores repiten caption en
una serie): **caption idéntico** y **guion casi idéntico** (solapamiento de palabras >3 letras).

- **17 pares** en `app.candidatos` son el mismo video dos veces (parecido 0,58–0,93).
- **11 estaban en el Feed sin calificar con su gemelo ya calificado.**
- **3 de esos 11 tenían el gemelo ya marcado como grabado**, ese mismo día 14:47–14:56, por Dani.
- **4 pares se juzgaron dos veces, y 2 salieron con nota distinta** (🔥 una vez, 👍 la otra). Eso
  envenena a `Destilar criterios` (ADR-022), que aprende de los 🔥.
- **18 pares más en `app.descartes`** (154 filas): Haiku pagó por juzgar el mismo video dos veces.
- Lo último que hizo Dani antes de escribir: **15:43:20, calificó 👍 un video cuyo gemelo ya había
  👍 el 31/08.** Esa es la tarjeta que disparó el mensaje.

El ejemplo textual, `the.pocket.psychologist`:

| | ya calificado 👍 | volvió al Feed |
|---|---|---|
| post id | `3956108894929106430` | `3839389820758477933` |
| views | 436.095 | 777.119 |
| guion | *"…este es un sistema nervioso regulado cuando **llega** el estrés…"* | *"…cuando **golpea** el estrés…"* |

Mismo video, dos posts. El guion difiere solo porque Haiku tradujo el mismo audio dos veces con
palabras distintas. Las views distintas prueban que son dos posts reales y no un scrape doble.

### Por qué recién ahora

No es una regresión. Dani sumó 12 referentes el 30/08 y los `colectados` por corrida pasaron de
**524 → 1.088 → 1.178**: se está raspando ~100 posts de profundidad por perfil, y ahí abajo es donde
viven las re-subidas. Es un umbral que se cruzó, y con más referentes empeora.

## Decisión

**Se AVISA, no se bloquea.**

El Feed marca la tarjeta cuyo `referente + huella` coincide con uno ya calificado, diciendo qué nota
le pusieron. La tarjeta se sigue pudiendo calificar igual: la que decide es la persona.

### Por qué no un bloqueo

Ninguna llave disponible hoy es lo bastante precisa para tirar un video sin que lo vea nadie:

- **Caption exacto** (la única señal que la pantalla ya tiene): caza 7 de los 17 pares y **se
  equivoca en la mitad** de lo que marca. `philipp_humm` y `francescapsychology` tienen videos
  DISTINTOS con caption idéntico (son series).
- **Duración del video**: llega gratis desde `Normalizar IG` (`item.videoDuration`) y hoy **se
  tira** — no la persiste ninguna tabla. Es tentadora porque es pre-pago, pero **se descarta como
  llave sola**: con ~100 posts por perfil y duraciones repartidas en unos pocos cientos de baldes,
  las colisiones entre videos distintos del mismo creador son probables. No se puede afirmar el
  número porque el dato no está guardado, y eso mismo es la razón de no construir sobre él todavía.
- **Hash exacto del guion traducido**: caza 1 de 17. Haiku traduce el mismo audio distinto cada vez.

🔑 **Un aviso con 50% de precisión cuesta una mirada; un bloqueo con 50% cuesta un video bueno que
nadie vuelve a ver.** Es el mismo criterio que ADR-029 ya eligió para el dedup del motor: abortar
ruidoso antes que perder callado.

### La forma: la huella entra como dato

`domain/repetidos.ts` recibe la huella, **no la calcula**. Hoy la huella es el caption normalizado,
que es lo único que la pantalla ya tiene sin pagar payload. Cuando la `036` persista la huella del
**guion original de Supadata** (que es determinista sobre el mismo audio, al revés que la traducción
de Haiku), cambia de dónde sale la huella y **la regla no se toca**. Es el punto de que entre como
parámetro: dos fuentes, una sola implementación de la regla — el error que ADR-072 ya nombró.

## Consecuencias

- ✅ El Feed avisa. `domain/repetidos.ts` + 10 tests, `lib/candidatos.ts::leerRepetidos`,
  `TarjetaVideo` gana una ranura `aviso` (fuera del `truncate`: un aviso cortado es un aviso que
  nadie lee).
- ✅ `leerRepetidos` lee la tabla **entera**, no el filtro abierto: el gemelo de un sin-calificar
  está por definición del lado calificado. Es sumidero — si falla, el feed se dibuja sin avisos.
- ⚠️ **La detección de hoy caza ~7 de cada 17.** No es el arreglo completo y no hay que leerlo así.
- 🔴 **Sigue pagándose la transcripción del duplicado.** El aviso salva a la persona y evita la
  doble grabación; no salva la plata. ~0,014 USD por duplicado (Supadata + traducción), ~0,5 USD
  sobre los 35 duplicados medidos. La plata no es el problema; la doble grabación sí.
- 📌 Los 11 que estaban en el Feed se marcaron a mano el 2026-09-01 con la nota de su gemelo
  (`app.eventos` tipo `candidatos.marcar_repetidos`, `usuario_id` en **null** a propósito: no fue una
  persona). Verificado por efecto: el feed pasó de 222 a 211 sin calificar y quedaron 0 repetidos.
  Los 🔥 se bajaron a 👍 para no contarle dos veces el mismo ejemplo a `Destilar criterios`.
- 🐤 **Canario:** `select count(*) from app.eventos where tipo = 'candidatos.marcar_repetidos'` da
  **1** y esa 1 es la corrección de esta ADR, no uso. La pregunta que sí importa se re-mide, no se
  cita: *¿cuántos pares nuevos aparecen por corrida?* — el mismo cálculo de Jaccard sobre
  `app.candidatos`, corrido después de la próxima corrida real.

## Rung 2 (escrita, no aplicada)

[`core/schema/036_candidatos_huella.sql`](../../core/schema/036_candidatos_huella.sql) agrega
`app.candidatos.huella_guion` y `app.candidatos.duracion_seg`. Ninguna de las dos se usa todavía:
**existen para poder medir**. Con una corrida real guardándolas se puede contestar lo que hoy no se
puede — si la duración colisiona entre videos distintos del mismo creador, y cuántos pares caza la
huella del guion original — y **recién ahí** se decide si alguna aguanta un bloqueo pre-pago en
`Heat-score v1`. Medir el martes no autoriza a bloquear el jueves.
