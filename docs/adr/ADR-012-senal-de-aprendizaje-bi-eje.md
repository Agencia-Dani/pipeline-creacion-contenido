# ADR-012 — Señal de aprendizaje bi-eje: por referente Y por keyword/tema

- **Estado:** aceptada — 2026-06-17 (ejecución de las decisiones lockeadas del cierre 4, decisión #4 /
  O7; se monta sobre el descubrimiento simétrico de ADR-011/#4).
- **Contexto:** el motor aprende qué priorizar reinyectando la **tasa de selección** del equipo al
  heat-score (ADR-009, invariante "el sistema aprende"). La señal `v_senal_seleccion` (schema 003)
  agrupa por **`referente`** (la cuenta que posteó) + idioma, y el Heat-score sube el heat de los
  referentes/idiomas que el equipo selecciona seguido. Funciona para el contenido descubierto **por
  referente**, pero es **ciego para el descubierto por keyword/hashtag**: ahí el poster suele ser una
  cuenta de una sola vez que no reaparece → la tasa por cuenta es ruido, nunca acumula señal. Con el
  descubrimiento simétrico (referentes + keywords en ambas plataformas) ese eje pasó a ser la mitad
  del embudo → el aprendizaje tiene que cubrirlo.
- **Decisión:**
  1. **Dos ejes de aprendizaje:** (a) por **referente** (`v_senal_seleccion`, existente) y (b) por
     **keyword/tema** (`v_senal_tema`, nueva — schema 006). Cada una expone `tasa_seleccion` por su
     clave.
  2. **El `tema` matcheado se persiste end-to-end:** el motor (`Asignar proyecto+voz`) registra el
     keyword que matcheó el candidato (vacío si entró por referente) → `Candidatos.tema` → el archivado
     lo copia a `outputs.metadata.tema` → `v_senal_tema` agrupa por ahí. Sin persistir el tema no hay
     con qué agrupar.
  3. **Combinación en el Heat-score:** `sel = max(señal_referente, señal_tema)` → el boost
     `heat·(1+sel)`. Se toma el **máximo**, no la suma, para no doblar el premio cuando ambos ejes
     aplican al mismo video.
  4. **Fail-open + inerte hasta tener data:** `Leer señal tema` es `continueOnFail`; sin historial de
     selección con tema, `tasa = ∅` y el boost es 0 → no cambia el comportamiento hoy. La señal se
     activa sola a medida que el equipo califica.
- **Alternativas descartadas:**
  - *Quedarse en referente-only (status quo):* deja el eje keyword sin aprendizaje — la mitad del
    descubrimiento simétrico no mejora nunca.
  - *Acreditar por proyecto en vez de por keyword:* el proyecto es demasiado grueso (todo el tema);
    no distingue qué keyword puntual funciona. El keyword es la unidad accionable.
  - *Sumar las dos señales:* doble premio cuando un video matchea referente Y keyword; `max` es más
    conservador y suficiente.
  - *Derivar el tema en el archivado (no persistirlo desde el motor):* el archivado no tiene el plan
    de corrida ni el caption original para re-matchear; el motor es el único punto que sabe qué
    keyword entró.
- **Consecuencias:**
  - (+) El aprendizaje cubre los dos ejes del descubrimiento → cierra O7 sobre el motor simétrico.
  - (+) Extensible: la misma mecánica admite más ejes (plataforma, idioma) si hiciera falta.
  - (−) Un campo más en Candidatos (`tema`) y una lectura más de Supabase por corrida (fail-open,
    irrelevante en el plan free con cron semanal).
  - (−) El boost por tema premia el keyword **globalmente**, no por proyecto; si dos proyectos
    comparten un keyword, comparten su señal. Aceptable en el MVP (keywords suelen ser propias del
    proyecto); refinable a `(proyecto, tema)` post-MVP.
- **Toca `core/`:** `core/schema/006_senal_tema_bieje.sql` (vista nueva), `setup-airtable.mjs` +
  `core/contracts/airtable-cockpit.md` (campo `Candidatos.tema`). Aplicado en la base viva
  (campo `tema`). El motor: `Asignar proyecto+voz`, `Armar candidato`, `Preparar batch Airtable`,
  nodo `Leer señal tema`, `Heat-score v1`. El archivado: `Armar filas` (metadata).
