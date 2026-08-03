# ADR-053 — El repo es la forma, el live es el estado: los workflows se parchean por la API de n8n

- **Estado:** aceptada — 2026-08-02. Sucede al `deploy.mjs` deprecado (que resolvía placeholders
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
