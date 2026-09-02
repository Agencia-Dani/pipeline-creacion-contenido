# Pipeline de Creación de Contenido

Central única de los workflows de n8n de creación de contenido de la agencia (Agencia-Dani).
Hoy: el MVP de reels (motor de detección/transcripción + cockpit propio + histórico). El núcleo
está hecho para que sumar un flujo o un cliente sea clonar y configurar, no construir de cero.

## Mapa de docs

Dónde vive cada cosa, para revisar, cambiar o no perderse. El **cómo usar** las 4 docs de trabajo está
en §Agent skills; acá solo se ubican.

**Norte y producto (qué/por qué)**
- [README.md](README.md) — visión del sistema central (puerta de entrada).
- [ROADMAP.md](ROADMAP.md) — norte + checklist del MVP. **Gana sobre cualquier otro doc** (ROADMAP §1).
- [PLAN.md](PLAN.md) — arquitectura, invariantes (§2.5), fases, tabla-resumen de ADRs (§3.1).
- [docs/one-pager-reels-mvp.md](docs/one-pager-reels-mvp.md) — one-pager no técnico para el jefe.

**Estado y dominio (para trabajar)**
- [docs/agents/handoff.md](docs/agents/handoff.md) — estado vivo del repo (leelo al empezar la sesión).
- [docs/agents/context.md](docs/agents/context.md) — glosario de dominio (lenguaje ubicuo).
- [docs/agents/dev-doc.md](docs/agents/dev-doc.md) — los 3 workflows nodo por nodo + mapa de datos (por tabla).
- [docs/agents/mapa-campos.md](docs/agents/mapa-campos.md) — 🪦 **HISTÓRICO, no vigente.** Mapea la
  base de **Airtable**, purgada el 2026-08-03: sus "9 tablas" y "12 páginas" son de ese mundo (hoy
  son 17 pantallas sobre Postgres). Sirve para saber **qué campo servía para qué y por qué** —
  información que no está en otro lado—, **no** para saber qué existe hoy. Para eso, `core/schema/`
  y el código. *Este renglón lo citaba como "el mapa del cockpit", sin salvedad.*

- [docs/agents/plan-cockpit-propio.md](docs/agents/plan-cockpit-propio.md) — el plan del **cockpit propio**
  que reemplazó a Airtable (ADR-025..028): componentes, stack y roadmap D0–D8.
- [docs/agents/plan-orden-y-filtro.md](docs/agents/plan-orden-y-filtro.md) — el plan de **orden y
  filtro** en las 4 pantallas de video (ADR-076): 7 tareas, dominio puro + una barra compartida.
  **Sin migración, sin n8n, sin `core/`.** Su hallazgo ordenador: *el default de las cuatro es "no
  reordenes"*, porque las cuatro ya llegan ordenadas por alguien y reproducir esas reglas serían
  dos implementaciones de cada una.
- [docs/agents/plan-cascada-de-entrega.md](docs/agents/plan-cascada-de-entrega.md) — **el pendiente
  vivo del audit del 01/09**: llenar N no es una decisión sino una **cascada de cinco escalones**, y
  el orden es todo el diseño. **3 de 5 puestos; lo que falta son el 2 y el 4**, que son los que le
  dan trabajo a los de arriba antes de que el 5 tenga que actuar. Su
  hallazgo ordenador: *`Gate de relevancia` NO SABE cuánto falta para N* —ese corte vive dos nodos
  más abajo, en `Armar candidato`— así que el escalón "dejar pasar para rellenar" **nunca pudo vivir
  en el gate**, y desde el cierre 134 vive donde corresponde. Trae el estado de todo lo aplicado, lo pendiente en orden de retorno, las
  mediciones escritas antes de mirarlas, y los invariantes que no hay que re-litigar.
- [docs/agents/plan-motor-linkedin.md](docs/agents/plan-motor-linkedin.md) — de **esqueleto a motor**:
  las fases 0–4 para que el pipeline de LinkedIn corra. Su hallazgo ordenador: **los dos carriles no
  comparten bloqueos** — el personal está a un pedido (los few-shot) y el copiable necesita los tres.

**Decisiones**
- [docs/adr/](docs/adr/) — ADRs 001–092 (92 archivos), una decisión por archivo con su porqué ([índice](docs/adr/README.md)).
  🧭 **[ADR-089](docs/adr/ADR-089-una-sola-metrica-aprobados-contra-lo-pedido.md) manda sobre las métricas de todos los demás:** el norte es **`aprobados / N pedido`, por proyecto y por corrida** (cobertura × precisión). Un cambio que no lo mueve no es una mejora, por más que suba su propio número.

**Contratos del núcleo (`core/`, solo cambia con ADR)**
- [core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md) — contrato del manifest (lo valida `npm run validate`).
- *(`airtable-cockpit.md` **ya no existe.** Era el modelo de datos de Airtable, congelado en D7 como registro histórico y borrado el 2026-08-05 con el resto de la purga. **El modelo vivo es [core/schema/](core/schema/)** — las migraciones son el modelo, no su descripción en prosa. Está en git si hace falta arqueología.)*
- [core/contracts/ingesta-registro.md](core/contracts/ingesta-registro.md) — cómo un workflow reporta runs/outputs a Supabase.
- [core/contracts/run-plan.md](core/contracts/run-plan.md) — cómo el motor **pregunta qué correr** a la fachada del cockpit (`GET /api/engine/run-plan`, ADR-028): hermano de *lectura* de ingesta-registro.
  **La regla que gobierna los dos desde D7 (ADR-035):** *n8n lee su config por la fachada, escribe sus resultados por PostgREST.*
- [core/schema/](core/schema/) — migraciones SQL de Supabase. **Se aplican a mano en el SQL Editor, en
  orden**; el modelo vivo son las migraciones, no su descripción en prosa. Al 2026-08-20 están
  **aplicadas las 001–029**, medidas contra prod **por su efecto** (PostgREST + `pg_policies`), no por
  haberse corrido: *una migración con gate humano no se da por aplicada porque se haya ejecutado,
  sino cuando se mide su efecto.*
  ✅ **La [`028`](core/schema/028_grabado.sql) (ADR-069) y la
  [`029`](core/schema/029_grabados.sql) (ADR-070) están aplicadas** (Mani, 18/08 y 20/08). La `029`
  crea `app.grabados` —la marca de *ya se grabó*, **por video** y no por carril— y **jubila** la
  columna de la `028`.
  ✅ **La [`030`](core/schema/030_videos_meta.sql) (ADR-072) está aplicada** (Mani, 21/08) — crea
  `app.videos_meta`, la metadata que se le compra a Apify porque ninguna otra tabla la tiene
  (medido: 0 de 130 en Transcribir, 3 de 294 en los links cargados a mano). Verificada por su
  efecto, no por haber corrido: PostgREST devuelve `[]` y no un 404, y un insert de prueba rebota
  con `23503` contra la FK de `instances`. *Falta mirar `pg_policies` en el SQL Editor: PostgREST
  no lo expone, así que esa pata queda sin medir.*
  ✅ **La [`031`](core/schema/031_colecciones.sql) (ADR-073) está aplicada** (Mani, 21/08) — crea
  `app.colecciones` + `app.colecciones_videos`, la bolsa de videos que apunta a la llave y por eso
  **sobrevive al barrido del archivado**. Verificada por su efecto contra prod, con una colección de
  prueba creada y borrada: el unique del nombre da `23505`, el check del nombre en blanco `23514`,
  el **FK compuesto rechaza con `23503` un video cuyo `instance_id` es de otra empresa** (o sea que
  el aislamiento no depende del código), la PK dedupea el mismo video, el `on delete cascade` se
  lleva los miembros, y **`app.videos_meta` sobrevive al borrado de la colección** — la bolsa es
  descartable, lo que se pagó no.
  🐤 **Su canario es el más limpio de los cuatro porque nace sin ruido: `select count(*) from
  app.colecciones` daba CERO el 21/08** —la de prueba se borró— así que la primera fila es adopción
  y no una verificación propia. A revisar el **2026-09-04**, junto con los otros tres
  ([plan-modo-seleccion §Fase 4](docs/agents/plan-modo-seleccion.md)).
  ✅ **Y la pregunta que ningún `count(*)` contesta —*¿alguien volvió un segundo día?*— se lee de
  `app.eventos` contando DÍAS DISTINTOS por persona, no eventos. Al 21/08 21:20 la respuesta es SÍ,
  una: Majo Duarte, el 20/08 y el 21/08** (37 calificaciones y 6 referentes ese segundo día). Los
  demás siguen en uno solo: Jero 81 eventos el 07/08, Juan José 23 ese mismo día. *Este renglón
  decía "nadie" a las 18:55 del 21/08 y era falso tres horas después — Majo estaba adentro mientras
  se escribía. Un canario se re-mide, no se cita.* Desde el 21/08 los
  eventos del modo selección llevan `origen` (`pegote` | `seleccion`) y calificar en lote emite
  `candidatos.calificar_masivo`, justamente para que esa lectura siga siendo posible cuando haya
  dos caminos para el mismo acto.
  ✅ **La [`032`](core/schema/032_guiones_limpios.sql) (ADR-074) está aplicada** (Mani, 21/08) — crea
  `app.guiones_limpios` y le suma `perfil_limpieza` a `app.voces`. **Enmienda ADR-009 y ROADMAP
  §1.1**: el guion limpio es un artefacto nuevo *al lado* del crudo, nunca encima. Verificada por su
  efecto: PostgREST la ve, las 3 voces traen `perfil_limpieza` en null, y el check de texto vacío
  responde `23514`.
  ⚠️ **`app.videos_meta` tiene 5 filas y las 5 son de verificaciones** (4 de Mani el 21/08 + 1 de la
  prueba de Apify en producción, ese mismo día). Son metadata real y correcta —se dejaron en vez de
  borrarlas para no pagarlas dos veces— pero **no son uso**: mismo cuidado que el canario de
  ADR-069. **El primer dato de adopción es la fila 6.** *Este renglón decía "la fila 5" y hubo que
  correrlo el mismo día: el número del canario se mueve cada vez que uno mismo lo toca, o el doc
  termina contando sus propias pruebas como adopción.*
  ✅ **La [`033`](core/schema/033_grabado_en.sql) (contract de ADR-070) está aplicada** (Mani,
  21/08). Verificada por su efecto y no por haber corrido: PostgREST responde **`42703` — *column
  transcripciones.grabado_en does not exist*** — y `app.grabados` y el resto de `transcripciones`
  siguen contestando, o sea que se fue la columna y no la tabla. Dropeó `grabado_en`, que ya **no la
  leía ni la escribía nadie**
  (las únicas menciones en el repo son comentarios). Medido antes de escribirla, contra prod el
  21/08: **130 transcripciones, 1 sola con `grabado_en`, y esa 1 está en `app.grabados`** ⇒ cero
  marcas viven solo en la columna. 🔒 **Aun así el drop es condicional:** la migración rehace esa
  cuenta **en el momento de correr** y, si aparece alguna huérfana, **no borra y avisa** con el
  insert de rescate al lado. *Medir el martes no autoriza a borrar el jueves.*
  *Se corrió de número dos veces el 21/08, porque `videos_meta` y `colecciones` llegaron antes — que
  es la regla escrita: **el número se toma cuando el archivo existe, no cuando un doc lo reserva**.*
  ✅ **La [`034`](core/schema/034_candidatos_run.sql) (ADR-081) está aplicada** (Mani, 31/08) — crea
  `app.candidatos.run_id`: de qué corrida salió cada candidato. Verificada por su efecto y con dos
  señales: PostgREST devuelve la columna (no `42703`) y un uuid inventado rebota con **`23503 ·
  candidatos_run_id_fkey`** nombrando `runs`. **0 filas rellenadas**, o sea que el *sin backfill* es
  un hecho medido y no una intención. 📏 Su porqué también: la alternativa barata era derivar la
  corrida de `creado_en` contra `runs.inicio/fin`, y contra prod el 30/08 **68 de 168 candidatos
  vivos (40%) caen fuera de toda ventana** — son el rescate manual del 22/08, cuyo `creado_en` es la
  hora del rescate y no la de la corrida. *La derivación no falla ruidosa: le diría "sin corrida" al
  40% del feed teniendo la corrida en la tabla.* Las viejas quedan en `null` y el barrido de 20 días
  lo cura solo.
  🐤 **Su canario YA SE DESPERTÓ: `select count(*) from app.candidatos where run_id is not null` da
  **166 de 408** (medido el 31/08 por la tarde). Daba CERO esa misma mañana** — las 6 filas de la verificación en navegador se crearon y se
  borraron. **La primera fila con corrida la escribe el motor**, así que la primera es uso real, no
  una prueba. A mirar junto con los otros cuatro el **2026-09-04**.
  🟢 **El canario de ADR-069/070 SE DESPERTÓ el 20/08, y es el primer uso real del sistema por
  alguien que no lo construyó.** `app.grabados` tiene **294 filas**: **288 las cargó Majo Duarte**,
  en dos escrituras de 166 y 122. No se dedujo de los timestamps —eso es una sola señal— sino de
  `app.eventos`, que guarda el autor: dos filas `historicos.marcar_masivo` con su `usuario_id` y
  `{nuevos: 166}` / `{nuevos: 122}`, ~50 ms después de los dos statements.
  ⚠️ **Y con eso este canario dejó de servir: `count(*)` ya no distingue adopción de carga masiva.**
  Se redefine por fecha — `select count(*) from app.grabados where grabado_en > '2026-08-21'` — y la
  pregunta que ninguno de los canarios contesta se lee de `app.eventos`: *¿alguien volvió un segundo
  día?*
  ✅ **Re-medido el 2026-08-31 sobre los 613 eventos de la tabla: volvieron CUATRO, no dos.**
  **Majo Duarte, 6 días** (177 eventos, hasta el 31/08), **Manuel Mejia 15**, **Manuel 30X 3**
  (07/08 · 20/08 · 29/08) y **Juan José Gaitán 2** — que este archivo daba por no-vuelto.
  🆕 **Y apareció una persona que no figura en ningún doc del repo: [Dani Rodríguez] hizo 165
  eventos en un solo día, el 30/08** — el segundo día más productivo de la historia del sistema,
  después de los 81 de Jero. Entró como operadora principal y nadie lo anotó.
  Siguen en un día: **Jero, 81 eventos el 07/08 y no volvió nunca**, Alejo 2, Alejandro Dávila 1.
  ⚠️ *Este bloque decía **"374 eventos, volvieron DOS"** y estaba copiado igual en
  `verificaciones-humanas.md` y `plan-modo-seleccion.md`: **tres copias que vencieron juntas** el
  día que alguien usó el cockpit. El número no va en prosa — se cuenta en `app.eventos` por DÍAS
  DISTINTOS por persona, y por eso la consulta va escrita y el resultado no.*
  🟢 **Y el canario de ADR-074 (guion limpio) también SE DESPERTÓ, el 26/08.** Este archivo y
  `plan-modo-seleccion` decían *"las 4 que hay son de Mani, adopción = la fila 5"*: hay **65 filas y
  61 son de Majo**, hechas ese día — **34 con voz y 27 sin voz**, o sea que el camino "solo criterios
  de la casa" es la mitad del uso real. Redefinido por fecha:
  `select count(*) from app.guiones_limpios where actualizado_en > '2026-08-29'`.
  ⚠️ **Ese canario redefinido ya está contaminado, y por la sesión que lo redefinió.** Daba 0 y al
  2026-08-30 da **1**: es la prueba viva del cierre 121, no adopción. *Redefinir un canario por fecha
  no lo protege de quien lo mide — lo expone más, porque toda escritura de verificación cae del lado
  nuevo.* **El primer dato de adopción es la fila 2.**
  ✅ **`creado_por` ya no se pisa al rehacer, y el canario se mudó** (ADR-074 §Enmienda, 30/08).
  `guardarLimpio` lo mandaba en cada upsert, así que re-limpiar le robaba la autoría a quien limpió
  primero; ahora solo va en el INSERT —el `motivo` de ADR-080 ya particionaba exacto por INSERT vs
  UPDATE— y ***Rehacer 25* se puede apretar**. Verificado en prod con una colección de un video: la
  fila se reescribió (huella `97ff9195`→`72210da7`, voz derivada, `actualizado_en` nuevo) y el
  conteo quedó **igual: Majo 58 · Mani 7**.
  🔑 **Y el `61 · 4` que este archivo citaba nunca fue un conteo de `creado_por`.** Se reproduce
  exacto desde los eventos contando **escrituras por voz** e ignorando **quién** (`32` de Majo + las
  `2` con voz de Mani = 34; `15+12` = 27), así que el delta de 3 filas **puede no haber existido
  nunca**: eran dos preguntas leídas como la misma. *Un canario mal consultado miente igual que uno
  mal escrito — van dos veces en dos días.*
  📌 **El canario vive ahora en `app.eventos`, que nadie pisa**, y la `032` quedó corregida en su
  propio archivo: `select count(*) from app.eventos where tipo = 'colecciones.limpiar' and
  usuario_id <> '<uuid de Mani>'`. El evento además guarda **`claves`** —cuáles, no solo cuántos—
  porque los del 26/08 guardaban solo el número y por eso una fila perdió su autor sin rastro.
  📏 **Ese mismo día Majo hizo 80 calificaciones, 13 referentes y 12 ediciones de voces/proyectos,
  sola — y con eso se cerró D3 y la última condición del "MVP declarado cuando" (ROADMAP §4).**
  *Este renglón decía **"sigue en CERO"** y era correcto cuando se escribió el 20/08 a las 16:30;
  Majo entró esa misma noche. Después dijo **"una: Majo, 20 y 21"** y también envejeció en 8 días.
  Un canario se re-mide, no se cita — y **uno mal consultado miente igual que uno mal escrito**: el
  29/08 `videos_meta` se contó en 4 por pedirle una columna que no existe, y son 5.*
  ✅ **La [`036`](core/schema/036_candidatos_huella.sql) (ADR-086) está APLICADA** (Mani, 01/09) —
  agrega `app.candidatos.huella_guion` y `duracion_seg`. Verificada por su efecto y con **cuatro
  señales**: las dos columnas contestan en SQL sobre las 422 filas · **`con_huella = 0` y
  `con_duracion = 0`**, o sea que el *sin backfill* es un hecho medido y no una intención · el
  índice parcial `candidatos_huella_idx` existe con su `where huella_guion is not null` · y
  **PostgREST las devuelve con 200 y no `PGRST204`**, que es el camino por el que las va a leer el
  cockpit. **No las usa nadie todavía: existen para
  poder medir.** El dedup del motor recuerda el *id del post* y no el video, así que una re-subida
  del mismo reel entra como nueva (medido el 01/09: **17 pares** en `app.candidatos`, **18 más** en
  `app.descartes`, **11 en el Feed con el gemelo ya calificado y 3 de esos con el gemelo ya
  grabado**). El Feed ya **avisa** con lo que tiene (caption + referente, ~7 de cada 17); lo que la
  `036` habilita es la pregunta que hoy no se puede contestar: *¿la duración colisiona entre videos
  distintos del mismo creador?* — **no se puede cuantificar porque el dato hoy se tira**, y por eso
  se guarda antes de decidir. ✅ **El motor ya las escribe** desde el 01/09 (`Armar candidato` +
  `Preparar candidatos`, empujados al live). ⚠️ *Escribir no es leer, y guardar no autoriza a
  bloquear: **falta la medición**, que la hace la primera corrida de redes.* Las tres consultas que
  hay que correr después de esa corrida están en el handoff.
  ✅ **La [`038`](core/schema/038_candidatos_prescore.sql) (ADR-092) está APLICADA** (Mani, 02/09) —
  crea `app.candidatos.prescore_metrico`, la **etiqueta métrica** del video. Verificada por su efecto
  y con **cuatro señales**: la columna existe (`numeric`) · **`con_prescore = 0` sobre 422 filas** (el
  *sin backfill* como hecho medido) · el `comment` puesto · y **PostgREST la devuelve con 200 y no
  `PGRST204`**, la pata capaz de fallar sola por cache de esquema vieja. 🔑 **Existe porque el número
  no se puede recomputar**: es un percentil relativo al pool de SU corrida y se pierde con ella —
  mismo caso que `run_id` en ADR-081. Hasta hoy la métrica se moría en el gate, que pisa `heat_score`
  con su veredicto. **Desempata pasivo y no vota** (ADR-090). 🐤 Su canario nace en cero **sin
  contaminar**: no se insertó ninguna fila de prueba, así que la primera la escribe el motor.
  ✅ **La [`037`](core/schema/037_origen_transcripciones_y_descartes_id.sql) (ADR-087) está
  APLICADA** (Mani, 01/09), verificada **por su efecto y con cuatro señales**: `transcripciones =
  manual = 130` y **`motor = 0`** · **`descartes_con_id = 0`** (los dos ceros prueban que el *sin
  backfill* es un hecho medido y no una intención) · la RPC existe · y
  **`has_function_privilege` da `true` para `service_role` y `authenticated`** — que era la pata
  cuyo fallo habría sido mudo. Y una quinta, por el camino real: la RPC contestada por PostgREST
  con `POST` + `Content-Profile: app` devuelve **200 y 3 filas con guion**, y un id inventado
  devuelve `[]` con 200.
  ✅ **El motor ya corre esto en el live** (01/09): `n8n:push --apply` sobre 10 nodos, **40 en
  total**, workflow activo, y **`n8n:diff` verde en los 5**. Snapshot de rollback en
  `.n8n-snapshots/motor-2026-09-02T00-59-22-928Z.json`. Agrega `app.transcripciones.origen`
  (`manual` | `motor`), `app.descartes.external_id` y la RPC `app.cache_transcripts`. Ejecuta el
  cambio de modelo que ataca el desperdicio más grande medido del sistema: **`processed_items`
  tiene 1.952 filas y solo 866 videos llegaron alguna vez al Feed ⇒ 1.401 (71,8%) se pagaron, se
  quemaron para siempre, y nadie los vio.** La memoria contestaba *"¿ya lo evalué?"* cuando el
  dedup necesita *"¿ya se lo mostré al equipo?"*.
  ⚠️ **ORDEN OBLIGATORIO: la migración va ANTES del deploy de la app.** Las 5 lecturas de
  `apps/dashboard/lib/transcripciones.ts` filtran `origen = 'manual'`, y sin la columna PostgREST
  responde `42703` y las cinco mueren. Mismo orden que exigieron la `014` y la `016`.
  🧩 **La RPC no es un capricho:** los Code nodes de n8n **no pueden usar credenciales**, y un GET
  con ~350 ids da **414** (el límite que ya hizo trocear de a 200 a la app) ⇒ los ids viajan en el
  body. Y su `grant` va **explícito**: `alter default privileges` de la `011` cubre tablas y
  secuencias, **no funciones** — una función nueva no nace accesible, y su fallo sería mudo
  (`42501` tragado por el `onError: continue` del nodo, corrida en verde sin caché).
  🐤 Su canario nace en cero: `select count(*) from app.transcripciones where origen = 'motor'`.
  ✅ **La [`035`](core/schema/035_search_path_triggers.sql) (ADR-085) está APLICADA** (Mani, 01/09),
  verificada por efecto: `proconfig` fijo en las dos y **`get_advisors` bajó de 9 avisos a 7**. Le fija `search_path` a los dos triggers del esquema, que hoy resuelven `clients` y
  `runs` contra el camino de quien los dispare. Son los **2 avisos reales** de los 9 de
  `get_advisors`; los otros 6 son falsos positivos y ADR-085 escribe por qué, para que el ruido no
  tape la próxima señal de verdad. Los 7 que quedan son los 6 falsos positivos que ADR-085 documenta más el toggle de Auth.

  *El historial migración por migración (qué midió cada una, sus modos de falla, sus verificaciones)
  vive en sus ADRs, en [handoff.md](docs/agents/handoff.md) y en git — acá no se duplica.*

**Runbooks (el N+1)**
- [docs/runbooks/agregar-cliente.md](docs/runbooks/agregar-cliente.md) — dar de alta **una empresa**.
  ✅ **Pasa el criterio de PLAN §F5**: SQL de datos + clics, **cero código, cero n8n, cero migraciones**.
  Su plantilla es [core/templates/cliente-nuevo.sql](core/templates/cliente-nuevo.sql), probada contra
  prod en una transacción revertida.
- [docs/runbooks/agregar-workflow.md](docs/runbooks/agregar-workflow.md) — agregar **un pipeline**.
  🔴 **NO pasa F5, y el runbook lo dice con el número**: LinkedIn costó ~2.500 líneas, 2 migraciones
  en `core/schema/`, 2 ADRs y ~15 archivos de la app, para un pipeline que todavía no corre.
  *Una empresa es un parámetro; un pipeline es un dominio.*
- [core/templates/](core/templates/) — los esqueletos. Crearlo **es ejecutar F5**, que ya lo nombra
  por su ruta; cambiar lo de adentro sí pide ADR si cambia el contrato.

**Operación / equipo de redes**
- [docs/onboarding-equipo-redes.md](docs/onboarding-equipo-redes.md) — guía no-code para Majo y Jero (qué cargar + cómo calificar). *(También compartido como Google Doc.)*
- [docs/verificaciones-humanas.md](docs/verificaciones-humanas.md) — **lo que falta mirar con los ojos**
  y ningún agente puede cerrar (el clic al CSV, los 3 arreglos de Transcribir, V2/V4/V5/V6, la demo D3). Cada item
  con quién, cuánto tarda y qué significa si falla. ⚠️ **Trae los números esperados por pantalla,
  medidos el 06/08 — y corrige 4 que estaban mal**: eran el `count(*)` crudo de la tabla donde la
  pantalla filtra, así que habrían disparado una falsa alarma de RLS.

**Por workflow** — los 5 que corren en n8n. Cada doc abre con **§Operación**, y los 5 dicen lo mismo
porque es una sola regla (ADR-053): **cambiar un workflow es `n8n:push`, no re-importarlo**; el
re-import queda solo para topología, y solo ahí aplican sus placeholders y credenciales.
- [Workflows/workflow-short-form-content/CLAUDE.md](Workflows/workflow-short-form-content/CLAUDE.md) — el motor de reels (qué es, orden). Fuente de verdad: su `workflow.json`.
- [Workflows/workflow-descubrimiento-referentes/README.md](Workflows/workflow-descubrimiento-referentes/README.md) — el descubrimiento de referentes (ADR-020): propone cuentas nuevas cada semana, el equipo aprueba, se siembran solas.
- [Workflows/workflow-archivado/README.md](Workflows/workflow-archivado/README.md) — el archivado: manda los calificados a `outputs`, destila criterios (ADR-022) y barre. ✅ **17 nodos desde el 2026-08-05**: [ADR-057](docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) quedó **cerrada entera** — los 3 nodos del Sheet se borraron a mano en el editor (no re-import: importar crea un workflow con id nuevo) y con ellos se fue **la última dependencia de Google del pipeline**.
- [Workflows/workflow-dispatcher/README.md](Workflows/workflow-dispatcher/README.md) — el que convierte **un** workflow parametrizado en **N corridas aisladas**, una por instancia (ADR-050). Los dos crons del sistema viven acá.
- [Workflows/workflow-registro-fallos/README.md](Workflows/workflow-registro-fallos/README.md) — el error handler global: marca como `fallo` el run de la ejecución que se cayó, encontrado por `params.execution_id` (ADR-054). Activo y verificado end-to-end; lo apuntan los 4 workflows. Se rompió **dos veces** por un `<<SUPABASE_URL>>` sin resolver que `onError: continue` silenciaba: por eso `npm run n8n:diff` va después de cada import.

*(`workflow-linkedin/` está **INACTIVO y sin cron**. Su `workflow.json` tiene **16 nodos** desde el
2026-08-11: los 11 de infraestructura (triggers, `Config`, guard single-flight, abrir/cerrar run,
`Leer plan` fail-closed) más la **espina del carril personal** — `Colectar (stub personal)` →
`Calidad (R-1 + R-2)` → `Preparar candidatos` → `POST Candidatos`. **`calidad` está entera** (R-1 y
R-2 de ADR-055 §4, con `node Workflows/workflow-linkedin/test-nodos.mjs`); **`colectar` es un stub
que emite piezas fijas** y lo reemplaza la Fase 1.4.
🔴 **El pipeline de LinkedIn NO está en uso: no corre, no se usa, y no hay nada que sincronizar**
(Mani, 30/08). Por eso `N8N_WF_LINKEDIN` no está en el `.env` y `n8n:diff` lo saltea con aviso — eso
es lo correcto, no una deuda. *Este bloque decía que `n8n:diff` "grita a propósito" por los 5 nodos
que le faltan al live, y era falso por partida doble: el barrido nunca lo mira, y desde el 30/08 la
topología sí entra por `n8n:push` (ADR-053 §Enmienda) — lo que la frena es el ⛔ de producto, no una
limitación.* Lo que falta no es plomería: `generar` sigue bloqueada por los few-shot y el carril
copiable por el banco de referentes. `workflow-substack/` sigue siendo solo manifest, sin `workflow.json`.)*

## Agent skills

Este repo está preparado para ingeniería con agentes. Leé esto antes de trabajar:

- **Handoff** ([docs/agents/handoff.md](docs/agents/handoff.md)) — estado vivo: tablero de tasks +
  log entre devs. Leelo al empezar cada sesión para recuperar el estado; actualizalo al cerrar.
  Es cómo el próximo agente (o vos en el futuro) no arranca de cero. Lo escribe `/handoff`.
- **Context** ([docs/agents/context.md](docs/agents/context.md)) — el glosario de dominio (lenguaje
  ubicuo). Leelo antes de nombrar variables/funciones/archivos y antes de discutir el dominio.
  Se afina con `/grill-with-docs`.
- **Dev-doc** ([docs/agents/dev-doc.md](docs/agents/dev-doc.md)) — referencia técnica nodo-por-nodo de
  los tres workflows (orden de ejecución, qué tabla de Postgres lee/escribe cada nodo, esquema Supabase y
  trazabilidad de campos). Leela antes de tocar un `workflow.json`; la fuente de verdad sigue siendo el JSON.
- **ADRs** ([docs/adr/](docs/adr/)) — decisiones de arquitectura con su porqué (ADR-001..088). *El número sale de `ls docs/adr`, no de acá: este renglón dijo 083 con 84 archivos en disco.*
  Leé los relevantes antes de cambiar un área ya decidida; no las re-litigues.

El **qué/por qué** del producto y el diseño viven en [ROADMAP.md](ROADMAP.md) (norte + checklist del
MVP) y [PLAN.md](PLAN.md) (arquitectura, invariantes §2.5, fases). Si un doc contradice el norte,
gana el norte (ROADMAP §1).

Skills disponibles: `/grill-me`, `/grill-with-docs` (alinear + documentar antes de construir),
`/tdd` (red-green-refactor), `/diagnose` (debugging disciplinado), `/improve-codebase` (profundizar
módulos), `/handoff` (compactar una sesión).

## Feedback loops

- **Test / validar:** `cd core/scripts && npm run validate` — valida el contrato del manifest de
  workflows ([core/contracts/workflow-manifest.md](core/contracts/workflow-manifest.md)) y escanea
  secretos. Corre siempre, sobre todo el repo.
- **Dashboard (cockpit propio, ADR-026):** en `apps/dashboard/` — `npm run typecheck` (tsc) +
  `npm test` (dominio con `node:test`, corre los `.ts` directo en Node 26). Si tocaste rutas o
  auth, además `npm run build`. Cómo correrlo y sus pasos manuales:
  [apps/dashboard/README.md](apps/dashboard/README.md).
- **¿el live corre lo que dice el repo?** `cd core/scripts && npm run n8n:diff` — compara **5**
  workflows (los 4 del pipeline + el error handler) contra n8n por la API (ADR-053).
  ⚠️ *Este renglón decía **6**, contando el esqueleto de LinkedIn, y es falso: **`N8N_WF_LINKEDIN`
  no está en el `.env`**, así que el barrido lo **saltea con aviso** (ADR-068) y **nunca lo mira**.
  Medido el 30/08 leyendo la salida, no el doc. O sea que el "`n8n:diff` grita por los 5 nodos que
  faltan en LinkedIn" tampoco pasa: avisa que **no puede** mirarlo, que es otra cosa.* Clasifica cada campo, así que solo grita lo accionable:
  **drift** (los dos lados tienen valor y difieren), **sin-empujar** (el repo lo declara y el live no
  lo corre), **topología**, **orden de ramas** y placeholders que no pudo aprender. Lo benigno
  (defaults que n8n borra, campos que agrega, resourceLocators de Apify) va a un contador;
  `-- --todo` los lista.
  ⚠️ *El balde benigno se llamaba **"defaults de n8n, o cambios sin empujar"** y esa `o` era un bug,
  no una imprecisión: la regla era estructural (`live ⊆ repo`), así que **un campo que el repo
  agregara y nadie empujara salía en el mismo montón que `method`, con el comando en verde**. Lo
  destapó `options.pagination` en `Leer feed vivo` el 31/08 — la misma clase de fallo mudo que pagó
  el cierre 125. Desde [ADR-053 §Enmienda 2](docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)
  lo benigno se decide por **clave + VALOR** contra una lista cerrada de 6 pares (medida: cubren los
  24 campos que hoy el live no guarda, y el diff sale idéntico), y **lo que no está en la lista
  grita**. Una lista incompleta cuesta una falsa alarma visible; la regla vieja costaba un falso
  verde.* Solo lee. **Corrélo antes de tocar un workflow.json
  y después de cualquier cambio en n8n.**
- **Aplicar un cambio del repo al live:** `npm run n8n:push -- <alias> --nodos "Nodo A,Nodo B"` —
  dry-run; agregá `--apply` para escribir. Toma el live como base y le pone los `parameters` del repo
  con los placeholders resueltos; jamás toca credenciales, ids, posiciones ni `settings`. Snapshotea
  antes (`.n8n-snapshots/`, gitignored) y verifica contra la instancia después; el rollback es
  `npm run n8n:restore -- <alias> <snapshot> --apply`. Alias: `motor · descubrimiento · dispatcher ·
  archivado · errores`, **más los que se descubren solos** — desde ADR-068 los 5 apodos se escriben
  (`motor` no se deriva de `workflow-short-form-content`) y cualquier otro dir con `workflow.json`
  entra por su id, sin tocar el script. Un alias descubierto sin su `N8N_WF_<ALIAS>` en el `.env`
  todavía no está importado: el barrido lo **saltea con aviso**, nunca en silencio.
  ✅ **Desde el 2026-08-30 el push también cubre TOPOLOGÍA** (nodos y conexiones,
  [ADR-053 §Enmienda](docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)): **se murió el
  último ritual manual.** El re-import queda solo para crear un workflow desde cero. Cuando el delta
  lleva topología las **conexiones vienen del repo, enteras**, y un nodo nuevo viene entero del repo
  (incluida su `position`, que en n8n v1 **es** el orden de ejecución) con las credenciales
  resueltas contra la instancia por nombre.
  🔒 **Cuatro redes, y nombrar es consentir** — ninguna es un prompt, así que sigue sirviendo sin
  TTY: **`--nodos` obligatorio** si el delta crea nodos · **`--borrar "A,B"`** nombrando lo que
  desaparece *o pierde cableado de salida* (un recableado deja al otro corriendo en vacío, y eso
  termina en verde) · **fail-closed en credenciales**, igual que los placeholders · y **el push se
  niega si dejaría un nodo inalcanzable** desde todo trigger, con la definición tomada de
  `auditar-workflows.mjs` §2 y no reinventada.
  🩸 *El bloqueo nunca fueron las credenciales, aunque ADR-053 §Contexto y plan-multi-tenant §14.2
  lo dijeran durante 27 días: era que `cuerpoPut()` mandaba `connections: live.connections`,
  siempre — el nodo habría llegado huérfano. **Un obstáculo escrito se re-mide, igual que un
  canario.***
  Su test: `npm run n8n:test` — **42 checks**, y los 7 últimos sobre un workflow **ACTIVO**
  (⚠️ crea y borra dos workflows desechables en n8n; corrélo si tocaste `n8n-sync.mjs`).
- **Arreglar el orden de ejecución de las ramas:** `npm run n8n:orden -- <alias> [--apply]`. En n8n
  v1 las hermanas corren por posición en el canvas (Y menor primero, desempata X — **medido**, no
  asumido), así que arrastrar un nodo cambia la semántica sin tocar código. El comando permuta las
  posiciones que los hermanos **ya ocupan** (cada uno se lleva su cadena exclusiva, así no quedan
  líneas cruzadas) y aborta si alguna otra ramificación cambiaría de orden de rebote. Es lo que
  reporta `n8n:diff` como `[orden]`.
- **Audit estructural de los 3 workflows:** `node Workflows/auditar-workflows.mjs` — conexiones rotas,
  nodos inalcanzables, **`$('X')` que apunte a un nodo que no es ancestro suyo** (la clase de bug que
  dejó el dedup de ADR-029 sin efecto durante 3 corridas: en n8n el orden de las ramas lo decide la
  posición en el canvas, no el array de conexiones), `jsCode` que compile como AsyncFunction, e
  inventario de placeholders del re-import. **Corrélo si tocaste conexiones o posiciones.** Solo lee.
  🛡️ **Desde el 2026-08-07 también verifica el invariante #1** (el registro es sumidero, jamás
  dependencia de ejecución): los **31 nodos HTTP** llevan `onError: continueRegularOutput` salvo los
  **9** de la constante `FAIL_CLOSED`, cada uno con su porqué escrito. **El default es "sos
  sumidero"**, así que un nodo HTTP nuevo entra pidiendo su `onError`. *Esto **es** V6 del ROADMAP:
  el simulacro que pedía romper una credencial no se puede montar —los 31 comparten
  `Config.supabase_url`, así que romper el registro rompe la entrega— y lo que quería probar se lee
  del JSON en cada commit.* **Corrélo también si agregaste o tocaste un nodo HTTP.**
- **Test de los code nodes del motor:** `node Workflows/workflow-short-form-content/test-nodos.mjs` —
  ejercita `Armar plan de corrida`, `Armar candidato`, `Heat-score v1`, `Preparar procesados` y los dos
  nodos caros (`Transcribir`, `Traducir`) fuera de n8n, con `$` y `this.helpers` mockeados: N por
  proyecto, gate por `Voces.activo`, orden dedup→corte, piso, **concurrencia real en vuelo del pool y
  el corte del presupuesto** (ADR-044), y las regresiones que ya nos mordieron. **Corrélo antes de
  empujar al live** (`n8n:push`, o el re-import si es topología) si tocaste esos nodos. Sin
  dependencias: es node pelado.
- **Typecheck / lint:** no hay — los scripts son ESM `.mjs` plano, sin TS ni linter.
- **Run:** el motor **corre en n8n**, no localmente: se importa el `workflow.json` (una instancia,
  editada a mano en el nodo `Config`) y se dispara con *Execute Workflow* (manual) o el cron semanal.
  *(`core/scripts/deploy.mjs` está **deprecado** — resolvía placeholders por-cliente que el MVP no usa;
  queda como semilla del multi-cliente F5.)* Las corridas de fuego son V1–V6 del
  [ROADMAP §3](ROADMAP.md).

## Convenciones

- **`core/` solo cambia con ADR.** Es el núcleo (contratos, schemas SQL, scripts). Si un task obliga
  a tocarlo fuera de lo previsto, se para y se discute (puede terminar en un ADR nuevo).
- **Secretos JAMÁS en git** — ni credenciales ni IDs en ningún archivo del repo. Todo va al gestor de
  contraseñas compartido; el validador escanea el patrón `pat...` y otros secretos en cada corrida.
- **Credenciales para trabajar: `.env` en la raíz** (gitignored, local, no versionado). Es el hub
  único: Supabase, el webhook del motor (el botón "Ejecutar"), run-plan, Apify, Anthropic,
  Supadata y la **API pública de n8n** (`N8N_API_KEY`). *(Airtable se podó el 2026-08-03 y su PAT
  está revocado.)* **Usalo proactivamente** — si
  necesitás pegarle a un componente del pipeline, cargá `set -a && source .env && set +a` y usá
  `"$VAR"`, no le pidas la key a Mani.
  Nunca imprimas un valor en el chat. Si una var está vacía, decílo y seguí con lo que sí se pueda.
  El propio archivo está comentado var por var (de dónde sale, quién la consume, qué rompe).
  ⚠️ `POST "$MOTOR_WEBHOOK_URL"` arranca una corrida real y paga: confirmá antes.
- **Cambiar un workflow ya no es re-importarlo** (ADR-053): `core/scripts/n8n-sync.mjs` parchea el
  live por la API de n8n. El live es la base y el repo aporta los `parameters`; los placeholders se
  resuelven solos porque se **aprenden** del propio live. Ver §Feedback loops.
- **Commits en español, concisos, directo a `main`** (repo de la agencia).
- **Docs lean:** un hecho, un dueño. Antes de crear un doc nuevo, mirá si encaja en uno existente
  (README, ROADMAP, PLAN, handoff, ADRs). El histórico vive en git, no en prosa duplicada.
