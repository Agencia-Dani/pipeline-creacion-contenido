# Contrato de lectura — `GET /api/engine/run-plan` (ADR-028)

El hermano de *lectura* de [ingesta-registro.md](./ingesta-registro.md): así como los workflows
**reportan** runs/outputs a Supabase, el **motor pregunta acá qué correr** antes de gastar créditos.
Lo sirve el dashboard ([`apps/dashboard`](../../apps/dashboard/)); el motor deja de conocer el
schema de la config para siempre — Airtable hoy, Postgres en D5, **sin re-import de por medio**.

## La llamada

- **`GET <URL del dashboard>/api/engine/run-plan?instancia=<uuid>`** con **header compartido** (nombre y valor en el
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
- **`?instancia=<uuid>` es OBLIGATORIO desde v2 ([ADR-048](../../docs/adr/ADR-048-run-plan-v2-motor-por-instancia.md)):**
  dice **de quién** es la config que se pide. Ausente ⇒ **400**; inexistente o ajena al llamante ⇒
  **403**. En los dos casos la corrida no arranca.
  > ⚠️ **No hay default, y es la decisión, no un olvido.** Caer a "la única instancia activa"
  > funciona hasta el día que hay dos, y ese día falla **mudo**: el dispatcher se olvida del payload
  > y la corrida entrega los candidatos de una empresa dentro de la otra, en verde. Un 400 al
  > arrancar cuesta una corrida; el default silencioso cuesta descubrirlo en los datos.
- **De dónde sale el uuid:** del payload del webhook (`{ "instancia": "<uuid>" }`), que le mandan el
  dispatcher ([ADR-050](../../docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md)) y el
  botón ▶ del cockpit. **Ya no es una constante del archivo** — ver
  [ingesta-registro.md](./ingesta-registro.md).
- **Fail-closed (ADR-028 §4):** cualquier respuesta ≠200 (400, 403, 503, timeout) debe **abortar la
  corrida** — el HTTP Request de n8n se deja SIN continue-on-fail a propósito. Una corrida sin
  config entrega ruido; no entregar es mejor. El registro (`runs`/`outputs`) sigue siendo
  fail-open: esto solo gobierna el arranque.

## Qué devuelve (v2)

Los **mismos registros, con los mismos filtros server-side** que los 4 nodos Airtable que
reemplaza (`Leer Voces` / `Leer Proyectos` / `Leer Referentes` / `Leer Ajustes`), en la forma
`{id, fields}` que el motor ya parsea:

```json
{
  "version": 2,
  "generado_en": "2026-07-20T08:00:00.000Z",
  "voces":      [{ "id": "uuid…", "fields": { "nombre": "…", "criterios_relevancia": "…", "activo": true } }],
  "proyectos":  [{ "id": "uuid…", "fields": { "nombre": "…", "criterios_relevancia": "…", "voz_default": ["uuid…"], "N": 20, "…": "…" } }],
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
> ☠️ **`fields.uuid` murió en v2.** Fue el campo de transición de los pasos 1 y 2 del expand/contract
> —servir los dos ids juntos hizo que el orden entre el deploy de Vercel y el re-import a mano en
> n8n dejara de importar— y desde el paso 3 valía lo mismo que el `id`. Se quedó vivo solo porque
> sacarlo costaba un re-import propio y el mapa `uuidDe[x.id] = x.fields.uuid` de los workflows
> quedaba identidad, o sea inofensivo. **v2 ya paga ese re-import por la instancia**, así que el
> campo y los tres `uuidDe` se fueron juntos (ADR-048 §5).
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

`version` gobierna la compatibilidad (ADR-028 §5): mientras no cambie, la app puede cambiar de dónde
salen los datos (Airtable → Postgres, dominio por dominio) sin tocar n8n. Un cambio de **forma**
sube la versión y **ahí sí** hay que tocar n8n de forma coordinada.

> 📌 **Desde [ADR-053](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md) eso ya casi
> nunca es un re-import.** Un bump que solo cambia cómo un nodo lee el plan es un cambio de
> `parameters`: va por `npm run n8n:push -- <alias> --nodos "…"`, con dry-run y rollback. El re-import
> completo queda para lo que mueve **topología** (nodos o conexiones nuevas), que es lo único que el
> push se niega a hacer.

**Historia, corta:** `1` sirvió todo D5–D7, incluido el flip de ids de
[ADR-035](../../docs/adr/ADR-035-contrato-de-escritura-por-postgrest.md) — que anunció un bump y
**nunca lo necesitó**, porque terminó siendo pass-through. `2` es el primero de verdad
(ADR-048): dos cambios de forma juntos, `?instancia` obligatorio y la muerte de `fields.uuid`.

## Quiénes corren — `GET /api/engine/instancias?workflow=<slug>`

El hermano chico de este contrato, y su único consumidor es el **dispatcher** (ADR-050). Misma
credencial, mismo fail-closed, solo lectura:

```json
{ "workflow": "short-form-content",
  "instancias": [{ "id": "uuid…", "cliente": "30x", "slug": "reels", "nombre": "Reels 30X" }] }
```

- **`workflow` es obligatorio** (falta ⇒ 400): sin él la respuesta serían todas las instancias de
  todos los pipelines, y el dispatcher del motor terminaría mandándole el webhook del motor a una
  instancia de otro pipeline.
- **Lista vacía es 200, no 404.** Un pipeline sin instancias activas es un estado legítimo, y el
  dispatcher tiene que poder no disparar nada sin entrar a su rama de fallo.
- Vive en la app y no es una query de n8n a PostgREST por la misma razón que todo lo demás acá: si
  mañana "instancia activa" deja de ser `estado = 'active'`, cambia la app y ningún workflow se
  entera.

## Los dos ámbitos (decisión de Mani, 2026-07-20)

Un solo endpoint y una sola credencial; el query param elige el filtro:

- **`?ambito=motor` (default):** lo de arriba — los filtros de ADR-028 §2 y la N resuelta.
- **`?ambito=completo`:** el **mismo shape, sin filtros de `activo` y con `N` tal cual**. Lo
  consumen el **archivado** (necesita TODAS las voces para resolver nombres al archivar) y el
  **descubrimiento** (no respeta `activo` a propósito — despensa para voces pausadas, cierre 49).
  Cada workflow aplica su propia lógica sobre el total, exactamente como hoy.
- Un `ambito` desconocido responde **400** (un typo en n8n no puede degradar en silencio al default).
