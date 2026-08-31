# ADR-083 — Una corrida cuenta lo que anotó, no lo que hizo

- **Estado:** aceptada · **construida y verificada** — 2026-08-31 (con Mani). Pantalla nueva
  `/{cliente}/{pipeline}/operar/corridas`: 4 tabs (una por máquina que escribe `runs`),
  master/detail, lenguaje del equipo de redes, veredicto determinístico + veredicto de la IA a
  pedido. **No toca `core/`, sin migración, sin n8n.** Verificada en el navegador contra los datos
  reales de prod: los 4 tabs, una corrida `ok`, una `fallo`, y el veredicto de la IA generado,
  guardado y releído sin pisar el embudo.

## Contexto

Operar tenía una card, *"Corridas recientes"*, con **una línea por corrida**: estado, hace cuánto,
cuánto duró y `entregó N candidatos`. Mani lo describió así: *"si falló, no te dice bien en qué
nodo, no te dice por qué; si fue successful, no te dice cómo descartó. Me toca a mí meterme acá y
revisar la ejecución de n8n a mano."*

La lectura obvia —*"falta registrar más"*— **es falsa para las corridas que salen bien y verdadera
para las que fallan**, y esa asimetría es lo que ordena todo el diseño.

### 📏 Lo que se midió contra prod (2026-08-31)

**1. Las corridas `ok` ya registran muchísimo, y la pantalla lo tiraba.** `runs.metricas` de la
corrida del 31/08 04:30 trae el embudo completo (`colectados 520 → pretrim 1682 → filtrados 336 →
gate 63 → outputs 32`), `transcripciones_vacias`, las llamadas por servicio, un `por_proyecto` con
el diagnóstico ya calculado (`Depresión: 87 evaluados, tasa_gate 0.06, entregados 0,
razon_faltante: mixta`) y un `por_referente` handle por handle (`modern.day.psychologist: 15
evaluados, 0 pasaron`). De todo eso, la card dibujaba **un número**: `outputs`.

**2. Las corridas `fallo` no registran NADA. Las 12, sin excepción: `metricas` en NULL.**
`Resumen del run` es el último nodo del motor, así que una corrida que muere antes no escribe ni un
contador. **La pantalla no puede mostrar lo que nadie guardó** — el detalle de un fallo es fino por
construcción, no por falta de diseño.

**3. El nodo del fallo y el link a n8n ya estaban escritos y no se leían.** El error handler
(ADR-054) guarda `[Workflow - Shortform Content] Bad request · nodo: POST Candidatos ·
https://…/executions/136`, y la card lo volcaba crudo en un `<span>` rojo de 12px.

**4. Los 4 tabs no son 3, y no son comparables.** Cuatro máquinas escriben `runs`: motor (40
corridas, 10 fallos), transcriptor (24, **12 fallos**), archivado (16, 2), descubrimiento (4, 1).
El transcriptor no estaba en el pedido y es el que peor ratio tiene. Y el archivado guarda
**`{archivados: 67}` y nada más**.

**5. El volumen no es un problema de escala sino de forma: 84 corridas en 2 meses**, ~10 por mes en
el tab más cargado. A un año son ~250 en el peor tab. Veinte cartas gordas no se recorren; veinte
filas de una línea, sí.

## Decisión

### 1. Sub-página de Operar, no una zona nueva

Vive en `operar/corridas`. En este cockpit las zonas son **verbos** y *"logs"* no lo es: esto es la
historia de lo que hace Operar. En concreto: hereda `exigirTenant("operar")` y **no toca** el tipo
`Zona` de `domain/roles.ts`, la tabla de `domain/pipelines.ts`, `domain/permisos.ts` ni sus tests —
y no obliga a decidir si un `sponsor` (que es de la empresa cliente) ve los errores crudos de n8n.

### 2. El desglose por proyecto va PRIMERO; el embudo global, abajo y con su unidad dicha

🔑 **Esta es la decisión que arregla el *"se ve muy de dev"*, y no es de redacción.** `colectados`
cuenta **videos**; `pretrim` y `gate` cuentan **video × proyecto** (un mismo video se evalúa en cada
proyecto que lo reclama). Por eso `1.682` sale de `520` sin que nadie haya bajado más videos: son
dos unidades en la misma fila de números, y eso no se arregla con mejores palabras.

El desglose **por proyecto**, en cambio, cuenta videos distintos de punta a punta (`Resumen del run`
los dedupea por `external_id`), así que es **la única vista donde los números se pueden restar sin
mentir**. Pasa a ser la vista principal. El embudo global se muestra igual, abajo, **diciendo la
unidad de cada paso** — que es lo único que impide leerlo como una resta.

### 3. Cada máquina dibuja lo suyo; no hay plantilla común

Una plantilla habría obligado a las cuatro a hablar de *"items"*, que es exactamente el idioma que
esta pantalla existe para no usar. Lo que unifica es `pasosDe(workflow, corrida)`, en el dominio: la
lista se arma **con lo que la corrida registró**, y un paso que no está no aparece. 🔴 **No aparece
como cero:** *"no se registró"* y *"fue cero"* son cosas distintas, y un cero fabricado se lee como
un hecho.

Consecuencia asumida y dicha en pantalla: **el tab de Archivar es pobre y lo declara**, porque su
`Cerrar run` guarda un solo número.

### 4. El veredicto tiene DOS capas, y no se mezclan

**Capa 1, determinística, gratis, siempre.** El texto sale de las reglas sobre `metricas`: el motor
ya calcula `razon_faltante` por proyecto con umbrales explícitos y deja un array `avisos`. Un LLM no
puede mejorar eso y **sí puede contradecirlo** — una pantalla que dice *"el gate estuvo bien"* al
lado de una regla que dice `gate` demasiado estricto es peor que una pantalla sin veredicto.

**Capa 2, la IA, a pedido y guardada.** Hace las dos cosas que una regla sobre UNA corrida no puede:
traducir un error de n8n a algo accionable, y **comparar contra la historia**. Se guarda en
`metricas.veredicto_ia` (jsonb ⇒ **cero migración**) y se paga **una vez por corrida**.

🔒 **Solo sobre una corrida cerrada**, y no es una regla de producto: guardar es un
read-modify-write sobre el mismo `metricas` que escribe n8n al cerrar. Con la corrida viva hay otro
escritor y esto le pisaría el embudo entero.

💰 Medido en una llamada real: **97 tokens de entrada, 331 de salida ⇒ ~US$ 0,009 por corrida**, una
sola vez en su vida. Se paga solo por las corridas que alguien de verdad mira, y **dos personas leen
el mismo texto** — un texto regenerado por visita costaría por lectura y cambiaría entre lecturas,
que es la forma exacta del problema que este repo ya nombró con los canarios.

⚠️ **`fetch` a mano y sin SDK**, que es el invariante escrito en `lib/limpiar.ts`. El primer intento
instaló `@anthropic-ai/sdk` y se revirtió: habría dejado dos formas de llamar a la misma API en el
mismo repo. El **modelo** sí es distinto (`claude-opus-5` contra el `claude-haiku-4-5` de limpiar y
traducir) porque la tarea es distinta: aquéllos transforman un texto ya escrito, esto lee un embudo
y lo cruza contra tres corridas.

### 5. El link a n8n existe solo para `dev`

Mani: *"lo de abrir en n8n no debería estar ahí porque los de redes no tienen acceso"*. **No se
borra: se gatea por rol** (`veCostos`, el mismo gate que los costos, y por la misma razón — lo que
separa no es la zona sino de quién es la herramienta). Un link que pide un login que no tenés es
peor que ningún link; y quien sí entra a n8n conserva el atajo.

🔒 **El gate vive en el servidor, no en el JSX:** si se decidiera al dibujar, la URL habría viajado
igual al browser de todo el equipo.

⚠️ **Para una corrida `ok` el link necesita `N8N_BASE_URL` + `N8N_WF_<MÁQUINA>`**, que hoy viven en
el `.env` de la raíz (los usan los scripts de `core/`) y **no en Vercel**: en producción arranca
apagado. **El del fallo no depende de ninguna env var** — el error handler lo escribe pegado al
mensaje. O sea que justo el caso donde más se necesita funciona sin configurar nada.

### 6. Qué alcanzó a hacer una corrida fallida: se cuenta, no se lee

Como `metricas` es NULL en los 12 fallos, lo único honesto es **contar las filas que esa corrida sí
escribió**: candidatos con ese `run_id` (ADR-081, que es lo que lo hace posible). ⚠️ Solo cuenta lo
que **sigue vivo** — un candidato archivado se borra (ADR-036) — así que dice *"quedan N de esa
corrida"*, no *"entregó N"*. El conteo se pide **al abrir** una corrida fallida, no al listar.

### 7. `offset` y no keyset, con condición escrita

El feed tiene prohibido `offset` porque ahí se edita mientras se recorre. Acá **no se edita nada**:
una corrida vieja es inmutable. Si esta pantalla ganara un filtro sobre algo mutable, la excepción
se cae y hay que volver a keyset.

## Lo que NO se decide acá

- **Que las corridas registren más.** El archivado seguirá guardando un número y un fallo seguirá
  sin dejar rastro hasta que se toquen los `Cerrar run` y se agreguen checkpoints al motor. Eso es
  trabajo de n8n y va aparte, **a propósito y en este orden**: la tanda 2 no se puede verificar sin
  esta pantalla — sin ella, la única forma de comprobar que un checkpoint escribe bien es entrar a
  n8n a mirar la ejecución a mano, que es lo que esto elimina.
- **`app.descartes.run_id`.** *"Qué videos mató esta corrida y por qué"* necesita esa columna
  (la tabla no la tiene) y por lo tanto migración y ADR propio.
- **El `outputs.run_id` que es del archivado y no del motor** (hallazgo de ADR-081): sigue vivo.

## Consecuencias

- ✅ La pregunta *"¿por qué entregó poco?"* se contesta sin salir del cockpit, y con el nombre de
  las cuentas que no aportaron — un dato que estaba en `metricas.por_referente` desde ADR-021 y no
  dibujaba nadie. Es la misma poda que el handoff venía pidiendo a mano.
- ✅ Un fallo dice el paso donde murió **en la fila plegada**, y qué hace ese paso en castellano.
- ⚠️ El diccionario `QUE_HACE_EL_NODO` es una lista escrita a mano contra los `workflow.json`. Un
  nodo que no está se dibuja con su nombre crudo: **inventarle una descripción sería peor**, porque
  se leería igual de confiable que las que sí se verificaron.
- ⚠️ `ANTHROPIC_API_KEY` ya estaba en el `.env.local` del dashboard (la usan `limpiar` y `traducir`),
  así que el botón de la IA no pide credencial nueva. **Sí hay que confirmar que esté en Vercel.**
- 📌 Al mover el error crudo a esta pantalla, la card de Operar pasa a decir solo `se cayó en <nodo>`.
