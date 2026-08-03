# ADR-056 — Las zonas son rol ∩ pipeline, y el selector se parte en equipo y pipeline

- **Estado:** aceptada — 2026-08-03. Enmienda la superficie de
  [ADR-026](./ADR-026-cockpit-propio-en-next.md) y completa
  [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md) en lo que se **dibuja**.
  La dispara [ADR-055](./ADR-055-linkedin-es-un-pipeline-de-este-repo.md): con un segundo pipeline,
  dos supuestos que nunca habían fallado empiezan a fallar.

- **Contexto.** Hasta hoy el cockpit tiene **un solo pipeline** (reels) y **una sola empresa**
  (`retia`). Con eso, dos atajos funcionaban perfecto y ninguno se veía:

  1. **`zonasDe(rol)` alcanzaba para decidir el nav.** Las 4 zonas —`operar`, `curar`,
     `transcribir`, `entender`— existen en todos los cockpits porque solo hay un cockpit.
  2. **El selector listaba cockpits planos** (`empresa · pipeline`) y el layout lo escondía cuando
     había uno solo (`opciones.length > 1`). Con un cliente y una instancia, nunca se dibujó.

  **Los dos se rompen con LinkedIn, y de formas distintas:**

  - **`transcribir` no existe en LinkedIn.** Es la zona de ADR-031 (pegar enlaces → script
    literal), y LinkedIn ya es texto: su etapa `enriquecer` es `n/a` (ADR-055 §3). Un nav que la
    dibuje lleva a una pantalla que no tiene qué hacer, contra tablas que no existen. **Y el
    problema no es el link muerto: es que la zona `curar` de un pipeline lee tablas distintas que
    la del otro** (ADR-049), así que "qué zonas tiene este cockpit" deja de ser una pregunta del
    rol y pasa a ser también del pipeline.
  - **El selector plano miente sobre el equipo.** Alguien de **una sola** empresa con reels y
    LinkedIn vería *dos* opciones (`retia · Reels`, `retia · LinkedIn`) en un control que se llama
    "cambiar de cockpit" y que hasta hoy significaba *cambiar de empresa*. Y al revés: alguien que
    trabaja para dos empresas ve una lista donde la empresa y el pipeline están mezclados en el
    mismo string, así que **saltar de empresa y saltar de pipeline son el mismo gesto**. Son dos
    preguntas distintas: *de quién es el trabajo* y *cuál trabajo*.

- **Decisión.** Dos reglas, una por problema.

  **1. Las zonas visibles de un cockpit son `zonasDe(rol) ∩ zonasDe(pipeline)`.**

  Cada pipeline declara qué zonas implementa, en dominio puro y con test — no en el manifest de
  n8n, porque es una afirmación sobre **el cockpit**, no sobre el motor:

  | Pipeline | `operar` | `curar` | `transcribir` | `entender` |
  |---|---|---|---|---|
  | `short-form-content` (reels) | ✅ | ✅ | ✅ | ✅ |
  | `linkedin` | ✅ | ✅ | ❌ (`enriquecer: n/a`) | ✅ |

  La intersección se aplica en **los dos lados de la costura que ya existe**: el layout esconde
  (`zonasVisibles`) y la guardia del servidor impide (`exigirTenant` rechaza una zona que el
  pipeline no implementa, igual que ya rechaza una que el rol no alcanza). **La UI esconde, el
  servidor impide** — la regla de plan-cockpit §3.2, sin excepción nueva.

  **2. El selector se parte en dos: equipo y pipeline.**

  - **Selector de equipo** — las empresas que la persona alcanza. Se dibuja **solo si alcanza más
    de una**. Es literalmente sus membresías (ADR-051): si no hay fila, la empresa no está en la
    lista, y por eso **nadie ve el nombre de una empresa que no es suya**. Un `operador` de una
    sola empresa no se entera de que existen las otras: no ve el control.
  - **Selector de pipeline** — los cockpits **de la empresa abierta**. Se dibuja solo si esa
    empresa tiene más de uno.

  Al saltar de equipo, el destino es el **mismo pipeline en la empresa nueva si existe**, y si no,
  el primero que la persona alcance ahí. Nunca un 404 y nunca el cockpit de otro.

- **Alternativas descartadas:**
  - **Dejar `transcribir` visible y que la pantalla diga "no aplica".** Es más barato y es peor: una
    zona en el nav es una promesa. Y no resuelve lo de fondo —que `curar` lee tablas distintas por
    pipeline— así que habría que resolverlo igual, dos veces.
  - **Declarar las zonas en el `workflow.yaml`.** Tentador porque ya declara las 8 etapas. Descartado
    porque el manifest describe **el motor** (lo que corre en n8n) y las zonas son **del cockpit**:
    atarlas obligaría a que el dashboard leyera yaml en runtime, y a que un cambio de superficie
    pasara por el validador del contrato de workflows. La etapa `n/a` del manifest y la zona ausente
    del cockpit son consecuencias del mismo hecho, no la misma declaración.
  - **Derivar las zonas de la existencia de las tablas.** Automático y sin duplicación, pero pone una
    decisión de producto a merced de una migración: aplicar la `020` cambiaría el nav de todos los
    cockpits sin que nadie lo decida.
  - **Un solo selector, agrupado por empresa.** Menos controles, y con dos empresas × dos pipelines
    se ve bien. Descartado porque **vuelve a mezclar las dos preguntas en un gesto**: el caso que
    importa —alguien de dos empresas— es justo donde el agrupado obliga a leer la lista entera para
    encontrar el equipo. Y el pedido fue explícito: un selector que muestre *el equipo*, y solo el
    suyo.
  - **Guardar el último cockpit en una cookie** para saltar más rápido. Ya descartado por
    `domain/rutas.ts` cuando el tenant entró a la URL: *"una cookie de tenant es un bug de caché
    esperando"*.

- **Consecuencias:**
  - (+) Sumar un pipeline es **declarar sus zonas en una línea**, no tocar el layout ni las guardias.
  - (+) El selector de equipo pasa a ser la superficie visible de las membresías: se prueba que
    ADR-051 funciona **mirando la pantalla**, no leyendo la tabla.
  - (+) La intersección se testea en dominio puro con `node:test`, como el resto de `domain/`.
  - (−) Dos controles en vez de uno cuando alguien tiene empresas **y** pipelines múltiples. Es el
    caso de la agencia (`es_dueno`), o sea de dos personas, y a cambio el caso del cliente externo
    —que es el que va a crecer— queda más simple.
  - (−) Hay que acordarse de declarar las zonas de cada pipeline nuevo. Mitigado con el default
    seguro: **un pipeline que no declara nada no dibuja ninguna zona**, que falla ruidoso y visible
    en vez de mostrar pantallas rotas.

- **Toca:** `apps/dashboard/domain/pipelines.ts` (nuevo, con su `.test.ts`) ·
  `apps/dashboard/domain/roles.ts` (la intersección) · `apps/dashboard/lib/auth.ts` (`exigirTenant`
  valida la zona contra el pipeline) · `apps/dashboard/app/[cliente]/[pipeline]/(zonas)/layout.tsx` ·
  `apps/dashboard/components/selector-cockpit.tsx` (se parte en dos). **No toca datos, ni el motor, ni
  `core/`.**
