# Máquina de LinkedIn — el pipeline N+1

Detecta contenido que ya funcionó —incluido el de otros idiomas—, lo cura un humano, produce el post
en la voz de la cuenta con su firma, y lo deja en una cola para que **una persona lo apruebe y
publique**.

> ## ⚠️ Estado al 2026-08-11: está la **espina del carril personal**, y su primera etapa es un stub
>
> | Pieza | Estado |
> |---|---|
> | Las decisiones | ✅ [ADR-055](../../docs/adr/ADR-055-linkedin-es-un-pipeline-de-este-repo.md) (la forma) · [ADR-056](../../docs/adr/ADR-056-las-zonas-son-rol-interseccion-pipeline.md) (la superficie) · [ADR-066](../../docs/adr/ADR-066-un-cockpit-sin-motor-solo-muestra-lo-que-se-configura.md) (qué se dibuja sin motor) · [ADR-067](../../docs/adr/ADR-067-el-perfil-de-voz-de-linkedin-es-una-capa-sobre-las-voces-de-la-empresa.md) (el perfil de voz) · [ADR-068](../../docs/adr/ADR-068-el-pipeline-lo-dice-la-instancia-no-el-que-pregunta.md) (el plan de corrida) |
> | Las tablas | ✅ [`020`](../../core/schema/020_pipeline_linkedin.sql) **aplicada**, y [`024`](../../core/schema/024_rls_linkedin.sql) le puso las policies (grano **instancia**) · ⬜ **las 4 con 0 filas** |
> | El cockpit | ✅ **3 instancias, las 3 `active`** desde el 2026-08-11 (`retia/linkedin` estaba en `draft`) · ✅ **4 de 6** pantallas de `curar` (ADR-066: las otras 2 no tienen escritor) · 🆕 con `retia` teniendo dos cockpits, **el selector de pipeline de ADR-056 se dibuja por primera vez** |
> | La fachada | ✅ `GET /api/engine/run-plan` sirve el plan de LinkedIn (ADR-068), **verificado en prod** |
> | El manifest | ✅ [`workflow.yaml`](workflow.yaml), válido contra el contrato |
> | El `workflow.json` | ✅ **16 nodos**: los 11 de infraestructura + la espina `colectar → calidad → entregar`. `calidad` está **entera**; `colectar` es un **stub** |
> | El motor en n8n | 🔧 **11 nodos, INACTIVO** — en n8n vive todavía el esqueleto del 09/08. Los 5 nodos nuevos son **topología** y desde el 30/08 `n8n:push` **sí** los cubre (ADR-053 §Enmienda) — pero el workflow está bajo el ⛔ de producto, así que **no se empujan**: `n8n:diff` sigue gritando a propósito |
> | Lo que falta | ❌ `generar` (bloqueada por los few-shot) · ❌ el carril copiable entero (bloqueado por el banco) · ❌ sin cron en el dispatcher |
>
> ### 🔧 Qué hace hoy la espina, y qué NO
>
> ```
> Leer plan (fachada) → Verificar plan (ADR-068) → Colectar (stub personal) → Calidad (R-1 + R-2) ─┬─→ Preparar candidatos → POST Candidatos
>                                                                                                  └─→ Resumen del run → Cerrar run
> ```
>
> **`Verificar plan (ADR-068)`** —antes llamado `Resumen del run`— **afirma que el plan recibido dice
> `pipeline: linkedin`** y aborta si no. Es el primer consumidor del campo que ADR-068 agregó y el
> único punto donde ese fallo se puede cazar, porque su síntoma no es un error: es un plan **bien
> formado del pipeline equivocado**, con las voces y los referentes de reels adentro. Va primero para
> que verifique **antes** de que ninguna etapa gaste o escriba.
>
> **`Colectar (stub personal)` es de mentira, a propósito.** Emite piezas **fijas** —no lee ninguna
> fila— para que la cadena entera (tenant, FK, RLS, dedup, R-1, R-2, PostgREST) corra y se verifique
> **antes** de gastar un peso en Apify o en un LLM. Si la pieza aparece en el Feed, lo que falta es
> contenido, no cableado. Emite **dos**, y la segunda **viola R-1 a propósito**: es la única forma de
> que una corrida real pruebe que `Calidad` está *cableada* y no sólo presente. Sus `external_id` son
> fijos, así que correrlo dos veces deja **una** fila.
>
> **`Calidad (R-1 + R-2)` sí está terminado**, y se escribió **antes** que `generar` a propósito —
> contra texto de prueba— para que el día que entre el LLM ya tenga quién lo sanitice. Ver la tabla
> de las cuatro reglas más abajo.
>
> 🔑 **Por qué el cierre del run cuelga de `Calidad` y no del POST.** `Preparar candidatos` devuelve
> `[]` cuando no hay nada que escribir, y en n8n un `[]` corta la rama entera. Con el cierre detrás
> del POST, toda corrida sin piezas —hoy, con 0 voces, **todas**— dejaría el run `en_curso` hasta el
> barrido de la corrida siguiente. La rama de entrega corre primero porque su destino tiene **Y
> menor** en el canvas (320 < 480); reordenar el array de `connections` no haría nada.
>
> ⚠️ **No se activó, y no debe activarse todavía**: sin `generar`, un webhook vivo abre runs que
> entregan una pieza de prueba y nada más.
>
> 🩸 **Lo que se cerró el 08/08 (ADR-066), y vale como advertencia para el próximo pipeline:**
> declarar una zona que no tenés **no es mostrar de menos, es mostrar la del otro**. LinkedIn
> declaraba `operar` y `entender` sin pantalla propia: `entender` dibujaba las 5 vistas de reels en
> ceros, y `operar` traía **los tres botones que disparan los workflows de reels** — vivos, porque
> dos de sus cockpits están `active`. Medido antes de cerrarlo: cero `runs` y cero `outputs`, nadie
> llegó a apretarlo. Hoy el nav es **`curar` + `ajustes`** y vuelven cuando tengan pantalla propia.
>
> **Y lo que lo bloquea no es técnico.** Son tres cosas y ninguna se resuelve programando — están
> en ADR-055 §Consecuencias con su detalle:
> 1. 🔴 **No hay definición de "funcionó".** Lo que hay es *"impresiones y reacciones"*, que es
>    volumen puro: construir el aprendizaje sobre eso converge en el post motivacional con máximas
>    reacciones y cero clientes. Son **tres** respuestas porque son tres marcas, y solo **EstadoX**
>    puede anclarla a dinero hoy.
> 2. 🔴 **No existe el banco de referentes.** Fernando, textual: *"no tengo el listado"*. Hay que
>    construirlo, no capturarlo.
> 3. 🟠 **Faltan los few-shot**: 3–4 posts que se sientan perfectos, **por cuenta**. Es el pedido más
>    barato del proyecto y ancla toda la generación. ⚠️ Este renglón decía *"que **Fernando** sienta
>    perfectos"* y estaba mal (corregido el 2026-08-11): Fernando dio la idea general de cómo
>    funciona la máquina, no el molde que se copia. Los few-shot anclan la voz de **una cuenta**, así
>    que el pedido es de quien manda esa cuenta.
>
> **Lo que sí se puede construir sin ellas** es la detección, la curación y el cockpit. Eso es lo
> que está hecho.

## Las dos cosas que lo hacen distinto de reels

**1. La etapa 1 se bifurca en dos carriles**, y solo uno tenía el problema difícil.

| | **Carril personal** | **Carril copiable** |
|---|---|---|
| **Fuente** | el archivo propio de la voz (podcasts, blogs, transcripciones) | **Pinterest + referentes en inglés**; LinkedIn cuando se deje |
| **Qué produce** | una anécdota que nadie más tiene | un formato que ya funcionó, para rebrandear |
| **Umbral** | ninguno: no compite con nadie | pertinencia y formato, **no** viralidad |

🔑 **La fuente NO es LinkedIn, y eso es lo que destrabó el proyecto.** El material que se rebrandea
es visual y no nació en LinkedIn —infografías, diagramas, listas—, así que buscarlo ahí era buscarlo
en el peor sitio, y encima en el único que no se deja rastrear. El riesgo *"LinkedIn no se deja
scrapear"* se resolvió **por rodeo, no por fuerza**.

**2. No hay etapa de enriquecimiento.** LinkedIn ya es texto: `enriquecer: n/a` en el manifest, sin
Supadata y sin traducción de audio. Eso tiene una consecuencia visible: **la zona `transcribir` no
existe en este cockpit** (ADR-056), y no porque falte construirla.

## Las cuatro reglas duras, y cuáles son código

Salieron de la entrevista a Fernando Benites (2026-08-01) y ya están separadas por el criterio que
protege el diseño: *si no cabe en un placeholder, no era proceso — era gusto*.

| | Regla | Quién manda | Dónde vive |
|---|---|---|---|
| **R-1** | El gancho es un bloque continuo de 2–3 líneas **sin línea en blanco**. Un `\n\n` antes de la línea 2 esconde el post detrás del *"ver más"* | la plataforma | **código**, rechazo automático |
| **R-2** | **Firma al cierre de todo post**, sin excepción: nombre · cargo · frase de propósito. También al pie de la imagen rebrandeada — salvo imagen ajena sin modificar, que no se firma | la casa | **código**, texto por voz (`app.voces_linkedin.firma`) |
| **R-3** | Espaciado del cuerpo | la persona | placeholder (`espaciado`) |
| **R-4** | Separación mínima entre posts de la misma cuenta: se canibalizan | la persona | placeholder (`separacion_h`), gobierna la cola |

**El LLM propone; código determinista sanitiza antes de que nada llegue a un humano.** No es
opcional y no es nuevo: es la misma costura que usa el resto del sistema.

R-1 y R-2 viven en el nodo **`Calidad (R-1 + R-2)`**, y **se tratan distinto según quién sea dueño
del texto** — no es una asimetría de comodidad:

| | Qué hace | Por qué |
|---|---|---|
| **R-1** | **rechaza** | el gancho es contenido, y código no puede inventar uno |
| **R-2** | **repara**: le agrega la firma al cierre | la firma es texto de **la casa**, guardado por voz en `app.voces_linkedin.firma`. Ponerla no es escribir |

Los tres bordes que no se adivinan leyendo la regla, y que tienen test:

- **El gancho es el primer bloque**, o sea todo lo que hay hasta la primera línea en blanco. Por
  definición no tiene una adentro: lo que R-1 mide es **cuántas líneas quedaron de ese lado**. Un
  `\n\n` después de la línea 1 deja un gancho de 1 y esconde el post detrás del *"ver más"*.
  ⚠️ Cuenta **saltos de línea, no líneas visuales**: una línea larga que envuelve en el teléfono
  cuenta como una. No hay forma de saber el ancho del viewport desde un code node, y la regla de la
  entrevista habla de `\n\n`, que sí se puede medir.
- **Si la firma aparece en el MEDIO del post, se rechaza.** Agregarla la duplicaría y moverla ya es
  reescribir. Sólo se repara cuando falta **entera**, y reparar es idempotente.
- **Un rechazo de calidad NO va a `app.descartes_linkedin`.** Esa tabla es para los near-miss del
  *gate* (ADR-036), o sea piezas que un humano podría auditar como falso negativo. Un post
  malformado no es un falso negativo: es una falla de generación, y su sumidero es `runs.metricas`
  — que es donde se ve si el LLM empezó a romper R-1 sistemáticamente.

## Validar

```sh
node test-nodos.mjs            # los 5 code nodes, con `$` y `$input` mockeados
node ../auditar-workflows.mjs  # conexiones, alcanzabilidad, refs a no-ancestros, invariante #1
```

`test-nodos.mjs` es el hermano del de reels, y acá pesa más: este workflow está **inactivo y sin
cron**, así que no hay ninguna corrida real que desmienta un bug. Las tres guardas que más importan
—R-1 rechazando el gancho de una línea, R-2 sin duplicar la firma, y `Colectar` devolviendo un item
aunque no tenga piezas— **se verificaron poniéndolas rojas**.

## Las tablas

Cuatro, todas de grano instancia, por [ADR-049](../../docs/adr/ADR-049-un-pipeline-sus-tablas.md)
(*lo común es el contrato, lo propio es la tabla*):

- **`app.referentes_linkedin`** — el banco del carril copiable: cuentas y filtros de Pinterest.
- **`app.voces_linkedin`** — la firma, el espaciado y la separación de cada voz. Están acá y no en
  `app.voces` porque **no tienen sentido sin saber que hablamos de LinkedIn**, y `app.voces` la
  comparten los dos pipelines.
- **`app.candidatos_linkedin`** — las piezas al feed. La pieza es texto y/o imagen, no un video:
  ni `views`, ni `thumbnail_url`, ni `seguidores`.
- **`app.descartes_linkedin`** — los near-miss, que **no se barren nunca** (ADR-036).

`app.plataforma` **no se toca**: el enum se queda con `('instagram','tiktok')` porque describe el
pipeline de reels. LinkedIn no es un valor más de ese enum.

## Qué NO hace, a propósito

- **No publica.** La máquina deja el post listo; publica una persona. No es una limitación temporal:
  el costo de equivocarse en un canal que no quiere ser automatizado es la cuenta, no un reintento —
  y ya hay precedente propio y caro con los baneos de WhatsApp por Baileys.
- **No filtra por sensibilidad local.** Prohibido política y religión; comedia y controversia están
  permitidas. Pero la regla real —*"hay que ser muy cuidadoso con las palabras, más si habla de
  cosas sensibles en Colombia"*— **no se automatiza**: la resuelve el humano de la curación. Queda
  escrito como límite del producto, no como filtro.

## De dónde sale todo esto

El diseño vive en **`Contenido/maquina-linkedin/`** (PLAN, la entrevista a Fernando, los hallazgos y
sus 3 ADRs) y **no se copia acá** — un hecho, un dueño. Ese repo pasó a ser el de **diseño**; este es
el de **construcción**, y ADR-055 es donde se cerró esa decisión.
