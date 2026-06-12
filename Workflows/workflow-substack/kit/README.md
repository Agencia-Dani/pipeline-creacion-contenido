# Kit replicable — OpenClaw Newsletter

> Plantillas listas para clonar y montar el sistema editorial de la [Master Guía](../master-guia.md) en **cualquier empresa**, para **cualquier tema/audiencia**, sin escribir código.

Este kit es el **compañero operativo** de la guía. La guía explica el *porqué* de cada fase; este kit te da los *documentos rellenables* que pegas al bot. No reemplaza la guía — la ejecuta más rápido.

---

## Cómo se usa (flujo de 3 pasos)

1. **Rellena [`VARIABLES.md`](./VARIABLES.md) una sola vez.** Es la única fuente de verdad: nombre del newsletter, audiencia, tema, hueco, cadencia, timezone, pesos de scoring. Todo lo demás referencia estas variables con `{{LLAVES}}`.
2. **Recorre [`CHECKLIST-25-MENSAJES.md`](./CHECKLIST-25-MENSAJES.md).** Es el runbook: te dice, mensaje por mensaje, qué plantilla pegar al bot y en qué orden.
3. **Por cada paso, abre la plantilla de [`plantillas/`](./plantillas/), reemplaza las `{{LLAVES}}` con tus valores de `VARIABLES.md`, y pégala al bot de Telegram.** El bot guarda cada artefacto en su workspace con el mismo nombre.

> Las fases 2–6 (brief, benchmark, guía editorial, crítica, master prompt) son co-creación: la plantilla te da el mensaje + el esqueleto donde capturas lo que el bot produce. Las fases 7–14 son ejecución más mecánica.

---

## Qué hay en el kit

```
kit/
├── README.md                       ← este archivo
├── VARIABLES.md                    ← rellenar UNA vez (fuente de verdad)
├── CHECKLIST-25-MENSAJES.md        ← runbook de arranque
├── notion/
│   └── ESQUEMA-DBS.md              ← las 2 databases de Notion, columna por columna
└── plantillas/                     ← los 16 artefactos del workspace, parametrizados
    ├── 00-identidad_editorial.md
    ├── 01-whisper_config.md
    ├── 02-project_brief.md
    ├── 03-benchmark.md
    ├── 04-guia_editorial.md
    ├── 05-master_prompt.md
    ├── 06-fuentes_candidatas.md
    ├── 07-reporte_acceso.md
    ├── 08-fuentes_validadas.md
    ├── 09-criterios_y_scoring.md
    ├── 10-notion_config.md          ← NUNCA commitees el token real
    ├── 11-playbook_research.md
    ├── 12-playbook_edicion_larga.md
    ├── 13-playbook_nuggets.md
    ├── 14-crons_activos.md
    └── 15-log_revision_semanal.md
```

---

## Convención de variables

Las plantillas usan dobles llaves: `{{NEWSLETTER_NOMBRE}}`, `{{AUDIENCIA_PRECISA}}`, etc.

Para rellenar una plantilla, busca-y-reemplaza cada `{{LLAVE}}` con su valor de `VARIABLES.md`. Si una llave no aplica a tu newsletter, bórrala o déjala vacía — el bot te preguntará si falta algo crítico.

Los corchetes simples `[así]` son **decisiones que tomas en el momento** (no variables globales): el bot te las pedirá durante la conversación.

---

## Seguridad

- **`10-notion_config.md` contiene un placeholder de token, no un token real.** Tu `NOTION_TOKEN` se le pasa al bot por Telegram, nunca se commitea. Si clonas este repo para tu empresa, mantén el token fuera de git (déjalo solo en el workspace del bot).
- Lo mismo aplica a cualquier credencial de fuentes (FT, Exponential View, etc.) en `08-fuentes_validadas.md`.

---

## Cómo hacerlo "un clic" para cada empresa

En GitHub, **Settings → General → Template repository → ✅**. Eso activa el botón verde **"Use this template"**: cada empresa obtiene su propia copia limpia del repo (guía + kit) para rellenar, sin forkear ni arrastrar tu historial. La guía viaja con la copia como referencia.

---

## Tiempo estimado

~8 horas de conversación con el bot distribuidas en 1–2 días, igual que la guía. El kit ahorra el tiempo de redactar los documentos desde cero — ya están escritos, solo los parametrizas.
