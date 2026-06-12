# ADRs — Decisiones estructurales del sistema

> Una decisión por archivo. El valor está en el **porqué** y en las **alternativas descartadas** —
> lo que nadie puede reconstruir solo en 3 meses. Formato corto, sin ceremonia. Tabla-resumen en
> [PLAN.md §3.1](../../PLAN.md).

| # | Decisión | Estado |
|---|---|---|
| [ADR-001](./ADR-001-motores-heterogeneos-contrato-comun.md) | Motores heterogéneos, contrato común | Aceptada |
| [ADR-002](./ADR-002-supabase-registro-central.md) | Supabase (Postgres) como registro central | Aceptada |
| [ADR-003](./ADR-003-multicliente-desde-dia-1.md) | Multi-cliente desde el día 1 | Aceptada |
| [ADR-004](./ADR-004-interfaz-jefe-dashboard-y-push.md) | Interfaz del jefe: dashboard + resumen push | Aceptada |
| [ADR-005](./ADR-005-hosting-n8n-managed-fase1.md) | Hosting n8n: managed fase 1, VPS fase 2 | Aceptada |
| [ADR-006](./ADR-006-plano-de-datos-sin-workflow-padre.md) | Pipeline central como plano de datos (sin workflow padre) | Aceptada |
| [ADR-007](./ADR-007-convergencia-gradual-motor-unico.md) | Convergencia gradual a motor de research único | Aceptada (como dirección) |
| [ADR-008](./ADR-008-airtable-cockpit-equipo-redes.md) | Airtable como cockpit del equipo de redes (revisa D4) | Aceptada |

**Cuándo escribir un ADR nuevo:** cada vez que una decisión costaría caro revertir (stack, motor,
store, modelo de datos, límites de servicio). Copiá el formato de cualquiera de estos archivos.
