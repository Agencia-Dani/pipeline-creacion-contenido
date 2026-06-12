# ADR-009 — Scripts literales (transcribir/traducir) y aprendizaje dirigido al scoring (revisa ADR-008)

- **Estado:** aceptada — 2026-06-12 (dirección dada por el jefe en la conversación de visto bueno;
  [transcripción](../transcripciones/2026-06-12-visto-bueno-workflow.md) ·
  [norte completo: ROADMAP §1](../../ROADMAP.md))
- **Contexto:** el jefe dio el visto bueno al MVP de reels (ADR-008) pero corrigió el corazón de
  la etapa GENERAR: el equipo no quiere guiones *reescritos* por IA a partir del video elegido —
  quiere **el contenido tal cual**, en español, para decidir y adaptar ellos. Además pidió:
  prioridad a creadores en otros idiomas (EN/PT/IT/FR), un histórico consultable de qué se
  seleccionó/cuándo/para qué voz, cada script creado como Google Doc linkeado, un mapa de calor
  re-rankeado de lo seleccionado, y poder bajar el histórico a Sheets/Excel.
- **Decisión:**
  1. **GENERAR se vuelve TRANSCRIBIR + TRADUCIR.** El script de cada candidato es la
     transcripción literal del video (Supadata), traducida al español por Claude **solo si** el
     original no está en español. Sin reescritura, sin embellecer, sin voz. Se detecta y guarda
     el `idioma` del original.
  2. **El aprendizaje se redirige al scoring.** El loop de ADR-008 (aprobados → few-shot de la
     voz) queda **en pausa**: con scripts literales no hay escritura que mejorar. Lo que el
     equipo selecciona se acumula como **señal del heat-score** (`v_senal_seleccion`: tasa de
     selección por referente/idioma) → el sistema aprende *qué priorizar*, no *cómo escribir*.
  3. **El heat-score pondera idioma.** Contenido en EN/PT/IT/FR recibe boost (es prioridad de
     negocio traer lo que no circula en español); el resto de criterios sigue igual (views,
     likes, tema, señal de selección; `min_*` ponderan, no cortan; flag viral marca, no excluye).
  4. **Cada script accesible por link.** El motor crea un documento por script (default:
     Google Doc — título + link al original + script en español; el formato es flexible si otro
     destino con link estable conviene más) y su URL viaja en el candidato (Airtable `link_doc`),
     en `outputs.metadata` y en el histórico.
  5. **Histórico de selecciones visible y exportable.** `outputs.calificado_en` + vistas
     `v_selecciones_por_dia` (cuántos, cuándo, para qué voz) y `v_historico_seleccionados`
     (fila = link original + métricas + Doc + voz + calificación). El histórico de seleccionados
     se **materializa además en un Google Sheet** (el equipo trabaja en Sheets; exportar a Excel
     es nativo). Schema: [`core/schema/003_seleccion_e_historico.sql`](../../core/schema/003_seleccion_e_historico.sql).
  6. **Re-rank de seleccionados sin código:** vista de Airtable sobre `Candidatos` con filtro
     `estado = aprobado` y orden `heat_score` desc — "se rehace el mapa de calor" solo con lo
     elegido, automáticamente.
- **Alternativas descartadas:**
  - *Mantener la reescritura en voz como opción paralela del MVP:* duplica prompts, costos y QA
    para un output que el jefe explícitamente no pidió. La costura queda (tabla `Voces` conserva
    sus campos de generación, en pausa) — si vuelve, es un perfil más de la etapa GENERAR.
  - *Guardar el script solo en Airtable/Supabase (sin Doc):* el equipo trabaja sobre Docs y el
    jefe pidió el link "de una vez"; crear el Doc desde n8n es un nodo más.
  - *Exportar el histórico bajo demanda (CSV desde Supabase):* el jefe lo quiere donde el equipo
    ya vive (Sheets); un append al Sheet en el archivado cuesta casi nada.
- **Consecuencias:**
  - (+) Menos costo y menos riesgo de calidad: la llamada a Claude por item baja de "escritura
    creativa larga" a "traducción literal" (y a **cero** para contenido ya en español).
  - (+) La propuesta de valor queda más nítida: el sistema **encuentra y prioriza**; el equipo
    **decide y adapta**.
  - (+) El dato de curación (qué, cuándo, para qué voz) se vuelve un entregable de negocio
    (histórico exportable), no solo telemetría interna.
  - (−) `Voces.few_shot`/`cta`/etc. quedan sin uso en el MVP (se documenta la pausa — no se
    borran: son la costura de la evolución "guiones en voz propia").
  - (−) Reaparece Google Sheets como destino (del histórico curado). Es deliberado y acotado:
    Supabase sigue siendo la fuente de verdad del historial; el Sheet es una materialización.
  - (−) Dos secretos/credenciales más en n8n (Google Docs; el Sheet usa la credencial OAuth ya
    prevista).
  - El one-pager de reels queda parcialmente superseded en su paso 4 ("escribe varios guiones…
    en la voz elegida") — anotado en el propio doc; el norte vigente es
    [ROADMAP §1](../../ROADMAP.md).
