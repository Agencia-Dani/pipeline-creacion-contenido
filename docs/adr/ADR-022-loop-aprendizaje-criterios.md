# ADR-022 — Loop de aprendizaje de criterios: destilación semanal + rol del 🔥 + salud por referente

- **Estado:** aceptada — 2026-07-10 (grilling de mejoras de relevancia con Mani). Se construye
  **después** de verificar ADR-021 con un run real (la medición es el instrumento que valida este loop).
  Extiende [ADR-010](./ADR-010-scoring-semantico-y-etapa-calidad.md) (qué alimenta el juicio del gate)
  y completa el ciclo de fuentes de [ADR-020](./ADR-020-motor-descubrimiento-referentes.md) (aquel
  siembra cuentas nuevas; este señala cuáles podar).
- **Contexto:** el gate juzga contra `criterios_relevancia` escritos a mano un día cualquiera, y la
  auditoría 07-09 mostró su límite: la única pérdida real del gate fue un **gap de criterios** (los
  macro-analysis de nicholascrown que Jero aprueba 8/10 y los criterios no cubren). Mientras tanto el
  equipo produce cada semana la señal más valiosa que existe — aprobados y descartados reales con
  transcript — y el sistema la ignora para juzgar: solo la usa la señal de selección por referente.
  Los criterios deberían converger hacia el gusto demostrado del equipo sin pedirle trabajo nuevo.
- **Decisión:**
  1. **Destilación semanal:** el archivado, al cerrar la semana, destila los calificados de cada
     proyecto con Haiku en un campo nuevo **`criterios_aprendidos`** de `Proyectos` (2-3 patrones de lo
     que sí + lo que no, con ejemplos cortos). El gate lee criterios manuales **+** aprendidos. La
     máquina **nunca pisa el campo manual**; el equipo ve lo aprendido y puede editarlo o borrarlo
     (no-code, transparente, consistente con el norte de Airtable como punto de entrada único).
  2. **La misma llamada hace de lint:** al destilar, Haiku también evalúa los criterios manuales
     (¿permiten rechazar algo, o son una descripción? ¿tienen lista negativa? ¿la Voz es coherente con
     el Proyecto?) y deja la advertencia visible. Cero latencia/tokens nuevos en el camino crítico del
     motor (por eso NO va en `Armar plan`).
  3. **El 🔥 elige ejemplos:** la destilación prioriza los candidatos calificados 🔥 como ejemplos
     positivos (fallback: aprobados recientes). La **señal de selección** por referente sigue
     alimentándose SOLO del Estado — eso no cambia. El glosario se ajusta: la Calificación deja de ser
     100% visual; ahora también prioriza ejemplos de destilación.
  4. **Salud por referente:** el archivado actualiza cada semana 3 campos máquina en `Referentes` —
     `tasa_gate` (del desglose por referente de `runs.metricas`, ADR-021), `tasa_aprobacion` (de
     `v_senal_seleccion`) y `videos_evaluados` — con mínimo de muestra para no juzgar con 5 videos.
     Una vista "A revisar" filtra los de tasa baja. **La poda es siempre del equipo** (destildar
     `activo`): simetría con ADR-020, donde la promoción también exige aprobación humana.
- **Alternativas descartadas:**
  - *Retrieval en vivo en el gate (few-shot por corrida desde Supabase):* más fresco, pero el motor
    ganaría una dependencia de lectura en el camino crítico, más tokens por corrida, y el equipo no
    vería ni podría corregir qué ejemplos se usan (caja negra). La frescura extra no vale nada con
    ciclo semanal.
  - *Solo Estado para elegir ejemplos (regla original del cierre 20 intacta):* más simple de explicar,
    pero tira la señal más fina que el equipo ya produce gratis; el 🔥 es literalmente "esto es
    exactamente lo que quiero".
  - *Auto-desactivar referentes bajo umbral:* rompe el principio de que las fuentes las cura el equipo;
    una cuenta puede tener una mala racha o servir a un proyecto nuevo.
  - *Re-asignación de proyecto por clasificador (router Haiku):* re-litiga ADR-013 y agrega errores
    nuevos. Queda anotada la variante quirúrgica ("segunda oportunidad": al descartar con heat alto,
    preguntar si encaja en otro proyecto activo) para cuando haya >3 proyectos con criterios sanos.
- **Consecuencias:**
  - (+) Los criterios convergen solos hacia las decisiones reales del equipo, con supervisión humana
    barata; el gap tipo "macro-analysis" se detecta en una semana en vez de en una auditoría manual.
  - (+) El ciclo de fuentes queda completo: ADR-020 siembra, esto poda (con humano en ambas puntas).
  - (+) Verificable por diseño: si funciona, la precisión de entrega y la separación del gate
    (ADR-021) suben; si no suben, se ve.
  - (−) `criterios_aprendidos` puede degradar el juicio si aprende de una mala semana; mitigado porque
    es visible/editables y nunca reemplaza al manual. Si molesta, se borra el campo y el gate vuelve a
    solo-manuales (reversión barata).
  - (−) El archivado suma otra responsabilidad (ya señalado en ADR-021); sigue fail-soft.
  - (−) El equipo debe saber que el 🔥 ahora enseña (una línea en el onboarding).
- **Toca `core/`:** sí — contrato cockpit (campos nuevos en `Proyectos` y `Referentes`); este ADR es
  su autorización. El plan ejecutable (Fase M2) ya se completó (histórico en git).
