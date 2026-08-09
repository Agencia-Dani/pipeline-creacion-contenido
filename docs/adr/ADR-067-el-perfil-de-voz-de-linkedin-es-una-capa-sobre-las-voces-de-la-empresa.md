# ADR-067 — El perfil de voz de LinkedIn es una capa sobre las voces de la empresa, y su interruptor no es `voces.activo`

- **Estado:** aceptada — 2026-08-08. Construye la mitad de cockpit de
  [ADR-055](./ADR-055-linkedin-es-un-pipeline-de-este-repo.md) §4 y **importa a este repo el ADR 002
  del repo de diseño** (`../maquina-linkedin/docs/adr/002`): *la unidad de configuración es la voz,
  no la empresa*. Se apoya en [ADR-049](./ADR-049-un-pipeline-sus-tablas.md) (tablas propias por
  pipeline) y sigue a [ADR-066](./ADR-066-un-cockpit-sin-motor-solo-muestra-lo-que-se-configura.md).

- **Contexto.** La `020` §3 creó `app.voces_linkedin` hace días y **nunca tuvo código**: ni lector ni
  escritor. Es la tabla que guarda lo único que la máquina de LinkedIn necesita saber para escribir
  como alguien — perfil, **firma** (R-2), espaciado (R-3), separación mínima (R-4), franjas, días y
  líneas rojas. Sin su pantalla, *"el cockpit está listo para configurar"* no tenía sujeto.

  El problema de diseño es que **cruza dos granos**, y ninguno de los dos es negociable:

  | | Tabla | Grano | Por qué |
  |---|---|---|---|
  | Quién es la voz | `app.voces` | **empresa** (`client_id`) | El roster es de la marca y lo comparten los dos pipelines |
  | Cómo habla en LinkedIn | `app.voces_linkedin` | **instancia** (`instance_id`) | PK `(instance_id, voz_id)`. Su firma y sus horarios son del cockpit, no de la empresa |

  📏 **Y una medición cambió el alcance.** ADR 002 daba por inventariadas las voces de 30X (Andrés y
  Daniel Bilbao) y por desconocidas las de EstadoX y Retia. **En el sistema pasa lo contrario:**
  `app.voces` tiene **3 filas y las 3 son de `retia`**; `30x` y `estadox` tienen **cero**. Y son
  justo las dos empresas cuyo cockpit de LinkedIn está `active` (`retia/linkedin` está en `draft`).

  🩸 Peor: **30X y EstadoX no tienen cockpit de reels.** Sus únicas instancias son las de LinkedIn.
  O sea que no existe ninguna otra pantalla en todo el sistema desde donde darles de alta una voz.

- **Decisión.** Tres reglas.

  **1. El perfil es una capa opcional sobre las voces de la empresa.**

  La pantalla (`curar/voces`, ramificando por `workflowId` como ya hace `curar/referentes`) lee las
  dos tablas y las cruza **en memoria**, en dos bloques: *Configuradas para LinkedIn* y *Otras voces
  de la empresa*. La escritura es un `upsert` con `onConflict: "instance_id,voz_id"` — la PK
  compuesta de la `020`, que incluye el tenant porque PostgREST exige que el arbiter coincida con un
  unique existente. **Cero migración.**

  **2. 🔴 Lo que activa una voz en LinkedIn es que exista su perfil. NUNCA `voces.activo`.**

  Ese flag significa hoy, de facto, *"corre en reels"*: lo consume `leerConfigOperar` para armar el
  plan del motor. Las dos formas de usarlo desde acá son un bug:

  - **Leerlo** para filtrar la lista escondería voces perfectamente válidas para LinkedIn.
  - **Escribirlo** —el reflejo natural de poner un interruptor en la pantalla— **apagaría proyectos
    de reels en producción, sin un solo error**.

  Por eso esta pantalla **no tiene interruptor**: quitar una voz de LinkedIn borra su fila de
  `voces_linkedin` y no toca `app.voces`. Un pipeline, su propio interruptor.

  **3. La pantalla puede dar de alta una voz de la empresa, y esa es la única escritura que hace
  sobre `app.voces`.**

  Es una consecuencia directa de la medición: sin esto, *"listo para empezar a configurar"* era falso
  justo en las dos empresas donde se puede entrar, y cada voz nueva habría que pedirla por SQL. El
  alta reusa `crearVoz` y le fija dos valores que **no** salen del formulario:

  - **`activo: false`, y es una guarda, no un default.** En Retia —la única empresa con los dos
    cockpits— una voz nacida activa entraría al plan del motor de **reels** sin que nadie lo pidiera.
    Que el interruptor de LinkedIn sea la existencia del perfil (regla 2) es justamente lo que
    permite dejar este en `false` para siempre desde acá.
  - **`criterios_relevancia` con una frase explícita.** Es `not null` desde la `014` y es un concepto
    de reels (el gate de ADR-040). Poner `''` sería el fallo mudo que esa misma ADR describe —una voz
    que juzga con la mitad del contexto, en verde y sin avisar—, así que se escribe qué pasó.
    Inofensivo de todos modos: esos criterios solo se consultan cuando corren los proyectos de la voz
    en reels, y esta nace sin proyectos y apagada.

  **Las altas no tocan nada existente**, que es lo que las distingue de la regla 2.

- **Lo que valida el dominio y la base no.** `text[]` acepta cualquier cosa y el motor que va a leer
  esos arrays no. `domain/linkedin-voz.ts` replica los dos `check` de la `020` (`espaciado between 1
  and 3`, `separacion_h > 0`) y agrega lo que falta:
  - **Formato `HH:MM` y padding.** `"8:00"` y `"08:00"` son **la misma hora del día** y dos strings
    distintos: sin normalizar, la cola tendría dos franjas donde hay una. El padding además hace que
    ordenar como texto ordene como hora — sin él, `"8:00"` va después de `"17:30"`.
  - **Vocabulario cerrado de días**, sin acentos ni mayúsculas, ordenados por la semana y no
    alfabéticamente (que daría *domingo, jueves, lunes…*).
  - **Al menos una franja**: la base acepta el array vacío, y una voz sin ninguna franja **no se
    puede programar nunca**.
  - **Techo de 168 h** en la separación, que la base no tiene: más de una semana no es una separación
    mínima, es *no publicar*, y el único modo de escribirlo es un typo.

  Los días **sí** pueden ir vacíos: *"todavía no sabemos cuáles"* es un estado legítimo y por eso la
  columna es nullable. `null` y `[]` no significan lo mismo y la escritura los distingue.

- **Alternativas descartadas:**
  - **Voces propias de LinkedIn** (`voces_linkedin` con su propio `nombre`, sin FK). Rompe la PK de
    la `020`, pide migración, y contradice ADR-049 en su mitad linda: lo común es común. Con Retia
    —que tiene los dos cockpits— habría dos rosters de las mismas personas divergiendo.
  - **Derivar la voz del proyecto.** Contradice ADR 002 de frente: la unidad es la voz.
  - **Un interruptor `activo` propio en `voces_linkedin`.** Una columna más para expresar lo que la
    existencia de la fila ya expresa. Y abre el estado *"configurada pero apagada"*, que nadie pidió.
  - **Reusar `voces.activo` para los dos pipelines.** Es el bug de la regla 2, escrito como decisión.
  - **No dejar crear voces desde acá** y resolverlo con un runbook de SQL. Deja la pantalla abriendo
    vacía y sin salida en las dos empresas activas — o sea el entregable incumplido.
  - **Hacer atómicos el alta de la voz y su perfil** (función de Postgres o transacción). El peor
    caso es una voz sin perfil, que es un estado **legítimo y visible** —aparece en *sin
    configurar*— y se arregla apretando Guardar. No vale una función en `core/`.

- **Consecuencias:**
  - (+) Las 3 empresas tienen dónde configurar, y las 2 sin voces pueden empezar de cero **hoy**.
  - (+) Ningún camino desde LinkedIn puede apagar un proyecto de reels.
  - (+) `curar/voces` pasa a ser la segunda pantalla compartida; el test
    `🔀 toda pantalla compartida tiene que ramificar en su page.tsx` **ya disparó** al entrar y esa es
    exactamente su función.
  - (−) Dos pantallas para la misma ruta, con formularios distintos. Aceptado por ADR-049: con dos
    pipelines, un componente genérico prematuro cuesta más que la duplicación.
  - (−) `criterios_relevancia` queda con una frase de relleno en las voces nacidas desde LinkedIn.
    Es visible y dice por qué; el día que una de esas voces corra en reels, hay que escribirlos.
  - (−) La validación de los arrays vive solo en la app: alguien escribiendo por SQL puede meter
    `"25:00"`. La lectura lo filtra en vez de romper el render, igual que hace el banco con `fuente`.

- **Verificado sin escribir en prod**, con la forma exacta de la app y un `voz_id` inexistente:
  `23503` (FK — o sea que **todas las columnas y tipos pasaron**), `PGRST204` al agregar una columna
  inventada, y `23514` al mandar `espaciado: 9`. La tabla siguió con **0 filas**.

- **Toca:** `apps/dashboard/domain/linkedin-voz.ts` (nuevo, +16 tests) ·
  `apps/dashboard/lib/voces-linkedin.ts` (nuevo) ·
  `app/[cliente]/[pipeline]/(zonas)/curar/voces/{page.tsx,pantalla-linkedin.tsx,actions-linkedin.ts}` ·
  `apps/dashboard/lib/auth.ts` (`exigirCockpitDePipeline`, extraída de la copia que ya vivía en
  `curar/referentes/actions-linkedin.ts`) · `domain/pipelines.ts` + su test · `curar/page.tsx` (copy
  por pipeline). **No toca datos, ni el motor, ni `core/`.**
