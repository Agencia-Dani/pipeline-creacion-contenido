# ADR-093 — El jurado ve la métrica, como contexto débil

- **Estado:** aceptada — 2026-09-02 (pedido explícito de Mani). **Completa
  [ADR-092](./ADR-092-el-heat-score-es-una-etiqueta-que-desempata.md)**, cuya §🕳️ dejó esto anotado
  como *"lo que Mani pidió y NO está hecho"*. **Levanta la restricción de
  [ADR-088](./ADR-088-el-gate-ordena-no-veta.md) §"El prompt NO cambia".**
  **No toca `core/`, sin migración.**

## Contexto

Mani: *"que aún así tengan en cuenta la cantidad de likes, views y engagements… no para descartar,
sino como para ponerle una etiqueta… cada uno tiene su hit score y no es para descartar, sino también
ayuda a priorizar junto con la evaluación que hace haiku"*, y *"que haiku la conozca, no es la voz
final"*.

ADR-092 hizo la mitad (la métrica se persiste y desempata). **Faltaba la otra mitad: que el jurado la
vea al juzgar.**

### 🔴 El riesgo, que sale de nuestra propia medición

[ADR-088 §Enmienda 2](./ADR-088-el-gate-ordena-no-veta.md) midió que **dentro de un proyecto, más
vistas y más seguidores predicen RECHAZO** (`log(views)` AUC **0,407**, `seguidores` **0,311**), y que
**dentro de la misma cuenta la métrica se evapora del todo** (0,50–0,60). Es señal de **CUENTA**, no
de video.

⇒ Decirle a Haiku *"este tiene muchas vistas"* a secas sería **inyectar una señal anti-predictiva
dentro de la única que funciona** (`relevancia_score`, 0,638–0,717). El pedido es correcto; el
peligro está en **cómo se redacta**.

## Decisión

**Cada video viaja al gate con `pop`: su percentil de popularidad (0-100) dentro de su proyecto en
esa corrida.** Y el prompt trae el **calibre de la señal escrito**, redactado contra la medición:

> *"OJO con esa señal: mide a la CUENTA que publicó, no al video, y es DÉBIL. Usala SÓLO para
> desempatar entre videos que cumplan IGUAL de bien los criterios. NUNCA subas el score de un video
> que no cumple los criterios porque tenga pop alto, ni lo bajes por tenerlo bajo: un video off-topic
> con pop 99 sigue siendo off-topic."*

**Va el PERCENTIL y no las `views` crudas**, por dos razones: un número absoluto no le dice nada al
jurado sin saber contra qué compara, y **haría que el prompt cambie de escala** entre una corrida de
cuentas chicas y una de cuentas grandes.

**Lo que NO cambia:** el `score` que devuelve Haiku sigue siendo el único que ordena (ADR-090,
`peso_relevancia = 1`), y `prescore_metrico` sigue desempatando pasivo al lado (ADR-092). **La
métrica no vota por dos caminos:** entra al juicio como contexto, y desempata después. No se suma a
nada.

## ⚠️ Lo que esto cuesta, y ADR-088 lo había puesto como motivo para NO hacerlo

**Cambiar el prompt mueve la distribución de scores**, así que un `relevancia_score` de antes y uno
de después **NO son comparables**. ADR-088 se negó a tocarlo por eso. Mani lo pidió igual, y la
mitigación es **marcar la época en vez de evitar el cambio**:

📌 **`metricas.gate_ve_metrica`** se escribe en cada corrida. Sin esa marca, cualquier medición que
cruce las dos épocas **mezcla dos escalas sin saberlo** — que es exactamente el error que ADR-088
§Enmienda 2 acaba de pagar con la tabla de señales.

📏 **Y por eso NO entró en la misma corrida que ADR-091** (el escalón 2). *Dos cambios que se miden
con la misma métrica no entran en la misma corrida*: si el norte se moviera, no se sabría cuál lo
movió. ADR-091 ya está en el live desde antes, así que la primera corrida con este cambio se lee
contra la que traiga el escalón 2 solo.

## ⚠️ La perilla es de EXPERIMENTO, no del cockpit

`gate_ve_metrica` (default **1**) vive **sólo en el `Config`**. **NO está en el `AJUSTE_MAP` de
`Armar plan de corrida` ni en el `CATALOGO` de la app**, así que **una fila en `app.ajustes` no lo
tocaría** — el catálogo lo dice: *"una clave nueva se agrega en los tres lados o no existe"*.

⇒ **Se apaga cambiando el `Config` del repo y corriendo `n8n:push`.** Un minuto, pero **no lo puede
hacer el equipo**. Decirle *"reversible sin deploy"* habría sido repetir el error de ADR-090, donde
se dio por vigente un valor que los ajustes estaban pisando. Se deja así a propósito: es una bandera
de experimento nuestra, no un knob que el equipo tenga que entender.

## Alternativas descartadas

- **Mandar `views`/`likes` crudos.** Sin referencia no significan nada para el jurado, y la escala
  cambiaría entre corridas.
- **Mandar la métrica sin advertir su calibre.** Es la versión que el pedido sugiere leído literal, y
  la medición dice que empeoraría el juicio: metería una señal de cuenta, débil y a veces invertida,
  dentro de la única fuerte.
- **Pedirle a Haiku un segundo score aparte.** Complica el parse (el fail-open del gate depende de
  que el JSON sea simple) y no lo pidió nadie.
- **Exponerlo como knob del cockpit.** Son 3 lugares + una migración del check de la `009`, para una
  bandera que sólo vamos a tocar nosotros. Si el equipo alguna vez necesita apagarlo, ahí se hace.

## Hecho cuando

📏 **Lo juzga el norte de ADR-089** (`aprobados / N pedido`), comparando corridas con
`metricas.gate_ve_metrica = true` contra las de `false`, **por separado y nunca mezcladas**.

> **Criterio escrito ANTES de mirar:** si el norte **baja** o si la tasa de 👎 sube en los proyectos
> con cobertura completa, **se apaga el knob**. La hipótesis de que ayuda es de Mani y es razonable;
> la medición que dice que la señal es de cuenta y a veces invertida también es real. **Se resuelve
> midiendo, no discutiendo.**
