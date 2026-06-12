# ADR-004 — Interfaz del jefe: dashboard solo-lectura + resumen push (Notion diferido)

- **Estado:** aceptada — 2026-06-11
- **Contexto:** el usuario final es el jefe de la agencia, no técnico. Necesita ver outputs
  listos para usar y el estado del sistema, y pedir contenido — sin poder romper nada y sin
  entender la máquina por dentro. La prioridad expresada: "simple por ahora".
- **Decisión:** la interfaz del jefe se compone de: (1) **dashboard web solo-lectura** sobre el
  registro central (Looker Studio o Metabase — spike en F4 decide cuál, ADR-006bis futuro);
  (2) **resumen periódico push** por email/Telegram; (3) **formulario de búsqueda bajo demanda**
  (n8n Form Trigger) para pedir contenido filtrado. **Notion curado queda diferido**: solo se
  construye si dashboard + resumen se quedan cortos.
- **Alternativas descartadas:**
  - *Web app / UI custom:* mantenimiento permanente sin ganancia frente a herramientas existentes.
  - *Notion como interfaz obligatoria:* requiere sync bidireccional y curaduría continua; se
    mantiene como opción futura, no como base.
  - *Solo Sheets "mejoradas":* no consolida los outputs de todos los workflows en una vista.
- **Consecuencias:** (+) cero código de UI propio; (+) imposible de romper (solo lectura) —
  cumple el no-negociable; (−) la personalización del dashboard está limitada por la herramienta
  elegida; (−) la relevancia depende de definir bien la taxonomía de outputs — por eso esa
  definición es decisión abierta que se valida con el jefe (PLAN.md §3.2) antes de cerrar F1/F4.
