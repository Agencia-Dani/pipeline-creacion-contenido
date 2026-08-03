# Archivado de curación — carril C (C2)

> Workflow de **n8n** que cierra el loop de curación del MVP de reels. Corre **semanal por cron (domingo 6pm)**, un día antes de la corrida del motor (lunes 8am), para darle tiempo al equipo de redes a usar los scripts antes de que se limpien de Airtable:
> toma los `Candidatos` que el equipo (Majo/Jero) ya calificó en Airtable, los manda al histórico
> permanente (Supabase + Google Sheet) y los **borra de Airtable** para no reventar el plan free
> (1.000 records). Es el complemento del motor B3 (`../workflow-short-form-content/`).
>
> Estado real del MVP: [ROADMAP §3 carril C](../../ROADMAP.md) · [handoff.md](../../docs/agents/handoff.md).

## Qué hace (flujo)

```
Cron semanal (dom 6pm) ─┐
Ejecutar manual ─┴─► Config ─► Abrir run (Supabase, continue-on-fail) ─► Barrer runs zombie
   └─► Leer plan (fachada) ─► Leer Candidatos decididos ─► IF ¿hay?
          ├─ no ──────────────────────────────────────► (cadena de métricas)
          └─ sí ─► Armar filas ─► Registrar outputs (Supabase, continue-on-fail, TODOS)
                       └─► Append al Sheet Histórico (SOLO aprobado/publicado) ─┐
                       └────────────────────────────► Reconvergir (Merge) ◄─────┘
                                  └─► Borrar de Airtable (TODOS) ─► (cadena de métricas)

(cadena de métricas, ADR-021 — corre CON o SIN calificados:)
Leer runs de la semana ─► Leer Descartes del gate ─► Computar métricas semana
   ─► POST Métricas (Airtable) ─┬─► Cerrar run ─┬─► Leer nuevos viejos ─► Preparar barrido ─► Barrer nuevos
     (routea por $json._tabla:   │               └─► Leer Métricas viejas ─► Preparar barrido ─► Barrer Métricas
      Global vs Proyectos)       │                  (barre solo 'Métricas Proyectos'; Global no crece)
                                └─► Preparar borrado Descartes ─► Borrar Descartes del gate
```

- **Lee** `Candidatos` ya decididos por el equipo (`filterByFormula: NOT({estado} = 'nuevo')` →
  trae `aprobado`/`publicado`/`descartado`; el campo canónico de "decidido" es `estado`, igual que
  la vista 🔥 del cockpit).
- **Split (qué va a dónde):** el **Sheet histórico** recibe **solo `aprobado`/`publicado`** (los
  scripts que se producen). **Supabase `outputs`** y el **borrado de Airtable** toman **todos** los
  decididos — los `descartado` se registran (alimentan el aprendizaje, `v_senal_seleccion`) y se
  limpian del cockpit, pero **no ensucian** el histórico visible.
- **Resuelve nombres**: `proyecto`/`voz` en `Candidatos` son campos *link* (ids), así que lee
  `Proyectos` y `Voces` y mapea id→nombre (igual que el motor).
- **Registra en Supabase** `outputs` (tipo `guion_reel`): `contenido_o_link` = **texto del script**,
  `calificado_en` = `fecha_calificacion`, `external_id` = **id del record de Airtable**,
  `metadata` completa (proyecto, voz, referente, idioma, métricas, heat_score, `calificacion`,
  **`relevancia_score`/`relevancia_razon`** — ADR-021). Estos alimentan `v_historico_seleccionados`,
  `v_selecciones_por_dia` y `v_senal_seleccion` (003).
- **Append al Google Sheet "Histórico"** (las 13 columnas de la vista — ver abajo; con las columnas
  opcionales `RELEVANCIA SCORE`/`RELEVANCIA RAZON` si se agregan los encabezados al Sheet).
- **Borra de Airtable** los records archivados (batch de 10 por DELETE).
- **Computa las filas semanales de Métricas** (ADR-021; split en 2 tablas 2026-07-15): calidad por
  proyecto → **`Métricas Proyectos`** (precisión de entrega, separación del gate); salud global +
  costos → **`Métricas Global`** (filas GLOBAL/DESCUBRIMIENTO: embudo de los `runs` del motor de la
  semana, SIN GUION, runs fallidos, llamadas por servicio, falsos negativos de los descartes
  auditados). El nodo `Computar métricas semana` etiqueta cada batch con `_tabla` y el POST routea
  a la tabla correcta. Corre **con o sin calificados**, todo fail-soft: si Métricas falla, el
  archivado de candidatos no se cae.
  Escribe además `diagnostico`: la lectura legible del criterio por proyecto (🟢/🟡/🔴 según
  `separacion_gate`+`precision`, regla sin IA — enmienda ADR-021 2026-07-14). El *lint de forma* con
  IA llega en ADR-022/M2.
- **Limpia `Descartes del gate`** (los auditados ya quedaron contados; no se acumulan).
- **Dos barridos de higiene** (enmienda 2026-07-14, colgados de `Cerrar run`, `onError:continue` — el
  run ya cerró, si fallan reintentan el domingo siguiente): purga **Candidatos `nuevo` > 20 días**
  (los que nadie calificó; no van al histórico, solo despejan la pestaña "Nuevos") y **filas de
  `Métricas Proyectos` > 12 semanas** (la tabla que crece ~7 filas/semana; el histórico largo vive en
  Supabase, de donde es regenerable). `Métricas Global` no se barre: crece ~2 filas/semana (GLOBAL +
  DESCUBRIMIENTO) y conviene guardar más trend de costos/salud. Ambos leen por `filterByFormula` y borran en lotes de 10, mismo
  patrón que `Borrar Descartes del gate`.

## Orden e idempotencia (lo que importa)

- **Supabase es sumidero** (invariante #1): `Abrir run`, `Registrar outputs` y `Cerrar run` van con
  *Continue On Fail*. Si Supabase no responde, el Sheet igual se escribe y Airtable igual se limpia.
- **Runs sin zombies (B5)**: si una corrida falla a mitad (ej. el Append rebota OAuth/503), el run queda
  `en_curso`. `Barrer runs zombie` (justo tras `Abrir run`) marca `fallo` los runs de archivado anteriores
  colgados (scoped `params->>workflow=archivado`, excluye el actual) → la próxima corrida los limpia sola.
  Además `Cerrar run` cuenta `archivados` sobre `Leer Candidatos calificados` (corre en ambas ramas del IF)
  → **cierra `ok` aun con 0 calificados**, sin generar un zombie cada día que no haya nada que archivar.
- **El Sheet NO es continue-on-fail a propósito**: si el append falla, el workflow **corta antes de
  borrar de Airtable** → no se pierde la curación del equipo; reintenta al otro día. El `Merge`
  *Reconvergir tras Sheet* espera a ambas ramas antes del borrado, así que mantiene este orden **y**
  deja correr el borrado cuando el lote no trae aprobados (todos `descartado` → rama Sheet vacía).
- **Idempotencia por upsert + borrado**: en operación normal un record se procesa una vez porque se
  borra de Airtable al final. Si el delete falla (transitorio), `Borrar de Airtable` **reintenta**
  (3 intentos, 2 s) antes de dar error; si igual queda atrás, la corrida siguiente lo re-toma **sin
  duplicar** en `outputs` porque el POST usa upsert (`on_conflict=external_id` +
  `Prefer: resolution=ignore-duplicates`) contra el índice único de `external_id`. *(El índice se
  volvió completo en `005_idempotencia_outputs.sql`: el parcial original — `where external_id is not
  null` — no servía como arbiter de ON CONFLICT en PostgREST.)*

## Requisitos previos

1. **`004_historico_script_texto.sql` + `005_idempotencia_outputs.sql` aplicados** en Supabase (004:
   la vista expone el **texto** del script, no `link_doc`; 005: índice de `outputs.external_id`
   completo → habilita el upsert idempotente del archivado). Correr en orden tras 001–003.
2. **Sheet "Histórico" creado** (C1) con la pestaña y las 13 columnas exactas (encabezados, fila 1):
   `FECHA CALIFICACION · PROYECTO · VOZ · TITULO · URL ORIGINAL · SCRIPT · IDIOMA · VIEWS · LIKES ·
   SEGUIDORES · HEAT SCORE · CALIFICACION · ESTADO`. El append mapea por nombre de encabezado
   (`autoMapInputData`) → deben coincidir **exactos**.
3. Corre en **la misma instancia de n8n** que el motor (B1) y reusa sus credenciales nativas
   `Airtable PAT` y `Supabase Registro`.

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

- **Sin paginación**: lee 1 página (hasta 100 candidatos calificados / corrida). Con cron semanal
  cada corrida archiva el lote de toda la semana (≈1 corrida del motor, `top_n` ≈100), así que queda
  al filo de la página; si se acumulan >100 calificados, agregar loop de `offset`.
- **El motor deja una fila `outputs` "draft"** por candidato producido (sin `calificado_en`); este
  workflow crea la fila **archivada** (con `calificado_en`). Las vistas del histórico filtran por
  `calificado_en is not null`, así que solo aparece la archivada. Las draft quedan como rastro de
  "producido"; limpieza opcional a futuro.

## Validar (C3)

Tras una corrida con al menos un candidato calificado de prueba:

```sql
select * from v_historico_seleccionados limit 30;   -- fila con su script (texto), por voz
select * from v_selecciones_por_dia;                -- "el lunes X seleccionaron N para tal voz"
```

Y verificar: fila nueva en el Sheet con su script · el record salió de Airtable.
