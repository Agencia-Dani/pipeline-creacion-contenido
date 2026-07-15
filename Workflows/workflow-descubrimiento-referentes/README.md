# Descubrimiento de referentes — sugeridos IG + TikTok → propuestos

El workflow que **amplía el banco de referentes** (Etapa A del embudo: descubrir creadores ≠ curar
contenido). Desde ADR-019 el motor de reels se alimenta solo de `Referentes`; este workflow es el
que evita que esa lista se agote: cada semana propone cuentas nuevas *parecidas a las que ya
funcionan* y el equipo decide cuáles entran. El porqué de cada decisión está en
[ADR-020](../../docs/adr/ADR-020-motor-descubrimiento-referentes.md).

## Cómo funciona (una corrida)

1. **Promoción** — las filas de `Referentes propuestos` que el equipo marcó `aprobado` se crean
   como `Referentes` (activo ✓, con la razón en `notas`) y pasan a `promovido`. El equipo nunca
   copia a mano.
2. **Semillas** — referentes IG activos de proyectos activos, rankeados por `v_senal_seleccion`
   (tasa de selección del equipo); sin señal entran todos. Tope `cap_semillas` (8).
3. **Sugeridos** — Apify `instagram-profile-scraper` trae el perfil de cada semilla con sus
   `relatedProfiles` (las cuentas "sugeridas" del propio algoritmo de IG, ~20 por semilla).
4. **Dedup + ranking** — fuera privados, fuera handles ya en `Referentes` (activos o no) o en
   `Referentes propuestos` (cualquier estado: lo descartado no re-surge). El resto se rankea por
   frecuencia (sugerido por varias semillas > por una) y se corta a `cap_perfiles_detalle` (20).
5. **Detalle + vetting** — segunda pasada Apify (bio, seguidores, captions de últimos posts) y
   juicio Haiku contra los criterios Proyecto⊕Voz (mismo jurado del gate del motor, ADR-010).
   **FAIL-CLOSED**: si Haiku falla o el proyecto no tiene criterios, no se propone nada (acá el
   riesgo es inundar al equipo de ruido, no perder contenido).
6. **Propuestas** — las cuentas con afinidad ≥ `Afinidad mínima de propuesta` (0.6), cap
   `Propuestas por corrida` (10), entran a `Referentes propuestos` con `estado=propuesto`,
   afinidad, razón en español, bio, seguidores y qué semillas la sugirieron.

El run se registra en Supabase (`params.workflow='descubrimiento'`, barredor de zombies propio,
métricas `{semillas, sugeridos_unicos, detalle, vetteados, propuestos, promovidos}`). Todo el
workflow es **fail-soft**: cualquier pata externa que falle deja la corrida cerrar en `ok` con
menos resultados (los errores quedan en `console.log`).

## Cómo se puntúa una propuesta (qué es `afinidad`)

`afinidad` (0–1) es **solo el juicio semántico de Haiku** sobre qué tan del-tema es lo que publica la
cuenta, contra los `criterios_relevancia` (Proyecto⊕Voz). **No es un blend de similitud + métricas.**
Cada señal juega un rol separado:

- **Similitud** → *genera* los candidatos (IG `relatedProfiles`, TikTok lookalike), no los puntúa. En IG
  la **frecuencia** (sugerido por N semillas) decide cuáles ~20 pagan el detalle; en TikTok el `score`
  de similitud se guarda solo como **desempate** (`freq`) cuando dos cuentas empatan en `afin`.
- **Métricas (seguidores, views/likes)** → se recolectan y se guardan en la fila para que el equipo las
  vea, pero **el score las ignora a propósito**: ambos prompts le dicen a Haiku *"importa lo que publica,
  no su fama"*. El prescore por métricas es trabajo del **motor** (per-video), no del descubrimiento.

Por qué así: un referente es una **fuente permanente**; la calidad/viralidad de cada video la re-juzga
el motor aguas abajo (heat-score + gate). En el descubrimiento solo importa "¿esta cuenta postea del
tema consistentemente?". El score además **no viaja al motor**: sus únicos trabajos son filtrar (≥0.6)
y ordenar el top-10; una vez aprobada, la cuenta es un `Referente` común.

**Límites conocidos (por si el score sorprende):**
- **TikTok se juzga casi a ciegas.** El lookalike no expone captions → Haiku puntúa solo con bio +
  métricas (el prompt lo compensa siendo más conservador). Un `afin` TT es menos confiable que uno IG.
- **IG y TT comparten un solo ranking + un cap de 10.** `Armar propuestas` mezcla ambos y toma el top
  por `afin` — pero un 0.7 de IG (con captions) y uno de TT (bio sola) no son la misma confianza.
- **No hay piso de seguidores.** Al excluir métricas, una cuenta chica muy del-tema entra con el mismo
  peso que una grande. Deseable para nichos; si se quisieran solo fuentes con alcance, haría falta un
  `min_seguidores` (no existe hoy).

*Mejora anotada (ADR-020 §8):* una 2ª pasada `clockworks` para traer descripciones de TikTok pondría al
TT a juzgar sobre contenido como IG. Un piso de seguidores sería un knob de una línea si el alcance importa.

## Qué toca y qué no

- **Lee:** Proyectos/Voces/Referentes/Ajustes/`Referentes propuestos` (Airtable),
  `v_senal_seleccion` y `runs` (Supabase).
- **Escribe:** `Referentes propuestos`, `Referentes` (solo promoción de aprobados), `runs`.
- **NO toca el motor de reels** ni la tabla `Candidatos`: nada entra al stream de candidatos sin
  aprobación humana.
- **Instagram + TikTok** (ADR-020 §8). IG expande vía `relatedProfiles`; TikTok con el actor
  `dataovercoffee~tiktok-lookalike-search` (rama paralela, gate `IF — hay semillas TT` que idlea
  gratis con 0 referentes TT). El lookalike TT no atribuye por-semilla ni trae captions: el proyecto
  lo asigna el vetting Haiku por criterios y el juicio es solo sobre bio + métricas. Cap de costo
  `cap_lookalikes_tt` (default 15; $0.20/resultado). Requiere sembrar 3-5 referentes TT a mano para
  arrancar. El equipo prende/apaga cada eje con los toggles `Descubrir en Instagram` / `Descubrir en
  TikTok` en Ajustes (página Global; default ambos on).

## Operación

Importar `workflow.json` en n8n, completar el nodo `Config` (`<<AIRTABLE_BASE_ID>>`,
`<<SUPABASE_URL>>`, `<<INSTANCE_ID>>`) y la `<ANTHROPIC_API_KEY>` en **ambos** code de vetting
(`Vetting relevancia (Haiku)` y `Vetting TikTok (Haiku)`), mapear credenciales (Airtable PAT,
Supabase Registro, apifyApi). Cron: lunes 9:00
`America/Bogota` (1h después del motor, con la señal fresca del archivado del domingo). El resto
del runbook (test incluido) está en [workflow.yaml](./workflow.yaml).

**Flujo del equipo (no-code):** revisar la vista de `Referentes propuestos` → marcar `estado`
`aprobado` o `descartado` → a la corrida siguiente los aprobados aparecen en `Referentes` y el
motor los empieza a rastrear.
