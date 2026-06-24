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
| [ADR-009](./ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) | Scripts literales (transcribir/traducir) y aprendizaje en el scoring (revisa ADR-008) | Aceptada |
| [ADR-010](./ADR-010-scoring-semantico-y-etapa-calidad.md) | Scoring semántico con LLM + etapa CALIDAD (revisa ADR-009) | Aceptada |
| [ADR-011](./ADR-011-tabla-ajustes-knobs-no-code.md) | Tabla `Ajustes`: knobs del scoring editables por el equipo sin código | Aceptada |
| [ADR-012](./ADR-012-senal-de-aprendizaje-bi-eje.md) | Señal de aprendizaje bi-eje (por referente Y por keyword/tema) | Dormante (inerte, preservada por ADR-015) |
| [ADR-013](./ADR-013-atribucion-multiproyecto-fan-out.md) | Atribución multi-proyecto: fan-out de un video a cada proyecto que lo reclama (grado 1, MVP) | Aceptada (fan-out solo por referente mientras el eje keyword esté off — ADR-015) |
| [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md) | `outputs` = histórico canónico; lo escribe solo el archivado (el motor reporta solo `runs`) | Aceptada |
| [ADR-015](./ADR-015-busqueda-solo-referente-retiro-keywords.md) | Búsqueda solo por referente; eje TikTok-keyword dormante por flag (IG-keyword retirado) | Aceptada |
| [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md) | Knobs de ejecución globales (top_n, recencia, resultados por referente) + tope de costo | Aceptada |

**Cuándo escribir un ADR nuevo:** cada vez que una decisión costaría caro revertir (stack, motor,
store, modelo de datos, límites de servicio). Copiá el formato de cualquiera de estos archivos.
