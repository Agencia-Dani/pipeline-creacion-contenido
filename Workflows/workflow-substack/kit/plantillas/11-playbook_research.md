# 11 — playbook_research.md (Fase 11, Mensaje 19)

> La receta que el bot ejecuta en el cron diario. Pégala al bot para que la guarde como `playbook_research.md`.

```markdown
FLUJO DE TRABAJO — Research Diario

CUÁNDO
Todos los días a las 6:00am ({{TIMEZONE}}). Cron job automático.

PASO 1 — RECORRIDO DE FUENTES
Entro a cada fuente de fuentes_validadas.md en orden y busco solo
contenido nuevo desde ayer:
- Fuentes de noticias → últimas 24h estricto
- Fuentes de análisis → última semana
- Fuentes de producto → cada vez que publican
- Analistas independientes → cuando publican
- Fuentes regionales → cuando publican reportes nuevos
Si una fuente está bloqueada → marco ⚠️ y sigo. No reintento sin avisar.

PASO 2 — FILTRO EDITORIAL
Por cada artículo: "{{PREGUNTA_FILTRO}}"
- NO → descarto. No existe.
- SÍ → paso al scoring.

PASO 3 — SCORING
| Criterio          | Peso                  |
| ----------------- | --------------------- |
| Relevancia        | {{PESO_RELEVANCIA}}   |
| Calidad de fuente | {{PESO_FUENTE}}       |
| Urgencia / Timing | {{PESO_URGENCIA}}     |
| Accionabilidad    | {{PESO_ACCIONABILIDAD}}|
| Unicidad          | {{PESO_UNICIDAD}}     |
Regla de corte: 1-4 descarto · 5+ entra al banco.

PASO 4 — ENTRADA AL BANCO (Notion)
Todo score 5+ entra a "Banco de Research":
1. Título (con fuente + hora)  2. Score (5-10)  3. Fuente
4. Tipo de contenido  5. Formato sugerido
6. Resumen ejecutivo (2-3 líneas)  7. Estado: Nuevo

PASO 5 — NUGGET CHECK + AVISOS
- Score 9-10 → genero borrador de Nugget Y aviso por Telegram
  inmediato con el tema y por qué no puede esperar
- Score 5-8 → silencio. Ya está en Notion.
Si el día tiene Research + Nugget + arranque de Post:
PRIMERO Nugget, DESPUÉS borrador.

PASO 6 — CONFIRMACIÓN POR TELEGRAM
Mando un único mensaje con:

✅ RESEARCH DIARIO — [fecha]

Checklist de fuentes visitadas:
[lista con ✅ si OK, ⚠️ si bloqueada]

Hallazgos subidos a Notion (score 5+):
[lista ordenada por score con emoji: 🔴 9-10, 🟠 8, 🟡 6-7, 🟢 5]

Total: X entradas en banco • Y descartadas • Z alertas urgentes
```
