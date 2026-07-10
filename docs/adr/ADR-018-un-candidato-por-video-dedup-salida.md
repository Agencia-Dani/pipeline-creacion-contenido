# ADR-018 — Un Candidato por video: dedup de salida del fan-out

- **Estado:** aceptada — 2026-07-09 (diagnóstico del run manual del equipo de redes).
  **Enmienda [ADR-013](./ADR-013-atribucion-multiproyecto-fan-out.md)** (la evaluación sigue siendo
  por (video, proyecto); la **emisión** pasa a ser una sola por video).
- **Contexto:** ADR-013 aceptó que un video cross-relevante saliera como **dos Candidatos** (uno por
  proyecto), con el gate como único limitador del duplicado, y como control la config: "ligar un
  referente a varios proyectos solo cuando se quiere esa doble evaluación". La producción demostró que
  ese control no se sostiene: el equipo de redes cargó dos proyectos (*Trading Psychology* y *Trading
  fast tips*) con **exactamente los mismos 5 referentes y 3 keywords** — para ellos son dos ángulos del
  mismo nicho, no dos evaluaciones deliberadas. Resultado del run `2026-07-09`: 6 de 29 videos pasaron
  ambos gates y llegaron **duplicados** al cockpit (12 de 35 records eran pares); el run `2026-07-07`
  dejó otros 2 pares. Para el equipo la unidad de valor es **el video/guion**, no la dupla
  (video, proyecto): dos copias del mismo guion con la misma voz son ruido que les come el cupo de
  calificación (Jero: "me trajo varias cosas repetidas… tengo 18 de los 50 que necesitamos").
- **Decisión:**
  1. **La evaluación no cambia:** el fan-out de ADR-013 sigue — cada proyecto que reclama un video lo
     juzga con su criterio, su voz y su heat (grado 1, sin tocar schema ni `core/`).
  2. **La emisión sí:** en `Armar candidato`, tras el corte a top-N videos distintos, se conserva
     **una sola copia por `external_id`**: la de mayor `relevancia_score` (empate: mayor `heat_score`).
     El video sale como Candidato del proyecto donde **mejor** encaja, con el juicio de ese gate.
  3. Los items sin `external_id` se conservan como antes (fail-open).
- **Alternativas descartadas:**
  - *Dedup en la entrada (Asignar):* elegir el proyecto antes del gate repite el bug que ADR-013 vino a
    arreglar — habría que adivinar el mejor proyecto sin juicio semántico. El gate por proyecto es
    justamente lo que permite elegir bien la copia ganadora.
  - *Dejarlo en config (fuentes disjuntas por proyecto):* ya falló en producción; el motor debe ser
    robusto a la config real del equipo, no exigirle disciplina invisible.
  - *Solo dedupear cuando las dos copias comparten voz:* más "fiel" a ADR-013, pero el equipo ve el
    mismo video repetido igual (mismo `url_referente`, mismo guion base) aunque la voz difiera; y la
    regla condicional es más difícil de explicar y de predecir. Si un día se quiere la doble emisión
    deliberada, se reabre con el grado 2 de ADR-013.
- **Consecuencias:**
  - (+) El cockpit nunca muestra el mismo video dos veces; el cupo de calificación del equipo rinde
    entero (en el run del 09-07 habrían salido 29 candidatos únicos en vez de 35 con 6 pares).
  - (+) Elimina la fila (−) "el equipo puede ver el mismo video dos veces" de ADR-013 sin perder la
    evaluación multi-proyecto.
  - (−) Un video genuinamente cross-relevante ya no aparece en su segundo proyecto; la señal de
    aprendizaje de ese proyecto no lo ve. Aceptado: el dedup global de ADR-013 grado 1 ya impedía que
    re-surgiera, y el histórico (`outputs UNIQUE(external_id)`) ya guardaba una sola fila.
  - (−) Costo de evaluación duplicada (gate/traducción por copia) se mantiene — el dedup es a la
    salida. Acotado por los caps de ADR-016/017; optimizable después si duele.
- **No toca `core/`:** solo el nodo `Armar candidato` del motor (bloque 4 del corte final).
