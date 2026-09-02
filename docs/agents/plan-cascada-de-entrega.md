# Plan — La cascada de entrega: agotar lo bueno antes de aflojar

> **Estado: 2 de 5 escalones puestos, y el que está puesto dispara antes de tiempo.**
> Este doc es el pendiente vivo del audit del 2026-09-01 (cierres 132 y 133). Leerlo entero antes de
> tocar el motor: hay tres cosas ya aplicadas en producción y una que **hace lo correcto en el
> momento equivocado**.

---

## §0 · El hallazgo ordenador

Mani lo dijo así el 01/09, corrigiendo la implementación de ADR-088:

> *"Eso de entregar los 6 rechazados no debe ser; solo quiero que no se marquen dedup, y que se
> revisen los otros rechazados de otros proyectos para todos los proyectos antes de irse
> (básicamente para que todo video tenga chance de matchear a un proyecto). Si no consigue nada, ahí
> pueden entrar los que ya fueron transcritos antes para rellenar si ahora tienen un score más alto
> o, en últimas, dejar pasar los siguientes N mejores para completar."*

**Llenar N no es una decisión, es una cascada de cinco**, y el orden es todo el diseño: cada
escalón sólo corre si el anterior no alcanzó. Lo que está mal hoy no es *qué* hace el motor sino
*cuándo*: **el escalón 5 dispara de una, sin haber intentado el 2, el 3 y el 4.**

🔑 **Y hay una razón estructural por la que salió así, que conviene entender antes de arreglarlo:
`Gate de relevancia` NO SABE cuánto falta para N.** El corte por N vive en `Armar candidato`, dos
nodos más abajo. Un gate no puede decidir "dejo pasar para rellenar" porque no tiene el número.
**El escalón 5 pertenece a `Armar candidato`, no al gate.**

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

### 🔴 Escalón 2 — Antes de irse, ofrecer el video a los DEMÁS proyectos · **NO EXISTE**

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

### 🟠 Escalón 5 — Dejar pasar los siguientes N mejores · **APLICADO, PERO DISPARA ANTES DE TIEMPO**

**Qué es.** Como último recurso, completar N con los que el gate habría vetado.

**Qué se hizo** ([ADR-088](../adr/ADR-088-el-gate-ordena-no-veta.md), cierre 133, **en producción**):
`relevante: false` dejó de descartar. El `composite` sigue ordenando y `sin_guion` sigue vetando.

**Por qué está mal como está.** Sin los escalones 2 y 4, **el 5 dispara siempre**: los bajo-umbral
entran aunque no hicieran falta, en vez de sólo cuando N quedó corto. Es lo que Mani señaló:
*"eso de entregar los 6 rechazados no debe ser"*.

🔑 **El arreglo es chico y va en `Armar candidato`, no en el gate.** El gate no sabe cuánto falta
para N —ese corte vive dos nodos más abajo— así que **nunca pudo condicionar**. Lo correcto:

```
Armar candidato:
  1. llenar N con los aprobados (_bajo_umbral !== true), por composite   ← lo de siempre
  2. ¿quedó corto?  → recién ahí, completar con los _bajo_umbral         ← el escalón 5
  3. lo que sobra   → no se entrega y NO se quema (escalón 1)
```

**La marca ya existe y ya viaja:** `_bajo_umbral` (ADR-088). No hace falta migración ni columna
nueva. Son ~10 líneas en el corte de `Armar candidato` y una enmienda a ADR-088.

**Mientras tanto, la válvula de escape es un knob y no un rollback:** poner
**`Relevancia mínima` en ~0,55** restaura el veto viejo sin tocar código, porque ADR-088 la convirtió
en el único veto. ⚠️ **Hoy está en 0.**

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
| **ADR-088 (gate ordena)** | en el live · `test-nodos.mjs` **199 checks** · ⚠️ ver §1 escalón 5 |

### 🔴 Pendiente, en orden de retorno

| # | Qué | Dónde | ¿ADR? |
|---|---|---|---|
| 1 | **Escalón 5 al lugar correcto** (`Armar candidato` prioriza aprobados) | motor | enmienda a ADR-088 |
| 2 | **Escalón 2** (segunda oportunidad cross-proyecto) | motor | **sí, nueva** |
| 3 | **Medir el escalón 4** (¿cuántos pagados se caen de la ventana?) | SQL | no |
| 4 | **Las dos mediciones que ya están escritas** (§4) | SQL, tras una corrida real | no |
| 5 | **T0 del audit: knobs y datos, cero código** | cockpit | no |
| 6 | **T2a: partir las 4 responsabilidades de `Heat-score v1`** | motor | no |
| 7 | **T2b: pisos como insumo del score + repartir `cap_top_n` por proyecto** | motor | **sí** (ADR-044 lo dice literal) |
| 8 | **T3: Grado 2 de ADR-013** (dedup por proyecto para lo ENTREGADO) | `core/` | **sí** |
| 9 | **T1: publicar la anatomía** en `dev-doc.md` | docs | no |
| 10 | **Instrumentación del §9 del audit** | motor + app | parcial |

**Detalle del #5 (T0), que es lo único que se puede hacer sin escribir una línea:**
- Bajar **`Afinidad mínima de propuesta` de 0,60 a 0,45** y correr *Buscar cuentas nuevas*.
  Las 8 propuestas de toda la historia van de 0,60 a 0,75 ⇒ **el piso muerde exacto**, y hay
  **cero propuestas desde el 20/07**. 🕳️ **No se midió** si el buscador no encuentra o si el piso se
  come todo.
- **Decidir las 5 propuestas** que llevan 6 semanas en `propuesto`. Es supply esperando un clic.
- **Podar los referentes de tasa 0%**: `thejessicaweiss` **0 aprobados de 26**, `jen_gottlieb` 0 de 5,
  `nicholascrown` **0 candidatos y 21 descartes**, `abeteddymaruta` 1 de 8.
  ⚠️ ADR-022 fija que **la poda es del equipo**, no automática ⇒ va con Dani, no por SQL.

**Detalle del #10 (instrumentación):**
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
- **El "modo reponer"** (correr el motor otra vez si entregó poco). ADR-030 lo descartó por escrito:
  *"mismo pool, doble costo, cero candidatos nuevos"* — y el 01/09 se confirmó **dos veces**.

---

## §4 · Las mediciones pendientes, escritas antes de mirarlas

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

> **La métrica de éxito NO es la obvia.** No *"cuántos entregó"* sino **cuántos 🔥/👍 ABSOLUTOS por
> corrida**. Medir precisión premiaría al sistema por entregar menos.

**Criterio escrito antes de medir (3):** si los *habría sido vetado* aprueban **~0%**, el veto tenía
razón ⇒ subir `Relevancia mínima` y el escalón 5 queda como red de último recurso. Si aprueban
**30% o más**, se estaban tirando videos buenos.

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
   plan sale con **0 proyectos**. Y si se va a correr con ADR-088 vivo sin el escalón 5 arreglado,
   **poner `Relevancia mínima` en ~0,55 primero**.
4. Empezar por el **#1 de §2** (escalón 5 al lugar correcto): es el más chico, arregla lo que está
   mal hoy, y no pide ADR nueva.

---

## §6.bis · Tres pendientes sueltos que no entran en la cascada

**1. 🕳️ El gate juzga sobre 1.500 caracteres, y nadie midió qué cuesta.**
`Gate de relevancia` trunca el transcript a **1.500 chars** antes de mandárselo a Haiku
(`.slice(0, 1500)`), mientras `Transcribir` guarda hasta **6.000**. Un reel de 2-3 minutos supera
holgado los 1.500 ⇒ **una parte del catálogo se juzga por su primer tercio.** Experimento barato:
re-juzgar una muestra con el transcript completo y comparar veredictos. Podría explicar parte del
ruido del punto 2.

**2. 📏 El `relevancia_score` casi no predice el veredicto humano, y eso pide señales nuevas.**
Sobre los 211 candidatos calificados:

| Señal | Correlación con 🔥/👍 |
|---|---|
| `log(views)` | **0,493** |
| `seguidores` | 0,242 |
| `relevancia_score` (Haiku sobre el transcript) | **0,218** |
| `engagement` | 0,178 |
| `heat_score` | 0,162 |

⚠️ **Caveat honesto:** se mide sobre los que **pasaron** el gate (rango 0,60–0,96), y un rango
restringido baja cualquier correlación. Prueba que el gate **ordena mal a los que deja pasar**;
**no** prueba que rechace bien o mal — eso lo contesta la medición 3 del §4.

⛔ **Esto NO habilita re-pesar el heat-score**, que ya se cerró (ROADMAP §5 punto 2: AUC 0,706, techo
≈0,71). Apunta al mismo lado que esa conclusión: **agregar señales, no mover pesos.** Candidatas que
ya llegan gratis y hoy se tiran o no se usan: `duracion_seg` (se guarda desde ADR-086 y **no la lee
nadie**), comentarios/views, y el formato del video.

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

## §7 · Sesión aparte, a pedido de Mani

**Research de herramientas, adiciones y alternativas** para las capas que ya existen: scraping
(Apify y competencia), ASR (Supadata vs otros), el modelo del gate/pre-trim, y descubrimiento de
referentes. Sale del audit con dos preguntas ya formuladas:

- **¿Hay un scraper que cobre por *delta* y no por catálogo completo?** Hoy el scrape es el **88% del
  costo de la corrida** y se paga entero aunque el 98,8% de lo que trae ya se haya visto.
- **¿Hay una fuente de descubrimiento que no dependa de que un humano tipee handles?**
