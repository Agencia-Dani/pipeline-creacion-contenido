# Plan — La cascada de entrega: agotar lo bueno antes de aflojar

> **Estado: 4 de 5 escalones puestos. Falta el 4 (rellenar con los ya transcritos).**
> Este doc es el pendiente vivo del audit del 2026-09-01 (cierres 132, 133 y 134). Leerlo entero
> antes de tocar el motor. **Lo que falta son los escalones 2 y 4**, que son los que le dan trabajo
> a los de arriba antes de que el 5 tenga que actuar.

---

## §0 · El hallazgo ordenador

Mani lo dijo así el 01/09, corrigiendo la implementación de ADR-088:

> *"Eso de entregar los 6 rechazados no debe ser; solo quiero que no se marquen dedup, y que se
> revisen los otros rechazados de otros proyectos para todos los proyectos antes de irse
> (básicamente para que todo video tenga chance de matchear a un proyecto). Si no consigue nada, ahí
> pueden entrar los que ya fueron transcritos antes para rellenar si ahora tienen un score más alto
> o, en últimas, dejar pasar los siguientes N mejores para completar."*

**Llenar N no es una decisión, es una cascada de cinco**, y el orden es todo el diseño: cada
escalón sólo corre si el anterior no alcanzó. Lo que estaba mal no era *qué* hacía el motor sino
*cuándo*: **el escalón 5 disparaba de una, sin haber intentado el 2, el 3 y el 4.**

🔑 **Y hubo una razón estructural por la que salió así, que sigue explicando el diseño de hoy:
`Gate de relevancia` NO SABE cuánto falta para N.** El corte por N vive en `Armar candidato`, dos
nodos más abajo. Un gate no puede decidir "dejo pasar para rellenar" porque no tiene el número.
**El escalón 5 pertenece a `Armar candidato`, no al gate** — y ahí quedó (cierre 134).

---

## §1 · Los cinco escalones, uno por uno

### 🟢 Escalón 1 — Lo rechazado NO se marca en el dedup · **APLICADO**

**Qué es.** Un video que no llegó al Feed no se quema en `processed_items`, así que vuelve.

**Estado: hecho y en producción** ([ADR-087](../adr/ADR-087-la-memoria-recuerda-lo-que-se-entrego-no-lo-que-se-evaluo.md),
cierre 132). `Preparar procesados` cuelga de `Armar candidato`, o sea que sólo se quema lo entregado.

**Lo que lo hizo posible, y no es obvio:** la caché de ASR. Sin ella, dejar de quemar habría sido
re-pagarle a Supadata en cada corrida, para siempre. *Una memoria se puede mover río abajo cuando lo
que protegía ya está protegido por otra.*

📏 **El tamaño del problema que resolvió:** de 1.952 filas de `processed_items`, **1.401 (71,8%) eran
de videos que nunca vio nadie**.

---

### 🟢 Escalón 2 — Antes de irse, ofrecer el video a los DEMÁS proyectos · **APLICADO (ADR-091)**

> **Hecho el 2026-09-02** ([ADR-091](../adr/ADR-091-la-segunda-oportunidad-cross-proyecto.md), cierre
> 137), en el live. Vive **dentro de `Armar candidato`**: es el único nodo que sabe quién quedó sin
> dueño Y cuánto cupo queda. Se descartó el fan-out completo (3× pre-trim y gate, y acerca los
> presupuestos al fail-open). Se mide con `metricas.segunda_oportunidad` y el prefijo
> `[2da oportunidad]` en `relevancia_razon`. ⚠️ **Su techo lo pone otro muro:** el 98,7% de los pares
> muere en pisos + dedup antes de transcribir. Lo que sigue abajo es el diagnóstico original.
>
> 📏 **Medido contra las 2 primeras corridas reales post-deploy (cierre 140, 02/09 14:14 y 16:11):
> `segunda_oportunidad` dio 0 en las DOS.** Con solo 2 corridas es poco para descartarlo del todo —
> pero la lectura honesta, siguiendo el criterio ya escrito en el [handoff](./handoff.md), es: **hasta
> ahora no es la palanca de cobertura que se esperaba.** Se re-mide con más corridas antes de decidir
> si se abandona o si el escenario que lo activa (proyectos sin dueño con cupo libre) simplemente no
> se dio todavía en esas 2.

**Qué es.** Que todo video tenga chance de matchear con algún proyecto, no sólo con los que su
referente ya tiene linkeados.

**Por qué hoy no pasa.** `Asignar proyecto+voz` hace el fan-out **por referente**: un video se le
ofrece únicamente a los proyectos que reclaman a la cuenta que lo publicó. Un proyecto que no tiene
ese referente en su lista **nunca lo ve**, por más que el video le calce perfecto.

O sea que hoy la pregunta que se contesta es *"¿este video sirve para los proyectos de su
referente?"* y la que Mani quiere es *"¿este video sirve para ALGÚN proyecto activo?"*.

**Qué habría que construir.** Una segunda pasada del gate, después de la primera, sólo sobre los
videos que ningún proyecto se quedó, contra los proyectos que **no** los reclamaron.

**Costo.** Sólo Haiku: el transcript ya está pagado. `haiku_lote` = USD 0,004 por chunk de 25.
Con ~40 videos rechazados y 11 proyectos activos, el peor caso son ~18 chunks ≈ **USD 0,07**.
⚠️ **No medido:** cuántos videos quedan sin dueño por corrida. Hay que medirlo antes de dimensionar.

**Lo que hay que mirar antes de escribir código:**
- ✅ **Ya está anotado como pendiente en [ADR-022](../adr/ADR-022-loop-aprendizaje-criterios.md)**:
  *"la segunda oportunidad (al descartar con heat alto, preguntar si encaja en otro proyecto activo)
  queda anotada como variante quirúrgica para cuando haya >3 proyectos con criterios sanos"*.
  **Hoy hay 11 proyectos activos** ⇒ el disparador que esa ADR escribió **ya se cumplió**.
  Proponerlo es cobrar un pendiente, no abrir una discusión.
- 🔒 **NO rompe** la garantía dura de [ADR-024 §Enm §2](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)
  (*"un video sale en UN solo proyecto, siempre"*): sigue saliendo en uno. Lo que cambia es a
  cuántos se les pregunta.
- ⚠️ **Sí roza [ADR-019](../adr/ADR-019-remocion-total-eje-keyword.md)**, que fijó al referente como
  **único eje de descubrimiento**. Esto no agrega un eje nuevo (no scrapea nada), pero sí desacopla
  *"de quién vino"* de *"para quién sirve"*. **Merece decirlo explícito en la ADR nueva.**

**Pide ADR nueva.** Toca el motor, no `core/`.

---

### 🟢 Escalón 3 — Si nada matchea, no entra (y vuelve) · **APLICADO por el escalón 1**

No hay nada que construir: es la consecuencia del escalón 1. El video no entregado no se quema, así
que la corrida siguiente lo vuelve a traer y lo vuelve a juzgar — **gratis**, porque su transcript
está en la caché.

---

### 🟡 Escalón 4 — Rellenar con los ya transcritos, si ahora puntúan más alto · **PARCIAL**

**Qué es.** Un video que se pagó en una corrida vieja y no se entregó puede entrar hoy si su score
mejoró (criterios nuevos, proyecto nuevo, otro momento).

**Lo que YA funciona, y hay que entenderlo antes de construir de más:** ese video **vuelve solo**.
El scrape de Apify trae los `resultados_referente` (150) más recientes de cada cuenta en cada
corrida, y como el escalón 1 dejó de quemarlo, ahora **pasa el dedup y se re-evalúa**. Su transcript
sale de la caché ⇒ **cero costo de Supadata**. La re-puntuación es automática: el gate lo juzga de
nuevo con los criterios de hoy.

**Lo que NO funciona, y es el hueco real:** el video que **se cayó de la ventana del scrape**. Si
envejeció fuera de los 150 más recientes de su cuenta, o fuera de `dias_recencia` (200 días), Apify
no lo trae y **no hay nada que lo recupere** — su transcript está pagado y guardado, y el motor no
tiene forma de volver a ofrecerlo.

🔴 **Y el hueco es más profundo de lo que parece: el motor tira la METADATA de lo no entregado.**
El transcript sobrevive en `app.transcripciones` (ADR-087), pero `views`, `likes`, `referente`,
`thumbnail_url` y `seguidores` **sólo se persisten si el video llega a `app.candidatos`**. Sin
metadata no hay heat-score ni tarjeta ⇒ **un baúl de videos pagados no se puede armar hoy aunque se
quiera.** (`app.videos_meta` existe pero la llena el cockpit a pedido, no el motor —
[ADR-072](../adr/ADR-072-el-guion-crudo-de-un-video-viene-de-donde-este.md).)

**Antes de construir nada, medir:** ¿cuántos videos pagados se caen de la ventana por corrida? Si es
un puñado, este escalón no vale una tabla nueva. **Es una pregunta que hoy no está contestada.**

---

### 🟢 Escalón 5 — Dejar pasar los siguientes N mejores · **APLICADO, Y AHORA EN SU LUGAR**

**Qué es.** Como último recurso, completar N con los que el gate habría vetado.

**Qué se hizo, en dos movimientos del mismo día:**

1. [ADR-088](../adr/ADR-088-el-gate-ordena-no-veta.md) (cierre 133): `relevante: false` dejó de
   descartar. El `composite` sigue ordenando y `sin_guion` sigue vetando.
2. [ADR-088 §Enmienda](../adr/ADR-088-el-gate-ordena-no-veta.md) (cierre 134): **el corte de
   `Armar candidato` pasa a tener dos escalones.** Cada proyecto llena su N con los aprobados (PISO
   primero, después heat) y **recién si quedó corto** completa con los `_bajo_umbral`, por heat y
   **sólo por lo que falta**. Es lo que Mani señaló: *"eso de entregar los 6 rechazados no debe
   ser"*.

```
Armar candidato:
  1. llenar N con los aprobados (_bajo_umbral !== true), por composite   ← lo de siempre
  2. ¿quedó corto?  → recién ahí, completar con los _bajo_umbral         ← el escalón 5
  3. lo que sobra   → no se entrega y NO se quema (escalón 1)
```

🔑 **Dos puertas de atrás por las que la prioridad se anulaba sola, y no eran obvias:**

- **El dedup del fan-out.** Haiku devuelve `relevante` y `score` **por separado**, así que un
  `relevante:false` con score 0,7 existe y le ganaba la copia a un `relevante:true` con 0,5 — con lo
  cual el video caía en la **reserva** de P1 en vez del **cupo** de P2, que sí lo quería. La
  prioridad del fan-out ahora es *(1) aprobado, (2) relevancia, (3) heat*.
- **El spillover.** Dos sobrantes peleando el último cupo de otro proyecto se ordenaban sólo por
  heat, así que un bajo-umbral viral le ganaba el asiento a un aprobado por la puerta de atrás.

**El PISO (ADR-017) NO re-aplica sobre la reserva**, con la misma frase con la que ya no re-aplica
en el spillover: *es relleno marginal, no redistribución.*

📏 **Y la métrica que el cambio de forma habría dejado mintiendo:** `metricas.bajo_umbral` cuenta lo
**ADMITIDO** por el gate, que hasta el cierre 133 era lo mismo que lo entregado. Ya no: el gate
admite todo y el corte usa la reserva sólo si hace falta. Se agrega
**`metricas.bajo_umbral_entregados`**. Sin eso, `bajo_umbral: 40` se seguiría leyendo como *"40
dudosos en el Feed"* cuando pueden ser 2 — el mismo modo de falla que el cierre 129 le encontró a
`haiku_lotes_pretrim`.

🔑 **Y ese contador es el que dice si este escalón importa:** si sale **0 en varias corridas**, el
escalón 5 es una red que nadie usa y el cuello está donde dice el §5 — en el supply, no en el corte.

**La válvula sigue siendo un knob y no un rollback:** `Relevancia mínima` en ~0,55 restaura el veto
viejo sin tocar código. Al 01/09 está en **0**, y con el escalón en su lugar **eso ya es lo
correcto**: el bajo-umbral no entra si no hace falta.

---

## §2 · Estado de todo lo hablado en la sesión del 2026-09-01

### ✅ Aplicado y verificado

| Qué | Evidencia |
|---|---|
| **Migración `037`** — `origen`, `descartes.external_id`, RPC `cache_transcripts` | 5 señales: `transcripciones = manual = 130` · `motor = 0` · `descartes_con_id = 0` · `has_function_privilege = true` (service_role y authenticated) · la RPC por el camino real del motor devuelve **200 con 3 filas**, y `[]` para un id inventado |
| **Caché de ASR** — el motor escribe y lee `app.transcripciones` | `test-nodos.mjs`, 10 casos: hit con guion, hit mudo, miss, id ajeno, `pendiente` no cuenta, error de la RPC, RPC caída, lote mixto |
| **`processed_items` = sólo lo entregado** | guard duro por presencia de `_entregado`; el test lo cazó cuando lo escribí mirando el valor |
| **`app.descartes.external_id`** | ya no hay que decodificar el shortcode desde la URL |
| **Motor en el live** | 40 nodos, activo, `n8n:diff` **verde en los 5** |
| **App: 5 filtros `origen='manual'`** | typecheck · 494 tests · build · pusheado |
| **ADR-088 (gate ordena)** | en el live · `test-nodos.mjs` **199 checks** |
| **ADR-088 §Enmienda (escalón 5 en su lugar)** | `test-nodos.mjs` **207 checks**, y **7 de los 8 nuevos se ponen ROJOS contra el `workflow.json` de HEAD** (corridos contra el código viejo a propósito) · auditor sin hallazgos · validador 2605/0 |

### 🔴 Pendiente, en orden de retorno

| # | Qué | Dónde | ¿ADR? |
|---|---|---|---|
| ~~1~~ | ~~**Escalón 5 al lugar correcto**~~ | ✅ **hecho** (cierre 134, ADR-088 §Enmienda) | — |
| 1 | **Escalón 2** (segunda oportunidad cross-proyecto) — 🔑 **ataca COBERTURA, que es el factor que muerde** (ADR-089). Mani, 01/09: *"es clave; toca hacer seguimiento de si esto sirve o no"* ⇒ **entra con su instrumentación o no entra** | motor | **sí, nueva** |
| 2 | **Medir el escalón 4** (¿cuántos pagados se caen de la ventana?) | SQL | no |
| 3 | **Las mediciones que ya están escritas** (§4) | SQL, tras una corrida real | no |
| 4 | **T0 del audit: knobs y datos, cero código** | cockpit | no |
| 5 | **T2a: partir las 4 responsabilidades de `Heat-score v1`** | motor | no |
| 6 | **T2b: pisos como insumo del score + repartir `cap_top_n` por proyecto** | motor | **sí** (ADR-044 lo dice literal) |
| 7 | **T3: Grado 2 de ADR-013** (dedup por proyecto para lo ENTREGADO) | `core/` | **sí** |
| 8 | **T1: publicar la anatomía** en `dev-doc.md` | docs | no |
| 9 | **Instrumentación del §9 del audit** | motor + app | parcial |

**Detalle del #4 (T0), que es lo único que se puede hacer sin escribir una línea:**
- Bajar **`Afinidad mínima de propuesta` de 0,60 a 0,45** y correr *Buscar cuentas nuevas*.
  Las 8 propuestas de toda la historia van de 0,60 a 0,75 ⇒ **el piso muerde exacto**, y hay
  **cero propuestas desde el 20/07**. 🕳️ **No se midió** si el buscador no encuentra o si el piso se
  come todo.
- **Decidir las 5 propuestas** que llevan 6 semanas en `propuesto`. Es supply esperando un clic.
- **Podar los referentes de tasa 0%**: `thejessicaweiss` **0 aprobados de 26**, `jen_gottlieb` 0 de 5,
  `nicholascrown` **0 candidatos y 21 descartes**, `abeteddymaruta` 1 de 8.
  ⚠️ ADR-022 fija que **la poda es del equipo**, no automática ⇒ va con Dani, no por SQL.

**Detalle del #9 (instrumentación):**
- Partir el contador del paso pre-trim→heat-score: hoy `filtrados` mezcla **dedup + `min_views` +
  `min_likes`** en un solo número, y de los **3.264 muertos** ahí no se sabe cuál filtro los mató.
  *Sale gratis si se hace el #6.*
- `oferta_nueva` = videos nuevos / colectados. Contesta *"¿vale la pena correr otra vez hoy?"* — la
  pregunta que el 09-01 se contestó mal **dos veces**.
- `entregados / pedidos` por proyecto **ya se calcula** (`Resumen del run`) y Entender **no lo muestra**.
- **Proyecto salteado por voz apagada** sale por `console.log` y no llega a `runs.metricas.avisos`.
  Operar sí lo lista; **Entender lo lee como "nadie lo calificó"** cuando la verdad es "nunca corrió".
- `descartes_expuestos` **se lee y no se renderiza** (`lib/entender.ts:40`).

---

## §3 · Lo que NO se toca, y por qué

Tres invariantes bloquean cambios sin ADR nueva. **No re-litigar:**

1. **Un video sale en UN solo proyecto** (ADR-018 + ADR-024 §Enm §2). El argumento es de **cupo
   humano**, no técnico: dos copias del mismo guion *"son ruido que les come el cupo de
   calificación"*. El escalón 2 **no** lo rompe.
2. **N es un techo exacto, la entrega es best-effort** (ADR-024, 030, 038, 043).
3. **El gate sólo juzga lo que tiene transcript**; sin guion es descarte duro (ADR-030).

Y dos cosas **ya cerradas** que no hay que reabrir:
- **Re-pesar el heat-score.** ROADMAP §5 punto 2: barrido sobre 217 videos etiquetados, **AUC 0,706**,
  techo ≈0,71. *"Las mejoras tienen que venir de señales nuevas, no de re-pesar."*
  🕳️ **Sigue cerrado, pero con una grieta abierta el 01/09:** ese 0,706 se parece mucho a los AUC
  **globales** del §6.bis —los que resultaron ser confounder de proyecto— y **no consta que se haya
  estratificado**. No es permiso para re-pesar; es permiso para **re-medir el cierre** antes de
  citarlo otra vez.
- **El "modo reponer"** (correr el motor otra vez si entregó poco). ADR-030 lo descartó por escrito:
  *"mismo pool, doble costo, cero candidatos nuevos"* — y el 01/09 se confirmó **dos veces**.

---

## §4 · Las mediciones pendientes, escritas antes de mirarlas

> ✅ **Actualización del cierre 140 (02/09):** esta sección decía "0 corridas desde el push" y dejó de
> ser cierto el mismo día — el equipo corrió 2 veces (14:14 y 16:11). El norte ya se midió: **80,0% y
> 76,0%** (ambas con cobertura de calificación casi completa, o sea resultado y no piso), muy por
> encima del techo anterior de 45%. **Nueva línea base: 76%.** El detalle completo, con las 4
> consultas del handoff, vive en el [cierre 140](./handoff.md).

**Ninguna corrió todavía: al 2026-09-01 23:xx hay 0 corridas desde el push.** Los dos canarios
nacen en cero por definición, así que su primer valor ya es uso real.

```sql
-- 1) ADR-087: ¿la caché ahorra? (canario, nace en 0; la primera fila la escribe el motor)
select count(*) from app.transcripciones where origen = 'motor';

-- 2) ADR-087: ¿la memoria dejó de inflarse?
--    processed_items no debería crecer más rápido que candidatos + outputs
select (select count(*) from public.processed_items) as memoria,
       (select count(*) from app.candidatos) + (select count(*) from public.outputs) as entregados;

-- 3) ADR-088: ¿el veto servía? LA que puede revertir el escalón 5
select (relevancia_score < 0.55) as habria_sido_vetado,
       count(*) filter (where calificacion is not null) as calificados,
       count(*) filter (where calificacion in ('🔥','👍')) as aprobados
from app.candidatos where creado_en > '<primera corrida con ADR-088>'
group by 1;
```

🧭 **Antes que las cuatro, el norte ([ADR-089](../adr/ADR-089-una-sola-metrica-aprobados-contra-lo-pedido.md)):
`aprobados / N pedido`, por proyecto y por corrida**, con `calificados/entregados` al lado para saber
si el número es resultado o piso. Las de abajo son **diagnóstico de por qué el norte da lo que da**,
no evidencia de que un cambio sirvió. 📏 Línea base medida el 01/09 sobre las 5 corridas con
`run_id`: el techo era **45% del pedido** (31/08 17:22 — Ansiedad 90%, Depresión 60%) y en **14 de 21**
proyecto × corrida el motor **ni llena N**.

✅ **Superada el 02/09 (cierre 140, ver [handoff](./handoff.md)).** Las 2 corridas post-deploy dieron
**80,0%** (Comunicación en empresas, 15/15 calificados) y **76,0%** (Comunicación de parejas, 49/50
calificados) — ambas con cobertura de calificación casi completa, ergo **resultado y no piso**. Una
tercera corrida (Comunicación en empresas otra vez, 16:11) dio 46,7% pero con solo 47% de cobertura —
ese número todavía puede subir, es un **piso**. 📏 **Nueva línea base a superar: 76%.**

**Y una cuarta de diagnóstico, que no necesita SQL y sale de `runs.metricas` de la primera corrida:**
**`bajo_umbral_entregados`** (cierre 134). Es la que dice si el escalón 5 sirve de algo: cuenta lo
que hizo falta para llenar N, no lo que el gate admitió. 🔑 **Si sale 0 en varias corridas, el
escalón 5 es una red que nadie usa** y el cuello está donde dice el §5 — en el supply.

✅ **Medido el 02/09 (cierre 140): dio 0 en las 2 corridas.** Con 76-80% de aprobación el corte normal
llenó N solo — es la lectura buena, no un escalón roto. Sigue siendo poco (2 corridas) para declarar
que el escalón 5 nunca hace falta; se re-mide cuando una corrida real quede corta de N.

> **La métrica de éxito NO es la obvia.** No *"cuántos entregó"* sino **cuántos 🔥/👍 ABSOLUTOS por
> corrida**. Medir precisión premiaría al sistema por entregar menos.

**Criterio escrito antes de medir (3):** si los *habría sido vetado* aprueban **~0%**, el veto tenía
razón ⇒ subir `Relevancia mínima` y el escalón 5 queda como red de último recurso. Si aprueban
**30% o más**, se estaban tirando videos buenos.

### 🔴 Lo que queda pendiente para la próxima sesión (cierre 140), en orden de efecto

1. **Medir el escalón 4** — cuántos videos pagados se caen de la ventana del scrape. Sigue sin
   hacerse; es la única de las 4 mediciones de arriba que ninguna corrida contestó todavía.
2. **Activar las 3 voces restantes** (Vieira, Sánchez, Gomez) — clics, cero código. Es la palanca de
   cobertura más barata: `Milena Morales` sola ya produjo las 2 corridas que dieron 76-80%.
3. **Podar/decidir las 6 cuentas y las 5 propuestas** — con Dani, ADR-022 lo fija así, no por SQL.
4. ~~Llevar el norte a la pantalla Entender~~ ✅ **hecho el 02/09** — ADR-089 "hecho cuando" #1
   cumplido. Detalle en el [handoff](./handoff.md).
5. **Los dos modos cantidad/calidad** (§8, abajo) — las 2 corridas nuevas no alcanzan para diseñar el
   dial; sigue **NO decidido**.

---

## §5 · El cuello que nada de esto arregla

📏 **~40 referentes publicando ~1 reel/día ≈ 40 videos nuevos/día**, contra una demanda de **265**
(11 proyectos × su N). Para la voz de psicología son ~12-14/día, y la corrida del 01/09 encontró
**14**, todos de **una sola cuenta**.

**Toda la cascada de este doc reparte mejor lo que hay. No crea oferta.** La palanca de oferta es el
catálogo, y la varianza entre cuentas es brutal: `the.pocket.psychologist` **43 aprobados de 43**,
`thejessicaweiss` **0 de 26**.

✅ Y no es un hallazgo nuevo: [ADR-082](../adr/ADR-082-un-video-quemado-se-rescata-borrandole-la-memoria.md)
ya lo había escrito — *"11 cuentas de 40 ponen el 94% del supply… **esto explica el «trae pocos
videos» mejor que la ráfaga**. Anotado, no resuelto acá."* Sigue anotado y sigue sin resolver.

---

## §6 · Cómo retomar

1. Leer este doc, después el **cierre 133** y el **132** del [handoff](./handoff.md).
2. Estado del sistema en 30 segundos:
   ```bash
   cd core/scripts && npm run n8n:diff          # ¿el live corre lo que dice el repo?
   node ../../Workflows/workflow-short-form-content/test-nodos.mjs   # 199 checks
   ```
3. ⚠️ **Antes de correr el motor:** las **4 voces están en `activo = false`** (al 01/09), así que el
   plan sale con **0 proyectos**. *(El aviso de "poner `Relevancia mínima` en ~0,55 primero" ya no
   aplica: el escalón 5 está en su lugar desde el cierre 134, así que el bajo-umbral no entra si no
   hace falta. El knob sigue siendo la válvula si el Feed queda ruidoso igual.)*
4. Empezar por el **#1 de §2**, que ahora es el **escalón 2** (segunda oportunidad cross-proyecto).
   ⚠️ **Pide ADR nueva** y su §1 trae lo que hay que mirar antes de escribir código — incluida la
   medición que falta: **cuántos videos quedan sin dueño por corrida**, que hoy nadie contó.

---

## §6.bis · Tres pendientes sueltos que no entran en la cascada

**1. 🕳️ El gate juzga sobre 1.500 caracteres, y nadie midió qué cuesta.**
`Gate de relevancia` trunca el transcript a **1.500 chars** antes de mandárselo a Haiku
(`.slice(0, 1500)`), mientras `Transcribir` guarda hasta **6.000**. Un reel de 2-3 minutos supera
holgado los 1.500 ⇒ **una parte del catálogo se juzga por su primer tercio.** Experimento barato:
re-juzgar una muestra con el transcript completo y comparar veredictos. Podría explicar parte del
ruido del punto 2.

**2. 🩸 ESA TABLA ESTABA CONFUNDIDA Y APUNTABA AL REVÉS — corregida el 01/09.**
Este renglón decía que `relevancia_score` *"casi no predice el veredicto humano"* (0,218) contra
`log(views)` (0,493), y ése era el **argumento #2 de ADR-088**. Es **falso**, y lo destapó Mani
preguntando por qué el escalón 5 rellena por heat.

La tabla vieja era **correlación de Pearson global**, con dos defectos que la invierten: el
**confounder de proyecto** (`Ansiedad` aprueba 83% de lo calificado, `Comunicación de parejas` **0 de
27**, así que cualquier señal que varíe por cuenta hereda esa diferencia sin saber nada del video) y
**Pearson sobre variables de cola pesada**. Medido con **AUC** (0,5 = moneda al aire) y
estratificando:

| señal | global (11.040 pares) | dentro del proyecto (1.106) | mismo proyecto **y misma cuenta** (130) |
|---|---|---|---|
| **`relevancia_score`** | 0,630 | **0,717** | **0,638** |
| `engagement` | **0,765** | 0,674 | 0,527 |
| `log(views)` | 0,703 | **0,407** | 0,500 |
| `seguidores` | 0,610 | **0,311** | 0,604 |
| **`heat_score` (composite)** | **0,583** | 0,658 | **0,523** |

🔑 **Las métricas son señal de CUENTA, no de video.** Dentro del proyecto, `log(views)` (0,407) y
`seguidores` (0,311) predicen **rechazo** —replicado en los 3 proyectos que ponen 1.045 de los 1.106
pares, ninguno por encima de 0,5— y dentro de la **misma cuenta** todas se evaporan a 0,50–0,60.
**La única que sobrevive las tres estratificaciones es `relevancia_score`**, y está **subestimada**
porque sólo se mide sobre los que pasaron el gate (rango restringido baja el AUC): 0,638 es un piso.

⇒ **La palanca métrica es podar y sumar referentes, no re-pesar una fórmula** (ADR-082 y el T0 otra
vez, ahora con mecanismo). Y **el `composite` es 0,523 a nivel video**: diluye su única señal buena
con 30% de percentil métrico que no aporta nada.

El detalle entero, con qué se cae y qué NO se cae de ADR-088, está en
[ADR-088 §Enmienda 2](../adr/ADR-088-el-gate-ordena-no-veta.md).

✅ **Decidido y aplicado el mismo día como [ADR-090](../adr/ADR-090-la-metrica-no-rankea-videos-desempata.md):**
`peso_relevancia` **0,7 → 1**. El hallazgo que lo volvió binario: `relevancia_score` toma **27
valores** con paso **0,01**, así que el 30% métrico **no rankea, desempata** — y para ser desempate
estricto haría falta `peso > 0,990`. **No hay punto medio.** Y el Feed ordena por `heat_score`
igual que el corte, así que un solo valor arregla las dos superficies. 🕳️ **Pero sí obliga a re-mirar el cierre de "re-pesar el heat-score"** (ROADMAP §5
punto 2, AUC 0,706, techo ≈0,71): ese 0,706 se parece mucho a los números **globales** de arriba y
**no consta que se haya estratificado**. *Un obstáculo escrito se re-mide.* Y sigue en pie que hay
señales gratis sin usar: `duracion_seg` (se guarda desde ADR-086 y **no la lee nadie**),
comentarios, y el formato del video.

**3. 📄 Deuda de doc.** La fila de **ADR-085 en `docs/adr/README.md` tiene texto de ADR-084 pegado
adentro** (dice *"es el ADR nuevo sobre compensar la memoria"*, que no es suyo). Pre-existente al
audit, no se tocó.

---

## §6.ter · Dónde vive el audit completo

Este doc es **el pendiente**, no el diagnóstico. El audit entero —embudo etapa por etapa, los
**9 componentes lógicos** del motor con los factores que mueve cada uno, el **mapa de elasticidad**
(si muevo esto, qué pasa con oferta/costo/calidad), los **18 puntos donde muere un video** con su
columna de *permanente vs reversible*, la salud por referente y la economía por corrida— vive en dos
lados **fuera del repo**:

- **Artifact publicado (para compartir con el equipo):**
  https://claude.ai/code/artifact/f6c6d1c3-2cf8-4e7e-8ec9-d144439b7ab8
- **El informe largo**, en el plan de la sesión del 01/09 (`~/.claude/plans/`, máquina de Mani).

🔴 **Pendiente #9 del §2: llevar la anatomía (§2 y §2.bis de ese informe) a
[`dev-doc.md`](./dev-doc.md)**, que hoy es nodo-por-nodo y **no tiene la vista de componentes**.
Mientras no se haga, el mejor mapa del motor no está en el repo.

---

## §8 · Candidato: los dos modos (cantidad / calidad) — **idea de Mani, 2026-09-02, NO decidido**

> Mani: *"¿qué pasa si el workflow tuviese dos modos? Uno muy fiel a la cantidad que estoy pidiendo…
> y otro de calidad, que se enfoca en ponerle los pisos duros y buscar unos que tengan muchos likes,
> muchos views… que el equipo de redes sepa que si lo ejecutan con eso, es muy seguro que les lleguen
> menos videos."* Y su propio timing: **después** de aplicar todo lo de este plan.

### 🔑 Lo que vale de la idea NO es el mecanismo: es la expectativa

**Los dos modos ya existen y son presets de perillas, no un refactor.** Modo cantidad = `Mínimo de
vistas` bajo + `Relevancia mínima` 0 + el escalón 5 rellenando. Modo calidad = pisos altos +
`Relevancia mínima` arriba. Todo eso **ya corre**.

Lo que **no** existe es que el equipo **sepa qué está eligiendo**. Hoy el trade-off vive escondido en
perillas que nadie entiende, y cuando llegan 13 de 100 nadie sabe si fue el sistema, el catálogo o
una decisión. **Un modo con nombre comunica; una perilla no.** Ese es el aporte real.

### 🔴 El defecto de la idea tal como está descrita

*"Pisos duros, muchos likes, muchos views"* está construido sobre **la señal que ya medimos que no
sirve a nivel video** ([ADR-088 §Enmienda 2](../adr/ADR-088-el-gate-ordena-no-veta.md)): dentro de un
proyecto, `log(views)` da **0,407** y `seguidores` **0,311** —predicen RECHAZO— y dentro de la misma
cuenta se evaporan. **Un modo calidad hecho con views/likes entregaría MENOS y NO mejor:** subiría el
*tamaño de la cuenta*, no la calidad del video.

El ingrediente correcto ya existe: **`Relevancia mínima`** (0,638–0,717, la única que sobrevive las
tres estratificaciones). *Modo calidad = esa perilla en ~0,7, no `Mínimo de vistas` en 500k.*

### 💰 Y no cuestan igual, que era la duda de Mani

| se construye con | dónde corta | costo |
|---|---|---|
| Pisos (`min_views`) | **antes** de transcribir | **más barato** — se transcribe menos |
| `Relevancia mínima` | **después** de transcribir | **mismo costo**, menos entregado |

🔑 **La señal buena es la cara.** El modo calidad que de verdad funciona **paga lo mismo** que el de
cantidad y entrega menos; el que ahorra plata es justamente el que usa la señal que no discrimina.

### ⚖️ La objeción de fondo: ADR-089 ya castiga las dos puntas

El norte es `aprobados / N` = **cobertura × precisión**. Cantidad puro baja precisión; calidad puro
baja cobertura. **La métrica que ya elegimos dice que el óptimo no está en ninguna punta**, y un
switch le pide al equipo elegir una punta.

### Si se hace, dos correcciones de forma

1. **Por proyecto, no global.** El supply falla por proyecto (Ansiedad llena su N, Trading Psychology
   no): un modo global le aplica la misma medicina al que sobra y al que no llega. Cada proyecto ya
   tiene su N.
2. **Como PRESETS con su efecto escrito al lado, no como modos.** Cero refactor, reversible, y
   comunica igual. Si con dos o tres corridas resulta que el dial es real, ahí se promueve.

### ⏳ Por qué no ahora, y es más fuerte que "después de los cambios"

**No hay datos para diseñar el dial:** al cierre 140 hay **2 corridas** con la instrumentación nueva
(80,0% y 76,0% de norte), y **2 sigue siendo poco** para ubicar dónde está hoy el punto
cantidad↔calidad — sobre todo porque las dos son del mismo proyecto/franja horaria. Diseñar el
control sin más variación entre corridas es adivinar igual que antes. 🗣️ Del panel, la voz que disiente
(Howard Marks): *"todos asumen que existe un dial cantidad↔calidad; sus propios números no muestran
que exista. Están por construir el control de una palanca que quizá no está conectada a nada."*

---

## §7 · Sesión aparte, a pedido de Mani

**Research de herramientas, adiciones y alternativas** para las capas que ya existen: scraping
(Apify y competencia), ASR (Supadata vs otros), el modelo del gate/pre-trim, y descubrimiento de
referentes. Sale del audit con dos preguntas ya formuladas:

- **¿Hay un scraper que cobre por *delta* y no por catálogo completo?** Hoy el scrape es el **88% del
  costo de la corrida** y se paga entero aunque el 98,8% de lo que trae ya se haya visto.
- **¿Hay una fuente de descubrimiento que no dependa de que un humano tipee handles?**
