# Verificaciones de ojo humano — lo que ningún agente puede cerrar

> **Qué es.** La lista de lo que falta mirar **con los ojos**, escrita para ejecutarla sin releer
> nada más. No la corre un agente: cada item necesita una sesión con login por magic link, o una
> persona que use el sistema y diga si sirve.
>
> **Quién.** Mani, Majo, Jero y Alejo. Cada item dice quién y cuánto tarda.
>
> **De dónde sale.** Es la tarea **B5** de
> [plan-multi-tenant §15.B](./agents/plan-multi-tenant.md). Junta los arrastres del handoff con las
> corridas de fuego del [ROADMAP §3](../ROADMAP.md) que nunca se cerraron.
>
> **Lo que NO va acá:** nada que se pueda medir con una query o un `curl`. Eso se mide y se escribe
> con su número, no se le pide a una persona.

---

## 0. Antes de mirar nada: cómo se lee un número

Las pantallas cargan contra la base con **la sesión del usuario**, no con `service_role` — la Capa 2
(RLS) está viva en producción desde el 2026-08-05
([ADR-058](./adr/ADR-058-el-flip-de-la-capa-2.md)). Eso hace que un número sea evidencia:

| Lo que ves | Qué significa |
|---|---|
| **El número esperado** | ✅ Las dos capas andan |
| **Cero, con la pantalla cargando limpia** | 🩸 **El fallo silencioso.** Una policy que no matchea. Es la familia del bug de la `015`, y es el peligroso: se lee igual que *"todavía no cargamos datos"* |
| **`42501` en pantalla** | El fallo *ruidoso*: falta un `grant`. Se arregla con SQL, **sin revertir el deploy** |
| **Un número mayor al esperado** | 🩸 El filtro de Capa 1 se rompió: estás viendo datos de otra empresa |

🩸 **Por eso están los números: *"se ve bien"* no distingue el caso 1 del caso 2.**

### ⚠️ Y por eso los números tienen que ser los correctos

La tabla de números que traía el handoff tenía **4 filas de 9 equivocadas**, y todas equivocadas
hacia el mismo lado: pedían el `count(*)` crudo de la tabla cuando la pantalla filtra. Alguien que
las hubiera usado habría reportado un fallo de RLS que no existe. Corregidas contra el código y
contra la base, **con la query scopeada al cockpit** (`instance_id` de `retia/reels`, o `client_id
= 'retia'` según el grano de cada tabla), el **2026-08-06**:

| Pantalla | Decía | **Es** | Por qué |
|---|---|---|---|
| `/operar` | 41 corridas | **5 tarjetas** | `ultimasCorridasMotor` tiene `limite = 5` **y** filtra `params->>workflow = 'motor'`. La instancia tiene 28 corridas de motor; las 41 son todos los workflows |
| `/curar/historicos` | 88 | **31** | La pantalla y el CSV filtran `.eq("estado","aprobado")`. Los 88 `outputs` son 31 aprobados **+ 57 descartados** |
| `/curar/sugeridos` | 8 | **6** | Filtra `.eq("estado","propuesto")`. De los 8, 2 ya están `promovido` |
| `/curar/ajustes` | 18 knobs | **18 para un `dev` · 8 para un `operador`** | `ajustesVisibles` deja al operador solo los de `visibilidad = 'equipo'`. Son 10 de dev + 8 de equipo |

> 🔑 **Y la trampa inversa, que casi se cuela en esta misma corrección:** `app.voces` tiene **4**
> filas en toda la base, pero `/retia/reels/curar/voces` muestra **3**. No es un filtro de la
> pantalla: **`voces` es de grano empresa (`client_id`)** y la cuarta es de 30X. **El `count(*)`
> global no sirve ni para confirmar ni para desmentir** — hay que scopear la query igual que scopea
> la pantalla, y por el grano correcto: `voces`, `proyectos` y `referentes` van por **empresa**;
> `ajustes`, `candidatos`, `descartes`, `transcripciones`, `runs` y `outputs` van por **cockpit**
> ([§2.B de plan-multi-tenant](./agents/plan-multi-tenant.md), el doble grano).

### Los números buenos, medidos el 2026-08-06 (cockpit `/retia/reels`)

| Pantalla | Tiene que mostrar |
|---|---|
| **`/entender`** | ⚠️ **Empezá por acá si estás verificando RLS**: son las **12 vistas `security_invoker`**, la zona de más riesgo |
| `/operar` | **5** tarjetas de corrida, la más nueva del **2026-08-03** |
| `/curar/feed` | **25** tarjetas y los chips diciendo **165** *(pagina de a 25 desde el cierre 98)* |
| `/curar/voces` | **3** voces (las 3 activas) · **6** proyectos (5 activos) |
| `/curar/referentes` | **16**, todos de Instagram |
| `/curar/ajustes` | **18** si sos `dev` · **8** si sos `operador` |
| `/curar/descartes` | **38** |
| `/curar/sugeridos` | **6** |
| `/curar/historicos` | **31** |
| `/transcribir` | **2**, las dos en `listo` |

> 🔑 **Un dueño (`es_dueno`) NO bypassa RLS**, y es lo que hace que estas pruebas valgan: `es_dueno`
> es un predicado *adentro* de `app.clientes_visibles()`, no un `BYPASSRLS`. Solo el `service_role`
> bypassa, y ese ya no lee las pantallas.
>
> ⚠️ **Ventana de incógnito siempre.** Si no, el magic link cae sobre la sesión que ya tenías.

---

## 1. 🔴 El clic al **Descargar CSV** de `/curar/historicos`

**Quién:** Mani · **2 minutos** · *Es el arrastre abierto más viejo (cierre 94).*

**Qué es:** el histórico de lo aprobado, bajado como planilla. Es lo que **reemplazó al Google
Sheet** que el archivado escribía semana a semana ([ADR-057](./adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md));
con él se fue la última dependencia de Google del pipeline. Sin este botón, lo aprobado solo se
puede mirar en pantalla.

**Dónde está el botón:** entrás a `/retia/reels/curar/historicos` (zona **Curar** → pestaña
**Históricos**) y arriba de la tabla está **Descargar CSV**. Baja un archivo y se abre con Excel
o Numbers.

Su parte frágil está verificada contra las filas reales de prod con un parser RFC 4180
independiente. Lo que nadie hizo es **el clic**.

**Tiene que traer:** **15 columnas** · **31 filas** de datos + el encabezado · los **acentos
derechos** (si ves `MÃ©tricas`, el BOM/encoding se rompió).
**Si el archivo baja vacío o con 0 filas:** no es el CSV, es la lectura — mirá primero si la pantalla
misma muestra las 31.

## 2. ✅ Recorrer el **feed entero** — CERRADO por Mani el 2026-08-07

Pasó. Está en el §Registro del final; el enunciado completo vive en git
(`git log docs/verificaciones-humanas.md`) por si hay que repetirlo.

## 2-bis. 🟡 La pestaña **Transcribir** — **2 de 3 cerrados el 07/08. Queda el reintento.**

**Quién:** Mani · **2 minutos.**

1. ✅ **La oferta de quitar — PASÓ el 07/08.** Pegados los 2 links ya transcritos, la pantalla los
   detectó **antes de encolar** y ofreció quitarlos.
   🔬 **Y la prueba de que corrió el código NUEVO no fue el ojo, fue la ausencia de un evento:** ese
   camino corta antes de `pegarEnlaces`, así que **no escribe `transcribir.pegar`**. El código viejo
   avisaba *después* de encolar ⇒ habría dejado un evento con `ya_estaban: 2`. **Cero eventos nuevos
   en `app.eventos` ⇒ el deploy nuevo está vivo y el aviso llega antes de pagar.**
2. 🟡 **El reintento — el botón anda; lo que no andaba es lo de después.** Apretado el 07/08 a las
   07:24: evento `transcribir.reintentar` escrito, y la fila volvió a `pendiente` con el `error`, el
   `script` y el `procesado_en` limpios. **`reencolar` hace exactamente lo que dice.**
   🩸 **Pero desde la pantalla "no pasó nada", y era cierto:** la fila se quedó en `pendiente` con
   `procesado_en` en `null`, o sea que **el `Procesador` nunca arrancó**. Arreglado el mismo día con
   un `router.refresh()` en el botón — el porqué está en `reintentar.tsx`. **Falta ver que ahora sí
   arranque solo**, que es lo único que queda de este punto.
   ✅ **Que vuelva a dar "Sin transcripción" TAMBIÉN es un pase**: lo que se prueba es la transición
   de estado, no que Supadata acierte.
   📛 *Esa etiqueta decía **"Sin voz"** hasta el 07/08, y se renombró porque **"Voz" ya nombra otra
   cosa** en este sistema (el personaje para quien se cura contenido, `context.md`). La misma app
   usaba las dos acepciones en dos pantallas.*
   ⚠️ **En un `Listo` no tiene que haber botón**: reintentarlo sería pagar de nuevo un guion que ya
   tenemos. El servidor lo rechaza igual, pero el botón no debería estar.
   📌 **Y el botón ya no hay que buscarlo:** las fallidas tienen su propia tarjeta arriba de todo
   (*"N no salieron"*), por lo que se explica abajo.
3. ✅ **El doble pago — CERRADO el 07/08 por medición, sin browser y sin pagar.** El reclamo y la
   transcripción son dos pasos separados, así que se ejerció **solo el reclamo** contra prod:
   4 filas sembradas, dos trabajadores, y las dos formas del choque:

   | | |
   |---|---|
   | secuencial | A se llevó **4**, B se llevó **0** |
   | **simultáneo** (los dos `PATCH` a la vez) | B se llevó **4**, A se llevó **0** |

   **Nunca se llamó a Supadata** (el procesador no corrió) y las 4 filas se borraron: la tabla quedó
   en 57 y `processed_items` sin una sola fila de prueba. Lo único que no cubre es la UX de dos
   pestañas, que es la mitad menos riesgosa.

### 🩸 Tres hallazgos del 07/08, y los tres salieron de probar UN botón

**1. La fila fallada no se podía encontrar.** *"No encuentro eso de reintentar"* no era un despiste:
la lista trae **las últimas 50** por `creado_en`, una tanda de 52 links pegados juntos comparte el
timestamp **al segundo**, y la única fallada del día cayó en la **posición 49 de 50**, indistinguible
entre 49 `Listo`. Peor: el desempate entre timestamps iguales es **arbitrario**, así que el pegote
siguiente la empujaba fuera de la ventana y el botón se volvía **inalcanzable** — la fila quedaba
clavada, que es *exactamente* el bug que ese botón existe para matar. Ahora las fallidas se traen
aparte, sin ventana, en su propia tarjeta arriba de todo.

**2. El botón dejaba la fila en la cola y nadie la procesaba.** Medido: `pendiente` con
`procesado_en` en `null`. `revalidatePath` invalida el cache del server, pero lo que dispara el
`Procesador` es el prop `pendientes`, y eso pide un re-render del cliente. El pegote no lo notaba
porque ahí el `setResultado`/`setTexto` ya provocaban uno. Un `router.refresh()` lo cierra.

**3. El panel miente sobre los links que fallaron**

`cualesEnCola` pregunta *"¿está en `app.transcripciones`?"* **sin mirar el estado**. Entonces, si
pegás de vuelta un link que quedó en `fallo` o `sin_transcript`, el panel lo cuenta como
*"ya los pediste antes — el guion está o **viene en camino**"*. **Para una fila fallada eso es falso:
no viene nada**, y el mensaje manda al usuario a esperar algo que no va a pasar en vez de mandarlo al
botón **Reintentar**, que es lo único que lo destraba.

No hace perder plata (el error es hacia *no* cobrar) y por eso no bloquea nada. Pero es un fallo
mudo de los que este repo persigue: **la pantalla dice que está todo bien y no lo está.** Arreglado
el mismo día: `fallados` es su propio montón en `repartirEnlaces`, con dos tests.

🔑 **Lo que enseñan los tres juntos:** el arreglo del 06/08 estaba bien **en su mitad de servidor** y
sin estrenar en la de pantalla. Ninguno de los tres se ve en una query ni en un test de dominio —
salieron de que una persona apretara el botón. Es el argumento entero de este documento.



## 3. 🟡 Que el tab **Entender** aparezca en el nav de un **operador**

**Quién:** Jero o Alejo · **10 segundos, en su próximo login.**

La lógica tiene tests; falta el ojo. *No se probó desde una sesión de agente a propósito: habría
requerido generar un magic link de la cuenta de otra persona.*

## 4. 🔴 Que un **operador** NO vea los costos de proveedor *(Carril 0)*

**Quién:** Mani, y **después** de que el gate de `entender/page.tsx` pase a `rol === "dev"` ·
**1 minuto.**

Con gente de Retia adentro, eso es el margen de la agencia, y el gate **falla hacia MOSTRAR**.

- Con cuenta **`operador`** en `/retia/reels/entender`: **no** aparece la tarjeta de costos.
- Con cuenta **`dev`**: sí aparece.

**Es la única de esta lista que bloquea dar de alta a alguien de Retia.**

## 4-bis. 🟡 **A7 — que dos personas en Operar se vean** *(nuevo del 06/08)*

**Quién:** Mani, o dos personas del equipo · **1 minuto** · *Necesita **dos** sesiones, y por eso no
la puede cerrar un agente.*

Antes, `auto-refresh` solo se montaba si ya había una corrida viva **al renderizar**: quien tenía
Operar abierta cuando otro disparó no se enteraba nunca. Y `correrAhora()` no preguntaba del lado del
servidor, así que el segundo click contestaba *"Señal enviada"* aunque el guard de n8n lo hubiera
bloqueado. **Las dos mitades se arreglaron; falta el ojo.**

Dos ventanas en `/retia/reels/operar` (una en incógnito), y mirar **dos cosas**:

1. **Disparar ▶ en la ventana A.** La ventana B, sin tocarla, tiene que enterarse sola **en ≤30 s**
   (esa es la cadencia ociosa; con corrida viva pasa a 5 s).
2. **Apretar ▶ en la ventana B mientras la corrida sigue.** Tiene que decir
   **"Ya hay una corrida corriendo"** — no *"Señal enviada"*.

⚠️ **Esto gasta una corrida real.** Conviene hacerlo aprovechando una corrida que ya ibas a disparar,
no una a propósito.
🔑 **Lo que NO prueba:** dos clicks **simultáneos** siguen pasando los dos. Es la race de 1-2 s de
ADR-023 C.3.3, aceptada y argumentada — la corta el guard de n8n, no la pantalla.

## 5. ⬜ **V4 — el re-rank** *(ROADMAP §3)*

**Quién:** Majo o Jero · **2 minutos.**

El enunciado del ROADMAP era *"la vista 🔥 Seleccionados"*, que era de Airtable y murió con él. Lo
pedido —punto 5 del norte— sigue igual y hoy lo sirve el Feed:

En `/curar/feed`, filtrar por **aprobados**: tienen que salir **solo aprobados**, ordenados
**caliente → frío** por `heat_score`.

## 6. 🟡 **V2 — literalidad: la mitad española NO es una muestra, y la otra mitad no tiene con qué compararse** *(ROADMAP §3)*

**Quién:** Majo o Jero (son quienes saben si un guion sirve) · **5 minutos** (era 10).

Es la única verificación de la lista que mide **calidad**, no funcionamiento. El enunciado pedía
muestrear 2 o 3 candidatos, uno en español y uno en otro idioma. **Medido el 2026-08-07, las dos
mitades resultaron ser cosas distintas de lo que decía.**

### ✅ La mitad española está CERRADA, y no por el ojo: por construcción

**Un video en español nunca pasa por Claude.** En `Traducir (Claude Haiku)`, el `order` de traducción
solo admite `idioma !== 'es'`, y el reparto final es `script: (cache[id] || transcript)` — para un
video español el `cache` está vacío, así que **el script ES el transcript, byte por byte**. No hay
camino por donde entre una reescritura.

Ya tenía test desde antes y **está verde**: `test-nodos.mjs` → *"el español no gasta una llamada"* +
*"y su script queda como el transcript original"*. **Mirarlo a ojo no agrega evidencia** sobre lo que
un `===` ya prueba.

📏 **Y aunque quisieras mirarlo, no hay material:** los **170 candidatos** del feed son **169 `en` +
1 `otro`**. **Cero en español.** Los referentes son casi todos ingleses (ya lo decía el comentario del
nodo: 170 traducciones sobre 191 transcritos). El español del sistema vive en `app.transcripciones`
(51 de 57 filas), que es **otro camino** (Transcribir, ADR-031) y tampoco traduce.

### ⬜ Lo que queda: la traducción, y hay que mirarla EN CALIENTE

Que la traducción sea literal y no embellecida **sí** es juicio humano, y ningún test lo cubre: el
prompt pide fidelidad, pero que Haiku la respete solo lo dice alguien que lea los dos textos.

🩸 **El problema: el transcript original NO se guarda en ningún lado.** `app.candidatos` tiene el
`script` ya traducido y nada más; no hay columna con el texto fuente. Medido el 07/08:
**cero solape** entre las 57 `transcripciones` y las URLs de los 170 candidatos, así que tampoco se
puede cruzar por ahí. **Comparar después de la corrida es imposible sin volver a pagarle a Supadata.**

⇒ **Dos formas de cerrarla, las dos legítimas:**
1. **La barata (recomendada):** abrir un candidato en `/curar/feed`, abrir su link, **ver el video** y
   juzgar si el guion dice lo mismo. No compara contra el transcript sino contra la fuente, que es lo
   que al equipo le importa igual.
2. **La cara:** leer los logs de la corrida en n8n mientras corre (el nodo loguea, no persiste), o
   pegar la misma URL en **Transcribir** para obtener el transcript y compararlo a mano. Paga.

## 7. ⬜ **V5 — corrida incremental + dedup** *(ROADMAP §3)*

**Quién:** Mani · **⚠️ gasta créditos: es una corrida real.**

El dedup ya quedó verificado en vivo; lo que falta es la corrida incremental completa. Correr con
`dias_recencia = 1` y mirar que **no reaparezca nada ya procesado**.

⚠️ **No la corras antes de firmar el gate de la `023`** (tarea B1). El modo de falla está medido: si
`processed_items` deja de escribirse, PostgREST rechaza el insert entero con `PGRST204`, el
`onError: continue` se traga el 400 y **el motor cierra en verde sin memoria de dedup** — que es
exactamente lo que esta prueba cree estar midiendo.

## 8. 🛑 **V6 — resiliencia: hay que rediseñarla antes de correrla**

**Quién:** decisión de Mani, no ejecución.

**El enunciado del ROADMAP envejeció con D7 y hoy no prueba lo que dice.** Pedía *"romper la
credencial de Supabase → el workflow IGUAL escribe a Airtable"*, apoyado en el **invariante #1** de
[PLAN §2.5](../PLAN.md): *"el registro es sumidero de datos, jamás dependencia de ejecución"*.

🩸 **Airtable ya no existe, y la entrega también es Supabase.** Romper esa credencial ya no separa
entrega de registro: **las tumba a las dos**. La prueba, tal cual está escrita, no puede pasar.

**El invariante sigue vivo; lo que cambió es cómo se ejercita.** Su forma honesta hoy es: *si fallan
los writes del **registro** (`runs` / `outputs` / `processed_items`), ¿los candidatos igual llegan a
`app.candidatos`?*

### 📏 Medido el 2026-08-07: el invariante ya está escrito en el workflow, nodo por nodo

Se listaron los **11 nodos HTTP del motor** y los **9 del archivado** con su `onError`. El reparto
no es casual: **es exactamente el invariante**, declarado.

| | Nodos | `onError` |
|---|---|---|
| **Registro** (sumidero) | `Abrir run` · `Cerrar run` · `Barrer runs zombie` · `Leer corridas vivas` · `POST processed_items` · `POST Descartes` · `Leer señal selección` · `Leer feed vivo` · `Registrar outputs` · `Barrer candidatos` · `PATCH Proyectos criterios` | **`continueRegularOutput`** — si se caen, la corrida sigue |
| **Entrega y sus insumos** (dependencia real) | `POST Candidatos` · `Leer plan (fachada)` (ADR-028) · `Leer procesados` (ADR-029 exc. 1) · `Leer Candidatos calificados` · `Borrar candidatos` | **sin `onError`** — fail-closed **a propósito**, cada uno con su ADR |

⇒ **El invariante #1 no es una conducta que se descubre rompiendo algo: es una propiedad estructural
que se lee del `workflow.json`.** Y `onError: continueRegularOutput` no es documentación, es el
mecanismo de n8n: el que lo tiene, sigue.

### 🩸 Y por eso el simulacro, tal como está escrito, es IMPOSIBLE de montar

**Los 20 nodos comparten `Config.supabase_url`.** No hay forma de romper el registro sin romper la
entrega, porque salen de la misma perilla. El simulacro no es "difícil": no existe la palanca.

### ✅ Lo que se hizo el 2026-08-07: el check #6 del auditor

`Workflows/auditar-workflows.mjs` ahora verifica el invariante en cada corrida, sobre los **31 nodos
HTTP de los 5 workflows**:

> Todo nodo `httpRequest` lleva `onError: continueRegularOutput`. Las excepciones son la constante
> `FAIL_CLOSED`, **nombre por nombre y cada una con su porqué escrito**.

**El default es "sos sumidero".** Un nodo HTTP nuevo entra pidiendo su `onError`; quien lo quiera
fail-closed tiene que escribir en la lista por qué, y eso es una línea de diff que se lee en el
review. Hoy son **9**: los 4 `Leer plan (fachada)`/`Leer instancias` (ADR-028), `Leer procesados`
(ADR-029 exc. 1), las 3 entregas (`POST Candidatos`, `POST Propuestos`, `Leer Candidatos
calificados`) y `Borrar candidatos` (reintenta 3× y corta; el upsert lo hace idempotente).

🔴 **Se verificó poniéndolo rojo, no verde.** Con los 3 modos de falla inyectados en una copia:
sacarle el `onError` a un nodo de registro · dárselo a uno de `FAIL_CLOSED` (lista vieja) · renombrar
un nodo que la lista nombra (lista fantasma). **Los 3 disparan y el auditor sale con exit 1.**

⇒ **V6 queda cerrada por auditoría.** La otra mitad ya estaba medida: un fallo real deja el `run` en
`fallo` (**12 de 41 corridas**, error handler de ADR-054).

### 🟡 Lo que NO se hizo, y queda como opción de Mani

**Montar el simulacro de verdad** pediría partir `Config.supabase_url` en `supabase_url` (entrega) +
`supabase_url_registro`, para poder apuntar solo el registro a un host inválido. Cuesta una perilla
nueva, un `n8n:push` y **una corrida real que paga** — y prueba en una corrida lo que el check prueba
en cada commit. Lo único que agregaría es *"n8n honra su propio `onError`"*, que no es algo que este
repo tenga que verificar. **Se deja sin hacer a propósito.**

✅ **La mitad que sí se puede dar por buena, y ya está medida:** un fallo real deja el `run` en
`fallo`. **12 de las 41 corridas** están así, y el error handler de
[ADR-054](./adr/ADR-054-cada-run-lleva-su-execution-id.md) las marca por `params.execution_id`.

**→ Decidir qué se rompe antes de correr V6.** Escrito acá para que no se ejecute la versión vieja y
se declare verde algo que no probó nada.

## 9. ⬜ **D3 — la demo de 10 minutos con Majo y Jero** *(ROADMAP §3)*

**Quién:** Mani + Majo + Jero · **10 minutos.**

Calificar · ver el re-rank · bajar el histórico. **El sistema solo sirve si lo usan**, y este es el
único item de la lista que mide eso. Es también la última condición del *"MVP declarado cuando"* del
ROADMAP §4: *el equipo de redes usa el sistema un día completo sin ayuda de un dev.*

## 10. 🔬 **La prueba de §14.6 — RLS de LinkedIn con filas** *(la mitad de query ya está cerrada)*

**Quién:** quien tenga la cuenta con membresía en **30X y EstadoX** (`alejandro.davila@30x.com`).
**Cuánto:** 3 minutos. **Las dos filas ya están sembradas en prod**, esperando este clic.

✅ **Lo que ya NO hay que hacer, porque se midió el 06/08 con sesiones reales contra prod** (la tabla
completa en [plan-multi-tenant §14.6](./agents/plan-multi-tenant.md)): la query de las dos capas
compuestas devuelve **1 y 1**, y **2** sin el filtro de cockpit — o sea que el 1 no es *"hay una sola
fila"*. Una cuenta de Retia ve **0** de esas mismas 2 filas, y el `insert` cruzado muere con `42501`.

⬜ **Lo que falta es exactamente esto, y nada más:**

1. En **incógnito** (si no, el magic link cae sobre otra sesión), abrí
   `/30x/linkedin/curar/referentes` → tiene que verse **`prueba rls 30x`, y sola**.
2. `/estadox/linkedin/curar/referentes` → **`prueba rls estadox`, y sola**.
3. **Agregá uno desde el botón.** Es lo único que ejercita los `grant insert` de la `024` *por el
   camino de la app*; la lectura no los toca.

**Si ves 2 en cada pantalla**, la Capa 1 se rompió entre la query y el render (la query ya se probó y
da 1). **Si ves 0**, mirá la consola: la query anda, así que el problema está en la pantalla.

🚮 **Limpieza, cuando termines:** `delete from app.referentes_linkedin where consulta like 'prueba rls%';`

⚠️ **No sirve con una cuenta `es_dueno`**: `app.clientes_visibles()` le devuelve todas las empresas,
así que su resultado es indistinguible del de RLS apagado. Por diseño.

---

## 11. 🔴 **Un alta real por la pantalla de equipo** *(nuevo del 06/08 — cierra B4)*

**Quién:** Mani (o cualquier `es_dueno`). **Cuánto:** 5 minutos, y **hace falta un mail que no esté
en el sistema** (un alias tuyo sirve: `manuel.mejia+prueba@30x.com`).

Es el único paso de [`agregar-cliente.md`](./runbooks/agregar-cliente.md) que quedó sin ejercitar. Lo
demás del runbook está contrastado contra el código y contra prod; **lo que ningún agente puede
confirmar es que el mail salga.**

1. `/retia/reels/ajustes/equipo` → **Invitar**. Pedí **nombre, mail y rol** (los tres; el nombre es
   obligatorio). Rol: `operador`.
2. **Que llegue el mail** con el magic link, y que al entrar caiga en el cockpit de Retia.
3. Que aparezca **en la lista de Retia y no en la de 30X**.
4. **El techo:** que el `<select>` te ofrezca `dev` (sos `es_dueno`). Si algún día lo prueba un
   `sponsor` del cliente, **no** tiene que ofrecérselo — y tampoco debe pasar forzando el POST.
5. 🚮 Después: quitale el acceso desde la misma pantalla.

🩸 **Y el hallazgo que este item viene a resolver, medido el 06/08:** hoy **ninguna empresa cliente
puede darse de alta a sí misma**. Hay **cero `sponsor`** en las tres empresas, y los únicos 2 que
administran equipo son los devs de la agencia. `30x` y `estadox` tienen **una persona cada una,
`operador`** — y un `operador` que entre a `/…/ajustes/equipo` sale rebotado. **Si querés que un
cliente se administre solo, hay que nombrarle un `sponsor`**, y eso es una decisión que nadie tomó.

---

## Registro — lo que ya se cerró, para no repetirlo

| # | Qué | Cuándo |
|---|---|---|
| **Recorrer el feed entero** | Sin paginar: las 170 de una, chips con el total real, y la tarjeta abre con guion | ✅ 2026-08-07, Mani |
| Recorrer las 4 zonas con una cuenta **dueña** | Las 4 cargan con datos, `Entender` incluida — que era el riesgo concentrado del flip | ✅ 2026-08-05 |
| Cuenta **no dueña**: 3 de 4 voces sin filtro de tenant | La mitad que prueba que RLS filtra de verdad | ✅ 2026-08-05 |
| Que una cuenta `operador` entre y vea nombre + rol | El hecho-cuando de D0 | ✅ 2026-08-04, después de la `019` |
