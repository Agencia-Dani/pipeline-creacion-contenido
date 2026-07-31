# ADR-032 — Un referente alimenta N proyectos: la relación es N:M y va en tabla puente

- **Estado:** aceptada — 2026-07-31 (decisión de Mani, arquitecto). Corrige el modelo que
  [la migración `009`](../../core/schema/009_app_config_sombra.sql) le dio a `app.referentes`
  antes del corte 2/4 de [D5](../agents/plan-cockpit-propio.md#d5--corte-de-la-config-dominio-por-dominio-sin-tocar-n8n).

- **Contexto:** en Airtable, `Referentes.proyecto` es un `multipleRecordLinks` y el motor lo recorre
  **como lista** (`Armar plan de corrida`: `(Array.isArray(f.proyecto) ? f.proyecto : []).forEach(…)`,
  empujando el handle a los `ig_handles`/`tt_handles` de **cada** proyecto enlazado). O sea la
  relación referente↔proyecto **ya es N:M en producción**, y lo es desde que existe el banco.

  `app.referentes` (migración `009`) le dio una sola columna `proyecto_id uuid`, y el mapeo del modo
  sombra la llenó con `link()` = el **primer** elemento del array. Medido contra la base viva el
  2026-07-31, antes de flipear:

  | | Airtable (hoy) | `app.referentes` (el modelo de `009`) |
  |---|---|---|
  | pares (referente, proyecto) | **35** | **16** |
  | referentes que cruzan voces | 4 | 0 |
  | handles del proyecto *Storytelling* | 5 | **0** |

  *Storytelling* no es `proyecto[0]` de ninguno de sus 5 referentes: con el modelo de `009`, el corte
  2/4 lo habría dejado **sin ninguna fuente**, entregando cero candidatos, sin un error en ningún
  lado. El orden del array de links de Airtable es un detalle de presentación, así que qué proyecto
  sobrevive al truncamiento es, además, arbitrario.

  **Por qué el modo sombra (D3) no lo detectó, aunque dio "espejo perfecto ×2":** el diff compara
  *Airtable ya mapeado* contra *Postgres*, y el mapeo trunca a `[0]` **de los dos lados**. La
  dimensión perdida le es invisible por construcción. La regla general que queda: **un diff que
  pasa por el mapper no puede detectar lo que el mapper tira** — lo que valida es la fidelidad del
  transporte, no la del modelo.

- **Decisión:**
  1. **`app.referentes_proyectos (referente_id, proyecto_id)`**, PK compuesta y FKs reales con
     `on delete cascade`. Es la relación, con nombre propio.
  2. **`app.referentes.proyecto_id` se elimina** (migración `012`, con backfill de la puente antes
     del `drop`). Dos lugares donde vive el mismo vínculo es exactamente el "dos dueños del mismo
     dato" que prohíbe [ADR-027](./ADR-027-postgres-fuente-unica-de-config.md).
  3. **La fachada sigue devolviendo `fields.proyecto` como array** de ids (contrato v1 intacto): la
     puente se lee y se colapsa a la lista que el motor ya sabe recorrer. **`version` no sube y no
     hay re-import** — que es justo la libertad que compró [ADR-028](./ADR-028-contrato-motor-run-plan.md).
  4. **Un referente puede cruzar voces y se sigue permitiendo** (hoy lo hacen 4). El motor ya avisa
     y no filtra; la pantalla del banco muestra el aviso. La puente no lo prohíbe: si algún día se
     decide que no (la pregunta abierta de [mapa-campos §2.5](../agents/mapa-campos.md)), es un
     constraint que se agrega, no un modelo que se rehace.

- **Alternativas descartadas:**
  - *`proyecto_ids uuid[]` en `app.referentes`:* menos piezas, pero Postgres no valida FKs dentro de
    un array (haría falta un trigger para lo que una tabla da gratis) y las consultas por proyecto
    quedan con operadores de array. Se descartó por garantías, no por costo.
  - *Dejar `proyecto_id` y aceptar el truncamiento:* mide 19 pares perdidos de 35 y un proyecto
    activo en cero. No es una simplificación, es una pérdida de datos silenciosa.
  - *Dejar `proyecto_id` vivo "por compatibilidad" junto a la puente:* dos dueños del mismo vínculo,
    divergencia garantizada en la primera edición desde la pantalla.

- **Consecuencias:**
  - (+) El corte 2/4 puede hacerse sin perder supply, que era la condición para hacerlo.
  - (+) La pantalla del banco puede editar los proyectos de un referente de verdad (hoy, en el
    modelo viejo, "cambiar de proyecto" habría significado perder los otros).
  - (+) El diff de sombra pasa a comparar **conjuntos** de proyectos, así que deja de ser ciego a
    esta clase de diferencia para los dominios que todavía no cortaron.
  - (−) Una migración más (`012`), que se aplica a mano en el SQL Editor como todas.
  - (−) `mapearReferente` deja de devolver una fila plana: el import de sombra escribe en dos tablas.
    Se paga una vez y muere con Airtable en D8.

- **Toca:** `core/schema/012_referentes_proyectos.sql` · `apps/dashboard/domain/sombra.ts` (mapeo y
  diff) · `apps/dashboard/scripts/` (import en dos tablas) · `apps/dashboard/lib/config.ts` (la
  costura del corte) · las pantallas del banco y de Sugeridos. **No toca los `workflow.json`:** el
  contrato de la fachada no cambia de forma.
