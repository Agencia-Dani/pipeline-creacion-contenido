# ADR-010 — Scoring semántico con LLM + etapa CALIDAD (revisa el scoring de ADR-009)

- **Estado:** aceptada — 2026-06-16 (sesión de grilling con Mani tras la primera corrida real V1;
  plan de ejecución por stages en [docs/agents/refactor-relevancia.md](../agents/refactor-relevancia.md)).
- **Contexto:** V1 corrió end-to-end y pobló `Candidatos`, pero el ranking deja pasar contenido
  **viral-pero-irrelevante** (hashtag farming, viral sin razón). El heat-score de ADR-009 juzga la
  relevancia tópica con un **match por substring** de las keywords del Proyecto sobre la
  descripción/hashtags. Es débil y gameable: falsos positivos (la keyword `ventas` matchea
  `desventajas`; cualquiera que meta `#ventas` de adorno entra), falsos negativos (no entiende
  sinónimos), y **mis-firea para Instagram** (que se descubre por cuenta/referente, así que un reel
  relevante de una cuenta curada saca `tema=0` si el caption no trae la palabra). Nada juzga el
  **contenido** real del video. Además, la etapa **CALIDAD** (PLAN §2.4) era un hueco conocido (❌)
  en el motor de reels.
- **Decisión:**
  1. **La relevancia/calidad la juzga un LLM (Claude Haiku)**, no el substring, contra **criterios
     definidos por el equipo en Airtable** (`Proyectos.criterios_relevancia`, opcional `Voces`). El
     boost `tema` por substring **sale** del heat-score.
  2. **Doble capa** (por eficiencia: el LLM barato protege al transcriptor caro):
     - **Pre-trim** en FILTRAR/SCOREAR (juzga el caption): colador **amplio** (optimiza recall),
       tira lo obviamente off-topic **antes de transcribir** para no pagar Supadata por basura.
     - **Gate / jurado** en **CALIDAD** (juzga el transcript): **estricto** (optimiza precision),
       produce el score de relevancia/calidad. Llena la etapa CALIDAD canónica.
  3. **Heat-score = composite:** el juicio semántico de Haiku ⊕ las métricas objetivas (percentil de
     views/likes/engagement + señal de selección). Las métricas **no se reemplazan**: el LLM no
     conoce los números mejor que los números; ordenan fino entre los ya-relevantes.
  4. **Gates fail-open:** si Haiku falla, el video **pasa** (no se vacía la entrega) — un servicio
     externo no es dependencia de ejecución (invariante #1, PLAN §2.5).
- **Alternativas descartadas:**
  - *Mantener el substring (cero tokens):* es justo la lógica gameable que disparó esto, y mis-firea
    para IG.
  - *Que Haiku reemplace todo el scoring (incluida la viralidad):* tira señal objetiva real y gasta
    tokens haciéndole juzgar lo que un número ya resuelve.
  - *Gate solo sobre metadata, sin transcript:* la metadata es delgada y gameable; no alcanza para
    juzgar contenido (confirmado con Mani en el grilling).
  - *Transcribir todo y un solo gate sobre el transcript, sin pre-trim:* máxima precisión pero
    transcribe basura → costo de Supadata; el pre-trim barato lo evita.
- **Consecuencias:**
  - (+) La relevancia se juzga sobre el **contenido real**, no sobre metadata gameable; desaparece el
    mis-fire de IG.
  - (+) Se **llena la etapa CALIDAD** canónica (deja de ser hueco).
  - (+) El equipo calibra la relevancia **sin tocar n8n** (criterios en Airtable, no-code).
  - (−) **Costo nuevo de tokens:** dos llamadas Haiku batch por corrida. Mitigado: Haiku es barato,
    se batchea, y el pre-trim **baja el volumen de transcripción** (ahorra Supadata).
  - (−) Un LLM entra al camino de selección. Mitigado por **fail-open** (invariante #1).
  - **Revisa el punto "heat-score" de ADR-009** (la fórmula cambia). El resto de ADR-009 sigue
    vigente: scripts literales, prioridad multiidioma, aprendizaje → scoring. La ejecución va por
    stages en [refactor-relevancia.md](../agents/refactor-relevancia.md).
