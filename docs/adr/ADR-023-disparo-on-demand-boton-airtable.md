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
- **Enmienda (2026-07-16, C.3 — el "cómo" del guard, decidido con Mani):**
  1. **El guard aplica a los 3 triggers** (webhook, cron y manual), no solo al webhook. Sin eso, el
     cron del lunes 8am podía arrancar encima de una corrida on-demand viva: el barredor zombie la
     marcaba `fallo` y las dos corrían en paralelo (doble Apify). Costo aceptado: si hay corrida viva
     a la hora del cron, esa semana el barrido automático se saltea (recuperable con el botón).
  2. **Vivo vs. zombie lo decide `ventana_corrida_min`** (knob del Config, 120): un run `en_curso`
     más joven que la ventana es corrida viva (el guard bloquea); más viejo es zombie. El barredor
     zombie se movió **antes** del guard y solo barre los más viejos que la ventana → un zombie
     nunca deja el motor trabado.
  3. **El guard es check-then-act** (GET corridas vivas → IF → POST Abrir run): queda una ventana
     residual de ~1-2 s entre dos clicks casi simultáneos. Aceptada a conciencia. Peor caso si dos
     corridas pasan juntas: costo doble (scrape + transcripción) y candidatos duplicados en el feed
     esa vez (ambas leen `processed_items` antes de que la otra escriba); la tabla de dedup en sí no
     se ensucia (`unique(platform, external_id)` + `ignore-duplicates`) y la corrida siguiente ya no
     los repite. Se descartó el lock atómico por unique index parcial en Supabase (migración nueva +
     manejo de 409 que complica el fail-open).
  4. **Fail-open** (invariante #1): con Supabase caído el guard deja pasar. Un click bloqueado
     **no** abre run (no ensucia `runs_fallo` ni la salud); el webhook responde 200 inmediato y el
     veredicto se ve en n8n/`runs`. `Abrir run` ahora registra el `trigger_type` real
     (`on_demand`/`manual`/`cron` — antes todo se registraba `cron`).
- **Enmienda (2026-07-16, autenticación del webhook — decidida con Mani):** el ADR original **nunca
  decidió cómo se autentica el webhook**, y la implementación de C.3 quedó sin auth: el endpoint POST
  respondía a cualquiera. Eso dejaba el **path haciendo de bearer token** por omisión, no por elección
  — quien consiguiera la URL podía disparar corridas **pagas** (Apify + Supadata + Haiku) a voluntad.
  El guard single-flight acota el daño de un click repetido a una corrida viva por vez, pero no impide
  el abuso sostenido.
  - **Decisión: Header Auth** en el nodo webhook (credencial n8n `httpHeaderAuth` — *Webhook Motor
    Header*). El `fetch` de la automation de Airtable manda ese header; sin él, n8n responde **403 y
    el workflow ni arranca** (la auth es del trigger, así que un POST no autorizado no abre run, no
    consume el guard y no ensucia `runs`).
  - **Qué cambia el modelo de amenaza:** el path deja de ser secreto y pasa a ser un identificador.
    El secreto es el header, que **no viaja en la URL** (no queda en logs de proxy, historiales ni
    referers, que es donde una URL se filtra sola). Igual conviene un path aleatorio: es defensa en
    profundidad barata, no la defensa.
  - **Alternativas descartadas:** *Basic Auth* (equivalente en fuerza, pero el par usuario/clave no
    aporta nada sobre un header y se confunde con una identidad de usuario) · *JWT* (n8n lo soporta,
    pero exige emitir y rotar tokens desde un script de Airtable: complejidad sin beneficio para un
    único llamador máquina-a-máquina) · *sin auth, path largo* (el statu quo — se rechaza justamente
    porque hace secreta a la URL, que es lo que se comparte y se loguea).
  - **Costo aceptado:** una credencial más que crear al re-importar y **un lugar más donde el
    re-import puede fallar en silencio**: si el header de la automation y el de n8n no coinciden, el
    botón responde error y nadie se entera hasta que alguien pregunta por qué no corrió. Va al
    checklist de re-import del handoff, no a la memoria de nadie.
  - **No cambia** el cron ni el Execute manual: son triggers internos de n8n, no pasan por HTTP. La
    auth protege solo la puerta de calle.
