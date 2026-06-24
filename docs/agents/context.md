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
El personaje o marca para quien se cura contenido. Organiza la selección y el histórico, y **afina el
filtro de relevancia por encima del tema del Proyecto** (el Proyecto es la base, la Voz el enfoque del
cliente — ADR-010). En el MVP no genera guiones (scripts literales — ADR-009).

**Referente**:
Una cuenta de Instagram o TikTok de la que el motor trae videos. **La fuente de descubrimiento activa**
(ADR-015): hoy el motor solo busca por las cuentas de referente sembradas por el equipo.

**Keyword**:
Una palabra/frase de búsqueda que funciona como hashtag de TikTok. **Eje dormante** (ADR-015): la tabla
se conserva pero el motor no la usa mientras el flag `buscar_keyword_tiktok` esté off. El IG-keyword se
retiró (no servía).

**Candidato**:
Un video ya transcrito y traducido al español, esperando que el equipo lo califique en Airtable.
La unidad que el equipo cura es la dupla **(video, proyecto)**: un mismo video relevante para dos
proyectos es dos candidatos, cada uno con su voz, su heat-score y su juicio de relevancia (ADR-013).

**Heat-score**:
El número con que el motor ordena los candidatos de caliente a frío. Combina la relevancia/calidad
del contenido (juicio semántico contra los criterios del Proyecto ⊕ la Voz) con su desempeño objetivo
(views/likes/engagement, percentil dentro de la corrida) y la señal de selección histórica **por
referente** (el eje por keyword/tema quedó dormante — ADR-015).

**Relevancia tópica**:
Qué tan genuinamente el video trata la temática del Proyecto, más allá de que use ganchos o etiquetas
de adorno. Garantizarla es trabajo de la máquina.

**Utilidad**:
Qué tanto aporta el contenido del video en sí, frente a lo viral-vacío (gancho sin sustancia).

**Criterios de relevancia**:
Las reglas, editables por el equipo en Airtable, contra las que el motor juzga si un video sirve
para un Proyecto (y opcionalmente una Voz). Alimentan la evaluación semántica.

**flag_viral**:
La marca de una cuenta muy grande (~700K+ seguidores). Marca "high-end", **no** excluye ni altera
el heat-score (ADR-009).

**Script literal**:
El texto de un candidato: la transcripción del video tal cual, traducida al español solo si el
original no lo está. Sin reescritura ni adaptación a voz (ADR-009).

**Estado**:
El campo canónico de "decidido" de un Candidato: **nuevo → aprobado | descartado** (binario tras
calificar; ya no existe "publicado"). Es lo que el archivado levanta (`NOT nuevo`) y lo que alimenta
el aprendizaje (`aprobado` = seleccionado; `descartado` = clase negativa).

**Calificación**:
El emoji 🔥/👍/👎 que el equipo le pone a un Candidato. Cue visual para curar y ordenar; **no**
alimenta el aprendizaje (eso lo hace el Estado). Distinto del Estado a propósito.
