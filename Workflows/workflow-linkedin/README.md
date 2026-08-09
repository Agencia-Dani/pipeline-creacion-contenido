# Máquina de LinkedIn — el pipeline N+1

Detecta contenido que ya funcionó —incluido el de otros idiomas—, lo cura un humano, produce el post
en la voz de la cuenta con su firma, y lo deja en una cola para que **una persona lo apruebe y
publique**.

> ## ⚠️ Estado al 2026-08-08: hay diseño, tablas, RLS y cockpit. **No hay `workflow.json`.**
>
> | Pieza | Estado |
> |---|---|
> | Las decisiones | ✅ [ADR-055](../../docs/adr/ADR-055-linkedin-es-un-pipeline-de-este-repo.md) (la forma) · [ADR-056](../../docs/adr/ADR-056-las-zonas-son-rol-interseccion-pipeline.md) (la superficie) · [ADR-066](../../docs/adr/ADR-066-un-cockpit-sin-motor-solo-muestra-lo-que-se-configura.md) (qué se dibuja sin motor) |
> | Las tablas | ✅ [`020`](../../core/schema/020_pipeline_linkedin.sql) **aplicada**, y [`024`](../../core/schema/024_rls_linkedin.sql) le puso las policies (grano **instancia**) · ⬜ **las 4 con 0 filas** |
> | El cockpit | ✅ **3 instancias**: `30x/linkedin` y `estadox/linkedin` en `active`, `retia/linkedin` en `draft` (o sea que todavía no existe como cockpit) · 🔧 **1 de 6** pantallas de `curar`: Referentes |
> | El manifest | ✅ [`workflow.yaml`](workflow.yaml), válido contra el contrato |
> | El motor en n8n | ❌ **no existe** — 0 nodos, ni cron en el dispatcher |
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
> 3. 🟠 **Faltan los few-shot**: 3–4 posts que Fernando sienta que salieron perfectos, por cuenta.
>    Es el pedido más barato del proyecto y ancla toda la generación.
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
