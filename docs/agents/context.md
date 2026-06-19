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
embudo. Un mismo video puede aparecer en más de un proyecto solo cuando comparten el referente o la
keyword que lo trajo, y solo si pasa el juicio de relevancia de cada uno (ADR-013).

**Voz**:
El personaje o marca para quien se cura contenido. Organiza la selección y el histórico; en el MVP
no genera guiones (scripts literales — ADR-009).

**Referente**:
Una cuenta de Instagram o TikTok de la que el motor trae videos. La fuente propia de la búsqueda.

**Keyword**:
Una palabra de búsqueda que funciona como hashtag de TikTok. Acumula por proyecto.

**Candidato**:
Un video ya transcrito y traducido al español, esperando que el equipo lo califique en Airtable.
La unidad que el equipo cura es la dupla **(video, proyecto)**: un mismo video relevante para dos
proyectos es dos candidatos, cada uno con su voz, su heat-score y su juicio de relevancia (ADR-013).

**Heat-score**:
El número con que el motor ordena los candidatos de caliente a frío. Combina la relevancia/calidad
del contenido (juicio semántico contra los criterios del Proyecto) con su desempeño objetivo
(views/likes/engagement, percentil dentro de la corrida) y la señal de selección histórica.

**Relevancia tópica**:
Qué tan genuinamente el video trata la temática del Proyecto, más allá de que mencione la keyword o
use el hashtag de adorno. Garantizarla es trabajo de la máquina.

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
