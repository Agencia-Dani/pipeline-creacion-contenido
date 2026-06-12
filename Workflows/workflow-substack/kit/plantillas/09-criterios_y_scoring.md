# 09 — criterios_y_scoring.md (Fase 9, Mensaje 16)

> El corazón del sistema: la pregunta filtro + el scoring con pesos. Pruébalo con 3 hipotéticos antes de seguir.

## Mensaje 16 — Definir el filtro y scoring

```
Ahora el filtro editorial — la pregunta que aplicas a cada pieza
que encuentras en el research.

LA PREGUNTA FILTRO:
"{{PREGUNTA_FILTRO}}"

Reglas:
- Si la respuesta es NO → descartas. No existe.
- Si la respuesta es SÍ → pasa al scoring.

SCORING — 5 criterios con pesos:

| Criterio          | Peso                  | Pregunta clave                          |
| ----------------- | --------------------- | --------------------------------------- |
| Relevancia        | {{PESO_RELEVANCIA}}   | ¿Le cambia algo concreto esta semana?   |
| Calidad de fuente | {{PESO_FUENTE}}       | ¿Tier 1 con dato verificable?           |
| Urgencia / Timing | {{PESO_URGENCIA}}     | ¿Pierde valor si espera 2 semanas?      |
| Accionabilidad    | {{PESO_ACCIONABILIDAD}}| ¿Hay algo que el lector puede hacer?   |
| Unicidad          | {{PESO_UNICIDAD}}     | ¿Se consigue fácilmente en otro lado?   |

REGLA DE CORTE:
- Score 1-4 → Descartado. NO entra a Notion.
- Score 5+ → Entra al banco.

TRADUCCIÓN DEL NÚMERO:
- 9-10 → Candidato directo a edición larga. No puede esperar.
        Manda Nugget + aviso por Telegram inmediato.
- 7-8 → Sólido pero no urgente. Buen material.
- 5-6 → Banco de reserva. Útil si otro tema falla.
- 1-4 → Descartar.

Guarda como criterios_y_scoring.md.

Pruébame el scoring con 3 hipotéticos:
- Una noticia recién publicada en [tu fuente de noticias Tier 1]
- Un análisis de [tu fuente de análisis Tier 1] de la semana
- Un post de LinkedIn de un [perfil de tu audiencia]

Por cada uno: aplica el filtro, asígnale score con razones, dime
qué hace cada uno.
```

> Los pesos default (30/25/20/15/10) y los cortes (1–4 / 5+ / 9–10) son los de la guía. Cambia los pesos en `VARIABLES.md` si tu prioridad editorial es distinta; los cortes normalmente se dejan fijos.
