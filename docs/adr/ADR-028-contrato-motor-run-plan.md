# ADR-028 — El motor lee su config por un endpoint de la app (`GET /api/engine/run-plan`)

- **Estado:** aceptada — 2026-07-19 (decisión de Mani, arquitecto). Resuelve el "cómo" que deja
  abierto [ADR-027](./ADR-027-postgres-fuente-unica-de-config.md).
- **Contexto:** al migrar la config a Postgres, los nodos del motor que hoy leen Airtable (`Leer
  Voces`, `Leer Proyectos`, `Leer Referentes`, `Leer Ajustes`, y sus equivalentes en archivado y
  descubrimiento) tienen que leer de otro lado. Cada opción define cuánto sabe el motor del schema:
  si lo conoce, cada `alter table` obliga a un re-import — y el re-import es el eslabón débil
  documentado del sistema (los fixes del repo no son live hasta re-importar a mano).
- **Decisión:**
  1. La app expone **`GET /api/engine/run-plan`**, autenticado con **header compartido** (mismo
     patrón y mismo gestor de contraseñas que el webhook de
     [ADR-023](./ADR-023-disparo-on-demand-boton-airtable.md)). Devuelve un JSON **versionado**
     (`{ version, generado_en, voces[], proyectos[], referentes[], ajustes{} }`).
  2. **El endpoint resuelve exactamente los filtros que hoy resuelve Airtable server-side, y nada
     más:** solo voces `activo`, solo proyectos `activo` de voz activa, solo referentes `activo`, y
     la `N` de cada proyecto ya resuelta contra su default global. **El scoring, el gate, el corte
     por proyecto y el spillover se quedan en el motor** — `Armar plan de corrida` no se vacía, y
     `test-nodos.mjs` conserva su valor como red de regresión.
  3. **En el motor esto es un nodo, no una refactorización:** 4+ nodos Airtable → 1 HTTP Request.
     Los nodos viejos **se reemplazan, no se duplican**: nada de una rama Airtable y otra Postgres
     conviviendo en el mismo workflow (esa coexistencia vive del lado de la app, que es lo que la
     fachada compra). El resto del `workflow.json` no cambia.
  4. **Fail-closed a propósito:** si el endpoint no responde, la corrida **no arranca** y no gasta
     créditos. Una corrida sin config es una corrida que entrega ruido; no entregar es mejor.
  5. El campo `version` gobierna la compatibilidad: mientras no cambie, la app puede refactorizar
     el schema sin tocar n8n. Un cambio de forma sube la versión y **ahí sí** hay re-import.
- **Alternativas descartadas:**
  - *Nodos Postgres nativos de n8n:* reemplazo 1:1 sin código nuevo, pero acopla el motor al schema
    (cada columna renombrada = re-import) y obliga a darle credenciales de base de datos a n8n,
    ampliando la superficie de exposición de un secreto que ya se filtró dos veces.
  - *Vistas SQL de compatibilidad + PostgREST:* minimiza el diff del `workflow.json`, pero deja
    vistas de compatibilidad que hay que mantener para siempre y que se vuelven un segundo modelo
    de datos de facto.
  - *Mover el plan entero (scoring y corte) a la app:* tentador, y probablemente el destino final.
    Hoy no: duplicaría el trabajo del corte con la migración encima, y el corte ya tiene tests y
    una enmienda reciente (ADR-024 + spillover). Se re-evalúa cuando la migración cierre.
- **Consecuencias:**
  - (+) El motor deja de conocer el schema. La app puede evolucionar la base sin re-imports, que es
    la deuda operativa más cara del sistema hoy.
  - (+) Un solo lugar donde se decide "qué se corre": la misma función que alimenta la pantalla del
    operador alimenta al motor. No hay dos verdades sobre qué proyecto está activo.
  - (−) **La app se vuelve dependencia de ejecución del motor.** Matiz importante: no es una
    dependencia *nueva* — hoy ese lugar lo ocupa Airtable, con la misma criticidad y menos
    control. El invariante #1 de PLAN §2.5 sigue intacto en lo suyo: el **registro** (`runs`,
    `outputs`) nunca bloquea una corrida.
  - (−) Un secreto más que rotar (el header del endpoint). Va al gestor, con los otros.
  - El disparo sigue siendo **señal desnuda** (ADR-023): el botón hace POST sin payload y el motor
    pregunta qué correr. Ese contrato no cambia, solo cambia a quién le pregunta.
- **Toca:** `apps/dashboard/` (el endpoint) · los 3 `workflow.json` (los nodos de lectura) ·
  `core/contracts/ingesta-registro.md` (gana un contrato hermano de *lectura*). Cuándo se corta:
  fase **D4** de [plan-cockpit-propio.md](../agents/plan-cockpit-propio.md).
