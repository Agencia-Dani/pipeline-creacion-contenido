# Onboarding equipo de redes — cómo usar el sistema de reels

> Guía para Majo y Jero. Pensada para empezar a usar el sistema sin saber nada de cómo está
> hecho por dentro. Si algo no se entiende o falta, anotalo al final (sección "Lo que necesitamos").

---

## 1. Qué es esto y para qué sirve

Hay una máquina que trabaja para ustedes. Cada cierto tiempo sale a Instagram y TikTok, encuentra
videos de referentes sobre los temas que les interesan, los **transcribe y traduce al español**, los
ordena de **más prometedor a menos**, y se los deja servidos en una lista.

El trabajo de ustedes no es buscar ni escribir. Es **decidir**: entrar a la lista, leer, y marcar
cuáles sirven. La máquina **aprende** de lo que eligen y va mejorando lo que les trae.

En una frase: **la máquina encuentra y ordena; ustedes eligen y adaptan.**

---

## 2. Las únicas dos herramientas que tocan

| Herramienta | Para qué | Qué hacen ahí |
|---|---|---|
| **Airtable** | El tablero de trabajo | Leen los videos y los califican. Es donde viven el 95% del tiempo. |
| **Google Sheet "Histórico"** | El archivo de lo ya elegido | Solo lo consultan/descargan. No escriben ahí. |

Todo lo demás (los robots, las bases de datos por detrás) es **sala de máquinas**. No necesitan
entrar nunca. Si alguien menciona "n8n", "Supabase" o "el cron", es plomería interna, no es asunto
del equipo de redes.

---

## 3. La rutina (lo que hacen cada día o cada semana)

1. La máquina corre sola y deja videos nuevos en Airtable.
2. Entran a Airtable, a la tabla **Candidatos**.
3. Cada fila es un video ya transcrito y traducido al español, con su métrica y su link al original.
4. Leen el texto, miran el video original si quieren, y **deciden**.
5. Califican (ver punto 6).
6. Lo que aprueban queda guardado en el Histórico automáticamente y sale de la lista. Lo que no
   tocaron sigue esperando.

Regla mental: **Airtable es su bandeja de entrada.** La máquina la llena, ustedes la vacían
decidiendo. Lo que califican desaparece de pendientes y queda archivado.

---

## 4. Airtable por dentro: las tablas

Hay 5 tablas. Piénsenlas en dos grupos.

### Las que casi no tocan (la configuración de la búsqueda)

- **Proyectos** — cada tema que se busca (ej: "Comunicación", "Ventas"). Adentro se define cuántos
  videos traer y qué tan atrás buscar.
- **Voces** — para quién se selecciona (un personaje o marca). Sirve para organizar y agrupar.
- **Keywords** — las palabras con que se busca en **TikTok**. Cada palabra funciona como un hashtag.
- **Referentes** — las **cuentas de Instagram** que se siguen. De ahí salen los reels de IG.

> Estas las arman una vez y las van ajustando. **No hace falta tocarlas para el trabajo del día.**

### La que usan todos los días

- **Candidatos** — los videos que llegaron, esperando que ustedes los califiquen. Acá viven.

En cada candidato la máquina ya les dejó lleno: el **título**, el **script** (la transcripción en
español), el **idioma original**, el **link al video original**, las **métricas** (views, likes,
seguidores, engagement) y el **heat score** (ver punto 7).

**Lo único que llenan ustedes** en cada fila: la **calificación**, el **estado** y, si quieren,
**notas del equipo**.

---

## 5. Configuración inicial: cómo llenar cada tabla la primera vez

Esto se hace **una sola vez** al arrancar (y cada vez que quieran sumar un tema o una cuenta nueva).
**Candidatos no se toca acá** — esa la llena la máquina. Las que arman ustedes son las otras cuatro.

**Orden recomendado:** Voces → Proyectos → Keywords y Referentes. (Hay que crear la Voz y el
Proyecto antes, porque las otras tablas se "enganchan" a ellos.)

Para crear una fila en cualquier tabla en Airtable: entran a la tabla, botón **`+`** abajo de todo
(o la fila vacía al final), y llenan las columnas. Abajo, columna por columna, qué va en cada una.

### 5.1 `Voces` — para quién se selecciona

Una Voz = un personaje o marca para la que curan contenido (ej: "Cora", "30X institucional").

| Columna | Qué escriben |
|---|---|
| `nombre` | el nombre de la voz. Ej: "Cora" |
| `descripcion` | quién es / de qué tiene autoridad |
| `pais_acento` | el país, ej: "Colombia" |

> **Lo demás déjenlo vacío.** Las columnas `frase_credencial`, `few_shot`, `cta`, `tratamiento`
> y `registro` son para una mejora futura (que la máquina escriba guiones en la voz del personaje).
> **Hoy no se usan.** No las borren ni se preocupen por ellas.

### 5.2 `Proyectos` — el tema que se busca

Un Proyecto = un tema aislado (ej: "Comunicación", "Ventas"). Los resultados de un proyecto no se
mezclan con los de otro.

| Columna | Qué escriben |
|---|---|
| `nombre` | el tema. Ej: "Comunicación" |
| `descripcion` | qué cubre el tema |
| `voz_default` | la Voz que crearon en 5.1 (se elige de una lista) |
| `dias_recencia` | qué tan atrás buscar, en días. **180** la primera vez (para traer harto); **1 o 2** para el día a día |
| `top_n` | cuántos videos quieren que traiga por corrida (ej: 10) |
| `min_likes` / `min_views` | pisos *blandos*: no descartan videos, solo empujan hacia arriba a los que los superan. Si dudan, déjenlos en 0 |
| `activo` | ✅ marcado para que el proyecto entre en las búsquedas. Sin marcar = pausado |

### 5.3 `Keywords` — las palabras con que se busca en TikTok

Cada palabra funciona como un hashtag de TikTok. **Una sola palabra por fila** (`liderazgo` rinde
más que `liderazgo efectivo`).

| Columna | Qué escriben |
|---|---|
| `termino` | la palabra. Ej: "liderazgo" |
| `proyecto` | a qué Proyecto pertenece (se elige de la lista) |
| `activo` | ✅ para usarla; sin marcar para guardarla sin que se use |

### 5.4 `Referentes` — las cuentas de Instagram (y TikTok) que se siguen

Cada fila es una cuenta de la que la máquina trae videos.

| Columna | Qué escriben |
|---|---|
| `handle` | la cuenta con arroba. Ej: "@simonsinek" |
| `plataforma` | `instagram` o `tiktok` (lista) |
| `proyecto` | a qué Proyecto alimenta (lista) |
| `notas` | por qué la agregaron (opcional) |
| `activo` | ✅ para rastrearla |

> **No llenen `seguidores` ni `flag_viral`.** Esas las completa la máquina sola cuando visita la
> cuenta. `flag_viral` solo **marca** las cuentas muy grandes (+700K); no las excluye.
> **Ojo (pendiente):** en TikTok seguir una cuenta puntual todavía no funciona del todo — TikTok
> hoy se maneja sobre todo por Keywords (ver sección 8). Para Referentes, prioricen Instagram.

### 5.5 `Candidatos` — NO se llena a mano

Esta es la bandeja que llena la máquina. Ustedes solo califican (sección 6). Aun así, conviene
saber qué significa cada columna que van a ver:

| Columna | Qué significa | Quién la llena |
|---|---|---|
| `titulo` | título/contexto del video fuente | máquina |
| `script` | la transcripción del video en español (literal, ver sección 8) | máquina |
| `idioma` | idioma del original: es / en / pt / it / fr / otro | máquina |
| `link_doc` | el Google Doc con el script | máquina |
| `url_referente` | link al video original | máquina |
| `referente` | la cuenta de donde salió | máquina |
| `views` `likes` `seguidores` `engagement` | métricas del video fuente | máquina |
| `heat_score` | el número de orden caliente→frío (sección 7) | máquina |
| `viral_por_tamano` | ✅ si venía de una cuenta muy grande (+700K) | máquina |
| `categoria` | tipo de contenido: Tutorial / Caso de uso / Noticia / Tip / Reflexion | máquina |
| **`calificacion`** | 🔥 / 👍 / 👎 | **ustedes** |
| **`estado`** | nuevo / aprobado / descartado / publicado | **ustedes** |
| `notas_equipo` | su feedback sobre el video | **ustedes** (opcional) |
| `fecha_calificacion` | cuándo lo calificaron | se llena sola |
| `fecha` | cuándo lo generó la máquina | máquina |

---

## 6. Cómo califican: las dos columnas que importan

Hay dos cosas que marcan, y son distintas:

### `calificacion` — su opinión rápida
- 🔥 = excelente, hay que usarlo
- 👍 = sirve
- 👎 = no sirve

### `estado` — la decisión de flujo
- **nuevo** — recién llegó, nadie lo miró (viene así por defecto)
- **aprobado** — lo eligen. Esto es lo que cuenta como "seleccionado".
- **descartado** — lo miraron y no va
- **publicado** — ya se convirtió en contenido y salió (opcional, para llevar la cuenta)

### La vista "🔥 Seleccionados"
Es una pantalla aparte que muestra **solo los que pusieron en `aprobado`**, ordenados del más
caliente al más frío. **Es solo para ver**, no califican ahí. Funciona así: ustedes aprueban en la
lista normal de Candidatos → automáticamente aparecen en esta vista. Es su "mapa de calor" de lo
elegido, y se rearma solo.

---

## 7. El heat score, en cristiano

Es un número que la máquina le pone a cada video para ordenarlos: **los de arriba son los más
prometedores**, según vistas, likes, engagement y qué tan parecidos son a lo que ustedes ya eligieron
antes.

Tres cosas que conviene saber:

1. **No es una nota sobre 10.** El número solo sirve para **ordenar**. No piensen "¿0.8 es bueno?",
   piensen "¿está arriba o abajo en la lista?".
2. **Es relativo a cada tanda.** Se compara cada video contra los otros de la misma corrida, no
   contra un ideal fijo.
3. **Aprende de ustedes.** Cuando aprueban videos de cierta cuenta o cierto idioma, la máquina
   empieza a traer más parecido y a ponerlo más arriba. **Calificar bien hoy mejora lo que les llega
   mañana.** Por eso vale la pena calificar incluso lo que descartan.

El sistema le da un **empujón extra** al contenido en otros idiomas (inglés, portugués, etc.), porque
la prioridad del negocio es traer lo que **no** circula en español.

---

## 8. Cómo encuentra los videos (y cómo pedir más de algo)

Instagram y TikTok funcionan distinto, y esto es importante para cuando quieran ajustar:

- **Instagram → por cuenta.** Trae los reels de las cuentas que estén en **Referentes**. Si quieren
  más o mejor Instagram: **agreguen Referentes de Instagram.**
- **TikTok → por hashtag.** Busca con las palabras de **Keywords** (cada una es un hashtag). Si
  quieren más o mejor TikTok: **agreguen o afinen Keywords.** Conviene cargarlas como hashtags de
  **una sola palabra** (`liderazgo` funciona mejor que `liderazgo efectivo`).

Resumen: **TikTok se maneja con Keywords, Instagram se maneja con Referentes.**

---

## 9. Lo que el sistema todavía NO hace (limitaciones conocidas)

Honestidad por adelantado, para que no se sorprendan:

- **En TikTok no se pueden seguir cuentas específicas, solo hashtags.** Si quieren seguir a una
  cuenta puntual de TikTok, hoy no se puede (está en la lista de mejoras).
- **En Instagram solo llega lo de las cuentas que ya siguen.** El sistema no "descubre" cuentas
  nuevas de IG por tema; trae lo de los Referentes que carguen.
- **El empujón por idioma es parejo para todos los idiomas no-español.** No premia más el inglés que
  el portugués, por ejemplo. Y reconoce español, inglés, portugués, italiano y francés; otros
  idiomas (alemán, japonés…) no los detecta todavía.
- **La traducción es literal, no adaptada.** El script es el video tal cual, traducido. La adaptación
  a la voz/marca la hacen ustedes.

Ninguna de estas rompe el uso diario. Son cosas en la lista para mejorar más adelante.

---

## 10. Lo que necesitamos / lo que podría cambiar

> Espacio para el equipo. Anoten acá lo que les falta, lo que les confunde, o lo que cambiarían.
> Esto es lo que prioriza el equipo técnico para las próximas mejoras.

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
