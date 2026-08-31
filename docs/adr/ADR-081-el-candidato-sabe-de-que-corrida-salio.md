# ADR-081 — El candidato sabe de qué corrida salió

- **Estado:** aceptada — 2026-08-30 (con Mani). Migración
  [`034_candidatos_run.sql`](../../core/schema/034_candidatos_run.sql), una línea en el nodo
  `Preparar candidatos` del motor, y la corrida como badge + faceta en el Feed (extiende
  [ADR-076](./ADR-076-ordenar-es-una-vista-no-una-consulta.md), que ya montó la barra).

## Contexto

Operar muestra por corrida *"hace X tiempo · entregó N candidatos"*. El Feed no muestra nada: los
candidatos de todas las corridas conviven sin distinción. El 2026-08-30 hubo tres corridas en un
día —`ecd33926` 22:50 entregó 18, el archivado a las 23:00, `03ecab84` 00:06 entregó 8— y para
saber cuáles vinieron de cuál **hubo que cruzar `creado_en` contra `runs.inicio` a mano**.

`app.candidatos` no tiene `run_id`. La pregunta era si hacía falta la columna o alcanzaba con
derivar la corrida por rango: *el candidato pertenece a la corrida cuya ventana `[inicio, fin]`
contiene su `creado_en`*. La derivación es más barata —cero migración, cero n8n— así que se midió
antes de descartarla.

### 📏 Lo que se midió contra prod (2026-08-30)

168 candidatos vivos, 82 runs (38 de motor, 16 de archivado, 24 del transcriptor, 4 de
descubrimiento). Ninguno con `fin` en null.

| Candidatos que caen en… | Cuántos |
|---|---|
| **1** ventana de corrida de motor | 100 |
| **0** ventanas | **68 (40%)** |
| 2+ ventanas (ambiguos) | **0** |

**Los 68 huérfanos comparten `creado_en` al microsegundo:** `2026-08-22T02:35:28.3151`. No es una
casualidad estadística, es un `INSERT` único — el **rescate manual** del cierre del 22/08
([handoff](../agents/handoff.md), cierre del emoji partido): la corrida `f3fcf3e7` murió quemando
814 transcripciones el 21/08 a las 20:24, sus 70 filas ya armadas se sacaron de los datos de
ejecución y se insertaron por PostgREST para no volver a pagarlas.

**Su `creado_en` es la hora del rescate, no la de la corrida.**

## Decisión

**`app.candidatos.run_id`, nullable, FK a `runs (id)`. Lo escribe el motor.**

Los cuatro argumentos, en orden de peso:

1. **`creado_en` contesta *cuándo se escribió la fila*, no *qué corrida la produjo*.** Son la misma
   respuesta sólo mientras nada reescriba una fila nunca. Ya pasó una vez en 25 días de operación, y
   pasó justo el día que el motor se cayó — o sea en el caso donde más importa saber de dónde salió
   algo.
2. **La derivación no falla ruidosa: falla en silencio con la respuesta equivocada.** A esos 68 les
   diría *"sin corrida"*, y la corrida **existe**, está en la tabla y es la interesante. Un `null`
   honesto y una atribución perdida se dibujan idénticos en la tarjeta. Es exactamente la familia de
   la vista que daba 18 filas para 17 referentes: no rompe, miente.
3. **El modelo ya sabe expresar esto una fila más abajo:** `outputs.run_id` es `not null`. Derivar
   sería una **segunda** implementación, más débil, de un vínculo que el schema ya tiene — el error
   que [ADR-072 §2](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md) ya nombró (*dos
   derivaciones de la misma identidad son dos bugs mudos el día que una cambie*).
4. 🩸 **Hallazgo de paso, y no era el que se buscaba: ese `outputs.run_id` es el run del ARCHIVADO,
   no el del motor.** `Armar filas archivado` hace `$('Abrir run en el registro').first().json.id`
   dentro de *su propio* workflow. O sea que **hoy la corrida que produjo el guion se pierde para
   siempre al archivar**, y ninguna derivación puede rescatarla después porque el candidato ya no
   está. La columna la conserva mientras el candidato vive; llevarla a `outputs` es otra decisión y
   **no se toma acá** (ver §Consecuencias).

**Los 0 ambiguos no salvan a la derivación.** Son 0 porque el guard single-flight (ADR-023 C.3)
impide dos corridas de motor solapadas, así que el modo de falla que se temía —el solape— es
justamente el que **no** se materializó. El que sí se materializó es peor, porque es invisible.

### Por qué nullable, y por qué no se rellena

**Nullable**, y no `not null` con default: `Abrir run en el registro` es **sumidero**
(`onError: continueRegularOutput`, invariante #1 de PLAN §2.5). Si el registro se cae, la corrida
entrega igual y el candidato nace sin corrida. Un `not null` convertiría el registro en dependencia
de ejecución, que es exactamente lo que ese invariante existe para impedir. El nodo copia la forma
que `Armar filas archivado` ya usa: `run.id || null`.

**Sin backfill automático.** La migración **no** deriva las 100 filas derivables. Escribir un valor
derivado en una columna de registro lo vuelve indistinguible de uno medido, y a partir de ahí nadie
puede saber cuál es cuál — es el mismo mecanismo que contaminó el canario de ADR-074 el 30/08. Las
filas viejas quedan en `null` y el Feed lo dibuja como falta, no como dato (ADR-072 §4).

🔓 **Las 68 del rescate son la excepción, y es opt-in.** Su corrida **se sabe** —`f3fcf3e7`, por dos
señales independientes: `estado = 'fallo'` y su `fin` = 20:24 del 21/08, que es la hora que el
handoff registró— así que atribuirlas no sería derivar sino **recordar**. La migración deja ese
`UPDATE` escrito y **comentado**, con su condición exacta. Correrlo es una decisión de Mani, no un
efecto de aplicar la migración.

## Lo que NO se decide acá

- **`outputs` sigue guardando el run del archivado.** Arrastrar la corrida de origen hasta el
  histórico es un cambio en el contrato de `outputs` y merece su propio ADR y su propia medición.
  Acá sólo queda anotado que hoy se pierde.
- **La faceta no ordena.** La corrida entra como faceta categórica de ADR-076, no como criterio de
  orden: el Feed ya llega ordenado por heat y la corrida no es una métrica.
- **No hay filtro por corrida en la query.** Sigue la regla de ADR-076 §4: *el filtro que EDITA va a
  la query, el que MIRA va al cliente*. Nadie edita la corrida de un candidato desde la pantalla, así
  que un `.filter()` vivo no puede hacer desaparecer nada bajo el cursor.

## Consecuencias

- (+) La pregunta *"¿esto de qué corrida salió?"* deja de necesitar SQL a mano.
- (+) Una corrida mala se puede aislar y calificar (o descartar) en bloque: la faceta se combina con
  el modo selección de ADR-075 sin código nuevo.
- (+) La faceta se apaga sola cuando no aporta: `usarOrden` sólo dibuja facetas con 2+ valores, así
  que un Feed de una sola corrida no muestra un control que no hace nada (ADR-076 §7).
- (−) **Las filas anteriores a la migración quedan sin corrida para siempre**, salvo el opt-in de las
  68. Con 168 vivas y un barrido de 20 días, eso se cura solo en tres semanas.
- (−) **Un dato más que el motor tiene que escribir bien.** Su modo de falla es benigno por
  construcción (queda `null`), pero es una línea más que puede quedar desincronizada entre el repo y
  el live: se empuja con `n8n:push` y se verifica con `n8n:diff`, como todo lo demás (ADR-053).
- (−) La etiqueta de la corrida es su **fecha de inicio**, no su id: dos corridas del mismo minuto
  colisionarían en la faceta. El guard single-flight lo hace imposible hoy, y si algún día deja de
  serlo la etiqueta tiene que llevar los primeros 8 del uuid.
