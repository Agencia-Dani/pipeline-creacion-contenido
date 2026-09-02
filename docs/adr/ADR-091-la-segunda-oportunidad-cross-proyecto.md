# ADR-091 — La segunda oportunidad: antes de irse, el video se le ofrece a los demás proyectos

- **Estado:** aceptada — 2026-09-02 (decisión de Mani). **Escalón 2 de la
  [cascada de entrega](../agents/plan-cascada-de-entrega.md)** y el pendiente #1 de su §2.
  **Cobra un pendiente escrito de [ADR-022](./ADR-022-loop-aprendizaje-criterios.md)**, no abre una
  discusión nueva. **No toca `core/`, sin migración.**

## Contexto

Mani, el 01/09: *"que se revisen los otros rechazados de otros proyectos para TODOS los proyectos
antes de irse (básicamente para que todo video tenga chance de matchear a un proyecto)"*. Y el 02/09,
al elegir la forma: *"es clave; toca hacer seguimiento de si esto sirve o no"*.

**El problema.** `Asignar proyecto+voz` hace el fan-out **por referente**: un video se le ofrece
únicamente a los proyectos que reclaman la cuenta que lo publicó. Un proyecto que no tiene ese
referente en su lista **nunca lo ve**, por bien que le calce. La pregunta que se contesta hoy es
*"¿este video sirve para los proyectos de su referente?"* y la que hace falta es *"¿sirve para ALGÚN
proyecto activo?"*.

📏 **Medido el 01/09:** el fan-out ofrece cada video a **~3,5 proyectos** de los **11 activos**
(4.154 pares sobre 1.178 colectados). O sea que **dos tercios de los proyectos nunca ven el video**.

⏳ **Y el disparador ya estaba escrito.** ADR-022 dejó anotado: *"la segunda oportunidad… queda
anotada como variante quirúrgica para cuando haya >3 proyectos con criterios sanos"*. Hoy hay 11.

## Decisión

**Después del corte y del spillover, los videos que no se lleva nadie se le ofrecen a los proyectos
con cupo que NO los habían visto.** Sólo Haiku: el transcript ya está pagado (ADR-087) y
`Transcribir` dedupea por video, así que **no agrega un centavo de ASR**.

1. **Huérfano** = video con guion que ningún proyecto entregó. Un entregado nunca entra.
2. **Se pregunta sólo a los proyectos con cupo** (`_entregados[pid] < _nDe(pid)`) **que no lo
   juzgaron ya** — a los que sí lo vieron ya los resolvió el spillover — **y que tienen rúbrica**.
3. **Misma rúbrica y mismo prompt que `Gate de relevancia`, a propósito:** si fuera otra, el
   `relevancia_score` de los que entran por acá no sería comparable con el del resto y la medición
   del norte ([ADR-089](./ADR-089-una-sola-metrica-aprobados-contra-lo-pedido.md)) mezclaría dos
   escalas.
4. **Si varios lo quieren, gana el que le puso más score** — mismo criterio que el dedup (ADR-018) y
   que el spillover.
5. **El candidato se clona con la identidad del proyecto NUEVO**: su `proyecto_id`, su voz, su score
   y su razón. Llegar con el proyecto que lo descartó sería peor que no entregarlo.

### 🔑 Por qué vive DENTRO de `Armar candidato` y no en un nodo propio

Es el único lugar que sabe **las dos cosas que hay que cruzar**: quién quedó sin dueño (sale del
corte) y cuánto cupo le queda a cada proyecto (`_entregados` contra `_nDe`). Un nodo aparte tendría
que **re-implementar el corte** para saberlo, y *dos implementaciones de la misma regla* es el error
que [plan-orden-y-filtro](../agents/plan-orden-y-filtro.md) ya dejó escrito.

**El costo de esa elección, dicho:** el nodo que decide la entrega pasa a hacer una llamada paga. Por
eso todo el escalón está envuelto en un **fail-open duro** (invariante #1 de PLAN §2.5): si Haiku se
cae, si el plan viene raro o si algo revienta, **la corrida entrega igual lo que ya tenía decidido**.
Con presupuesto de tiempo (`presupuesto_2da_s`, 120 s) y tope de pares (`cap_2da_pares`, 1.500),
mismo patrón que el gate.

## Lo que NO cambia

- 🔒 **Un video sale en UN solo proyecto** (ADR-018 + ADR-024 §Enm §2). Lo que cambia es **a cuántos
  se les pregunta**, no a cuántos se entrega.
- 🔒 **N sigue siendo techo exacto** (ADR-024).
- 🔒 **Sin guion no se juzga** (ADR-030).
- ⚠️ **Roza [ADR-019](./ADR-019-remocion-total-eje-keyword.md)**, que fijó al referente como único eje
  de descubrimiento, y hay que decirlo explícito: **esto no agrega un eje** (no scrapea nada, no
  busca cuentas nuevas), pero **desacopla *de quién vino* de *para quién sirve*.** El referente sigue
  siendo lo único que trae videos al sistema.

## 📏 Cómo se mide, que Mani pidió explícito

- **`metricas.segunda_oportunidad`** — videos distintos que entraron por acá, por corrida.
- **Por candidato y SIN migración:** `relevancia_razon` lleva el prefijo `[2da oportunidad] `, así que
  el norte de ADR-089 para este escalón sale de
  `where relevancia_razon like '[2da oportunidad]%'` cruzado con `calificacion`. Es la misma jugada
  con la que ADR-088 se midió sin columna nueva.

> 🔑 **El criterio escrito ANTES de mirar:** si `segunda_oportunidad` da **0 corrida tras corrida**,
> el escalón **no es la palanca** y hay que decirlo en vez de defenderlo. Y si entrega pero sus
> aprobados están muy por debajo de los del carril normal, está llenando N con relleno — que sube la
> cobertura y baja la precisión, y **ADR-089 juzga el producto de las dos**.

⚠️ **Su techo está limitado por algo que este ADR no toca:** el 01/09 murió el **98,7%** de los pares
en pisos + dedup **antes** de transcribir (3.306 → 42). El escalón 2 opera sobre lo que sobrevive a
ese muro, así que **su margen es chico mientras el muro esté donde está**. El desglose por motivo ya
está instrumentado (`metricas.filtrados_por_motivo`) y lo contesta la próxima corrida.

## Alternativas descartadas

- **Fan-out completo en `Asignar proyecto+voz`** (ofrecerle cada video a los 11 desde el arranque).
  Estructuralmente más simple y **descartada por Mani**: multiplica pre-trim y gate ~3× (~USD 0,4 por
  corrida, la transcripción no sube) y, sobre todo, **acerca los presupuestos de pre-trim y gate
  (600 s) al fail-open** — donde los videos pasan sin juzgar. Pagar 3× para juzgar peor.
- **Un nodo nuevo después de `Armar candidato`.** Necesitaría un segundo corte = dos
  implementaciones de la misma regla. Ver arriba.
- **Preguntar por TODOS los huérfanos aunque no haya cupo.** Gasto sin destino posible.

## Hecho cuando

Una corrida real reporta `metricas.segunda_oportunidad > 0` **y** el norte de ADR-089 sube en los
proyectos que recibieron por este camino. 🐤 **Canario:** nace en cero en toda corrida anterior, así
que el primer valor > 0 es del motor nuevo.
