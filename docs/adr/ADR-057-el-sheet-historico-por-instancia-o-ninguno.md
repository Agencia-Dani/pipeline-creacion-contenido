# ADR-057 — El Sheet Histórico: por instancia, o ninguno

- **Estado:** **aceptada — 2026-08-04, opción 2 (el Sheet se muere), en dos pasos.** Se abrió sin
  decisión y se cerró el mismo día con Mani. Cierra
  [plan multi-tenant §14.4](../agents/plan-multi-tenant.md).

  | Paso | Qué | Estado |
  |---|---|---|
  | 1 | **El export CSV** en `/curar/historicos`, con las **15 columnas del Sheet en su orden** | ✅ **hecho y en prod** (`domain/csv.ts` + su test, `leerTodosLosAprobados`, el Server Action y el botón) |
  | 2 | **Sacar los nodos del Sheet** del archivado | ✅ **HECHO el 2026-08-05.** 3 nodos borrados **a mano en el editor de n8n** (`Preparar filas Sheet`, `Append al Sheet Histórico`, `Reconvergir tras Sheet`), reconectando `Registrar outputs` → `Preparar borrado candidatos`; el resto (`Config` sin `sheet_id`/`sheet_tab`, `Armar filas archivado` sin la fila del Sheet) por `n8n:push`. **No fue un re-import**: importar crea un workflow con id NUEVO y se lleva el webhook, el target del dispatcher y la activación. El archivado quedó en **17 nodos** y `n8n:diff` limpio en los 5 |

  **El orden no es cosmético: es lo único que hace que la opción 2 no sea una pérdida.** Entre el
  paso 1 y el paso 2 conviven los dos, y eso está bien — el equipo nunca se queda sin el
  descargable.

  🔴 **Lo que hay que hacer el día del paso 2**, para que no se descubra después:
  1. Sacar `Preparar filas Sheet` y `Append al Sheet Histórico`, y `sheet_id`/`sheet_tab` del `Config`.
     Ojo con `Reconvergir tras Sheet` (Merge): con una sola rama entrando, el Merge sobra.
  2. Borrar los placeholders `<<GOOGLE_SHEET_ID>>`, `<<NOMBRE_PESTANA_SHEET>>` y
     `<<CREDENCIAL_GOOGLE_SHEETS>>` de la tabla del README del archivado y del `.env`.
  3. Corregir las dos promesas: el [onboarding](../onboarding-equipo-redes.md) (la fila *Google Sheet
     "Histórico"* y la pregunta *"Aprobé un video pero desapareció de la lista"*) y el
     [one-pager](../one-pager-reels-mvp.md) (*"Google Sheets → Excel"* pasa a ser el cockpit).
  4. Avisarle al equipo **antes**, y no dar de baja el Sheet viejo: queda como archivo muerto.

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

- **Decisión: opción 2**, con el export construido primero. Lo que la inclinó no fue el ahorro sino
  **de quién es el dato**: con el Sheet, el histórico de cada empresa vive en un archivo de Google que
  cuelga de una cuenta personal (`Google Sheets - Daniel Tovar`) y que el aislamiento del cockpit no
  alcanza. Parametrizarlo hubiera hecho eso **tres veces**, no una.

- **Cómo quedó el export** (paso 1, ya en prod). Las 15 columnas del Sheet, en su orden, para que una
  planilla armada encima del export viejo siga sirviendo — incluida `ESTADO`, que acá siempre vale
  `aprobado`: una columna que desaparece rompe a quien lea por posición.

  - **Es un Server Action, no una route.** Devuelve el texto y el navegador lo baja como Blob. Así el
    export pasa por **la misma guardia de tenant** que la pantalla (`exigirTenant`), sin una segunda
    copia de esa lógica que se pueda atrasar — que es exactamente el modo de falla que ADR-047 pone
    en la Capa 1.
  - **Tres detalles que deciden si se siente igual de bueno que el Sheet, y cuestan poco:** BOM al
    principio (sin él Excel abre *ComunicaciÃ³n*); **citar siempre**, no solo cuando hace falta —
    la columna que importa es `SCRIPT`, que trae transcripciones con saltos de línea y comillas, y
    un escapado condicional acierta en las 14 fáciles y falla justo en la que corre las columnas;
    y **UTF-16LE + TAB en vez de UTF-8 + coma** (2026-08-08, después de que Mani lo abriera en
    Excel y viera "texto sucio"). Excel **no detecta el delimitador**: lo toma del ajuste regional,
    y en región Colombia —la de Majo y Jero, que son quienes lo abren— el separador de lista es
    `;`, así que el CSV con comas le caía **entero en la columna A**, con las comillas de escape a
    la vista y el `SCRIPT` partiendo la fila en dos. Se probaron las cuatro combinaciones **en el
    Excel real**, no en teoría:

    | | columnas | acentos |
    |---|---|---|
    | BOM UTF-8 + coma (lo que había) | ❌ | ✅ |
    | BOM UTF-8 + `sep=,` | ✅ | ❌ *M√©tricas* |
    | BOM UTF-8 + tab | ❌ | ✅ |
    | **UTF-16LE + tab** | ✅ | ✅ |

    La fila que sorprende es la segunda: `sep=,` es la receta que todo el mundo cita, y **funciona
    a medias** — cuando Excel lee esa directiva deja de mirar el BOM y cae a MacRoman, así que
    arregla las columnas y rompe los acentos. Era la opción elegida hasta que se midió.
    **El costo de la que quedó, aceptado:** el archivo ya no es un CSV de manual (un parser que
    asuma coma y UTF-8 necesita `encoding="utf-16"` y `sep="\t"`) y pesa el doble. Se acepta porque
    el consumidor declarado es Excel y hoy no hay ningún consumidor máquina. **Numbers no paga
    nada:** se verificó que abre igual de bien que antes.
  - **Tope de 5.000 filas**, que corta y avisa en vez de tumbar el request. Con ~60 aprobados por
    semana son ~18 meses; cuando muerda, la respuesta es paginar por fecha, no subir el número.
  - **Verificado contra prod:** las 31 filas aprobadas reales, releídas con un parser RFC 4180
    independiente ⇒ 31 registros, **las 15 columnas en todas**, acentos y emoji de calificación
    intactos.

- **Hecho cuando.** Paso 1: ✅ el equipo puede bajarse el histórico del cockpit. Paso 2: el nodo no
  existe, `grep -c "Append al Sheet" Workflows/workflow-archivado/workflow.json` da 0, y nadie
  extraña el Sheet.
