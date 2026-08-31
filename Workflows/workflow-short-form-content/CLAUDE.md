# CLAUDE.md — motor de reels

Guía para trabajar en este workflow. El estado de producto vive en [ROADMAP.md](../../ROADMAP.md),
el contrato en [workflow.yaml](./workflow.yaml), el uso en [README.md](./README.md), y el porqué en
[ADR-009](../../docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) +
[ADR-010](../../docs/adr/ADR-010-scoring-semantico-y-etapa-calidad.md).

## Qué es

Un único workflow de **n8n** (`workflow.json`, 34 nodos, 2 entradas: Execute manual + webhook
on-demand con guard single-flight **por instancia** — ADR-023 + ADR-050; el cron semanal se mudó al
[dispatcher](../workflow-dispatcher/) en la Fase 4)
que es el **motor de reels** del MVP. Lee la config del equipo por la **fachada del cockpit**
(`/api/engine/run-plan`, D4/ADR-028 — ya no toca Airtable para config) → descubre reels IG + TikTok (Apify, solo por referentes — ADR-019) → prescore métrico (`Heat-score v1`) →
transcribe (Supadata) → **traduce literal al español con Claude Haiku solo si no está en español** →
**gate de relevancia** (Haiku estricto contra `criterios_relevancia`, compone el `heat_score`) →
entrega **candidatos a Postgres** por PostgREST (`app.candidatos`, estado `nuevo` — ADR-035) +
registra la corrida en **Supabase** (continue-on-fail). **El motor no usa ninguna credencial de Google.** Ver el flujo de 8 etapas y el
mapa de descubrimiento en el README.

El equipo de redes (Majo, Jero) **solo toca el cockpit**: arma la búsqueda (Referentes), ve el
feed y califica/selecciona scripts. Airtable salió del sistema en D7. El script es **texto** (sin Google Doc —
ADR-009); el "link" es la URL del video original.

> **Construido por builder Node, no a mano.** Para cambios estructurales: cargá el JSON, mutá
> `node.parameters.*` buscando por nombre (`w.nodes.find(n => n.name === '...')`), reescribí con
> `JSON.stringify(w, null, 2)` / `json.dump(..., ensure_ascii=False, indent=2)`. No edites a mano las
> expresiones grandes `={{ ... }}` ni los `jsCode`.

## Detalles que importan

- **Claude = Haiku traductor + jurado**, no escritor. `claude-haiku-4-5`, `anthropic-version:
  2023-06-01`, en **3 Code nodes** (`Pre-trim relevancia`, `Gate de relevancia`, `Traducir`) vía
  `this.helpers.httpRequest`. La key es el placeholder `<ANTHROPIC_API_KEY>` (3 ocurrencias). Antes de
  tocar la API de Anthropic, consultá el skill `claude-api`.
- **Apify por community node** `@apify/n8n-nodes-apify.apify` (op "Run actor and get dataset", sin tope
  de 5 min). NO `httpRequest` sync. Credencial `apifyApi`.
- 🔴 **El orden de las ramas paralelas lo decide la POSICIÓN EN EL CANVAS, no el JSON.** Con
  `executionOrder: v1`, cuando un nodo abre dos ramas n8n elige cuál corre primero por la posición de
  cada destino (arriba primero, después izquierda) y recorre esa rama entera antes de empezar la otra.
  **Reordenar el array de `connections` no hace nada.** Costó 3 corridas: el *"grabar la memoria antes
  de entregar"* de ADR-029 se implementó así y nunca entró en vigor. **La regla: si B depende de que A
  ya haya corrido, B va DETRÁS de A en serie, no en una rama hermana.** Chequeo automático:
  `node ../auditar-workflows.mjs` (todo `$('X')` tiene que apuntar a un ancestro).
- **Orden de ejecución:** el arranque es `Config → Barrer runs zombie → Leer corridas vivas → Guard
  single-flight → Abrir run → Leer plan (fachada)` (C.3, ADR-023): el barrido va antes del guard (un zombie
  jamás traba el motor) y el guard aplica a los 3 triggers. Dos dependencias van **en serie** por la
  regla de arriba: `Abrir run en el registro` (porque `Cerrar run` lo referencia por nombre) y
  `Preparar procesados → POST processed_items`, que se metió entre `Heat-score v1` y `Transcribir`
  para que la memoria del dedup se grabe **antes** de entregar (ADR-029, enmienda 2026-07-31).
- 🚨 **Los dos nodos caros tienen pool + presupuesto, y fallan distinto (ADR-044).** El watchdog del
  task runner (`N8N_RUNNERS_TASK_TIMEOUT`, 900 s en el pod) mata el **nodo entero** y la corrida no
  entrega nada, así que ni `Transcribir` ni `Traducir` pueden correr sin límite de tiempo. La
  asimetría que hay que tener en la cabeza antes de tocar cualquiera de los dos:
  **el presupuesto de `Transcribir` QUEMA** (`POST processed_items` corre antes, así que el video que
  queda afuera ya está en la memoria de dedup, vuelve sin transcript, el gate lo descarta `sin_guion`
  y no se reintenta nunca) y **el de `Traducir` DEGRADA** (sale en su idioma original y el gate lo
  juzga igual). Por eso el corte de `cap_top_n` es seguro —pasa dentro de `Heat-score v1`, antes de
  ese POST, o sea posterga— y el presupuesto no. **La palanca de throughput es la concurrencia**, no
  el presupuesto: este no puede pasar de ~880 s. Las 5 perillas viven en `Config`
  (`concurrencia_transcribir` 8 · `presupuesto_transcribir_s` 870 · `backoff_transcribir_ms` 500 ·
  `concurrencia_traducir` 8 · `presupuesto_traducir_s` 840) para tunearlas desde n8n **sin re-importar**.
  🔑 **La regla que las ata, y la que hay que sostener al mover cualquiera: CAPACIDAD > `cap_top_n`.**
  Mientras el presupuesto alcance para más videos que el tope, muerde el tope (posterga) y nunca el
  presupuesto (quema). Al 30/08: 870 s a 8 en vuelo ≈ **370 videos** contra un `cap_top_n` de 250.
  🩸 **Y ojo con subir la concurrencia por las malas razones.** El comentario del nodo justificaba
  24 en vuelo con un promedio de req/s, y era falso: **el límite se cobra en el PICO**, los 24
  workers arrancan juntos y un 429 rápido libera al worker que dispara otro pedido, así que la
  ráfaga se realimenta. Medido: a 24 en vuelo Supadata rechazó **17 de 27** con
  `429 limit-exceeded`; los mismos 27 a 4 en vuelo trajeron 24 guiones
  ([ADR-030 §Enmienda](../../docs/adr/ADR-030-descarte-duro-sin-transcript.md)). Desde el 30/08 el
  nodo hace **backoff exponencial con jitter** y sólo reintenta lo transitorio, así que subir la
  concurrencia ya no es la trampa que era — pero se sube midiendo, no razonando sobre promedios.
- **Gates fail-open, con dos excepciones:** si Haiku falla, el item pasa (invariante #1: no conviertas
  un fallo externo en dependencia de ejecución). Fail-open aplica a los gates de *juicio* y a las
  *escrituras* de registro. **Excepción 1 (ADR-029):** la *lectura* de `processed_items`
  (`Leer procesados`) es fail-closed — sin memoria, el run aborta en vez de re-entregar todo
  (`Leer feed vivo` —ahora contra `app.candidatos`— sí es fail-open, defensa secundaria). **Excepción 2 (ADR-030):** un video **sin
  transcript se descarta** en el `Gate` (`descarte_razon: 'sin_guion'`), no pasa marcado — el fail-open
  ya no cubre el *insumo* transcript (revierte la decisión #6). Si Supadata se cae entera, la corrida
  entrega 0 y lo avisa.
- **La config NO se lee de Airtable (D4, ADR-028).** `Leer plan (fachada)` hace **un** GET a
  `{dashboard_url}/api/engine/run-plan?ambito=motor&instancia={instance_id}` (contrato **v2**,
  ADR-048: sin instancia responde 400 y la corrida no arranca) y devuelve voces/proyectos/referentes/ajustes en
  la misma forma `{id, fields}`. Es **fail-closed a propósito: no le pongas `onError`** — sin config
  el run tiene que abortar. Si necesitás un dato de config nuevo, se agrega **en la app** (y en el
  [contrato](../../core/contracts/run-plan.md)), no con un nodo Airtable nuevo acá.
- **Un `httpRequest` corre una vez POR ITEM.** Después del fan-out entran cientos de items, así que
  cualquier lookup **de corrida** (URL igual para todos) necesita `executeOnce: true` o dispara
  cientos de requests idénticos y muere por timeout. Ya pasó: mató el cron del 27/07 en `Leer
  procesados`. Los 3 del segmento de dedup lo tienen + retry ×3 (dev-doc §2.1).
- 🩸 **`Leer procesados` PAGINA, y no es un detalle de implementación: sin eso el dedup miente.**
  PostgREST tiene **`max-rows` en 1.000**, así que el viejo `&limit=50000` devolvía 1.000 filas de
  1.547 — sin error, sin aviso — y el motor quedaba **ciego al 35% de su memoria**. Peor: el guard
  fail-closed de ADR-029 comparaba contra `>= 50000`,
  un número que la lectura no podía alcanzar, así que **nunca disparó**. Hoy el nodo pagina por
  `offset` (1.000 × 50 páginas) y hay **dos** guards en `Heat-score v1`: el de 50.000 (que recién
  ahora es el techo real, **acoplado a `maxRequestsPerPage`** — si movés uno, mové el otro) y el de
  **1.000 exacto**, que detecta que la paginación se apagó. Ver
  [ADR-029 §Enmienda 2026-08-31](../../docs/adr/ADR-029-dedup-blindado-fail-closed-y-feed.md).
  ⚠️ **`processed_items` NO se barre nunca** (el archivado borra `candidatos`), así que la tabla
  crece sin techo: cualquier lectura entera de esa tabla necesita paginar, hoy y siempre.
- 🩸 **Y lo que la ceguera destapó, que es peor: las dos líneas del dedup se habían dado vuelta.**
  Medido sobre la corrida del 31/08, con 465 videos en el corte: la línea **fail-closed**
  (`processed_items`) mató **0** y la **fail-open** (`Leer feed vivo`) mató **95** — y los 95 ciegos
  son ese mismo conjunto, o sea que la fuga real fue **cero** y **la secundaria hacía el 100% del
  trabajo**. ADR-029 eligió a propósito cuál aborta el run y cuál puede caerse sin drama; los roles
  se invirtieron solos y **un fail-open de único guardia se ve igual que un sistema sano**.
  ⚠️ **`Leer feed vivo` también se corta en 1.000** (`app.candidatos` va por 274) y **no tiene guard
  propio**: el día que pase esa marca caen las dos líneas a la vez, en silencio.
- **`heat_score` es composite** (ADR-010): `peso_relevancia·score_haiku + (1-peso)·percentil(prescore
  métrico)`. El gate también guarda `relevancia_score`/`relevancia_razon` (se escriben en `app.candidatos`). El
  substring de tema **no existe** (salió en el refactor de relevancia).
- **Passthrough de campos:** los Code nodes intermedios hacen `Object.assign({}, d, {...})` → un campo
  agregado en `Normalizar` (ej. `thumbnail_url`) sobrevive hasta `Armar candidato`, que **reconstruye**
  el objeto (ahí hay que listarlo explícito).
- **`pinData` debe quedar `{}`** (data fija mata el scrape real).

## Operación — cómo se cambia este workflow

**Cambiarlo ya no es re-importarlo** ([ADR-053](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)):
el repo es la **forma**, el live es el **estado**. Un cambio de `parameters` (un `jsCode`, una URL, un
valor del `Config`) se parchea por la API de n8n:

```bash
cd core/scripts && npm run n8n:push -- motor --nodos "Armar plan de corrida,Heat-score v1"
```

Es **dry-run**; se aplica con `--apply`. Snapshotea antes en `.n8n-snapshots/` y el rollback es
`npm run n8n:restore -- motor <snapshot> --apply`. Jamás toca credenciales, ids, posiciones ni
`settings`. Antes y después: `npm run n8n:diff` (solo lee) dice si el live corre lo que dice el repo.

**Desde el 2026-08-30 el push también cubre la topología** (nodos y conexiones, [ADR-053 §Enmienda](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)): pide `--nodos` si crea nodos, `--borrar` para lo que desaparece o pierde cableado, y se niega si dejaría un nodo inalcanzable. **El re-import completo queda solo para crear un workflow desde cero**, y ahí sí aplican los placeholders y las credenciales de abajo.

Ahí sí hay que rellenar los placeholders y mapear las credenciales a mano, que es donde
históricamente se rompió todo: ver el aviso de abajo.

## Convención de placeholders *(solo al crear el workflow de cero)*

Los completa una persona en el editor **cuando hay re-import**; en el camino normal (`n8n:push`) se
resuelven solos porque el script los **aprende del propio live**. API keys `<ANTHROPIC_API_KEY>` /
`<SUPADATA_API_KEY>` (en los Code nodes), e IDs `<<SUPABASE_URL>>` / `<<DASHBOARD_URL>>` /
`<<WEBHOOK_PATH_MOTOR>>` (en el nodo `Config`). **`<<AIRTABLE_BASE_ID>>` murió en D7 y
`<<INSTANCE_ID>>` en la Fase 4** — la instancia ya no es una constante del archivo, viaja en el
payload del webhook (ADR-048). Son **5**, no 6.

> ⚠️ **Un placeholder sin resolver no falla en rojo.** `<<…>>` no es sintaxis de expresión de n8n:
> se manda literal, el request muere, y si el nodo va con `onError: continueRegularOutput` la
> ejecución **termina en verde igual**. Rompió el error handler dos veces y las dos las encontró un
> diff, nunca una corrida. Por eso `npm run n8n:diff` va **después de cada import**.

Listarlos:

```sh
node -e "const s=require('fs').readFileSync('workflow.json','utf8');console.log([...new Set(s.match(/<<?[A-ZÁÉÍÓÚÑ][^>]*>>?/g))].sort().join('\n'))"
```

## Validar

`cd core/scripts && npm run validate` (contrato del manifest + escaneo de secretos) y
`node test-nodos.mjs` (ejercita `Armar plan`, `Armar candidato`, `Transcribir`, `Traducir`,
`Heat-score`, `Gate`, `Preparar procesados` y los dos `Preparar` que escriben el cockpit
—`candidatos` y `descartes`, donde vive la instancia de cada fila— fuera de n8n con `$` y `this.helpers` mockeados — el
mock cuenta llamadas **y concurrencia en vuelo**, así que un pool que se serializa sin querer se ve
acá; corrélo SIEMPRE antes de empujar al live si tocaste esos nodos). Si tocaste **conexiones, posiciones o cualquier `$('X')`**, corré
además `node ../auditar-workflows.mjs`: chequea conexiones rotas, inalcanzables, refs a no-ancestros,
que los `jsCode` compilen **como AsyncFunction** (un `new Function()` pelado da falsos positivos por
los `await` de nivel superior) y te lista los placeholders del re-import. La conducta final igual se
valida **en n8n** (el motor corre ahí, no localmente): `npm run n8n:push -- motor --nodos "…" --apply`
y *Execute Workflow*, con `npm run n8n:diff` limpio después.

## Git

Commits en español, concisos, directo a `main`.
