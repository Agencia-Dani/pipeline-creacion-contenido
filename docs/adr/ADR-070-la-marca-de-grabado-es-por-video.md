# ADR-070 — La marca de grabado es por video, no por carril

- **Estado:** aceptada — 2026-08-20. **Enmienda [ADR-069](./ADR-069-grabado-es-un-estado-del-sistema.md)**
  (de dos días antes: muda el hecho de una columna de `app.transcripciones` a una tabla por video) y
  **extiende [ADR-062](./ADR-062-el-transcriptor-deja-de-ser-un-callejon-sin-salida.md)** (el
  histórico es de todos los carriles; ahora la marca también). Toca `core/`: la migración `029`.
  Sale de un pedido de Alejo Carvajal (Retia) del 2026-08-20.

> **Se escribe ANTES de construir.** El código de esta ADR todavía no existe.

## Contexto

ADR-069 puso la marca *grabado* como columna de `app.transcripciones`, con un argumento correcto
para el requisito de entonces: **proteger el pegote de re-pagar un video que el equipo ya grabó**.
Dos días después llegó un requisito distinto, del equipo que usa la herramienta:

> *"¿hay una opción que nosotros pudiéramos como subirle un Excel con los links ya grabados […] lo
> que sea que no esté en la herramienta, y que ya la herramienta como que entienda que esos links ya
> están grabados?"* — Alejo Carvajal, 2026-08-20

No es el mismo pedido. ADR-069 resolvía *"no me cobres dos veces"*; esto es *"llevá el registro de
qué guiones ya usamos"*. **Medido contra prod el 2026-08-20**, la columna de la `028` no alcanza:

| | |
|---|---|
| Guiones en el histórico del equipo (`outputs` con `estado = 'aprobado'`) | **183** |
| Vinieron de Transcribir → tienen dónde marcarse hoy | 128 |
| Vinieron del Feed / motor → **no tienen dónde marcarse en ninguna pantalla** | **55** |
| Solapamiento entre los dos carriles | **0** |
| Filas marcadas como grabadas en toda la base | **1** (la prueba de Mani del 18/08) |

Y hay un tercer caso que ninguna columna puede representar: **un link grabado por fuera de la
herramienta no tiene fila en ninguna tabla.** No hay dónde poner la marca porque no hay fila.

### Lo que ADR-069 §3 midió bien, y la conclusión angosta que sacó

ADR-069 descartó marcar desde el histórico con este argumento:

> *"esa pantalla lee `outputs`, que no tiene clave por video. Marcar ahí pide primero arreglar
> `external_id`."*

Y sobre `external_id` tenía razón, medido: uuid del candidato en los `guion_reel`, record id de
Airtable en los viejos, id del video en los `transcripcion_a_pedido`. **La columna está
sobrecargada.**

Pero la **fila** sí tiene la clave, y estaba a la vista:

- `metadata->>'url_referente'` está poblado en **300 de 300** filas de `outputs`.
- `domain/enlace.ts` deriva de esa URL la dupla `(plataforma, external_id)` en **300/300**, sin una
  sola llamada de red — incluidos los **55** `guion_reel` aprobados que hoy no tienen superficie.
- Es la misma función que ADR-031 verificó contra la base viva: **381/381** en Instagram, **27/27**
  en TikTok.

🔑 **La forma del error, que es lo portable: se midió la columna y se concluyó sobre la fila.**
`external_id` no servía como clave y de ahí salió *"outputs no tiene clave por video"*. La segunda
señal —la URL en `metadata`, con una función de derivación que el repo ya usaba y ya había
verificado— no compartía mecanismo con la primera, y da lo contrario. *Una columna sobrecargada no
prueba que la fila no sea identificable.*

## Decisión

**El hecho "este video ya se grabó" es del VIDEO, no del carril por el que entró.**

### 1. Una tabla nueva, `app.grabados`, con clave `(instance_id, plataforma, external_id)`

Es lo único que cubre los tres orígenes a la vez: el Feed, la zona Transcribir, y el link cargado a
mano que no tiene fila en ninguna otra parte.

ADR-069 descartó exactamente esta tabla — *"es la forma 'bien normalizada' y es **de más**"* — y con
un solo carril tenía razón. Con tres, la alternativa de columnas son **tres escritores de un mismo
hecho que pueden contradecirse**, y el tercero ni siquiera tiene tabla donde vivir. Un hecho, un
dueño.

### 2. La presencia de la fila **es** la marca

Desmarcar borra la fila. No hay `grabado_en` nullable ni booleano al lado. Un estado que se
representa de una sola forma no se puede escribir mal, y `grabado_en` queda como *cuándo*, que es la
pregunta que siempre sigue.

### 3. `app.transcripciones.grabado_en` se migra y se dropea **después**, no ahora

Expand/contract, la disciplina que este repo ya usa. La `029` crea la tabla y copia lo que había; la
columna sigue en el esquema hasta que el código nuevo esté deployado y verificado, y sale en una
`030` con su propio gate. `COLUMNAS` de `lib/transcripciones.ts` todavía la pide, y **un `select` de
una columna inexistente es `42703`: la zona Transcribir entera dejaría de cargar.**

### 4. El histórico pasa de archivo a tablero; no nace una pantalla nueva

`/curar/historicos` ya es, desde ADR-062, *"todo guion que el equipo quiso guardar, venga de donde
venga"* — los 183 de las dos mitades. Es el lugar donde el equipo ya piensa *"mis guiones"*, así que
la marca, el filtro y la carga masiva van ahí.

Una pantalla de "registro" aparte mostraría **las mismas 183 filas** que el histórico y obligaría al
equipo a aprender cuál mirar. *Se rechaza por la misma razón que el pedido original lo pide: que no
esté todo en partes distintas y difíciles de encontrar.*

### 5. Los links cargados a mano se marcan, no se transcriben

Cero llamadas a Supadata, cero costo, instantáneo aunque peguen 300. Es coherente con ADR-069: la
marca existe justamente para **no** pagar por algo ya grabado. Para el guion ya existe Transcribir,
con sus tandas. *Lo nuevo es la verificación, no la transcripción.*

Esas filas aparecen en el histórico como **huérfanas**: URL, plataforma y cuándo se marcó, sin botón
de ver script. No mienten diciendo que hay un guion que no existe.

### 6. Carga masiva es pegar links, no subir un archivo

`parsearEnlaces` ya saca links de cualquier texto —hasta de un chat de WhatsApp copiado entero— y ya
muestra *"N detectados"* antes de confirmar. Copiar la columna de links del Excel y pegarla usa la
interacción que el equipo **ya aprendió** en Transcribir.

Un `<input type="file">` con parser de Excel sería el primer upload del repo (hoy no hay ni uno),
con dependencia nueva, adivinanza de qué columna trae los links y sus encodings, para el mismo
resultado. `ponytail:` si algún día piden `.xlsx` de verdad, el upgrade es un input que lee el
archivo en el browser y vuelca texto en el mismo cuadro — el dominio no cambia.

## Alternativas descartadas

- **Dejar la columna de la `028` y agregar otra a `outputs`.** Dos escritores del mismo hecho que
  pueden discrepar, y sigue sin poder representar un link de afuera — que es el pedido literal.
- **Agregar `video_key` a `outputs` y marcar ahí.** Arregla la clave de verdad y es la forma correcta
  a la larga, pero pide backfill de 300 filas (la conversión shortcode→bigint no es cómoda en SQL) y
  tocar el nodo `Armar filas archivado` en n8n para que la escriba. Hoy la app deriva la clave en
  memoria y a 183 filas eso no se nota. **Es el techo declarado**, no una puerta cerrada: cuando
  `outputs` llegue a miles, esta es la migración que toca.
- **Reusar `outputs.estado = 'publicado'`.** Ya lo descartó ADR-069 §3 y sigue valiendo: `leerAprobados`
  filtra `aprobado`, así que mover la fila la sacaría del histórico que lee Dani.
- **Marcar solo al descargar el CSV.** Ya lo descartó ADR-069: *descargar no es grabar*.
- **Una pantalla de registro aparte del histórico.** §4.

## Consecuencias

- **No repara lo que ya pasó.** Lo que el equipo grabó antes de hoy sigue sin estar, salvo lo que
  carguen a mano. La carga masiva existe justamente para que puedan recuperar ese pasado de un
  Excel, pero es un acto de ellos. Decírselo es parte de entregarlo.
- **El aviso del pegote mejora solo.** `revisarPegote` pasa a leer de la tabla nueva, así que ahora
  también avisa por videos grabados que vinieron del **Feed** o que se cargaron a mano — un caso que
  ADR-069 §2 dejó nombrado y sin cubrir (*"hoy avisa con `vistosPorElMotor`, con un mensaje más
  flojo"*).
- **El CSV gana una columna 17, `GRABADO EN`, al final.** ADR-057 manda: las 16 existentes no se
  mueven de posición, para no romper una planilla armada encima del export viejo.
- 🔴 **Sigue dependiendo de un hábito, y ese es el riesgo entero.** El canario es el mismo de
  ADR-069, corrido a la tabla nueva: `select count(*) from app.grabados` a un mes. Si da 0, ni la
  columna ni la tabla eran el problema y lo que falta es otra cosa. **Contexto que lo hace urgente:
  el cockpit de Retia lleva 11 días sin un solo evento humano.** Entregar un botón nuevo a un equipo
  que no está entrando no mueve el número solo.
