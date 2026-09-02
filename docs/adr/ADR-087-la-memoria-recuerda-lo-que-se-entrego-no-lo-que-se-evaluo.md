# ADR-087 — La memoria recuerda lo que se ENTREGÓ, no lo que se evaluó

- **Estado:** propuesta — 2026-09-01 (con Mani, auditando por qué una corrida entregó 13 de 100).
  **Enmienda [ADR-029 §2](./ADR-029-dedup-blindado-fail-closed-y-feed.md) y continúa
  [ADR-084](./ADR-084-la-memoria-guarda-lo-resuelto-no-lo-intentado.md)**, que movió esta misma
  escritura una vez y por la misma familia de razón. Toca `core/` (migración `037`).

## Contexto

Mani lo dijo en una frase: *"aquellos que son descartados no deberían pasar al dedup, solo los que
se postean al Feed"*.

### 📏 Lo que se midió contra prod (2026-09-01)

| | |
|---|---|
| Filas en `public.processed_items` | **1.952** |
| Videos que llegaron al Feed alguna vez (`candidatos` ∪ `outputs`) | 866 |
| **Quemados que NUNCA se le mostraron a nadie** | **1.401 — el 71,8%** |

Mil cuatrocientos videos se scrapearon, se transcribieron, se pagaron (~USD 12,6 solo de Supadata),
se marcaron *"ya visto"* para siempre, **y ninguna persona los vio**. No se descartaron: se
consumieron.

### 🔑 El hallazgo que corrige la premisa

La intuición era que los videos se pierden en los pisos duros, el heat-score y la recencia. **Es
falso, y verificarlo cambia el alcance del arreglo.** `Preparar procesados` cuelga de `Transcribir`
(ADR-084 §3), así que **solo se quema lo que llegó a transcribirse**:

- **Pre-trim, recencia, `min_views`, `min_likes`, `cap_top_n`** matan *antes* de transcribir ⇒ **no
  entran a la memoria y ya vuelven en cada corrida.** Esos videos nunca estuvieron perdidos.
- **El gate (`relevante:false`), el `sin_guion` y el corte por N** matan *después* ⇒ **quedan
  quemados y no vuelven nunca.** Los 1.401 son enteramente de este grupo.

O sea: la memoria hoy responde *"¿ya lo evalué?"*, y la pregunta que el dedup necesita responder es
*"¿ya se lo mostré al equipo?"*. **Son dos preguntas distintas con la misma llave, y por eso el
sistema tira tres de cada cuatro videos que paga.**

### 🩸 Dos cosas que hacen caro el arreglo obvio, y que había que medir antes de proponerlo

**1. El motor no guarda sus transcripts en ningún lado reutilizable.** `app.transcripciones` tiene
**130 filas y las 130 tienen `tanda_id`**, o sea que **todas vienen del transcriptor manual del
cockpit y el motor escribió cero**. Su único caché es un `const cache = {}` intra-corrida. Dejar de
quemar sin resolver esto significa **re-transcribir y re-pagar el mismo video en cada corrida, para
siempre**.

**2. `app.descartes` no guarda `external_id`.** Un video descartado no se puede volver a identificar.
Tan es así que [`rescatar-huerfanos.mjs`](../../Workflows/workflow-short-form-content/rescatar-huerfanos.mjs)
tiene que **decodificar el shortcode de Instagram desde `url_referente`** (base64 con alfabeto
propio) para reconstruirlo. Un identificador que hay que derivar con un script no es un
identificador. Y **`app.descartes` no se barre nunca** — verificado: el archivado no la menciona, y
hay filas del 01/08 vivas al 01/09.

## Decisión

**Tres preguntas, tres memorias.** Hoy una sola tabla contesta las tres, mal.

| Pregunta | Dónde vive | Quién la escribe | Qué evita |
|---|---|---|---|
| ¿Ya **pagué el ASR** de este video? | `app.transcripciones` | `Transcribir` | re-pagarle a Supadata |
| ¿Ya se lo **mostré al equipo**? | `public.processed_items` | el POST de candidatos | **el dedup real** |
| ¿Supadata dijo que **no tiene audio**? | `app.transcripciones.estado = 'sin_transcript'` | `Transcribir` | reintentar un mudo para siempre |

### 1. El motor escribe y lee `app.transcripciones` — sin tabla nueva

La tabla **ya tiene exactamente la forma que hace falta**, verificado contra prod: el unique es
`(instance_id, plataforma, external_id)` y el check de `estado` ya incluye `sin_transcript`. No hace
falta inventar nada.

- `Transcribir` **consulta la caché antes de llamar a Supadata**, por `(instance_id, plataforma,
  external_id)`. Si hay `script`, lo usa. Si hay `sin_transcript`, lo salta sin pagar.
- Después de resolver, hace upsert con `resolution=ignore-duplicates`: **el primer transcript gana y
  nunca se re-paga.**

**Por qué esta tabla y no una nueva.** El guion crudo de un video **ya vive en tres tablas** y
`lib/guiones.ts::leerCrudo` lo busca en cascada quedándose con el primero — su propio comentario
dice *"está en tres tablas y ninguna es «la» fuente, que es todo el problema que ADR-072 vino a
resolver"*. Una cuarta tabla agrava exactamente eso. Al escribir acá, **`leerCrudo` queda completo
en su primer salto**, que es una mejora para Guiones y Colecciones, no solo para el motor.

### 2. `app.transcripciones` gana `origen` (`manual` | `motor`), y el cockpit filtra

🔴 **Sin esto, el cambio le rompe la pantalla al equipo, y no es hipotético.** `leerFallidas()` trae
**sin límite** las filas en `fallo`/`sin_transcript` con el comentario *"son pocas por definición"*.
ADR-082 midió que **el 34% de lo que el motor manda a Supadata vuelve vacío (593 de 1.755)**: serían
cientos de filas del motor cayendo en la lista del equipo con un botón *Reintentar* que no tiene
nada que reintentar.

Las **cinco** llamadas de `lib/transcripciones.ts` que pasan a filtrar `origen = 'manual'`:
`leerSueltas` · `leerFallidas` · `contarPendientes` · `cualesEnCola` · `cualesFallidas`.

⚠️ **`leerSueltas` es un canario documentado** (*"tiene que dar siempre cero"*: filas sin tanda).
Con el motor escribiendo sin tanda, el filtro `origen='manual'` **es lo que lo mantiene vivo**. Si se
olvida, el canario deja de significar lo que dice.

### 3. `processed_items` cambia de significado: solo lo que llegó al Feed

La escritura se corre de `Transcribir` a **después de `Armar candidato`**: se quema el video cuando
se convierte en tarjeta, no cuando se transcribe.

**Lo rechazado por el gate y lo que quedó afuera por cupo vuelve a la próxima corrida, gratis**,
porque su transcript ya está en la caché.

### 4. Prioridad: lo nuevo primero, lo que vuelve rellena

Un video que vuelve **no compite de igual a igual** con el material recién publicado. Lo nuevo entra
siempre; los que vuelven ocupan solo lo que falta para llegar a N.

**Por qué, medido:** los que vuelven ya pasaron el piso de 100.000 vistas y llevan semanas
acumulando reproducciones, así que **tienden a tener heat más alto que un reel de ayer**. Mezclados
por heat desplazarían sistemáticamente a lo nuevo y el Feed se estancaría en catálogo viejo.

### 5. `app.descartes` gana `external_id`

**Todo video en la herramienta se identifica por `(plataforma, external_id)`.** `app.descartes` era
la única superficie que no lo hacía.

Sin backfill: las 154 filas históricas quedan en `null`. **Y no se curan solas** — esta tabla no se
barre. Son recuperables con el decodificador de `rescatar-huerfanos.mjs` si algún día hace falta;
no se hace acá porque nada lo necesita todavía y un backfill derivado que se equivoque es peor que
un `null` honesto.

## Por qué mover la memoria es seguro AHORA y no lo era antes

[ADR-084 §Alternativas descartadas](./ADR-084-la-memoria-guarda-lo-resuelto-no-lo-intentado.md)
rechazó explícitamente *"dejar de escribir memoria hasta el final de la corrida"* porque *"alarga la
ventana de re-compra de un nodo a toda la corrida"*.

**Ese argumento se cae con la caché de transcripts, y ése es el orden correcto de los cambios.** La
ventana de re-compra deja de costar plata: si la corrida muere entre transcribir y entregar, la
próxima encuentra el transcript en `app.transcripciones` y **no le paga a Supadata de nuevo**. Lo
que se re-hace es la traducción y el juicio, que son centavos de Haiku, no el ASR.

> **La regla que queda: una memoria se puede mover río abajo cuando lo que protegía ya está
> protegido por otra.** Primero la caché, después el movimiento. Al revés se cambia una pérdida de
> videos por una fuga de plata.

## Consecuencias

**A favor**
- Los videos dejan de perderse por haber sido evaluados. **1.401 de 1.952 (71,8%) es el tamaño del
  desperdicio que esto ataca.**
- El ASR se paga **una vez por video en la vida del sistema**, no una vez por corrida en que aparece.
- `leerCrudo` encuentra el guion en el primer salto.
- `app.descartes` pasa a ser auditable de verdad: hoy no se puede ni volver a encontrar lo que tiró.

**En contra, dicho sin eufemismo**
- 🔴 **El volumen que entra a `Transcribir` sube**, porque los no-entregados vuelven. El freno pasa a
  ser `cap_top_n`, que **corta global y puede vaciar proyectos enteros** (ADR-044 lo midió: con el
  techo en 10, un proyecto se llevó los 10 y cuatro quedaron en `evaluados: 0`). **Repartirlo por
  proyecto sigue siendo otro ADR**, y esta decisión lo acerca.
- `app.transcripciones` deja de ser solo la cola humana y pasa a tener miles de filas de máquina.
  Las 5 lecturas del cockpit se filtran; **una sexta que aparezca y no filtre es un bug silencioso.**
- La ventana de re-compra de Haiku (traducción + gate) se alarga de un nodo a varios. Son centavos y
  se acepta a conciencia.

## Alternativas descartadas

- **Una tabla nueva solo para el motor.** Riesgo cero para el cockpit, pero es un **cuarto** lugar
  donde puede vivir el guion de un video: exactamente la fragmentación que ADR-072 existe para
  resolver, y `leerCrudo` necesitaría un salto más.
- **Borrar `processed_items` de los descartados con un script, como ADR-082.** Es lo que ya se hizo
  una vez: cuesta una corrida, recupera el 24%, y hay que acordarse de correrlo. Esto lo vuelve
  estructural en vez de un rescate manual.
- **No quemar nada y confiar en el gate.** Sin memoria de entrega el mismo video vuelve al Feed
  corrida tras corrida, que es el bug que ADR-018 y ADR-029 existen para evitar.
- **Backfillear `external_id` en los 154 descartes** decodificando la URL. El decodificador está
  probado (300/300 en ADR-070) pero **nada lo necesita hoy**, y un backfill derivado que falle en
  silencio es peor que un `null` que se ve.

## Toca

- **`core/`:** migración [`037`](../../core/schema/037_origen_transcripciones_y_descartes_id.sql) —
  `app.transcripciones.origen` + `app.descartes.external_id`. Ambas aditivas, sin backfill.
- **Motor:** `Transcribir (Supadata)` (leer caché + marcar para upsert), un `POST` nuevo a
  `app.transcripciones`, `Preparar procesados` (pasa a colgar de `Armar candidato`),
  `Preparar descartes` (manda `external_id`), y `connections`.
- **App:** las 5 llamadas de `lib/transcripciones.ts` filtran `origen = 'manual'`.
- **Tests:** `test-nodos.mjs` (caché que pega, caché que no, `sin_transcript` que no se re-pide,
  prioridad nuevo-vs-vuelto) y los del dominio de la app.

## Hecho cuando

1. Una corrida transcribe un video, y **la siguiente que lo vuelva a ver no le paga a Supadata** —
   medido con `llamadas.supadata` contra los videos distintos que entraron.
2. `select count(*) from public.processed_items` deja de crecer más rápido que
   `app.candidatos` + `outputs`.
3. La pantalla Transcribir del equipo **no muestra ninguna fila del motor** (`leerSueltas` sigue
   dando cero, `leerFallidas` sigue siendo corta).
4. 🐤 **Canario:** `select count(*) from app.transcripciones where origen = 'motor'` nace en **cero**
   por definición (la migración no backfillea). **La primera fila la escribe el motor**, así que la
   primera es uso real y no una verificación. A mirar después de la primera corrida del equipo.
