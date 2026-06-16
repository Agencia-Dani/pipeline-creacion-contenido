# Pipeline de Creación de Contenido — Context

El dominio: detección y curación de videos de referentes (Reels/TikTok) para el equipo de redes.
Este glosario fija el lenguaje ubicuo del MVP de reels.

Este archivo es **un glosario y nada más** — el lenguaje ubicuo del proyecto. Sin detalles de
implementación, specs ni decisiones (esas van en [docs/adr/](../adr/)). Definiciones de una o dos
frases: qué **es** un término, no qué hace. Solo términos propios del dominio.

`/grill-with-docs` lo va llenando a medida que los términos se resuelven en cada alineación.

## Language

**Proyecto**:
Una temática aislada de búsqueda (ej: Comunicación, Ventas). Los resultados no se cruzan entre
proyectos.

**Voz**:
El personaje o marca para quien se cura contenido. Organiza la selección y el histórico; en el MVP
no genera guiones (scripts literales — ADR-009).

**Referente**:
Una cuenta de Instagram o TikTok de la que el motor trae videos. La fuente propia de la búsqueda.

**Keyword**:
Una palabra de búsqueda que funciona como hashtag de TikTok. Acumula por proyecto.

**Candidato**:
Un video ya transcrito y traducido al español, esperando que el equipo lo califique en Airtable.
La unidad que el equipo cura.

**Heat-score**:
El número con que el motor ordena los candidatos de caliente a frío. Pondera views/likes/engagement
(percentil dentro de la corrida) por boosts de tema, idioma y señal de selección histórica.

**flag_viral**:
La marca de una cuenta muy grande (~700K+ seguidores). Marca "high-end", **no** excluye ni altera
el heat-score (ADR-009).

**Script literal**:
El texto de un candidato: la transcripción del video tal cual, traducida al español solo si el
original no lo está. Sin reescritura ni adaptación a voz (ADR-009).
