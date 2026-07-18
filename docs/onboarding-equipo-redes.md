# Manual del equipo de redes — cómo usar el sistema de reels

> Guía para Majo y Jero. Pensada para operar el sistema **sin saber nada de cómo está hecho por
> dentro**. Está armada para que casi cualquier duda se resuelva acá. Si algo igual no se entiende o
> falta, anotalo al final (sección "Lo que necesitamos") y lo resolvemos.
>
> *Actualizado: 2026-07-17. Refleja el sistema ya estabilizado: el motor busca **solo por
> referentes** (cuentas de Instagram y TikTok) — las keywords/hashtags se retiraron porque no
> traían calidad —, el **buscador de cuentas nuevas** les propone referentes (§8.1), y hay
> **páginas de métricas** que muestran cómo viene funcionando (§6.2), ahora con la columna
> **`diagnostico`** que les dice en una frase qué criterio conviene ajustar (§6.2).*
>
> *Nuevo desde 2026-07-17:* además del lunes automático, **se puede correr a demanda** (§3.1);
> cada Proyecto tiene su propia **`N`** (cuántos videos quieren de ese tema, §5.2); y las **Voces
> tienen interruptor**: apagar una voz pausa todos sus proyectos de una (§5.1).

---

## 0. Lo que SÍ y lo que NO (léanlo primero, es el resumen de todo)

**Lo que SÍ hacen ustedes:**
- ✅ Entrar a **Airtable** todos los días (o cada 2-3 días) y **calificar** los videos que llegaron.
- ✅ Armar la corrida a su medida: elegir **Voz → Proyectos → N** (cuántos videos por tema) y **pedir
  una corrida a demanda** cuando la necesiten (§3.1) — ya no dependen del lunes.
- ✅ Poner en cada candidato dos cosas: la **calificación** (🔥/👍/👎) y el **estado** (aprobado/descartado).
- ✅ Calificar **también lo que descartan** (👎 + descartado): así la máquina aprende y mejora.
- ✅ Mantener sana la lista de **Referentes** (agregar cuentas buenas de Instagram **y TikTok**).
  Esa lista es de dónde sale **todo** el contenido: cuentas buenas = candidatos buenos.
- ✅ Revisar **una vez por semana** la tabla **Referentes propuestos**: la máquina les sugiere cuentas
  nuevas; ustedes marcan `aprobado` o `descartado` y las aprobadas se siembran solas (§8.1).
- ✅ Escribir buenos `criterios_relevancia` en cada Proyecto (es lo que decide la calidad de lo que llega).

**Lo que NO hacen (nunca):**
- ❌ **No** llenan la tabla **Candidatos** a mano — esa la llena sola la máquina.
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
referentes y de hashtags sobre los temas que les interesan, los **transcribe y traduce al español**, los
ordena de **más prometedor a menos**, y se los deja servidos en una lista.

El trabajo de ustedes no es buscar ni escribir. Es **decidir**: entrar a la lista, leer, y marcar cuáles
sirven. La máquina **aprende** de lo que eligen y va mejorando lo que les trae.

En una frase: **la máquina encuentra y ordena; ustedes eligen y adaptan.**

### 1.1 Las tres máquinas (qué corre solo y cuándo)

Por detrás no hay una sola máquina, son tres robots que corren solos en el momento justo. **No
tienen que hacer nada para que arranquen** — es plomería. Sirve saber que existen para entender de
dónde sale cada cosa que ven en Airtable:

| Robot | Cuándo corre | Qué hace | Qué ven ustedes después |
|---|---|---|---|
| **El motor** | Lunes 8:00 am **y a demanda** (§3.1) | Sale a Instagram y TikTok, baja videos de sus Referentes, los transcribe, traduce al español y ordena. | Videos nuevos en **Feed de Calificación** + los dudosos en **Descartes**. |
| **El buscador de cuentas** | Lunes 9:00 am | Mira sus mejores Referentes y busca cuentas **parecidas** para sumar. | Sugerencias en **Referentes propuestos**. |
| **El archivador** | Domingo 6:00 pm | Se lleva al Histórico todo lo que ya calificaron, limpia la lista y cuenta el desempeño de la semana. | La lista queda limpia + se actualizan las **Métricas**. |

Regla mental de la semana: **el lunes llega trabajo, durante la semana ustedes califican, el domingo
se archiva y se mide.** Todo lo demás es automático.

---

## 2. Las únicas dos herramientas que tocan

| Herramienta | Para qué | Qué hacen ahí |
|---|---|---|
| **Airtable** | El tablero de trabajo | Leen los videos y los califican. Es donde viven el 95% del tiempo. |
| **Google Sheet "Histórico"** | El archivo de lo ya elegido | Solo lo consultan/descargan. **No escriben ahí.** |

Todo lo demás (los robots, las bases de datos por detrás) es **sala de máquinas**. No necesitan entrar
nunca. Si alguien menciona "n8n", "Supabase" o "el cron", es plomería interna, no es asunto del equipo
de redes.

---

## 3. La rutina (lo que hacen durante la semana)

1. La máquina corre sola (una vez por semana) y deja videos nuevos en Airtable.
2. Entran a Airtable, a la tabla **Candidatos** (o a la vista **Calificar**).
3. Cada fila es un video ya transcrito y traducido al español, con su métrica y su link al original.
4. Leen el texto (o miran el video original y la portada), y **deciden**.
5. Califican (ver §6).
6. Lo que aprueban queda guardado en el Histórico **automáticamente** y sale de la lista. Lo que no
   tocaron sigue esperando.
7. Una vez por semana (2 min): pasan por **Descartes** y marcan el `veredicto` (§6.1), y
   revisan los **Referentes propuestos** (§8.1).

Regla mental: **Airtable es su bandeja de entrada.** La máquina la llena, ustedes la vacían decidiendo.
Lo que califican desaparece de pendientes y queda archivado.

> **¿Cuándo se limpia la lista?** Un proceso automático corre **los domingos a las 18:00** y se lleva al
> Histórico todo lo que ustedes **ya calificaron** durante la semana (aprobado o descartado), y lo borra
> de Airtable. Los que dejaron sin calificar **no se borran**: siguen esperando. Por eso conviene calificar
> **antes del domingo** — así el archivo queda ordenado y la lista no se amontona.

### 3.1 Corridas a demanda (nuevo)

Ya no hay que esperar al lunes. El flujo es como elegir en Netflix: dentro de una **Voz** prendida,
prenden los **Proyectos** que quieren, le ponen a cada uno su **`N`** (cuántos videos quieren de ese
tema, §5.2), y se dispara una corrida. En unos ~40-60 minutos los videos aparecen en el Feed.

Cómo se dispara **hoy**: se la piden al equipo técnico (es un click en la sala de máquinas; si en
algún momento les enseñamos, es un solo botón — nada más de ahí se toca). Más adelante va a haber un
botón propio en la herramienta nueva que estamos construyendo.

Dos reglas que evitan sorpresas:
- **Una corrida a la vez.** Si piden una mientras otra está corriendo, la segunda no arranca (no es
  un error: es a propósito, para no pagar doble). Esperen a que termine y pidan de nuevo.
- **Antes de pedir, dejen la selección lista:** Voz prendida, Proyectos que quieren en `activo`, la
  `N` puesta, y los Referentes de esos proyectos activos. La corrida procesa **todos** los proyectos
  activos, cada uno hasta su N.

---

## 4. Airtable por dentro: las tablas

Hay 8 tablas. Piénsenlas en tres grupos.

### Las que arman una vez (la configuración de la búsqueda)

- **Proyectos** — cada tema que se busca (ej: "Comunicación", "Ventas", "Storytelling"). Define el tema,
  los criterios de relevancia y la voz.
- **Voces** — para quién se selecciona (un personaje o marca). Organiza y afina el filtro.
- **Referentes** — las **cuentas** (de Instagram **y** TikTok) que se siguen. **De ahí sale todo:**
  la máquina solo trae videos de estas cuentas.
- **Ajustes** + página **Configuración Global** — las "perillas" (cuánto trae por corrida, días, qué ejes
  se prenden). **Ya vienen con valores razonables; casi no se tocan.** Más en §5.5.

> Estas las arman una vez y las van ajustando. **No hace falta tocarlas para el trabajo del día.**

### Las que usan para trabajar

- **Candidatos** — los videos que llegaron, esperando que ustedes los califiquen. Acá viven (todos
  los días).
- **Referentes propuestos** — las cuentas nuevas que la máquina les sugiere para sumar a Referentes.
  La revisan **una vez por semana** (§8.1).
- **Descartes del gate** — los ~10 videos más dudosos que la máquina descartó, para que auditen si se
  equivocó. También **una vez por semana**, 2 minutos (§6.1).

### La que solo miran

- **Métricas** — el desempeño de cada semana (páginas *Calidad por Proyecto*, *Salud del Sistema* y *Costos*, §6.2).
  La llena la máquina cada domingo; **nadie escribe ahí**.

### 4.1 El layout que ven: el menú del "Cockpit Redes"

Cuando entran a Airtable no ven las tablas crudas: ven una interfaz llamada **Cockpit Redes** con un
menú de páginas a la izquierda. Cada página es una vista limpia de una tabla, con solo lo que hace
falta. Este es el menú completo y qué pueden tocar en cada uno:

| Página (lo que ven en el menú) | Para qué | Qué editan ahí |
|---|---|---|
| **Feed de Calificación** | Su bandeja diaria de videos a calificar | `calificacion`, `estado`, `notas_equipo` |
| **Referentes Buscados** | Cuentas nuevas que sugiere el buscador (§8.1) | `estado` (aprobado / descartado) |
| **Descartes** | Los ~10 descartes dudosos de la semana (§6.1) | `veredicto` |
| **Referentes** | El banco de cuentas de IG y TikTok que se rastrean | todo (arman la lista) |
| **Proyectos** | Los temas que se buscan | todo (arman los temas) |
| **Voces** | Para quién se selecciona | todo |
| **Referentes - Revisar** | Las cuentas que vienen flojas (la máquina las señala, §5.3) | solo `activo` (podar es decisión de ustedes) |
| **Configuración Global** | Las perillas del día a día (§5.5) | solo el `valor` de cada perilla |
| **Ajustes Dev-Only** | Las perillas avanzadas | **nada — solo lectura** (avisen antes de tocar) |
| **Calidad por Proyecto** | Precisión por proyecto (§6.2) | **nada — solo lectura** |
| **Salud del Sistema** | Los números de la máquina (§6.2) | **nada — solo lectura** |
| **Costos** | Cuánto gastó la semana, por servicio | **nada — solo lectura** |

> **Ojo con los nombres.** Algunas páginas se llaman distinto a la tabla que muestran: *Feed de
> Calificación* es la tabla **Candidatos**; *Configuración Global* es la tabla **Ajustes**; *Referentes
> Buscados* es la tabla **Referentes propuestos**; *Calidad por Proyecto* muestra **Métricas Proyectos**
> y *Salud del Sistema* / *Costos* muestran **Métricas Global**. Guíense por el nombre del **menú**, no
> por el de la tabla.
> También hay un formulario **"Nuevo Proyecto"** para crear un proyecto llenando un formulario en vez
> de una fila.

En cada candidato la máquina ya les dejó lleno: el **título**, el **script** (la transcripción en español),
el **idioma original**, la **portada**, el **link al video original**, las **métricas** (views, likes,
seguidores, engagement) y el **heat score** (§7). **Lo único que llenan ustedes:** la **calificación**, el
**estado** y, si quieren, **notas del equipo**.

> **Todos los campos tienen ayuda incorporada.** Al lado del nombre de cada campo hay un ícono **ⓘ**:
> tóquenlo y sale la explicación de qué es y quién lo llena. Si dudan de un campo, el ⓘ responde más
> rápido que este manual.

---

## 5. Configuración inicial: cómo llenar cada tabla la primera vez

Esto se hace **una sola vez** al arrancar (y cada vez que quieran sumar un tema o una cuenta nueva).
**Candidatos no se toca acá** — esa la llena la máquina. Las que arman ustedes son las otras.

**Orden recomendado:** Voces → Proyectos → Referentes. (Hay que crear la Voz y el Proyecto
antes, porque Referentes se "enganchan" a ellos.)

Para crear una fila: entran a la tabla, botón **`+`** abajo de todo (o la fila vacía al final), y llenan
las columnas. Abajo, columna por columna, qué va en cada una.

### 5.1 `Voces` — para quién se selecciona

Una Voz = un personaje o marca para la que curan contenido (ej: "Cora", "30X institucional").

| Columna | Qué escriben |
|---|---|
| `nombre` | el nombre de la voz. Ej: "Cora" |
| `descripcion` | quién es / de qué tiene autoridad |
| `criterios_relevancia` | qué le sirve a este cliente puntual (opcional; afina el filtro por encima del tema del Proyecto) |
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
| `N` | **cuántos videos quieren de este tema por corrida** (ej: 20). Vacío = usa el global "Candidatos por corrida" (§5.5). Es POR proyecto: pueden pedir 20 de un tema y 10 de otro en la misma corrida |

> **N es un máximo, no una promesa.** Si el filtro solo encuentra 12 videos que de verdad pegan con el
> tema, llegan 12 — eso es el filtro trabajando, no un error. Si un proyecto entrega menos que su N
> semana tras semana, la palanca es **darle más fuentes** (Referentes, §5.3), no subir la N.

> **🔴 Regla de oro: un Proyecto activo necesita fuentes.** Un proyecto marcado `activo` pero **sin ningún
> Referente** ligado **no trae absolutamente nada** — es un proyecto muerto que solo ocupa lugar. Antes de
> activar un proyecto, asegúrense de que tenga **al menos una** cuenta en Referentes. (Pasó en la primera
> corrida real: un proyecto quedó activo sin fuentes y no produjo nada.)

> **Cambio de config:** `dias_recencia`, `top_n` y los checkboxes de canal **ya no viven en el Proyecto**.
> Ahora los días de búsqueda, cuántos videos por corrida y los resultados por cuenta son **globales** para
> todos los proyectos, en la **página Configuración Global** (§5.5).

> **Cómo escribir buenos `criterios_relevancia` (esto define la calidad de lo que llega).** Digan qué sirve
> y qué no, concreto:
> - ❌ Vago: *"videos de liderazgo"*.
> - ✅ Útil: *"Sirve: tácticas concretas de feedback, manejo de equipos, casos reales con un aprendizaje
>   accionable. No sirve: frases motivacionales sin sustancia, 'mindset' genérico, clickbait, o videos que
>   solo mencionan 'líder' de adorno."*
>
> Vale la pena que el jefe valide este texto por proyecto.

### 5.3 `Referentes` — las cuentas de Instagram y TikTok que se siguen

Cada fila es una cuenta de la que la máquina trae videos. **Es la fuente más importante y de mejor calidad**
(cuentas que ustedes eligieron a mano).

| Columna | Qué escriben |
|---|---|
| `handle` | la cuenta con **una sola** arroba. Ej: `@simonsinek` |
| `plataforma` | `instagram` o `tiktok` (lista) |
| `proyecto` | a qué Proyecto alimenta (lista). **Puede ser más de uno** (de la misma voz): la máquina garantiza que cada video llega UNA sola vez, al proyecto donde mejor pega |
| `notas` | por qué la agregaron (opcional) |
| `activo` | ✅ para rastrearla |

> **No llenen `seguidores` ni `viral_por_tamano`.** Esas las completa la máquina sola. El flag de viral solo
> **marca** las cuentas muy grandes (+700K); no las excluye.
>
> **La máquina califica sus cuentas.** Cada domingo actualiza tres columnas por cuenta (las llena sola):
> `tasa_gate` (qué fracción de sus videos pasa el filtro), `tasa_aprobacion` (qué fracción terminan
> aprobando) y `videos_evaluados`. Una vista **"A revisar"** junta las de números bajos. **La máquina
> nunca desactiva una cuenta sola** — solo la señala; podarla (destildar `activo`) es decisión de ustedes.
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

### 5.5 `Ajustes` y la página **Configuración Global** — las perillas

La máquina ya viene con valores por defecto razonables. **No hace falta tocar nada para arrancar.** Es una
tabla de "clave = valor" en español claro. Si borran o escriben mal una fila, la máquina usa el valor por
defecto, no se rompe.

Las perillas que sí van a querer tocar viven en la página **Configuración Global** (las mismas para todos
los proyectos):

**Volumen y ventana:**
- **Candidatos por corrida** — el valor **por defecto** de la `N` de cada proyecto: se usa para los
  proyectos que no tienen `N` propia (§5.2). Ya no es un total de la corrida.
- **Días de recencia** — qué tan atrás busca (ej: 7 para el día a día; más alto la primera vez o para un
  backfill).
- **Resultados por cuenta de referente** — cuántos videos baja por cada cuenta de Referentes (más = más costo).

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

El resto de las perillas (pesos de orden, bonus de idioma, mínimos) son **avanzadas** y viven en la página
**Ajustes Dev-Only**. **No las toquen sin avisarnos la primera vez.** Igual, todas tienen un tope de
seguridad para que nadie dispare el gasto sin querer.

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
| `sin_guion` | cuántos llegaron sin transcripción (⚠️ SIN GUION) — si sube, avisen |
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

### 8.1 El buscador de cuentas nuevas (Referentes propuestos)

Para que la lista de Referentes no se agote, hay un segundo robot que corre **los lunes a la mañana**
y les propone cuentas nuevas. Cómo las encuentra: toma sus referentes que **mejor están funcionando**
(los que más aprueban ustedes), busca cuentas **parecidas** en Instagram **y en TikTok**, filtra las
que ya conocen y las que no pegan con los temas, y les deja **hasta 10 por semana** en la tabla
**Referentes propuestos**.

Cada propuesta llega con todo para decidir sin salir de Airtable:

| Columna | Qué es |
|---|---|
| `handle` | la cuenta propuesta (con link en `url`) |
| `afinidad` | qué tan bien pega con el tema, de 0 a 1 (solo llegan las de 0.6 para arriba) |
| `razon` | **por qué** la propone, en español — léanla primero |
| `bio` / `seguidores` | contexto de la cuenta |
| `semillas` | cuáles de SUS referentes la "recomendaron" |
| **`estado`** | lo único que tocan ustedes |

**Su trabajo (una vez por semana, 5 minutos):** revisar las filas en `propuesto` y cambiar el
`estado`:
- **aprobado** — la quieren. **No hay que hacer nada más**: el lunes siguiente la máquina la crea
  sola en Referentes (activa, con la razón en las notas). Empieza a traer videos en esa misma corrida.
- **descartado** — no va. **Ojo: es definitivo** — esa cuenta no se les vuelve a proponer nunca
  (si se arrepienten, siempre pueden agregarla a mano en Referentes).

Apenas marcan una fila (aprobado o descartado), **desaparece de la lista**: la página muestra solo las
que están en `propuesto`, o sea lo que les falta revisar. No se borró, solo se fue de la bandeja.

Tres cosas para saber:
- **Propone Instagram y TikTok.** Para TikTok necesita que ya tengan **algunas cuentas de TikTok
  cargadas** en Referentes: de esas semillas saca las parecidas. Las primeras de TikTok las siembran
  ustedes a mano (§5.3); de ahí el buscador las multiplica solo. Sin ninguna cuenta de TikTok, ese eje
  no propone nada (no se rompe, solo no aporta).
- **No reemplaza su criterio.** Nada entra a Referentes sin que ustedes lo aprueben. Sigue valiendo
  agregar cuentas a mano cuando encuentren una buena.
- Mientras mejor califiquen los Candidatos durante la semana, mejores semillas usa el buscador →
  mejores propuestas les llegan. Todo se retroalimenta.

---

## 9. Lo que el sistema todavía NO hace (limitaciones conocidas)

Honestidad por adelantado, para que no se sorprendan:

- **La traducción es literal, no adaptada.** El script es el video tal cual, traducido al español. La
  adaptación a la voz/marca la hacen ustedes.
- **Los videos salen solo de sus Referentes.** Si la lista es floja, lo que llega es flojo. El
  buscador de cuentas nuevas (§8.1) ayuda a reponerla en Instagram y TikTok, pero solo propone: la
  decisión de qué cuenta entra sigue siendo de ustedes (y las primeras cuentas de TikTok las siembran
  ustedes a mano para que el buscador tenga de dónde partir).
- **A veces un video llega sin transcripción** (§5.4): mírenlo y decidan a mano. Esos llegan con el
  título marcado **⚠️ SIN GUION** en el feed.
- **El empujón por idioma es parejo para todos los idiomas no-español.** No premia más el inglés que el
  portugués: todos los no-español reciben el mismo empujón.
- **El orden es menos estable con poco volumen.** Con pocas corridas el heat score puede ser ruidoso; se
  afina a medida que entra más data y ustedes califican.

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

**Aprobé un video pero desapareció de la lista. ¿Se perdió?** No. Los aprobados se van al **Google Sheet
"Histórico"** cada domingo. Ahí quedan guardados y exportables. La lista de Candidatos se limpia sola para
no llenarse.

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

**Aprobé una cuenta en Referentes propuestos, ¿cuándo empieza a traer videos?** El lunes siguiente:
el buscador la crea en Referentes a la mañana y desde esa misma semana entra en las corridas. No
tienen que copiar nada a mano (§8.1).

**Descarté una cuenta propuesta y me arrepentí.** El buscador no la vuelve a proponer (descartar es
definitivo), pero pueden agregarla a mano en Referentes cuando quieran, como cualquier otra cuenta.

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
