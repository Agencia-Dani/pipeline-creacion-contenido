# ADR-020 — Motor de descubrimiento de referentes: sugeridos de Instagram + vetting Haiku + aprobación del equipo

- **Estado:** aceptada — 2026-07-10 (diseño derivado de la DIRECCIÓN 2026-06-23/#35 del handoff,
  reafirmada en cierre 23, y de [ROADMAP §5.5](../../ROADMAP.md)). **Completa
  [ADR-019](./ADR-019-remocion-total-eje-keyword.md)** (su consecuencia (−) "sin descubrimiento de
  cuentas nuevas" se cierra) y **concreta la Etapa A** del embudo de dos etapas (descubrir CREADORES
  ≠ curar CONTENIDO). **No toca el motor de reels** (queda tal cual salió de ADR-019, 30 nodos).
- **Contexto:** desde ADR-019 el motor se alimenta **solo de `Referentes`**; si un referente se
  agota, lo repone el equipo a mano. La auditoría del run 07-09 mostró que la calidad la definen las
  fuentes (2 referentes aportaron el 83% de los aprobados) y que el descubrimiento ciego por hashtag
  no dio calidad (2/60 aprobables). Falta el loop que reponga y amplíe el banco de referentes con
  cuentas *parecidas a las que ya funcionan*, con el humano en el punto ruidoso (vetting de cuentas),
  como pedía la DIRECCIÓN: propone → el equipo aprueba → se siembra.
- **Decisión:**
  1. **Workflow nuevo y aparte:** `Workflows/workflow-descubrimiento-referentes/` (n8n, cron semanal
     lunes 9:00 `America/Bogota` — una hora después del motor, con la señal fresca del archivado del
     domingo — + Execute manual). Reporta a `runs` con `params.workflow='descubrimiento'` y trae su
     propio barredor de zombies (mismo patrón que motor/archivado).
  2. **Fuente de similares = `relatedProfiles` de Instagram** (las cuentas "sugeridas" del propio
     algoritmo de IG), vía el actor oficial `apify~instagram-profile-scraper` (mismo publisher y
     mismo community node que ya usa el motor). **No hashtags**: ese camino murió con datos
     (ADR-019). Dos llamadas Apify por corrida: (a) perfiles de las **semillas** → `relatedProfiles`
     (~20 por semilla); (b) perfiles de los **sugeridos supervivientes** → `biography`,
     `followersCount`, `latestPosts` (captions) para el vetting.
  3. **Semillas = referentes IG activos, rankeados por `v_senal_seleccion`** (tasa de selección,
     desempate por calificados). Fail-open: sin señal (base nueva) entran todos los activos. Tope
     dev-only `cap_semillas` (8) en Config.
  4. **Dedup antes de pagar:** un sugerido se descarta si su handle ya está en `Referentes`
     (activo o no) **o** en `Referentes propuestos` (cualquier estado — un descartado por el equipo
     no re-surge). Se descartan privados. Los supervivientes se rankean por **frecuencia** (sugerido
     por N semillas > sugerido por 1) y se cortan a `cap_perfiles_detalle` (20, dev-only) antes de
     la segunda llamada Apify.
  5. **Vetting con Haiku, FAIL-CLOSED:** el mismo jurado estricto del gate (criterios Proyecto⊕Voz,
     ADR-010) juzga **bio + captions de últimos posts** → `{afin 0..1, razon}` por candidato y por
     proyecto reclamante; por handle gana el mejor score y se linkean los proyectos que pasan. A
     diferencia del motor (invariante fail-open), acá **si Haiku falla no se propone nada**: el
     riesgo de este workflow es inundar al equipo de ruido (riesgo (a) de la DIRECCIÓN), no perder
     contenido — un descubrimiento pospuesto se recupera solo la semana siguiente.
  6. **Salida = tabla nueva `Referentes propuestos`** en el cockpit (6 tablas otra vez): `handle`,
     `plataforma`, `proyecto` (link), `afinidad`, `razon`, `seguidores`, `bio`, `url`, `semillas`,
     `estado` (**propuesto / aprobado / descartado / promovido**). Se escribe con umbral
     `Afinidad mínima de propuesta` (Ajustes, 0.6) y cap `Propuestas por corrida` (Ajustes, 10).
     **El motor de reels NO lee esta tabla** — nada entra al stream de candidatos sin aprobación.
  7. **Promoción cerrando el loop, en el mismo workflow:** al inicio de cada corrida, las filas con
     `estado=aprobado` se **promueven**: se crea el `Referente` (activo ✓, notas con la razón y la
     fecha) y la fila propuesta pasa a `promovido`. El equipo solo marca un select; nunca copia a
     mano (máx. 10 promociones por corrida, el resto cae a la siguiente).
  8. **Solo Instagram en v1.** El actor de TikTok en uso (clockworks) no expone cuentas sugeridas y
     hoy hay 0 referentes TikTok sembrados. Cuando exista fuente confiable de similares TT, se
     agrega por enmienda.
- **Alternativas descartadas:**
  - *Hashtag-search como fuente (el #35 original):* era el diseño previo a los datos; ADR-019 probó
    que el descubrimiento ciego por hashtag no da calidad (3% aprovechable) y las keywords ya no
    existen en el cockpit.
  - *Proponer como filas de `Referentes` con `activo` destildado:* menos tablas, pero ensucia el
    banco curado (la grilla del equipo se llena de candidatos sin vetear) y un click accidental en
    `activo` mete ruido directo al motor. La tabla aparte es la frontera propuesto/curado.
  - *Actores third-party de "related profiles" (afanasenko, scraply):* más filtros, pero publisher
    no oficial y otro esquema de billing; el actor oficial ya trae `relatedProfiles` + los campos de
    vetting en una sola pasada.
  - *Que un LLM proponga cuentas "de memoria" o por web search:* alucina handles y no compone con
    la señal de selección; los sugeridos del propio IG son el recomendador real.
- **Consecuencias:**
  - (+) El banco de referentes se vuelve un **activo que compone**: cada corrida propone cuentas
    parecidas a las que el equipo ya aprobó, y `v_senal_seleccion` decide desde dónde se expande.
  - (+) Costo marginal: ~28 perfiles Apify (~$0.07 a precio Free) + 1-2 llamadas Haiku por corrida.
  - (+) El motor de reels no se toca; si el discovery falla una semana, no pasa nada (fail-soft:
    el run cierra `ok` con 0 propuestas y el error queda en `console.log`).
  - (−) Sesgo de burbuja: `relatedProfiles` expande alrededor de lo ya sembrado; nichos nuevos
    siguen entrando a mano (aceptado: es exactamente el "parecidos a los activos" de ROADMAP §5.5).
  - (−) 10 propuestas/semana es techo de crecimiento del banco (aceptado: el cuello real es la
    capacidad de vetting del equipo).
  - (−) Tabla y 2 filas de Ajustes nuevas en la base viva (checklist de creación en el runbook del
    workflow; el seed `setup-airtable.mjs` ya las trae para bases nuevas).
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (tabla `Referentes propuestos`, 5→6; 2
  knobs nuevos en `Ajustes`) y `core/scripts/setup-airtable.mjs` (seed de la tabla + las 2 filas).
  Supabase **no se toca** (el workflow solo lee `v_senal_seleccion` y escribe `runs`, ambas
  existentes).
