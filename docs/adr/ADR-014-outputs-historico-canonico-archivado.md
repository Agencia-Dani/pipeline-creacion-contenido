# ADR-014 — `outputs` de Supabase = histórico canónico, lo escribe solo el archivado

- **Estado:** aceptada — 2026-06-23 (decisión de Mani, plan a producción cierre 15). Reencuadra la
  deuda #20 y ajusta el contrato [ingesta-registro](../../core/contracts/ingesta-registro.md).
- **Contexto:** dos workflows tocaban la tabla `outputs` de Supabase. El **motor de reels** escribía
  una fila `estado: draft` por candidato al entregarlos a Airtable (nodos *Preparar outputs Supabase*
  + *Reportar outputs al registro*); el **archivado** escribe la fila definitiva cuando el equipo
  califica y selecciona. Las vistas del histórico filtran `calificado_en not null`, así que el Sheet
  y el dashboard **solo ven las del archivado**. Las filas `draft` del motor nunca se cierran (un
  candidato puede no ser elegido nunca) → `outputs` crudo acumula basura `draft` que ninguna vista
  consume y que ensucia cualquier conteo directo sobre la tabla. La doble semántica de `external_id`
  (draft del motor vs. final del archivado) además complicaba la idempotencia.
- **Decisión:**
  1. **El motor deja de escribir filas por-item a `outputs`.** Se quitan los 2 nodos
     (*Preparar outputs Supabase*, *Reportar outputs al registro*). El tracking por corrida sigue
     vivo en `runs.metricas` (colectados/asignados/pretrim/filtrados/gate/**outputs**); la métrica
     `outputs` de *Cerrar run* se reapunta a `$('Armar candidato').all().length` (candidatos
     entregados en la corrida).
  2. **`outputs` = solo filas del archivado = histórico canónico.** Es lo que el Sheet Histórico
     espeja 1:1 y lo que el dashboard lee. Sin `draft` huérfanos: cada fila es una pieza que el
     equipo realmente seleccionó.
  3. **Cableado:** `Armar candidato` queda con una sola rama de salida hacia Airtable
     (`Preparar batch Airtable`) y conecta directo a *Cerrar run en el registro*. Como ya no media
     el nodo que colapsaba los N candidatos a 1 item, *Cerrar run* lleva `executeOnce: true` para
     cerrar el run una sola vez (el PATCH usa referencias `$('…')`, no el item de entrada).
- **Alternativas descartadas:**
  - *Mantener los `draft` pero en tabla/estado aparte:* preserva la traza por-candidato del motor,
    pero suma esquema en `core/` y otra superficie que reconciliar, para una señal que hoy nadie
    consume. Si más adelante se quiere medir "candidatos ofrecidos vs. seleccionados", `runs.metricas`
    ya guarda el agregado por corrida; el grano por-item se reabre acá si hace falta.
  - *Cerrar el `draft` al calificar (motor escribe, archivado hace UPDATE):* mantiene los 2 nodos del
    motor y acopla los dos workflows por `external_id`; el fan-out (ADR-013) repite `external_id`
    entre proyectos y vuelve frágil ese match. Más complejo que no escribir.
- **Consecuencias:**
  - (+) `outputs` es un histórico limpio y auditable; conteos directos sobre la tabla son fiables.
  - (+) El motor es más simple (2 nodos menos) y deja de pelear con la idempotencia de `outputs`.
  - (+) El Sheet se alimenta del histórico canónico sin filtrar `draft`.
  - (−) Se pierde el rastro por-candidato de lo **ofrecido** (lo que el motor mandó a Airtable pero
    no se eligió). Mitigado: `runs.metricas.outputs` guarda el conteo por corrida; Airtable
    `Candidatos` conserva los no calificados hasta que el equipo los purga.
  - (−) `outputs.estado` deja de usar `draft` en la práctica (todas las filas nacen calificadas desde
    el archivado). El campo se conserva por compatibilidad del esquema; sin migración.
- **Toca `core/`:** [`core/contracts/ingesta-registro.md`](../../core/contracts/ingesta-registro.md)
  (nota: un workflow puede reportar solo `runs` y delegar `outputs` a otro). No hay migración SQL: el
  esquema de `outputs` no cambia, cambia **quién** lo escribe. Motor: 35 nodos (antes 37).
