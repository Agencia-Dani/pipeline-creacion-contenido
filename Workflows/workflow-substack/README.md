# Master Guía — OpenClaw Newsletter

> Cómo configurar un agente de [OpenClaw](https://openclaw.com) para que produzca un newsletter editorial con cadencia, research curado, scoring automático y escritura — desde Telegram, sin código.

Guía completa de **14 fases** que cubre todo el ciclo de vida — desde la decisión inicial hasta el cron corriendo en producción — basada en una implementación real que estuvo activa entre marzo y abril de 2026 produciendo el Substack *AI for Executives*.

---

## 📄 La guía

**[`Master-Guia-OpenClaw-Newsletter.pdf`](./Master-Guia-OpenClaw-Newsletter.pdf)** — 60 páginas, formato profesional con cover, tabla de contenidos, code blocks, tablas. Bájalo y léelo directo.

Si prefieres editarlo o forkearlo: el documento fuente está en [`master-guia.md`](./master-guia.md).

---

## 🧰 El kit replicable

**[`kit/`](./kit/)** — plantillas listas para clonar y montar el sistema en **cualquier empresa**, sin escribir código. Si la guía es el *porqué*, el kit es el *qué pegar al bot*:

1. Rellena **[`kit/VARIABLES.md`](./kit/VARIABLES.md)** una sola vez (nombre, audiencia, tema, hueco, cadencia, timezone, pesos de scoring).
2. Sigue **[`kit/CHECKLIST-25-MENSAJES.md`](./kit/CHECKLIST-25-MENSAJES.md)** — el runbook que te dice, mensaje por mensaje, qué plantilla pegar.
3. Cada plantilla en **[`kit/plantillas/`](./kit/plantillas/)** es uno de los 16 artefactos del workspace, parametrizado con `{{LLAVES}}`.

> Tip: en GitHub, marca el repo como **Template repository** (Settings → General) para que cada empresa lo clone con un clic via "Use this template".

---

## ⚡ Para qué sirve

Después de aplicar la guía tendrás un sistema autónomo que:

- 🕕 **Corre un cron diario a las 6am** en N fuentes que tú validaste
- 🔍 **Filtra cada hallazgo** contra una pregunta editorial específica de tu audiencia
- 📊 **Asigna un score 1–10** con pesos (relevancia, calidad de fuente, urgencia, accionabilidad, unicidad)
- 🗂️ **Escribe a Notion** solo lo que pasa el filtro (score 5+)
- 🥇 **Recomienda los mejores temas del día** con un top 3 + explicación
- 📝 **Genera un brief editorial** cuando eliges un tema
- ✍️ **Produce el borrador completo** dentro de la página de Notion
- 🚨 **Manda nuggets** (alertas cortas) cuando hay algo urgente (score 9-10)

Tu tiempo: ~30 minutos por edición. El del agente: el resto.

---

## 🧭 Las 14 fases

| Fase | Tiempo | Artefacto |
|---|---|---|
| 0 — Pre-decisión | 30 min | Claridad mínima + accesos listos |
| 1 — Setup técnico | 10 min | Identidad editorial + Whisper local + Notion |
| 2 — Brief inicial | 45 min | Co-creación con preguntas del bot |
| 3 — Benchmark de referentes | 90 min | Top 10 newsletters de tu espacio, decisiones de qué adoptar y qué evitar |
| 4 — Guía editorial | 150 min | La "constitución" del newsletter (10 partes) |
| 5 — Crítica del bot | 30 min | Huecos detectados y cerrados |
| 6 — Master Prompt | 60 min | Las 4 fases del prompt operativo |
| 7 — Fuentes candidatas | 60 min | Mapeo Tier 1/2/3 |
| 8 — Verificación de acceso | 90 min | Workarounds para fuentes bloqueadas |
| 9 — Filtro + scoring | 30 min | Pregunta editorial + rubrica con pesos |
| 10 — Notion setup | 30 min | 2 databases (Banco de Research + Pipeline) |
| 11 — Playbooks | 90 min | Research / Edición / Nuggets |
| 12 — Crons | 30 min | Diario + semanal + validación obligatoria de timezone |
| 13 — Test end-to-end | 60 min | Dry run antes de activar |
| 14 — Loop semanal | recurrente | Mejora continua |

**Tiempo total**: ~8 horas de conversación con el bot, distribuidas en 1–2 días.

---

## 🛠️ Qué necesitas antes de empezar

- Una cuenta de [OpenClaw](https://openclaw.com) (bot personal en Telegram)
- Una página de [Notion](https://notion.so) compartida con un integration token
- Una cuenta de Substack (o cualquier otra plataforma — la publicación final es manual de cualquier forma porque Substack no tiene API pública)
- Claridad mínima sobre 3 cosas: tema, audiencia y qué hueco real llena tu newsletter

**No necesitas**: API keys de Groq, OpenAI, Deepgram — la guía te enseña a forzar la instalación local de Whisper en el servidor del bot.

---

## 🔄 Cómo regenerar el PDF

Si editas el `master-guia.md` y quieres regenerar el PDF:

```bash
# Dependencias del sistema (una vez)
brew install pango gdk-pixbuf libffi

# Dependencias Python (una vez)
pip3 install --user markdown weasyprint pygments

# Generar PDF
python3 make_pdf.py
```

En macOS puede necesitar:
```bash
DYLD_LIBRARY_PATH=/opt/homebrew/lib python3 make_pdf.py
```

El script descubre solo su ubicación — no hay que editar rutas.

---

## 🧪 Sobre el caso de uso real

La guía está construida a partir de la configuración real del Substack *AI for Executives* (publicación editorial de [30X](https://30x.com)) que estuvo corriendo entre el 25 de marzo y el 29 de abril de 2026. Algunos ejemplos y outputs son verbatim de esa implementación — los menciono explícitamente como ejemplos, no como reglas. Adapta cada parte a tu propio newsletter.

---

## 📜 Licencia

MIT — Úsalo, fórkealo, modifícalo, mejóralo. Si te sirve, una estrella ⭐ ayuda a otros a encontrarlo.

---

## 🤝 Contribuciones

Si encuentras errores, casos no cubiertos o mejoras al patrón:

- Issues: cuéntame qué se quedó corto o no funcionó
- PRs: bienvenidos, especialmente sobre fases que sientas que se pueden hacer más sólidas

Si replicas el sistema para otro tema/audiencia y tienes hallazgos diferentes, abre un issue — la guía mejora con casos reales.
