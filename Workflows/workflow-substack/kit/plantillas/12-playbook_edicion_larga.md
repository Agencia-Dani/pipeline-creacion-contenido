# 12 — playbook_edicion_larga.md (Fase 11, Mensaje 20)

> La receta de producción de la edición larga. Adáptala a tu cadencia y pégala al bot para que la guarde como `playbook_edicion_larga.md`.

```markdown
PLAYBOOK DE PRODUCCIÓN — {{EDICION_LARGA_NOMBRE}}

PASO 1 — SELECCIÓN DE TEMA (editor, 10 min)
Cuando arranca el cron de la edición larga (o cuando se pide), mando
por Telegram los 3 mejores temas del banco ordenados por score, con:
- Título del artículo fuente
- La tensión del lector en 2 líneas
- Por qué es el momento esta semana
- Mi recomendación de cuál elegir y por qué
El editor responde con el número (1, 2 o 3).

PASO 2 — BRIEF EDITORIAL (inmediatamente, ~15 min)
Mando por Telegram:
TEMA: [título original]
TENSIÓN DE APERTURA: [emoción que el lector ya siente]
TESIS: [qué vamos a defender, basado en qué dato]
CASO REAL: [actor documentado que ilustra la tesis]
ACCIONABLE: [Nivel 3 o 4 — qué puede hacer el lector]
PREGUNTA DE CIERRE: [la que se lleva el lector]
FUENTES CONFIRMADAS: [lista verificada]
El editor aprueba o pide ajuste.

PASO 3 — RESEARCH PROFUNDO (agente, ~30 min)
Con el brief aprobado: profundizo en las fuentes, busco datos que
soporten la tesis, verifico los 6 criterios, construyo el anexo de
fuentes completo.

PASO 4 — BORRADOR COMPLETO (agente, ~45 min)
Estructura fija:
  {{ESTRUCTURA_EDICION_LARGA}}
Extensión: {{EDICION_LARGA_PALABRAS}} palabras.
El borrador queda DENTRO de la página en "Pipeline de Contenido".
Al final, anexo de fuentes (no se publica).

PASO 5 — CHECKLIST DE CALIDAD (agente)
Las 5 preguntas obligatorias:
- ¿Puede el lector encontrar esto en otro lado? → Si sí, agrego la capa única
- ¿Hay accionable Nivel 3 o 4? → Si no, reescribo
- ¿La apertura resuelve una tensión que el lector ya siente? → Si no, reescribo
- ¿Cada dato tiene fuente, contexto e implicación? → Si flota, lo completo o elimino
- ¿Le sirve a alguien con {{LECTOR_TIEMPO}} y {{LECTOR_CONTEXTO_TIPICO}}? → Si no, reescribo
Solo cuando las 5 son ✅ → marco "Listo para revisión" y aviso por Telegram.

PASO 6 — REVISIÓN (editor, máx. 20 min)
Lees el borrador en Notion. Editas directo o pides cambios por
Telegram. Cuando estás conforme → marcas "Aprobado".

PASO 7 — PUBLICACIÓN (editor, 5 min)
Copias el texto de Notion, pegas en {{PLATAFORMA}}, publicas.
({{PLATAFORMA}} no tiene API pública — paso manual no eliminable hoy.)
```
