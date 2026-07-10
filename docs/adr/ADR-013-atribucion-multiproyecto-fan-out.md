# ADR-013 — Atribución multi-proyecto: fan-out de un video a cada proyecto que lo reclama

- **Estado:** aceptada — 2026-06-18 (grilling con Mani; grado 1 / MVP). Revisa la nota de consecuencias
  de [ADR-012](./ADR-012-senal-de-aprendizaje-bi-eje.md) sobre keywords compartidas. **Enmendada por
  [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md)** (2026-07-09): la evaluación sigue siendo
  por (video, proyecto), pero la **emisión** es una sola por video — gana la copia con mejor relevancia.
- **Contexto:** el motor descubre videos por **referente** (cuenta sembrada) y por **keyword/hashtag**,
  y los atribuye a un Proyecto (con su Voz) en `Asignar proyecto+voz`, antes de juzgar relevancia. Un
  mismo referente o keyword puede estar ligado a **varios proyectos activos a la vez** (en la base viva,
  @howtoconvince está en 3 proyectos, @jefferson_fisher en 2, todos del mismo árbol temático de
  comunicación). El código atribuía cada video a **un solo** proyecto: `ig_owner_to_proj`/`tt_owner_to_proj`
  eran escalares (gana el último proyecto en orden de Airtable) y la keyword tomaba `kw[t][0]` (gana el
  primero). Como la atribución pasa **antes** del gate, si el video era más relevante para el otro
  proyecto, lo juzgaba el gate equivocado y se perdía. El glosario decía "los resultados no se cruzan
  entre proyectos", lo que volvía esto una decisión de dominio, no solo un bug.
- **Decisión:**
  1. **Fan-out:** un video se evalúa contra **cada proyecto activo que lo reclama** (referente ∪
     keyword), cada uno con su criterio, su voz y su heat-score. Puede terminar como Candidato en más
     de un proyecto. La unidad de curación pasa a ser la dupla **(video, proyecto)**, no el video.
  2. **El gate limita el duplicado solo:** un video solo produce dos filas si pasa **los dos** gates de
     relevancia. Lo off-topic para el segundo proyecto se cae ahí → una fila. Solo se duplica lo
     genuinamente cross-relevante.
  3. **Reclamo:** el referente reclama con `tema=''`; la keyword aporta el término matcheado. Un
     proyecto reclamado por referente conserva `tema=''` aunque también matchee una keyword (prioridad
     referente, coherente con ADR-012).
  4. **Grado 1 (este ADR, MVP): sin tocar el schema.** El dedup sigue **global por `external_id`**
     (`processed_items UNIQUE(platform, external_id)`, `outputs UNIQUE(external_id)`). Consecuencia
     aceptada: un video cross-relevante se ofrece a sus proyectos **una vez** (al descubrirlo, donde
     ambas copias fluyen porque el filtro `seen` solo mira corridas previas) y no reaparece; el
     histórico guarda **una** fila por video (la señal de aprendizaje por-proyecto queda un poco más
     gruesa, lo mismo que ADR-012 ya aceptó como refinable post-MVP).
- **Alternativas descartadas:**
  - *Dueño único determinista (1 video → 1 proyecto):* más barato y respeta el invariante viejo del
    glosario, pero pierde el contenido cross-relevante para el segundo proyecto. El objetivo era no
    perderlo.
  - *Una fila con el tag Proyecto multi-valor:* rompe el scoring por proyecto — `heat_score`,
    `relevancia_score`, `relevancia_razon` y `voz` son por proyecto, y el `top_n` rankea por proyecto;
    una sola fila no puede sostener dos juicios ni entrar en dos rankings.
  - *Grado 2 (fan-out "propio") ahora:* cambiar el grano del dedup a `(platform, external_id, proyecto)`
    en `processed_items` + `outputs` + el filtro `seen` daría aprendizaje por-proyecto limpio y
    re-surgimiento por proyecto, pero cuesta migración en `core/` + tocar el workflow de archivado.
    **Diferido a post-MVP**; se reabre este ADR cuando el solape entre proyectos activos lo justifique.
- **Consecuencias:**
  - (+) No se pierde contenido relevante para un proyecto por haberse atribuido a otro.
  - (+) El embudo escala a cualquier combinación de proyectos/voces/keywords activos: todo está keyed
    por `proyecto_id` (heat-score, gate, top_n agrupan por proyecto).
  - (−) El equipo puede ver el **mismo video dos veces** en Candidatos (distinto proyecto/voz). Es
    intencional; el `url_referente` y el título idénticos lo hacen reconocible. Control de config: ligar
    un referente/keyword a varios proyectos solo cuando se quiere esa doble evaluación.
  - (−) Costo: transcripción (Supadata) + gate (Haiku) corren una vez **por proyecto** en el solape.
    Despreciable con cron semanal y config chica; acotable con los knobs de ADR-011.
  - (−) Aprendizaje por-proyecto más grueso y sin re-surgimiento (límite del grado 1, ver arriba).
- **No toca `core/`** (grado 1): solo el motor — `Armar plan de corrida` (owner maps escalar → array),
  `Asignar proyecto+voz` (fan-out), `Pre-trim relevancia` (descarte por `(proyecto, external_id)` para
  que el drop de un proyecto no mate la copia del otro). El fix de idempotencia del nodo 31
  (`on_conflict=external_id`, pendiente D3) calza con esto: hace que los `external_id` repetidos entre
  proyectos no revienten el batch del archivado.
