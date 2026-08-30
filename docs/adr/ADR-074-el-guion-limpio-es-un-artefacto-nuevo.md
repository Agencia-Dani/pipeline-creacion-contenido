# ADR-074 — El guion limpio es un artefacto nuevo; el crudo no se toca

- **Estado:** aceptada — 2026-08-21, **enmendada el 2026-08-30** (§Enmienda al final: `creado_por`
  se pisaba al rehacer, así que el canario que este ADR escribió medía mal; el canario se muda a
  `app.eventos` y el evento pasa a guardar **cuáles**). **Enmienda [ADR-009](./ADR-009-scripts-literales-y-aprendizaje-en-scoring.md)
  y [ROADMAP §1.1](../../ROADMAP.md).** Se apoya en
  [ADR-072](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md) (la llave) y
  [ADR-073](./ADR-073-la-coleccion-es-una-bolsa-de-videos.md) (dónde se dispara).

## Contexto

**El norte dice lo contrario de lo que el equipo pide hoy.** ADR-009, con el visto bueno del jefe el
2026-06-12:

> *"GENERAR se vuelve TRANSCRIBIR + TRADUCIR. Sin reescritura, sin embellecer, sin voz."*

Y el system prompt vivo del nodo `Traducir` lo repite palabra por palabra: *"sin reescribir, sin
resumir, sin embellecer, sin agregar ni quitar nada"*.

**Qué cambió.** El 2026-08-21 Majo Duarte pidió que la herramienta entregue el guion ya pulido. No es
un capricho: hoy lo hace a mano, guion por guion, pegándolos en Claude. Sus criterios, textuales:

1. Lenguaje hacia audiencia latinoamericana.
2. Tono de experta con autoridad (quien graba es una comunicadora, no una repetidora).
3. **Sacar la información personal y de marca del referente** (*"hola, yo soy Manuel, soy abogado de
   tal firma"*), que es lo que más rechazo genera en las creadoras.
4. Neutralizar modismos de otro idioma: el material viene mayoritariamente del inglés.
5. **Borrar el cierre del referente** (invita a su libro, su curso, su link en bio). Ellas graban su
   CTA aparte y lo pegan después.
6. Ortografía y puntuación.
7. **Que la traducción no duplique frases**: un *"la importancia de la comunicación"* dicho una vez
   sale dos veces.

🩸 **Y un contraejemplo que llegó antes que el feature.** Majo ya se topó con el modo de falla: un
video con **dos voces** (una pregunta y su respuesta) al que la corrección le desarmó la estructura y
lo convirtió en monólogo. *"No respetó el hecho de que el formato estuviera pensado para dos voces."*
El guion se veía mejor y era peor, y eso se descubre en grabación.

## Decisión

**1. 🔑 El guion limpio es un artefacto NUEVO al lado del crudo, nunca encima.**

`app.candidatos.script` y `app.transcripciones.script` **no se tocan**. La corrida sigue entregando
la transcripción literal, se sigue guardando igual y se sigue viendo igual. El limpio vive en su
propia tabla, es opcional, y se puede tirar y rehacer sin perder nada.

Esto es lo que permite enmendar ADR-009 sin romperlo: **lo que el norte prohíbe es que el sistema
entregue una reescritura EN VEZ del contenido tal cual.** Sigue sin hacerlo. Lo que se suma es una
capa derivada que el equipo pide y puede ignorar.

Y responde al contraejemplo de arriba: cuando la limpieza rompa la estructura, el crudo está intacto
al lado, en la misma pantalla, a un click.

**2. Se guarda por VIDEO, con la llave de ADR-070.** `(instance_id, plataforma, external_id)`. Un
guion limpio sirve igual si el video vino del Feed, de Transcribir o de un link pegado, y **no muere
con el candidato** cuando el archivado barre.

**3. El criterio se parte en dos: base fija en código, perfil editable por voz.**

- Los **7 criterios de arriba** son de la casa y valen para toda voz: van en el prompt, en código,
  versionados en git. Que Majo pueda romperlos por error desde una pantalla no le sirve a nadie.
- **Cómo habla cada creadora** no lo sabe nadie más que ella: `app.voces.perfil_limpieza`, texto
  libre, editable en `curar/voces`.

Es el precedente de [ADR-067](./ADR-067-el-perfil-de-voz-de-linkedin-es-una-capa-sobre-las-voces-de-la-empresa.md)
(el perfil es una capa sobre la voz), con una diferencia: acá el grano es **empresa** y no instancia,
porque cómo habla Milena no depende del cockpit desde el que se mire.

🔴 **Y NUNCA se toca `voces.activo`.** Ese flag significa de facto *"corre en reels"* y lo consume
`leerConfigOperar` para armar el plan del motor: escribirlo desde esta pantalla apagaría proyectos en
producción sin un solo error (ADR-067 §2).

**4. El prompt vive en `docs/prompts/limpieza-guion.md` antes que en el código.**

Se escribió el 21/08 para que Majo desbloqueara su corrida del día sin esperar el feature, y **se
valida a mano antes de hardcodearse**. Es la forma más barata de no descubrir en producción que el
prompt no servía.

**5. Haiku 4.5, y con un canario que decide si alcanza.**

Es el modelo de los 7 call-sites del sistema. La duda es legítima —la queja de fondo de Majo **es**
la calidad, y adaptar registro es más difícil que traducir literal— así que se arranca barato y se
mide: si los limpios se usan sin editar, alcanzó; si no, se sube a Sonnet **con dato**, no por
intuición.

## Alternativas descartadas

- **Limpiar en el motor, como un nodo más después de `Traducir`.** Era el pedido literal de Majo
  (*"que la herramienta al traducirlos ya haga ese paso extra"*). Se descartó por tres razones: es
  cambio de topología, o sea re-import completo del workflow (el único ritual manual que queda, y el
  que ya rompió el error handler dos veces); pagaría la limpieza de **todos** los candidatos,
  incluidos los que se descartan; y dejaría el crudo sin superficie donde compararse.
- **Pisar `script` con el limpio.** Rompe ADR-009 de verdad, y hace irrecuperable el caso de las dos
  voces.
- **Versionar cada limpieza.** Una fila por video, que se pisa al rehacer. Un historial de limpiezas
  es una pantalla que nadie pidió; el crudo ya es el punto de comparación que importa.
- **Todo el criterio en el campo editable.** Cada voz nueva arrancaría limpiando mal hasta que
  alguien la llene, y los 7 criterios quedarían copiados N veces.
- **Dejar que el equipo edite el limpio en el cockpit.** Hoy ningún guion es editable en ninguna
  pantalla. Sale del alcance a propósito: si no gusta, se copia y se arregla afuera, como hoy.

## Consecuencias

- (+) El norte de ADR-009 sigue en pie donde importa: la corrida entrega transcripción literal.
- (+) El crudo y el limpio conviven en pantalla, así que el modo de falla que Majo ya vivió se
  detecta **antes** de grabar y no durante.
- (+) `voces.perfil_limpieza` es la costura por donde entra todo lo que Majo aprenda corrigiendo a
  mano. Cada corrección suya es material para ese campo.
- (−) Gasto nuevo por guion. Acotado a lo que alguien decide limpiar (ADR-073), no a la corrida.
- (−) 🔴 **Un limpiador puede borrar información estructural y producir un guion que se ve mejor y
  es peor.** No se resuelve con código: se resuelve mostrando los dos y avisando cuando el modelo
  tomó una decisión discutible (el prompt lo obliga a marcarlo con ⚠️).
- (−) ROADMAP §1.1 queda con una enmienda. Es el segundo punto del norte que se toca (el primero fue
  el disparo on-demand, ADR-023), y como aquel, **se suma sin retirar nada**.

## Enmienda — 2026-08-30: `creado_por` no es un canario, y el evento tiene que guardar CUÁLES

*Toca `lib/guiones-limpios.ts`, la zona `curar/colecciones` del cockpit y **el comentario del canario
en [`core/schema/032`](../../core/schema/032_guiones_limpios.sql)**. Sin migración, sin n8n, sin
cambio de esquema: la tabla queda igual y `app.eventos.detalle` ya es `jsonb`.*

### El defecto

`guardarLimpio` manda `creado_por: usuarioId` en **cada** upsert, y el upsert es `merge`. Como
re-limpiar pisa la fila (decisión de este ADR, §"Versionar cada limpieza" en Alternativas
descartadas), **rehacer un guion le roba la autoría a quien lo limpió primero**.

Eso convierte en falso al canario que este mismo ADR escribió en la `032`:

```sql
select count(*) from app.guiones_limpios where creado_por <> '<uuid de Mani>';
```

La columna que decide si el feature sirvió **es la columna que el botón pisa**. Con
[ADR-080 §Enmienda](./ADR-080-la-limpieza-la-decide-el-video-no-quien-aprieta.md) el daño dejó de ser
teórico: *Rehacer 25* pondría 25 guiones de Majo a nombre de quien apriete, y el canario leería
**abandono** justo por haber usado el sistema.

### 📏 Medido el 2026-08-30 contra prod, y corrige dos números que circulaban

| | |
|---|---|
| Filas de `app.guiones_limpios` | **65** |
| `creado_por` | **Majo 58 · Mani 7** — el canario de la `032` da **58** |
| Eventos `colecciones.limpiar` | **11**, que suman **69** escrituras |
| ⇒ Filas escritas más de una vez | **al menos 4** |

🩸 **Y ninguna fila está fechada el 29/08 aunque hubo una escritura ese día.** Ese hueco *es* el
borrado, visible en la tabla: la escritura del 30/08 la tapó.

🔑 **El `61 · 4` que se citaba nunca fue un conteo de `creado_por`.** Se reproduce exacto desde los
eventos contando **escrituras por voz** e ignorando **quién**: Majo con voz `13+18+1 = 32`, más las
2 escrituras con voz de Mani del 21/08 ⇒ **34**; Majo sin voz `15+12` ⇒ **27**. `34+27 = 61`. Las
filas de hoy por voz dan **33 · 32**, no 34 · 27. **El delta de 3 filas que se creía perdido puede
no haber existido nunca**: eran dos preguntas distintas leídas como la misma. *Un canario mal
consultado miente igual que uno mal escrito.*

⬜ **Lo que NO se pudo cerrar, y su razón es la decisión 2 de abajo:** varias líneas de tiempo
distintas encajan en los mismos números, porque el evento guarda `limpiados` y no **cuáles**. No
falta esfuerzo: **está subdeterminado por diseño**. La fila `instagram:3961380848620303234` perdió su
`creado_por` original y **no es recuperable**.

### 1. `creado_por` se escribe en el INSERT y nunca más

La columna vuelve a decir lo que su nombre dice: **quién lo limpió la primera vez**. Se logra sin
mandar la columna en el upsert cuando la fila ya existe — PostgREST con `merge-duplicates` solo pisa
lo que se le manda.

🔑 **Y el corte ya existía, no hubo que inventarlo.** `limpiarFaltantes` apunta por definición a
filas que **no existen** (`!yaLimpios.has(clave)`) y `relimpiarViejos` solo a filas que **sí
existen**. El `motivo` de ADR-080 —que se agregó para otra cosa— **ya particiona exactamente por
INSERT vs UPDATE**: no hace falta una rama nueva ni leer antes de escribir.

Se descartó **una columna `rehecho_por`** (migración → `core/` → ADR propio) porque guarda solo al
**último** que rehizo, no la serie: es la opción cara que contesta menos que la decisión 2.

### 2. El evento guarda las CLAVES, no solo cuántas

`colecciones.limpiar` suma `claves: ["instagram:123", …]` junto a `limpiados`. Con eso *"quién
rehizo qué"* se contesta desde `app.eventos`, **que no se pisa nunca**, y la reconstrucción que esta
enmienda no pudo hacer queda posible la próxima vez.

Acotado: la tanda más grande medida fue **18** videos y el tope del botón es 25 ⇒ ~900 bytes de
`jsonb`. No es una columna nueva: `detalle` ya es `jsonb` y ya lleva `motivo` y `sin_voz`.

### 3. El canario de la `032` queda corregido en su archivo

`creado_por` sirve para **atribuir una fila**, no para medir adopción. La adopción se lee del
stream, que nadie pisa:

```sql
-- ¿Cuántas limpiezas hizo alguien que no sea quien construyó el botón?
select count(*) from app.eventos
 where tipo = 'colecciones.limpiar' and usuario_id <> '<uuid de Mani>';
```

### Consecuencias

- (+) La columna deja de mentir, y *Rehacer 25* deja de ser peligroso: se puede apretar.
- (+) El canario vive en la tabla append-only, o sea que **la próxima medición no depende de que
  nadie use el sistema mientras tanto**.
- (+) El agujero forense se cierra: el evento pasa a decir *cuáles*.
- (−) *Quién rehizo* no queda en la fila, solo en el stream. Contestarlo cuesta un `select` sobre
  `app.eventos` en vez de leer una columna. Es el precio de no abrir migración.
- (−) `creado_por` de las filas ya pisadas no se restaura: **no hay de dónde**. Los eventos del
  26/08 guardan cuántos, no cuáles.
