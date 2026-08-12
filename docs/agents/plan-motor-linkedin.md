# Plan — de esqueleto a motor de LinkedIn

> **Estado al 2026-08-11.** Existen las tablas (`020`+`024`), el cockpit con sus 4 pantallas
> (ADR-066/067), la fachada sirviendo su plan de corrida (ADR-068) y —en el repo— **16 nodos**: los
> 11 del esqueleto más la **espina del carril personal**. **La 1.1 y la 1.2 están hechas**
> (`Colectar` como stub, `Calidad` entera). En n8n sigue viviendo el esqueleto de 11: los 5 nodos
> nuevos son **topología** y todavía no se aplicaron.
>
> Hermano de [plan-cockpit-propio.md](./plan-cockpit-propio.md) y
> [plan-multi-tenant.md](./plan-multi-tenant.md). El estado vivo manda: si esto y
> [handoff.md](./handoff.md) se contradicen, gana el handoff.

## El hallazgo que ordena el plan

**Los dos carriles de ADR-055 §2 no comparten bloqueos, y a nadie se le había separado.** El handoff
viene listando "los 3 bloqueos no técnicos" como un bloque, y no lo son:

| | **Carril personal** | **Carril copiable** |
|---|---|---|
| Fuente | el archivo propio de la voz (`fuente: archivo`) | Pinterest + referentes en inglés |
| ¿Necesita el banco de referentes de Fernando? | **NO.** Sus filas son el material propio — *"no tengo el listado"* habla de **cuentas ajenas** | **SÍ**, y hay que construirlo |
| ¿Necesita Apify? | **NO** | **SÍ**, y hay que elegir actor |
| ¿Necesita umbral? | **NO** — no compite con nadie (ADR-055 §2) | **SÍ**, y es por carril |
| ¿Necesita los few-shot? | **SÍ** | **SÍ** |

⇒ **El carril personal está a UN pedido de ser construible**, y ese pedido —3–4 posts que Fernando
sienta perfectos— es el que el propio ADR-055 llama *"el más barato del proyecto"*. El copiable
necesita los tres.

**Por eso el plan no sigue el orden del manifest** (colectar → … → entregar). Va al revés de lo
intuitivo: **primero la espina que puede correr entera con lo más barato**, después se profundiza.
Construir en orden de pipeline significa no poder probar nada hasta que `colectar` funcione, que es
justo la etapa con más incógnitas.

---

## Fase 0 — Los insumos · **Alejandro** · nada de esto es código

**Ninguna fase de abajo arranca sin la 0.3 y la 0.4.** Con `voces: 0` y `referentes: 0` cualquier
etapa que se construya corre en vacío, y eso está medido, no supuesto.

| # | Qué | Cuánto | Gate: cómo sé que está |
|---|---|---|---|
| **0.1** | Copiar `WEBHOOK_PATH_LINKEDIN` del `.env` al gestor de contraseñas compartido | 2 min | Está en el gestor |
| ✅ **0.2** | ~~`update instances set estado='active'…`~~ **HECHO el 2026-08-11.** 1 fila afectada | 1 min | la fachada pasó de **403** a **200 con el plan de LinkedIn** |
| **0.3** | **Cargar UNA voz con su perfil y su firma**, en la marca que Fernando maneje mejor | 1–2 h con él | `run-plan` devuelve `voces: 1` |
| **0.4** | 🔴 **Conseguir 3–4 posts que se sientan perfectos, de esa cuenta** | 1 mensaje + su tiempo | Los posts, en texto plano |
| **0.5** | Cargar 3–5 piezas de archivo propio (`fuente: archivo`) en Referentes | 30 min | `run-plan` devuelve `referentes: ≥3` |

> ✅ **0.2 entró el 2026-08-11, y de paso fue el primer test REAL de ADR-068.** Se prendió sabiendo
> el costo de D3 (Majo y Jero ven un selector de pipeline nuevo). Lo que compró a cambio es la única
> medición que valía: `30x/linkedin` y `estadox/linkedin` tienen 0 de todo, así que su plan vacío no
> distingue *"derivó bien el pipeline"* de *"no hay datos"*. **`retia` es la única instancia con datos
> de reels detrás**, y midió así:
>
> | | `retia/linkedin` | `retia/reels` |
> |---|---|---|
> | `pipeline` | **`linkedin`** | `short-form-content` |
> | claves del plan | `voces`, `referentes` | + `proyectos`, `ajustes` |
> | `ambito=motor` | **0 voces · 0 referentes** | 1 voz · 2 proyectos · 17 referentes · 18 ajustes |
> | `ambito=completo` | **3 voces**, las 3 con `configurada: false` | — |
>
> 🔑 **Esa última fila es la que cierra el argumento:** con `completo` la fachada SÍ encuentra las 3
> voces de la empresa, así que el 0 de `motor` es **el filtro de ADR-067 funcionando** —manda la
> existencia del perfil, no `voces.activo`— y no una consulta vacía. Misma empresa, mismo momento,
> dos planes distintos porque las instancias declaran pipelines distintos.
>
> 🩸 **Y falsifica una predicción que el handoff del cierre 107 tenía escrita:** decía que prender
> `retia/linkedin` daría *"200 con 3 voces, 6 proyectos y 17 referentes de REELS"*. Esa tabla
> describía el problema **antes** de que ADR-068 lo arreglara y nadie la actualizó al arreglarlo.
> *Una predicción escrita antes del fix no es un pronóstico: es un residuo.*

> 🔴 **Corrección del 2026-08-11, de Alejandro, y cambia de quién es la 0.4.** Este plan y ADR-055
> venían diciendo *"pedirle a Fernando 3–4 posts que sienta perfectos"*, tratándolo como el dueño del
> criterio. **No lo es: Fernando dio la idea general de cómo funciona la máquina, no el molde que
> hay que copiar.** Los few-shot anclan la voz de **una cuenta**, así que el dueño del pedido es
> quien manda esa cuenta — y para el carril personal ese material *ya está en la casa*. Lo que no
> cambia es que sin ellos `generar` no tiene con qué. Lo que cambia es que **no hay que esperar a
> una sola persona para tenerlos**.

> 📌 **La 0.5 es la que sorprende.** El carril personal también vive en `app.referentes_linkedin`,
> con `fuente: archivo` — la tabla no es solo el banco ajeno. Sus filas son material que la casa ya
> tiene, así que **no dependen de Fernando**.

**En paralelo y más lento (no bloquea las fases 1–2, sí bloquea el aprendizaje):** definir qué es
*"funcionó"*. Son **3 respuestas, una por marca**, y hoy solo EstadoX puede anclarla a dinero. Sin
esto el sistema converge al post motivacional con máximas reacciones y cero clientes.

---

## Fase 1 — El carril personal, punta a punta · **la ruta corta**

El objetivo no es "construir etapas": es **que aparezca la primera pieza en el Feed**. Es la primera
vez que alguien puede *ver* el producto, y el orden está elegido para llegar ahí lo antes posible.

| # | Etapa | Qué entra a n8n | Por qué en este orden |
|---|---|---|---|
| ✅ **1.1** | `entregar` + un `colectar` **de mentira** | **HECHO (repo, 2026-08-11).** `Colectar (stub personal)` emite **2 piezas fijas**, `Preparar candidatos` + `POST Candidatos` escriben `app.candidatos_linkedin` con `estado: 'nuevo'` | La cadena completa corre el día 1. Si la pieza aparece en el Feed, el cableado —tenant, FK, RLS, dedup— está probado **antes** de gastar un peso en LLM o scrape |
| ✅ **1.2** | `calidad` | **HECHO (repo, 2026-08-11).** `Calidad (R-1 + R-2)`: **R-1** (gancho = bloque continuo de 2–3 líneas, sin `\n\n`) **rechaza**, **R-2** (firma al cierre) **repara** | Va **antes** que `generar` a propósito: se escribe contra texto de prueba, y así el día que el LLM entre ya tiene quién lo sanitice. Es **código, no prompt** |
| **1.3** | `generar` | Claude con el `perfil` de la voz + los few-shot de 0.4 + `cache_control`, el patrón que ya funciona en reels | Necesita 0.4. La firma sale del plan (`voces[].fields.firma`) |
| **1.4** | `colectar` personal | Reemplaza el stub de 1.1: lee las filas `fuente: archivo` del plan | Último porque es el único con una pregunta de diseño abierta (ver abajo) |

**🚦 Gate de la fase:** una pieza generada aparece en `/[empresa]/linkedin/curar/feed` y alguien que
manda esa cuenta la lee y dice si sirve. **Ese juicio es el entregable de la fase 1**, no el código.

> ⬜ **Lo que la 1.1 todavía NO cerró, y es el gate de verdad: nadie vio una pieza en el Feed.** El
> código está en el repo con sus tests, pero **en n8n vive el esqueleto de 11 nodos**: los 5 nuevos
> son topología y la topología **no entra por `n8n:push`** (el push la detecta y se niega). Aplicarla
> es el ritual manual de ADR-053, y toca decidirlo aparte — con la instancia `30x/linkedin`, que ya
> está `active`, y **0.3 hecho**, porque sin una voz con perfil el stub emite 0 piezas a propósito.

> ✅ **La pregunta abierta de 1.4 quedó CONTESTADA el 2026-08-12: opción (a), una persona pega el
> texto ya transcrito**, como el `transcribir` de reels (ADR-031). Descartadas: (b) guardar una URL y
> que el motor baje el texto, (c) reabrir `enriquecer` con Supadata — contradecía el manifest.
>
> ⛔ **Pero contestarla destapó una más profunda, y ESA bloquea la 1.4: ¿qué es un candidato de
> LinkedIn, material crudo o un post ya generado?** El manifest y ADR-055 §5 dicen una cosa, la
> pantalla del Feed dice la otra, y la columna `texto` de la `020` **hedgea las dos** (*"el post **o
> la idea**"*). Decide si `colectar` personal es construible hoy y si `calidad` está en el lugar
> correcto. **Está escrita entera, con las dos lecturas y su evidencia, arriba de todo en
> [handoff.md](./handoff.md).**

---

## Fase 2 — El carril copiable

Arranca cuando **existe el banco** (bloqueo #2) y hay un actor elegido.

| # | Qué | Nota |
|---|---|---|
| **2.1** | **Elegir el actor de Apify para Pinterest** y documentar por qué | Es plata real. Se prueba con 1 filtro y `pins_por_consulta` chico antes de cablearlo |
| **2.2** | `colectar` copiable | Un scrape por fila `fuente: pinterest` del plan |
| **2.3** | `normalizar` | Pins/posts → el `content_item` común. **Cada pieza carga su `carril` y su `fuente`** — el plan ya sirve `carril` resuelto (ADR-068), no se re-deriva en el nodo |
| **2.4** | `filtrar_scorear` | 🔴 **Umbral POR CARRIL**, que es la diferencia estructural con reels: copiable-LinkedIn mide reacciones, copiable-Pinterest mide pertinencia y formato (un pin no tiene con qué comparar), personal **no mide nada** |
| **2.5** | Dedup | Contra `app.candidatos_linkedin` por **`(instance_id, external_id)`**. ⚠️ Scopeado, nunca global: el unique global fue el peor hallazgo del diagnóstico multi-tenant — le vacía el supply a la segunda empresa **sin un solo error** |
| **2.6** | Descartes borderline | A `app.descartes_linkedin`, para auditar falsos negativos. No se barren nunca (ADR-036) |

> **Lo que NO hace esta fase:** rebrandear la imagen (paleta, traducción, firma al pie). Es trabajo
> de producción y va por `outputs` cuando exista, no en `candidatos_linkedin` (`020` §4).

---

## Fase 3 — El disparo

Solo cuando la fase 1 pasó su gate. **Un workflow activo sin etapas abre runs que no entregan nada.**

### 3.1 · El cron en el dispatcher — ⚠️ **el paso con riesgo real**

Los crons no viven en el workflow (ADR-050): el dispatcher tiene **2** (motor lunes 8:00, archivado
domingo 18:00) y hay que agregar el tercero.

🔴 **Esto SÍ es tocar la topología de un workflow vivo y activo**, que es exactamente el caso que
[plan-multi-tenant §14.2](./plan-multi-tenant.md) dejó pendiente: `nodes` **reemplaza**, así que un
`PUT` mal armado borra nodos del dispatcher — y el dispatcher es lo que dispara *todo* el sistema.
**No es lo mismo que crear un workflow nuevo** (eso es un `POST` sin nada que destruir, y es lo que
se hizo el 09/08 con el esqueleto).

Dos caminos, y hay que elegir uno a conciencia:

- **(a) A mano en el editor de n8n** — el ritual actual. Para 2 nodos (cron + su Config) es
  razonable y es lo que el repo hace hoy. Después: `npm run n8n:diff` **sin excepción**.
- **(b) Construir el push de topología con red** (§14.2): snapshot previo obligatorio, diff de nodos
  que se van a borrar, confirmación explícita. Es la inversión que sirve para siempre — pero es un
  proyecto, no un paso.

**Recomendación: (a) ahora, (b) cuando haya un tercer pipeline.** Dos nodos a mano no justifican
construir la red; el día que sean rutinarios, sí.

### 3.2 · El botón ▶ en el cockpit

Cuatro cambios, y **el orden importa** porque el 3.º es el que abre la puerta:

1. **`LINKEDIN_WEBHOOK_URL` en Vercel** (y en el `.env` local), hermana de las otras tres.
2. **`DUENO_DE_ESTOS_WEBHOOKS` deja de ser una constante y se vuelve un mapa**
   `pipeline → { motor, descubrimiento, archivado }`. Su propio comentario en
   `operar/actions.ts:42` ya lo dice: *"Cuando LinkedIn tenga los suyos, esta constante se vuelve un
   mapa"*. LinkedIn solo tendrá `motor`: no hay descubrimiento ni archivado suyos, y pedirle
   cualquiera de los dos tiene que seguir devolviendo *"este cockpit no es el dueño de esta máquina"*.
3. **Devolverle `operar` a LinkedIn** en `ZONAS_POR_PIPELINE` + agregar la pantalla `operar` a su
   declaración.
4. **Los 4 tests de `pipelines.test.ts` que se ponen rojos** — y esto es una feature, no un estorbo.
   Uno de ellos (línea 30) lleva escrito *"si alguien vuelve a poner `operar` acá, este test se pone
   rojo y ese comentario es lo que tiene que leer antes de borrarlo"*. **Se actualizan con el motivo
   nuevo, no se borran**, y el motivo es que ahora hay un motor propio + el mapa del paso 2.

> 🔴 **La guarda de `noEsSuMaquina()` NO se saca nunca.** Sacar la zona cerró la puerta en agosto;
> la guarda es la que sobrevive a esta fase. Es la tercera vez que este repo aprende que **una
> guardia se pone donde está la consecuencia, no donde está la ruta**.

### 3.3 · Activar

En este orden, y no al revés:

1. `npm run n8n:diff -- linkedin` verde.
2. Una corrida manual con el uuid de la instancia ⇒ mirar la fila en `runs`: `estado: ok` y
   `metricas` con lo que trajo.
3. Activar el workflow en n8n.
4. `update workflows set estado='active' where id='linkedin';` — la nota de la `020` dice
   exactamente esto: pasa a `active` cuando esté importado **y activo**.

---

## Fase 4 — Las perillas (migración `028`)

Hoy los umbrales viven en el `Config` del workflow y **eso está bien mientras haya una instancia
afinándolos**. Deja de estarlo cuando dos empresas quieran valores distintos: ahí `Config` obliga a
un push por cada cambio y el equipo no puede tocarlo sin un dev.

- La `028` hace `drop constraint ajustes_clave_check` (viene de la `014`, **está nombrado**) y lo
  vuelve a crear con la unión de vocabularios.
- 🔴 **Toca `app.ajustes`, que reels usa todas las semanas.** La disciplina de la `027` pide
  **correrla contra un Postgres local con la forma de prod antes de tocar nada**. En la máquina de
  Alejandro **Docker no responde y no hay `psql`** — ese es el bloqueo, y es de entorno.
- Cuando entre: el plan de LinkedIn gana `ajustes`, y **ese sí es un cambio de forma** para un
  consumidor que para entonces existe (ADR-068 §Consecuencias).

---

## Lo que este plan deliberadamente NO hace

| | Por qué |
|---|---|
| **Publicar** | Nunca. Publica una persona (ADR-055 §5). No es una limitación temporal: el costo de equivocarse en un canal que no quiere ser automatizado es la cuenta, y ya hay precedente propio y caro con los baneos de WhatsApp por Baileys |
| **Filtrar por sensibilidad local** | Prohibido política y religión; comedia y controversia permitidas. La regla real —*"cuidado con las palabras, más si habla de cosas sensibles en Colombia"*— **la resuelve el humano de la curación**. Es un límite del producto, no un filtro |
| **`historicos` y `sugeridos`** | No tienen escritor. Ratificado en ADR-066 para no re-litigarlo cada vez que alguien mire la lista |
| **Un workflow por empresa** | ADR-050. La evidencia es el propio n8n: **~57 workflows apagados** con nombres repetidos, que es lo que produce ese patrón |

## Y el número que conviene tener a la vista

El runbook [agregar-workflow.md](../runbooks/agregar-workflow.md) ya midió esto y **no pasa el
criterio F5**: LinkedIn lleva ~2.500 líneas, 2 migraciones, 4 ADRs y ~15 archivos de la app **sin
tener todavía una sola etapa de contenido**. *Una empresa es un parámetro; un pipeline es un
dominio.* Este plan no lo cambia — lo hace explícito.
