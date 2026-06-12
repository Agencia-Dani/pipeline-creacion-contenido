# ADR-005 — Hosting de n8n: managed self-hosted (fase 1) → VPS (fase 2)

- **Estado:** aceptada — 2026-06-11 (eleva a decisión del sistema lo investigado en
  [HOSTING.md](../../Workflows/workflow-short-form-content/HOSTING.md) del workflow de reels)
- **Contexto:** el workflow de reels (y los futuros workflows n8n: dispatcher, búsqueda bajo
  demanda, sync, alertas) necesita una instancia n8n corriendo 24/7. El workload es minúsculo:
  crons semanales/diarios, ~25 ítems por corrida, cuello de botella en APIs externas.
- **Decisión:** **fase 1 — n8n managed self-hosted (PikaPods o InstaPods, ~$3–4/mes)**:
  ejecuciones ilimitadas, persistencia incluida, cero administración de servidor. **Fase 2 —
  VPS Hetzner (~€4–5/mes) con Docker + PostgreSQL** cuando el número de clientes justifique
  administrar infra propia. Disparador de la fase 2: necesidad de control que el managed no da,
  o conveniencia de consolidar (p. ej. mover ahí Postgres y Metabase).
- **Alternativas descartadas:**
  - *n8n Cloud:* $24/mes mínimo con 2.500 ejecuciones — 6–8× más caro para el mismo resultado.
  - *Make / Zapier:* cobran por paso; nuestros workflows tienen muchos pasos → ~10× más caro y
    menos control sobre los prompts de Claude.
  - *Reescribir a script + cron:* ahorra centavos a cambio de tirar trabajo probado.
- **Consecuencias:** (+) operación cero en fase 1; (+) **el diseño del pipeline es idéntico en
  todas las opciones** — dónde vive n8n es intercambiable, migrar es exportar/importar workflows
  y re-mapear credenciales OAuth; (−) en fase 1 dependemos del proveedor managed para backups
  (mitigación: export periódico de workflows al repo, etapa F6); (−) la fase 2 agrega carga de
  mantenimiento real (Docker, Postgres, proxy, updates) que hay que presupuestar en tiempo.
