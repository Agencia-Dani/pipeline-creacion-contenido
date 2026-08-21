# ADR-072 — El video es la unidad: una llave, una tarjeta, y el cruce en memoria

- **Estado:** aceptada — 2026-08-21. Extiende [ADR-070](./ADR-070-la-marca-de-grabado-es-por-video.md)
  (que estableció la llave) de *una marca* a *todo lo que se sabe de un video*. Habilita
  [ADR-073](./ADR-073-la-coleccion-es-una-bolsa-de-videos.md) y
  [ADR-074](./ADR-074-el-guion-limpio-es-un-artefacto-nuevo.md).

## Contexto

El mismo video se ve de tres formas distintas según la pantalla, y en dos de las tres es
irreconocible:

| Pantalla | Qué dibuja hoy |
|---|---|
| `curar/feed` | miniatura 4:5, título, referente, vistas, heat, calificación |
| `transcribir` | la **url**, un badge de estado, y el guion en un `<details>` |
| `curar/historicos` | la **url** y el guion |

Pedido de Mani (2026-08-21), después de que Majo pidiera poder agrupar videos: *"los videos en
transcribir solo tienen el link, uno no tiene ni idea el título o el autor. Deberíamos estandarizar
esas cartas que se muestran por video en toda parte."*

### 📏 Lo que se midió, y el supuesto que mató

El diseño arrancó asumiendo que la metadata faltante *"ya está en el sistema, es un join por la
llave"*. **Medido contra prod el 2026-08-21, es falso:**

| Origen | Videos | Título · referente · métricas | Miniatura |
|---|---|---|---|
| Feed (`app.candidatos`) | 101 | 101 | **34** |
| Históricos, del Feed (`outputs.tipo = guion_reel`) | 172 | 172 | **0** |
| Históricos, cargados a mano (`app.grabados`) | 294 | **3** | 3 |
| Transcribir (`app.transcripciones`) | 130 | **0** | 0 |

🩸 **Y el primer cruce que se corrió dio 129 de 130, que era un falso positivo.** Las
transcripciones matcheaban **consigo mismas**: sus propias filas de `outputs`
(`tipo = transcripcion_a_pedido`, 129) llevan **la url como `titulo`** y `metadata` con solo
`idioma, origen, plataforma, url_referente`. Un cruce que cuenta filas sin mirar qué contienen
confirma cualquier hipótesis. *La lección, hermana de la de ADR-070: se contó el match y se concluyó
sobre el contenido.*

Las tres causas, cada una verificada:

- **Supadata devuelve `content`, `lang`, `availableLangs` y nada más** (se corrió la llamada exacta
  del nodo `Transcribir`). No hay de dónde sacar título ni autor al pegar un link.
- **`outputs.metadata` tiene 19 claves y ninguna es miniatura.** El archivado copia referente,
  views, likes, seguidores, engagement, heat, proyecto, voz y calificación, pero nunca
  `thumbnail_url`. Es una fuga viva: cada video archivado la pierde para siempre.
- **Instagram bloquea las `og:` tags sin login.** TikTok sí tiene oEmbed público y gratis, pero el
  **99,5% del inventario es Instagram** (422 de 424): el camino gratis no cubre nada.

## Decisión

**1. La llave del video es la de ADR-070, y alcanza para todo.** `(instance_id, plataforma,
external_id)`. Es la misma que ya usan `processed_items`, `app.transcripciones`, `app.candidatos` y
`app.grabados`, y la que `domain/enlace.ts` deriva de cualquier URL sin llamadas de red.

**2. 🔴 El cruce se hace EN MEMORIA, no en una vista de Postgres.**

Esta decisión invierte lo primero que se diseñó (una vista `app.v_videos` que hiciera el `coalesce`
entre las cuatro fuentes), y la razón es dura:

`outputs.external_id` **significa dos cosas distintas según el carril** (uuid del candidato en
`guion_reel`, id del video en `transcripcion_a_pedido`). ADR-070 ya resolvió eso: la identidad se
deriva de `metadata->>'url_referente'`, poblado en **300 de 300**. Pero esa derivación vive en
`domain/enlace.ts` (`parsearEnlaces` → `claveDe`), verificada contra la base viva en 381/381 IG y
27/27 TikTok.

Una vista SQL tendría que **re-implementar esa derivación en regex de Postgres**. Y el repo ya tiene
escrita la regla que lo prohíbe, dos veces:

> *"Se apoya en `parsearEnlaces` y no en un regex propio a propósito. **Dos derivaciones de la misma
> identidad serían dos bugs mudos el día que una cambie.**"* — `domain/grabados.ts:29-32`
>
> *"Se arma el registro igual que la pantalla, con la misma función, para que el archivo y lo que se
> ve no puedan divergir. **Dos implementaciones del mismo cruce serían dos verdades.**"* —
> `curar/historicos/actions.ts:233-234`

Así que `domain/video.ts` **generaliza `armarRegistro`** de dos fuentes (guiones + marcas) a las que
haya. Es la misma forma, el mismo lugar y la misma función de identidad.

**3. La tarjeta del Feed es la tarjeta, y su layout es el layout.** `components/video/tarjeta.tsx`
sale de `curar/feed/tarjeta.tsx` con un solo cambio: el footer pasa a ser un slot (`acciones`), para
que cada pantalla ponga el suyo. El layout de cuatro capas del Feed (chips de filtro → grupos
plegables → grilla → modal) se aplica a las tres: Transcribir agrupa por **lote**, Históricos y Feed
por **proyecto**, con la misma `agrupar()` de `domain/feed.ts:238`, que ya es genérica.

**4. La tarjeta degrada sin mentir, y eso es lo que hace posible estandarizar.** Las tres fuentes
saben cosas distintas y ninguna se completa inventando. Lo que no se sabe sale `null` y la tarjeta
cae en el fallback que el Feed **ya tiene resuelto**: la inicial del referente sobre fondo `muted`,
más *"sin miniatura"*. 🔑 **En particular, la url NUNCA se usa como título**: `outputs` lo hace hoy
para las 129 filas de `transcripcion_a_pedido`, y ese disfraz fue exactamente lo que produjo el falso
positivo de la medición. Un título que en realidad es una url miente dos veces: en la pantalla y en
el próximo cruce que alguien escriba.

**5. La metadata que falta se compra, y se guarda en `app.videos_meta`.** Misma llave otra vez. La
única fuente que funciona con Instagram ya está en el sistema y ya se paga: `apify~instagram-scraper`
(el actor del nodo `Apify — IG Reels`), verificado contra la API de Apify: **acepta `directUrls`**.
*Cuándo se paga* lo decide [ADR-073](./ADR-073-la-coleccion-es-una-bolsa-de-videos.md), no este ADR.

**6. Se tapa la fuga de la miniatura**, hacia adelante: `thumbnail_url` entra al `metadata` del nodo
`Armar filas archivado`. Es cambio de `parameters`, no de topología, así que va por `n8n:push`
(ADR-053). **Sin backfill**: las 172 ya archivadas se perdieron, y re-scrapearlas costaría 172
llamadas por una miniatura.

## Alternativas descartadas

- **La vista `app.v_videos`.** Ver §2. Duplicaba en SQL la derivación de identidad que ya vive en
  `domain/enlace.ts`, contra una regla escrita dos veces en el repo. Además el cruce en memoria es
  el que ya se usa en las dos features análogas más recientes (ADR-067 cruza voces *"en memoria"*,
  ADR-070 arma el registro con `armarRegistro`).
- **Enriquecer al pegar el link, en Transcribir.** Se pagaría por los 130 links que entran, de los
  que buena parte se descarta. Ver ADR-073.
- **Completar la tarjeta con lo que haya, aunque sea la url como título.** Es lo que hace `outputs`
  hoy y es la causa medida del falso positivo. Una pantalla que muestra una url donde dice "título"
  entrena a la gente a no leer ese campo.
- **oEmbed / scraping de `og:` tags.** Instagram lo bloquea sin login (probado). TikTok funciona,
  y son 2 videos de 424.

## Consecuencias

- (+) Una tarjeta, un tipo de dominio, una función de identidad. Agregar una cuarta fuente de video
  es sumarla al merge, no una pantalla nueva.
- (+) El cruce queda **testeable sin base de datos**, como el resto de `domain/`.
- (−) 🔴 **Después de esto, Transcribir NO se ve mejor: se ve igual, en forma de tarjeta.** Con 0 de
  130 con metadata, el refactor solo entrega la forma. Lo que la llena es ADR-073. Está escrito acá
  para que no se lea como una falla cuando se vea en pantalla.
- (−) El merge en memoria obliga a bajar las fuentes y cruzarlas en el servidor. Es exactamente lo
  que `curar/historicos` ya hace con 183 guiones + 294 marcas, así que el orden de magnitud está
  medido y aguanta.
- (−) Una tabla más (`app.videos_meta`) que hay que registrar en `lib/supabase/scoped.ts`. Sin esa
  entrada **no compila**, que es la red que se quiere.
