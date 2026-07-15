# ADR-023 — Disparo on-demand: botón en Airtable → automation → webhook n8n (señal desnuda, el motor lee Airtable)

- **Estado:** aceptada — 2026-07-15 (grilling del refactor Voces→Proyectos con Mani).
  Es el contrato de disparo del refactor ([refactor-voces-proyectos.md](../agents/refactor-voces-proyectos.md) §0/B.2/§5).
  Coexiste con el cron semanal (no lo retira).
- **Contexto:** la reunión con el equipo de redes (2026-07-15) pidió que Majo/Jero puedan disparar
  una corrida **a demanda** sin esperar al cron semanal ni a un dev. Hoy una corrida solo nace del
  cron o de un dev abriendo n8n y dando *Execute* (que corre **todos** los proyectos activos). Hacía
  falta un botón que el equipo pueda tocar desde una superficie no-code (invariante #2: lo que el
  equipo toca es imposible de romper) y que llegue al motor sin acoplar a n8n.
  - El plan original proponía una tabla `Corridas` con un checkbox `correr ✓` que un **cron corto del
    motor** levantaba por polling. Eso tiene dos costos: (a) el polling quema llamadas de Airtable de
    forma continua aunque nadie dispare (NFR4, free tier ~1.000 calls/día), y (b) un checkbox es
    **estado pasivo** que se puede quedar prendido → hay que diseñar idempotencia y recuperación de
    "corriendo colgado" a mano (riesgo invariante #2).
- **Decisión:**
  1. **Botón nativo de Airtable** (campo Button), no checkbox. Acción **"Run automation"**: el click
     no navega el browser, la automation hace un POST al **webhook de Producción de n8n**. Es una
     acción explícita "correr ahora" (no deja estado colgado como el checkbox).
  2. **Señal desnuda, sin payload de selección.** El webhook solo dispara "correr ahora"; **el motor
     lee Airtable** para saber qué corre, igual que ya hace. La selección se expresa con los
     **toggles** (`Proyectos.activo` + `Voces.activo`) y la **N por proyecto** (ver ADR-024), no con
     un `{project_id, N}` en el cuerpo. Reemplaza el contrato `{project_id,N}` que el plan traía en §0.
  3. **Una corrida = todos los proyectos activos** (de voces activas), cada uno a su N. "Correr solo
     Liderazgo" = activar solo Liderazgo. El motor no gana un modo "procesar solo este"; sigue leyendo
     "los activos", ahora disparado por webhook además del cron.
  4. **Concurrencia:** el webhook es **single-flight** — si ya hay una corrida corriendo, la segunda
     no arranca (lock / guard "ya hay una corrida en curso"). Evita que dos clicks casi simultáneos
     (Majo + Jero) paguen por transcribir los mismos videos nuevos en la carrera previa a
     `processed_items`. La corrección de salida ya está protegida (dedup `processed_items` + ADR-018);
     esto protege el **costo**.
  5. **La superficie operativa se queda en Airtable.** Todas las decisiones de este refactor (botón,
     automation, toggles, campo N) caben en Airtable, así que el eje operativo del cockpit **no** se
     mueve a un dashboard propio. La pregunta §3 (Airtable vs dashboard) queda acotada a lo
     **analítico** read-only (Métricas/Costos sobre Supabase), que se decide en la auditoría (A.5).
- **Alternativas descartadas:**
  - *Tabla `Corridas` + cron corto por polling:* quema cuota (NFR4) y obliga a diseñar idempotencia y
    recuperación de estado colgado (invariante #2). El botón event-driven no poll-ea y no deja estado.
  - *Payload `{project_id, N}` al motor:* inventa un schema de mensaje y obliga al motor a un modo
    "procesar solo este proyecto". Leer Airtable reusa el acoplamiento que ya existe y deja el motor
    con un solo modo ("los activos"). Se prefiere la señal desnuda.
  - *Botón "Open URL" directo al webhook:* el más simple y funciona en cualquier plan, pero el click
    navega el browser a la respuesta del webhook (UX fea). Se prefiere "Run automation".
  - *n8n Form Trigger (URL de formulario nativa):* la opción más lazy (feature nativa, sin tabla ni
    polling), pero es una URL **fuera** de Airtable → parte la puerta única. Se prefiere quedarse
    dentro de Airtable mientras el operativo viva ahí.
- **Consecuencias:**
  - (+) Cero polling: costo de Airtable event-driven, no continuo.
  - (+) Sin estado colgado ni idempotencia a mano: el botón es una acción, no un flag.
  - (+) El motor gana un disparador sin ganar un modo nuevo (sigue leyendo "los activos").
  - (−) La N de la corrida y qué proyectos corren viven en **estado persistente** (toggles + campo N),
    no en el disparo. Expresar "intención de esta corrida" = editar config antes de tocar el botón; si
    se olvida un toggle prendido, ese proyecto también corre. Aceptado (el equipo cura su set activo).
  - (−) Depende de que el plan de Airtable soporte la acción HTTP/automation. **La auditoría (A.3) lo
    confirma antes de congelar la implementación.**
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (campo Button en la superficie + la
  automation; documentar el webhook como entrada del motor). El motor: nuevo **Webhook trigger** de
  Producción con guard de single-flight, en paralelo al cron. No toca el pipeline de procesamiento.
