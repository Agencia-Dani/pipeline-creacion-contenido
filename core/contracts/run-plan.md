# Contrato de lectura — `GET /api/engine/run-plan` (ADR-028)

El hermano de *lectura* de [ingesta-registro.md](./ingesta-registro.md): así como los workflows
**reportan** runs/outputs a Supabase, el **motor pregunta acá qué correr** antes de gastar créditos.
Lo sirve el dashboard ([`apps/dashboard`](../../apps/dashboard/)); el motor deja de conocer el
schema de la config para siempre — Airtable hoy, Postgres en D5, **sin re-import de por medio**.

## La llamada

- **`GET <URL del dashboard>/api/engine/run-plan`** con **header compartido** (nombre y valor en el
  gestor de contraseñas, env `RUN_PLAN_HEADER_*` en Vercel y credencial `httpHeaderAuth` en n8n —
  mismo patrón que el webhook de ADR-023). Sin header o con header distinto: **403**.
- **El 403 dice cuál de los dos casos es**, en `motivo`: `header_ausente_o_distinto` (lo que manda
  n8n no coincide) vs `sin_credencial_en_el_servidor` (a la app le falta la env; además lo loguea).
  Los dos siguen siendo 403 y siguen abortando la corrida — esto no afloja el fail-closed, solo lo
  hace diagnosticable. Desde afuera eran indistinguibles y eso costó una sesión entera de debug.
  ⚠️ Un espacio o newline de más **en el valor guardado en Vercel** da 403 (se comparan los bytes
  crudos, y si el largo difiere ni se llega a `timingSafeEqual`); en el header que viaja, en cambio,
  la capa HTTP lo recorta sola. O sea: cuando hay 403, el sospechoso es el valor **guardado**, no el
  enviado.
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
  "voces":      [{ "id": "rec…", "fields": { "uuid": "…", "nombre": "…", "criterios_relevancia": "…", "activo": true } }],
  "proyectos":  [{ "id": "rec…", "fields": { "uuid": "…", "nombre": "…", "criterios_relevancia": "…", "voz_default": ["rec…"], "N": 20, "…": "…" } }],
  "referentes": [{ "id": "rec…", "fields": { "handle": "@…", "plataforma": "instagram", "proyecto": ["rec…"], "activo": true } }],
  "ajustes":    [{ "id": "Candidatos por corrida", "fields": { "clave": "Candidatos por corrida", "valor": 100 } }]
}
```

> **`id` es opaco SOLO en `ajustes`.** Los dos workflows que leen ajustes lo hacen por
> `fields.clave`, así que cuando `Ajustes` se cortó a Postgres (D5) el `id` pasó a ser la clave
> misma sin que nada se enterara.
>
> **En `voces`, `proyectos` y `referentes` el `id` es el record id de Airtable, y lo va a ser
> hasta D7** ([ADR-033](../../docs/adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md)). No es
> una comodidad: cuatro nodos vivos lo consumen como record id — `Preparar batch Airtable` escribe
> `Candidatos.proyecto`/`.voz` como *links*, `Preparar batch Descartes` escribe
> `Descartes.proyecto`, `Computar salud referentes` PATCHea `Referentes`, y `Destilar criterios`
> PATCHea `Proyectos`. ⚠️ **Esos POST van con `typecast: true`, así que un uuid no daría error:
> Airtable crearía un registro fantasma con el uuid de nombre.** Por eso una fila nacida en la app
> acuña su record id al crearse, y por eso la traducción se cae en **D7** —cuando el motor deje de
> escribir en Airtable— y no antes. *(Versiones anteriores de este contrato decían "en el corte
> 4/4". Era falso.)*
>
> 🔀 **`fields.uuid` en `voces` y `proyectos` — el campo de transición de D7 (paso 1 de 3).**
> Es el id de Postgres, y viaja **al lado** del `id` viejo a propósito. D7 tiene que cambiar dos
> lados que no se pueden deployar a la vez (la app en Vercel, los workflows en n8n a mano), y
> equivocar el orden **no falla**: el motor viejo recibiendo un uuid escribe un link con
> `typecast` y crea un proyecto fantasma en silencio. Con los dos ids sirviéndose juntos, el orden
> deja de importar: el workflow re-importado usa `fields.uuid` para escribir `app.candidatos`, el
> que todavía no lo está sigue usando `id`, y cada lado se verifica por separado.
> **Muere en el paso 3**, cuando `id` pase a ser el uuid y este campo y `airtable_id` desaparezcan.
> Ese paso está gateado por evidencia —una corrida completa verde— no por calendario.
>
> **`referentes[].fields.proyecto` viaja en el mismo idioma que `proyectos[].id`.** El motor cruza
> las dos listas por ese id; la traducción la hace la app (`domain/referentes.ts`). Es **un array**:
> un referente alimenta N proyectos
> ([ADR-032](../../docs/adr/ADR-032-referente-proyecto-es-n-a-n.md)).
>
> **`proyectos[].fields.voz_default` es un array de UN elemento** con el id de la voz — la forma que
> el motor lee (`voz_default[0]`) y con la que cruza contra `voces[].id`. Que la regla "1 proyecto =
> 1 voz" ahora sea una FK not null no cambia la forma del contrato.
>
> **De qué almacenamiento sale cada dominio hoy lo dice `apps/dashboard/lib/config.ts`**, y no se
> repite acá para que no quede viejo. Con una excepción que sí vive acá porque es del contrato:
> **`criterios_aprendidos` y `advertencia_criterios` NO salen de Postgres aunque `Proyectos` ya sea
> de Postgres.** Los escribe `Destilar criterios` del archivado en Airtable cada domingo (ADR-022) y
> se leen de ahí hasta D7 — un dueño por **campo**, no por tabla (ADR-033). Esa lectura es
> **fail-open**: si Airtable no responde, el plan sale con los criterios manuales.

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
