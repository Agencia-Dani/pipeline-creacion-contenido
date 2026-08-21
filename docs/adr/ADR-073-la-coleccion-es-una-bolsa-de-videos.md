# ADR-073 — La colección es una bolsa de videos, y es donde se paga la metadata

- **Estado:** aceptada — 2026-08-21. Se apoya en
  [ADR-072](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md) (la llave y `app.videos_meta`)
  y en [ADR-070](./ADR-070-la-marca-de-grabado-es-por-video.md) (la llave del video).

## Contexto

Dos pedidos de Majo Duarte (2026-08-21, WhatsApp) que parecían features distintas:

1. Poder **limpiar los guiones** de los videos que elige, no de todos.
2. Poder **bajar un documento** con los guiones de los videos que elige, para dejar de copiar y
   pegar uno por uno. *"No sabés el tiempo que nos ahorraría."*

Y un tercer problema que levantó Mani mirando el Feed: **calificar no mueve el video a ningún lado.**
Un 🔥 o un 👎 lo deja donde estaba hasta que el archivado lo barra a Históricos. No hay forma de
apartar un conjunto para trabajar sobre él. *"Los videos quedan scattered around y difíciles de
encontrar."*

Los tres son el mismo hueco: **falta el sustantivo.** No hay ninguna entidad en el sistema que
signifique *"estos videos, juntos, para hacerles algo"*.

## Decisión

**1. La colección es membresía explícita, no una vista guardada.**

Una fila por video en la colección (`app.colecciones_videos`), no un filtro que se re-evalúa. La
alternativa —guardar el criterio (*"los 🔥 de Milena de agosto"*) y resolverlo al abrir— se descartó
por dos razones que apuntan al mismo lado:

- Lo que Mani pidió es **agrupar a mano**, con criterio humano que ningún filtro expresa (*"estos
  cinco van juntos porque son el mismo tema"*).
- Una vista guardada **cambia sola**. El video que estaba adentro cuando se pagó su scrape puede no
  estar mañana, y el guion limpio quedaría colgando de algo que ya no lo contiene.

**2. 🔑 La colección apunta a la LLAVE del video, no a la fila del candidato — y por eso sobrevive
al barrido.**

`app.colecciones_videos` guarda `(plataforma, external_id, url)`, la llave de ADR-070. No hay FK a
`app.candidatos`. La consecuencia es la que resuelve el tercer problema **sin tocar n8n**: el
archivado puede borrar el candidato (*Barrer candidatos sin calificar*, cada domingo) y la colección
sigue entera. La `url` se guarda en la fila por la misma razón que en `app.grabados`: para TikTok no
es derivable, y un video huérfano no tiene otra fila de donde sacarla.

**3. La colección acepta los tres orígenes, y ese es el punto.**

Feed, Transcribir y links cargados a mano entran a la misma bolsa. Es lo único que la llave por video
permite y que una FK a cualquier tabla concreta impediría: **el 62% del inventario (los links
cargados a mano) no tiene fila en ninguna tabla de contenido.**

**4. 🔴 Agrupar es el momento en que se paga el scrape.**

Al agregar videos, los que no tengan metadata en ninguna fuente se piden a `apify~instagram-scraper`
(`directUrls`) y lo que vuelva se guarda en `app.videos_meta`. **No se enriquece al pegar el link en
Transcribir.** Los números que lo deciden, medidos el 21/08:

| | Videos | Con título/referente |
|---|---|---|
| Transcribir | 130 | **0** |
| Históricos, cargados a mano | 294 | **3** |

Enriquecer al pegar pagaría por los 130 que entran, de los que buena parte se descarta sin mirarse.
Enriquecer al agrupar paga por lo que alguien decidió trabajar. **Contra aceptada, y es real:**
Transcribir se sigue viendo pobre hasta que alguien agrupe. Se eligió con ese costo a la vista.

**5. El enriquecimiento es fail-open, siempre.**

Si Apify se cae, tarda o devuelve a medias, **el video entra igual a la colección** con lo poco que
se sepa. Es el invariante #1 de PLAN §2.5 (*el registro es sumidero, jamás dependencia de
ejecución*) aplicado a un caso nuevo: agrupar es el trabajo, enriquecer es el adorno, y el adorno no
puede bloquear el trabajo.

**6. La PK de `app.videos_meta` es la guardia contra re-pagar.**

Se pide solo lo que falta. Agregar el mismo video a una segunda colección cuesta **cero**. Nada
re-scrapea por antigüedad: `traido_en` está para auditar el gasto, no para vencer.

## Alternativas descartadas

- **Vista guardada / filtro con nombre.** Ver §1.
- **Colgar la colección de `app.candidatos` con una FK.** Es lo natural viniendo del Feed, y deja
  afuera a los otros dos orígenes — que juntos son la mayoría del inventario. Además el barrido la
  vaciaría sola.
- **Una colección por corrida, automática.** No es lo que se pidió: el criterio de agrupación es
  humano y cruza corridas.
- **Enriquecer al pegar.** Ver §4.
- **Un `estado` más en `app.candidatos` (tipo "apartado").** Un solo grupo por video, sin nombre,
  y muere con la fila cuando el archivado barre.

## Consecuencias

- (+) Un sustantivo cubre los tres pedidos. Limpiar y descargar son **acciones sobre la colección**,
  no dos features con su propia selección cada una.
- (+) El *"quedan atrapados en el Feed"* se disuelve por construcción, sin tocar el archivado.
- (+) La pantalla de Colecciones es el primer lugar donde la tarjeta de ADR-072 se ve **llena**,
  porque el scrape se acaba de pagar ahí.
- (−) 🔴 **Esto reordenó el plan.** Las tarjetas de Transcribir e Históricos iban antes que esto, y
  medido en pantalla habrían shippeado dos pantallas **más vacías que hoy** (0 de 130 y 55 de 184
  con título real, 0 de 184 con miniatura). *La tarjeta necesita el dato, y el dato llega acá.*
  Las tarjetas se hacen después.
- (−) Gasto nuevo y variable, atado a una acción de usuario. Mitigado por la PK como guardia y por
  el fail-open, pero **es plata que antes no se gastaba**: el canario es
  `select count(*), min(traido_en), max(traido_en) from app.videos_meta`.
- (+) `app.colecciones_videos` es una tabla puente y aun así **no** hereda su tenant: lleva su
  propio `instance_id`, atado al de su colección por un **FK compuesto** contra
  `colecciones (id, instance_id)`. Cuesta una columna y un índice único redundante, y a cambio
  Postgres hace **imposible** meter un video en la colección de otra empresa. Es más de lo que
  consiguen `app.referentes_proyectos` y su hermana, que están en grano `heredado` y por eso traen
  los pares de todos los tenants confiando en que el llamador intersecte.
