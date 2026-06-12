# VARIABLES — rellenar UNA sola vez

> Esta es la **única fuente de verdad** del kit. Rellena cada valor y luego, en cada plantilla de `plantillas/`, haz busca-y-reemplaza de la `{{LLAVE}}` por el valor que pusiste aquí.
>
> Si no tienes claras las 3 primeras (tema, audiencia, hueco) — **para acá y vuelve cuando las tengas**. El bot puede refinarlas, no inventarlas (Fase 0 de la guía).

---

## 1. Núcleo editorial (Fase 0)

| Llave | Valor | Ejemplo (AI for Executives) |
|---|---|---|
| `{{NEWSLETTER_NOMBRE}}` |  | AI for Executives |
| `{{ORGANIZACION}}` |  | 30X (déjalo vacío si no aplica) |
| `{{TEMA_CENTRAL}}` |  | AI aplicada a decisiones ejecutivas en LATAM |
| `{{HUECO_REAL}}` |  | No existe AI rigurosa en español para ejecutivos LATAM — solo contenido técnico, generalista o en inglés |

## 2. Audiencia (Fases 2, 4, 6)

| Llave | Valor | Ejemplo |
|---|---|---|
| `{{AUDIENCIA_PRECISA}}` |  | CEO, COO, CFO o C-level de empresa mediana/grande en LATAM (500–5,000 empleados) |
| `{{LECTOR_RELACION_TEMA}}` |  | Usa ChatGPT, probó Claude, sabe que AI importa pero no tiene claridad de qué hacer |
| `{{LECTOR_PRESIONES}}` |  | Su board ya le pregunta qué hace con AI; compite sin saber si los demás implementan |
| `{{LECTOR_TIEMPO}}` |  | 15 minutos |
| `{{LECTOR_CONTEXTO_TIPICO}}` |  | un board meeting el viernes y dos iniciativas de AI que no dan resultados |
| `{{LECTOR_NO_ES}}` |  | desarrollador, académico, founder de startup de AI |

## 3. La pregunta filtro (Fase 9) — el corazón del scoring

| Llave | Valor | Ejemplo |
|---|---|---|
| `{{PREGUNTA_FILTRO}}` |  | ¿Le cambia algo a un CEO o CFO de empresa mediana en LATAM (500–5,000 empleados) esta semana? |

## 4. Operación (Fases 1, 3, 12)

| Llave | Valor | Ejemplo |
|---|---|---|
| `{{IDIOMA}}` |  | español |
| `{{PLATAFORMA}}` |  | Substack |
| `{{CADENCIA}}` |  | diario (research) + 1 edición larga/semana |
| `{{TIMEZONE}}` |  | America/Bogota |
| `{{CIUDAD}}` |  | Bogotá |
| `{{TU_NOMBRE}}` |  | Estefany |
| `{{NOMBRE_BOT}}` |  | Mini Estefany |

## 5. Edición larga (Fases 4, 11)

| Llave | Valor | Ejemplo |
|---|---|---|
| `{{EDICION_LARGA_NOMBRE}}` |  | Edición Profunda |
| `{{EDICION_LARGA_DIA}}` |  | lunes (cron day = 1) |
| `{{EDICION_LARGA_PALABRAS}}` |  | 1,000 a 1,500 |
| `{{ESTRUCTURA_EDICION_LARGA}}` |  | 1. La Tensión · 2. El Análisis · 3. El Caso Real · 4. Lo que deberías hacer · 5. Pregunta de cierre |

## 6. Pesos de scoring (Fase 9) — default recomendado, ajústalos si quieres

| Criterio | Llave | Default |
|---|---|---|
| Relevancia | `{{PESO_RELEVANCIA}}` | 30% |
| Calidad de fuente | `{{PESO_FUENTE}}` | 25% |
| Urgencia / Timing | `{{PESO_URGENCIA}}` | 20% |
| Accionabilidad | `{{PESO_ACCIONABILIDAD}}` | 15% |
| Unicidad | `{{PESO_UNICIDAD}}` | 10% |

> Los cortes de score son fijos en la guía y normalmente NO se tocan: 1–4 descarta · 5+ entra al banco · 9–10 dispara Nugget + alerta.

## 7. Valores (Fase 2) — qué SÍ y qué NO

```
VALORES (lo que me importa):
- {{VALOR_1}}        (ej: rigor extremo en fuentes)
- {{VALOR_2}}        (ej: respeto al tiempo del lector)
- {{VALOR_3}}        (ej: que no suene a otro newsletter de AI más)

NO-VALORES (lo que NO quiero):
- {{NO_VALOR_1}}     (ej: contenido genérico)
- {{NO_VALOR_2}}     (ej: alarmismo)
- {{NO_VALOR_3}}     (ej: tutorial básico)
```
