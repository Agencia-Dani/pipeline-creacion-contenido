# ADR-010 — Scoring semántico con LLM + etapa CALIDAD (revisa el scoring de ADR-009)

- **Estado:** aceptada — 2026-06-16 (sesión de grilling con Mani tras la primera corrida real V1;
  ejecución por stages ya completada, histórico en git).
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
    vigente: scripts literales, prioridad multiidioma, aprendizaje → scoring. La ejecución fue por
    stages (histórico en git).

## Enmienda 2026-07-14 — la Voz aporta contexto, no criterio

**Contexto (audit con Mani sobre la data viva):** el punto 1 de la decisión dejó `Voces.criterios_relevancia`
como refinamiento **opcional** del criterio del Proyecto. En la práctica, las 3 Voces activas tienen ese
campo lleno con **bios** (quién es la voz: "reconocido especialista en finanzas…", "comunicación
consciente…"), no con criterios que permitan rechazar un video. Por el propio glosario, eso es una
descripción, no un criterio. Y los criterios del **Proyecto** ya discriminan bien el tema (traen
RELEVANTE / NO RELEVANTE + ejemplos). A escala MVP (pocos proyectos, una Voz por proyecto) un criterio
de Voz separado duplica el del Proyecto sin agregar señal.

**Decisión (Mani):** la Voz aporta al gate **contexto de persona/audiencia** (quién es, a quién le
habla), **no un criterio de filtro**. El **Proyecto es el único criterio que discrimina** el tema. El
gate sigue combinando Proyecto ⊕ Voz en una sola llamada Haiku; lo que cambia es el **rol** de la Voz.
Consecuencia: no se agrega `diagnostico` ni `criterios_aprendidos` por-Voz — la atribución de calidad
vive a nivel Proyecto; el lint de "Voz incoherente" de [ADR-022](./ADR-022-loop-aprendizaje-criterios.md)/M2
queda como el único feedback a nivel Voz. El campo `criterios_relevancia` de `Voces` se re-etiqueta
como contexto en la página Voces (para que el equipo no crea que ahí va una regla).

**Alternativas descartadas:** *Voz-como-criterio + reescribir las 3 bios + `diagnostico` por-Voz* —
duplica a esta escala. *Sacar la Voz del gate del todo* — pierde el contexto de persona cuando una Voz
sirve a varios proyectos con matices distintos.

**Glosario actualizado:** términos *Voz* y *Criterios de relevancia* en
[context.md](../agents/context.md).
