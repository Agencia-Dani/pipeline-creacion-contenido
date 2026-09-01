# Archivado de curación — carril C (C2)

> Workflow de **n8n** (17 nodos, en la instancia: `Workflow - Archivado`) que cierra el loop de
> curación del MVP de reels: toma los candidatos que el equipo (Majo/Jero) ya calificó en el
> cockpit, los manda al histórico permanente (`outputs` en Supabase) y **borra el
> candidato** — es cola de trabajo, y su historia ya quedó entera en `outputs`
> ([ADR-014](../../docs/adr/ADR-014-outputs-historico-canonico-archivado.md)). Es el complemento del
> motor B3 (`../workflow-short-form-content/`).
>
> **Ya no toca Airtable**: desde D7 lee y escribe todo por PostgREST contra Supabase
> ([ADR-035](../../docs/adr/ADR-035-contrato-de-escritura-por-postgrest.md)), y su config la pide a
> la fachada del cockpit ([ADR-028](../../docs/adr/ADR-028-contrato-motor-run-plan.md)).
> **Tampoco tiene cron propio**: desde la Fase 4 lo dispara el **dispatcher** por webhook, una
> ejecución por instancia ([ADR-050](../../docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md));
> el cron —domingo 6pm, un día antes del motor— vive allá.
>
> Estado real del MVP: [ROADMAP §3 carril C](../../ROADMAP.md) · [handoff.md](../../docs/agents/handoff.md).

> ✅ **Arreglado el 2026-08-04 y verificado con una corrida real** (ejecución 124: 9 → 0 calificados,
> `outputs` 79 → 88). Entre el 01/08 y el 04/08 **este workflow no archivó nada y cerró en verde**, y
> conviene saber por qué antes de tocarlo, porque el mismo modo de falla ya mordió tres veces.
>
> <details><summary>Los tres bugs de D7, y qué los delató</summary>
>
> Los tres entraron en `6e86481` (*D7: el archivado adelgaza*), que migró la lectura a PostgREST, y
> los tres **mueren en silencio con la ejecución en verde** — la misma familia que el aviso de los
> placeholders (§Placeholders). Ninguno lo encontró un diff: los encontró **medir la base y leer la
> ejecución nodo por nodo** (`GET /executions/{id}?includeData=true`).
>
> | Qué | Por qué | Cómo se vio |
> |---|---|---|
> | **1. El IF nunca daba true** | Preguntaba `($json.records \|\| []).length > 0`. `records` era el sobre de **Airtable**; PostgREST devuelve el array pelado, que n8n parte en items | La ejecución 123: el IF mandó **`[0 true, 9 false]`**. En la base, `metricas.archivados: 9` y el último `outputs` del **26/07** — el contador cuenta lo **leído**, no lo archivado |
> | **2. Con 0 calificados el run quedaba abierto** | El nodo de lectura emitía 0 items ⇒ el IF no corría ⇒ **`Cerrar run` no se ejecutaba por ninguna rama**. Con Airtable no pasaba: `{records:[]}` era 1 item | Se arregló con `alwaysOutputData: true` antes de que mordiera |
> | **3. `fields.uuid` ya no existe** | El contrato v2 lo mató ([ADR-048 §5](../../docs/adr/ADR-048-run-plan-v2-motor-por-instancia.md)): el `id` **es** el uuid. El motor y el descubrimiento se migraron; **estos dos nodos no**. `Armar filas archivado` dejaba `metadata.proyecto`/`.voz` vacíos; `Destilar criterios` armaba `recs` vacío ⇒ el loop de ADR-022 **muerto**, pagando Haiku para tirar el resultado | Estaba **tapado** detrás del bug 1: sin archivado, esos nodos no corrían. Apareció en la primera corrida buena |
>
> **La regla que sale de esto:** arreglar el nodo que corta el flujo **destapa todo lo que estaba
> detrás**. Después de un fix así, la corrida de verificación vale más que el `n8n:diff`, y hay que
> mirar los **items por nodo**, no solo el `estado: ok`.
>
> </details>

## Qué hace (flujo)

Los 20 nodos, en orden de ejecución real:

```
Disparo por instancia (webhook) ─┐
Ejecutar manual ────────────────┴─► Config ─► Abrir run en el registro ─► Barrer runs zombie
   └─► Leer plan (fachada) ─► Leer Candidatos calificados ─► IF — hay calificados
          ├─ no ───────────────────────────────────────────────► Cerrar run en el registro
          └─ sí ─► Armar filas archivado ─► Preparar outputs Supabase
                     └─► Registrar outputs (Supabase)      ← TODOS, continue-on-fail
                            └─► Preparar borrado candidatos ─► Borrar candidatos (TODOS)
                                   └─► Cerrar run en el registro

Cerrar run en el registro ─┬─► Barrer candidatos sin calificar   (higiene, onError:continue)
                           └─► Destilar criterios ─► PATCH Proyectos criterios   (ADR-022/M2)
```

> 🔻 **Quedó UNA sola ramificación** (tras `Cerrar run`), y corre **por posición en el canvas**, no
> por el array de conexiones: n8n v1 ejecuta las hermanas de Y menor a Y mayor. Por eso `Barrer
> candidatos sin calificar` (Y 200) va antes que `Destilar criterios` (Y 600).
> `npm run n8n:orden -- archivado` es quien arregla esto si alguien arrastra un nodo;
> `node Workflows/auditar-workflows.mjs` lo audita.
>
> *La otra ramificación —la del Sheet, con su `Merge` de reconvergencia— murió el 2026-08-05 con
> [ADR-057](../../docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) paso 2. Fueron 3
> nodos borrados **a mano en el editor de n8n**, no un re-import: importar crea un workflow con id
> NUEVO y se lleva puestos el webhook, el target del dispatcher y la activación.*

- **Pide su config a la fachada**, no a una tabla: `GET /api/engine/run-plan?ambito=completo&instancia=…`
  ([ADR-028](../../docs/adr/ADR-028-contrato-motor-run-plan.md)). De ahí salen `proyectos` y `voces`,
  que son lo que le permite mapear `proyecto_id`/`voz_id` (uuid) → nombre. **El cruce va contra el
  `id` del plan, que ES el uuid desde el contrato v2** — `fields.uuid` ya no viaja (ADR-048 §5), y
  cruzar contra él era el bug 3 de arriba.
- **La instancia viaja en el payload del webhook**, no es constante del archivo: `Config` la saca de
  `$('Disparo por instancia (webhook)').first().json.body.instancia`
  ([ADR-048](../../docs/adr/ADR-048-run-plan-v2-motor-por-instancia.md)). En corrida manual queda
  vacía — el `Ejecutar manual` sirve para probar el cableado, no para archivar de verdad.
- **Lee** `app.candidatos` por PostgREST: `estado=neq.nuevo`, scoped por `instance_id`, **paginado de a 1.000** (el tope real de PostgREST, medido).
  Los estados vivos son tres (`nuevo` · `aprobado` · `descartado`): **`publicado` ya no existe**, y
  `Armar filas archivado` colapsa a `descartado` todo lo que no sea literalmente `aprobado`.
- **Sin split: `outputs` y el borrado toman TODOS los calificados.** Los `descartado` se registran
  (alimentan el aprendizaje, `v_senal_seleccion`) y se limpian de la cola. *El split existía por el
  Sheet, que recibía solo los `aprobado`; con el Sheet muerto, el filtro «solo lo visible» lo hace
  `/curar/historicos`, que consulta `estado = 'aprobado'` sobre `outputs`.*
- **Registra en `outputs`** (tipo `guion_reel`) con un solo POST: `contenido_o_link` = **texto del
  script**, `calificado_en` = `fecha_calificacion`, `external_id` = **el id del candidato en
  Postgres**, `run_id` = el run abierto, `source_items[].platform` derivado de la url (tiktok /
  instagram), y `metadata` completa (proyecto, voz, referente, idioma, métricas, heat_score,
  `calificacion`, `notas_equipo`, `viral_por_tamano`, `relevancia_score`/`relevancia_razon`).
  `instance_id` **no lo manda el workflow**: lo deriva el trigger `outputs_hereda_instancia` desde
  `run_id` (016 §2), que es el dato exacto en vez de un default. Estas filas son las que lee
  `/curar/historicos` (y su export CSV) y las que alimentan `v_senal_seleccion`.
  *`source_items` salió del POST el 2026-08-05: se escribía y no la leía nadie, y la dropea la
  [`023`](../../core/schema/023_poda_write_only.sql) (ADR-059). La traza del origen vive en
  `metadata.referente`/`.url_referente`, que es lo que la pantalla muestra.*
- **Borra los candidatos archivados** con `DELETE …/candidatos?id=in.(…)`. PostgREST borra por
  filtro, así que se acabaron los lotes de 10: se trocea de a **200** y solo para no armar una URL
  gigante. Si no hay ids, `Preparar borrado candidatos` devuelve `[]` y el DELETE no corre.
- **Destila criterios** ([ADR-022](../../docs/adr/ADR-022-loop-aprendizaje-criterios.md)/M2): por
  proyecto con ≥ `min_muestra_destilar` (4) calificados, Haiku resume la semana en patrones (lo que
  SÍ / lo que NO) priorizando los 🔥 como ejemplos positivos, y en la misma llamada evalúa los
  criterios manuales y deja una advertencia de forma. `PATCH app.proyectos` escribe
  `criterios_aprendidos` + `advertencia_criterios` por el `proyecto_id` del candidato (que ya es el
  uuid: ver el bug 3) — **nunca** pisa `criterios_relevancia`,
  que es del humano. Fail-soft por proyecto: si Haiku falla, ese proyecto se salta.
- **Un barrido de higiene**: `Barrer candidatos sin calificar` purga los `nuevo` de más de **20
  días** (los que nadie calificó; no van al histórico, solo despejan la bandeja). Cuelga de
  `Cerrar run` con `onError:continue` — el run ya cerró, si falla reintenta el domingo siguiente.
  Los **descartes no se barren** ([ADR-036](../../docs/adr/ADR-036-los-descartes-no-se-barren.md)):
  nadie más guarda lo que se tiró.

> **La cadena de métricas de ADR-021 ya no vive acá.** Los 15 nodos que computaban `Métricas
> Global`/`Métricas Proyectos` y limpiaban `Descartes del gate` se fueron con Airtable en D7 (el
> archivado pasó de 35 nodos a 20): esa lectura la da hoy el cockpit sobre las mismas tablas de
> Postgres. Ver [plan-cockpit-propio §D7](../../docs/agents/plan-cockpit-propio.md).

## Orden e idempotencia (lo que importa)

- **El registro es sumidero** (invariante #1): `Abrir run`, `Barrer runs zombie`, `Registrar
  outputs`, `Cerrar run`, `Barrer candidatos sin calificar` y `PATCH Proyectos criterios` van con
  *Continue On Fail*. Si el registro no responde, la cola igual se limpia.
- **Runs sin zombies (B5)**: si una corrida falla a mitad, el run queda
  `en_curso`. `Barrer runs zombie` (justo tras `Abrir run`) marca `fallo` los runs de archivado anteriores
  colgados (scoped `params->>workflow=archivado` **+ `instance_id`**, excluye el actual) → la próxima
  corrida los limpia sola. Desde [ADR-054](../../docs/adr/ADR-054-cada-run-lleva-su-execution-id.md)
  el run además lleva `params.execution_id`, que es por donde lo encuentra el error handler global.
  Además `Cerrar run` corre en **ambas** ramas del IF → **cierra `ok` aun con 0 calificados**, sin
  generar un zombie cada domingo que no haya nada que archivar.
- 🩸 **La red que protegía la curación se fue con el Sheet, y hay que saberlo.** El append **no** era
  continue-on-fail a propósito: si fallaba, el workflow cortaba **antes** de borrar los candidatos, o
  sea que la curación del equipo no se perdía. Hoy el único escritor del histórico es
  `Registrar outputs`, que **sí** es continue-on-fail (invariante #1) y tiene `Borrar candidatos`
  aguas abajo. *Eso es exactamente el modo de falla que gatea la [`023`](../../core/schema/023_poda_write_only.sql):
  un 400 tragado ahí borra calificados sin haberlos archivado.* La protección real pasó a ser el
  upsert idempotente + que ese POST no puede fallar por forma (ADR-059 §0 lo verifica antes de
  dropear nada).
- **Idempotencia por upsert + borrado**: en operación normal un candidato se procesa una vez porque
  se borra al final. Si el delete falla (transitorio), `Borrar candidatos` **reintenta** (3 intentos,
  2 s) antes de dar error; si igual queda atrás, la corrida siguiente lo re-toma **sin duplicar** en
  `outputs` porque el POST usa upsert (`on_conflict=instance_id,external_id` +
  `Prefer: resolution=ignore-duplicates`) contra `outputs_instancia_external_id_key`. *(Ese índice es
  de la `016`: la `017` dropea el `outputs_external_id_key` global que traía la `005`. Un
  `on_conflict` sin índice que le sirva de arbiter no falla en rojo: PostgREST tira **42P10** y el
  POST muere entero.)*

## Requisitos previos

1. **Migraciones `001`–`017` aplicadas** en Supabase, en orden. Las que este workflow necesita sí o sí:
   - **`004`** — la vista del histórico expone el **texto** del script, no `link_doc`.
   - **`013`** — `app.candidatos` es la cola de trabajo que este workflow lee y borra.
   - **`016` + `017`** — multi-tenant: el índice `outputs_instancia_external_id_key` (arbiter del
     upsert), el trigger `outputs_hereda_instancia` y el `instance_id not null`. Sin la `017`, el
     `on_conflict=instance_id,external_id` del `Registrar outputs` revienta con 42P10.

   *(La `005` sigue en la carpeta como historia: su índice global lo dropea la `017`.)*
2. **El dispatcher activo y apuntando acá** — este workflow no arranca solo: `Cron — archivado
   (domingo 6pm)` vive en `../workflow-dispatcher/`, que pregunta las instancias a la fachada
   (`GET /api/engine/instancias`) y hace un POST al webhook de este workflow **por cada una**, con
   `{ instancia }` en el body. Sin ese payload, `Config.instance_id` queda vacío y las consultas no
   filtran nada.
3. **La fachada del cockpit en pie** (`/api/engine/run-plan`): si `Leer plan (fachada)` no responde
   tras sus 3 reintentos, la corrida se cae ahí — no tiene `onError:continue`, y sin `proyectos`/
   `voces` los nombres de `metadata` saldrían vacíos.
5. Corre en **la misma instancia de n8n** que el motor (B1) y reusa sus credenciales — ver
   §Credenciales.

## Operación — cómo se cambia este workflow

**Cambiarlo ya no es re-importarlo** ([ADR-053](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)):
el repo es la **forma**, el live es el **estado**. Un cambio de `parameters` se parchea por la API:

```bash
cd core/scripts && npm run n8n:push -- archivado --nodos "Config"
```

Dry-run; `--apply` escribe, snapshotea en `.n8n-snapshots/` y `npm run n8n:restore -- archivado
<snapshot> --apply` revierte. Nunca toca credenciales, ids, posiciones ni `settings`.
`npm run n8n:diff` (solo lee) dice si el live corre lo que dice el repo — **corrélo antes de tocar el
`workflow.json` y después de cualquier cambio en n8n**.

**Desde el 2026-08-30 el push también cubre la topología** (nodos y conexiones, [ADR-053 §Enmienda](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)): pide `--nodos` si crea nodos, `--borrar` para lo que desaparece o pierde cableado, y se niega si dejaría un nodo inalcanzable. **El re-import completo queda solo para crear un workflow desde cero**, y ahí sí aplican los placeholders y las credenciales de abajo.

## Placeholders *(solo al crear el workflow de cero)*

En el camino normal se resuelven solos: `n8n-sync` los **aprende del propio live**. Verificados contra
el `workflow.json` el 2026-08-03 — son **7**:

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `<<SUPABASE_URL>>` | nodo *Config* | `https://<proyecto>.supabase.co` |
| `<<DASHBOARD_URL>>` | nodo *Config* | base del cockpit (de ahí sale la fachada `run-plan`) |
| `<<WEBHOOK_PATH_ARCHIVADO>>` | *Disparo por instancia* | el path del webhook que dispara el dispatcher |
| `<ANTHROPIC_API_KEY>` | Code de *Destilar criterios* | la key de Anthropic |

**`<<AIRTABLE_BASE_ID>>` murió en D7** (ADR-035), **`<<INSTANCE_ID>>` en la Fase 4** (la instancia
viaja en el payload del webhook, ADR-048) y **los 3 de Google el 2026-08-05** (ADR-057 paso 2). Son
**4**, y ninguno es de Google: este workflow ya no tiene ninguna dependencia de Google.

> ⚠️ **Un placeholder sin resolver no falla en rojo.** `<<…>>` no es sintaxis de expresión de n8n: se
> manda literal y el request muere, pero con `onError: continueRegularOutput` la ejecución **termina
> en verde**. Por eso `npm run n8n:diff` va después de cada import.
>
> Los IDs no son secretos pero **no se commitean** (van al gestor).

## Credenciales en n8n

Verificadas contra la instancia el 2026-08-03. **Los nombres del repo son los reales**: si no
coincidieran, n8n las pide a mano en el re-import y ahí es donde se cuelan los errores (costó dos
intentos fallidos el 03/08).

| Nodo | Credencial | Uso |
|---|---|---|
| *Disparo por instancia (webhook)* | `Webhook Motor Header` (`httpHeaderAuth`) | **el mismo que el motor, a propósito** |
| *Leer plan (fachada)* | `Run Plan Header` (`httpHeaderAuth`) | leer la config por la fachada (ADR-028) |
| los nodos de Supabase | `Supabase account` (`supabaseApi`, service_role) | `runs` + `outputs` por PostgREST (ADR-035) |

> ✅ **La dependencia de Google se fue entera el 2026-08-05** ([ADR-057](../../docs/adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) paso 2). Era el último pendiente de [plan-multi-tenant §14.4](../../docs/agents/plan-multi-tenant.md): el Sheet era **uno solo y global** (`sheet_id`/`sheet_tab` eran constantes del `Config`, no config por instancia), así que con una segunda empresa sus aprobados se appendeaban al Sheet de Retia. Con él se fueron el consent screen de OAuth, su refresh token y el runbook entero de publicar la app a Producción.

## Limitaciones conocidas (MVP)

- ~~**Techo de 5.000 por corrida**~~ ✅ **CERRADO el 2026-08-31.** `Leer Candidatos calificados`
  ahora **pagina** de a 1.000, con el mismo patrón que `Leer procesados` y `Leer feed vivo` del motor
  ([ADR-029 §Enmienda 2](../../docs/adr/ADR-029-dedup-blindado-fail-closed-y-feed.md)).
  🩸 **El techo que este renglón declaraba nunca fue 5.000: era 1.000.** `limit=5000` no sube nada
  porque PostgREST corta antes — medido contra prod ese día sobre una tabla de 1.936 filas,
  `limit=1500`, `limit=5000`, `limit=50000` y *sin* `limit` devuelven **las mismas 1.000**. O sea que
  la limitación estaba documentada **5× más lejos de lo que estaba**, y era muda: archivaba 1.000 y
  el resto esperaba al domingo siguiente sin avisar.
  📌 Y el error no era de este doc solo: `curar/feed/actions.ts` y `handoff.md` afirmaban los dos que
  *"no hay `db-max-rows` puesto, se verificó pidiendo sin limit"*. Una medición del 03/08 copiada a
  tres lugares, que se desmintió con un `curl`. *Un techo medido se re-mide, igual que un canario.*
- **El motor deja una fila `outputs` "draft"** por candidato producido (sin `calificado_en`); este
  workflow crea la fila **archivada** (con `calificado_en`). Las vistas del histórico filtran por
  `calificado_en is not null`, así que solo aparece la archivada. Las draft quedan como rastro de
  "producido"; limpieza opcional a futuro.
- **`Ejecutar manual` no archiva de verdad**: sin el payload del webhook, `instance_id` queda vacío
  y las consultas filtran por `instance_id=eq.` — sirve para probar el cableado, no para correrlo a
  mano. Para forzar una corrida real, disparar el dispatcher (o pegarle al webhook con
  `{ "instancia": "<uuid>" }`).

## Validar (C3)

Tras una corrida con al menos un candidato calificado de prueba (disparada por el dispatcher o por
el webhook con su `instancia`):

```sql
-- 1. ¿el run cerró, y cuántos dijo haber archivado?
select inicio, fin, estado, metricas, params->>'execution_id' as ejecucion
from runs where params->>'workflow' = 'archivado' order by inicio desc limit 5;

-- 2. ¿existen las filas archivadas? (esto es lo que prueba que archivó, no el punto 1)
select creado_en, calificado_en, estado, titulo
from outputs where calificado_en is not null order by creado_en desc limit 10;

-- 3. ¿se vació la cola? después de archivar esto tiene que dar 0
select estado, count(*) from app.candidatos where estado <> 'nuevo' group by estado;

-- 4. el histórico como lo lee el cockpit
select titulo, estado, calificado_en, metadata->>'proyecto' as proyecto
  from outputs where tipo = 'guion_reel'
 order by creado_en desc limit 30;     -- las filas que acaba de archivar, con su script en metadata
```

Y verificar: la fila nueva aparece en `/curar/historicos` con su script · los candidatos archivados
desaparecieron de la bandeja del cockpit.

> ⚠️ **`metricas.archivados` no prueba nada por sí solo.** Lo calcula `Cerrar run` contando lo que
> `Leer Candidatos calificados` **leyó**, y ese nodo corre en las dos ramas del IF: un run puede
> cerrar `ok` con `archivados: 9` sin haber escrito ni borrado una sola fila (es exactamente el bug
> del recuadro rojo de arriba, medido el 2026-08-03). **Los puntos 2 y 3 son la prueba real.**
