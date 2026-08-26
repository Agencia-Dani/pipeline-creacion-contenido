# ADR-076 — Ordenar es una vista, no una consulta

- **Estado:** aceptada — 2026-08-26 (con Mani). Extiende
  [ADR-072](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md): si el video es la unidad y la
  tarjeta es una sola, *ordenar y filtrar esas tarjetas* también tiene que ser uno solo. **No toca
  `core/`, no tiene migración y no toca n8n.**

## Contexto

Pedido de Majo (vía Mani, 2026-08-26): poder ordenar una colección por likes. En vez de agregar ese
control puntual, se generaliza — porque el mismo hueco existe en las cuatro pantallas que dibujan
`TarjetaVideo` y porque **ya hay tres implementaciones sueltas de "filtrar"** que no se conocen entre
sí:

| Pantalla | Filtro que ya tiene | Orden que ya tiene |
|---|---|---|
| `curar/feed` | `FILTROS` de `dom       ain/feed.ts` (calificación) | heat ↓, dentro del grupo por proyecto |
| `curar/historicos` | `FILTROS_REGISTRO` de `domain/grabados.ts` (grabado) | fecha ↓ |
| `curar/descartes` | ninguno | near-miss primero (`ordenarDescartes`, ADR-021) |
| `curar/colecciones/[id]` | ninguno | orden de inserción |

### 📏 Lo que se midió contra prod (2026-08-26)

**1. El pedido de Majo ya tiene los datos, y no dependen de Apify.** La colección *"Test"* (57
videos, creada el 24/08) se dibuja con `leerLoQueSeSabe`, que fusiona `app.candidatos` +
`app.videos_meta` + `outputs`:

```
colección "Test" — 57 miembros
   likes 57/57 · views 57/57 · seguidores 57/57
   engagement 57/57 · heat_score 57/57 · idioma 57/57
   titulo  0/57
```

`app.videos_meta` tiene **5 filas**. O sea que los 57 llegan completos por el Feed y el histórico:
**ordenar por likes no necesita comprarle nada a Apify.**

**2. Cobertura por pantalla, que es lo que decide qué criterios se ofrecen:**

| | Feed (209) | Colección (57) | Histórico (377) |
|---|---|---|---|
| likes · views · seguidores · engagement † | 209 | 57 | **248** |
| heat_score | 209 | 57 | **248** |
| relevancia_score | 208 | — | 248 |
| idioma | 209 | 57 | 377 |
| fecha (calificación / grabado) | 63 | — | 377 |
| título | 209 | **0** | 377 |

Los 129 huecos del histórico son las filas `tipo = transcripcion_a_pedido`: entraron por un link
pegado y nunca tuvieron métricas. **Son el caso que obliga a decidir qué hace un `null` al ordenar.**

† Esta tabla mide **las fuentes**, no lo que cada pantalla recibe. `engagement` está en las tres y aun
así **no se puede ordenar por él en Colecciones ni en Históricos**, porque `domain/video.ts` y el tipo
`Historico` no lo transportan. La diferencia se detalla en §5, y es justo la clase de supuesto que
esta medición sola habría dejado pasar.

**3. Nada pagina.** `leerFeed`, `leerDescartes`, `leerHistoricoCompleto` y `leerMiembros` **no tienen
un solo `limit`** — se verificó leyéndolos. Las cuatro pantallas ya traen todo a memoria (209 / los
descartes / 377 / 57), y el Feed lo hace desde que se borró el keyset el 06/08.

## Decisión

**1. 🔴 El orden y las facetas nuevas se resuelven EN MEMORIA, nunca en la query.**

No es una preferencia de latencia: **en Colecciones es lo único posible.** `likes` no existe como
columna de `app.colecciones_videos`; llega de fusionar tres fuentes con `fusionar()`
([ADR-072](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md) §2). Un `.order("likes")` en
PostgREST obligaría a **re-implementar esa fusión en SQL**, que es exactamente lo que ADR-072 §2
prohíbe citando la regla escrita dos veces en el repo:

> *"Dos derivaciones de la misma identidad serían dos bugs mudos el día que una cambie."* —
> `domain/grabados.ts`

Así que `domain/orden.ts` es dominio puro, hermano de `domain/feed.ts` y `domain/grabados.ts`: sin
IO, sin React, con su `.test.ts` corriendo bajo `node --test`.

**2. 🔴 Los nulos van SIEMPRE al final, en las dos direcciones. Nunca se tratan como 0.**

Un `null` significa *"no lo sé"*, y hay 129 en el histórico. Tratarlos como 0 diría que 129 videos
tienen cero likes, que es una mentira — la misma que la tarjeta se niega a decir en ADR-072 §4
(*degrada sin mentir*). Y mandarlos al principio en `asc` pondría 129 incógnitas arriba de todo.

**El precedente ya se pagó**, y está en el handoff: ordenar Históricos por heat se descartó porque
esas mismas 129 filas quedaban desempatando por uuid, *"un orden sin significado"*.

**3. Desempate estable por clave, siempre.** Misma regla que `agrupar()` y `ordenarDescartes()` ya
aplican, y por la misma razón escrita: *"el mazo no se puede reacomodar solo mientras alguien lo
recorre"*.

**4. 🔴 La línea que no se cruza: el filtro que EDITA no es el filtro que MIRA.**

Los chips que ya existen filtran por un atributo **mutable desde la pantalla**; las facetas nuevas,
por atributos **inmutables**. De ahí sale dónde vive cada uno:

- El chip *Sin calificar* del Feed va **a la query** (`leerMazo`), y tiene que seguir yendo: es lo
  que sostiene *"una tarjeta calificada no se va del mazo"* (ADR-034 / plan-cockpit §D6.4). Si
  filtrara en el cliente, calificar haría desaparecer la tarjeta de abajo del cursor y un misclick
  sobre 209 tarjetas sería irrecuperable desde la pantalla.
- `idioma` y `plataforma` **nadie los edita desde la pantalla**, así que un `.filter()` vivo en el
  cliente no puede hacer desaparecer nada. No necesitan congelado. (`idioma` existe en Feed,
  Históricos y Colecciones, **no** en Descartes; `plataforma` se deriva de la url con
  `parsearEnlaces` en las cuatro, que es la misma derivación de siempre y no una segunda.)

**Los dos sistemas conviven en la misma barra sin tocarse.** Está escrito acá para que nadie
"unifique" el chip de calificación adentro del nuevo y reintroduzca el bug que ADR-034 ya resolvió.

**5. Los criterios se declaran POR PANTALLA, y el default de cada una no cambia.** No hay una lista
global: las cuatro pantallas no comparten atributos. Cada una pasa su `CriterioOrden[]`, y **el
default es la primera entrada de su lista**, o sea lo que ya mostraba:

| Pantalla | Tipo que dibuja | Default (se queda) | Criterios que **puede** ofrecer |
|---|---|---|---|
| `curar/feed` | `CandidatoFeed` | heat ↓ dentro del grupo | likes, views, seguidores, engagement, relevancia, A-Z |
| `curar/historicos` | `Historico` | fecha ↓ | likes, views, seguidores, heat, relevancia, A-Z |
| `curar/colecciones/[id]` | `Video` | orden de inserción | likes, views, seguidores, heat, A-Z |
| `curar/descartes` | `DescarteFeed` | near-miss (ADR-021) | **relevancia, A-Z y nada más** |

🩸 **Las tres listas son distintas y no por gusto — el primer borrador de esta tabla decía
`engagement` en las cuatro filas y `likes` en Descartes, y las dos cosas son falsas.** Se corrigió
leyendo los tipos y `app.descartes` contra prod, no re-leyendo el diseño:

- **`domain/video.ts` no tiene `engagement`.** El dato existe en las fuentes (57/57 en la colección
  medida) pero `fusionar()` no lo transporta, y agregarlo a `app.videos_meta` sería una migración —
  o sea `core/`, o sea otro ADR. Queda afuera de Colecciones. `Historico` tampoco lo tiene.
- 🔴 **`app.descartes` tiene 12 columnas y ninguna es una métrica.** No hay `likes`, `views`,
  `seguidores`, `engagement` ni `idioma`: el gate mata el video antes de que se archiven. Sus únicos
  ejes reales son `relevancia_score`, el título y `creado_en`. Un selector con seis criterios ahí
  serían cuatro que no hacen nada.

**Esto es la regla §7 aplicada al orden y no solo a las facetas: un criterio que la pantalla no puede
calcular no se ofrece.** El `CriterioOrden[]` por pantalla es justamente lo que lo hace imposible de
olvidar — no hay una lista global de la que alguien pueda copiar de más.

En Descartes hay algo más en juego: *"near-miss primero, sin auditar antes"* es una regla de ADR-021,
no un orden por defecto cualquiera. El control deja salirse un rato; no la reemplaza.

**6. Ordenar NO aplana los grupos.** El orden se aplica **dentro** de cada grupo. `domain/feed.ts`
tiene escrito por qué se agrupa por proyecto: *"los criterios de relevancia son por proyecto, así que
mezclarlos obliga a rotar de criterio en cada tarjeta y vuelve inconsistente el juicio"*. Un control
de orden no re-litiga eso.

**7. Una faceta se dibuja solo si tiene 2+ valores distintos en lo cargado.** En una colección toda de
Instagram, el chip de plataforma no aparece. Es lo que evita el problema que el handoff ya anotó una
vez: un control que no hace nada *"se leía como mobiliario"*.

**8. El estado es local (`useState`), no un query param.** Como `filtro` y `plegados` hoy. Un
`?orden=likes` obligaría al server a releer, que es justo el viaje que esta decisión evita. Si algún
día hace falta compartir vistas, ahí se gana el lugar.

## Alternativas descartadas

- **Ordenar en la query, con `.order()` de PostgREST.** Imposible en Colecciones sin re-implementar
  `fusionar()` en SQL (§1). Y en las otras tres no compra nada: no hay paginación, así que sería un
  ida y vuelta por click sobre datos que ya están en el browser.
- **Tratar los nulos como 0.** Rung 1 y equivocado: convierte *"no lo sé"* en *"cero likes"* para 129
  filas. Contradice el principio de la tarjeta (ADR-072 §4).
- **Que elegir un orden aplane los grupos.** Más simple de explicar, pero saca al Feed de su modo
  agrupado sin avisar y contradice la razón escrita en `domain/feed.ts`.
- **Un control `Agrupar por: proyecto | referente | nada` al lado del de orden.** Es lo más general y
  contesta *"¿cuáles son los 10 con más likes de todo?"*. Se difiere: son dos perillas que
  interactúan y un default a decidir por pantalla, para una pregunta que nadie hizo todavía.
- **Filtro por referente.** Alta cardinalidad: pide un selector con búsqueda, no chips. Es la parte
  más cara de la UI y la que menos se pidió. Decisión de Mani: afuera de la primera versión, y es lo
  primero que va a pedirse después.
- **Un componente genérico tipo *DataTable*.** Las tarjetas no son filas y las pantallas no comparten
  columnas. Sería configurabilidad más allá de lo que se pidió.
- **Montarlo también en `transcribir`.** Su cola tiene **0 de 130** con título y ninguna métrica: el
  control sería un adorno. Ahí el orden útil es por estado y por tanda, que es otro set de criterios
  y otro diseño.

## Consecuencias

- (+) Cero migraciones, cero `core/`, cero n8n, cero re-import. Es dominio puro más una barra.
- (+) Testeable sin base de datos, como el resto de `domain/`.
- (+) Sumar una quinta pantalla es pasarle su lista de criterios, no un refactor.
- (−) 🔴 **Techo de escala declarado.** Esto funciona porque las cuatro pantallas traen todo a
  memoria. Hoy son 209 / 377 / 57 y los descartes. Si el Feed pasa de ~1-2k filas hay que volver a
  paginar, y ahí el orden **tiene que mudarse a la query** — con la salvedad de §1: en Colecciones eso
  no es posible sin materializar la fusión.
- (−) *Título A-Z* en Colecciones ordena todo-nulos hoy (0 de 57 tienen título), o sea que deja el
  orden de inserción. Degrada honesto y se llena solo cuando alguien corre *Identificar*.
- (−) **La barra de Descartes queda flaca**: dos criterios de orden y una faceta. Es lo honesto para
  una tabla sin métricas, pero conviene saberlo antes de montarla y leerlo como que quedó a medias.
- (−) *Engagement* no se puede ordenar en Colecciones ni en Históricos. Si se pide, el camino barato
  es derivarlo en memoria (`likes / seguidores`, que es lo que el motor ya calcula) y no una columna
  nueva — pero es una decisión aparte, porque hoy el número lo produce el motor y derivarlo acá sería
  una segunda fórmula.
- (−) Dos sistemas de filtro conviven en la misma barra (§4). Es un costo real de comprensión y por
  eso la regla está escrita: el que edita va a la query, el que mira va al cliente.
