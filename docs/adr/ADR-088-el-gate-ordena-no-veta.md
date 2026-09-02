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

- **Forzar que los bajo-umbral queden siempre debajo de los aprobados.** Suena obvio y **la medición
  lo desaconseja**: con `relevancia_score` correlacionando 0,218 y las métricas 0,493, forzar el
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
(`metricas.bajo_umbral`). **Nada más**: `Armar candidato` ya cortaba a N por `composite`, y
`Preparar descartes` ya filtraba por `_descarte`. Probado en `test-nodos.mjs` (**199 checks**, 7
nuevos: que el rechazado entra, que va marcado, que el aprobado no, que el score sigue ordenando, y
las dos puntas de `MIN_REL`).

## Hecho cuando

1. Una corrida real reporta `metricas.bajo_umbral > 0` y **entrega más que su gate anterior**.
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
