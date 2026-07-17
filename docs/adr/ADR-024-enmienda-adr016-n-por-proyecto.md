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

## Enmienda (2026-07-17) — spillover: N es techo exacto, la entrega es best-effort con reparto de sobrantes

- **Estado:** aceptada — 2026-07-17 (decisión de Mani tras la V-run post re-import).
- **Contexto:** la V-run destapó que "cada proyecto corta a su N" era media verdad. El corte va
  **después** del dedup (ADR-018: cada video queda en UN solo proyecto, gana el que lo juzgó más
  relevante), y cuando dos proyectos comparten referentes el pool compartido se concentra en el de
  mayor relevancia. Si ese proyecto llena su N, los videos sobrantes se **descartaban enteros** aunque
  hubieran pasado el gate del otro proyecto, que quedaba corto con cupo libre (caso real: *Trading
  Psychology* entregó 6/20 mientras 3 videos que pasaron su gate se tiraban a un *Trading fast tips* ya
  lleno). Antecedente de la misma decisión: **compartir referentes entre proyectos de una voz es
  VÁLIDO** (Mani, 2026-07-17) — el pipeline ya dedupa las etapas pagas (una llamada por video), así que
  el fix va en el reparto, no en prohibir el solape.
- **Decisión:**
  1. **Spillover en el corte final:** un sobrante (video que pasó el gate de ≥2 proyectos y cuyo
     proyecto ganador llenó su N) se entrega al proyecto **con cupo** que también lo gateó, usando **la
     copia de ese proyecto** (su `relevancia_score`/`relevancia_razon`, no los del ganador). Sobrantes
     en orden de heat; entre alternativas gana la de mayor relevancia.
  2. **Garantía dura (pedida por Mani): un video sale en UN solo proyecto, siempre.** Un video ya
     entregado a su ganador jamás se re-asigna; un sobrante toma a lo sumo una alternativa. El
     spillover no consume N sin necesidad: cada proyecto recibe N candidatos **distintos**.
  3. **Semántica de N, ahora dicha completa:** N es un **techo exacto** (jamás se supera, con o sin
     spillover) y la entrega es **best-effort sobre el supply real** — si el pool no tiene N videos que
     pasen el gate del proyecto, entrega menos y eso es el gate trabajando, no un bug.
  4. El PISO (ADR-017) no re-aplica en el spillover: es relleno marginal, no redistribución.
- **Alternativas descartadas:**
  - *Aceptar N como techo sin spillover (status quo):* gratis, pero tira videos ya pagados
    (scrape+transcripción+gate) que un proyecto hambriento quería. Con referentes compartidos válidos,
    el caso no es borde: es el modo normal de operar.
  - *Referentes exclusivos por proyecto:* elimina el solape de raíz pero contradice la decisión de
    compartir, exige re-curación del dato y no arregla el supply fino.
- **Consecuencias:**
  - (+) En la V-run habría llevado TP de 6 a 9 entregados sin costo extra (los videos ya estaban pagos).
  - (−) Un candidato puede llegar con la relevancia del "segundo mejor" juicio — aceptado: esa copia
    pasó el gate de ese proyecto por mérito propio.
- **Toca:** solo `Armar candidato` en el motor (dedup guarda todas las copias gate-pass; pasada de
  spillover tras el corte). Probado en `test-nodos.mjs` (8 casos nuevos, incluida la garantía de
  no-duplicado). Sin cambio de schema ni de contrato de datos.
