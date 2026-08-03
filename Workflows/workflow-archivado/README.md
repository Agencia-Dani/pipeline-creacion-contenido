# Archivado de curación — carril C (C2)

> Workflow de **n8n** (20 nodos, en la instancia: `Workflow - Archivado`) que cierra el loop de
> curación del MVP de reels: toma los candidatos que el equipo (Majo/Jero) ya calificó en el
> cockpit, los manda al histórico permanente (`outputs` en Supabase + el Google Sheet) y **borra el
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

> 🔴 **Hoy no archiva nada, y cierra en verde.** `IF — hay calificados` todavía pregunta
> `($json.records || []).length > 0`: `records` era el sobre de la respuesta de Airtable, y PostgREST
> devuelve el array pelado. La condición da `false` **siempre** → toda corrida se va por la rama
> `no` y salta `Registrar outputs`, el Sheet y `Borrar candidatos`.
> Entró en `6e86481` (2026-08-01, *D7: el archivado adelgaza*), que migró el nodo de lectura a
> PostgREST y dejó el IF con la forma vieja. Los nodos de abajo sí se migraron (usan el helper
> `_filas`), por eso nada explota.
> **Medido el 2026-08-03:** el run del 02/08 cerró `estado: ok` con `metricas.archivados: 9` — pero
> el último `outputs` escrito es del **26/07**, y los 9 candidatos calificados el 01/08 **siguen
> vivos** en `app.candidatos`. `archivados` cuenta lo que `Leer Candidatos calificados` **leyó**, no
> lo que se archivó, así que el registro tampoco lo delata.
> Es la misma familia de fallo que el aviso de los placeholders (§Placeholders): muere en silencio y
> la ejecución termina verde. **Pendiente de arreglar** — un cambio de `parameters` en un nodo, o
> sea `n8n:push` (§Operación), sin re-import.

## Qué hace (flujo)

Los 20 nodos, en orden de ejecución real:

```
Disparo por instancia (webhook) ─┐
Ejecutar manual ────────────────┴─► Config ─► Abrir run en el registro ─► Barrer runs zombie
   └─► Leer plan (fachada) ─► Leer Candidatos calificados ─► IF — hay calificados
          ├─ no ───────────────────────────────────────────────► Cerrar run en el registro
          └─ sí ─► Armar filas archivado ─► Preparar outputs Supabase
                     └─► Registrar outputs (Supabase)      ← TODOS, continue-on-fail
                            ├─► Preparar filas Sheet ─► Append al Sheet Histórico ─┐
                            │      (SOLO aprobado)                                 │
                            └──────────────► Reconvergir tras Sheet (Merge) ◄──────┘
                                   └─► Preparar borrado candidatos ─► Borrar candidatos (TODOS)
                                          └─► Cerrar run en el registro

Cerrar run en el registro ─┬─► Barrer candidatos sin calificar   (higiene, onError:continue)
                           └─► Destilar criterios ─► PATCH Proyectos criterios   (ADR-022/M2)
```

> Las dos ramificaciones (tras `Registrar outputs` y tras `Cerrar run`) corren **por posición en el
> canvas**, no por el array de conexiones: n8n v1 ejecuta las hermanas de Y menor a Y mayor. Por eso
> `Preparar filas Sheet` (Y 200) va antes que `Reconvergir` (Y 360), y `Barrer candidatos sin
> calificar` (Y 200) antes que `Destilar criterios` (Y 600). `npm run n8n:orden -- archivado` es
> quien arregla esto si alguien arrastra un nodo; `node Workflows/auditar-workflows.mjs` lo audita.

- **Pide su config a la fachada**, no a una tabla: `GET /api/engine/run-plan?ambito=completo&instancia=…`
  ([ADR-028](../../docs/adr/ADR-028-contrato-motor-run-plan.md)). De ahí salen `proyectos` y `voces`,
  que son lo que le permite mapear `proyecto_id`/`voz_id` (uuid) → nombre.
- **La instancia viaja en el payload del webhook**, no es constante del archivo: `Config` la saca de
  `$('Disparo por instancia (webhook)').first().json.body.instancia`
  ([ADR-048](../../docs/adr/ADR-048-run-plan-v2-motor-por-instancia.md)). En corrida manual queda
  vacía — el `Ejecutar manual` sirve para probar el cableado, no para archivar de verdad.
- **Lee** `app.candidatos` por PostgREST: `estado=neq.nuevo`, scoped por `instance_id`, `limit=5000`.
  Los estados vivos son tres (`nuevo` · `aprobado` · `descartado`): **`publicado` ya no existe**, y
  `Armar filas archivado` colapsa a `descartado` todo lo que no sea literalmente `aprobado`.
- **Split (qué va a dónde):** el **Sheet histórico** recibe **solo `aprobado`** (los scripts que se
  producen). **`outputs`** y el **borrado del candidato** toman **todos** los calificados — los
  `descartado` se registran (alimentan el aprendizaje, `v_senal_seleccion`) y se limpian de la cola,
  pero **no ensucian** el histórico visible.
- **Registra en `outputs`** (tipo `guion_reel`) con un solo POST: `contenido_o_link` = **texto del
  script**, `calificado_en` = `fecha_calificacion`, `external_id` = **el id del candidato en
  Postgres**, `run_id` = el run abierto, `source_items[].platform` derivado de la url (tiktok /
  instagram), y `metadata` completa (proyecto, voz, referente, idioma, métricas, heat_score,
  `calificacion`, `notas_equipo`, `viral_por_tamano`, `relevancia_score`/`relevancia_razon`).
  `instance_id` **no lo manda el workflow**: lo deriva el trigger `outputs_hereda_instancia` desde
  `run_id` (016 §2), que es el dato exacto en vez de un default. Estas filas alimentan
  `v_historico_seleccionados`, `v_selecciones_por_dia` y `v_senal_seleccion`.
- **Append al Google Sheet "Histórico"** — el código emite 15 claves: las 13 de la vista más
  `RELEVANCIA SCORE`/`RELEVANCIA RAZON` (vacías si el candidato no las trae). Cuántas aterrizan
  depende de los encabezados que tenga el Sheet: ver §Requisitos previos.
- **Borra los candidatos archivados** con `DELETE …/candidatos?id=in.(…)`. PostgREST borra por
  filtro, así que se acabaron los lotes de 10: se trocea de a **200** y solo para no armar una URL
  gigante. Si no hay ids, `Preparar borrado candidatos` devuelve `[]` y el DELETE no corre.
- **Destila criterios** ([ADR-022](../../docs/adr/ADR-022-loop-aprendizaje-criterios.md)/M2): por
  proyecto con ≥ `min_muestra_destilar` (4) calificados, Haiku resume la semana en patrones (lo que
  SÍ / lo que NO) priorizando los 🔥 como ejemplos positivos, y en la misma llamada evalúa los
  criterios manuales y deja una advertencia de forma. `PATCH app.proyectos` escribe
  `criterios_aprendidos` + `advertencia_criterios` por uuid — **nunca** pisa `criterios_relevancia`,
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
  *Continue On Fail*. Si el registro no responde, el Sheet igual se escribe y la cola igual se limpia.
- **Runs sin zombies (B5)**: si una corrida falla a mitad (ej. el Append rebota OAuth/503), el run queda
  `en_curso`. `Barrer runs zombie` (justo tras `Abrir run`) marca `fallo` los runs de archivado anteriores
  colgados (scoped `params->>workflow=archivado` **+ `instance_id`**, excluye el actual) → la próxima
  corrida los limpia sola. Desde [ADR-054](../../docs/adr/ADR-054-cada-run-lleva-su-execution-id.md)
  el run además lleva `params.execution_id`, que es por donde lo encuentra el error handler global.
  Además `Cerrar run` corre en **ambas** ramas del IF → **cierra `ok` aun con 0 calificados**, sin
  generar un zombie cada domingo que no haya nada que archivar.
- **El Sheet NO es continue-on-fail a propósito**: si el append falla, el workflow **corta antes de
  borrar los candidatos** → no se pierde la curación del equipo; reintenta al otro domingo. Reintenta
  3 veces con 30 s de espera antes de darse por vencido. El `Merge` *Reconvergir tras Sheet* espera a
  ambas ramas antes del borrado, así que mantiene este orden **y** deja correr el borrado cuando el
  lote no trae aprobados (todos `descartado` → rama Sheet vacía).
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
   `voces` los nombres del Sheet saldrían vacíos.
4. **Sheet "Histórico" creado** (C1) con la pestaña y los encabezados en la fila 1 — el append mapea
   por nombre (`autoMapInputData`), así que deben coincidir **exactos**. Las 13 de la vista:
   `FECHA CALIFICACION · PROYECTO · VOZ · TITULO · URL ORIGINAL · SCRIPT · IDIOMA · VIEWS · LIKES ·
   SEGUIDORES · HEAT SCORE · CALIFICACION · ESTADO`. El código emite además `RELEVANCIA SCORE` y
   `RELEVANCIA RAZON`, que **solo aterrizan si se agregan esos dos encabezados**; si no están, n8n
   descarta esas claves en silencio.
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

El **re-import completo queda solo para topología** (nodos o conexiones nuevos): el push los detecta y
se niega. Solo en ese caso aplican los placeholders y las credenciales de abajo.

## Placeholders *(solo al re-importar por topología)*

En el camino normal se resuelven solos: `n8n-sync` los **aprende del propio live**. Verificados contra
el `workflow.json` el 2026-08-03 — son **7**:

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `<<SUPABASE_URL>>` | nodo *Config* | `https://<proyecto>.supabase.co` |
| `<<DASHBOARD_URL>>` | nodo *Config* | base del cockpit (de ahí sale la fachada `run-plan`) |
| `<<WEBHOOK_PATH_ARCHIVADO>>` | *Disparo por instancia* | el path del webhook que dispara el dispatcher |
| `<<GOOGLE_SHEET_ID>>` | nodo *Config* | id del Sheet Histórico (de la URL) |
| `<<NOMBRE_PESTANA_SHEET>>` | nodo *Config* | nombre de la pestaña destino |
| `<<CREDENCIAL_GOOGLE_SHEETS>>` | *Append al Sheet Histórico* | credencial OAuth de Google Sheets en n8n |
| `<ANTHROPIC_API_KEY>` | Code de *Destilar criterios* | la key de Anthropic |

**`<<AIRTABLE_BASE_ID>>` murió en D7** (ADR-035) y **`<<INSTANCE_ID>>` en la Fase 4**: la instancia ya
no es constante del archivo, viaja en el payload del webhook (ADR-048).

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
| *Append al Sheet Histórico* | OAuth (`googleSheetsOAuth2Api`) | append al histórico — **única dependencia de Google del pipeline**. Se elige a mano: no es texto |

> 🔴 **El Sheet es uno solo y global.** `sheet_id`/`sheet_tab` son constantes del `Config`, no config
> por instancia: con una segunda empresa **sus aprobados se appendean al Sheet de Retia**. Pendiente
> con su fix escrito en [plan-multi-tenant §14.4](../../docs/agents/plan-multi-tenant.md).

> **El OAuth consent screen DEBE estar en Publishing status = "In production"** (no Testing). External +
> Testing caduca el refresh token a los 7 días → el archivado moría cada domingo. La cuenta dueña del
> Sheet es un **Gmail personal** (no Workspace), así que "Internal" no está disponible y Service Account
> tampoco (la política de org `iam.disableServiceAccountKeyCreation` bloquea crear su key). El fix es
> **publicar la app a Producción** (Google Auth Platform → Audience → Publish app): para uso personal
> (<100 usuarios) NO requiere verificación, solo un warning de "app no verificada" al autorizar (se
> salta con Advanced → proceed). Tras publicar hay que **re-autorizar la credencial una vez** en n8n
> para emitir un token nuevo que ya no expira. (2026-07-12)

## Limitaciones conocidas (MVP)

- **Techo de 5.000 por corrida**: `Leer Candidatos calificados` va con `limit=5000` y sin paginar.
  Con el cron semanal sobra de lejos (una corrida del motor entrega ≈100), pero el techo es mudo: si
  alguna vez se pasa, archiva 5.000 y el resto espera al domingo siguiente sin avisar. *(El límite de
  100 de la era Airtable se fue con ella.)*
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
select * from v_historico_seleccionados limit 30;   -- fila con su script (texto), por voz
select * from v_selecciones_por_dia;                -- "el lunes X seleccionaron N para tal voz"
```

Y verificar: fila nueva en el Sheet con su script · los candidatos archivados desaparecieron de la
bandeja del cockpit.

> ⚠️ **`metricas.archivados` no prueba nada por sí solo.** Lo calcula `Cerrar run` contando lo que
> `Leer Candidatos calificados` **leyó**, y ese nodo corre en las dos ramas del IF: un run puede
> cerrar `ok` con `archivados: 9` sin haber escrito ni borrado una sola fila (es exactamente el bug
> del recuadro rojo de arriba, medido el 2026-08-03). **Los puntos 2 y 3 son la prueba real.**
