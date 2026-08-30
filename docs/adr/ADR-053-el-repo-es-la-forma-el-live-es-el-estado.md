# ADR-053 — El repo es la forma, el live es el estado: los workflows se parchean por la API de n8n

- **Estado:** aceptada — 2026-08-02, **enmendada el 2026-08-30** (§Enmienda al final: `n8n:push`
  cubre topología; el bloqueo no eran las credenciales sino que `cuerpoPut` manda las conexiones del
  live). Sucede al `deploy.mjs` deprecado (que resolvía placeholders
  por-cliente y nunca se usó) y le saca el filo al ritual que arrastran
  [ADR-044](./ADR-044-todo-nodo-caro-tiene-presupuesto.md) y
  [ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md): *"obliga a re-importar"*.

- **Contexto:** cambiar una línea de `jsCode` en el repo cuesta hoy un **re-import completo**:
  exportar el JSON, importarlo en n8n, y volver a poner a mano los placeholders
  (`<<DASHBOARD_URL>>`, `<<SUPABASE_URL>>`, `<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>`,
  `<<WEBHOOK_PATH_*>>`, `<<GOOGLE_SHEET_ID>>`, `<<NOMBRE_PESTANA_SHEET>>`,
  `<<CREDENCIAL_GOOGLE_SHEETS>>`), remapear credenciales y re-activar. ADR-048 llegó a escribir un
  *"checklist de los 6 placeholders, los 2 últimos muerden a mitad de corrida"*: la ceremonia es
  larga, manual, y **su modo de falla es silencioso** (el motor arranca y muere a los 20 minutos con
  Supadata devolviendo 401).

  El costo real no es el tiempo: es que **desalienta tocar los workflows**. Un cambio de una línea
  cuesta lo mismo que uno de veinte, así que los cambios se acumulan hasta justificar la ceremonia,
  y cada re-import mueve más superficie de la necesaria.

  Con `N8N_API_KEY` en el `.env` la instancia expone su API pública. Antes de decidir se verificó
  **contra la instancia real** (dos workflows desechables, creados, probados y borrados; el OpenAPI
  vive en `$N8N_BASE_URL/api/v1/openapi.yml`):

  | pregunta | respuesta verificada |
  |---|---|
  | ¿existe `PATCH`? | **no.** Solo `PUT /workflows/{id}`, cuerpo completo |
  | ¿pasa el body crudo del `GET`? | **no** — `400 must NOT have additional properties`. El `GET` devuelve 20 campos, el `PUT` acepta 9 |
  | ¿`settings` reemplaza o mergea? | **mergea.** Lo que no mandás sobrevive |
  | ¿`nodes` reemplaza o mergea? | **reemplaza.** Mandar 2 de 3 nodos borra el tercero |
  | ¿un `PUT` sobre un workflow **activo**? | sigue activo, el cambio entra, no hay que re-activar |
  | ¿sobrevive la identidad del webhook? | **sí** — `webhookId` y `path` intactos: las URLs no cambian |
  | ¿sirve el historial de versiones para rollback? | **no confiable** — `versionId` no cambió en un save y sí en otro |

  Las dos primeras filas explican por qué esto necesita una herramienta y no un `curl`. Las cuatro
  siguientes son las que lo hacen **seguro**: `settings` mergea (así que `binaryMode`, `timezone` y
  `errorWorkflow` no se pierden por omisión) y la identidad del webhook sobrevive (así que el
  dispatcher no se queda apuntando a una URL muerta).

- **Decisión:** **el repo es la forma, el live es el estado.** Los cambios se aplican con
  `core/scripts/n8n-sync.mjs`, que toma **el live como base** y le aplica **el delta del repo**,
  en vez de empujar el repo entero.

  Tres razones para no empujar el repo entero, las tres medidas en el diff repo↔live:

  1. **Credenciales:** el repo guarda `<<CREDENCIAL_GOOGLE_SHEETS>>`, un *nombre* sin id. n8n las
     referencia por `{id, name}`. Empujar el repo desbindea el nodo de Sheets.
  2. **Apify:** el repo guarda `actorId` como slug (`apify~instagram-profile-scraper`); n8n lo guarda
     como resource-locator `__rl` con el id interno. Empujar el repo rompe los 3 nodos de Apify.
  3. **`settings`:** `timezone: America/Bogota` (de la que dependen los crons del dispatcher) y
     `errorWorkflow` viven solo en live. El repo no los tiene y no debería: son binding de instancia.

  Los tres son la misma cosa: **hay estado que solo existe en la instancia**, y el repo no es su
  dueño. Con el live como base, ese estado ni se toca.

  **Los placeholders se aprenden del live, no se mapean en el `.env`.** Para cada string del repo con
  placeholders se busca su gemelo en live, se escapa el string, se reemplaza cada placeholder por un
  grupo de captura y se lee el valor real. `const KEY = '<ANTHROPIC_API_KEY>';` alineado contra
  `const KEY = 'sk-ant-…';` **enseña** el valor. El mapa se aprende de los 4 workflows a la vez, así
  que un placeholder que aparece en 6 nodos se aprende si **uno solo** alinea, aunque el nodo que
  estás cambiando haya cambiado tanto que ya no alinee.

  La alternativa evidente —una tabla `<<DASHBOARD_URL>> → $DASHBOARD_URL` en el `.env`— se descartó
  porque crea una **segunda verdad** sobre un valor que ya está en producción: el día que alguien
  cambia la URL en n8n y no en el `.env`, el sync la pisa hacia atrás y nadie se entera. Aprendido
  del live, el valor correcto es por construcción el que está corriendo.

  **Fail-closed:** si al terminar la sustitución queda un placeholder sin resolver, **no se hace el
  `PUT`**. Un `<ANTHROPIC_API_KEY>` literal empujado a producción es exactamente el modo de falla
  silencioso que este ADR viene a matar.

  **El snapshot es propio, no de n8n.** Antes de cada `PUT` se guarda el `GET` completo en
  `.n8n-snapshots/` (gitignored). El rollback es re-`PUT`ear ese archivo, verificado: restaura nodos y
  deja el workflow activo. El historial de versiones de n8n **no** se usa: `versionId` no cambió en
  uno de los dos saves probados.

  **Los ids de n8n van al `.env`, no a git** (`N8N_WF_<ALIAS>`), por la convención del repo
  (*"Secretos JAMÁS en git — ni credenciales ni IDs"*). El manifest no es su lugar.

- **Consecuencias:**
  - Cambiar un `jsCode` pasa de un re-import a `npm run n8n:push -- motor --nodos "Gate de relevancia"`.
    Los placeholders no se tocan nunca más a mano.
  - `npm run n8n:diff` entra al bucle de feedback: comparar repo↔live deja de ser un ejercicio manual
    en el editor. Ya encontró el primer hallazgo —el orden de ramas invertido en el motor, que hacía
    que `Cerrar run` escribiera `estado:'ok'` con métricas de N candidatos **antes** de insertarlos—
    y `npm run n8n:orden -- motor --apply` lo cerró el 2026-08-03.
  - **El orden de ejecución es un dato de layout**, y eso ahora tiene comando propio (`n8n:orden`):
    permuta las posiciones que los hermanos ya ocupan para que el orden del canvas sea el que
    declara el repo. Se midió que n8n v1 ordena por Y (arriba primero) y desempata por X, con un
    workflow desechable de 3 ramas cuyos órdenes por X y por Y eran distintos.
  - **El re-import completo no muere:** sigue siendo el camino cuando cambia la topología (nodos
    nuevos, conexiones nuevas, credenciales nuevas). El sync cubre el 90% barato, no el 100%.

    > 🔎 **Hallazgo del 2026-08-03, pendiente de decisión — la razón #1 de arriba ya no es cierta.**
    > Este ADR descarta empujar nodos nuevos porque *"el repo guarda `<<CREDENCIAL_GOOGLE_SHEETS>>`,
    > un nombre sin id"*. Medido contra la instancia (API v1.1.1): **`GET /api/v1/credentials` existe
    > y responde 200** con las 12 credenciales y su `{id, name, type}`, así que el mapa nombre→id se
    > puede **aprender de la instancia**, exactamente igual que se aprenden los placeholders y por la
    > misma razón (una tabla a mano sería una segunda verdad). Y los nombres del repo **ya coinciden**
    > con los reales desde el arreglo del 03/08: `Supabase account` ×26, `Run Plan Header` ×4,
    > `Webhook Motor Header` ×3, `Webhook Descubrimiento Header` ×1; el único que sigue siendo
    > placeholder es `<<CREDENCIAL_GOOGLE_SHEETS>>`, que se aprende del live como cualquier otro.
    >
    > O sea: **cubrir topología es ahora una decisión, no una limitación de la API.** Lo que queda por
    > decidir es si conviene —un `push` que crea nodos también puede borrarlos, y `nodes` **reemplaza**—
    > y con qué red (¿`--nodos` explícito obligatorio? ¿confirmación humana cuando el delta borra?).
    > La instancia además expone `POST /workflows`, `/activate`, `/deactivate`, `/archive` y
    > `GET /executions`, todos sin usar. **`/variables` y `/projects` dan 403 por licencia**, así que
    > no son opción para config por tenant. Cuando se decida, es **enmienda de este ADR**, no uno nuevo.
  - `core/scripts/` gana una dependencia dura de la API de n8n. Si n8n cambia el schema del `PUT`,
    `n8n-sync` se rompe; por eso valida contra el OpenAPI **de la instancia** y no contra una copia.
  - El repo sigue sin ser fuente de verdad de lo que corre. **`diff` es lo que lo mantiene honesto**,
    y por eso es el comando que se corre siempre, no el que se corre cuando uno se acuerda.

- **Alternativas descartadas:**
  - **`PUT` del repo completo con placeholders resueltos del `.env`** (lo que iba a ser `deploy.mjs`):
    rompe credenciales, Apify y `settings`, y necesita mantener la tabla de placeholders a mano.
  - **Editar a mano en el editor de n8n y bajar el JSON después:** invierte la dirección (el live
    sería la fuente) y deja el repo como copia que se atrasa sola. Es lo que ya venía pasando.
  - **Usar el historial de versiones de n8n como rollback:** `versionId` no es confiable como
    marcador de save (medido).

---

## Enmienda — 2026-08-30: `n8n:push` cubre topología, y el bloqueo no era el que este ADR nombró

*Cierra el 🔎 de arriba y el [§14.2 de plan-multi-tenant](../agents/plan-multi-tenant.md). Toca
`core/scripts/n8n-sync.mjs`. Sin migración, sin cambios en los `workflow.json`.*

### 🩸 La razón que este ADR daba no solo caducó: nunca fue el bloqueo

ADR-053 descarta empujar nodos nuevos con la razón #1 — *"el repo guarda
`<<CREDENCIAL_GOOGLE_SHEETS>>`, un nombre sin id"*. Dos cosas, las dos medidas el 2026-08-30:

1. **El mapa nombre→id se aprende.** `GET /api/v1/credentials` responde **200 con 12 credenciales,
   las 12 con `{id, name, type}`**. Se aprende de la instancia igual que los placeholders y por la
   misma razón: una tabla a mano sería una segunda verdad.
2. **Y ya no queda ni un caso que resolver.** Los 6 `workflow.json` referencian **4 nombres
   distintos**, todos sin `id`, y los 4 existen en la instancia: `Supabase account` ×31 ·
   `Run Plan Header` ×5 · `Webhook Motor Header` ×4 · `Webhook Descubrimiento Header` ×1.
   **`<<CREDENCIAL_GOOGLE_SHEETS>>` no vive en ningún workflow activo** — se fue con los 3 nodos del
   Sheet (ADR-057) y solo sobrevive en dos fixtures de `dist/`.

🔑 **El bloqueo real era otro, y ningún doc lo nombraba: `cuerpoPut()` manda
`connections: live.connections`, siempre.** Aunque el push supiera crear el nodo, **llegaría
huérfano**: existe en el canvas y no corre. *Un obstáculo escrito envejece igual que un canario:
este llevaba 27 días señalando la puerta equivocada.*

### 1. Cuando el push lleva topología, las conexiones vienen del REPO, enteras

No un merge quirúrgico de "solo las aristas del nodo nombrado": **una conexión es un par**, así que
cablear A→B toca la entrada de A aunque el nodo nuevo sea B, y lo "quirúrgico" dejaría grafos a
medio cablear — una mitad que no avisa, porque el nodo corre y no recibe nada. `n8n:diff` **ya**
clasifica las conexiones como `topologia`, o sea que el repo ya se considera el dueño de la forma
del grafo; esto lo hace cierto también al escribir.

📏 Riesgo medido, no supuesto: `n8n:diff` está verde, así que las conexiones de los 5 workflows
sincronizados **ya son idénticas a las del repo**. El delta arranca en cero.

### 2. Un nodo nuevo trae todo del repo — es la única fuente que tiene

Un nodo que ya existe nunca toma `position`, `credentials`, `id` ni `webhookId` del repo: son
identidad y layout de la instancia. **Un nodo nuevo no tiene gemelo del que protegerlos**, así que
viene entero del repo, con dos excepciones:

- **`credentials`**: el `id` se aprende de la instancia por nombre.
- **`webhookId`**: se omite y lo emite n8n. El del repo salió de otra instancia; reusarlo puede
  chocar o resucitar una URL vieja.

Y **`position` sí viaja**, que es lo contraintuitivo: en n8n v1 la posición en el canvas **es** el
orden de ejecución de las ramas hermanas (medido, es lo que `n8n:orden` existe para arreglar).
Dejar que n8n ubique el nodo sería dejar que n8n elija la semántica.

### 3. La red de seguridad: nombrar es consentir

`nodes` **reemplaza** — el que crea también borra. Tres frenos, y ninguno es un prompt (los 5
comandos del repo son dry-run + `--apply`, y eso tiene que seguir sirviendo sin TTY):

| | |
|---|---|
| **`--nodos` obligatorio, pero solo si el delta lleva topología** | Cambiar un `jsCode` sigue costando `n8n:push -- motor` a secas, que es lo que este ADR vino a abaratar. La obligación aparece donde `nodes` reemplaza de verdad |
| **`--borrar "A,B"` con los nombres exactos** | Nombrar lo que desaparece es el consentimiento. Se descartó una bandera booleana: se copia de un comando anterior sin releerla, y ahí autoriza el borrado de hoy con la decisión de ayer |
| **Fail-closed en credenciales** | Un nombre que no resuelve —o dos credenciales que comparten nombre, donde elegir es adivinar— niega el push entero. Misma regla que los placeholders, y por la misma razón: los **dos** re-imports fallidos del 03/08 fueron por elegir mal en un desplegable |

**Y `--borrar` también nombra al nodo ORIGEN que pierde cableado**, no solo al que desaparece. Una
arista puede caer sin que se borre ningún nodo (un recableado: A ya no alimenta a B, los dos siguen
ahí). **B corre en vacío y termina en verde** — peor que un nodo borrado, que al menos se nota.
Una sola regla para los dos casos: *`--borrar` nombra lo que pierde algo.*

### 4. 🔴 Un push no puede dejar nodos huérfanos

Pedido de Mani, y es el freno que las tres banderas no dan: si `--nodos` es parcial, el grafo
resultante puede tener un nodo que el repo ya no cablea y que nadie nombró en `--borrar`. **Queda
vivo, inalcanzable y mudo.**

El push calcula la alcanzabilidad **del grafo resultante** y, si algún nodo queda inalcanzable desde
todo trigger, **se niega y lo nombra**: o se cablea, o se saca (y entonces va en `--borrar`).

La definición de *trigger* y de *alcanzable* **no se inventa acá**: es la de
[`Workflows/auditar-workflows.mjs`](../../Workflows/auditar-workflows.mjs) §2, que ya audita
exactamente este invariante sobre el repo. Acá se aplica al grafo que va a quedar en la instancia.

### Consecuencias

- (+) **El último ritual manual muere.** Agregar un nodo pasa de re-import completo —el paso donde
  se pierden las credenciales y vuelven los placeholders a mano— a un comando.
- (+) El re-import queda solo para lo que la API no cubre: crear un workflow desde cero.
- (+) `n8n:diff` deja de reportar `topologia` como *"esto no lo puedo arreglar"*.
- (−) El repo pasa a ser dueño de la forma del grafo al escribir, no solo al comparar. Un
  `workflow.json` mal editado ahora puede desconectar producción. Lo acotan las 4 redes de arriba,
  el snapshot previo y `n8n:restore`.
- (−) `core/scripts/` suma dependencia de `GET /credentials`. Si n8n la cierra por licencia —como ya
  hace con `/variables` y `/projects`, que dan **403**— el push de topología se cae. Falla cerrado.
- (−) La regla "nombrá lo que pierde algo" es una fricción real en recableados grandes. Es
  deliberada: el recableado silencioso es el modo de falla que este ADR persigue desde el título.
