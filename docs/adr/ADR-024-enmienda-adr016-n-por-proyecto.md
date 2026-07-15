# ADR-024 — Enmienda ADR-016: la N vuelve a ser por proyecto (global = default), corte final por proyecto

- **Estado:** aceptada — 2026-07-15 (grilling del refactor Voces→Proyectos con Mani).
  **Enmienda [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md)** en su punto 1
  (`Candidatos por corrida` = N total) y punto 2 (corte final global). No toca los caps ni el resto.
- **Contexto:** ADR-016 hizo `top_n` (`Candidatos por corrida`) una **N total por corrida**, sacó el
  `top_n` de `Proyectos`, y cortó a N al final por heat compuesto **global**. Lo hizo a propósito para
  que el **costo de la corrida fuera predecible** sin importar cuántos proyectos estuvieran activos, y
  rechazó explícitamente "N por proyecto activo". La reunión del 2026-07-15 dio información nueva: el
  flujo on-demand es **por proyecto** (el equipo prende los proyectos que quiere y le pone a cada uno
  cuántos videos quiere de esa corrida), lo que reabre esa decisión.
- **Decisión:**
  1. **La N vuelve a ser por proyecto:** campo editable `N` en `Proyectos` (deshace el punto de
     ADR-016 que lo sacó). Es cuántos candidatos entrega **ese** proyecto en una corrida.
  2. **El global `Candidatos por corrida` pasa a ser el default por proyecto:** si un proyecto no tiene
     N, usa el global. Un solo lever para un bump general; el override por proyecto manda si existe.
  3. **Misma semántica en los dos modos** (cron semanal y on-demand, [ADR-023](./ADR-023-disparo-on-demand-boton-airtable.md)):
     una corrida procesa cada proyecto activo hasta **su** N. No hay dos modos de corte.
  4. **El corte final pasa a ser por proyecto:** después del gate, cada proyecto corta a su N por heat
     compuesto (enmienda el corte **global** del punto 2 de ADR-016). El orden y el momento del corte
     (al final, por heat compuesto) no cambian; cambia el **grupo** sobre el que se corta.
  5. **`cap_top_n` no se toca:** sigue siendo el techo duro de transcripción **total** por corrida
     (protege el backfill y el timeout de n8n). Si `cap_top_n` muerde antes que los N por proyecto,
     recorta por heat métrico y algún proyecto puede quedar por debajo de su N. El cap manda.
- **Alternativas descartadas:**
  - *Mantener N total (status quo ADR-016):* da costo predecible pero no expresa el flujo por proyecto
    que pidió la reunión, y reintroduce el problema de "un proyecto caliente acapara los N".
  - *Cron con N-total y on-demand con N-por-proyecto:* dos semánticas conviviendo → el motor tendría
    dos modos de corte, más difícil de razonar. Se prefiere una sola.
  - *Borrar el global, N obligatoria por proyecto:* modelo más simple (una sola fuente de N) pero sin
    fallback: un proyecto sin N no corre y no hay lever global. Se prefiere global-como-default.
- **Consecuencias:**
  - (+) Desaparece la (−) de ADR-016 "con N total un proyecto caliente acapara los N y deja a otro sin
    ninguno": con N por proyecto cada uno tiene su cupo.
  - (+) El flujo on-demand por proyecto queda expresado en el dato (campo N), no en el disparo.
  - (−) Reaparece un campo N en `Proyectos` (deshace en parte el "menos campos por proyecto" de
    ADR-016). Aceptado.
  - (−) El costo de una corrida ya **no es fijo**: escala con (proyectos activos) × (su N), acotado por
    `cap_top_n`. La predictibilidad se cambió por control por proyecto, con el cap como cinturón. Mani
    lo acepta a conciencia.
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (`Proyectos`: re-agrega `N`; `Ajustes`:
  `Candidatos por corrida` pasa de "N total" a "default por proyecto"), `setup-airtable.mjs`. El motor:
  `Armar plan` (lee N por proyecto con fallback al global) y el **nodo de corte final** (corta por
  proyecto, no global). `cap_top_n` en `Config` sin cambios.
