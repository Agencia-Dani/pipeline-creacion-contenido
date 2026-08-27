# Manual del equipo de redes — cómo usar el sistema de reels

> Guía para Majo y Jero. Pensada para operar el sistema **sin saber nada de cómo está hecho por
> dentro**. Está armada para que casi cualquier duda se resuelva acá. Si algo igual no se entiende o
> falta, anotalo al final (sección "Lo que necesitamos") y lo resolvemos.
>
> *Actualizado: 2026-08-26 — se agregó **ordenar y filtrar** en las pantallas de video (§4.2) y
> **Colecciones** entró a la tabla de pantallas (§4.1). ⚠️ Colecciones y la limpieza de guiones
> todavía no tienen su sección propia acá: está anotado en §9.*
>
> *Actualizado: 2026-08-05 — Airtable y el Google Sheet salieron del sistema; todo vive en el
> cockpit. Refleja el sistema ya estabilizado: el motor busca **solo por
> referentes** (cuentas de Instagram y TikTok) — las keywords/hashtags se retiraron porque no
> traían calidad —, el **buscador de cuentas nuevas** les propone referentes (§8.1), y hay
> **páginas de métricas** que muestran cómo viene funcionando (§6.2), con la columna
> **`diagnostico`** que les dice en una frase qué criterio conviene ajustar (§6.2).*
>
> *Cómo se pide contenido hoy:* además del lunes automático, **se puede correr a demanda** (§3.1);
> cada Proyecto tiene su propia **`N`** (cuántos videos quieren de ese tema, §5.2); y las **Voces
> tienen interruptor**: apagar una voz pausa todos sus proyectos de una (§5.1).
>
> *Cada campo trae su ayuda incorporada:* al lado del nombre de cada campo hay un ícono **ⓘ** con la
> explicación de qué es y quién lo llena (§4.1). Si dudan de un campo, el ⓘ responde más rápido que este manual.

---

## 0. Lo que SÍ y lo que NO (léanlo primero, es el resumen de todo)

> 🆕 **La pantalla cambió el 2026-08-01, y en todas las pantallas manda la misma regla:
> la lista muestra un resumen, y para ver el detalle o editar algo se toca la fila y se abre.**
> Para crear (una voz, un proyecto, una cuenta) hay un **botón arriba** de la página. Lo único que
> se cambia sin abrir nada es el interruptor de prendido/apagado, que guarda solo al tocarlo.

> 🆕 **Desde el 2026-08-02 se puede BORRAR** una voz, un proyecto o una cuenta de referente. El botón
> está **adentro del record** (se toca la fila, se abre, y está abajo a la izquierda), y pregunta
> antes. **Apagar y borrar no son lo mismo, y casi siempre lo que quieren es apagar** — ver §5.6.

**Lo que SÍ hacen ustedes:**
- ✅ Entrar al **cockpit** todos los días (o cada 2-3 días) y **calificar** los videos que llegaron,
  en `Curar → Feed`. En el feed pueden **plegar un proyecto entero** tocando su título, para
  trabajar de a un tema por vez. Y al abrir un video hay un botón **«Copiar guion»**.
- ✅ Armar la corrida a su medida: elegir **Voz → Proyectos → cuántos videos pide cada uno** y
  **pedir una corrida a demanda** cuando la necesiten (§3.1) — ya no dependen del lunes.
- ✅ Poner en cada candidato **una** cosa: la **calificación** (🔥/👍/👎). El estado se deduce solo — 👎 es
  descartado, 🔥 y 👍 son aprobado.
- ✅ Calificar **también lo que descartan** (👎): así la máquina aprende y mejora.
- ✅ Mantener sana la lista de **Referentes** (agregar cuentas buenas de Instagram **y TikTok**, y
  **sacar** las que no sirven), en el cockpit, `Curar → Referentes`. Esa lista es de dónde sale
  **todo** el contenido: cuentas buenas = candidatos buenos.
- ✅ Revisar **una vez por semana** `Curar → Sugeridos`: la máquina les sugiere cuentas nuevas;
  ustedes aprueban o descartan, y las aprobadas entran al banco solas (§8.1).
- ✅ Escribir buenos `criterios_relevancia` en cada Proyecto (es lo que decide la calidad de lo que llega).

**Lo que NO hacen (nunca):**
- ❌ **No** cargan videos al Feed a mano — eso lo llena sola la máquina (para un link suelto está
  *Transcribir*, §8.2).
- ❌ **No** entran a n8n, Supabase, ni nada que suene "técnico". Eso es sala de máquinas, no es su trabajo.
- ❌ **No** dejan un Proyecto activo **sin fuentes**. Un proyecto activo sin ningún Referente **no trae
  nada**: es un proyecto muerto (ver §5.2). Todo proyecto activo necesita al menos una cuenta en
  Referentes.
- ❌ **No** escriben la arroba doble (`@@cuenta`). Va **una sola**: `@cuenta`. (La máquina lo corrige si
  se equivocan, pero mejor bien de entrada.)
- ❌ **No** asignan una Voz que no tenga que ver con el tema del Proyecto (ver §5.1 / §5.2).
- ❌ **No** tocan las "perillas" avanzadas (pesos, bonus) sin avisarnos la primera vez (§5.5).

Si tienen 30 segundos y solo leen esto, ya pueden trabajar. El resto del manual es el detalle.

---

## 1. Qué es esto y para qué sirve

Hay una máquina que trabaja para ustedes. Cada semana sale a Instagram y TikTok, encuentra videos de
referentes sobre los temas que les interesan, los **transcribe y traduce al español**, los
ordena de **más prometedor a menos**, y se los deja servidos en una lista.

El trabajo de ustedes no es buscar ni escribir. Es **decidir**: entrar a la lista, leer, y marcar cuáles
sirven. La máquina **aprende** de lo que eligen y va mejorando lo que les trae.

En una frase: **la máquina encuentra y ordena; ustedes eligen y adaptan.**

### 1.1 Las cuatro máquinas (qué corre solo y cuándo)

Por detrás no hay una sola máquina. Tres robots corren solos en el momento justo — **no tienen que
hacer nada para que arranquen**, es plomería — y el cuarto arranca cuando ustedes se lo piden. Sirve
saber que existen para entender de dónde sale cada cosa que ven:

| Robot | Cuándo corre | Qué hace | Qué ven ustedes después |
|---|---|---|---|
| **El motor** | Lunes 8:00 am **y a demanda** (§3.1) | Sale a Instagram y TikTok, baja videos de sus Referentes, los transcribe, traduce al español y ordena. | Videos nuevos en **Curar → Feed** + los dudosos en **Curar → Descartes**. |
| **El buscador de cuentas** | Lunes 9:00 am | Mira sus mejores Referentes y busca cuentas **parecidas** para sumar. | Sugerencias en el cockpit, **Curar → Sugeridos**. |
| **El archivador** | Domingo 6:00 pm | Se lleva a Históricos todo lo que ya calificaron, limpia la lista y cuenta el desempeño de la semana. | La lista queda limpia + se actualizan los números de **Entender**. |
| **El transcriptor** | Cuando ustedes le pegan links (§8.2) | Le saca el script en español a videos que traen ustedes, no la máquina. | Los scripts en la zona **Transcribir**, y esos videos dejan de aparecer en el Feed. |

Regla mental de la semana: **el lunes llega trabajo, durante la semana ustedes califican, el domingo
se archiva y se mide.** Todo lo demás es automático.

---

## 2. La única herramienta que tocan

**El cockpit**, y nada más: `pipeline-creacion-contenido.vercel.app`. Se entra con un **magic link**
al mail (no hay contraseña que recordar).

| Zona del cockpit | Para qué | Qué hacen ahí |
|---|---|---|
| **Curar → Feed** | El tablero de trabajo | Leen los videos y los califican. Es donde viven el 95% del tiempo. |
| **Curar → Históricos** | Sus guiones de todas las semanas, y **cuáles ya grabaron** | Marcan lo grabado, filtran por `Sin grabar / Grabados`, cargan una lista de links ya grabados, y bajan el Excel `.xlsx` (dos botones: todo, o solo lo grabado). |
| **Operar** | Disparar una corrida | El botón **▶ Correr ahora** y el estado de lo que está corriendo. |

> ☠️ **Airtable ya no existe en este sistema, y el Google Sheet "Histórico" tampoco.** Si alguien les
> pasa un link a cualquiera de los dos, está viejo. Todo —el feed, los proyectos, las voces, los
> referentes, las perillas y el archivo— vive en el cockpit.

Todo lo demás (los robots, las bases de datos por detrás) es **sala de máquinas**. No necesitan entrar
nunca. Si alguien menciona "n8n", "Supabase" o "el cron", es plomería interna, no es asunto del equipo
de redes.

---

## 3. La rutina (lo que hacen durante la semana)

1. La máquina corre sola (una vez por semana) y deja videos nuevos en el Feed.
2. Entran al cockpit, a `Curar → Feed`.
3. Cada tarjeta es un video ya transcrito y traducido al español, con su métrica y su link al original.
4. Leen el texto (o miran el video original y la portada), y **deciden**.
5. Califican (ver §6).
6. Lo que aprueban queda guardado en Históricos **automáticamente** y sale de la lista. Lo que no
   tocaron sigue esperando.
7. Una vez por semana (2 min): pasan por `Curar → Descartes` y marcan el `veredicto` (§6.1), y
   revisan los sugeridos en `Curar → Sugeridos` (§8.1).

Regla mental: **el Feed es su bandeja de entrada.** La máquina la llena, ustedes la vacían decidiendo.
Lo que califican desaparece de pendientes y queda archivado.

> **¿Cuándo se limpia la lista?** Un proceso automático corre **los domingos a las 18:00** y se lleva a
> Históricos todo lo que ustedes **ya calificaron** durante la semana (aprobado o descartado), y lo saca
> del Feed. Los que dejaron sin calificar **no se borran**: siguen esperando. Por eso conviene calificar
> **antes del domingo** — así el archivo queda ordenado y la lista no se amontona.

### 3.1 Corridas a demanda (nuevo)

Ya no hay que esperar al lunes. Dentro de una **Voz** prendida, prenden los **Proyectos** que
quieren, le ponen a cada uno **cuántos videos pide** (§5.2), y aprietan **▶ Correr ahora** en
`Operar`. En unos ~40-60 minutos los videos aparecen en el Feed.

En esa misma pantalla, arriba del botón, está **qué va a correr** — una línea por proyecto:

> `Comunicación de parejas — pide 15 · 3 cuentas · la última corrida entregó 1`

**Los tres números son reales, no promesas.** Vale la pena entender qué dice cada uno:
- **pide 15** — lo que ustedes le pidieron a ese proyecto. Es un **techo**: nunca va a traer más.
- **3 cuentas** — cuántos referentes lo alimentan. Es la palanca: de acá sale todo lo que puede
  traer.
- **la última corrida entregó 1** — lo que pasó de verdad la vez anterior.

Si el tercero es más chico que el primero, la pantalla les dice **por qué** y **qué hacer** (casi
siempre: sumar cuentas en `Curar → Referentes`). No es una falla: un proyecto con 3 cuentas no puede
entregar 15 videos nuevos por semana aunque los pidan, porque el sistema **nunca repite un video que
ya les mostró**. Más cuentas = más para elegir.

Y en la misma página está **Buscar cuentas nuevas**, que es la otra máquina (§8.1).

Dos reglas que evitan sorpresas:
- **Una corrida a la vez.** Si piden una mientras otra está corriendo, la segunda no arranca (no es
  un error: es a propósito, para no pagar doble). El botón se deshabilita solo.
- **Antes de apretar, dejen la selección lista:** Voz prendida, Proyectos que quieren en `activo`,
  su número puesto, y los Referentes de esos proyectos activos. La corrida procesa **todos** los
  proyectos activos.

---

## 4. El cockpit por dentro: las pantallas

Piénsenlas en tres grupos.

### Las que arman una vez (la configuración de la búsqueda)

- **Proyectos** — cada tema que se busca (ej: "Comunicación", "Ventas", "Storytelling"). Define el tema,
  los criterios de relevancia y la voz.
- **Voces** — para quién se selecciona (un personaje o marca). Organiza y afina el filtro.
- **Referentes** — las **cuentas** (de Instagram **y** TikTok) que se siguen. **De ahí sale todo:**
  la máquina solo trae videos de estas cuentas.
- **Las perillas** (cuánto trae por corrida, días, qué ejes se prenden) — en `Curar → Ajustes`.
  Vienen con valores razonables; casi no se tocan. Más en §5.5.

> Estas las arman una vez y las van ajustando. **No hace falta tocarlas para el trabajo del día.**

### Las que usan para trabajar

- **Curar → Feed** — los videos que llegaron, esperando que ustedes los califiquen. Acá viven (todos
  los días).
- **Curar → Sugeridos** — las cuentas nuevas que la máquina propone para sumar al banco. **Una vez por
  semana** (§8.1).
- **Curar → Descartes** — los ~10 videos más dudosos que la máquina descartó, para que auditen si se
  equivocó. También **una vez por semana**, 2 minutos (§6.1).

### Las que solo miran

- **Entender** — el desempeño de cada semana: calidad por proyecto, salud del sistema y costos
  (§6.2). Los números se calculan solos a partir de lo que ustedes califican; **nadie escribe ahí**.

### 4.1 El menú que ven

A la izquierda hay cuatro zonas. Esto es todo lo que hay y qué se toca en cada una:

| Zona | Para qué | Qué editan ahí |
|---|---|---|
| **Operar** | Disparar una corrida y ver la que está en curso | el botón **▶ Correr ahora** |
| **Curar → Feed** | Su bandeja diaria de videos a calificar | la **calificación** y las **notas del equipo** |
| **Curar → Descartes** | Los ~10 descartes dudosos de la semana (§6.1) | el **veredicto** |
| **Curar → Voces y proyectos** | Para quién se selecciona y qué se busca (§5.1, §5.2) | todo: nombre, criterios, cuántos videos pide, prendido/apagado |
| **Curar → Referentes** · **Sugeridos** | El banco de cuentas y la bandeja de propuestas (§5.3, §8.1) | agregar, apagar, aprobar/descartar |
| **Curar → Ajustes** | Las perillas (§5.5) | los valores |
| **Curar → Históricos** | El archivo de sus guiones + qué ya grabaron | la **marca de grabado** y la carga de links ya grabados (+ los 2 botones de descarga) |
| **Curar → Colecciones** | Apartar los videos que van a trabajar juntos, vengan de donde vengan | crear la colección, meterle videos pegando links, bajarla en Word o Excel, borrarla |
| **Entender** | Precisión, salud y costos (§6.2) | **nada — solo lectura** |
| **Transcribir** | Pegar un link suelto y recibir su texto | el link |

> **Calificar es un solo acto.** No hay que poner un emoji *y* además un estado: eligen 🔥 / 👍 / 👎 y
> el sistema deduce el resto. Antes eran dos campos y el que se olvidaba era siempre el emoji.

En cada tarjeta la máquina ya les dejó lleno: el **título**, el **script** (la transcripción en español),
el **idioma original**, la **portada**, el **link al video original**, las **métricas** (views, likes,
seguidores, engagement) y el **heat score** (§7). **Lo único que llenan ustedes:** la **calificación**
y, si quieren, **notas del equipo**.

> ⚠️ **Hay dos campos del proyecto que cambian solos** — *criterios aprendidos* y una advertencia
> sobre los criterios. Eso **no** es alguien editando: lo escribe la máquina cada domingo. Se leen en
> **Criterios** de cada proyecto y ustedes no tienen que tocarlos.

### 4.2 Ordenar y filtrar lo que están viendo *(nuevo, 26/08)*

En **Feed**, **Descartes**, **Históricos** y adentro de una **Colección** hay arriba un
**«Ordenar por»** con una flechita al lado.

- El **orden que trae la pantalla al abrirla es el bueno** y por eso es la primera opción, que dice
  *«Lo que muestra la pantalla»*. En el Feed eso es de más caliente a más frío; en Históricos, lo
  último que pasó; en Descartes, los que más cerca estuvieron de pasar. **Si se pierden, vuelvan a
  esa opción y queda como estaba.**
- La **flecha ↓↑** da vuelta el orden. De más a menos, o de menos a más.
- **Lo que no tiene el dato queda siempre último**, ordenen para donde ordenen. Un video sin likes
  no es un video con cero likes: es uno del que no sabemos, y esos van al fondo en vez de ensuciar
  la punta de la lista.

Cada pantalla ofrece solo lo que puede: en una Colección pueden ordenar por **likes, vistas,
seguidores, heat y título**; en Descartes solo por **relevancia, fecha y título**, porque de esos
videos la máquina nunca llegó a guardar las métricas.

**Y a veces aparecen unos chips de filtro** (por idioma, por origen). **Que no aparezcan no es que
estén rotos:** un filtro solo se dibuja si hay al menos dos valores distintos para elegir. Si en una
colección todos los videos son en inglés y todos de Instagram, no hay nada que filtrar y por eso no
se muestra nada.

> 🔎 Filtrar **no** hace desaparecer nada de la base: esconde de la vista. El contador de arriba
> sigue diciendo cuántos hay en total, y cuando el filtro deja pasar menos, el pie del Feed avisa
> *«2 de 146 tarjetas»* para que no parezca que se perdieron.

---

## 5. Configuración inicial: cómo llenar cada tabla la primera vez

Esto se hace **una sola vez** al arrancar (y cada vez que quieran sumar un tema o una cuenta nueva).
**Candidatos no se toca acá** — esa la llena la máquina. Las que arman ustedes son las otras.

**Orden recomendado:** Voces → Proyectos → Referentes. (Hay que crear la Voz y el Proyecto
antes, porque Referentes se "enganchan" a ellos.)

> 📍 **Voces y Proyectos se cargan en `Curar → Voces y proyectos`.** Es una sola pantalla: cada voz
> con sus proyectos adentro, y abajo de todo los formularios para agregar un proyecto o una voz nueva.
>
> **Dos cosas que la pantalla hace por ustedes:**
> - **Avisa cuando algo no va a correr.** Un proyecto prendido cuya voz está apagada aparece con el
>   cartel *"no corre: su voz está apagada"*; una voz prendida sin ningún proyecto activo se avisa
>   arriba de todo.
> - **No deja crear un proyecto sin criterios de relevancia**, porque un proyecto sin criterios
>   aprueba casi cualquier cosa.

### 5.1 `Voces` — para quién se selecciona

Una Voz = un personaje o marca para la que curan contenido (ej: "Cora", "30X institucional").

| Columna | Qué escriben |
|---|---|
| `nombre` | el nombre de la voz. Ej: "Cora" |
| `descripcion` | quién es / de qué tiene autoridad |
| `criterios_relevancia` | **obligatorio.** Qué le sirve a este cliente puntual. El filtro los **suma** a los criterios de cada proyecto de esta voz, así que sin ellos juzga con la mitad del contexto y deja pasar de más. Ya no se puede crear ni guardar una voz sin esto |
| `activo` | ✅ para que la voz corra. **Es el interruptor maestro:** destildarlo pausa **todos** los proyectos de esa voz de una (aunque los proyectos sigan en `activo`). Ideal para pausar un cliente entero sin tocar proyecto por proyecto |

> **La voz apagada sigue recibiendo propuestas de cuentas.** El buscador de cuentas nuevas (§8.1) le
> sigue proponiendo referentes aunque la voz esté apagada — es a propósito: cuando la prendan, ya
> tiene la despensa llena. Apagar una voz solo frena los **videos**, no las propuestas.

> **Cuidado con la coherencia Voz ↔ Proyecto.** La Voz tiene que tener sentido con el tema del Proyecto al
> que la asignan. Ejemplo real que salió mal: una voz de *bienestar y maternidad* asignada a un proyecto de
> *Storytelling*. No pegan → el filtro se confunde y llega contenido raro. **Regla: la Voz y el Proyecto
> tienen que hablar del mismo mundo.**

### 5.2 `Proyectos` — el tema que se busca

Un Proyecto = un tema aislado (ej: "Comunicación", "Ventas"). Los resultados de un proyecto no se mezclan
con los de otro.

| Columna | Qué escriben |
|---|---|
| `nombre` | el tema. Ej: "Comunicación" |
| `descripcion` | qué cubre el tema |
| `criterios_relevancia` | **qué hace relevante a un video para este tema, y qué NO.** Es el campo más importante: la máquina lo lee para juzgar si un video sirve de verdad o es viral-vacío. Mientras más concreto, menos basura les llega (ejemplo abajo) |
| `voz_default` | la Voz que crearon en 5.1 (se elige de una lista). **Una sola voz por proyecto** |
| `activo` | ✅ marcado para que el proyecto entre en las búsquedas. Sin marcar = pausado. (Ojo: si la **Voz** está apagada, el proyecto no corre aunque esté activo — §5.1) |
| **Videos por corrida** | **cuántos videos quieren de este tema** (ej: 20). **Obligatorio** — ya no se puede dejar vacío, porque ya no hay ningún global al que caer. Es POR proyecto: pueden pedir 20 de un tema y 10 de otro en la misma corrida, y es **el único número que gobierna la cantidad** |

> **Es un máximo, no una promesa, y la pantalla se los dice.** Si el filtro solo encuentra 12 videos
> que de verdad pegan con el tema, llegan 12 — eso es el filtro trabajando, no un error. Por eso
> `Operar` muestra, al lado de lo que pidieron, **lo que entregó la última corrida de verdad**
> (§3.1): así no tienen que adivinar. Si un proyecto entrega menos semana tras semana, la palanca es
> casi siempre **darle más fuentes** (Referentes, §5.3), no subir el número.

> **🔴 Regla de oro: un Proyecto activo necesita fuentes.** Un proyecto marcado `activo` pero **sin ningún
> Referente** ligado **no trae absolutamente nada** — es un proyecto muerto que solo ocupa lugar. Antes de
> activar un proyecto, asegúrense de que tenga **al menos una** cuenta en Referentes. (Pasó en la primera
> corrida real: un proyecto quedó activo sin fuentes y no produjo nada.)

> **Dónde se toca (2026-08-01):** en `Curar → Voces y proyectos`, **tocan el nombre del proyecto y se
> abre su ficha** con todo: nombre, voz, videos por corrida, descripción y criterios. Desde la lista
> solo se prende y se apaga. Los días de búsqueda y los resultados por cuenta **ya no los ven**:
> quedaron fijos, para que el único número que tengan que pensar sea el de cada proyecto (§5.5).

> **Cómo escribir buenos `criterios_relevancia` (esto define la calidad de lo que llega).** Digan qué sirve
> y qué no, concreto:
> - ❌ Vago: *"videos de liderazgo"*.
> - ✅ Útil: *"Sirve: tácticas concretas de feedback, manejo de equipos, casos reales con un aprendizaje
>   accionable. No sirve: frases motivacionales sin sustancia, 'mindset' genérico, clickbait, o videos que
>   solo mencionan 'líder' de adorno."*
>
> Vale la pena que el jefe valide este texto por proyecto.

> **¿Mi criterio está muy fuerte? Léanlo por la tasa de gate.** Cada corrida guarda, por proyecto,
> cuántos videos **evaluó** y cuántos **pasaron** el filtro (lo van a ver en el dashboard, y en el
> `separacion_gate` de §6.2). Regla simple: si de 200 evaluados pasan 30, su criterio **mata el 85%** —
> quizás está demasiado estricto y les está recortando la entrega. Si pasan casi todos, está demasiado
> laxo y llega ruido. El equilibrio: escriban el criterio del **tema** amplio (que no mate de más) y
> dejen la exigencia fina para la **calificación humana** (🔥/👍/👎) — así la máquina aprende de lo que
> ustedes eligen sin cortar el supply de entrada. Si un proyecto entrega siempre menos de lo que pidió,
> miren primero si es **poca fuente** (pocos Referentes activos) o **criterio muy fuerte** (tasa de gate
> baja): el dashboard lo dice con una etiqueta (`supply` / `gate` / `mixta`).

### 5.3 Referentes — las cuentas de Instagram y TikTok que se siguen

> 📍 **Los Referentes se cargan y se podan en `Curar → Referentes`**, con *A revisar* adentro de la
> misma pantalla.

Cada cuenta es una fuente de la que la máquina trae videos. **Es la fuente más importante y de mejor
calidad** (cuentas que ustedes eligieron a mano).

| Campo | Qué escriben |
|---|---|
| Cuenta | el nombre de usuario, sin el link. Ej: `@simonsinek` |
| Plataforma | `instagram` o `tiktok` |
| Proyectos | a cuáles alimenta. **Puede ser más de uno**: la máquina garantiza que cada video llega UNA sola vez, al proyecto donde mejor pega |
| Rastrear | destildá para dejar de traer sus videos, sin perder la cuenta |
| Notas | por qué la agregaron (opcional) |

> **Cómo se toca (2026-08-01).** La lista muestra una línea por cuenta con **a qué proyectos
> alimenta** escrito al lado — ya no hay una grilla de casillas por fila. Para cambiar los proyectos
> de una cuenta, **tocan la cuenta y se abre su ficha**. Para agregar una, el botón **«Agregar
> cuenta»** está arriba de la página. Lo único que se cambia desde la lista es **Rastrear**, que
> guarda solo al tocarlo.

> **La máquina califica sus cuentas.** Al lado de cada una ven tres números que ella misma calcula:
> qué proporción de sus videos **pasa el filtro**, qué proporción terminan **aprobando** ustedes, y
> **sobre cuántos videos** salen esas cuentas (con pocos, no saquen conclusiones). Las que traen
> bastante y pasan poco aparecen arriba de todo, en **A revisar**. **La máquina nunca desactiva una
> cuenta sola** — solo la señala; podarla es decisión de ustedes.
>
> **Cuentas nuevas: `Curar → Sugeridos`.** Ahí caen las que propone el buscador, con la razón por la
> que las propone. **Aprobar una la suma al banco y empieza a traer videos en la corrida siguiente**
> (§8.1); descartarla es definitivo. El buscador **ya no corre solo los lunes**: hay un botón
> («Buscar cuentas nuevas», en `Operar` y en la misma página de Sugeridos) y conviene apretarlo
> recién cuando resolvieron lo que ya está esperando.
>
> **🟠 Falta sembrar TikTok.** Hoy casi todos los Referentes cargados son de Instagram. Para que la máquina
> traiga videos de TikTok hacen falta **dos cosas**: cargar cuentas de TikTok acá **y** que el toggle
> **"Buscar por referentes en TikTok"** esté prendido (§5.5). Sin cuentas de TikTok cargadas, ese eje corre
> vacío. Cargar unas cuantas cuentas buenas de TikTok también le da semillas al buscador de cuentas nuevas
> (§8.1) para que empiece a proponer más TikTok solo.

### 5.4 `Candidatos` — NO se llena a mano

Esta es la bandeja que llena la máquina. Ustedes solo califican (§6). Aun así, conviene saber qué significa
cada columna que van a ver:

| Columna | Qué significa | Quién la llena |
|---|---|---|
| `titulo` | título/contexto del video fuente | máquina |
| `script` | la transcripción del video en español (literal, ver §9) | máquina |
| `idioma` | idioma del original: es / en / pt / it / fr / otro | máquina |
| `thumbnail` | la portada del video (para escanear sin abrir el link) | máquina |
| `url_referente` | link al video original | máquina |
| `referente` | la cuenta de donde salió | máquina |
| `views` `likes` `seguidores` `engagement` | métricas del video fuente | máquina |
| `heat_score` | el número de orden caliente→frío (§7) | máquina |
| `relevancia_score` | qué tan relevante lo juzgó la máquina (0 a 1), aparte de lo viral | máquina |
| `relevancia_razon` | **por qué** la máquina lo dejó pasar — léanlo para curar más rápido | máquina |
| `viral_por_tamano` | ✅ si venía de una cuenta muy grande (+700K) | máquina |
| **`calificacion`** | 🔥 / 👍 / 👎 | **ustedes** |
| **`estado`** | nuevo / aprobado / descartado | **ustedes** |
| `notas_equipo` | su feedback sobre el video | **ustedes** (opcional) |
| `fecha_calificacion` | cuándo lo calificaron | se llena sola |
| `fecha` | cuándo lo generó la máquina | máquina |

> **A veces un candidato llega con el `script` vacío.** Significa que la máquina no pudo transcribir ese
> video (audio raro, sin voz, o falló el transcriptor). No es un error de ustedes. Qué hacer: **miren el
> video original** (el link `url_referente`) y la portada, y decidan igual; o si no vale la pena, **descártenlo**.

### 5.5 Las perillas

> 📍 **Viven en `Curar → Ajustes`**, y lo que cambien aplica en la corrida siguiente.
>
> Ven **solo las perillas de equipo**; las avanzadas directamente no aparecen (para moverlas, avisen).
> La pantalla **no deja guardar un valor imposible**, así que no hay forma de dejar a la máquina
> ordenando raro sin enterarse.

La máquina ya viene con valores por defecto razonables. **No hace falta tocar nada para arrancar.** Es una
lista de "perilla = valor" en español claro.

> 🔢 **Cuántos videos trae cada proyecto NO se decide acá (2026-08-01).** Antes había tres perillas
> que movían lo mismo —*Candidatos por corrida*, *Días de recencia* y *Resultados por cuenta de
> referente*— y ninguna decía cuál mandaba. **Las tres desaparecieron de su pantalla.** Ahora hay
> **un solo número y está en el proyecto**: `Curar → Voces y proyectos → tocá el proyecto →
> "Videos por corrida"`. Lo que pongan ahí es lo que el proyecto pide, y no cae contra ningún
> default escondido — la perilla vieja *Candidatos por corrida* ya no existe, se borró.
>
> 🆕 **Y ahora la pantalla les dice si el número es alcanzable.** Debajo del campo aparece cuántos
> videos crudos llega a mirar la corrida para ese proyecto: es `cuentas × 40`. Con 3 cuentas son
> 120, así que pedir 50 es pedir que pase el filtro casi la mitad, y eso no suele pasar. **Si el
> aviso sale en naranja, la palanca son más cuentas, no un número más alto** — y lo más barato es
> aprobar las que ya están esperando en *Sugeridos*. Pueden guardar igual: es un aviso, no un freno. La ventana de búsqueda quedó fija y ancha (100 días): con el sistema
> anti-repetidos nunca les va a traer dos veces el mismo video, así que achicarla solo servía para
> traer menos.

Las perillas que sí van a querer tocar (las mismas para todos los proyectos):

**Traer videos — los dos ejes del motor semanal (1 = prendido / 0 = apagado; por defecto ambos prendidos):**
- **Buscar por referentes en Instagram** — trae videos de las cuentas de IG en Referentes.
- **Buscar por referentes en TikTok** — trae videos de las cuentas de TikTok en Referentes.

**Proponer cuentas nuevas — los dos ejes del buscador (§8.1) (1 = prendido / 0 = apagado; por defecto ambos prendidos):**
- **Descubrir en Instagram** — el buscador propone cuentas nuevas de Instagram.
- **Descubrir en TikTok** — el buscador propone cuentas nuevas de TikTok (necesita que ya tengan
  cuentas de TikTok cargadas en Referentes; ver §8.1).

> Ojo con la diferencia: **"Buscar por referentes en X"** trae *videos* de las cuentas que ya tienen;
> **"Descubrir en X"** propone *cuentas nuevas* para sumar. Son independientes. Usen los toggles para
> **apagar una plataforma** si no la están usando (si todavía no cargaron cuentas de TikTok, no pasa nada
> por dejarlos prendidos: corren vacíos). No hace falta tocarlos para el día a día.

El resto de las perillas (pesos de orden, bonus de idioma, mínimos) son **avanzadas**: no aparecen en su
cockpit. Si necesitan mover una, avísennos. Igual, todas tienen un tope de seguridad para que nadie
dispare el gasto sin querer.

### 5.6 Apagar vs. borrar (nuevo, 2026-08-02)

Son dos cosas distintas y **casi siempre la que quieren es apagar**.

| | Qué hace | Cuándo |
|---|---|---|
| **Apagar** (el interruptor de la lista) | La fila se queda ahí, gris, y deja de correr. Se puede volver a prender cuando sea. | *"Este cliente se pausa unos meses"*, *"esta cuenta no me está sirviendo pero no quiero perderla de vista"*. **Esto es lo normal.** |
| **Borrar** (adentro del record, abajo a la izquierda) | La fila **desaparece**. No se deshace. | *"Esto lo creé mal"*: el proyecto duplicado, la cuenta con el nombre mal escrito, la voz de un cliente que nunca arrancó. |

**Borrar una cuenta de referente** se puede siempre. **Lo que esa cuenta ya trajo no se toca**: los
videos que están en el feed y el histórico se quedan como están. Solo deja de buscarse. Y si mañana
la vuelven a agregar con el mismo `@`, recupera sus porcentajes (*pasa* / *aprueban*) sola.

**Borrar una voz o un proyecto** solo se puede si **todavía no produjo nada**. Si el proyecto ya tiene
videos en el feed, la pantalla no los borra: les dice cuántos hay y les propone apagarlo. Es a
propósito — esos videos son el trabajo de la máquina y sus decisiones de ustedes, y no queremos que un
click se los lleve. Si de verdad necesitan borrar un proyecto que ya tiene feed, **avísennos**.

Una voz tampoco se borra mientras tenga proyectos colgando: primero se resuelven los proyectos.

> ⚠️ **Borrar un proyecto puede dejar cuentas sin trabajo.** Si una cuenta solo alimentaba a ese
> proyecto, queda prendida y sin destino. Después de borrar, pasen por *Referentes*: el aviso de
> arriba de la página les dice cuántas quedaron así.

---

## 6. Cómo califican: las dos columnas que importan

Hay dos cosas que marcan, y son distintas:

### `calificacion` — su opinión rápida
- 🔥 = excelente, hay que usarlo
- 👍 = sirve
- 👎 = no sirve

### `estado` — la decisión de flujo (esta es la que "cuenta")
- **nuevo** — recién llegó, nadie lo miró (viene así por defecto)
- **aprobado** — lo eligen. **Esto es lo que cuenta como "seleccionado"** y va al Histórico.
- **descartado** — lo miraron y no va. **También califíquenlo** (👎): la máquina aprende del "no".

> **¿Cuál es más importante?** El `estado`. La máquina aprende sobre todo de aprobado vs descartado. La
> `calificacion` (🔥/👍/👎) es una ayuda visual para ustedes y una señal más fina. Lo ideal: pongan **las dos**.

> **El 🔥 ahora enseña.** Cada domingo la máquina destila lo que aprobaron y descartaron en patrones
> (el campo `criterios_aprendidos` del Proyecto) para afinar sola su criterio, y usa los **🔥 como el
> ejemplo ideal** de "esto es exactamente lo que quiero". Poner 🔥 en lo mejor no es solo estético:
> le está enseñando a la máquina qué buscar.

> **No dejen candidatos colgando.** Un candidato que queda en `nuevo` sin calificar por **más de 20
> días** se borra solo (para que la pestaña "Nuevos" no se llene de cosas viejas que nadie miró). Si no
> lo calificaron, se pierde sin pasar por el Histórico. Traten de vaciar la bandeja cada semana.

### La vista "🔥 Seleccionados"
Es una pantalla aparte que muestra **solo los que pusieron en `aprobado`**, ordenados del más caliente al
más frío. **Es solo para ver**, no califican ahí. Funciona así: ustedes aprueban en la lista normal de
Candidatos → automáticamente aparecen en esta vista. Es su "mapa de calor" de lo elegido, y se rearma solo.

### 6.1 La página "Descartes" — 2 minutos por semana

La máquina también **descarta** videos antes de que lleguen a ustedes. La mayoría son basura obvia, pero
a veces se equivoca y mata algo bueno. Para poder detectarlo, cada corrida deja en la página **Descartes
(auditar)** los ~10 descartes más dudosos (los que casi pasan), con su transcript y **por qué** los rechazó.

Lo único que hacen: mirarlos rápido una vez por semana y marcar la columna `veredicto`:
- **bien descartado** — la máquina hizo bien (la mayoría de los casos).
- **era bueno** — este video SÍ servía. Esta marca es oro: nos dice que los criterios de ese proyecto
  tienen un agujero, y es el dato con el que los afinamos.

El domingo la máquina cuenta los "era bueno", los registra en Métricas y **vacía la página** (no se
acumulan; cada semana llega una tanda fresca). Si no alcanzan a revisarlos, no pasa nada, pero cada
"era bueno" detectado mejora el filtro.

Qué ven en cada fila (todo lo llena la máquina, salvo el veredicto):

| Columna | Qué es |
|---|---|
| `titulo` / `thumbnail` | el video descartado, para reconocerlo de un vistazo |
| `script` | el transcript que juzgó el filtro (la evidencia) |
| `relevancia_razon` | **por qué** lo rechazó — léanla primero |
| `relevancia_score` | el puntaje que le dio (0 a 1); acá llegan los que CASI pasan |
| `referente` / `url_referente` | la cuenta y el link al original, por si quieren verlo |
| `proyecto` | el tema cuyo filtro lo rechazó |
| **`veredicto`** | **lo único que tocan:** bien descartado / era bueno |

### 6.2 Las páginas "Calidad por Proyecto", "Salud del Sistema" y "Costos" (solo para ver)

Cada domingo la máquina escribe el resumen de la semana:
- **Calidad por Proyecto**: por proyecto, cuántos calificaron, cuántos aprobaron y la **precisión**
  (de lo que llegó, qué fracción sirvió). La columna **`diagnostico`** les traduce en una frase si el
  criterio de ese proyecto está funcionando, con un semáforo:
  - 🟢 **sano** — el filtro distingue bien lo que ustedes quieren. No toquen nada.
  - 🟡 **mejorable** — separa, pero poco. Un retoque a `criterios_relevancia` (§5.2) lo sube.
  - 🔴 **flojo o invertido** — el filtro casi no distingue lo que aprueban de lo que descartan (o, peor,
    está al revés). **Acá sí conviene reescribir el `criterios_relevancia`** del proyecto: sumen qué SÍ
    y qué NO cuenta como relevante, con un par de ejemplos. Es la señal más útil de esta página.
- **Salud del Sistema**: los números de la máquina (cuántos videos procesó, cuántos llegaron sin guion,
  si alguna corrida falló). Esta es más para Mani, pero está a la vista de todos.

Son de **solo lectura a propósito**: las llena la máquina, nadie escribe ahí. *(Guarda 12 semanas de
historia visible; lo más viejo queda archivado por fuera.)*

Qué significa cada columna, por página:

**Calidad por Proyecto** (una fila por semana × proyecto):

| Columna | Qué es |
|---|---|
| `semana` / `ambito` | la semana (lunes) y el proyecto de la fila |
| `calificados` | cuántos candidatos calificaron esa semana (aprobados + descartados) |
| `aprobados` / `descartados` | cómo se repartió esa calificación |
| `precision` | **la métrica norte**: de lo que les mandamos, qué % sirvió |
| `separacion_gate` | si el filtro distingue lo que aprueban de lo que descartan (0.20+ = sano; bajo = afinar criterios) |
| `diagnostico` | el semáforo 🟢🟡🔴 con qué hacer (§ arriba) |

**Salud del Sistema** (una fila por semana, el embudo de la máquina):

| Columna | Qué es |
|---|---|
| `colectados` | videos crudos que trajo el scraping |
| `pretrim` | los que sobrevivieron al pre-filtro rápido |
| `gate_pass` | los que pasaron el filtro de relevancia (IA) |
| `entregados` | los que llegaron a su bandeja |
| `sin_guion` | cuántos videos se **descartaron** por no tener guion (audio sin voz). Ya no llegan al feed (§9); si este número dispara, avisen: puede ser el transcriptor caído |
| `falsos_negativos` | los "era bueno" que marcaron en Descartes (§6.1) |
| `runs_ok` / `runs_fallo` | corridas que cerraron bien / mal esa semana |
| `duracion_min` | cuánto tardó la corrida promedio |

**Costos** (el gasto estimado de la semana, en dólares): un número grande por servicio —
transcripción (Supadata), filtros y traducciones (IA), y los scrapers (Apify, IG/TikTok/buscador).
Elijan la semana arriba; `costo_total` es la suma. Los campos que dicen "conteo" no son dólares:
son la cantidad de llamadas de la que sale el costo.

---

## 7. El heat score, en cristiano

Es un número que la máquina le pone a cada video para ordenarlos: **los de arriba son los más prometedores**,
según vistas, likes, engagement, relevancia, y qué tan parecidos son a lo que ustedes ya eligieron antes.

Tres cosas que conviene saber:

1. **No es una nota sobre 10.** El número solo sirve para **ordenar**. No piensen "¿0.8 es bueno?", piensen
   "¿está arriba o abajo en la lista?".
2. **Es relativo a cada tanda.** Se compara cada video contra los otros de la misma corrida, no contra un
   ideal fijo.
3. **Aprende de ustedes.** Cuando aprueban videos de cierta cuenta o cierto idioma, la máquina empieza a
   traer más parecido y a ponerlo más arriba. **Calificar bien hoy mejora lo que les llega mañana.** Por eso
   vale la pena calificar incluso lo que descartan.

El sistema le da un **empujón extra** al contenido en otros idiomas (inglés, portugués, etc.), porque la
prioridad del negocio es traer lo que **no** circula en español.

---

## 8. Cómo encuentra los videos (y cómo pedir más de algo)

La máquina busca por **dos canales** en paralelo:

1. **Cuentas de Instagram** (Referentes con plataforma = instagram) — la fuente curada de IG.
2. **Cuentas de TikTok** (Referentes con plataforma = tiktok) — la fuente curada de TikTok.

*(Antes había un tercer canal por hashtags de TikTok. Se retiró: traía casi pura basura y gastaba
transcripción en videos que después se descartaban.)*

**Cómo pedir más o mejor contenido:**
- ¿Quieren más de una temática o mejor calidad? → **agreguen buenos Referentes** (de IG y TikTok). Es LA
  palanca, porque son cuentas que ustedes eligieron.
- ¿Un referente dejó de servir? → **desmárquenle `activo`** (no hace falta borrarlo).

Resumen: **la calidad de lo que llega depende de qué tan buena sea su lista de Referentes. Quieren
más/mejor → curen esa tabla.**

### 8.1 El buscador de cuentas nuevas (`Curar → Sugeridos`)

Para que la lista de Referentes no se agote, hay un segundo robot que les propone cuentas nuevas.
Cómo las encuentra: toma sus referentes que **mejor están funcionando** (los que más aprueban
ustedes), busca cuentas **parecidas** en Instagram **y en TikTok**, filtra las que ya conocen y las
que no pegan con los temas, y las deja en **Curar → Sugeridos**.

> **Ya no corre solo los lunes (2026-08-01): ahora lo aprietan ustedes.** El botón **«Buscar cuentas
> nuevas»** está en `Operar` y también arriba de la bandeja de Sugeridos. El cambio es por dos
> razones: producía más rápido de lo que se consume (llegó a haber 8 propuestas sin resolver), y
> **buscar después de que ustedes terminaron de decidir usa una señal más fresca** — porque las
> semillas salen de lo que aprobaron. Conviene apretarlo con la bandeja vacía, no con cosas
> esperando. Cuesta créditos, así que pide confirmación.

Cada propuesta llega con lo justo para decidir en la lista, y **si tocan la cuenta se abre la ficha**
con la razón completa, la bio y los proyectos:

| Qué ven | Qué es |
|---|---|
| La cuenta | con link al perfil: ábranlo y mírenla antes de decidir |
| Afinidad | qué tan bien pega con el tema, de 0 a 1 (solo llegan las de 0.6 para arriba) |
| La razón | **por qué** la propone, en español — léanla primero, decide la mayoría de los casos |
| Bio y seguidores | contexto de la cuenta |
| Quién la recomendó | cuáles de SUS referentes la "recomendaron" |
| Los proyectos | dice **«entraría a: …»** con los que el buscador ya eligió. Si están bien, **aprueban de un click sin abrir nada**; si quieren cambiarlos, tocan la cuenta y se abre la ficha |

**Su trabajo (una vez por semana, 5 minutos):** revisar las que están pendientes y decidir:
- **Aprobar** — la quieren. **No hay que hacer nada más:** queda en el banco de Referentes, activa y
  con la razón en las notas, y empieza a traer videos en la corrida siguiente.
- **Descartar** — no va. **Ojo: es definitivo** — esa cuenta no se les vuelve a proponer nunca
  (si se arrepienten, siempre pueden agregarla a mano en `Curar → Referentes`).

Apenas deciden una, **desaparece de la lista**: la pantalla muestra solo lo que falta revisar.

> 📍 **La decisión va en `Curar → Sugeridos`**, que es el único lugar desde donde una cuenta aprobada
> se siembra de verdad en el banco.

Tres cosas para saber:
- **Propone Instagram y TikTok.** Para TikTok necesita que ya tengan **algunas cuentas de TikTok
  cargadas** en Referentes: de esas semillas saca las parecidas. Las primeras de TikTok las siembran
  ustedes a mano (§5.3); de ahí el buscador las multiplica solo. Sin ninguna cuenta de TikTok, ese eje
  no propone nada (no se rompe, solo no aporta).
- **No reemplaza su criterio.** Nada entra a Referentes sin que ustedes lo aprueben. Sigue valiendo
  agregar cuentas a mano cuando encuentren una buena.
- Mientras mejor califiquen los Candidatos durante la semana, mejores semillas usa el buscador →
  mejores propuestas les llegan. Todo se retroalimenta.

### 8.2 Cuando el video lo traen ustedes: **el transcriptor**

Todo lo de arriba es la máquina buscando sola. Pero a veces el video llega por otro lado: se los pasa
un cliente, lo manda el jefe, lo encuentran ustedes scrolleando. Para eso está la pestaña
**Transcribir** de la herramienta nueva.

**Cómo se usa:** pegan los links y listo. No hay formato: uno por línea, separados por comas, o el
chat de WhatsApp copiado entero con los mensajes y todo — la herramienta saca los links sola y les
muestra cuántos entendió **antes** de arrancar. Después van apareciendo los scripts en la lista de
abajo, con un botón para copiar cada uno.

**Cuatro cosas que conviene saber:**

- **Lo que pegan deja de aparecer en el Feed.** Ese es el punto: si ustedes ya trabajaron un video, la
  máquina no se los vuelve a recomendar la semana que viene. Se marca solo, no tienen que hacer nada.
- **Pegar dos veces el mismo video no cuesta nada.** Si ya lo pidieron antes, les devuelve el script
  que ya estaba en vez de volver a procesarlo.
- **Cuando graben un video, márquenlo.** ⬅️ *lo nuevo, 2026-08-18.* Ver abajo.
- **Sirven links de Instagram (reels y posts de video) y de TikTok.** Los links cortos de TikTok (los
  `vm.tiktok.com/…` que salen del botón de compartir) **no** sirven: abrilo, y copiá el link largo de
  la barra de direcciones, el que tiene `/video/`.

El script que sale es exactamente el mismo tipo de script que el del Feed: **literal**, el video tal
cual traducido. La adaptación a la voz sigue siendo de ustedes.

#### El botón "Marcar como grabado"

Cada fila de la lista tiene un botón **Marcar como grabado**. Cuando graben el video de ese guion,
apriétenlo. Queda un cartelito **Grabado** en la fila, y si se equivocaron, el mismo botón lo saca —
no se rompe nada, no pregunta nada.

**Para qué sirve:** la próxima vez que alguien pegue una lista, si adentro hay un video que ustedes
ya grabaron, la herramienta lo avisa **antes** de procesarlo:

> *"3 ya se grabaron. Alguien del equipo los marcó, así que el guion ya se usó."*

Y les ofrece sacarlos de la lista con un clic.

📍 **El mismo botón está ahora en Históricos**, y ahí alcanza **todos** sus guiones — también los que
trajo la máquina. Da igual dónde marquen: es la misma marca. Ver §8.3.

🔴 **Ojo, esto es lo primero que NO es automático.** Todo lo demás se marca solo; esto no, porque la
herramienta no tiene forma de enterarse de que ustedes grabaron algo. Si nadie marca, el aviso no
aparece nunca y estamos igual que antes.

**Por qué lo agregamos:** Majo avisó que en una lista venían videos que el equipo ya había grabado.
Revisamos y la herramienta **no estaba repitiendo nada** (los 50 links de esa lista entraron por
primera vez ese día, y el sistema tiene un candado que impide que un video se proponga dos veces).
El problema era otro: **nadie le había dicho nunca a la herramienta qué se grabó.** Esto es esa
conversación que faltaba.

**Y lo importante:** esto **no arregla las listas viejas** solo. Empieza a proteger desde la primera
vez que marquen — pero si tienen un Excel con lo que ya grabaron, **eso sí se puede cargar de una**:
es lo de §8.3.

---

### 8.3 Históricos: qué guiones tenemos y cuáles ya usamos *(nuevo, 2026-08-20)*

**Curar → Históricos** dejó de ser un archivo de solo mirar. Ahora es donde llevan la cuenta.

**Qué ven ahí:** todos sus guiones, de todas las semanas, vengan de donde vengan — los que aprobaron
en el Feed y los que transcribieron pegando un link. Cada tarjeta dice de dónde salió (**Del Feed** o
**De Transcribir**).

**Tres cosas nuevas:**

**1. Marcar cualquier guion como grabado.** El mismo botón de Transcribir, pero acá está en *todos*
los guiones. Antes solo se podían marcar los que ustedes habían pegado a mano; los que traía la
máquina no tenían dónde marcarse, que eran casi un tercio del archivo.

**2. Los filtros de arriba: `Sin grabar` · `Grabados` · `Todos`.** Con el número al lado. *"¿Qué me
falta grabar?"* es un clic.

**3. Cargar una lista de lo que ya grabaron.** Arriba de todo hay **Cargar una lista de videos ya
grabados**. Ábranlo, peguen los links y listo.

> **Cómo se usa con un Excel:** seleccionen la columna de links en su planilla, copien (Cmd+C /
> Ctrl+C) y peguen en el cuadro. No hay que subir ningún archivo ni acomodar nada: la herramienta
> saca los links del texto sola y les dice cuántos entendió **antes** de que aprieten el botón.
> Funciona igual con una lista de WhatsApp, un Google Doc o links sueltos uno por línea.

⚠️ **Esto solo marca. No transcribe nada y no cuesta nada**, aunque peguen 300. Si además querés el
*guion* de alguno, eso se pide en **Transcribir** como siempre.

Los links que carguen y que la herramienta no conozca aparecen en la lista con borde punteado y el
cartel **Cargado a mano**: son videos que ustedes grabaron por fuera, así que no tienen guion. Están
ahí para que la herramienta no se los vuelva a proponer.

**Y los dos botones de descarga:**

| Botón | Qué baja |
|---|---|
| **Descargar todo (Excel)** | El archivo de siempre, con una columna nueva al final: **GRABADO EN**. Las demás quedan donde estaban, así que si alguien armó una planilla encima de este export, le sigue funcionando. |
| **Descargar solo grabados (Excel)** | Solamente lo que ya grabaron, incluidos los links que cargaron a mano. Es el parte de *"esto ya salió"*. |

> 📗 **Desde el 2026-08-20 los dos bajan un `.xlsx` de verdad**, no un `.csv`. Se abre haciendo
> doble clic, en Excel, Numbers, LibreOffice o Google Sheets, sin importar el país ni la
> configuración: ya no hay que elegir separador ni pelear con los acentos. Y las vistas, los likes
> y los puntajes llegan como **números**, así que se pueden ordenar y sumar directo.

---

## 9. Lo que el sistema todavía NO hace (limitaciones conocidas)

Honestidad por adelantado, para que no se sorprendan:

- **La traducción es literal, no adaptada.** El script es el video tal cual, traducido al español. La
  adaptación a la voz/marca la hacen ustedes.
- **Los videos que llegan al Feed salen solo de sus Referentes.** Si la lista es floja, lo que llega
  es flojo. El buscador de cuentas nuevas (§8.1) ayuda a reponerla en Instagram y TikTok, pero solo
  propone: la decisión de qué cuenta entra sigue siendo de ustedes (y las primeras cuentas de TikTok
  las siembran ustedes a mano para que el buscador tenga de dónde partir). Si el video lo tienen
  ustedes y no viene de un Referente, para eso está el transcriptor (§8.2).
- **Los videos sin voz se descartan solos.** Si un video no tiene guion (audio sin voz, música, texto
  en pantalla) la máquina lo descarta sola: ya **no** llega marcado ⚠️ SIN GUION al feed. Solo llega lo
  que tiene guion de verdad. *(Contra: si el transcriptor se cae una corrida entera, esa corrida puede
  llegar vacía — la máquina avisa en las métricas.)*
- **El empujón por idioma es parejo para todos los idiomas no-español.** No premia más el inglés que el
  portugués: todos los no-español reciben el mismo empujón.
- **El orden es menos estable con poco volumen.** Con pocas corridas el heat score puede ser ruidoso; se
  afina a medida que entra más data y ustedes califican.
- **No se puede filtrar por referente** (§4.2). Se puede ordenar por casi cualquier número y filtrar
  por idioma y origen, pero *"mostrame solo lo de esta cuenta"* todavía no está. Si lo necesitan,
  pídanlo — es lo primero de la lista.
- **El manual todavía le debe una sección a Colecciones y a la limpieza de guiones.** Las dos
  pantallas existen y funcionan; lo que falta es explicarlas acá con el detalle del resto. Mientras
  tanto está la fila en la tabla de §4.1 y el ⓘ de cada campo.

Ninguna de estas rompe el uso diario. Son cosas en la lista para mejorar más adelante.

---

## 10. Preguntas frecuentes (para no tener que preguntar)

**¿Cada cuánto entra contenido nuevo?** Una vez por semana (corrida automática del lunes) y cada vez
que pidan una corrida a demanda (§3.1). Pueden calificar cualquier día; lo calificado se archiva el
domingo a las 18:00.

**Pedí N=20 y llegaron 12. ¿Está roto?** No: la N es un **máximo** (§5.2). El filtro solo deja pasar lo
que de verdad pega con los criterios del proyecto; si el pool de esa corrida no daba para 20 buenos,
llegan menos. La palanca para subir la entrega es agregar Referentes buenos a ese proyecto.

**Califiqué algo por error, ¿lo puedo cambiar?** Sí, mientras no haya pasado el archivado del domingo. Solo
cambien la `calificacion` o el `estado`. Después del domingo ya se fue al Histórico.

**Aprobé un video pero desapareció de la lista. ¿Se perdió?** No. Los aprobados se van a **Históricos**
cada domingo, con su transcripción entera. Ahí quedan guardados, y los botones de descarga te bajan
todo lo aprobado de todas las semanas para abrirlo en Excel o en Sheets. La lista de Candidatos se
limpia sola para no llenarse.

**¿Tengo que calificar TODO lo que llega?** Idealmente sí, aunque sea para descartar. Lo que no califican no
se archiva ni le enseña nada a la máquina: queda flotando. Descartar (👎) es tan útil como aprobar.

**Llegó poco contenido esta semana, ¿está roto?** Probablemente no. Puede ser que haya poco material reciente,
que un proyecto no tenga bastantes fuentes, o que las cuentas no publicaron. Revisen que sus Proyectos activos
tengan Referentes (§5.2). Si igual les parece raro, avísennos.

**Veo un candidato con el script vacío.** La máquina no pudo transcribirlo. Miren el video original y decidan,
o descártenlo (§5.4).

**Agregué un referente y no trajo nada.** Chequeen: ¿está `activo` marcado? ¿el `handle` está bien escrito
(una sola arroba)? ¿la `plataforma` es la correcta? ¿está ligado a un Proyecto **activo**? Si todo está bien,
puede ser que la cuenta no publicó en la ventana de días (§5.5). Denle una semana.

**¿Puedo borrar un Proyecto/Referente?** Mejor **desmárquenle `activo`** en vez de borrar: así queda
guardado por si lo quieren de vuelta, y no rompen nada. Borrar también se puede, pero es definitivo.

**Aprobé una cuenta en Sugeridos, ¿cuándo empieza a traer videos?** En la corrida siguiente: al
aprobarla queda en el banco de Referentes, activa. No tienen que copiar nada a mano (§8.1).

**Descarté una cuenta propuesta y me arrepentí.** El buscador no la vuelve a proponer (descartar es
definitivo), pero pueden agregarla a mano en `Curar → Referentes` cuando quieran, como cualquier
otra cuenta.

**¿Qué es "heat score", en serio importa el número?** No el número exacto, solo el orden (§7). Arriba = más
prometedor. Punto.

---

## 11. Si algo se rompe o no entienden (a quién avisar)

Antes de escribirnos, chequeen esta lista rápida — resuelve la mayoría:

1. ¿El Proyecto está `activo`?
2. ¿Tiene al menos un Referente ligado y `activo`?
3. ¿Los `handle` están bien escritos (una sola arroba, plataforma correcta)?
4. ¿La Voz que asignaron tiene sentido con el tema del Proyecto?

Si con eso no se resuelve, escríbannos con **qué esperaban** y **qué pasó** (una captura ayuda muchísimo).

---

## 12. Lo que necesitamos / lo que podría cambiar

> Espacio para el equipo. Anoten acá lo que les falta, lo que les confunde, o lo que cambiarían. Esto es lo
> que prioriza el equipo técnico para las próximas mejoras.

| Fecha | Quién | Qué necesito / qué cambiaría | Por qué |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

**Dudas sueltas / cosas que no entendí:**
-
-

---

*Cualquier duda que no se resuelva acá, hablen con el equipo técnico (Mani / Alejo / Dani).*
