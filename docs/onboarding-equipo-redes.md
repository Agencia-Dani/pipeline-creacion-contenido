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
5. Califican (ver punto 5).
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
seguidores, engagement) y el **heat score** (ver punto 6).

**Lo único que llenan ustedes** en cada fila: la **calificación**, el **estado** y, si quieren,
**notas del equipo**.

---

## 5. Cómo califican: las dos columnas que importan

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

## 6. El heat score, en cristiano

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

## 7. Cómo encuentra los videos (y cómo pedir más de algo)

Instagram y TikTok funcionan distinto, y esto es importante para cuando quieran ajustar:

- **Instagram → por cuenta.** Trae los reels de las cuentas que estén en **Referentes**. Si quieren
  más o mejor Instagram: **agreguen Referentes de Instagram.**
- **TikTok → por hashtag.** Busca con las palabras de **Keywords** (cada una es un hashtag). Si
  quieren más o mejor TikTok: **agreguen o afinen Keywords.** Conviene cargarlas como hashtags de
  **una sola palabra** (`liderazgo` funciona mejor que `liderazgo efectivo`).

Resumen: **TikTok se maneja con Keywords, Instagram se maneja con Referentes.**

---

## 8. Lo que el sistema todavía NO hace (limitaciones conocidas)

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

## 9. Lo que necesitamos / lo que podría cambiar

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
