# ADR-007 — Convergencia gradual hacia un motor de research único (dirección, no compromiso)

- **Estado:** aceptada como dirección — 2026-06-11 · se reevalúa después del MVP (fin de F4)
- **Contexto:** en esencia, ambos workflows hacen lo mismo: research de contenido → filtro/score
  → generación tailored de alta calidad según la voz del cliente. Difieren sobre todo en (a) las
  **fuentes** de donde sale la información y (b) el **formato destino** por plataforma. Surge la
  pregunta: ¿se reducen a UN workflow que al final se ramifica por plataforma?
- **Decisión:** **sí como dirección, no como acción inmediata.** Las costuras que hacen posible
  la convergencia se diseñan ya (etapas canónicas, [PLAN.md §2.4](../../PLAN.md)): las fuentes
  se encapsulan como **adaptadores** de la etapa COLECTAR (que producen `content_item`) y los
  formatos por plataforma como **perfiles** de la etapa GENERAR. El **workflow #3 (búsqueda bajo
  demanda, etapa F5)** se construye como primer slice del motor común reutilizando los
  adaptadores del workflow de reels. Después del MVP se evalúa si el workflow de reels se
  refactoriza sobre ese motor.
- **Alternativas descartadas:**
  - *Fusionar los dos workflows ahora:* big-bang que rompe lo probado (viola "esqueleto que
    camina") y aplana lo que NO es igual: el workflow de Substack no difiere solo en fuentes —
    su valor está en el proceso editorial con humano en el loop (brief, crítica, aprobaciones),
    que no debe automatizarse de más.
  - *Declarar los workflows incomparables y no dejar costuras:* condena al sistema a duplicar
    colecta, normalización y filtros en cada workflow nuevo.
- **Consecuencias:** (+) agregar una fuente o una plataforma destino nueva tiene un lugar único
  y barato donde enchufarse; (+) un mismo research podrá alimentar varios formatos (reel +
  newsletter) cambiando solo el perfil; (−) disciplina extra en F1/F5: los schemas
  `content_item`/`output` deben diseñarse para ambos mundos aunque hoy solo los use n8n;
  (−) riesgo de sobre-abstracción — se mitiga aplicando YAGNI: la costura se deja, la
  generalización se construye solo cuando el workflow #3 la pida de verdad.
