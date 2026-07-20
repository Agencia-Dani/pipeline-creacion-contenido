# Contrato de lectura — `GET /api/engine/run-plan` (ADR-028)

El hermano de *lectura* de [ingesta-registro.md](./ingesta-registro.md): así como los workflows
**reportan** runs/outputs a Supabase, el **motor pregunta acá qué correr** antes de gastar créditos.
Lo sirve el dashboard ([`apps/dashboard`](../../apps/dashboard/)); el motor deja de conocer el
schema de la config para siempre — Airtable hoy, Postgres en D5, **sin re-import de por medio**.

## La llamada

- **`GET <URL del dashboard>/api/engine/run-plan`** con **header compartido** (nombre y valor en el
  gestor de contraseñas, env `RUN_PLAN_HEADER_*` en Vercel y credencial `httpHeaderAuth` en n8n —
  mismo patrón que el webhook de ADR-023). Sin header o con header distinto: **403**.
- **Fail-closed (ADR-028 §4):** cualquier respuesta ≠200 (403, 503, timeout) debe **abortar la
  corrida** — el HTTP Request de n8n se deja SIN continue-on-fail a propósito. Una corrida sin
  config entrega ruido; no entregar es mejor. El registro (`runs`/`outputs`) sigue siendo
  fail-open: esto solo gobierna el arranque.

## Qué devuelve (v1)

Los **mismos registros, con los mismos filtros server-side** que los 4 nodos Airtable que
reemplaza (`Leer Voces` / `Leer Proyectos` / `Leer Referentes` / `Leer Ajustes`), en la forma
`{id, fields}` que el motor ya parsea:

```json
{
  "version": 1,
  "generado_en": "2026-07-20T08:00:00.000Z",
  "voces":      [{ "id": "rec…", "fields": { "nombre": "…", "criterios_relevancia": "…", "activo": true } }],
  "proyectos":  [{ "id": "rec…", "fields": { "nombre": "…", "criterios_relevancia": "…", "voz_default": ["rec…"], "N": 20, "…": "…" } }],
  "referentes": [{ "id": "rec…", "fields": { "handle": "@…", "plataforma": "instagram", "proyecto": ["rec…"], "activo": true } }],
  "ajustes":    [{ "id": "rec…", "fields": { "clave": "Candidatos por corrida", "valor": 100 } }]
}
```

- **Filtros (ADR-028 §2, y nada más):** solo voces `activo` · solo proyectos `activo` **de voz
  activa** (el gate que hoy hace `Armar plan` cruzando tablas) · solo referentes `activo` ·
  `Ajustes` completa. Los `fields` pasan tal cual desde la fuente (pass-through).
- **`proyectos[].fields.N` viene YA resuelta** contra el default global (`Candidatos por corrida`,
  fail-open a 100): nunca vacía ni 0. La resolución del motor queda como doble inofensivo.
- **El scoring, el gate, el corte por proyecto y el spillover NO viven acá** — siguen en el motor
  (`Armar plan de corrida` no se vacía y `test-nodos.mjs` conserva su valor de red de regresión).

## Versionado

`version` gobierna la compatibilidad (ADR-028 §5): mientras sea `1`, la app puede cambiar de dónde
salen los datos (Airtable → Postgres, dominio por dominio) sin tocar n8n. Un cambio de **forma**
sube la versión y **ahí sí** hay re-import coordinado.

## Los dos ámbitos (decisión de Mani, 2026-07-20)

Un solo endpoint y una sola credencial; el query param elige el filtro:

- **`?ambito=motor` (default):** lo de arriba — los filtros de ADR-028 §2 y la N resuelta.
- **`?ambito=completo`:** el **mismo shape, sin filtros de `activo` y con `N` tal cual**. Lo
  consumen el **archivado** (necesita TODAS las voces para resolver nombres al archivar) y el
  **descubrimiento** (no respeta `activo` a propósito — despensa para voces pausadas, cierre 49).
  Cada workflow aplica su propia lógica sobre el total, exactamente como hoy.
- Un `ambito` desconocido responde **400** (un typo en n8n no puede degradar en silencio al default).
