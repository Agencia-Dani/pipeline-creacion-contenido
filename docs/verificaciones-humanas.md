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

### Los números buenos, **remedidos el 2026-08-07 a las 18:00** (cockpit `/retia/reels`)

⚠️ **Esta tabla envejece rápido y hay que remedirla antes de usarla.** Se remidió **dos veces el
mismo día**: la corrida de V5 movió unas, y después el backfill de ADR-062 + una tanda del equipo
movieron otras. Un número viejo acá dispara exactamente la falsa alarma de RLS que este §0 previene,
así que **si pasaron días, medí de nuevo** (las queries están en el §0 de arriba).

| Pantalla | Tiene que mostrar |
|---|---|
| **`/entender`** | ⚠️ **Empezá por acá si estás verificando RLS**: son las **12 vistas `security_invoker`**, la zona de más riesgo |
| `/operar` | **5** tarjetas de corrida (el `limite` de `ultimasCorridasMotor`), la más nueva del **2026-08-07 07:51**, `ok`, 13.8 min |
| `/curar/feed` | **25** tarjetas y los chips diciendo **171** |
| `/curar/voces` | **3** voces (las 3 activas) · **6** proyectos (5 activos) |
| `/curar/referentes` | **16**, todos de Instagram |
| `/curar/ajustes` | **18** si sos `dev` · **8** si sos `operador` o `sponsor` *(el sponsor los ve desde ADR-063)* |
| `/curar/descartes` | **50** |
| `/curar/sugeridos` | **6** *(de 8 filas: la pantalla filtra `estado = propuesto`, las otras 2 están `promovido`)* |
| `/curar/historicos` | **140** 🔄 *(era 31 ayer). El salto NO es un bug: ADR-062 metió las transcripciones a pedido en el histórico. Son **32 del feed + 108 pegadas a mano***  |
| `/transcribir` | **110** filas en la base, pero la pantalla **muestra 50** — techo duro sin paginar, que es justo lo que ADR-064 viene a arreglar. 108 `listo` · 1 `fallo` · 1 `sin_transcript` |

> 🔑 **Un dueño (`es_dueno`) NO bypassa RLS**, y es lo que hace que estas pruebas valgan: `es_dueno`
> es un predicado *adentro* de `app.clientes_visibles()`, no un `BYPASSRLS`. Solo el `service_role`
> bypassa, y ese ya no lee las pantallas.
>
> ⚠️ **Ventana de incógnito siempre.** Si no, el magic link cae sobre la sesión que ya tenías.

---

## 1. ✅ El clic al **Descargar CSV** — CERRADO el 2026-08-07 · 🪦 **y el CSV murió el 2026-08-20**

> 📗 **Esta sección ya es historia: desde [ADR-071](./adr/ADR-071-el-export-es-un-xlsx-de-verdad.md)
> el export es un `.xlsx` de verdad y no hay CSV.** Se deja entera porque **su última línea predijo
> exactamente lo que pasó** — *"si aparece [un lector que no es ese Excel], es el momento de
> discutir un `.xlsx` de verdad"*. Apareció: el archivo se veía con una línea vacía entre cada fila.
> *Un costo que se escribe cuando se acepta es el que después se puede cobrar sin discutir de nuevo.*
> Lo que sigue vigente: el ⬜ de Google Sheets **se cierra solo** (un xlsx se sube y abre), y la
> regla de que las columnas no se corren de posición.


*"Ya descargué el CSV y sale perfecto, todos aparecen con sus respectivas columnas."* Era el arrastre
más viejo abierto de la lista (venía del cierre 94). **Ojo para la próxima descarga:** el CSV ahora
trae **16 columnas, no 15** — `ORIGEN` se sumó al final (ADR-062), y las 15 de siempre conservan su
posición exacta para no romper una planilla que lea por número de columna.

**Y desde el 2026-08-08 el archivo va en UTF-16LE y separado por TAB**, no en UTF-8 con comas
(ADR-057, §consecuencias). Es porque Mani lo abrió en **Excel** y salía todo amontonado en la
columna A: Excel le pregunta el delimitador al ajuste regional, y en región Colombia ese
delimitador es `;`. Verificado el mismo día abriendo el archivo real en **Excel y en Numbers**:
las columnas caen cada una en su celda, los acentos y los emoji de calificación intactos, y el
`SCRIPT` multilínea dentro de **una** celda en vez de partir la fila. Sigue llamándose `.csv`.

⚠️ **Lo que esto le hace a un tercero:** si alguien lo levanta con un script (pandas, `csv` de
Python), ahora necesita `encoding="utf-16"` y `sep="\t"`. Hoy no hay nadie haciendo eso; si
aparece, es el momento de discutir un `.xlsx` de verdad.

⬜ **Y queda un lector sin probar: Google Sheets** (*Archivo → Importar*). El onboarding decía "Excel
o Sheets" y ahora dice Excel, porque Excel y Numbers están verificados con los ojos y Sheets no.
**Si alguien del equipo lo usa ahí, es 1 minuto:** subir el archivo y mirar si las columnas caen
separadas y los acentos están derechos. Si sale mal, no se vuelve atrás —volver a la coma rompe
Excel, que es el destinatario— sino que se discute el `.xlsx`.

<details><summary>El enunciado original</summary>

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

</details>

## 2. ✅ Recorrer el **feed entero** — CERRADO por Mani el 2026-08-07

Pasó. Está en el §Registro del final; el enunciado completo vive en git
(`git log docs/verificaciones-humanas.md`) por si hay que repetirlo.

## 2-bis. ✅ La pestaña **Transcribir** — LOS 3 CERRADOS el 2026-08-07

El tercero se cerró **sin que nadie lo mirara a propósito**: la fila que había quedado en `pendiente`
esperando el reintento apareció después en `sin_transcript`, o sea que **el reintento arrancó solo al
recargar** y volvió a fallar — que es lo correcto, porque ese video no tiene voz (solo música).
Mani: *"el reintento se ve bien ahí, no sirvió porque el video no tiene voz"*.

🔑 **Y ese caso produjo un feature:** un enlace que nunca va a dar un script ahora se puede
**abandonar** (ADR-062 §4), en vez de quedar ofreciendo un botón que no puede ganar nunca.

<details><summary>El enunciado original y los 3 hallazgos</summary>

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



</details>

## 3. 🟡 Que el tab **Entender** aparezca en el nav de un **operador**

**Quién:** Jero o Alejo · **10 segundos, en su próximo login.**

La lógica tiene tests; falta el ojo. *No se probó desde una sesión de agente a propósito: habría
requerido generar un magic link de la cuenta de otra persona.*

## 4. ✅ Que un **operador** NO vea los costos de proveedor — **CERRADA el 2026-08-12** *(Carril 0)*

**La cerró Alejandro**, mirando `/retia/reels/entender` con las dos cuentas:

| Cuenta | Rol en `retia` | La tarjeta "Costos de la semana" |
|---|---|---|
| **Alejandro 30X** (`es_dueno: false`) | `operador` | ❌ **no aparece** |
| Alejandro Dávila | `dev` (por `es_dueno`) | ✅ aparece |

Era **la única de esta lista que bloqueaba dar de alta a alguien de Retia**. Ya no bloquea.

🔑 **Lo que la destrabó no fue código: fue una cuenta.** Llevaba días esperando a Mani porque hacía
falta un `operador` **real** con acceso a Retia, y no existía ninguno que no fuera del equipo de
redes. Se creó dándole a `Alejandro 30X` —que ya era operador de `30x` y `estadox`, y **no es
dueño**, que es lo que hace válida la prueba— una membresía `operador` en `retia`. *La prueba que
falta a veces no espera trabajo: espera un dato.*

🩸 **Y salió mal la primera vez, por las dos razones que este doc ya tenía escritas y nadie relee:**

1. **Las dos pestañas eran la misma sesión.** La cookie es una por dominio **y por perfil de
   navegador**, así que entrar con la segunda cuenta borró la primera y las dos mostraban al dueño.
   Ver costos en las dos era el resultado *correcto* de la prueba mal montada. Ver el recuadro de
   §4-bis: **dos perfiles de Chrome**, no dos ventanas y no incógnito.
2. **La bajada de la pantalla decía "y costos de la semana" sin gate**, así que la pregunta
   *"¿ves costos?"* tenía dos respuestas según si mirabas la frase o la tarjeta. **Ya está
   arreglado** (`entender/page.tsx`): la frase ahora se corta con el mismo `puedeVerCostos` que la
   tarjeta. *Una prueba de fuga que se puede contestar mal por una frase decorativa es una prueba
   rota.*

⚠️ **Cómo se lee bien, para la próxima:** lo que hay que buscar es **la tabla** de servicio ·
consumo · monto, no la palabra *"costos"*. Y antes de creerle a nada, mirar **el nombre arriba a la
derecha** de cada pestaña: si las dos dicen lo mismo, estás mirando una sola sesión.

## 4-bis. 🟡 **A7 — que dos personas en Operar se vean** *(nuevo del 06/08)*

**Quién:** Mani, o dos personas del equipo · **1 minuto** · *Necesita **dos** sesiones, y por eso no
la puede cerrar un agente.*

> 🔑 **Cómo tener dos sesiones vivas, que es lo que trabó esta prueba durante días:** **dos perfiles
> de Chrome**, no dos ventanas y **no incógnito**. La sesión es **una sola cookie por dominio y por
> perfil**, así que entrar con la cuenta B en el mismo perfil **borra** la de A — y con incógnito se
> pierde al cerrar la ventana. Un perfil por cuenta y las dos duran (la cookie vive 400 días).
> Desde [ADR-065](./adr/ADR-065-la-puerta-se-abre-con-contrasena.md) cada entrada es mail +
> contraseña, así que armar el segundo perfil ya no cuesta esperar un correo.

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

## 4-ter. ⬜ **El botón "Marcar como grabado" y su aviso** *(nuevo del 18/08, ADR-069)*

**Quién:** Majo o Jero · **2 minutos** · *No la puede cerrar un agente porque el aviso solo aparece
si una persona marcó primero: la mitad del circuito es un hábito, no un query.*

La `028` **ya está aplicada y verificada por su efecto** (129 filas, 0 grabadas, y un PATCH con la
forma exacta del toggle devuelve `200 []` en vez de `PGRST204`, sin escribir nada). Lo que falta es
el circuito entero, de punta a punta:

1. En **Transcribir**, abrir una tanda y apretar **Marcar como grabado** en una fila `Listo`.
   Tiene que aparecer el cartelito **Grabado** en esa fila.
2. Apretarlo de nuevo. La marca tiene que **salir**, sin preguntar nada y sin romper la fila.
3. Volver a marcarla, copiar **el link de esa misma fila**, y pegarlo en el campo de arriba como si
   fuera una lista nueva. El aviso tiene que decir **"1 ya se grabó"** — y **no** *"1 ya lo pediste
   antes"*, que es lo que decía hasta hoy.

> 🩸 **Los pasos 1 y 2 fallaron la primera vez que Mani los corrió (18/08), y el bug NO era el
> botón.** La marca entraba a la base perfecto (`grabado_en` escrito, verificado por query) y **la
> pantalla no acusaba recibo**: las filas de una tanda abierta viven en el `useState` de
> `tanda.tsx`, y `router.refresh()` solo re-renderiza server components. Arreglado con estado
> optimista en `Fila`, el mismo patrón que `titulo` ya usaba 40 líneas más arriba en ese archivo.
> **La lección: un botón que escribe bien y no repinta se lee como un botón roto**, y el operador
> vuelve a apretarlo.
>
> 🎨 **Y hubo un SEGUNDO arreglo, porque el primero no alcanzó.** Con el estado ya funcionando, Mani
> volvió a reportar *"no hay manera de saber si se marcó"* — y tenía razón: el badge se había puesto
> en `variant="secondary"`, **el mismo que usa `listo`**, así que quedaban dos pastillas grises
> idénticas pegadas. El cue existía en el DOM y no existía para el ojo. Ahora el badge va en
> `default` (color de acento) y el botón deja de intentar ser indicador: **el estado se muestra
> fuerte (`✓ Grabado`), la acción se ofrece callada (`Sacar la marca de grabado`)**.
> *Generalizable: un indicador nuevo se elige contra los que YA están en esa línea, no en abstracto.*
>
> ✅ **`Reintentar` y `Abandonar` tenían el MISMO bug dentro de una tanda abierta, y se cerró el
> 20/08** ([PR #4](https://github.com/Agencia-Dani/pipeline-creacion-contenido/pull/4), cierre 112):
> los dos hacen `router.refresh()`, que no toca el `useState` de `tanda.tsx`. No se notó antes
> porque esos botones también salen en la **tarjeta de fallidas**, que sí es server-rendered y ahí
> el refresh funciona. El arreglo: `tanda.tsx` recarga sus filas cuando cambian los contadores de la
> cabecera, sin importar qué botón los cambió. **Falta la verificación con los ojos** — el PR trae
> automático (typecheck, 320 tests, build) pero nadie lo apretó en prod todavía:
> 1. Abrir una tanda con una fila **Falló** / **Sin transcripción** → **Reintentar** → pasa a
>    **En cola** y los botones desaparecen, sin recargar la página.
> 2. Esperar al procesador → la fila llega a **Listo** sola.
> 3. Con esa tanda abierta, **Reintentar** desde la tarjeta *"N no salieron"* de arriba → la fila de
>    abajo cambia también (antes se contradecían: una desaparecía arriba y quedaba igual abajo).
> 4. **Abandonar** (dos clics) → la fila pasa a **Abandonado** y los botones se van.

🔑 **El punto 3 es toda la prueba.** Los otros dos solo confirman que el botón guarda; el 3 confirma
que **el montón nuevo le gana en precedencia a `enCola`** (ADR-069 §4). Un video grabado está
*siempre* en la cola —se marca desde su propia fila, así que la fila existe por construcción— y si
ganara `enCola`, el aviso diría *"el guion está o viene en camino"* sobre algo que ya se usó, que es
exactamente el mensaje que manda a grabarlo de nuevo. El test de dominio ya cubre el orden
(`enlace.test.ts`); esto cubre que la pantalla lo muestre.

⚠️ **No gasta plata:** `revisarPegote` no escribe ni cobra, y aceptar el aviso saca el link de la
lista antes de encolarlo. Se puede hacer con cualquier fila real sin consecuencias.

🔴 **Y la mitad que ninguna prueba cierra:** si el equipo no toma el hábito de marcar, el aviso no
aparece nunca y la columna es peso muerto. El canario se corrió a la tabla nueva con ADR-070 — a un
mes, `select count(*) from app.grabados`. Si da 0, la decisión estaba equivocada y lo que falta es
otra cosa.

⚠️ **Esta verificación sigue valiendo tal cual, pero la marca ya no vive donde decía.** Con ADR-070
se mudó de `app.transcripciones.grabado_en` a `app.grabados`, con clave por video. El circuito de
los 3 pasos es idéntico de cara al operador; lo que cambió es que ahora **también** se puede hacer
desde Históricos, que es la §4-quater.

## 4-quater. ⬜ **El registro de grabados en Históricos** *(nuevo del 20/08, ADR-070)*

**Quién:** Mani, y después Majo o Alejo · **5 minutos** · *La mitad que un agente no puede cerrar es
la misma de siempre: hay que apretar el botón y mirar.*

La `029` **ya está aplicada y verificada por su efecto** (la tabla responde, el backfill trajo la 1
marca que existía, y `estado` de `transcripciones` quedó idéntico: 128 `listo` + 1 `abandonado`).
Las formas de escritura también se midieron contra prod con una fila descartable: upsert nuevo → 1
fila, upsert repetido → **0** (que es como se cuenta *"ya estaban"*), delete → 1.

📏 **Los números esperados en `/retia/reels/curar/historicos`, re-medidos contra prod el 2026-08-21
19:10.** La tabla anterior decía **184 · 6 · 178** y estaba **muy** mal: la movió Majo Duarte el
20/08 a las 23:10 UTC, cargando **288 links** en dos tandas de 166 y 122. Si alguno no da, es un
síntoma, no un detalle:

| Chip | Esperado | Si da otra cosa |
|---|---|---|
| **Todos** | **382** | Si da 0 o mucho menos, es RLS o el grant de `outputs`, no la pantalla |
| **Grabados** | **294** | Si da 0, la policy de `app.grabados` no deja leer (falso "nadie marcó"). Si da ~6, la pantalla no está viendo la carga de Majo |
| **Sin grabar** | **88** | Los tres tienen que cerrar: **88 + 294 = 382** |

🩸 **Estos tres salen de la PANTALLA, leídos el 21/08 21:35, y no de un cruce hecho a mano.** Este
doc llegó a decir **411 · 294 · 117**, calculado cruzando `app.grabados` contra `outputs` con un
regex de shortcodes: cerraba entre sí y estaba **mal por 29**. *Un cruce aproximado que cierra
consigo mismo se lee igual de convincente que uno correcto* — para un doc que existe para dar
números esperados, la fuente es la pantalla que se va a mirar.

🟢 **De las 294, 288 son de Majo y son USO REAL** — el primer uso del sistema por alguien que no lo
construyó. Las otras 6 son de Mani probando (5 el 20/08 entre 20:14 y 20:15 UTC, 1 del 18/08).
*El renglón anterior decía "las 6 marcas son de Mani, ninguna es uso del equipo": era cierto a las
16:30 del 20/08 y dejó de serlo esa misma noche.*

⚠️ **Y por eso mismo el número no se lee de esta tabla: se re-mide** antes de usarlo como criterio —
*un número esperado que envejece dispara falsas alarmas, que es exactamente lo que este doc corrigió
el 06/08, y le volvió a pasar en 30 horas*:

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Accept-Profile: app" \
  "$SUPABASE_URL/rest/v1/grabados?select=url,grabado_en&order=grabado_en"
```

✅ **Los pasos 1 a 6 los corrió Claude en localhost contra prod el 2026-08-21 21:55, y los 6 pasan.**
Lo que quedó de eso, además del verde:

- **El paso 4 tiene un paso más que este doc no mencionaba.** `Marcar como grabados` está gateado:
  hay que apretar **`Revisar`** primero (*"Revisá primero para ver qué va a pasar con cada link"*), y
  la revisión muestra el estado **link por link antes de tocar nada** — *"Está acá, sin grabar"*,
  *"✓ Ya lo grabaron"*, *"1 ya está marcado como grabado: no se vuelven a marcar"* — con el botón
  cambiando a `Marcar 2 como grabados`. Es **mejor** de lo que pedía el paso; el doc estaba viejo.
- 🩸 **El paso 6 pasó, y de paso destapó un cartel mal conjugado.** Decía *"1 de estos 1 no hace falta
  transcribirlos. 1 ya se grabaron."* Los cinco ítems de esa revisión concordaban siempre en plural.
  Arreglado el 21/08: ahora dice *"…no hace falta transcribirlo. 1 ya se grabó. Alguien del equipo lo
  marcó…"*. *Un cartel mal conjugado se lee como que la herramienta contó mal, justo en el momento en
  que le está pidiendo a alguien que le crea un número.*
- ⬜ **Sigue faltando el paso 7 con los ojos**: bajar los dos `.xlsx` y abrirlos en el Excel de Mani.

Los pasos:

1. Abrir Históricos. Los tres chips dan los números de arriba.
2. **Marcar un guion que diga *Del Feed*** — son 55 y hasta hoy **no tenían botón en ninguna
   pantalla**. Tiene que aparecer `✓ Grabado` **sin recargar**, y el contador de *Grabados* subir a **295**.
3. Apretar *Sacar la marca de grabado*. Se va, y el contador vuelve a **294**.
4. Abrir el cuadro **Cargar una lista de videos ya grabados**, pegar 3 links de los que ya están en
   el histórico (uno de ellos ya marcado). Antes de apretar tiene que decir *"3 videos detectados"*;
   después, *"2 marcados como grabados · 1 ya estaba"*.
5. Pegar un link de un video que la herramienta **nunca vio**. Aparece una tarjeta con borde
   punteado, cartel **Cargado a mano** y sin botón de ver guion. *Esa tarjeta es el pedido de Alejo
   funcionando: un video grabado por fuera del sistema, que ahora el sistema conoce.*
6. **La prueba que cierra el circuito entero, y es la que importa:** copiar el link de una fila
   recién marcada acá, ir a **Transcribir** y pegarlo. Tiene que decir **"1 ya se grabó"** y **no**
   *"1 ya lo vio el motor"*. Eso confirma que las dos pantallas escriben y leen el mismo lugar —
   que es toda la razón de ser de ADR-070.
7. Bajar los dos archivos. Desde ADR-071 son **`.xlsx` de verdad**, no CSV: doble clic y abren.
   **Descargar todo** trae **184** filas y **17 columnas** (la 17 es `GRABADO EN`, al final, con las 16
   de siempre en su posición exacta). **Descargar solo grabados** trae menos filas e incluye los
   cargados a mano, con las celdas de texto vacías.
   ✅ **Ya verificado por máquina** contra los 183 guiones que había entonces: abre con un lector
   real de Excel (`openpyxl`), 184×17, CRCs válidos, acentos y emoji intactos, y `VIEWS`/`HEAT SCORE` como número
   y no como texto. Lo que falta es **abrirlo en el Excel de Mani** — un `.xlsx` roto no se ve mal,
   directamente no abre, así que la prueba es binaria y de 5 segundos.

⚠️ **No gasta plata en ningún paso.** La carga masiva solo escribe la marca: no llama a Supadata ni
a Haiku, aunque peguen 300 links.

🟢 **Y esto sí lo movió un hábito, que es lo que ninguna prueba podía cerrar.** Este renglón decía
que *"el cockpit de Retia lleva 11 días sin un solo evento humano"*, y **el botón nuevo movió el
número solo**: Majo entró el 20/08 y cargó 288 links.

🟢 **La forma de la adopción se midió de nuevo el 2026-08-29, y este párrafo estaba viejo.** Decía
*"nadie volvió un segundo día"*. **Volvieron dos:** Majo Duarte **3 días** (20/08 · 21/08 · 26/08,
123 eventos) y Manuel 30X **2** (07/08 · 20/08). Sobre los **374** eventos de la tabla, con la suma
por persona dando 374 exacto.

🔴 **Lo que sigue siendo el problema es Jero: 81 eventos el 07/08 —el día más productivo de
cualquiera— y no volvió nunca.** Juan José igual: 23 ese mismo día, nunca más. *La pregunta ya no es
"¿entran?" ni "¿vuelven?" —alguien vuelve— sino **por qué vuelve una y no los otros**.* Se lee
contando **días distintos por persona** en `app.eventos`, no eventos.

## 4-quinquies. ✅ **La descarga de mp4 en Vercel: CERRADO por Mani el 2026-08-29**

**El streaming sobrevive a Vercel.** Mani bajó un mp4 desde la app desplegada y **el archivo abre y
reproduce completo** — que era el único caso que había que buscar a propósito, porque un stream
cortado se ve idéntico a un éxito desde la pantalla.

📏 **Medido, no solo mirado.** La confirmación a ojo se cruzó contra `app.eventos`:

| | |
|---|---|
| Deploy a producción (sha `40d6663`) | 29/08 **18:32:12Z** |
| `colecciones.bajar_videos` de la verificación | 29/08 **18:44:05Z** · `{pedidos: 1, encontrados: 1}` |
| Colección usada | `6450e22e…` — **distinta** a la de las pruebas de localhost |

Las dos cosas que hacen que esto pruebe lo que dice: el evento es **posterior al deploy**, y es sobre
**otra colección** que las corridas de `localhost`, o sea una acción nueva y no un replay.

🩸 **Y hubo un intento anterior que NO contaba, con la firma exacta de esta trampa.** El primer
“bajó bien, se ve completo” fue el archivo que ya estaba en disco desde la bajada de las 18:19 por
`localhost`. Se detectó porque **no había ningún evento posterior al deploy**, y la ausencia es
concluyente por diseño: ADR-078 compra la URL firmada **cada vez** y no la persiste, así que no hay
camino con link cacheado — sin evento no hubo compra, y sin compra no hubo descarga. *Un `.mp4` que
reproduce no dice de dónde vino: la pestaña tenía que decir `vercel.app`, no `localhost:3000`.*

⚠️ **Esta verificación corrió el canario de ADR-078 un número:** el primer dato de adopción pasa a
ser el **cuarto** `bajar_videos`, no el tercero. Corregido en el ADR.

<details><summary>El enunciado original, que sigue valiendo si esto hay que re-probar</summary>

> **Quién:** Mani · **Cuánto:** 3 minutos, después del primer deploy que incluya el cierre 117.

**Esto es lo único de esa entrega que localhost NO puede contestar, y puede fallar entero.**

✅ **Lo que YA está probado (Mani, 29/08): en `localhost` el archivo baja completo y reproduce.** O
sea que el proxy arma un `.mp4` válido y el nombre llega bien. **Eso NO cierra este item**: lo que
queda abierto no es si el código funciona, es si **Vercel** deja pasar 33 MB por una función. Un
`next dev` no prueba eso.

Las tres cosas del cierre 117 se verificaron en vivo **contra la base de producción**, pero
**corriendo el server en `localhost`**. La descarga de video pasa **33 MB por una función**
(`/api/video`), y ése es justo el tamaño donde Vercel se comporta distinto que `next dev`: el límite
de tamaño de respuesta de una Serverless Function aplica al body **materializado**. La route
devuelve `origen.body` en streaming justamente para no materializarlo, **y eso no está probado en
Vercel**.

**Qué hacer:**

1. Entrar a *Curar → Colecciones →* una colección con videos de Instagram.
2. *Seleccionar varios* → marcar **uno** → **Descargar videos**.
3. Mirar dos cosas:

| Lo que pasa | Qué significa |
|---|---|
| Baja un `.mp4` que **se abre y se ve**, y el aviso dice *"1 video bajado."* | ✅ El streaming sobrevive a Vercel. Cerrar este item (en localhost ya da esto: el cambio es el entorno, no el resultado esperado) |
| El aviso dice *"1 no se pudieron"* | 🔴 La función rechazó el tamaño. **No es el CDN**: mirá los logs de la función en Vercel antes de tocar código. El plan B ya está escrito en ADR-078 (copiar a Storage), y **es otro ADR**, no un parche |
| Baja un archivo de **0 bytes** o que no abre | 🔴 El body se cortó a mitad. Peor que el anterior porque **se ve como éxito**: el aviso va a decir *"1 video bajado"* igual |

🩸 **El tercer caso es el que hay que buscar a propósito.** El aviso cuenta descargas que
**arrancaron bien**, no archivos completos: un `res.ok` con el stream cortado después se ve idéntico
a un éxito desde la pantalla. **Abrí el archivo.** Un `.mp4` que no reproduce es la única señal.

**Y de paso, gratis:** que el nombre del archivo tenga el título del video. Si baja como `video.mp4`
teniendo título, el `Content-Disposition` no está llegando (el caption con emoji ya rompió esto una
vez, ver cierre 117).

</details>

---

## 5. ✅ **V4 — el re-rank: CERRADO por Mani el 2026-08-07**

*"Filtrar por aprobados en curar/feed sirve de maravilla."*

<details><summary>El enunciado original</summary>

**Quién:** Majo o Jero · **2 minutos.**

El enunciado del ROADMAP era *"la vista 🔥 Seleccionados"*, que era de Airtable y murió con él. Lo
pedido —punto 5 del norte— sigue igual y hoy lo sirve el Feed:

En `/curar/feed`, filtrar por **aprobados**: tienen que salir **solo aprobados**, ordenados
**caliente → frío** por `heat_score`.

</details>

## 6. ✅ **V2 — literalidad: CERRADA el 2026-08-07**

La mitad española estaba probada **por construcción** (ver abajo) y la de la traducción la cerró
Mani con el ojo: *"la traducción de los videos es perfecta"*.

<details><summary>El análisis completo, que sigue valiendo</summary>

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

</details>

## 7. ✅ **V5 — corrida incremental + dedup: CORRIDA Y VERDE el 2026-08-07**

**Corrida real, `on_demand`, 13.8 min, estado `ok`. Costó ~$0.24.**

Se bajó `Días de recencia` de **100 → 3** (no 1: con 1 el riesgo era que Apify trajera cero y la
prueba pasara **en falso**), se disparó el webhook y se restauró a 100 apenas cerró — verificado en
`app.ajustes` **y** por la fachada, que es lo que el motor lee el lunes.

| | |
|---|---|
| **Apify volvió a traer** | **69** videos (la ventana de 3 días cubre entera la corrida de ayer) |
| **Sobrevivieron al dedup** | **4** |
| **Se le pagó a Supadata** | **4 transcripciones**, no 69 |
| **`processed_items` nuevos** | 4, contra 48 de la corrida de ayer |
| **Intersección de `external_id` entre las 2 últimas** | **`0 ✓`, contada por `run_id`** |
| **Feed** | 171 candidatos · **0** con ⚠️ SIN GUION · 171/171 con `external_id` · **0** urls duplicadas |

🔑 **Por qué esto no es un ∅ vacío**, que era el único riesgo de la prueba: entraron **69 videos
reales**, casi todos ya procesados ayer. Si el dedup no funcionara, esos 69 volvían a pasar y se
re-pagaban. Pasaron 4. **El ∅ es de un dedup que filtra, no de una tabla vacía** — y el contador
`registro_dedup: ok` lo confirma en las dos corridas.

🩸 **Lo que NO se hizo, y por poco:** se evaluó bajar `Videos a transcribir por corrida` (250) como
tope de gasto. **Habría sido destructivo.** Ese presupuesto **quema** (ADR-044): corre *después* del
`POST processed_items`, así que lo que queda afuera ya está en la memoria de dedup, vuelve sin
transcript y el gate lo descarta `sin_guion` **para siempre**. Se dejó en 250. *La red de seguridad
de una prueba puede ser el daño.*

*(El gate de la `023` que bloqueaba esta prueba ya estaba firmado, así que el modo de falla mudo
—`PGRST204` tragado por `onError: continue`, motor en verde sin memoria— no aplicaba. El
`registro_dedup: ok` de esta corrida lo vuelve a descartar.)*

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

## 9. ✅ **D3 — CERRADA el 2026-08-29, y no por una demo**

**Quién iba a ser:** Mani + Majo + Jero · 10 minutos. **Nunca se agendó, y ya no hace falta.**

Calificar · ver el re-rank · bajar el histórico. **El sistema solo sirve si lo usan**, y éste era el
único item de la lista que medía eso. Es también la última condición del *"MVP declarado cuando"* del
ROADMAP §4: *el equipo de redes usa el sistema un día completo sin ayuda de un dev.*

### 📏 Por qué se cierra: la realidad contestó el criterio, medida en `app.eventos`

**Majo Duarte, el 2026-08-26, sola y en un solo día:**

| Qué | Cuánto |
|---|---|
| `candidatos.calificar` | **80** |
| Guiones limpiados (`app.guiones_limpios`) | **61** — 34 con voz, 27 sin voz |
| `referentes.crear` | 13 |
| `voces.editar` + `proyectos.editar` | 6 + 6 |
| Colecciones: agregar · limpiar · descargar · quitar | 5 · 5 · 3 · 2 |

Y es su **tercer día distinto** de uso: 20/08, 21/08 y 26/08.

🔑 **La razón por la que esto vale MÁS que la demo, y no menos:** una demo de 10 minutos con Mani al
lado habría probado que el sistema se puede usar **acompañado**. El criterio del ROADMAP §4 pide otra
cosa —*sin ayuda de un dev*— y eso es exactamente lo que dice el registro. *Cuando una verificación
pide provocar algo que ya ocurrió solo, el enunciado envejeció: se cierra con la evidencia, no se
descarta.*

⚠️ **Lo que este cierre NO cubre:** Jero. Los 40 eventos son de Majo. Jero tiene **un solo día** de
uso (07/08, 81 eventos) y no volvió. Eso no es un hueco de verificación —el criterio dice *"el
equipo"* y quedó cumplido— pero **sí es la pregunta viva del producto**, y se lee del mismo lugar:
días distintos por persona en `app.eventos`, no `count(*)`.

## 10. 🔬 **La prueba de §14.6 — RLS de LinkedIn con filas** *(la mitad de query ya está cerrada)*

**Quién:** quien tenga la cuenta con membresía en **30X y EstadoX** (`alejandro.davila@30x.com`).
**Cuánto:** 3 minutos + el paso 0.

🚮 **Las dos filas YA NO están: se borraron el 2026-08-08 a pedido de Mani**, y con ellas
`app.referentes_linkedin` quedó **vacía**. La prueba no se canceló, pero **ahora empieza por
re-sembrarlas** (paso 0). Se borraron porque la prueba es la que el handoff da por descartable —las
4 tablas de LinkedIn están vacías y su workflow no existe, ADR-055— así que el fixture no valía
tenerlo ocupando prod indefinidamente.

✅ **Lo que ya NO hay que hacer, porque se midió el 06/08 con sesiones reales contra prod** (la tabla
completa en [plan-multi-tenant §14.6](./agents/plan-multi-tenant.md)): la query de las dos capas
compuestas devuelve **1 y 1**, y **2** sin el filtro de cockpit — o sea que el 1 no es *"hay una sola
fila"*. Una cuenta de Retia ve **0** de esas mismas 2 filas, y el `insert` cruzado muere con `42501`.

⬜ **Lo que falta es exactamente esto, y nada más:**

0. **Re-sembrar el fixture** (borrado el 08/08). Son las dos filas exactas que estaban, con sus
   `instance_id` de la tabla de [plan-multi-tenant §14.6](./agents/plan-multi-tenant.md):

   ```sql
   insert into app.referentes_linkedin (instance_id, fuente, consulta, idioma, activo, notas) values
     ('f35d0282-2511-4905-b407-2ab338bc2336', 'pinterest', 'prueba rls 30x',     'en', false, 'sembrado para §14.6 — borrable'),
     ('f7baff77-8211-43f7-a64c-aed9e7a3e860', 'pinterest', 'prueba rls estadox', 'en', false, 'sembrado para §14.6 — borrable');
   ```

1. En **incógnito** (si no, el magic link cae sobre otra sesión), abrí
   `/30x/linkedin/curar/referentes` → tiene que verse **`prueba rls 30x`, y sola**.
2. `/estadox/linkedin/curar/referentes` → **`prueba rls estadox`, y sola**.
3. **Agregá uno desde el botón.** Es lo único que ejercita los `grant insert` de la `024` *por el
   camino de la app*; la lectura no los toca.

**Si ves 2 en cada pantalla**, la Capa 1 se rompió entre la query y el render (la query ya se probó y
da 1). **Si ves 0**, mirá la consola: la query anda, así que el problema está en la pantalla.

🚮 **Limpieza, cuando termines** (si re-sembraste): `delete from app.referentes_linkedin where consulta like 'prueba rls%';`

⚠️ **No sirve con una cuenta `es_dueno`**: `app.clientes_visibles()` le devuelve todas las empresas,
así que su resultado es indistinguible del de RLS apagado. Por diseño.

---

## 11. ✅ **Un alta real por la pantalla de equipo — CERRADA el 2026-08-07. B4 completa.**

Mani dio de alta a una persona nueva y **el mail llegó**, que era lo único que ningún agente podía
confirmar. Medido por su efecto: `app.usuarios` pasó de **8 a 9**.

<details><summary>El enunciado original</summary>

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

</details>

## 12. ✅ **Que los nulos NO suban al ordenar ascendente — CERRADA el 2026-08-26** *(ADR-076)*

**Quién:** Mani o cualquiera con acceso a un cockpit. **Cuánto tarda:** 3 minutos.
**De dónde sale:** Tarea 4 de [plan-orden-y-filtro](./agents/plan-orden-y-filtro.md).

### Por qué un agente no puede cerrarla

El invariante *"los nulos van al final en ASC y en DESC"* **sí** tiene test unitario
(`domain/orden.test.ts`, el caso 🔴). Lo que no se puede probar sin ojos es que **la pantalla real
lo respete con datos reales**, y ahí está el problema: medido contra prod el 26/08, la única
colección que existe (*"Test"*, 57 videos) tiene **57 de 57** con likes, vistas, seguidores, heat
**y título** — remedido el 26/08 mirando la pantalla, después de que un primer cruce dijera *0 de 57
con título* por leer sólo `app.videos_meta` en vez de las tres fuentes que `fusionar()` cruza.
**No hay un solo nulo que mirar en ninguno de los cinco ejes.** Un "se ve bien" sobre esa colección no distingue *el invariante
anda* de *no había caso que lo ejercitara* — que es exactamente la trampa del §0 de este doc.

En Históricos sí hay nulos de sobra (**129 de 377** filas sin métricas, las de
`transcripcion_a_pedido`), pero esa pantalla llega en la Tarea 6.

### Los pasos

1. Entrá a una colección y pegá un link de un video que el sistema **no conozca** (uno que no esté
   en el Feed ni en el histórico).
2. 🛑 **NO aprietes *Identificar*.** Ese botón es el que le compra la metadata a Apify; el punto de
   esta prueba es tener un video sin likes.
3. Ordená por **Likes**, flecha en **↓**. El video nuevo tiene que quedar **último**.
4. Dale a la flecha para pasar a **↑**. El video nuevo **tiene que seguir último**.
5. 🚮 Después: sacá el video de la colección.

### ✅ Cómo se cerró (2026-08-26)

No se usó la colección de Majo: se creó una aparte (`zz-prueba-orden-nulos`) con **3 videos reales
que ya tenían métricas + 1 link sintético** (`/p/CLAUDETEST01/`, un shortcode válido de un video que
no existe). Sintético a propósito: el caso que hace falta es *"un video del que no se sabe nada"*, y
así no se toca contenido de nadie ni se arriesga pagar un scrape.

**El resultado, sin apretar *Identificar*:**

| | orden de la grilla |
|---|---|
| **Likes ↓** | 206.638 → 57.965 → 43.454 → **el sintético** |
| **Likes ↑** | 43.454 → 57.965 → 206.638 → **el sintético** |

Los tres reales se dan vuelta; **el que no tiene métricas no se mueve del último lugar en ninguna de
las dos direcciones.** Su tarjeta además dice *"sin miniatura · sin título · sin referente"*, que es
ADR-072 degradando sin mentir.

🚮 La colección se borró después: los 4 miembros se fueron por el `on delete cascade`, quedó sólo
*"Test"*, y **`app.videos_meta` siguió en 5 filas** — nunca se compró nada.

⚠️ **Residuo honesto:** quedaron 3 filas en `app.eventos` (`colecciones.crear`, `colecciones.agregar`,
`colecciones.borrar`) con el `usuario_id` del dev. Son verificación, no adopción — mismo cuidado que
los canarios de `CLAUDE.md`.

### Qué significa si falla

| Lo que ves en el paso 4 | Qué significa |
|---|---|
| El video sin likes **último** | ✅ El invariante corre en la pantalla |
| El video sin likes **primero** | 🩸 Alguien "arregló" el signo en `ordenar()` y movió los chequeos de `null` adentro de la comparación. En Históricos eso pone **129 incógnitas arriba de todo** |
| El video no aparece | Otra cosa: revisá si hay un chip de faceta prendido (un video sin idioma queda afuera si el filtro está activo — es el comportamiento esperado, ver ADR-076 §4) |

---

## 13. ⬜ **Renombrar una colección y el aviso «sin trabajo», EN PRODUCCIÓN** *(nuevo del 29/08, cierre 119)*

**Quién:** Mani (o cualquiera del equipo) · **2 minutos** · *Está desplegado y sin tocar por nadie.*

### Por qué un agente no puede cerrarla

Las dos se verificaron **desde `localhost` contra la base de prod**, que es exactamente la
distinción que este repo ya se cobró dos veces: en el cierre 117 con el mp4 (*"un `.mp4` que
reproduce no dice de dónde vino"*) y en el 118 con el §4-quinquies, que se dio por cerrado una vez
de más. El código está en `8507cd3` y Vercel dice `success`, **pero nadie apretó el botón en el
dominio real.**

### Los pasos

1. Abrir **`Curar → Colecciones`** en producción. Tocar **Renombrar** en cualquier tarjeta.
2. Escribir el nombre de **otra colección que ya exista** → *Guardar*. **Tiene que rebotar** con
   *«Ya tenés una colección que se llama "X"»*, mostrado **adentro de la tarjeta** y no al pie de la
   página.
3. Corregirlo a un nombre nuevo → *Guardar*. El campo se cierra, la tarjeta muestra el nombre nuevo
   y **la cuenta de videos no cambia**.
4. Entrar a esa colección: el título de adentro **también** tiene que decir el nombre nuevo (son dos
   `revalidatePath`, y el de adentro es el que se olvida).
5. Abrir **`Curar → Referentes`**. Arriba tiene que estar el aviso *«hay 13 de 28 cuentas prendidas
   que no están haciendo nada»* y el badge naranja **sin trabajo** en `@jefferson_fisher`,
   `@markmanson` y `@susieinthiran`.

### Qué significa si falla

| Lo que ves | Qué significa |
|---|---|
| El nombre nuevo en la grilla pero **el viejo adentro** de la colección | 🩸 Falta el `revalidatePath` del detalle. El `.docx` que se baja va a llevar el nombre viejo |
| *«No se pudo cambiar el nombre»* genérico | 🔴 No es el choque de nombre (ése tiene su mensaje). Mirá los logs de la función: el `NO_ESTA` sale cuando el update toca 0 filas, y eso en prod significaría que el filtro de tenant no encontró la fila |
| El aviso dice **otro número** que 13 de 28 | 🟡 Normal si alguien prendió o apagó una voz desde el 29/08 — el número sale de la config viva. Se re-mide con la query, no se asume. **Si dice 0 de 28**, sospechá: el alcance llegó vacío y estaría marcando todo como que trabaja |
| No aparece ningún badge y tampoco el aviso | 🩸 `proyectosEnAlcance` llegó vacío o completo por error. La card *«Qué va a correr»* de Operar tiene que decir lo mismo: si las dos discrepan, una de las dos miente (que es justo lo que ADR-079 §3 quiso hacer imposible) |

---

## 14. ✅ **Limpiar un guion sin elegir voz — CERRADA el 2026-08-29, en pantalla**

**Verificada por Claude con Mani logueado**, contra la base de **producción**, los 5 pasos. Se deja
escrita porque el paso 4 es el que hay que repetir si alguien toca la derivación.

### 🔬 La prueba que la cierra: un video de OTRA voz en una colección de una sola

Los 5 pasos pasaron, pero cuatro de ellos sólo miran texto. El que prueba el mecanismo fue el
cuarto, montado a propósito para reproducir el modo de falla #2 de ADR-080:

> Se agregó a la colección *Test* —**57 videos, los 57 de Juan Pablo Vieira**— un video de
> `@susieinthiran` que pertenece a un proyecto de **Rosario Gomez**. Se apretó *Limpiar 1*.
> **`guiones_limpios.voz_id` quedó en Rosario Gomez**, no en Juan Pablo y no en `null`.
> El evento lo confirma por otro lado: `colecciones.limpiar` con **`sin_voz: 0`**.
>
> 🔑 **Con el código anterior ese guion se habría limpiado con lo que dijera el selector.** Es
> exactamente el error que la ADR existe para evitar, y acá está medido en vez de argumentado.

**Segunda señal, independiente:** la huella guardada es `97ff9195`, idéntica a
`huellaDeCriterios(null)` calculado aparte — correcto, porque Rosario **no tiene perfil cargado**,
así que su prompt *es* el BASE. La voz quedó registrada igual: `voz_id` dice de quién es el video,
la huella dice con qué criterios salió, y **son dos cosas distintas**.

🧹 **Prod quedó como estaba:** el video se sacó de la colección (57 miembros) y su guion limpio se
borró (65, los mismos de antes). *Una verificación que deja su propia fila contamina el canario —
la lección de las 5 filas de `videos_meta`.*

### Lo que se vio, paso por paso

| Paso | Resultado |
|---|---|
| El selector de voz ya no está | ✅ y el texto explica que cada video usa la suya |
| «Ver los criterios de la casa» | ✅ despliega el prompt entero (3.492 caracteres), solo lectura |
| Un guion **con** voz | ✅ *"Limpiado con los criterios de la casa **+ cómo habla Juan Pablo Vieira**"* |
| Un guion **sin** voz (26 de 57) | ✅ *"Limpiado **solo con los criterios de la casa**: este video no tiene voz asociada…"* |
| El aviso de perfiles faltantes | ✅ *"2 de 3 voces no tienen cargado cómo habla (Milena Morales, Rosario Gomez)"* |

⚠️ **Y un dato operativo que costó tiempo:** correr `npm run build` con el dev server levantado
**mata el dev server** (le pisa `.next`) y la pantalla queda en blanco con el HMR reintentando.
No es un bug de la app. Se levanta de nuevo con el preview y listo.

### Los pasos (para repetirla si alguien toca la derivación)

1. Abrir una colección. **El selector de voz ya no está**, y arriba del botón tiene que decir que
   cada video se limpia con los criterios de la casa **más la voz de ese video**.
2. Abrir **«Ver los criterios de la casa»**: se despliega el prompt entero, solo lectura.
3. Abrir un video que **ya tenga** guion limpio → pestaña **Limpio**. Arriba del texto tiene que
   decir con qué salió: *"criterios de la casa + cómo habla Juan Pablo Vieira"* o *"solo con los
   criterios de la casa"*.
   📏 En la colección *Test*, al 29/08: **31 con voz y 26 sin voz**, sobre 57.
4. Agregar un video nuevo (de cualquier proyecto) y apretar **Limpiar los guiones**. Tiene que
   limpiarlo sin preguntar nada.
5. Comprobar en la base que se guardó la voz **del video**, no una elegida:
   `select voz_id from app.guiones_limpios order by actualizado_en desc limit 1`.

### Qué significa si falla

| Lo que ves | Qué significa |
|---|---|
| Todos los guiones dicen *"solo con los criterios de la casa"* | 🩸 La derivación llegó vacía. Se mide contra `app.candidatos.voz_id`: al 29/08 resolvían **57 de 57** |
| Un guion dice una voz que **no es** la del video | 🔴 Lo peor de todo, porque el guion se lee bien igual. La voz sale de `leerLoQueSeSabe`, la misma fusión que pinta la grilla: si la tarjeta y el guion discrepan, la fusión está mal |
| El botón limpia pero el guion sale idéntico al crudo | 🟡 No es de este cambio: `limpiar()` es fail-**closed** y devuelve `null` si Haiku falla, así que un limpio idéntico al crudo no debería poder existir |
| «Ver los criterios» abre vacío | El import de `BASE` no llegó al cliente. Es un módulo puro, no debería pasar |

⚠️ **Lo que este cambio NO hace:** re-limpiar los 65 guiones que ya existen. **26 de ellos salieron
neutros** cuando su voz sí tenía perfil. Re-limpiar cuesta plata y la decisión es de una persona
(ADR-074). Lo que cambió es que **ahora se ve cuáles son**.

---

## Registro — lo que ya se cerró, para no repetirlo

| # | Qué | Cuándo |
|---|---|---|
| **Recorrer el feed entero** | Sin paginar: las 170 de una, chips con el total real, y la tarjeta abre con guion | ✅ 2026-08-07, Mani |
| Recorrer las 4 zonas con una cuenta **dueña** | Las 4 cargan con datos, `Entender` incluida — que era el riesgo concentrado del flip | ✅ 2026-08-05 |
| Cuenta **no dueña**: 3 de 4 voces sin filtro de tenant | La mitad que prueba que RLS filtra de verdad | ✅ 2026-08-05 |
| Que una cuenta `operador` entre y vea nombre + rol | El hecho-cuando de D0 | ✅ 2026-08-04, después de la `019` |
