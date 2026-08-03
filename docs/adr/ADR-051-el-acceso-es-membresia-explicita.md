# ADR-051 — El acceso es una membresía explícita, no una herencia; y la agencia es un flag

- **Estado:** aceptada — 2026-08-02. **Enmienda [ADR-046](./ADR-046-el-cockpit-es-multi-tenant.md)**
  (que modeló una empresa por persona y la visibilidad bajando por el árbol) y **activa el
  disparador de [ADR-047](./ADR-047-aislamiento-en-dos-capas.md)** (la Capa 2 deja de ser
  diferible). Se decidió con Alejandro al aterrizar el modelo de acceso sobre el caso real.

- **Contexto:** ADR-046 se escribió con una suposición razonable y equivocada: que las tres
  empresas eran marcas del mismo grupo y que cada persona pertenecía a una. Al bajarlo a tierra
  aparecieron cuatro hechos que cambian el modelo:

  1. **Son clientes externos.** Gente de afuera se loguea al cockpit. El aislamiento deja de ser
     higiene interna y pasa a ser una promesa que alguien puede reclamar.
  2. **Una cuenta puede pertenecer a varias empresas**, con un switch en el nav para saltar entre
     ellas. `usuarios.client_id` singular no lo expresa.
  3. **Los dueños de la agencia son dos personas, ven todo, y no deben aparecer en ninguna
     superficie del cliente.** Alejandro lo llamó *"secret owner"*, y son dos requisitos distintos
     pegados: acceso total **e** invisibilidad.
  4. **El equipo de la agencia no es transversal.** Majo y Jero son de una sola empresa y no deben
     tocar las otras. O sea que "ser de la agencia" tampoco implica ver todo.

  Y un hallazgo del código ya escrito, que este ADR también arregla: hoy
  [`lib/supabase/scoped.ts`](../../apps/dashboard/lib/supabase/scoped.ts) filtra las tablas de grano
  empresa por **`client_id in (visibles)`** —el subárbol entero del usuario— **sin importar qué
  cockpit esté abierto**. Con un usuario que alcance más de una empresa, eso **mezcla** voces,
  proyectos y referentes de varias en una sola pantalla. Hoy no está roto porque hay un tenant; con
  el segundo sería otra vez un número que se ve razonable y está mal.

- **Decisión:**

  1. **La membresía es la unidad de acceso.** Nace `app.usuarios_clientes (usuario_id, client_id,
     rol)` y mueren `usuarios.client_id` y `usuarios.rol`.

  2. **El rol vive en la membresía, no en el usuario.** *"¿Qué puede hacer esta persona?"* deja de
     tener una respuesta global y pasa a tener una **por empresa** — que es la forma de la pregunta
     cuando el que la hace es el dueño de una de ellas.

  3. **`app.usuarios.es_dueno boolean`.** Alcanza todas las empresas sin membresía, y **queda fuera
     de toda superficie que liste personas** (la auditoría de `app.eventos` y cualquier futura
     pantalla de accesos). Es el "secret owner", con sus dos mitades explícitas.

  4. **`clients.parent_id` deja de gobernar el acceso.** Se queda como **linaje** —de quién es este
     cliente: facturación, agrupar el selector, reportes— y el acceso a un sub-cliente de Retia es
     una membresía como cualquier otra.

  5. **El filtro de datos es siempre la empresa del cockpit abierto**, nunca el conjunto de
     empresas alcanzables. **La membresía decide a qué cockpits entrás; no qué filas ves adentro.**
     Es la regla que arregla la mezcla del contexto.

  6. **La Capa 2 (RLS) entra antes del primer login externo.** ADR-047 ya dejó el disparador
     escrito; el punto 1 del contexto lo activa. Y esta decisión además la abarata: la policy es
     `es_dueno or client_id in (select client_id from app.usuarios_clientes where usuario_id =
     auth.uid())` — una subconsulta plana, sin recursión.

- **Alternativas descartadas:**
  - **Que el rol SEA la empresa** (`30X`, `EstadoX`, `Retia`), que fue la propuesta inicial. Es
    donde está la intuición correcta —querer decir en un solo lugar "esta persona es de EstadoX"—
    pero fusiona dos preguntas y pierde la segunda: *dentro* de EstadoX, ¿califica el feed o solo
    mira? Expresarlo obligaría a `EstadoX-operador`, `EstadoX-sponsor`, `EstadoX-dev`: **tres roles
    por empresa, y tres más por cada cliente nuevo**. Con la empresa separada del rol, sumar un
    cliente es una fila. Y la empresa ya existe como entidad desde ADR-003: duplicarla como rol deja
    dos lugares que pueden discrepar.
  - **Un cliente `agencia` padre de los tres**, para que el árbol de ADR-046 diera el acceso total
    sin mecanismo nuevo. Era la propuesta hasta saber el punto 2 del contexto. Con membresías es
    innecesaria; y con clientes externos, colgar a tres empresas ajenas de un padre común confunde
    linaje con operación.
  - **Tres membresías para cada dueño en vez del flag.** Más "enumerable", y por eso se consideró en
    serio. Descartada por dos razones: sumar un cliente nuevo obligaría a acordarse de agregar dos
    filas, y olvidarse deja al dueño sin acceso a algo que él mismo opera —un fallo mudo—; y no
    resuelve la invisibilidad, que necesita un flag igual. Además es lo honesto: la agencia tiene la
    `service_role` key y las credenciales de n8n, así que puede leer todo de todas formas. Nombrarlo
    es mejor que disfrazarlo de membresía normal.
  - **Herencia por árbol para los sub-clientes de Retia.** Es gratis de operar: creás el cliente y
    todos los de Retia lo ven. Descartada porque *"¿quién puede ver los datos de Viera?"* dejaría de
    ser un `select`; porque en RLS obliga a un CTE recursivo **por fila leída**; porque es todo o
    nada (no se puede asignar una persona de Retia a un cliente suyo y no a otro); y sobre todo
    porque **crear un cliente otorgaría acceso a N personas sin que nadie lo decida**. Un alta
    silenciosa de permisos es exactamente lo que no se quiere con clientes externos.
  - **Dejar el rol en el usuario.** Sobrevive todos los casos de hoy (Majo es operadora en una sola
    empresa; cada jefe es sponsor de la suya), así que es la opción conservadora. Descartada por
    asimetría de costos: es **una columna ahora** contra **una migración más un refactor de las
    guardias después**, y el día que un cliente pida que nadie externo tenga rol dev sobre sus
    datos, con el rol en el usuario no se puede bajar solo ahí.

- **Consecuencias:**
  - (+) *"¿Quién puede ver los datos de EstadoX?"* se responde con una query. Con clientes externos,
    esa pregunta se hace.
  - (+) `scoped.ts` se **simplifica**: el grano empresa pasa de `in (visibles)` a la empresa del
    cockpit, y de paso muere la mezcla descrita en el contexto.
  - (+) El selector de empresa ya construido en la Fase 3 no cambia una línea: recién ahora va a
    tener más de una opción real que mostrar.
  - (−) **`usuarioActual()` deja de devolver `rol`**, porque el rol depende del cockpit abierto.
    Eso toca 7 lugares y **da vuelta un orden**: hoy [`app/page.tsx`](../../apps/dashboard/app/page.tsx)
    elige la zona inicial a partir del rol y después resuelve el cockpit; ahora tiene que resolver el
    cockpit primero. `exigirZona` sola deja de alcanzar y las guardias se unifican en `exigirTenant`.
    Es refactor de lo que se escribió en las Fases 2 y 3 — chico, pero real.
  - (−) **Los clientes externos que curan su propio feed escriben en la base desde el cockpit.** Es
    la combinación que más le exige a la Capa 2, y es otra razón por la que no puede quedar para
    después.
  - (−) **El alta de usuarios pasa a tres pasos manuales y se decidió dejarla manual una vuelta
    más** (decisión de Alejandro, con el riesgo sobre la mesa). El modo de falla es mudo: una
    membresía con la empresa equivocada mete a una persona en el cockpit de otro cliente **sin un
    solo error**. Mitigación sin código: la migración deja escrita la query de verificación
    post-alta —*"esta persona alcanza exactamente estas empresas"*— y darla por corrida es parte del
    alta. **Disparador para automatizarla: el primer usuario que no sea de la agencia.**
  - (−) Migración `018`, y toca `domain/tenant.ts`, `lib/auth.ts`, `lib/tenant.ts` y `scoped.ts`.

- **Modelo operativo que se asumió al decidir** (es dato, no decisión — si cambia, no cambia nada de
  arriba): Majo y Jero son de **una sola empresa** y no tocan las otras; cada cliente externo cura su
  propio feed y tiene su propio sponsor; los dueños de la agencia son **dos** y alcanzan todo.

- **Toca:** `core/schema/018_membresias.sql` · `apps/dashboard/domain/tenant.ts` (la visibilidad deja
  de resolverse recorriendo el árbol) · `lib/auth.ts` · `lib/tenant.ts` · `lib/supabase/scoped.ts` ·
  la Fase 6 del [plan multi-tenant](../agents/plan-multi-tenant.md), que deja de ser la última.
