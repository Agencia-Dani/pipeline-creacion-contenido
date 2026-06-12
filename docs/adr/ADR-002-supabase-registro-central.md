# ADR-002 — Supabase (Postgres) como registro central de corridas y outputs

- **Estado:** aceptada — 2026-06-11
- **Contexto:** la razón de unificar el pipeline es tener una base persistente con los outputs de
  cada corrida de cada workflow, que habilite dashboards, reportes y queries. Hoy los outputs
  viven desconectados (Google Sheets para reels, Notion para newsletter).
- **Decisión:** el registro central vive en **Supabase (Postgres, free tier)** con el modelo
  `clients · workflows · instances · runs · outputs` ([PLAN.md §2.2](../../PLAN.md), SQL
  versionado en `core/schema/`). Regla de resiliencia: el registro es **sumidero adicional,
  nunca dependencia de ejecución** — cada workflow escribe primero a su destino nativo; si
  Supabase está caído, los workflows siguen produciendo y el sync reconcilia después.
- **Alternativas descartadas:**
  - *Notion como DB central:* UI amigable gratis, pero queries y dashboards muy limitados, rate
    limits de API y fragilidad como fuente de verdad al crecer.
  - *Google Sheets central:* lo más simple, pero sin schema, con límites de filas y fácil de
    romper a mano. No es una base de datos.
  - *SQLite en el repo / en el contenedor de n8n:* multi-writer imposible y se pierde en redeploys.
- **Consecuencias:** (+) SQL real, API REST lista (los nodos HTTP de n8n escriben directo),
  dashboards estándar (Looker/Metabase) conectan sin trabajo; (+) $0 al volumen actual;
  (−) una cuenta/servicio más que administrar; (−) el free tier pausa proyectos tras ~7 días
  sin actividad — la actividad semanal real debería evitarlo; si molesta: Pro ($25/mes) o
  Postgres en el VPS de la fase 2 de hosting (la migración es un `pg_dump`, no un rediseño).
