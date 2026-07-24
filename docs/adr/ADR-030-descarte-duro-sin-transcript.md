# ADR-030 — Descarte duro de los videos sin transcript (revierte la decisión #6)

- **Estado:** aceptada — 2026-07-24 (audit del run manual de Jero, con Mani). **Revierte la decisión #6**
  (2026-07-09: "sin transcript pasa igual, con marca `⚠️ SIN GUION`") y **acota el invariante #1**
  (fail-open) del [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md).
- **Contexto:** el gate juzga el `script` (transcript traducido) o, si no hay, el caption como fallback,
  y el candidato salía igual con el título prefijado `⚠️ SIN GUION`. En el run del 23/07, **8 de 31
  candidatos (26%) llegaron sin guion** — casi siempre videos sin voz (música, texto en pantalla). El
  equipo de redes los descarta de una: no aportan (el entregable es el guion, ADR-009) y **queman
  cupo** (consumen un lugar de los N del proyecto). Upstream, 41 de 100 transcripciones volvieron
  vacías (41%): parte es Supadata fallando, parte son videos que no tienen voz que transcribir.
- **Decisión:**
  1. **Sin transcript = descarte duro, en la entrada del `Gate de relevancia`.** Es el punto exacto:
     ya se sabe si hay guion (post-Transcribir) y todavía no se gastó Haiku (pre-juicio). Los sin-guion
     salen marcados `_descarte: true, descarte_razon: 'sin_guion'`. Reusa la semántica `_descarte` de
     [ADR-021](./ADR-021-medicion-desempeno-embudo.md): `Armar candidato` ya los filtra → **no consumen
     N** (test en verde). No se les gasta ni una llamada a Haiku.
  2. **Se retira el fallback por caption en el gate.** Un caption no es un guion; juzgar por caption era
     lo que dejaba pasar los sin-voz. El gate solo juzga lo que tiene transcript.
  3. **Los descartes por sin_guion NO van a `Descartes del gate`.** Esa tabla es para auditar el
     *criterio* (veredicto "era bueno" = falso negativo); llenarla de videos mudos rompe ese loop
     (ADR-022) y se comería el `cap_descartes`.
  4. **El prefijo `⚠️ SIN GUION` en `Armar candidato` queda como tripwire:** si alguna vez aparece en el
     feed, es un bug upstream (ya no debería llegar ninguno).
  5. **Mitigación del 41% de vacías:** `Transcribir` reintenta 1 vez cuando la llamada falla o vuelve
     vacía (respetando el presupuesto) y **loguea la respuesta cruda** de las que quedan vacías, para
     distinguir "sin voz" (no reintentar nunca) de falla transitoria en la corrida de fuego.
- **Consecuencia dura, dicha sin eufemismo:** si Supadata se cae **entera**, la corrida entrega **0** —
  todo se descarta por sin_guion. Se prefiere una corrida vacía y **ruidosa** (aviso en
  `metricas.avisos`: "posible caída de Supadata: X% de transcripciones vacías") a un feed con 26% de
  basura que el equipo tira a mano. `Resumen del run` reporta `sin_guion` (videos descartados) y
  `transcripciones_vacias` (videos distintos sin transcript a la salida de Transcribir).
- **Interacción con la entrega (Falla 2 del audit):** descartar los sin-guion **baja el supply** que
  llega a candidato (~25% en el run del 23/07). Se compensa subiendo `cap_top_n` 100→250 y el
  presupuesto de transcripción a 840s (bajo el watchdog de 900s del pod) — más videos entran a
  transcribir. **N sigue siendo un techo exacto + meta best-effort** (ADR-016/024): garantizar N=40
  duro con supply finito es imposible sin bajar el gate a cero. Lo que se garantiza nuevo es
  **visibilidad**: `metricas.por_proyecto` reporta `tasa_gate` y `razon_faltante`
  (`supply`/`gate`/`mixta`) por proyecto. La palanca de fondo para llenar N es **más referentes
  activos** (el descubrimiento de ADR-020 los propone; el equipo aprueba).
- **Alternativas descartadas:**
  - *Mantener la decisión #6 (marca visible, no descarte):* es lo que el equipo ya rechazó; los
    ⚠️ SIN GUION son descarte automático de ellos, así que la marca solo movía el trabajo aguas abajo.
  - *Descartar en `Armar candidato` en vez del gate:* más tarde, gastaría Haiku en videos mudos.
  - *"Modo reponer" (segunda pasada si entregados < N):* re-scrapea el mismo supply contra la misma
    memoria de dedup → mismo pool, doble costo, cero candidatos nuevos. Con `razon_faltante` visible, la
    respuesta correcta a un faltante es operativa (más referentes / aflojar criterios), no mecánica.
- **Toca:** `Gate de relevancia` (split sin-guion, sin fallback por caption, log por proyecto),
  `Preparar batch Descartes` (excluye sin_guion), `Transcribir (Supadata)` (retry + log crudo),
  `Armar candidato` (prefijo → tripwire), `Resumen del run` (`sin_guion` redefinido +
  `transcripciones_vacias` + aviso). Config: `cap_top_n` 250, `presupuesto_transcribir_s` 840
  (+ `workflow.yaml`). Docs: onboarding del equipo, dev-doc, CLAUDE.md. Probado en `test-nodos.mjs`
  (harness `runGate`, 5 casos + 2 de retry). Sin cambio de schema SQL (`runs.metricas` es jsonb).
