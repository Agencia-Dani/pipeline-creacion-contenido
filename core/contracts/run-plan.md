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
  "voces":      [{ "id": "uuid…", "fields": { "uuid": "uuid…", "nombre": "…", "criterios_relevancia": "…", "activo": true } }],
  "proyectos":  [{ "id": "uuid…", "fields": { "uuid": "uuid…", "nombre": "…", "criterios_relevancia": "…", "voz_default": ["uuid…"], "N": 20, "…": "…" } }],
  "referentes": [{ "id": "uuid…", "fields": { "handle": "@…", "plataforma": "instagram", "proyecto": ["uuid…"], "activo": true } }],
  "ajustes":    [{ "id": "Candidatos por corrida", "fields": { "clave": "Candidatos por corrida", "valor": 100 } }]
}
```

> **`id` es opaco SOLO en `ajustes`.** Los dos workflows que leen ajustes lo hacen por
> `fields.clave`, así que cuando `Ajustes` se cortó a Postgres (D5) el `id` pasó a ser la clave
> misma sin que nada se enterara.
>
> ✅ **En `voces`, `proyectos` y `referentes` el `id` es el uuid de Postgres desde el 2026-08-01
> — paso 3 y último del expand/contract de D7.** Hasta ahí fue el record id de Airtable, y no por
> comodidad: cuatro nodos vivos lo consumían como record id (`Preparar batch Airtable` escribía
> `Candidatos.proyecto`/`.voz` como *links*, `Preparar batch Descartes` escribía
> `Descartes.proyecto`, `Computar salud referentes` PATCHeaba `Referentes` y `Destilar criterios`
> PATCHeaba `Proyectos`), y esos POST iban con `typecast: true` ⇒ un uuid **no fallaba**, Airtable
> creaba un registro fantasma con el uuid de nombre. D7 movió los cuatro a PostgREST, donde un id
> mal formado viola una FK, y el paso 3 esperó su gate: **una corrida completa verde**, cumplida
> por la del 2026-08-01 (candidatos y descartes escritos con `proyecto_id`/`voz_id` como FK).
>
> 🔀 **`fields.uuid` sigue viajando en `voces` y `proyectos`, y ya es redundante: vale lo mismo
> que el `id`.** Fue el campo de transición de los pasos 1 y 2 — servir los dos ids juntos hizo
> que el orden entre el deploy de Vercel y el re-import a mano en n8n dejara de importar. No se
> borra todavía porque los consumidores en n8n resuelven el uuid con `uuidDe[x.id] = x.fields.uuid`
> y, con los dos ids iguales, ese mapa queda **identidad**: por eso el paso 3 **no necesitó un
> tercer re-import**. Sacar el campo sí lo necesitaría, así que muere en el próximo re-import que
> haga falta por otra cosa, junto con el `uuidDe` que quedó sin trabajo.
>
> **`referentes[].fields.proyecto` viaja en el mismo idioma que `proyectos[].id`** — hoy los dos
> en uuid. Tenían que flipear **juntos**: el motor cruza las dos listas por ese id, así que mover
> una sola no habría fallado, habría dejado a todos los referentes sin proyecto y a la corrida sin
> nada que buscar. Es **un array**: un referente alimenta N proyectos
> ([ADR-032](../../docs/adr/ADR-032-referente-proyecto-es-n-a-n.md)).
>
> **`proyectos[].fields.voz_default` es un array de UN elemento** con el id de la voz — la forma que
> el motor lee (`voz_default[0]`) y con la que cruza contra `voces[].id`. Que la regla "1 proyecto =
> 1 voz" ahora sea una FK not null no cambia la forma del contrato.
>
> **De qué almacenamiento sale cada dominio hoy lo dice `apps/dashboard/lib/config.ts`**, y no se
> repite acá para que no quede viejo. Desde D7 **no hay excepciones**: todo sale de Postgres, en
> una sola lectura. La que hubo —`criterios_aprendidos` y `advertencia_criterios` leídos de
> Airtable aunque `Proyectos` ya viviera en Postgres— existía porque su único escritor,
> `Destilar criterios` del archivado, seguía escribiendo allá: un dueño por **campo**, no por
> tabla ([ADR-033](../../docs/adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md)). D7 movió
> ese escritor a PostgREST, así que el campo y su autor volvieron al mismo lugar y **ADR-033 se
> cumplió entera y murió** — era una regla con fecha de vencimiento puesta en D7.

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
