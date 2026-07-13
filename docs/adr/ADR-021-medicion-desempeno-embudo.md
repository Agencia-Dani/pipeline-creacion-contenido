# ADR-021 — Medición de desempeño del embudo: tabla Métricas + descartes del gate visibles

- **Estado:** aceptada — 2026-07-10 (grilling de mejoras de relevancia con Mani).
  Complementa [ADR-010](./ADR-010-scoring-semantico-y-etapa-calidad.md) (el scoring semántico gana
  su instrumento de medición) y [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md) (la
  división motor-reporta-`runs` / archivado-escribe-histórico se respeta y se aprovecha).
- **Contexto:** la auditoría del run 07-09 (handoff cierre 27) demostró que el gate funciona pero que
  nadie puede saberlo sin una sesión de arqueología manual: el yield (11%) se calculó a mano, los
  descartes del gate viven en un `console.log` que nadie lee (los falsos negativos son invisibles: el
  sistema solo puede aprender de lo que dejó pasar, nunca de lo que mató), y el archivado **no copia**
  `relevancia_score`/`relevancia_razon` al histórico — la métrica "acuerdo gate vs equipo" no era
  computable. Sin medición visible, "mejorar la relevancia" es una conversación de sensaciones, y las
  mejoras que siguen (ADR-022) no tendrían forma de verificarse. Requisito explícito de Mani: que el
  desempeño histórico y semanal se pueda **ver** (página en el cockpit) sin poder editarse.
- **Decisión:**
  1. **El archivado computa; Airtable proyecta.** El archivado (que ya cierra el ciclo semanal y tiene
     ambas credenciales) computa las métricas de la semana — de los calificados que acaba de levantar y
     de los `runs` de la semana en Supabase — y escribe filas en una tabla Airtable nueva **`Métricas`**:
     una fila por (semana × proyecto) + una fila global. La tabla es una **proyección derivada y
     regenerable**; la verdad cruda sigue en Supabase. Cero workflows nuevos.
  2. **Métricas v1** — calidad (por proyecto): **precisión de entrega** (aprobados / calificados),
     **separación del gate** (score medio de aprobados vs descartados), volumen vs target; salud
     (global): embudo de corrida (colectados→pretrim→gate→entregados), % SIN GUION, runs fallidos,
     duración, **conteo de llamadas** por servicio (Apify/Supadata/Haiku; el costo en dólares queda
     como multiplicador opcional futuro, no se mantienen tarifas en v1).
  3. **Dos páginas solo-lectura** en el cockpit: *Métricas — Calidad* y *Métricas — Salud* (las
     páginas creadas por API nacen solo-lectura: acá es la semántica deseada, no una limitación).
  4. **Descartes del gate visibles:** el motor sube a una tabla Airtable nueva **`Descartes del gate`**
     solo la **banda borderline** (score ≈0.35–0.6, cap ~10/corrida; ambos knobs dev-only en `Config`)
     con transcript, score y razón. El equipo marca un campo `veredicto` (bien descartado / era bueno).
     El archivado cuenta los "era bueno" como **falsos negativos** en la fila de Métricas y limpia la
     tabla al cerrar la semana. Solo descartes del gate: los del pre-trim mueren por caption pobre y no
     dejan nada auditable.
  5. **El histórico se completa:** el archivado copia `relevancia_score` y `relevancia_razon` a
     `outputs.metadata` (y al Sheet). El motor agrega a `runs.metricas` un **desglose por referente**
     `{evaluados, gate_pass}` (habilita la higiene de fuentes de ADR-022; sigue siendo "el motor
     reporta `runs`", ADR-014 intacto).
  6. **Semana = semana de calificación:** la fila de Métricas se atribuye al ciclo que cierra el
     archivado del domingo (lo calificado esa semana), no a la semana de entrega del candidato.
- **Alternativas descartadas:**
  - *Workflow de métricas aparte:* más limpio en teoría, pero es un tercer workflow que importar,
    monitorear y barrer de zombies; el archivado ya está exactamente en el momento y lugar del cómputo.
  - *Vistas Supabase + dashboard del jefe (ADR-004):* el equipo no las vería en su cockpit; la
    audiencia primaria de estas métricas es quien carga fuentes y criterios, no solo el jefe.
  - *Subir todos los descartes del gate:* satura al equipo con descartes obvios (score 0.1) y el hábito
    de auditar muere en dos semanas. La banda borderline es donde viven los errores.
  - *Descartes como Candidatos con estado especial:* rompe el lenguaje — un Candidato es un video
    esperando calificación; un descarte de máquina no lo es.
- **Consecuencias:**
  - (+) Cada cambio de criterio, poda de referente o mejora del motor se verifica con un número en una
    semana; la separación del gate señala con data qué proyecto tiene criterios vagos.
  - (+) El loop de falsos negativos queda cerrado por primera vez (~2 min/semana de fricción al equipo).
  - (−) El archivado engorda: gana lectura de `runs` y dos escrituras Airtable más; sigue fail-soft
    (si Métricas falla, el archivado de candidatos no se cae).
  - (−) El contrato del cockpit pasa de 6 a 8 tablas (se actualiza `airtable-cockpit.md` +
    `setup-airtable.mjs` en el build de la Fase M1).
  - (−) La banda borderline capada es una **muestra**, no un censo: la tasa de falsos negativos es
    indicativa, no exacta. Aceptado: alcanza para detectar criterios que matan contenido bueno.
- **Toca `core/`:** sí — contrato cockpit (2 tablas nuevas) y este ADR es su autorización. El plan
  ejecutable vive en [refactor-relevancia.md](../agents/refactor-relevancia.md) (Fase M1).

## Enmienda 2026-07-13 — de banda fija a top-K por score

**Contexto:** el primer ciclo real de M1 mostró que la banda `[0.35, 0.6]` **nunca se pobló**: 40
rechazos históricos, 0 en la banda. Haiku no juzga con incertidumbre gradual — es **bimodal**:
aprueba en 0.8–0.9 y rechaza en 0.0–0.3. "Rechazo con score intermedio" es un conjunto vacío por
construcción, así que la página *Descartes (auditar)* quedaba muerta y el loop de falsos negativos
nunca arrancaba.

**Decisión (Mani):** se reemplaza la banda por **los top-K rechazos por score de Haiku** (los
near-miss: los que más cerca estuvieron de pasar = los candidatos más probables a falso negativo).
Garantiza que la muestra se pueble y apunta justo a lo auditable. Los knobs `banda_descarte_min` /
`banda_descarte_max` quedan **deprecados** (el gate ya no los lee); sobrevive `cap_descartes` como K.
El resto del ADR (semántica de la tabla, veredicto, limpieza semanal, falsos negativos) no cambia.
