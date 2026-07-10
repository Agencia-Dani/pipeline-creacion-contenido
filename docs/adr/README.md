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
| [ADR-012](./ADR-012-senal-de-aprendizaje-bi-eje.md) | Señal de aprendizaje bi-eje (por referente Y por keyword/tema) | Aceptada (reducida por ADR-019: queda solo la señal por referente) |
| [ADR-013](./ADR-013-atribucion-multiproyecto-fan-out.md) | Atribución multi-proyecto: fan-out de un video a cada proyecto que lo reclama (grado 1, MVP) | Aceptada (solo por referente desde ADR-019; emisión deduplicada por ADR-018) |
| [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md) | `outputs` = histórico canónico; lo escribe solo el archivado (el motor reporta solo `runs`) | Aceptada |
| [ADR-015](./ADR-015-busqueda-solo-referente-retiro-keywords.md) | Búsqueda solo por referente; eje TikTok-keyword dormante por flag (IG-keyword retirado) | Aceptada (cerrada por ADR-019: el eje keyword se remueve del todo) |
| [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md) | Knobs de ejecución globales (top_n, recencia, resultados por referente) + tope de costo | Aceptada (extendida por ADR-017: piso por cuenta) |
| [ADR-017](./ADR-017-reactivar-keyword-tiktok-y-toggles-de-eje.md) | Reactivar eje keyword TikTok como toggle + 3 toggles de eje + knob/cap por keyword + piso por cuenta | Aceptada (revertida por ADR-019 en lo keyword; toggles de referente y piso quedan) |
| [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md) | Un Candidato por video: dedup de salida del fan-out (gana la copia con mejor relevancia) | Aceptada (enmienda ADR-013) |
| [ADR-019](./ADR-019-remocion-total-eje-keyword.md) | Remoción total del eje keyword: el motor descubre solo por referentes (enmienda ADR-015, revierte ADR-017, reduce ADR-012) | Aceptada |
| [ADR-020](./ADR-020-motor-descubrimiento-referentes.md) | Motor de descubrimiento de referentes: sugeridos de IG + vetting Haiku + aprobación del equipo (workflow aparte; completa ADR-019) | Aceptada |

**Cuándo escribir un ADR nuevo:** cada vez que una decisión costaría caro revertir (stack, motor,
store, modelo de datos, límites de servicio). Copiá el formato de cualquiera de estos archivos.
