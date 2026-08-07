# ADR-061 — El cockpit se nombra, no se adivina

- **Estado:** aceptada — 2026-08-07, **escrita después de ejecutar** (`c267980`), porque el bug ya
  estaba en producción y arreglarlo no podía esperar a un documento. Completa
  [ADR-047](./ADR-047-dos-capas-de-aislamiento.md) (es su Capa 1, un escalón más arriba) y cierra
  por construcción el modo de falla mudo que [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md)
  aceptó "una vuelta más". **No toca `core/`.**

> Es la tercera vez que este repo se come la misma familia de bug: una query válida, sobre una tabla
> que existe, que devuelve datos del tenant equivocado **sin un solo error**. Las dos anteriores
> están escritas (la vista que daba 18 filas para 17 referentes, el `.eq()` olvidado que ADR-047
> convirtió en error de compilación). Esta es la misma, pero un nivel arriba: no faltaba el filtro,
> faltaba saber **contra qué cockpit filtrar**.

- **Contexto:** el 2026-08-06, buscando por qué el botón *"Cargar más"* del feed no hacía nada,
  apareció que **las ~30 server actions del cockpit resolvían el tenant adivinando**.

  Una server action de Next **no recibe los `params` de la ruta**. Las páginas sí (`page.tsx` los
  recibe y los pasa), pero una acción invocada desde un componente cliente no tiene forma de saber
  qué URL está abierta. Así que todas llamaban `exigirTenant(zona)` a secas, y `resolverContexto`
  caía a su default documentado: *"el primero que alcance"*.

  Ese default es **correcto para la raíz `/`**, donde de verdad no hay URL que mirar y hay que
  mandar a la persona a algún lado. Es una adivinanza en cualquier otro lugar. Y era invisible
  mientras el sistema tuvo **una sola instancia activa**: adivinar acertaba el 100% de las veces.

  El **2026-08-03 20:46** entraron las 3 instancias de LinkedIn (migración `020`). `leerInstancias()`
  ordena por `(client_id, slug)` y filtra `estado = 'active'`, así que la primera pasó a ser
  **`30x/linkedin`**. Desde ese instante, para quien la alcanzara, **cada acción del cockpit de Retia
  leyó y escribió en el tenant de 30X**.

  Medido contra prod el 06/08, y esto es lo que hace que no sea teórico:

  | | |
  |---|---|
  | `app.candidatos` de `retia/reels` | **175**, y **0 calificados** |
  | `app.candidatos` de `30x/linkedin` | **0** — lo que leía *"Cargar más"* |
  | último evento `candidatos.calificar` | **2026-08-01 17:39**. Nada en 3 días |

  **A quién le rompía: 3 de 8**, y no es un detalle — es lo que explica por qué nadie lo reportó.
  Los 5 que solo alcanzan `retia` veían **una sola** instancia activa (`retia/linkedin` es `draft`),
  así que para ellos adivinar seguía acertando. Los rotos eran los **2 `es_dueno`** y la cuenta con
  `30x`+`estadox`: exactamente los tres que no son el equipo de redes.

  🩸 **El caso que más asusta no llegó a pasar por casualidad.** `ajustes/equipo/actions.ts`
  documentaba, como su defensa contra el modo de falla de ADR-051: *"la empresa no es un parámetro
  de ninguna de estas funciones; sale de `ctx.clientId`, o sea del cockpit abierto, y por eso no hay
  dónde equivocarse"*. Era cierto salvo por el detalle de que *"el cockpit abierto"* estaba
  adivinado. **Habría dado de alta a la gente de Retia en 30X**, con el gate de roles evaluado
  contra el cockpit equivocado. No pasó solo porque A5 todavía no estaba deployada.

- **Decisión:** `exigirTenant(zona, cliente, pipeline)` con los **dos segmentos obligatorios**, y
  lo mismo sus dos derivadas (`exigirPantallaDeCurar`, `exigirPantallaDeAjustes`). Cada server
  action recibe un `CockpitEnRuta` y lo pasa.

  Tres cosas que la decisión **no** es, y conviene decirlas porque las tres se propusieron:

  1. **No es un default fail-closed.** Se evaluó dejar los parámetros opcionales y tirar si faltan.
     Se descartó: eso convierte el bug en una excepción de runtime que aparece cuando alguien hace
     click. **Un parámetro que falta tiene que ser un error de compilación.** Es literalmente el
     argumento de ADR-047 Capa 1 (*"el problema nunca fue que no existiera la función, es que se
     puede no llamarla"*) aplicado un nivel más arriba. Al cambiar la firma, tsc listó los **25 call
     sites** sin que hubiera que buscarlos.
  2. **No es un permiso.** El cockpit viaja **desde el cliente** (`usarCockpit()`, que lo lee de la
     URL con `useParams`), o sea de la misma fuente que los `params` de una página. Eso suena a
     confiar en el browser y no lo es: `resolverContexto` lo valida contra `instanciasVisibles`, así
     que pedir un cockpit ajeno cae en el `redirect("/")` de siempre. Es un **selector**, no una
     credencial.
  3. **No se toca el default de `resolverContexto`.** Sigue existiendo *"el primero que alcance"*
     porque la raíz `/` lo necesita de verdad. Lo que se saca es la **puerta** por la que las
     acciones llegaban a él sin querer.

- **Alternativas descartadas:**

  - **Leer el header `Next-Url` en `exigirTenant`.** Arreglaba los 25 call sites de una y sin tocar
     ni un componente. Se descartó por dos razones: es un detalle de implementación de Next (y el
     `AGENTS.md` de la app avisa que esta versión difiere de lo que uno cree saber), y sobre todo
     **deja el bug arreglado sin dejar la regla escrita en los tipos**: la próxima acción se
     seguiría escribiendo sin pensar en el cockpit, y funcionaría por magia hasta que la magia
     cambiara de versión.
  - **Una cookie con el cockpit abierto, puesta por el layout.** Un punto único, cero parámetros.
     Se descartó porque **una cookie es del navegador, no de la pestaña**: Mani tiene 4 cockpits y
     dos pestañas abiertas en cockpits distintos se pisarían la cookie. El bug que reemplaza es del
     mismo color que el que arregla.
  - **Un `AsyncLocalStorage` con el contexto de request.** Misma objeción que el header, más
     maquinaria.

- **Consecuencias:**

  - **Agregar una server action ahora obliga a decir de qué cockpit es**, igual que agregar una
    tabla obliga a declarar su grano en `scoped.ts`. Las dos reglas se leen juntas: `scoped()`
    impide construir una query sin tenant; esto impide construir la guardia sin nombrar el cockpit.
  - **`usarCockpit()` deja de ser solo para armar links.** Su comentario decía que existía para que
    los componentes de abajo pudieran hacer `href` sin prop drilling; ahora es también la fuente del
    cockpit para las acciones. Sigue leyendo de la URL, así que no hay una segunda verdad.
  - **Ninguna pantalla puede probar que esto tomó efecto por sí sola** — misma trampa que ADR-058.
    Con un solo cockpit alcanzable, el antes y el después son indistinguibles. La verificación que
    vale es con una cuenta que alcance dos: se hizo el 07/08 y las 5 calificaciones aterrizaron en
    `retia/reels`.
  - **Queda una pregunta abierta que este ADR no contesta:** al equipo de redes la pantalla le
    funcionaba, y aun así no hay un solo evento `candidatos.calificar` entre el 01/08 y el 07/08.
    El bug no lo explica para ellos. Si hubo otra cosa frenándolos, todavía no está diagnosticada.

- **Toca:** `apps/dashboard/lib/auth.ts` (las 3 firmas) · los **11** `actions.ts` de `(zonas)` ·
  los **13** componentes cliente que los llaman · **no toca `core/`**, no hay migración, no hay
  cambio de contrato.
