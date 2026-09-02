# ADR-092 — El heat-score es una etiqueta que desempata pasivo, no una voz que vota

- **Estado:** aceptada — 2026-09-02 (decisión de Mani).
  **Completa [ADR-090](./ADR-090-la-metrica-no-rankea-videos-desempata.md)**, que dejó los empates
  en orden arbitrario. **Toca `core/`: migración [`038`](../../core/schema/038_candidatos_prescore.sql).**

## Contexto

Mani, después de ADR-090: *"lo del heat_score es una etiqueta que sirve como 'desempate' pasivo (es
como una métrica suave que sirve ahí sólo como por tenerla y que haiku la conozca, no es la voz
final)"*.

ADR-090 midió que la métrica no aporta información **a nivel video** (AUC 0,407–0,523 dentro del
proyecto) y le sacó el peso. Pero cerró con un agujero escrito: *"los empates quedan sin desempate
real y eso es DELIBERADO"*. Y el agujero no es chico: `relevancia_score` toma **27 valores
distintos** y los grupos empatados por proyecto son de **5,42 en promedio, hasta 14**.

### 🔑 El error de ADR-090 fue el PROMEDIO PONDERADO, no el diagnóstico

ADR-090 buscó el desempate como un **peso** y demostró que no existe: con paso de relevancia 0,01,
haría falta `(1-P) < P·0,01` ⇒ `P > 0,990`. De ahí concluyó *"no hay punto medio, entonces
arbitrario"*.

**La conclusión no se seguía de la premisa.** Un orden **lexicográfico** da un desempate **estricto
por construcción, sin peso ninguno**: relevancia primero, métrica **sólo** cuando relevancia empata.
La métrica no puede invertir jamás una diferencia de relevancia, y decide cuando no hay ninguna.
*El problema nunca fue el valor del peso: era haberlo modelado como un peso.*

## Decisión

**1. El orden del corte es lexicográfico:** `relevancia_score` desc, y ante empate
`prescore_metrico` desc. Aplica al corte por proyecto, a la reserva del escalón 5 y al orden de los
sobrantes del spillover — todos usan el mismo comparador, uno solo.

**2. La métrica se persiste como ETIQUETA** (`app.candidatos.prescore_metrico`, migración `038`).
Hasta hoy **no existía en ningún lado**: `Heat-score v1` la calcula antes de transcribir, el gate
**pisa** `heat_score` con su veredicto, y `Preparar candidatos` guardaba ese `heat_score`. La métrica
se moría en el gate.

🔑 **Y no se puede recomputar después**, que es lo que obliga a persistirla en vez de derivarla en el
cockpit: es un **percentil relativo al pool de SU corrida**. `views` y `likes` sí están guardados,
pero el percentil depende de los otros ~1.000 videos de esa corrida, que no. **Se pierde con la
corrida.** Mismo caso que `run_id` en ADR-081: derivar a posteriori da un número equivocado con cara
de correcto.

**3. `peso_relevancia` sigue en 1.** La métrica no vota. ADR-090 no se revierte: se completa.

## Consecuencias

- ✅ **Se cierra el agujero de ADR-090** sin reintroducir el defecto que ese ADR midió.
- ✅ **El equipo ve la etiqueta.** Es dato en la tarjeta, no una decisión escondida en una fórmula.
- 🟡 **La etiqueta es de CUENTA, no de video** (ADR-088 §Enmienda 2: dentro del mismo creador todas
  las métricas se evaporan). Sirve para desempatar entre creadores distintos y **no** para comparar
  dos videos del mismo. Quien la lea tiene que saberlo, y por eso está en el `comment` de la columna.
- ⚠️ **`prescore_metrico` nace en null para las 422 filas viejas** y no se puede backfillear (ver
  arriba). `null` = *"de antes de ADR-092"*, no *"sin métrica"*.
- ⚠️ **ORDEN OBLIGATORIO: la migración va ANTES del push de `Preparar candidatos`.** Ese nodo manda
  la columna y sin ella PostgREST responde `PGRST204` y **tumba el POST del lote entero** — la
  corrida paga Apify + Supadata + Haiku y no entrega nada. Mismo orden que exigieron la `014`, la
  `016` y la `037`.

## 🕳️ Lo que Mani pidió y NO está hecho: *"que haiku la conozca"*

La otra mitad de su frase es **pasarle la métrica a Haiku como contexto**, para que el juicio la
tenga en cuenta. **No se hizo en este ADR, a propósito y con un motivo medible:** cambiar el prompt
del gate **mueve la distribución de scores** y rompe la comparabilidad con las 422 filas históricas
— el mismo argumento con el que ADR-088 se negó a tocarlo.

📏 **Y hay un motivo de medición encima:** si se cambia el prompt **en la misma corrida** que estrena
el escalón 2 (ADR-091), y el norte se mueve, **no se puede saber cuál de los dos lo movió.** Va
después, en su propia corrida, como su propio ADR. *Dos cambios que se miden con la misma métrica no
entran en la misma corrida.*

## Alternativas descartadas

- **Un peso métrico chico.** Es lo que ADR-090 ya midió imposible (`> 0,990`).
- **Dejar los empates arbitrarios**, que es lo que decía ADR-090. Con grupos de hasta 14 videos, es
  arbitrariedad sobre una parte real del cupo.
- **Derivar el prescore en el cockpit desde `views`/`likes`.** No se puede: el percentil murió con su
  corrida. Ver arriba.
- **Desempatar por `engagement`** (0,674 dentro del proyecto). Sería el mismo efecto de cuenta con
  otro nombre, y `prescore_metrico` ya lo incluye ponderado.

## Hecho cuando

1. La `038` está aplicada y **verificada por efecto**: `count(prescore_metrico) = 0` sobre filas > 0
   (el *sin backfill* como hecho medido) y PostgREST la devuelve con 200, no `PGRST204`.
2. 🐤 **Canario:** `select count(*) from app.candidatos where prescore_metrico is not null` nace en
   **cero** y **la primera fila la escribe el motor**, así que la primera ya es uso real.
