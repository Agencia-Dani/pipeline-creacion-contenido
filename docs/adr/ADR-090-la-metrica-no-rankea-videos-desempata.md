# ADR-090 — La métrica no rankea videos, y ni siquiera alcanza para desempatar

- **Estado:** aceptada — 2026-09-01 (decisión de Mani: *"quiero aplicar el cambio necesario ya. Si
  toca, hagamos lo de sacar el 30% del corte"*).
  **Enmienda [ADR-030](./ADR-030-descarte-duro-sin-transcript.md)** (que fijó el composite
  `0,7·Haiku + 0,3·métrica`) y se apoya en
  [ADR-088 §Enmienda 2](./ADR-088-el-gate-ordena-no-veta.md).
  **No toca `core/`, sin migración, y el cambio es de UN VALOR en `Config`** — que además es un knob
  del cockpit (*Peso de relevancia*, visibilidad dev), o sea reversible sin deploy.

## Contexto

Mani, sobre el escalón 5 del cierre 134: *"siento que el heat es una fórmula poco confiable para
vetear los videos (definir si entran o no; no es descriptivo de lo que es en realidad)"*.

`Gate de relevancia` pisa `heat_score` con el **composite**: `PESO·score_Haiku + (1-PESO)·percentil
métrico`, con `PESO = 0,7`. Ese número ordena **dos cosas distintas**, y las dos mueven el norte de
[ADR-089](./ADR-089-una-sola-metrica-aprobados-contra-lo-pedido.md):

1. **El corte de `Armar candidato`** — quién entra en N. Muerde en **7 de 21** (proyecto × corrida).
2. **El Feed del cockpit** — qué mira el equipo primero (`lib/candidatos.ts`, `order("heat_score")`).
   Muerde **siempre**, y hay **211 sin calificar de 422**: el orden de atención es tan palanca del
   norte como el corte.

## 📏 Lo medido (2026-09-01, contra prod)

**AUC** = P(un aprobado puntúa más alto que un rechazado). **0,5 = moneda al aire.**

| | dentro del proyecto (1.106 pares) | mismo proyecto **y misma cuenta** (130) |
|---|---|---|
| `relevancia_score` | **0,717** | **0,638** |
| percentil métrico (`log(views)`) | **0,407** | 0,500 |
| `seguidores` | **0,311** | 0,604 |
| **`heat_score` (el composite)** | 0,658 | **0,523** |

**El componente métrico no aporta información a nivel video**, y dentro del proyecto apunta
*al revés*. El composite queda en **0,523: una moneda al aire**, porque diluye su única señal buena
con 30% de ruido.

### 🔑 El hallazgo que vuelve la decisión BINARIA

La reacción obvia es *"bajemos el peso métrico a un valor chico y que solo desempate"*. **No se
puede.** Medido sobre las 420 filas con juicio:

| | |
|---|---|
| Valores distintos de `relevancia_score` | **27** (rango 0,60–0,96) |
| Valores distintos del composite | 395 |
| Tamaño promedio del grupo empatado (por proyecto) | **5,42** |
| Mayor grupo empatado | **14** |
| **Paso mínimo y típico de `relevancia_score`** | **0,01** |

O sea que **hoy el 30% métrico no está rankeando: está rompiendo empates** — y lo hace en la
dirección equivocada (0,407). Para que fuera un desempate **estricto**, que nunca invirtiera una
diferencia real de relevancia, haría falta:

```
(1-PESO)·1,0  <  PESO·0,01   ⇒   PESO > 0,990
```

**No hay punto medio.** Cualquier peso que le permita desempatar le permite pisar diferencias reales
de la única señal a nivel video que existe. ⇒ **`PESO = 1`.**

### La segunda señal: el simulacro sobre el norte

Sobre los 3 (corrida × proyecto) **100% calificados**, si el cupo hubiera sido la mitad:

| proyecto | videos | aprobados | top-mitad por **composite** | top-mitad por **relevancia** |
|---|---|---|---|---|
| Ansiedad | 20 | 18 | 9 | 9 |
| Depresión | 20 | 12 | **5** | **7** |
| Ansiedad | 13 | 11 | **5** | **6** |
| | | | **19** | **22** |

**Gana o empata en 3 de 3, nunca pierde: +3 aprobados al mismo cupo (+15,8%).** ⚠️ **Muestra chica
(3 grupos, 53 videos)** — no decide sola. Decide junto al AUC (muestra grande) y al mecanismo
(un promedio ponderado no mejora mezclando un término sin información). *Tres patas, no una.*

## Decisión

**`peso_relevancia` pasa de `0,7` a `1`** en el `Config` del motor.

- El composite deja de existir en la práctica: `heat_score = relevancia_score` para todo lo juzgado.
- **El fail-open no cambia:** el código ya es
  `sHaiku != null ? (PESO·sHaiku + (1-PESO)·metricPct) : metricPct`, así que **lo que se quedó sin
  juicio sigue ordenando por su percentil métrico** (ADR-044: *degrada en vez de perder*). Es la
  única parte donde la métrica sigue mandando, y es correcta: ahí no hay relevancia que usar.
- **`Heat-score v1` NO se toca.** El heat métrico crudo sigue decidiendo `cap_top_n`, o sea quién se
  transcribe. Es **pre-transcript**: ahí no existe `relevancia_score` y no hay nada mejor. *Que la
  métrica no sirva para rankear videos juzgados no la vuelve inútil donde es lo único que hay.*

## Consecuencias

- ✅ **Mejor orden en las dos superficies con un solo valor**: el corte y el Feed leen `heat_score`.
- ⚠️ **Los empates quedan sin desempate real y eso es DELIBERADO.** Grupos de ~5 (hasta 14) videos
  van a quedar en orden arbitrario pero estable (el Feed desempata por `id`). **Es honesto:** no hay
  información para ordenarlos, y el desempate anterior apuntaba al revés. *Un orden arbitrario es
  mejor que uno equivocado.* El simulacro de arriba ya se corrió **con** desempate arbitrario.
- ⚠️ **`heat_score` cambia de significado a partir de hoy** y las 422 filas históricas guardan el
  composite. No se puede recomputar hacia atrás; `relevancia_score` se persiste aparte y **sí** es
  comparable entre épocas. Cualquier lectura que cruce eras tiene que filtrar por fecha.
- 🟡 **`heat_score` queda redundante con `relevancia_score`** para lo juzgado. No se borra la
  columna: sigue siendo el orden que leen el Feed y el corte, y el fail-open le pone un valor que no
  es la relevancia.
- 🔴 **Esto NO ataca el cuello.** ADR-089 midió que en **14 de 21** el motor ni llena N: el orden
  solo muerde cuando sobran candidatos. Es una mejora de **precisión**, y el factor que falta es
  **cobertura** (escalón 2).

## Alternativas descartadas

- **Un peso métrico chico (0,85–0,95) "solo para desempatar".** Es lo que pedía el instinto y la
  aritmética lo mata: con paso 0,01 haría falta > 0,990. Un valor intermedio **conserva el defecto y
  aparenta arreglarlo**, que es peor que no tocarlo.
- **Desempatar por `engagement`** (0,674 dentro del proyecto). Tentador, y **queda anotado, no
  hecho**: ese 0,674 es efecto de CUENTA (dentro del mismo creador cae a 0,527), así que sería meter
  higiene de catálogo disfrazada de orden de video. La higiene de catálogo **es del equipo**
  (ADR-022) y tiene su propio pendiente.
- **Desempatar por `duracion_seg`** (existe desde ADR-086 y no la lee nadie). **Sin medir.** Primero
  se mide, después se decide.
- **Pedirle a Haiku un score más fino.** Cambia la distribución y **rompe la comparabilidad con las
  422 filas históricas** justo cuando hay que medir si esto sirvió — el mismo argumento con el que
  ADR-088 se negó a tocar el prompt.
- **Tocar `Heat-score v1`.** Es pre-transcript. Ver arriba.

## 🩸 Corrección del mismo día — el cambio al `Config` NO estaba vigente

**Se aplicó al `Config` y no hacía nada.** El gate arma su config así:

```js
const cfg = Object.assign({}, $('Config').first().json, (plan.ajustes || {}));
```

**Los ajustes del cockpit PISAN al `Config`**, y `app.ajustes` tenía `Peso de relevancia = 0.7`. O
sea que el push llegó al live, `n8n:diff` cerró verde en los 5, y **el valor que corría seguía siendo
0,7**.

🔑 **La lección, que vale más que el bug: `n8n:diff` verde prueba que el live corre el WORKFLOW del
repo, no que un VALOR esté vigente.** Hay una capa de configuración encima que el diff **no mira y no
puede mirar** — vive en Postgres, no en n8n. Todo knob con fila en `app.ajustes` tiene el mismo punto
ciego. *Verificar la capa equivocada se ve idéntico a verificar.*

✅ **Corregido:** `update app.ajustes set valor='1' where clave='Peso de relevancia'`, y **verificado
por el camino real del motor** (no releyendo la tabla recién escrita): `GET /api/engine/run-plan
?ambito=motor&instancia=<reels>` devuelve **200** con `{clave: 'Peso de relevancia', valor: 1}`.

📌 **El `Config` queda en 1 igual**, que es lo correcto: es el default para una instancia nueva que
no tenga la fila. Los dos lados dicen lo mismo.

## Hecho cuando

📏 **Se juzga por el norte de ADR-089** (`aprobados / N pedido`, por proyecto y corrida), en las
corridas donde **la cobertura llegó a N** — que son las únicas en las que el orden muerde. La línea
base contra la que se compara está en ADR-089: **31/08 17:22, 45% del pedido** (Ansiedad 90%,
Depresión 60%), y es la corrida que hay que superar.

🐤 **Canario:** `select count(distinct heat_score) from app.candidatos where creado_en > '<primera
corrida con ADR-090>'` debería dar **≤ 27** y no ~395. Si sigue dando cientos, el knob no llegó al
live.
