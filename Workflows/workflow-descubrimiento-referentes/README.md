# Descubrimiento de referentes — sugeridos IG → propuestos

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

## Qué toca y qué no

- **Lee:** Proyectos/Voces/Referentes/Ajustes/`Referentes propuestos` (Airtable),
  `v_senal_seleccion` y `runs` (Supabase).
- **Escribe:** `Referentes propuestos`, `Referentes` (solo promoción de aprobados), `runs`.
- **NO toca el motor de reels** ni la tabla `Candidatos`: nada entra al stream de candidatos sin
  aprobación humana.
- **Solo Instagram en v1** (el actor TikTok en uso no expone cuentas sugeridas).

## Operación

Importar `workflow.json` en n8n, completar el nodo `Config` (`<<AIRTABLE_BASE_ID>>`,
`<<SUPABASE_URL>>`, `<<INSTANCE_ID>>`) y la `<ANTHROPIC_API_KEY>` del nodo `Vetting relevancia
(Haiku)`, mapear credenciales (Airtable PAT, Supabase Registro, apifyApi). Cron: lunes 9:00
`America/Bogota` (1h después del motor, con la señal fresca del archivado del domingo). El resto
del runbook (test incluido) está en [workflow.yaml](./workflow.yaml).

**Flujo del equipo (no-code):** revisar la vista de `Referentes propuestos` → marcar `estado`
`aprobado` o `descartado` → a la corrida siguiente los aprobados aparecen en `Referentes` y el
motor los empieza a rastrear.
