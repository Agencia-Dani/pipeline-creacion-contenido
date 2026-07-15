# Pipeline de Creación de Contenido — Context

El dominio: detección y curación de videos de referentes (Reels/TikTok) para el equipo de redes.
Este glosario fija el lenguaje ubicuo del MVP de reels.

Este archivo es **un glosario y nada más** — el lenguaje ubicuo del proyecto. Sin detalles de
implementación, specs ni decisiones (esas van en [docs/adr/](../adr/)). Definiciones de una o dos
frases: qué **es** un término, no qué hace. Solo términos propios del dominio.

`/grill-with-docs` lo va llenando a medida que los términos se resuelven en cada alineación.

## Language

**Proyecto**:
Una temática aislada de búsqueda (ej: Comunicación, Ventas). Cada proyecto rankea y cura su propio
embudo. Un mismo video puede aparecer en más de un proyecto solo cuando **comparten el referente** que
lo trajo, y solo si pasa el juicio de relevancia de cada uno (ADR-013, ADR-015). Un Proyecto tiene
**una sola Voz**; una Voz puede servir a varios Proyectos.

**Voz**:
El personaje o marca para quien se cura contenido. Organiza la selección y el histórico, y le da al
gate el **contexto de persona/audiencia** (quién es, a quién le habla) — **no un criterio de filtro**:
el que discrimina el tema es el Proyecto (revisión de ADR-010, 2026-07-14). En el MVP no genera
guiones (scripts literales — ADR-009).

**Referente**:
Una cuenta de Instagram o TikTok de la que el motor trae videos. **La única fuente de descubrimiento**
(ADR-019): el motor solo busca por las cuentas de referente sembradas por el equipo — a mano o
promovidas desde los Referentes propuestos (ADR-020).

**Referente propuesto**:
Una cuenta candidata a Referente que el **workflow de descubrimiento** (ADR-020) propone cada semana a
partir de las **semillas** (los referentes activos que mejor convierten según la señal de selección):
en Instagram los sugeridos del propio IG (`relatedProfiles`), en TikTok los lookalikes del actor
dataovercoffee (ADR-020 §8, rama paralela). Veteados con Haiku contra los criterios del proyecto. Vive en
la tabla `Referentes propuestos`; el equipo la marca aprobado/descartado y los aprobados se promueven
solos a `Referentes`. Un handle propuesto no se re-propone (descartar es definitivo).

**Keyword**:
Término **retirado del dominio** (ADR-019). Era una palabra/frase de búsqueda (hashtag de TikTok) para
descubrimiento ciego; el eje se removió por completo y su reemplazo es el motor de descubrimiento de
referentes (ADR-020).

**Candidato**:
Un video ya transcrito y traducido al español, esperando que el equipo lo califique en Airtable.
La unidad que el equipo cura es la dupla **(video, proyecto)**: un mismo video relevante para dos
proyectos es dos candidatos, cada uno con su voz, su heat-score y su juicio de relevancia (ADR-013).

**Heat-score**:
El número con que el motor ordena los candidatos de caliente a frío. Combina la relevancia/calidad
del contenido (juicio semántico contra los criterios del Proyecto ⊕ la Voz) con su desempeño objetivo
(views/likes/engagement, percentil dentro de la corrida) y la señal de selección histórica **por
referente** (única señal de aprendizaje — ADR-019).

**Relevancia tópica**:
Qué tan genuinamente el video trata la temática del Proyecto, más allá de que use ganchos o etiquetas
de adorno. Garantizarla es trabajo de la máquina.

**Utilidad**:
Qué tanto aporta el contenido del video en sí, frente a lo viral-vacío (gancho sin sustancia).

**Criterios de relevancia**:
Las reglas, editables por el equipo en Airtable, contra las que el motor juzga si un video sirve
para un **Proyecto**. Alimentan la evaluación semántica. Un buen criterio dice qué sirve, qué NO
sirve, y trae ejemplos reales; si no permite rechazar nada, es una descripción, no un criterio. La
Voz no aporta criterio sino **contexto de persona** (revisión de ADR-010, 2026-07-14).

**Criterios aprendidos**:
El complemento que la máquina destila cada semana de las decisiones reales del equipo (patrones de lo
aprobado y lo descartado, con ejemplos). Complementan los criterios de relevancia manuales, nunca los
reemplazan; el equipo los ve y puede editarlos o borrarlos (ADR-022). La misma destilación deja una
**advertencia de criterios** (lint de forma: criterio vago / sin lista negativa / Voz incoherente),
visible al equipo pero que el gate no lee.

**Salud por referente**:
Tres números que el archivado escribe por cuenta cada semana — `tasa_gate` (qué fracción de sus videos
pasó el gate), `tasa_aprobacion` (qué fracción terminó aprobando el equipo) y `videos_evaluados` — con
mínimo de muestra. Señalan qué fuente **podar**; la poda siempre la ejecuta el equipo (ADR-022).

**Descarte del gate**:
Un video que el juicio de relevancia rechazó después de transcribirlo. **No es un Candidato** (nunca
esperó calificación). Los de score intermedio se exponen al equipo para auditoría; uno que el equipo
marca "era bueno" es un **falso negativo** y alimenta la revisión de criterios (ADR-021).

**Precisión de entrega**:
La métrica norte de calidad: de lo que el equipo calificó en la semana, qué fracción aprobó. Mide si
lo que llega de verdad sirve (ADR-021).

**Separación del gate**:
Cuánto distingue el juicio de la máquina lo que el equipo aprueba de lo que descarta (distancia entre
los scores medios de ambos grupos). Separación baja en un proyecto = sus criterios no discriminan
(ADR-021).

**flag_viral**:
La marca de una cuenta muy grande (~700K+ seguidores). Marca "high-end", **no** excluye ni altera
el heat-score (ADR-009).

**Script literal**:
El texto de un candidato: la transcripción del video tal cual, traducida al español solo si el
original no lo está. Sin reescritura ni adaptación a voz (ADR-009).

**Corrida**:
Una ejecución del motor. Dos modos que **coexisten**: el **cron semanal** (autónomo, barre los
proyectos activos — el norte "corre sola" de ROADMAP §1) y la **corrida on-demand** (el equipo
prende los proyectos que quiere, fija la `N` de cada uno, y dispara con un botón que corre
**todos los proyectos activos** — la selección se expresa con los toggles, no con un payload).
El on-demand se suma; no retira al cron (decisión 2026-07-15). Cada corrida deja rastro en
`runs`/`outputs`.

**Estado**:
El campo canónico de "decidido" de un Candidato: **nuevo → aprobado | descartado** (binario tras
calificar; ya no existe "publicado"). Es lo que el archivado levanta (`NOT nuevo`) y lo que alimenta
el aprendizaje (`aprobado` = seleccionado; `descartado` = clase negativa).

**Calificación**:
El emoji 🔥/👍/👎 que el equipo le pone a un Candidato. Cue visual para curar y ordenar. **No**
alimenta la señal de selección (eso lo hace el Estado), pero el 🔥 **sí** prioriza qué aprobados se
usan como ejemplos al destilar los criterios aprendidos (ADR-022). Distinto del Estado a propósito.
