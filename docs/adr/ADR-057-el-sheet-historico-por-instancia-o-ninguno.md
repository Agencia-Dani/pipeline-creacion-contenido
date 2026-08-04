# ADR-057 — El Sheet Histórico: por instancia, o ninguno

- **Estado:** 🔧 **abierta — 2026-08-04.** Es la única de las 57 que se abre sin decisión tomada, y a
  propósito: las dos salidas son técnicamente baratas y la pregunta que las separa **no es técnica**.
  La decide Mani con Dani. Cierra [plan multi-tenant §14.4](../agents/plan-multi-tenant.md).
  **Bloquea prender el segundo cockpit con datos reales**, no antes.

- **Contexto.** El archivado appendea los aprobados de la semana a un Google Sheet. `instance_id`
  viaja por el body del webhook y gobierna todo lo demás del workflow — pero `sheet_id` y `sheet_tab`
  son **constantes del nodo `Config`**:

  ```
  Append al Sheet Histórico → documentId = {{ $('Config').first().json.sheet_id }}
  Config.sheet_id           = "1Ngzjjsw2sMU-…"   (literal)   ·  Config.sheet_tab = "Historico"
  Config.instance_id        = {{ …webhook.body.instancia }}   ← la línea de al lado, y esa sí lee el body
  ```

  La parametrización se hizo para el tenant y **se saltó el Sheet**. Con un solo workflow de archivado
  sirviendo a todas las instancias ([ADR-050](./ADR-050-dispatcher-una-ejecucion-por-instancia.md)),
  el día que exista una segunda empresa con datos **sus aprobados se appendean al Sheet de Retia**.
  Es la clase de fuga que no falla, no avisa y produce datos verosímiles — la misma familia que los
  cinco uniques globales de [ADR-046](./ADR-046-el-cockpit-es-multi-tenant.md).

  **Lo que cambió desde que se escribió el Sheet, y es lo que abre la segunda salida.** El Sheet nació
  cuando el histórico no tenía otro lugar donde vivir. Hoy sí lo tiene:

  1. `outputs` es el **histórico canónico** por decisión explícita
     ([ADR-014](./ADR-014-outputs-historico-canonico-archivado.md)), y el Sheet es un afluente suyo:
     *"el Sheet se alimenta del histórico canónico"*, no al revés.
  2. El cockpit ya lo muestra entero: `/curar/historicos` (D6) lista lo aprobado de todas las semanas
     sobre `outputs`, paginado.
  3. Airtable —la herramienta con la que el Sheet compartía época— murió en D7.

- **La pregunta que hay que contestar, y por qué no la contesta un dev.** El Sheet tiene **dos
  promesas escritas** que el cockpit todavía no cubre del todo:

  | Dónde | Qué promete | ¿Lo cubre `/curar/historicos`? |
  |---|---|---|
  | [onboarding del equipo](../onboarding-equipo-redes.md) | *"El archivo de lo ya elegido. Solo lo consultan/descargan. No escriben ahí."* | Consultar sí. **Descargar no** — no hay export |
  | [one-pager del jefe](../one-pager-reels-mvp.md) | *"Todo queda en un histórico descargable (Google Sheets → Excel)"* | **No.** Es una promesa de formato, no de contenido |

  O sea: la parte de *ver* ya está reemplazada; la de *bajarse un Excel y trabajarlo aparte* no. Si
  esa parte hoy no la usa nadie, el Sheet es deuda. Si Dani abre ese Excel, el Sheet es producto.

- **Las dos salidas.**

  ### Opción 1 — Parametrizarlo (el Sheet sobrevive, uno por instancia)

  La regla ya está escrita y es de
  [ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md): *n8n lee su config por la fachada.*
  `sheet_id`/`sheet_tab` son config **por instancia**, así que dejan de ser constantes del nodo y
  pasan a `run-plan` (`?ambito=archivado`), leyéndose de `app.ajustes` o de una columna de
  `instances`.

  - **Toca [`core/contracts/run-plan.md`](../../core/contracts/run-plan.md)** ⇒ por eso esto es un
    ADR y no un task.
  - Después es un `npm run n8n:push -- archivado --nodos "Config"`: son `parameters`, **no** es
    re-import.
  - (−) Cada empresa nueva necesita **un Sheet creado a mano y su id cargado** antes de la primera
    corrida. Es alta manual nueva, en un sistema donde el alta ya es manual y está anotada como
    fricción (§10 del plan).
  - (−) Una credencial de Google (hoy `Google Sheets - Daniel Tovar`, una cuenta personal) pasa a
    tener permiso de escritura sobre los Sheets de **todos** los clientes.

  ### Opción 2 — Matarlo (propuesta de Mani, 2026-08-04)

  Sale el nodo `Append al Sheet Histórico`, sale `Preparar filas Sheet`, salen `sheet_id`/`sheet_tab`
  del `Config` y salen los placeholders `<<GOOGLE_SHEET_ID>>`, `<<NOMBRE_PESTANA_SHEET>>` y
  `<<CREDENCIAL_GOOGLE_SHEETS>>`.

  - (+) **Elimina el problema en vez de escalarlo.** No hay Sheet por instancia que crear, ni
    credencial de Google en el camino de escritura, ni un afluente del histórico que se puede
    desincronizar del canónico.
  - (+) Saca el único nodo del archivado que depende de una cuenta personal de Google.
  - (+) Es **borrar nodos ⇒ topología ⇒ re-import**. Conviene juntarlo con el re-import de D8, que ya
    está esperando por lo mismo (`fields.uuid`), y no gastar uno solo en esto.
  - (−) Rompe las dos promesas de la tabla de arriba **salvo que primero exista un export**. Un
    "Descargar CSV" sobre `/curar/historicos` es chico y lo hace el mismo dato que ya se lista.
  - (−) El Sheet es hoy la única copia del histórico **fuera** de Supabase. Como copia de seguridad
    es floja (parcial: solo aprobados, y solo desde que existe), pero no es cero.

- **Lo que NO está en discusión.** `outputs` sigue siendo el histórico canónico (ADR-014). Ninguna de
  las dos opciones toca eso, y por eso ninguna de las dos pone datos en riesgo: lo que se decide es
  si además hay una copia en Sheets y de quién es.

- **Recomendación.** **Opción 2, condicionada a construir el export primero.** El orden importa y es
  lo único que hace que la opción 2 no sea una pérdida: *export en `/curar/historicos` → confirmar con
  Dani y el equipo que reemplaza al Sheet → sacar los nodos en el re-import de D8*. Si el export no se
  construye, la opción 2 es romper una promesa para ahorrar un campo de config, y ahí gana la 1.

- **Hecho cuando.** O bien dos instancias archivan la misma semana y cada una escribe en **su propio**
  Sheet, verificado abriendo los dos (opción 1); o bien el nodo no existe, `/curar/historicos` exporta
  y el equipo obtiene el histórico desde el cockpit (opción 2).
