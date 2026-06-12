# Runbook — los 25 mensajes mínimos

> La secuencia exacta para montar el sistema. Cada fila te dice qué plantilla pegar al bot. Marca `[x]` a medida que avanzas. Antes de arrancar: rellena [`VARIABLES.md`](./VARIABLES.md).

> **Por qué el orden importa.** Si saltas las fases 2–6 (brief, benchmark, guía editorial, crítica, master prompt), el bot termina escribiendo como cualquier otro agente de AI. Esas 5 fases son la diferencia entre excelente y genérico. Las 7–14 son ejecución técnica.

---

## Fase 1 — Setup técnico (10 min)

- [ ] **Msg 1** — `/start`
- [ ] **Msg 2** — Identidad y rol editorial → plantilla [`00-identidad_editorial.md`](./plantillas/00-identidad_editorial.md)
- [ ] **Msg 3** — Forzar instalación de Whisper local → plantilla [`01-whisper_config.md`](./plantillas/01-whisper_config.md) · valida con un audio de prueba
- [ ] **Msg 4** — `NOTION_TOKEN` + URL HQ → plantilla [`10-notion_config.md`](./plantillas/10-notion_config.md)

## Fase 2 — Brief + co-creación (45 min)

- [ ] **Msg 5** — Brief crudo + pedido de preguntas → plantilla [`02-project_brief.md`](./plantillas/02-project_brief.md)
      *Verifica que el bot te haga las preguntas difíciles, no las obvias.*

## Fase 3 — Benchmark (90 min)

- [ ] **Msg 6** — Deep research de referentes → plantilla [`03-benchmark.md`](./plantillas/03-benchmark.md) (sección "Mensaje 6")
- [ ] **Msg 7** — Decisiones del benchmark (adoptar / no hacer / diferenciar) → misma plantilla (sección "Mensaje 7"), sube a V1.1

## Fase 4 — Guía editorial / la constitución (150 min)

- [ ] **Msg 8** — Co-crear las 10 partes, parte por parte → plantilla [`04-guia_editorial.md`](./plantillas/04-guia_editorial.md)
      *La fase más importante. No la apures.*

## Fase 5 — Crítica del bot (30 min)

- [ ] **Msg 9** — Pedir crítica honesta (mín. 3–5 huecos) → sección "Crítica" en [`04-guia_editorial.md`](./plantillas/04-guia_editorial.md)
- [ ] **Msg 10** — Cerrar huecos seleccionados → sube guía a V1.1 con changelog

## Fase 6 — Master Prompt (60 min)

- [ ] **Msg 11** — Derivar Master Prompt + pegar las 4 fases → plantilla [`05-master_prompt.md`](./plantillas/05-master_prompt.md)
      *Pega fase por fase; el bot confirma cada una con "Tatuado 🔒".*

## Fase 7 — Fuentes candidatas (60 min)

- [ ] **Msg 12** — Deep research de fuentes (apunta a 15–20) → plantilla [`06-fuentes_candidatas.md`](./plantillas/06-fuentes_candidatas.md)

## Fase 8 — Verificación de acceso (90 min) ⭐

- [ ] **Msg 13** — Reporte de acceso real (✅/⚠️/❌) → plantilla [`07-reporte_acceso.md`](./plantillas/07-reporte_acceso.md)
- [ ] **Msg 14** — Resolver bloqueos uno por uno (suscribir / PDF / credenciales / respaldo / descartar)
- [ ] **Msg 15** — Consolidar lista final → plantilla [`08-fuentes_validadas.md`](./plantillas/08-fuentes_validadas.md)
      *No saltes esta fase: es la razón #1 por la que los sistemas fallan en la semana 2.*

## Fase 9 — Filtro + scoring (30 min)

- [ ] **Msg 16** — Definir filtro + scoring + probar con 3 hipotéticos → plantilla [`09-criterios_y_scoring.md`](./plantillas/09-criterios_y_scoring.md)

## Fase 10 — Notion (30 min)

- [ ] **Msg 17** — Crear DB "Banco de Research" → [`notion/ESQUEMA-DBS.md`](./notion/ESQUEMA-DBS.md)
- [ ] **Msg 18** — Crear DB "Pipeline de Contenido" → mismo esquema · guarda IDs en [`10-notion_config.md`](./plantillas/10-notion_config.md)

## Fase 11 — Playbooks (90 min)

- [ ] **Msg 19** — Playbook Research → plantilla [`11-playbook_research.md`](./plantillas/11-playbook_research.md)
- [ ] **Msg 20** — Playbook Edición Larga → plantilla [`12-playbook_edicion_larga.md`](./plantillas/12-playbook_edicion_larga.md)
- [ ] **Msg 21** — Playbook Nuggets → plantilla [`13-playbook_nuggets.md`](./plantillas/13-playbook_nuggets.md)

## Fase 12 — Crons + validación TZ (30 min, CRÍTICA)

- [ ] **Msg 22** — Cron diario + **validación obligatoria de zona horaria** → plantilla [`14-crons_activos.md`](./plantillas/14-crons_activos.md)
- [ ] **Msg 23** — Cron de arranque de edición larga (opcional)
      *Trampa real: `0 6 * * *` se interpreta en la TZ configurada. 6am Bogotá = `0 6 * * * @ America/Bogota` = 11 UTC. No al revés.*

## Fase 13 — Test end-to-end (60 min)

- [ ] **Msg 24** — Dry run completo del cron diario *(nunca actives sin dry run)*
- [ ] **Msg 25** — Activar (o arreglar y volver)

## Fase 14 — Loop semanal (recurrente)

- [ ] **Cada lunes** — Revisión semanal → plantilla [`15-log_revision_semanal.md`](./plantillas/15-log_revision_semanal.md)
