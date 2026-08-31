# ADR-084 — La memoria del dedup guarda lo que se resolvió, no lo que se intentó

- **Estado:** aceptada — 2026-08-31 (con Mani, mientras se planeaba subir el volumen por corrida).
  **Es el "ADR nuevo sobre compensar la memoria" que [ADR-030 §Enmienda](./ADR-030-descarte-duro-sin-transcript.md)
  dejó nombrado por adelantado**, y mueve el §2 de [ADR-029](./ADR-029-dedup-blindado-fail-closed-y-feed.md)
  sin tocar su elección de líneas.

- **Contexto:** Mani quiere subir `Resultados por cuenta de referente` y, con eso, cuántos videos se
  transcriben por corrida. Puso la condición en una frase: *"este paso es el más delicado y no puede
  fallar / ser el que descarta"*. Y tenía razón por un motivo que no es el cap.

  `POST processed_items` colgaba de `Heat-score v1` y corría **antes** de `Transcribir`. O sea: un
  video quedaba marcado *"ya visto"* **antes de que Supadata lo mirara**. Si el presupuesto de 870 s
  se acababa, o si Supadata se caía, ese video volvía sin transcript, el gate lo mataba como
  `sin_guion` (ADR-030) y **no lo volvía a mirar ninguna corrida futura**. El propio comentario del
  nodo lo decía sin eufemismo: *"El presupuesto no posterga, QUEMA"*.

  📏 **Medido, no supuesto.** La corrida del 26/08 mandó 250 videos a Supadata y **144 volvieron
  vacíos (58%)**. `Resumen del run` avisó *"posible caída de Supadata"* — y los 144 ya estaban
  quemados igual. [ADR-082](./ADR-082-un-video-quemado-se-rescata-borrandole-la-memoria.md) midió el
  acumulado: **593 transcripciones vacías sobre 1.755 en 29 corridas, el 34% de la cosecha
  histórica**, y tuvo que escribir un script de rescate para desquemarlas a mano.

  🔑 **El punto que ordena la decisión: "lo intenté" y "me contestaron" eran el mismo bit, y no lo
  son.** El nodo ya distinguía los dos casos desde ADR-030 §Enmienda —`transcript-unavailable` es
  definitivo, un `429` es transitorio— pero esa distinción moría dentro del `for` de reintentos y
  nunca salía del nodo. La memoria se escribía río arriba, ciega a las dos.

- **Decisión:**
  1. **`Transcribir (Supadata)` marca cada video con `_tx_resuelta`.** Es `true` solo si Supadata
     contestó de forma **definitiva**: vino texto, o vino `transcript-unavailable` (el video no tiene
     voz, y reintentarlo mil veces da lo mismo). Es `false` si se quedó sin presupuesto o si agotó
     los reintentos contra `429`/timeout.
  2. **`Preparar procesados` solo quema los `true`.** Lo que no se resolvió vuelve a la próxima
     corrida. Con eso **el presupuesto de transcripción pasa de quemar a postergar**, que es lo que
     `cap_top_n` ya hacía, y deja de ser el paso que descarta.
  3. **El registro se mueve de lugar en la cadena, no de forma:**
     `Heat-score v1 → Transcribir → Preparar procesados → POST processed_items → Traducir`.
     `Traducir` pasa a leer sus videos por nombre (`$('Transcribir (Supadata)')`) porque su `$input`
     directo ahora es la respuesta del POST. **Es el mismo idioma que ya usaba `Transcribir`** cuando
     el POST corría delante suyo, no un patrón nuevo.
  4. **`Preparar procesados` aborta ruidoso si ningún item trae la bandera.** Eso solo puede pasar si
     alguien lo recablea a otro nodo, y el modo de falla de ese error es no escribir memoria de dedup
     y que la corrida siguiente **re-traiga y re-pague todo, en verde**. ADR-029 ya eligió abortar
     ruidoso antes que re-pagar callado: es el mismo criterio que sus dos guards en `Heat-score v1`.

- **Por qué la cadena y no una rama.** El primer intento colgó `Preparar procesados` como **rama
  hermana** de `Traducir`. `auditar-workflows.mjs` lo rechazó en el acto: `Resumen del run` referencia
  `$('POST processed_items')` para poder decir `registro_dedup: ok | fallo`, y como rama el POST deja
  de ser ancestro suyo — o sea, la verificación de que la memoria se escribió se habría vuelto una
  lectura de un nodo que puede no haber corrido. **Es exactamente la clase de bug que dejó el dedup de
  ADR-029 sin efecto durante 3 corridas.** En cadena el orden es determinista y no depende de la
  posición en el canvas.

- **Lo que se pierde, dicho sin eufemismo.** La ventana entre pagarle a Supadata y anotarlo deja de
  ser cero: si la corrida muere **entre** `Transcribir` y el POST, se re-paga esa transcripción la
  próxima vez. Es un nodo de distancia, y `POST processed_items` es `onError: continueRegularOutput`,
  así que ni siquiera un error del POST corta la cadena. Se cambia **una pérdida permanente y medida
  (144 videos en una corrida)** por **una re-compra improbable de un salto de nodo**.

- **Alternativas descartadas:**
  - **Agrandar el presupuesto de transcripción.** No arregla nada: mueve el umbral donde empieza a
    quemar, no el hecho de que queme. Y el margen ya está en 7% (ADR-030 §Enmienda: 374 vs 350).
  - **Dejar de escribir memoria hasta el final de la corrida.** Alarga la ventana de re-compra de un
    nodo a toda la corrida (13 a 27 minutos), justo lo contrario de lo que se busca.
  - **Quemar también los transitorios y rescatarlos después con el script de ADR-082.** Es lo que
    pasa hoy, y ADR-082 existe porque no alcanza: el rescate cuesta una corrida, recupera el 24%, y
    *"los 255 que no volvieron no están pendientes, están fuera del alcance"*.
  - **Que un fallo transitorio también se queme para no reintentarlo para siempre.** El costo de
    reintentar es una llamada a Supadata por corrida; el costo de quemar es el video para siempre. La
    asimetría no está cerca.

- **Toca:** `Transcribir (Supadata)` (`resueltos` + `_tx_resuelta` + log de los postergados),
  `Preparar procesados` (filtro + guard duro), `Traducir (Claude Haiku)` (lee por nombre),
  `connections` (el registro se corre un lugar). Probado en `test-nodos.mjs` (10 casos nuevos: las 4
  formas de resolver o no, el que no se quema, el guard del cableado, y que una entrada vacía no es
  un cableado roto). **No toca `core/`, sin migración, sin cambio de schema.**

- **Lo que NO resuelve, y queda anotado.** `Leer feed vivo` sigue **sin paginar** contra el `max-rows`
  de 1.000 de PostgREST — la advertencia que ADR-029 §Enmienda dejó escrita y que hoy no muerde
  (`app.candidatos` tiene 274 filas). Subir el volumen la acerca. Es el paso 4 del plan del 31/08.
