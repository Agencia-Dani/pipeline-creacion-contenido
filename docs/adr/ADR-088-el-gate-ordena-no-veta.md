# ADR-088 — El gate ordena, no veta

- **Estado:** propuesta — 2026-09-01 (con Mani, continuando la auditoría de ADR-087).
  **Enmienda [ADR-021](./ADR-021-medicion-desempeno-embudo.md) y [ADR-030](./ADR-030-descarte-duro-sin-transcript.md)**,
  que daban por sentado que el gate descarta. **No toca `core/`, sin migración, sin cambio de schema.**

## Contexto

Mani, después de ver el embudo: *"llenar el pedido con los top N videos y ya, no descartar si no
son suficientemente buenos según la herramienta"*.

### 📏 El contrafactual, medido sobre 12 corridas

Se puede simular exacto, porque `llamadas.supadata` = videos distintos que llegaron a transcribirse
= el pool real disponible en el momento del gate. Entrega top-N = `min(disponibles, ΣN)`:

| | |
|---|---|
| Entregado de verdad | **417** |
| Habría entregado el top-N | **649** |
| **Diferencia** | **+232 videos (+56%)** |

En 8 de las 12 corridas habría entregado más. En 2 no cambia nada: una porque el corte por N ya
mordía (288 disponibles para 80 pedidos), otra porque **sólo había 14 videos nuevos** — el cuello de
esa corrida era el supply, no el gate, y este ADR no lo toca.

### 🔑 Los tres argumentos, en orden de peso

1. **Vetar no ahorra un centavo.** El gate corre **después** de `Transcribir` y `Traducir`: cada
   video que rechaza **ya se pagó** (~USD 0,014) y —hasta ADR-087— ya estaba quemado en la memoria.
   Descartarlo no recupera plata ni cupo. Sólo achica la entrega.
2. **La señal que vetaba es la más débil que hay.** Sobre los 211 candidatos calificados, la
   correlación con el veredicto humano es **0,218** para `relevancia_score` contra **0,493** para
   `log(views)` — el filtro caro decide peor que un dato que llega gratis. Y por tramos **no es
   monótona**: el tramo 0,80–0,84 aprueba 38,9% y el 0,60 aprueba 50%.
3. **El humano ya es el filtro, y funciona.** De 211 calificados, **96 son 👎 (45,5%)**. El equipo ya
   descarta. El gate era un **segundo filtro, redundante, más caro y no auditable**.

### ⏳ Por qué AHORA y no antes

Hasta ADR-087, un video que quedaba afuera por cupo **se quemaba igual** y no volvía nunca. Sin esa
pieza, "entregar los top-N" seguía perdiendo todo lo que no entraba. Con la memoria arreglada, lo
que no entra **vuelve la próxima corrida y vuelve gratis**. Es el mismo patrón que ADR-087: *una
decisión se habilita cuando lo que la bloqueaba ya está resuelto.*

## Decisión

**`relevante: false` deja de descartar.** Sigue existiendo como señal —viaja, se cuenta y ordena—
pero pierde el poder de veto.

1. **`kept` = todo lo que tiene guion.** El video que Haiku marcó irrelevante entra al Feed.
2. **El `score` sigue haciendo lo suyo: ordenar.** El `composite` (`0,7 · Haiku + 0,3 · métrica`) no
   cambia, así que un dudoso queda naturalmente abajo. **No se fuerza un orden por grupo** — ver
   Alternativas.
3. **`sin_guion` sigue vetando** (ADR-030). Un video sin transcript no se puede juzgar ni limpiar.
4. 🔧 **`MIN_REL` pasa a ser el único veto, y con eso `Relevancia mínima` deja de ser un knob
   inerte.** Estaba en 0 y no filtraba nada, mientras el descarte real lo decidía un booleano que
   ninguna perilla tocaba: **quien lo movía creyendo que aflojaba el filtro, no aflojaba nada.**
   Ahora el nombre dice la verdad, y es la válvula de escape si el Feed queda muy ruidoso.
5. **Se cuenta lo admitido:** `metricas.bajo_umbral` = videos distintos que el gate viejo habría
   tirado. Es la métrica que decide si el veto servía.

### El prompt NO cambia

Sigue diciendo *"jurado ESTRICTO… ante la duda marcá `relevante:false`"*. A propósito: eso afecta al
booleano, no al `score`, y tocarlo movería la distribución de scores **rompiendo la comparabilidad
con las 422 filas históricas** justo cuando hay que medir si el cambio sirvió.

## Consecuencias

**A favor**
- +232 videos medidos sobre 12 corridas, **a costo cero**.
- La auditoría de descartes **mejora**: hasta hoy `app.descartes` guardaba **10 por corrida**
  (`cap_descartes`) y tenía **152 de 154 filas sin auditar**. Ahora todo lo juzgado entra a
  `app.candidatos` **con su `relevancia_score`**, así que la pregunta *"¿el gate mataba cosas
  buenas?"* se contesta con un `select` cruzando score contra `calificacion` — sin pantalla nueva y
  sin que nadie tenga que auditar nada.
- `Relevancia mínima` deja de mentir.

**En contra, dicho sin maquillar**
- 📉 **La calidad promedio del Feed baja.** Los que entran ahora tienen score 0,00–0,50; los de
  siempre 0,60–0,96. **El 👎 del equipo va a subir**, y eso es esperado, no un fallo.
- ⏱️ **Cuesta atención, que es el recurso escaso real**: hay **211 candidatos sin calificar de 422**.
  Entregar más sin que nadie los mire no es una mejora. Si el Feed se vuelve impracticable, la
  reacción correcta es subir `Relevancia mínima`, no revertir esto.
- 🔕 **`app.descartes` queda dormida** (con `MIN_REL = 0` no le llega nada). Los nodos siguen ahí y
  vuelven a la vida si alguien sube el knob. `v_auditoria_descartes` va a mostrar 0 expuestos, que
  es **honesto**: no se está descartando nada.

> **Métrica de éxito, y no es la obvia:** no *"cuántos entregó"* sino **cuántos 🔥/👍 ABSOLUTOS por
> corrida**. Si suben los aprobados en términos absolutos, el cambio sirve aunque la precisión baje.
> Medir precisión acá premiaría al sistema por entregar menos.

## Alternativas descartadas

- **Forzar que los bajo-umbral queden siempre debajo de los aprobados.** ⚠️ **Superseded en parte
  por la §Enmienda de abajo, y conviene leer las dos:** lo que sigue en pie es el **orden** (nada
  re-rankea el Feed); lo que cambió es la **elegibilidad** (un bajo-umbral no consume un cupo que un
  aprobado podía usar). Suena obvio y **la medición lo desaconseja**: con `relevancia_score` correlacionando 0,218 y las métricas 0,493, forzar el
  grupo **privilegia la señal más débil**. Un video viral que Haiku creyó off-topic puede ser mejor
  apuesta que un on-topic con 20 mil vistas. El `composite` ya mezcla las dos en la proporción que
  ADR-030 fijó; que decida él.
- **Marcar los bajo-umbral en el Feed con una columna nueva.** Es lo que pide el instinto y se
  **difiere a propósito**: hoy sería mostrarle al equipo, como autoritativa, una señal que predice
  su propio veredicto con 0,218 — podría hacerles saltear videos buenos. Primero se mide
  (`relevancia_score` ya se persiste por candidato), después se decide. *Medir el martes no autoriza
  a marcar el jueves.*
- **Borrar el gate.** El `score` sigue siendo el 70% del orden del Feed y es lo que hace que lo
  dudoso quede abajo. Lo que sobraba era el veto, no el juicio.
- **Bajar `cap_descartes` o retirar `app.descartes`.** No hace falta: con `MIN_REL = 0` la tabla
  simplemente deja de recibir, y si alguien sube el knob vuelve a funcionar sin tocar nada.

## Toca

`Gate de relevancia` (el filtro `kept` + la marca `_bajo_umbral`) y `Resumen del run`
(`metricas.bajo_umbral`). Probado en `test-nodos.mjs` (**199 checks**, 7 nuevos: que el rechazado
entra, que va marcado, que el aprobado no, que el score sigue ordenando, y las dos puntas de
`MIN_REL`).

⚠️ *Este párrafo decía **"nada más: `Armar candidato` ya cortaba a N por `composite`"** y era el
error del ADR, no una imprecisión: **ahí** estaba el nodo que faltaba tocar. Ver la §Enmienda.*

## ✅ Enmienda APLICADA (2026-09-01, mismo día) — el escalón sólo dispara si N quedó corto

Mani, al ver la implementación: *"eso de entregar los 6 rechazados no debe ser"*. Tenía razón, y el
error era de **momento**, no de dirección.

Este ADR es **el último escalón de una cascada de cinco** ([plan-cascada-de-entrega.md](../agents/plan-cascada-de-entrega.md)),
y disparaba **siempre** en vez de sólo cuando N quedaba corto.

🔑 **La razón estructural por la que salió así: `Gate de relevancia` no sabe cuánto falta para N.**
Ese número es `_nDe(pid)` y sólo existe en `Armar candidato`, dos nodos más abajo. Un gate no puede
decidir *"dejo pasar para rellenar"* porque no tiene el número — **el condicional nunca pudo vivir
en el gate.**

**Lo que cambia, y es todo en `Armar candidato`:** el corte por proyecto pasa a tener **dos
escalones**. Cada proyecto llena su N con los aprobados (PISO primero, después heat, como siempre) y
**recién si quedó corto** completa con los `_bajo_umbral`, por heat y **sólo por lo que falta**. Lo
que sobra no se entrega y **no se quema** (ADR-087), así que vuelve gratis la próxima corrida.

**Y hay dos puertas de atrás por las que la prioridad se anulaba sola**, las dos cerradas acá:

1. **El dedup.** Haiku devuelve `relevante` y `score` **por separado**, así que un `relevante:false`
   con score 0,7 existe y le ganaba el fan-out a un `relevante:true` con 0,5. Con eso el video caía
   en la **reserva** de P1 en vez del **cupo** de P2 —que sí lo quería— y el escalón 5 lo entregaba
   sólo si P1 quedaba corto. Ahora la prioridad del fan-out es *(1) aprobado, (2) relevancia, (3)
   heat*.
2. **El spillover.** Si dos sobrantes se pelean el último cupo de otro proyecto, primero el
   aprobado. Ordenar sólo por heat le regalaba el cupo al escalón 5 por la puerta de atrás.

**El PISO (ADR-017) NO re-aplica sobre la reserva**, por el mismo motivo por el que no re-aplica en
el spillover y con la misma frase: *es relleno marginal, no redistribución.*

### ⚠️ Esto SUPERSEDE una de las alternativas descartadas de arriba

*"Forzar que los bajo-umbral queden siempre debajo de los aprobados"* se descartó el mismo día
porque **privilegia la señal más débil** (0,218 contra 0,493). Ese argumento sigue en pie **para el
orden**: nada acá re-ordena el Feed, el `composite` sigue siendo el único que rankea y el equipo ve
lo entregado en ese orden. Lo que cambia es la **elegibilidad**: quién tiene derecho a un cupo de N.
*Un bajo-umbral no ordena peor que un aprobado; simplemente no le saca el asiento a uno.*

### 📏 Y la métrica que el cambio de forma habría dejado mintiendo

`metricas.bajo_umbral` cuenta lo **ADMITIDO** por el gate, que hasta hoy era lo mismo que lo
entregado. Con el escalón 5 dejan de ser el mismo número: el gate admite todo y `Armar candidato` usa
la reserva sólo si hace falta. Sin arreglar eso, `bajo_umbral: 40` se seguiría leyendo como *"40
dudosos en el Feed"* cuando pueden ser 2 — el mismo modo de falla que el cierre 129 le encontró a
`haiku_lotes_pretrim`. Se agrega **`metricas.bajo_umbral_entregados`** (videos distintos con
`_bajo_umbral` en la salida de `Armar candidato`), y la marca viaja hasta ahí. **No llega a la base:**
`Preparar candidatos` elige campo por campo, igual que con `_entregado`.

**Verificado:** `test-nodos.mjs` en **207 checks** (8 nuevos), y **7 de los 8 se ponen ROJOS contra
el `workflow.json` de HEAD** — corridos contra el código viejo a propósito, porque un test que no
puede fallar no prueba nada. El octavo es una no-regresión (un proyecto sin ningún aprobado entrega
su reserva entera y no se queda en cero). `auditar-workflows.mjs` sin hallazgos, validador 2605/0.

📌 **Nada de esto llegó a producir un video: 0 corridas desde el push de ADR-088.** Los canarios
siguen en cero, así que no hubo nada que limpiar.

**Sigue en pie la válvula:** `Relevancia mínima` en ~0,55 restaura el veto viejo sin tocar código,
porque este ADR la convirtió en el único veto. ⚠️ Al 01/09 está en **0**, y ahora eso es lo correcto:
con el escalón 5 en su lugar, el bajo-umbral ya no entra si no hace falta.


## 🩸 Enmienda 2 (2026-09-01) — el argumento #2 estaba confundido, y apunta al revés

Mani, sobre el escalón 5: *"siento que el heat es una fórmula poco confiable para vetear los videos
(definir si entran o no; no es descriptivo de lo que es en realidad)"*. Al ir a medirlo **se cayó el
argumento #2 de este ADR**, que era uno de sus tres pilares.

### Qué decía y por qué era falso

Este ADR afirmó: *"`relevancia_score` correlaciona **0,218** con el veredicto humano contra **0,493**
de `log(views)` ⇒ el filtro caro decide peor que un dato que llega gratis"*. Esa tabla es de
**correlación de Pearson global**, y tiene dos defectos que la invierten:

1. **El confounder de proyecto.** `Ansiedad` aprueba 83% de lo calificado y `Comunicación de parejas`
   **0 de 27**. Cualquier señal que varíe por cuenta hereda esa diferencia sin saber nada del video.
2. **Pearson sobre variables sesgadas.** `engagement` y `views` tienen cola pesada; Pearson las
   subestima y una medida de **rango** las ordena distinto.

### 📏 Lo medido el 2026-09-01, con AUC y estratificando

**AUC** = probabilidad de que un aprobado puntúe más alto que un rechazado. **0,5 = moneda al aire.**

| señal | global (11.040 pares) | dentro del proyecto (1.106) | mismo proyecto **y misma cuenta** (130) |
|---|---|---|---|
| **`relevancia_score` (Haiku)** | 0,630 | **0,717** | **0,638** |
| `engagement` | **0,765** | 0,674 | 0,527 |
| `likes` | 0,752 | 0,542 | — |
| `log(views)` | 0,703 | **0,407** | 0,500 |
| `seguidores` | 0,610 | **0,311** | 0,604 |
| **`heat_score` (el composite)** | **0,583** | 0,658 | **0,523** |

🔑 **Tres lecturas, y la tercera es la que manda:**

- **Globalmente**, las métricas parecen ganar. Eso es el confounder: es casi todo identidad de
  proyecto.
- **Dentro del proyecto**, `log(views)` cae a **0,407** y `seguidores` a **0,311** — o sea que
  **más vistas y más seguidores predicen RECHAZO**. Replicado en los 3 proyectos que ponen 1.045 de
  los 1.106 pares: `log(views)` da 0,472 · 0,470 · 0,188 y `seguidores` 0,311 · 0,356 · 0,250,
  **ninguno por encima de 0,5 en ninguno**.
- **Dentro del proyecto Y de la misma cuenta**, todas las métricas se **evaporan** (0,50–0,60) y
  **la única que sobrevive las tres estratificaciones es `relevancia_score`**.

### Las tres conclusiones

1. **Las señales métricas son de CUENTA, no de video.** Entre dos videos del mismo creador para el
   mismo proyecto, views/likes/seguidores/engagement no dicen nada. Es
   [ADR-082](./ADR-082-un-video-quemado-se-rescata-borrandole-la-memoria.md) y el T0 del audit otra
   vez, ahora con mecanismo: `thejessicaweiss` es 0 de 26 **por ser esa cuenta**, no por sus videos.
   ⇒ **la palanca métrica es podar y sumar referentes, no re-pesar una fórmula.**
2. **`relevancia_score` es la mejor señal a nivel video que hay**, no la peor. Y **está subestimada**:
   sólo se mide sobre los que pasaron el gate (rango 0,60–0,96), y un rango restringido **baja** el
   AUC. El 0,638 es un piso.
3. **El `composite` (`heat_score` post-gate) es 0,523 a nivel video: una moneda al aire.** No porque
   `relevancia` sea mala sino porque le mezcla **30% de un percentil métrico que no aporta nada** a
   ese nivel. *La fórmula diluye su única señal buena con ruido.*

### Qué se cae y qué NO se cae de este ADR

- ❌ **Se cae el argumento #2.** El gate no decidía peor que un dato gratis: decidía **mejor** que
  todos ellos a nivel video.
- ✅ **Sigue en pie el #1** (*vetar no ahorra un centavo*: el gate corre después de pagar). Es de
  costo y no depende de ninguna correlación.
- ✅ **Sigue en pie el #3** (*el humano ya filtra: 96 👎 de 211*).
- ✅ **Sigue en pie el contrafactual** de +232 entregados, que es de conteo.
- ⚠️ **Pero el balance cambia de forma:** con el #2 dado vuelta, dejar entrar lo bajo-umbral cuesta
  **más precisión de la que este ADR supuso**. Lo que lo hace tolerable es la §Enmienda 1: entran
  **sólo si N quedó corto**, y hoy N queda corto casi siempre (ADR-089: `razon_faltante` es `supply`
  o `mixta` en **15 de 21** proyecto × corrida).

### ⚠️ Lo que esto NO autoriza todavía

- **No autoriza reordenar por `relevancia_score`.** Es la conclusión que pide el instinto y **toca
  ADR-024 y ADR-030**; va decidida aparte, no de rebote acá.
- **No reabre "re-pesar el heat-score"** por sí solo (ROADMAP §5 punto 2, AUC 0,706, techo ≈0,71) —
  🕳️ **pero sí obliga a re-mirar ese cierre**, porque ese 0,706 se parece mucho a los números
  **globales** de la tabla de arriba y **no consta que se haya estratificado**. *Un obstáculo escrito
  se re-mide.*
- **No dice nada sobre lo que el gate RECHAZÓ**, que es el único lado que puede revertir este ADR
  entero. Eso sigue siendo la medición 3 del §Hecho cuando, y sigue pendiente.

## Hecho cuando

1. Una corrida real **entrega más que su gate anterior**. El número a leer es
   **`metricas.bajo_umbral_entregados`** y no `bajo_umbral`: desde la §Enmienda el segundo cuenta lo
   ADMITIDO por el gate (que es casi todo) y el primero lo que de verdad hizo falta para llenar N.
   🔑 **Si `bajo_umbral_entregados` sale 0 en varias corridas, el escalón 5 no es la palanca** — es
   una red que nadie está usando, y el cuello está en el supply (§5 del plan de la cascada).
2. 📏 **La medición que decide si el veto servía**, cruzando lo que ya se persiste:
   ```sql
   select (relevancia_score < 0.55) as habria_sido_vetado,
          count(*) filter (where calificacion is not null) as calificados,
          count(*) filter (where calificacion in ('🔥','👍')) as aprobados
   from app.candidatos where creado_en > '<primera corrida con ADR-088>'
   group by 1;
   ```
   **Si los "habría sido vetado" aprueban ~0%, el veto tenía razón y esto se revierte subiendo
   `Relevancia mínima`.** Si aprueban 30% o más, se estaban tirando videos buenos.
3. 🐤 **Canario:** `metricas.bajo_umbral` nace en cero en toda corrida anterior a este cambio, así
   que el primer valor > 0 es del motor nuevo y no de una prueba.
