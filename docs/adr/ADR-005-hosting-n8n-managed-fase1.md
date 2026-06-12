# ADR-005 — Hosting de n8n: managed self-hosted (fase 1) → VPS (fase 2)

- **Estado:** aceptada — 2026-06-11 (investigación de hosting hecha ese día; este ADR es ahora
  el dueño único de esa decisión — el doc HOSTING.md original se absorbió acá)
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
- **Notas operativas (de la investigación 2026-06-11):**
  - *Fase 1:* confirmar **persistencia/storage** del pod al crearlo (un contenedor con SQLite
    efímero pierde data al redeployar). InstaPods elegido sobre PikaPods (PLAN §3.2): da SSH y
    terminal web, útil para debug.
  - *Fase 2 (VPS Hetzner, cuando escale):* CX22/CAX11 ~€4–5/mes, Docker Compose con
    **PostgreSQL** (Redis/workers solo si hace falta paralelizar — improbable a este volumen),
    reverse proxy con HTTPS, backups automáticos de la DB y del volumen, plan de update de la
    imagen de n8n. Disparador: decenas de clientes o necesidad de control que el managed no da.
