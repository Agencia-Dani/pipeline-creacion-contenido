# ADR-001 — Motores heterogéneos, contrato común

- **Estado:** aceptada — 2026-06-11
- **Contexto:** el sistema arranca con dos workflows de formas opuestas a propósito: una máquina
  autónoma (n8n, cron semanal, sin humano) y un procedimiento con humano en el loop (bot OpenClaw
  conversacional vía Telegram). El README del repo los define como la prueba de fuego de la base
  común. Había que decidir si unificar el motor de ejecución o no.
- **Decisión:** **no se unifican los motores.** Cada workflow corre donde mejor funciona (n8n,
  OpenClaw, mañana scripts u otros). Lo que se estandariza es el **contrato**: cómo se describe
  (`workflow.yaml` + etapas canónicas), cómo se configura (`clients/`) y cómo reporta (registro
  central). El sistema unifica datos y descripción, no ejecución.
- **Alternativas descartadas:**
  - *Migrar todo a n8n:* el workflow de Substack es co-creación conversacional con aprobaciones
    humanas — no se traduce a nodos sin perder su valor. Reescribir trabajo probado sin ganancia.
  - *Reescribir todo como agents/scripts en un VPS:* tirar dos implementaciones funcionando para
    ganar uniformidad estética; más mantenimiento, no menos.
- **Consecuencias:** (+) los workflows existentes entran tal cual y nunca dejan de funcionar;
  (+) cualquier motor futuro entra con solo cumplir el contrato; (−) hay que mantener un
  adaptador de ingesta por motor (push HTTP para n8n, sync para Notion/OpenClaw); (−) la
  experiencia de "editar un workflow" no es uniforme entre motores.
