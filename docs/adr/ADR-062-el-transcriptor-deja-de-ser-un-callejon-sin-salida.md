# ADR-062 — El transcriptor deja de ser un callejón sin salida

- **Estado:** aceptada — 2026-08-07. **Enmienda [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md)**
  (el archivado deja de ser el único escritor de `outputs`) y **[ADR-031](./ADR-031-transcriptor-a-pedido.md)**
  (la transcripción a pedido tiene un estado más y una salida). Toca `core/`: una migración nueva.
  Sale de un grill con Mani.

> **Se escribe ANTES de construir.** El código de esta ADR todavía no existe.

## Contexto

El transcriptor (ADR-031) atiende **enlaces pegados**: alguien del equipo trae un link a mano, sale
un **script literal**. Al 2026-08-07 lleva **57 pedidos** y funciona. Pero lo que produce **no va a
ningún lado**: vive en `app.transcripciones` y ahí se queda.

Eso deja dos agujeros, y los dos los encontró el equipo usándolo, no un review:

1. **Un pedido que falla para siempre no tiene salida.** Un video sin voz (solo música) nunca va a
   dar transcript. El botón de reintento —que se construyó el mismo 07/08— funciona perfecto y **no
   sirve para este caso**: reintentar algo que es estructuralmente imposible lo deja igual. La fila
   queda ocupando la cola, ofreciendo un botón que no puede ganar.
2. **El guion que sí sale bien no entra al CSV que lee el jefe.** El equipo transcribe a mano
   justamente lo que más le importa, y eso es exactamente lo que no queda registrado. `/curar/historicos`
   —el reemplazo del Sheet, ADR-057— solo tiene lo que el archivado subió desde el feed.

Y hay un tercero que nadie había pedido pero cae solo: **el gasto del transcriptor es invisible**.
`v_costos_semana` agrupa por `runs.params->>workflow`, y el transcriptor no abre `runs`. Los ~57
pedidos × $0.009 de Supadata no aparecen en Entender. Las otras tres máquinas del sistema (motor,
archivador, buscador de cuentas) sí.

## Decisión

**Cuatro piezas de una sola idea: lo que el transcriptor produce entra al sistema, y lo que no puede
producir se cierra.**

### 1. El Histórico deja de ser "lo aprobado" y pasa a ser "lo que el equipo quiso guardar"

Es un cambio de **término**, no de pantalla. El glosario ya decía que una Transcripción a pedido
**no es un Candidato** —no pasó por el gate, nadie la calificó— así que meterla en una lista llamada
*"todo lo que el equipo aprobó"* habría sido mentir con la palabra *aprobó*.

**Histórico** = el archivo de guiones del equipo, venga del feed o de un link pegado. Cada fila dice
su **origen**, y el CSV gana esa columna **al final** (ADR-057: una columna que se mueve rompe la
planilla de quien la lea por posición; una que se agrega al final, no).

### 2. Entra sola al quedar `listo`

Sin botón de confirmación. Si el Histórico es *"lo que el equipo quiso guardar"*, **pegar el link ya
es quererlo**: nadie pega un link que no le interesa. Un acto explícito extra sería fricción para
registrar algo que la persona ya decidió al pegarlo.

### 3. El transcriptor abre su propio `run`

`outputs.run_id` es `not null` y referencia `runs`. Una tanda de enlaces pegados abre un `run` con
`params.workflow = 'transcriptor'` y `trigger_type = 'manual'` — **los dos valores ya existen**, así
que el check de `trigger_type` no se toca.

> 🩸 **Corrección del 2026-08-07, sobre esta misma ADR.** Acá decía que el catálogo de `outputs.tipo`
> tampoco se tocaba, *"porque la `001` lo dejó sin check duro a propósito"*. **Falso.** Esa frase de
> la `001` sigue: *"cuando se selle, se agrega el check en 002"* — y **la `002` lo selló**
> (`outputs_tipo_chk`). Leer media frase y no la otra media es lo que produjo el error.
> Lo cazó un sondeo contra prod **sin escribir nada**: el POST con la forma exacta de la app dio
> **23514**, y el mismo POST con `tipo = 'guion_reel'` dio **23503** (pasó el schema, abortó por el
> `run_id` falso) — o sea que el resto de la fila ya estaba bien. La migración `026` extiende el
> catálogo. *Es la cuarta vez que este repo se equivoca por leer una nota de diseño sin verificar su
> estado actual.*

**Y el `tipo` propio es load-bearing, no cosmético.** Por forma, un enlace pegado produce el mismo
artefacto que el motor (un guion literal de un reel), así que podría ser `guion_reel`. Pero en este
esquema **`tipo` es el discriminador que usan las vistas**: `v_metricas_calidad` y las cinco de la
`016` filtran `tipo = 'guion_reel'`. Compartir el valor metería transcripciones a mano dentro de la
precisión de entrega y de la señal por referente, que miden el juicio del equipo **sobre lo que trajo
el motor**. Un tipo propio las deja fuera por construcción, sin un `where` nuevo en ningún lado.

### 4. Abandonar ≠ descartar

Estado nuevo `abandonado` en `app.transcripciones`. La fila **queda**, para que el mismo link no se
vuelva a colar ni a pagar.

## Alternativas descartadas

**`run_id` nullable en `outputs`.** Es la migración más corta y por eso la más tentadora. Se
descarta porque las vistas hacen `join runs on r.id = o.run_id`: con `run_id` en NULL esas filas
**desaparecen de las métricas sin un solo error**. Este repo ya persiguió esa clase de fallo tres
veces (el `PGRST204` tragado por `onError`, el `42501` del grant faltante, el placeholder sin
resolver), y las tres veces costó días. Un `not null` que se afloja es una alarma que se apaga.

**Unir las dos tablas en la app, sin tocar `outputs`.** Cero cambios de esquema, pero PostgREST no
sabe paginar un UNION: habría que traer las dos tablas enteras y ordenar en memoria, lo que tira
abajo la paginación por keyset y duplica la forma de las 15 columnas del CSV en un segundo lugar que
se puede atrasar.

**Llamar `descartado` al estado nuevo.** Es la palabra que todos entienden sin explicación, y por eso
es la trampa. En este dominio *descartar* es siempre un **juicio de mérito**: el gate rechazó el
video (Descarte del gate) o el equipo le puso 👎 (Estado `descartado`). Un video sin voz no es malo,
es **inservible como insumo** — y la diferencia no es filosófica: un `descartado` de candidatos
alimenta el aprendizaje como clase negativa, y este no debe alimentar nada. La app ya se comió este
error una vez: el commit `7cb52fd`, del día anterior a esta ADR, se llama *«Sin voz» nombraba dos
cosas distintas en la misma app*.

**Un `veredicto` encima de `sin_transcript`, como la auditoría de descartes.** Conceptualmente es lo
más fiel (una decisión *sobre* un resultado, no otro resultado) y se descartó por costo: una columna
y una consulta más en la pantalla, para una distinción que el estado ya expresa.

**D7.5 —que la app escriba `outputs` al calificar, matando al archivado— en la misma tanda.** La
maquinaria queda construida por esta ADR, así que después sale barato. Pero decidir qué le queda al
archivado (destilar criterios y barrer siguen siendo suyos) es una discusión propia, y meterla acá
convertía un cambio acotado en un refactor. **Mientras tanto, un botón "Archivar ahora"** en Operar
dispara el webhook del archivado, que ya existe: es lo mínimo que resuelve *"quiero descargarlos
ahora"* sin comprometerse con lo grande.

## Consecuencias

- **`outputs` tiene dos escritores**, y eso enmienda ADR-014 de frente. El archivado sigue siendo el
  dueño de lo que sale del feed; el cockpit escribe lo del transcriptor. El contrato
  [ingesta-registro](../../core/contracts/ingesta-registro.md) decía *"desde D7 todo lo que n8n
  escribe va por acá"* — sigue siendo cierto, pero ya no es *todo lo que se escribe*.
- **El cockpit escribe `runs`**, cosa que hasta hoy solo hacía n8n. Es lo que vuelve visible el gasto
  del transcriptor en Entender, y de paso lo pone en la misma lista que las otras tres máquinas.
- **El botón "Archivar ahora" no es un "correr" pelado y su texto tiene que decirlo:** el archivado
  archiva los calificados, **los saca del feed** y **barre los sin calificar de más de 20 días**
  (medido el 07/08: eso serían 0, porque el candidato más viejo es del 01/08 — pero el número cambia
  solo con el tiempo).
- **Una transcripción `abandonada` no se puede reintentar**, y eso es el punto. Si el equipo se
  equivoca, la salida es borrar la fila por SQL — se acepta a propósito en vez de construir un
  des-abandonar para un caso que todavía no ocurrió.
