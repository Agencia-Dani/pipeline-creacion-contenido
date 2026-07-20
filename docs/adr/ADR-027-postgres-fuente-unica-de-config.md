# ADR-027 — Postgres es la fuente única de la config; Airtable se retira por dominio, con corte seco

- **Estado:** aceptada — 2026-07-19 (decisión de Mani, arquitecto). Cierra la ambigüedad que dejó
  [ADR-025](./ADR-025-cockpit-producto-propio.md): decía "conectado a Supabase", sin definir si
  Airtable seguía siendo el **store** de la config o solo la superficie.
- **Contexto:** hoy Airtable es las dos cosas a la vez. Las 9 tablas del
  [cockpit](../../core/contracts/airtable-cockpit.md) son **config que el motor lee nodo por nodo**
  (Voces, Proyectos, Referentes, Ajustes) y **espacio de trabajo del equipo** (Candidatos,
  Descartes, Propuestos), más dos tablas de Métricas que ya son proyección de Supabase. Dejar el
  store en Airtable y poner la app encima resuelve la superficie pero deja intactos los tres
  problemas de fondo: **dos dueños del mismo dato** (viola el invariante de PLAN §2.5), la cuota
  free (1.000 records / 1.000 API calls) que ya condiciona el diseño, y un rate limit que se
  convertiría en el techo de latencia de la UI.
- **Decisión:**
  1. **La config migra a Postgres** (schema `app` en el mismo proyecto Supabase). Supabase pasa a
     ser fuente de verdad de **todo**: config, histórico y métricas (NFR5, sin asterisco).
  2. **Las tablas de Métricas no se migran: se borran.** Eran una proyección de `runs`/`outputs`
     escrita por el archivado para que Airtable pudiera mostrarla. La app lee la fuente directo por
     vistas SQL; el archivado deja de escribir esa proyección.
  3. **La migración es por dominio, con corte seco por tabla.** Un dominio se migra completo:
     pantalla construida → datos migrados → el motor lee Postgres para *esa* tabla → la página de
     Airtable se marca histórica. **Nunca hay dos dueños de la misma tabla al mismo tiempo.**
  4. **Airtable sigue vivo y operable durante toda la migración** para lo que todavía no se migró.
     No hay big-bang y no hay ventana de "el equipo no puede trabajar".
  5. **Antes de cada corte, un diff.** Un script compara Airtable ↔ Postgres para ese dominio y
     tiene que dar cero diferencias antes de mover el motor. El corte se hace con evidencia.
- **Alternativas descartadas:**
  - *Airtable sigue de DB y la app es solo UI:* el camino más rápido y el que no arregla nada de lo
    de arriba. Además deja la latencia de la UI a merced de un rate limit de terceros.
  - *Postgres dueño + sync unidireccional a Airtable:* mantiene las dos superficies vivas, pero hay
    que construir y mantener un sync que además pisa lo que el equipo edite en Airtable — el peor
    modo de falla para gente no técnica (tu cambio desaparece sin explicación).
  - *Doble escritura desde la app:* escrituras parciales y divergencia silenciosa. Descartada por
    modo de falla, no por costo.
- **Consecuencias:**
  - (+) Un dueño por dato. Joins, constraints y RLS reales: la regla "un proyecto = UNA voz" —hoy
    imposible de hacer cumplir en Airtable, y que ya se rompió en vivo (mapa-campos §2.6)— pasa a
    ser una foreign key. La trampa del form *Nuevo Proyecto* (criterios opcionales ⇒ gate fail-open
    entregando ruido, §5.1-6) se cierra con un `not null`.
  - (+) Muere la cuota de 1.000 records: los Candidatos dejan de borrarse por presión de espacio.
  - (−) **Los `workflow.json` cambian.** La lógica del motor no se toca, pero sus nodos de lectura
    de config sí. Cómo se minimiza ese diff es [ADR-028](./ADR-028-contrato-motor-run-plan.md).
  - (−) Hay migración de datos que hacer bien: idempotente, verificable y repetible por dominio.
  - El [contrato del cockpit](../../core/contracts/airtable-cockpit.md) queda **congelado como
    documento histórico** y nace su reemplazo (`core/contracts/cockpit-datos.md`) a medida que cada
    dominio corta. No se mantienen los dos vivos.
- **Toca:** `core/schema/` (migraciones nuevas, schema `app`) · `core/contracts/` · los 3
  `workflow.json` (solo lectura de config) · `setup-airtable.mjs` (queda deprecado al cortar el
  último dominio). Orden y "hecho cuando" de cada corte:
  [plan-cockpit-propio.md](../agents/plan-cockpit-propio.md).
