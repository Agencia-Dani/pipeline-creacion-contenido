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

Hay 6 tablas. Piénsenlas en dos grupos.

### Las que casi no tocan (la configuración de la búsqueda)

- **Proyectos** — cada tema que se busca (ej: "Comunicación", "Ventas"). Adentro se define cuántos
  videos traer, qué tan atrás buscar y por dónde buscar.
- **Voces** — para quién se selecciona (un personaje o marca). Sirve para organizar y agrupar.
- **Keywords** — las palabras/hashtags con que se busca por tema (en Instagram **y** TikTok).
- **Referentes** — las **cuentas** (de Instagram **y** TikTok) que se siguen. De ahí salen sus videos.
- **Ajustes** — las "perillas" de cómo la máquina ordena (cuánto pesa cada métrica, etc.). **Ya vienen
  con valores razonables; no hace falta tocarlas.** Más en 5.6.

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
| `criterios_relevancia` | qué le sirve a este cliente puntual (opcional; afina el filtro de relevancia por encima del tema del Proyecto) |

### 5.2 `Proyectos` — el tema que se busca

Un Proyecto = un tema aislado (ej: "Comunicación", "Ventas"). Los resultados de un proyecto no se
mezclan con los de otro.

| Columna | Qué escriben |
|---|---|
| `nombre` | el tema. Ej: "Comunicación" |
| `descripcion` | qué cubre el tema |
| `criterios_relevancia` | **qué hace relevante a un video para este tema, y qué NO.** Es el campo más importante: la máquina lo lee para juzgar si un video sirve de verdad o es viral-vacío. Mientras más concreto, menos basura les llega (ver ejemplo abajo) |
| `voz_default` | la Voz que crearon en 5.1 (se elige de una lista) |
| `dias_recencia` | qué tan atrás buscar, en días. **30 a 90** la primera vez (para traer harto); **7** para el día a día |
| `top_n` | cuántos videos quieren que traiga por corrida (ej: 15 a 25) |
| `activo` | ✅ marcado para que el proyecto entre en las búsquedas. Sin marcar = pausado |
| `Buscar en Instagram por cuentas` · `… por palabras clave` · `Buscar en TikTok por cuentas` · `… por palabras clave` | los 4 **canales de búsqueda** del proyecto (checkboxes). Si **no marcan ninguno**, se usan los 4. Marquen solo los que quieran para acotar (y no gastar de más) |

> **Cómo escribir buenos `criterios_relevancia` (esto define la calidad de lo que les llega).** Digan
> qué sirve y qué no, concreto:
> - ❌ Vago: *"videos de liderazgo"*.
> - ✅ Útil: *"Sirve: tácticas concretas de feedback, manejo de equipos, casos reales con un
>   aprendizaje accionable. No sirve: frases motivacionales sin sustancia, 'mindset' genérico,
>   clickbait, o videos que solo mencionan 'líder' de adorno."*
>
> Vale la pena que el jefe valide este texto por proyecto.

### 5.3 `Keywords` — las palabras/hashtags con que se busca por tema

Cada palabra funciona como un hashtag (en TikTok **y** en Instagram). **Una sola palabra por fila**
(`liderazgo` rinde más que `liderazgo efectivo`).

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
> **Carguen cuentas de las dos plataformas:** la máquina ahora sigue cuentas tanto de Instagram como
> de TikTok. Hoy solo hay cargadas de Instagram, así que **hacen falta las de TikTok.**

### 5.5 `Candidatos` — NO se llena a mano

Esta es la bandeja que llena la máquina. Ustedes solo califican (sección 6). Aun así, conviene
saber qué significa cada columna que van a ver:

| Columna | Qué significa | Quién la llena |
|---|---|---|
| `titulo` | título/contexto del video fuente | máquina |
| `script` | la transcripción del video en español (literal, ver sección 8) | máquina |
| `idioma` | idioma del original: es / en / pt / it / fr / otro | máquina |
| `thumbnail` | la portada del video (para escanear sin abrir el link) | máquina |
| `url_referente` | link al video original | máquina |
| `referente` | la cuenta de donde salió | máquina |
| `views` `likes` `seguidores` `engagement` | métricas del video fuente | máquina |
| `heat_score` | el número de orden caliente→frío (sección 7) | máquina |
| `relevancia_score` | qué tan relevante lo juzgó la máquina (0 a 1), aparte de lo viral | máquina |
| `relevancia_razon` | **por qué** la máquina lo dejó pasar — léanlo para curar más rápido | máquina |
| `viral_por_tamano` | ✅ si venía de una cuenta muy grande (+700K) | máquina |
| **`calificacion`** | 🔥 / 👍 / 👎 | **ustedes** |
| **`estado`** | nuevo / aprobado / descartado / publicado | **ustedes** |
| `notas_equipo` | su feedback sobre el video | **ustedes** (opcional) |
| `fecha_calificacion` | cuándo lo calificaron | se llena sola |
| `fecha` | cuándo lo generó la máquina | máquina |

### 5.6 `Ajustes` — las perillas de cómo ordena (casi nunca se toca)

La máquina ya viene con valores por defecto razonables acá. **No hace falta tocar nada para arrancar.**
Es una tabla de "clave = valor" en español claro (ej: "Peso de relevancia", "Candidatos por proyecto",
"Bonus idioma extranjero"). Si en algún momento quieren cambiar cómo ordena o cuánto premia algo,
**avísennos la primera vez** para no descalibrarla. Tranquilas: si borran o escriben mal una fila, la
máquina usa el valor por defecto, no se rompe.

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

La máquina busca por **dos vías, en las dos plataformas** (Instagram y TikTok):

- **Por cuenta** — trae los videos de las cuentas que estén en **Referentes**. Si quieren más o mejor
  cobertura por cuenta: **agreguen Referentes** (de Instagram y/o TikTok).
- **Por palabra/hashtag** — busca con las de **Keywords**. Si quieren más o mejor cobertura por tema:
  **agreguen o afinen Keywords.** Cárguenlas como hashtags de **una sola palabra** (`liderazgo` rinde
  más que `liderazgo efectivo`).

Cada proyecto elige qué vías usar con los 4 checkboxes (ver 5.2). Si no marcan ninguno, usa las cuatro.

Resumen: **Referentes = búsqueda por cuenta · Keywords = búsqueda por tema · las dos corren en IG y TikTok.**

---

## 9. Lo que el sistema todavía NO hace (limitaciones conocidas)

Honestidad por adelantado, para que no se sorprendan:

- **El empujón por idioma es parejo para todos los idiomas no-español.** No premia más el inglés que
  el portugués, por ejemplo: todos los no-español reciben el mismo empujón.
- **La traducción es literal, no adaptada.** El script es el video tal cual, traducido. La adaptación
  a la voz/marca la hacen ustedes.
- **El orden es menos estable con poco volumen.** Con pocas corridas el heat score puede ser ruidoso;
  se afina a medida que entra más data y ustedes califican.

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
