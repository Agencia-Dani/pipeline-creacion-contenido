# ADR-059 — Lo que no se usa no existe: la poda de la balde 2, y por qué va en dos migraciones

- **Estado:** aceptada — 2026-08-05 (decisión de Mani, arquitecto, en sesión de grilling).
  Ejecuta la limpieza que D8 tenía apartada desde el cierre 77
  ([plan-cockpit-propio §D8](../agents/plan-cockpit-propio.md)). **Enmienda tres decisiones que
  conservaban objetos a propósito**: [ADR-019](./ADR-019-remocion-total-eje-keyword.md) §4,
  la pausa de [ADR-009](./ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) sobre
  `v_corpus_aprobados`, y las referencias de [ROADMAP §C3](../../ROADMAP.md). Toca `core/`:
  las migraciones [`022`](../../core/schema/022_poda_balde_2.sql) y `023`, y
  [`ingesta-registro.md`](../../core/contracts/ingesta-registro.md).

- **Contexto:** D7 apartó un "balde 2" —*"4 vistas sin consumidor + 6 columnas write-only"*— para
  una migración de limpieza posterior, **y nunca listó cuáles**. Al derivarlo contra el código vivo
  y contra prod (2026-08-05) aparecieron tres cosas que el recuerdo no tenía:

  **1. El recuerdo se quedaba corto: son 5 vistas y 12 columnas**, más las 6 `airtable_id`.

  **2. Casi nada de eso era huérfano.** De las 5 vistas, **4 tenían dueño escrito**: `v_senal_tema`
  la conserva ADR-019 §4 *a propósito* —y ese ADR **descartó por escrito esta misma migración**
  (*"borrar también el schema Supabase: más limpio pero toca `core/schema/` por algo que no molesta
  ni cuesta"*)—, `v_corpus_aprobados` está "en pausa" desde ADR-009, y
  `v_historico_seleccionados`/`v_selecciones_por_dia` son criterio de aceptación del ROADMAP §C3.
  De las columnas, `outputs.source_items` y `runs.costo_estimado` están **declaradas en
  `ingesta-registro.md`**, el contrato que va a usar LinkedIn.

  **3. El método de "sin consumidor" tenía un agujero: no ve runbooks.** La regla usada
  —*alguien la `select`ea en el código*— marcó `v_outputs_recientes` como huérfana, y su consumidor
  es **un humano siguiendo §Verificación de un contrato de `core/`** (*"tras una corrida:
  `select * from v_outputs_recientes limit 30;` en el SQL Editor"*). Grep no ve al humano.

  Sobre esa base había tres salidas: subir la regla de
  [ADR-045](./ADR-045-se-borra-solo-lo-que-nunca-produjo-nada.md) de registros a schema (se dropea
  solo lo que no tiene dato **ni** dueño documentado), dejar que mande el consumo de código, o
  limitar la migración a lo que dejó Airtable.

- **Decisión:** **manda el consumo de código.** Un objeto de schema que ningún código consume no
  existe, aunque un doc lo reclame: *"no aporta tener cableados muertos, o que cambiaron y ya no
  son así"*. Los docs que lo conservaban se enmiendan en el mismo commit, no al revés.

  Con dos excepciones decididas de frente, no de arrastre:

  1. **`clients.parent_id` se queda**, con su índice, su función y su trigger anti-ciclo. Está en
     0 de 3 y ningún código la lee, pero [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md)
     §4 la conservó hace tres días **con trabajo nuevo** (linaje: facturación, agrupar el selector,
     reportes) al sacarle el gobierno del acceso, y es del modelo de tenancy que se está
     construyendo ahora. Se anota como conservada a propósito para que el próximo inventario no la
     vuelva a marcar.

  2. **`runs.costo_estimado` se va, y el contrato con ella.** No es un dato que falte: es una
     **segunda fuente de verdad**. El costo de este sistema es *contadores en `runs.metricas` ×
     `app.tarifas`*, y eso ya vive en `app.v_costos_semana`. Se descartó implementarla (scope nuevo,
     dos workflows) y reemplazarla por una `v_costo_por_corrida` (agrega un objeto en la migración
     cuyo trabajo es sacarlos, y ninguna pantalla lo pide).

  **Y la poda va en dos migraciones, porque las columnas no se parten por si tienen dato sino por
  quién las escribe.** Medido el 2026-08-05: **PostgREST rechaza el insert entero con `PGRST204` /
  HTTP 400 si el body trae una columna que no existe.** Los dos POST que mandan las columnas
  write-only son **`onError: continueRegularOutput`** —fail-open conservado a propósito por
  [ADR-029](./ADR-029-dedup-blindado-fail-closed-y-feed.md)—, así que ese 400 **se traga**:

  - `POST processed_items` → la corrida cierra **en verde** sin escribir la memoria del dedup ⇒ la
    corrida siguiente re-trae y **re-paga** los mismos videos. Es exactamente el modo de falla de
    los 15 duplicados del 20→21/07.
  - `Registrar outputs` → el archivado cierra **en verde** habiendo **borrado los calificados sin
    archivarlos** (`Borrar candidatos` está aguas abajo): pérdida irreversible del histórico.

  De ahí el corte:

  | | Qué | Coordinación |
  |---|---|---|
  | **[`022`](../../core/schema/022_poda_balde_2.sql)** | las 5 vistas · `outputs.publicado_en` · `runs.costo_estimado` · `instances.config_ref` · las 6 `airtable_id` | **ninguna** — nadie las escribe. ✅ aplicada y verificada por su efecto el 2026-08-05 |
  | **[`023`](../../core/schema/023_poda_write_only.sql)** | `processed_items.url`/`.seguidores`/`.flag_viral`/`.idioma` · `outputs.source_items` · `transcripciones.pedido_por` | ✅ el **push ya salió** (`Preparar procesados`, `Armar filas archivado`) + la app; falta la corrida verde y firmar el **gate `§0`** |

  🔎 **La `023` terminó siendo 5 columnas y no 7.** `processed_items.run_id` y `.primera_vez` **se
  quedan**: las lee `verificar-corrida.mjs` —la herramienta que prueba que el dedup no trae
  duplicados— y `test-nodos.mjs` tiene 4 asserts sobre `run_id`. *Fue la **tercera** vez que el
  método sub-contó consumidores (antes: los runbooks de contratos), y el agujero era el mismo: el
  corpus medía `apps/dashboard` y los `workflow.json`, y dejaba afuera los `.mjs` de herramientas.*

  **El invariante que la poda no puede tocar, y no toca:** el dedup no puede traer duplicados. Su
  clave es el unique `(instance_id, platform, external_id)` de la `016` y `Leer procesados` pide
  `select=external_id,platform`. **Ninguna de las columnas que caen participa del índice ni de la
  lectura** — lo que puede romper el dedup no es el drop, es el orden, y para eso está el gate.

  **Las 6 `airtable_id` no se gatean por el export final**, y eso también se midió: eran la clave de
  join para reconciliar el export contra las filas vivas, pero el dato de esas 6 tablas ya está en
  Postgres y se verificó **idéntico** antes de cortar (D7).

  **Y de paso cayó el export entero**, que era el último bloqueante para apagar Airtable. Las dos
  tablas que nunca se migraron —`Métricas Proyectos` y `Métricas Global`— eran *proyección derivada
  y regenerable*, según el propio contrato congelado: su verdad cruda es `runs.metricas` + `outputs`.
  Las 4 vistas de `app.` las reconstruyen campo por campo y **cubren desde el 2026-06-29**, o sea más
  historia que la que esas tablas llegaron a tener (se partieron en dos el 2026-07-15). Verificado
  contra prod, vista por vista. *La lección repetida: lo que parecía el único dato irrecuperable era
  una caché de algo que el sistema ya sabe calcular.*

- **Alternativas descartadas:**
  - **Subir ADR-045 a schema** (*se dropea solo lo que nunca produjo nada **ni** nadie reclama*).
    Es la regla que el repo ya usa para registros y dejaba la `022` en tres líneas. Rechazada: la
    mitad de lo conservado lo estaba por inercia documentada —ADR-019 conservó `v_senal_tema` porque
    *"no molesta ni cuesta"*, que es un argumento sobre el costo de borrarla, no sobre su utilidad—
    y un schema que no espeja lo que corre cobra un impuesto en cada lectura futura.
  - **Limitar la `022` a las `airtable_id`** y dejar el inventario como documento. Rechazada por lo
    mismo: convierte la deuda en una nota que alguien tiene que volver a leer.
  - **Una sola migración con gate humano.** Rechazada por *una migración, una variable*: si el lunes
    8:00 el motor falla, con dos cambios en la misma ventana hay que bisectar entre el push y el drop.
  - **Mantener el gate del export sobre las `airtable_id`.** Rechazada al medir que la
    reconciliación que custodiaban es comparar una copia contra su original — y que el CSV de
    Airtable ni siquiera trae el record id sin un campo `RECORD_ID()`.

- **Consecuencias:**
  - **ADR-019 §4 queda enmendado**: `v_senal_tema` se dropea. La vuelta atrás es la que el propio
    ADR-019 dejó escrita (*"si el eje vuelve algún día, se reconstruye desde este ADR y el historial
    de git"*), y con ella cae también la puerta que ADR-017 dejaba entornada.
  - **La pausa de ADR-009 sobre `v_corpus_aprobados` se cierra.** El few-shot por voz, si vuelve, se
    escribe contra `outputs` como todo lo demás.
  - **`ingesta-registro.md` se recorta en el mismo commit**: sale `costo_estimado` de §3 y
    §Verificación cambia a una query sobre `outputs`. Sin eso, el primer cierre de corrida de
    LinkedIn (ADR-055) copia la plantilla y se come un 400. **`source_items` sale en la `023`**, no
    antes, para que el contrato no quede a medias entre las dos migraciones.
  - **ROADMAP §C3 pierde dos de sus verificaciones**; se reescriben apuntando a `/curar/historicos`
    y al export CSV de [ADR-057](./ADR-057-el-sheet-historico-por-instancia-o-ninguno.md), que es lo
    que hoy sirve ese histórico.
  - **El criterio de "sin consumidor" queda corregido para el próximo inventario**, y en dos
    direcciones que costaron un hallazgo cada una: no alcanza con grepear `apps/` y los
    `workflow.json`. Un objeto también está vivo si lo cita el **runbook** de un contrato (un humano
    en el SQL Editor) o si lo lee una **herramienta `.mjs`** del repo. Las dos clases de dueño son
    invisibles al grep que se hace por instinto.
  - **El guard vive en `test-nodos.mjs`**: un assert exige que la fila del dedup lleve exactamente
    `instance_id/run_id/platform/external_id`. Si alguien devuelve una de las columnas dropeadas, el
    test se pone rojo en vez de que la corrida cierre en verde sin memoria.
  - `apps/dashboard/lib/supabase/scoped.ts` pierde `public.v_corpus_aprobados` y
    `public.v_historico_seleccionados` de su mapa `TABLAS`. Estaban en la whitelist sin que nadie
    las leyera — **estar en el mapa no es ser consumidor**, y esa confusión es la que hizo que el
    inventario las contara vivas la primera vez.
