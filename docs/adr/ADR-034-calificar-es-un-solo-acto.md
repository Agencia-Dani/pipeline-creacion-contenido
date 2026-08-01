# ADR-034 — Calificar es un solo acto: el Estado deriva de la Calificación

- **Estado:** aceptada — 2026-07-31 (decisión de Mani, arquitecto, en el grilling de
  [D6](../agents/plan-cockpit-propio.md#d6--el-espacio-de-trabajo-feed-de-calificación)).
  Enmienda el glosario ([context.md](../agents/context.md), términos *Calificación* y *Estado*), que
  los declaraba "distintos a propósito". No toca [ADR-021](./ADR-021-medicion-desempeno-embudo.md)
  ni [ADR-022](./ADR-022-loop-aprendizaje-criterios.md): las dos señales siguen existiendo y
  llegando a quien las lee.

- **Contexto:** el feed de calificación (D6) es la pantalla que el equipo más usa. Airtable modela
  el juicio del equipo sobre un Candidato en **dos** campos, y el sistema los usa para cosas
  distintas:
  - `estado` (`nuevo` → `aprobado` | `descartado`) es la **señal de selección**: lo que el archivado
    levanta (`filterByFormula NOT({estado}='nuevo')`), lo que alimenta `precision` en
    `Métricas Proyectos`, y la clase positiva/negativa del aprendizaje.
  - `calificacion` (🔥/👍/👎) es el cue visual, y el 🔥 es lo que `Destilar criterios` usa para
    **elegir qué aprobados se citan como ejemplos** al destilar los criterios aprendidos (ADR-022).

  Llenarlos son dos decisiones por candidato, y el dato vivo dice que la segunda se pierde. Sobre
  los **79 candidatos calificados entre el 01 y el 26 de julio** ya archivados en `outputs`:
  **11 (14%) tienen `estado` decidido y ningún emoji**. La falla es asimétrica — el que se olvida es
  siempre el emoji, o sea justo el campo del que depende ADR-022 para armar su corpus de ejemplos.

  La escala vuelve el problema estructural, no anecdótico: una corrida entrega **145 candidatos**
  repartidos en 4 proyectos, con ~1145 caracteres de script cada uno. A dos campos por candidato,
  despachar una semana son 290 decisiones.

- **Decisión:**
  1. **El operador hace un solo acto por candidato: 🔥 / 👍 / 👎.** El Estado se **deriva**:
     🔥 y 👍 ⇒ `aprobado` · 👎 ⇒ `descartado`. No hay un segundo control para el estado.
  2. **Los dos campos se siguen escribiendo en Airtable, con el mismo vocabulario de siempre.**
     Ninguna máquina se entera del cambio: el archivado sigue filtrando `NOT nuevo`,
     `Computar métricas semana` sigue contando aprobados sobre calificados, y `Destilar criterios`
     sigue eligiendo los 🔥. **Ésa es la condición de D6** — la fase no puede obligar a re-importar
     workflows (el plan concentra los re-imports en D4 y D7).
  3. **Un Candidato calificado está decidido, y uno sin calificar está sin decidir.** Deja de existir
     el limbo "calificado pero en `nuevo`", que hoy termina purgado por el barrido de 20 días sin
     pasar nunca al histórico.
  4. **Se pierde a propósito la combinación "👍 pero descartado"** ("buen video, no lo quiero").
     Quien necesite expresar eso tiene `notas_equipo`, que desde D.3(b) sobrevive al archivado en
     `outputs.metadata`.

- **Consecuencias:**
  - **A favor:** una decisión por candidato en vez de dos, que sobre 145 semanales es la diferencia
    entre despachar el feed y abandonarlo. Cierra el agujero del 14%: **no puede volver a existir un
    aprobado sin emoji**, así que el corpus de ejemplos positivos de ADR-022 deja de tener huecos, y
    la señal que hoy se pierde es la que más cuesta reconstruir después (el emoji no es inferible
    desde `aprobado`).
  - **En contra:** se pierde expresividad real. El caso "el video es bueno pero no para nosotros
    ahora" ya no se distingue de "el video no sirve", y los dos entran al aprendizaje como clase
    negativa. Es el precio explícito: se acepta porque un juicio que nadie emite vale menos que uno
    grueso que sí se emite.
  - **En contra:** el glosario cambia — *Calificación* y *Estado* dejan de ser independientes. Un
    lector de ADR-021/ADR-022 que espere dos ejes va a encontrar uno.
  - **Reversible con costo de hábito, no de datos.** Volver a dos campos es agregar un control: lo
    escrito sigue siendo válido en los dos modelos. Lo que cuesta revertir es el re-entrenamiento
    del equipo, no una migración.

- **Alternativas descartadas:**
  - **Dejar los dos campos independientes (el status quo).** Es lo que produjo el 14% de aprobados
    sin emoji y las 290 decisiones por semana. Fiel al glosario, pero el glosario describía un
    modelo que en la práctica se llenaba a medias.
  - **Estado como acto principal y 🔥 como marca opcional encima de los aprobados.** Reintroduce la
    segunda decisión exactamente donde hoy se pierde: el 🔥 quedaría opcional, y es el campo que
    ADR-022 necesita. Además elimina el 👍 como concepto, que es vocabulario que el equipo ya usa.
  - **Derivar al revés: el acto es aprobar/descartar y la calificación se infiere.** Imposible por
    construcción — de `aprobado` no sale si fue 🔥 o 👍, y esa distinción es justo la información
    que ADR-022 consume.

- **Toca `core/`:** no. No cambia contratos ni schema: `app.candidatos` ya modela los dos campos con
  estos mismos valores, y la fachada del motor no los ve. D6 tampoco es un corte de D5 — Airtable
  sigue siendo el dueño de `Candidatos` y `Descartes del gate` hasta D7, así que las dos tablas
  siguen en el catálogo de sombra (`scripts/comun.ts`) y `sombra:diff` las sigue espejando.
