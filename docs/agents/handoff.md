# HANDOFF — estado vivo del MVP de reels

> **Si vas a trabajar en el repo, leé esto primero (2 min).** Acá vive el estado real: qué task
> está libre, quién tiene qué, y qué pasó en las últimas sesiones. El *qué hacer y cómo* de cada
> task vive en [ROADMAP §3](./ROADMAP.md); el contexto de producto en [ROADMAP §1](./ROADMAP.md) y el
> diseño en [PLAN.md](./PLAN.md). El tablero activo del refactor vive en
> [refactor-voces-proyectos.md §4–§5](./refactor-voces-proyectos.md) (componentes A–E).

## Protocolo (lo único que hay que respetar)

1. **Al tomar un task:** ponete como dev y pasalo a 🔧 en el tablero. Commit chico ("toma B1").
   Así nadie duplica trabajo.
2. **Al terminar la sesión** (termines o no el task): actualizá el tablero, y agregá una entrada
   al log de abajo — *qué se hizo · qué quedó a medias · gotchas/aprendizajes · qué sigue*.
   Marcá `[x]` lo completado en el checklist del ROADMAP. Commit + push de todo junto.
3. **Credenciales e IDs: JAMÁS acá ni en ningún archivo del repo.** Todo va al gestor de
   contraseñas compartido (el validador escanea secretos en cada corrida).
4. Si un task revela que el diseño está mal → no parchear en silencio: anotarlo en el log y
   discutirlo (si es estructural, termina en ADR).

**Estados:** ⬜ libre · 🔧 en curso · ✅ hecho · ⛔ bloqueado

## Pendiente vivo (arrastres manuales de Mani — antes de la próxima corrida real)

> Todo esto está **en el repo pero NO aplicado en n8n / la base viva**. Es el eslabón débil de siempre:
> los fixes del repo no son live hasta re-importar (ver memoria `reimport-eslabon-debil`).

- 🔴 **RE-IMPORT de los 3 `workflow.json` en n8n** — arrastra TODO lo apilado (M1, M2/ADR-022, costos $
  y contadores Apify/ADR-021 bis, `normLang`). Mapear credenciales a los nodos nuevos + rellenar
  placeholders (`<ANTHROPIC_API_KEY>`, `<SUPADATA_API_KEY>`, `<<AIRTABLE_BASE_ID>>`, `<<SUPABASE_URL>>`,
  `<<INSTANCE_ID>>`). Hasta esto, M2/costos/contadores quedan vacíos.
- 🔴 **ROTAR credenciales** — PAT Airtable, service_role Supabase, Anthropic, Supadata (arrastres +
  el PAT quedó expuesto en chat en cierre 36; nunca se escribió a archivo).
- 🟠 **5 fixes de UI en Airtable** (la API no los hace): `veredicto` editable en *Descartes*; curar
  *Métricas de Calidad* y *Salud del Sistema*; **publicar** la página *Costos* + desglose Apify/DESCUBRIMIENTO
  + fijar decimales; `precision` como %; filtro *Referentes propuestos* → `estado=propuesto`.
- 🟠 **Equipo:** sembrar 3–5 referentes TikTok (bootstrap del eje TT); aprobar *Referentes propuestos*.
- 🟠 **Doc pendiente (ADR-024, autorizado pero no hecho):** `setup-airtable.mjs` + `airtable-cockpit.md`
  aún describen N como global → actualizar en una sola pasada con la racionalización de campos de A.2.
- 🟡 **12 archivos staged sin commitear** de cierres 37–38 (Mani decide cuándo).

## Tablero activo — refactor Voces→Proyectos

El detalle de cada componente y el "hecho cuando" viven en
[refactor-voces-proyectos.md](./refactor-voces-proyectos.md). Arranque (§5): **A.1 + A.2 juntos** primero
(de-riesgan el motor), después split.

| Componente | Qué | Carril | Estado |
|---|---|---|---|
| **A** Auditoría del pipeline vivo | mapa nodo/campo/página + reconciliar repo↔live + decisión §3 (ADR) | Dev 1 | ⬜ |
| **B** Dashboard / Cockpit | flujo del operador, botón de disparo, racionalización de campos, Métricas/Costos | Dev 1 | ⬜ |
| **C** Motor de búsqueda | N por proyecto (ADR-024), `Voces.activo`, corte por proyecto, webhook single-flight (ADR-023) | Dev 2 | ⬜ |
| **D** Archivado | confirmar que corridas por-proyecto no rompen Métricas/salud semanal | Dev 2 | ⬜ |
| **E** Capa de datos | `Voces.activo`, campos de disparo, racionalización (autorizado por el ADR de A.5) | Dev 1 | ⬜ |

ADRs cerrados que gobiernan el refactor: [ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)
(disparo on-demand), [ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md) (N por proyecto).

## Log de avance (más reciente arriba)

**2026-07-15 (cierre 41) — Limpieza del repo antes del refactor + compactación de este handoff (Mani + Claude).** Pedido de Mani: dejar el repo lo más limpio posible para arrancar el refactor Voces→Proyectos con lo que de verdad importa. **NO es código — es higiene de docs.** **Survey completo:** la mayoría de lo que parecía borrable resultó load-bearing y se verificó uno por uno (substack = workflow probado en prod parkeado para F3; `clients/` + schemas = invariante multi-cliente que `validate.mjs` testea; transcript 06-12 = citado por README/ROADMAP/PLAN/ADR-009). **Decisiones de Mani:** quedan los dumps gitignored (`outputs-*`, `dist`, `.DS_Store`) y los snapshots `workflow-versions/`; `deploy.mjs` queda como semilla F5. **Borrados (2 docs que describían un flujo que ya no aplica):** `guia-reunion-redes.md` (prep de una reunión ya pasada) y `refactor-relevancia.md` (plan de un refactor ya ejecutado). **Dead links limpiados** en los 7 referrers: `CLAUDE.md` (mapa de docs), `airtable-cockpit.md` (core/, fix de link), `workflow.yaml` (×2), `refactor-voces-proyectos.md` (Component A ahora apunta solo a dev-doc), ADR-010/021/022 (los punteros al plan → "histórico en git"). Validador **1212/0**, secretos limpios. **Este handoff:** compactado de 1743 líneas — el log histórico (cierres 1–39) se destiló a una línea por cierre; las secciones de planes de producción M0–D3 y la auditoría 2026-06-16 (todas superadas, ✅ resueltas) se retiraron (viven en git: `git log docs/agents/handoff.md`); se consolidó el *Pendiente vivo* y se puso el tablero A–E del refactor como activo. **Próxima skill sugerida:** arrancar A.1/A.2 (`/improve-codebase` o directo) + el motor lane con `/tdd` sobre C.1.

**2026-07-15 (cierre 40) — Grilling del refactor Voces→Proyectos: se verifica el norte contra ROADMAP/ADRs y se cierran 2 ADRs (Mani + Claude).** Pedido de Mani: interrogarlo a fondo para verificar que el norte del refactor es lo que de verdad quiere y que el plan ([refactor-voces-proyectos.md](refactor-voces-proyectos.md)) está alineado con el contrato y los ADRs. **NO es código, es alineación + docs.** Se resolvieron 5 ramas, 2 eran desalineaciones reales, no cosméticas. **(1) El norte se contradecía:** el refactor decía "sin depender del cron" contra ROADMAP §1 "corre sola" → por la regla *gana el norte*, había que reconciliar. **Decisión: los 2 modos COEXISTEN** (cron semanal autónomo + on-demand se suma, no lo retira). ROADMAP §1 enmendado por escrito. **(2) El contrato de disparo del plan (`{project_id, N}`) quedó superado** por una simplificación de Mani durante el grill: **señal desnuda** (botón Airtable → "Run automation" → webhook de Producción n8n, sin payload) y **el motor lee Airtable** (toggles + N por proyecto). Una corrida = **todos los proyectos activos**, cada uno a su N; la selección se expresa con los toggles, no con un payload. Webhook **single-flight** (no arranca si ya hay corrida; el *cómo* queda para C.3). → **[ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)** (cerrado). **(3) N por proyecto revierte a conciencia ADR-016:** N vuelve a `Proyectos`, el global `Candidatos por corrida` pasa a **default por proyecto**, misma semántica en cron y on-demand, **corte final por proyecto**, `cap_top_n` intacto como techo duro total. Trade registrado: se cambió costo-predecible por control por proyecto (el cap es el cinturón). → **[ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)** (cerrado, enmienda ADR-016). **(4) Secuencia de la auditoría des-serializada:** A.1+A.2 juntos primero (de-riesgan el motor); después **split de A** — C/D/E son tool-agnósticas y el motor lane arranca en paralelo, mientras Dev 1 termina A.3–A.5 + la decisión §3 (que sólo gobierna la forma de B). **(5) Chequeo que dio consistente:** `Voces.activo` vs la enmienda ADR-010 (gate operativo, no filtro de relevancia — no chocan). **Knock-on:** cada decisión hizo el eje operativo caber mejor en Airtable → la pregunta §3 (Airtable vs dashboard) se **acota** a lo analítico read-only (Métricas/Costos); el operativo se queda en Airtable. **Archivos (todo docs, sin código ni base viva):** nuevos ADR-023/024; ROADMAP §1 (enmienda), [ADR README](../adr/README.md) (2 filas + ADR-016 marcada enmendada), [context.md](context.md) (glosario: término *Corrida*), refactor-voces-proyectos.md (reescritas §0, §2, B.2, C.1, C.3, C.4, intro §4, §5, §6, §7). Validador **1230/0**, secretos limpios. **🟠 PENDIENTE anotado (motor lane, autorizado por ADR-024 pero NO hecho):** `setup-airtable.mjs` + `airtable-cockpit.md` todavía describen N como global — se deja para hacerlo en una sola pasada con la racionalización de campos de la auditoría (A.2), para no tocar campos adyacentes dos veces. **Todo lo de cierres 38–39 sigue igual** (re-import de los 3 workflows, 5 fixes de UI Airtable, rotar credenciales, sembrar TT, aprobar propuestas; 12 archivos staged sin commitear). **Próxima skill sugerida:** `/grill-with-docs` no más — arrancar la auditoría (A.1/A.2) con `/improve-codebase` o directo, y el motor lane con `/tdd` sobre C.1 (N por proyecto).

### Histórico (una línea por cierre; el detalle vive en git: `git log docs/agents/handoff.md`)

- **cierre 39** (07-15) — Prep de reunión con redes + auditoría del scoring del descubrimiento (afinidad = juicio semántico Haiku; similitud solo genera/desempata; 3 debilidades TT flageadas). *(La guía de reunión que creó, `guia-reunion-redes.md`, se borró en cierre 41.)*
- **cierre 38** (07-15) — Auditoría completa + reconciliación repo↔live + fix de docs (pre-sesión Airtable); working tree = ADR-021 bis + enmienda ADR-010; gaps de UI flageados.
- **cierre 37** (07-14) — Métricas lista + costos en $ (Supadata/Haiku vivos, Apify implementado) + página *Costos* (borrador) + contadores Apify por actor en los 3 workflows.
- **cierre 36** (07-14) — Fase M2 (ADR-022) construida: loop de aprendizaje de criterios (motor lee `criterios_aprendidos`, archivado destila + salud por referente, 30→36 nodos) + página "A revisar".
- **cierre 35** (07-14) — Audit de 4 preguntas del equipo → higiene del archivado (barridos de descartes/Métricas) + `diagnostico` (semáforo sin IA) en Métricas.
- **cierre 34** (07-14) — Pipeline listo para el equipo: diagnóstico de integridad de los 3 workflows + onboarding actualizado + higiene del campo `idioma` (`normLang`).
- **cierre 33** (07-13) — Descubrimiento gana eje TikTok (ADR-020 §8, enmienda): rama paralela lookalike.
- **cierre 32** (07-13) — Diagnóstico del 1er ciclo real de M1 + Fase Volumen/Utilidad + fixes de M1.
- **cierre 31** (07-10) — 3 mejoras de robustez/costo del motor antes de la corrida de prueba.
- **cierre 30** (07-10) — ADR-021/022 firmados + Fase M1 (medición) construida: motor 30→33 nodos, archivado 18→24, cockpit 6→8 tablas + 3 páginas.
- **cierre 29** (07-10) — ADR-020 ejecutado: motor de descubrimiento de referentes construido (workflow nuevo, 24 nodos).
- **cierre 28** (07-10) — ADR-019 ejecutado: remoción TOTAL del eje keyword, motor solo-referentes (36→30 nodos).
- **cierre 27** (07-09) — Auditoría de calidad del run 07-09 + 3 decisiones ejecutadas (pre-trim por eje, marca ⚠️ SIN GUION, keywords OFF).
- **cierre 26** (07-09) — Run manual de Jero diagnosticado: duplicados = fan-out con proyectos gemelos.
- **cierre 25** (07-07) — 1er run automático real (con config del equipo) revisado + 2 fixes.
- **cierre 24** (06-26) — Entra a PRODUCCIÓN: archivado pasa a semanal + base limpiada de pruebas.
- **cierre 23** (06-25) — Audit final pre-producción + Ajustes verificados en vivo + dirección keyword.
- **cierre 22** (06-25) — ADR-017: motor listo para prod, keyword TikTok reactivado como toggle + 3 toggles.
- **cierre 21** (06-24) — Refactor post-producción firmado: referente-only + keyword dormido.
- **cierre 20** (06-24) — Dashboard del equipo (interfaz Airtable "Cockpit Redes") construido.
- **cierre 19** (06-23) — Archivado corrido end-to-end + auditoría del ciclo de vida de documentos.
- **cierre 18** (06-23) — Run de Fase 3 diagnosticado = éxito + bug fan-out×dedup arreglado.
- **cierre 17** (06-23) — V1 en vivo diagnosticado = éxito + Fase 2 y código de Fase 3.
- **cierre 16** (06-23) — Fase 0 (artefacto final): metadata template + `deploy.mjs`.
- **cierre 15** (06-23) — 4 mejoras pre-cron de código (paginación, dedup acotado).
- **cierre 14** (06-19) — F3 resuelto (bug de código) + fan-out multi-proyecto (ADR-013) + D3 cerrado.
- **cierre 13** (06-18) — Run post-F1 verificado: embudo coherente, F1/F4/F5 en verde.
- **cierre 12** (06-18) — F1 cerrado en código: Merge antes de cada Normalizador.
- **cierre 11** (06-18) — Revisión nodo-por-nodo del último run con `outputs/*.json`.
- **cierre 10** (06-18) — Revisión del embudo Apify con los 4 outputs reales + estado vivo.
- **cierre 9** (06-18) — Fix reels-only en IG + auditoría del estado vivo.
- **cierre 8** (06-17) — Primera corrida con config real + diagnóstico de timeout (Dev3).
- **cierre 7** (06-17) — Docs + verificación + cierre de manuales.
- **cierre 6** (06-17) — Las 6 decisiones lockeadas ejecutadas en código.
- **cierre 5** (06-17) — V-run de este repo validada + fix del no-transcript.
- **cierre 4** (06-16) — Objetivos del MVP afilados + grill-me de cumplimiento.
- **cierre 3** (06-16) — Bugfix de orden + refactor front-to-back (grilling).
- **cierre 2** (06-16) — Stage 4 del refactor de relevancia cerrado en `main`.
- **cierre 1** (06-16) — Refactor de relevancia Stages 1–3 en `main`: doble gate Haiku.
- **06-16** (noche) — V1 corrió y pobló Candidatos; abierto el refactor de relevancia.
- **06-16** (tarde) — Bloqueante #6 resuelto: Apify migrado a community node.
- **06-16** — Carril C completo (C2 + C3, Dev 3).
- **06-14** — Motor B3 construido + n8n listo para correr (`workflow.json`, ADR-009).
- **06-13** — Carril A en curso (Alejo): Supabase con `service_role`.

> **Planes de producción M0–D3 y auditoría técnica 2026-06-16:** ejecutados y superados por el estado
> actual; se retiraron de este handoff en cierre 41. Recuperables en git si hicieran falta.
