# Runbook — agregar un pipeline nuevo

> **Para quién.** Un dev del repo. **No es un runbook de operación: es de construcción.**
>
> **Cuánto tarda.** Días, no minutos — y ese es el hallazgo, no una queja.
>
> **El criterio de este doc** ([PLAN §F5](../../PLAN.md)): *si algún paso exige modificar el núcleo,
> el diseño no está listo — se corrige la guía o el contrato, no se parchea a mano.*

---

## 🔴 El veredicto de F5, primero, porque cambia cómo se lee todo lo demás

**Agregar un pipeline NO pasa el criterio.** No es una impresión: está medido contra el caso real,
que es LinkedIn (ADR-055/056), y son los dos commits que lo trajeron.

| Commit | Qué trajo | Líneas |
|---|---|---|
| `0bc0678` | El pipeline existe: manifest + `020_pipeline_linkedin.sql` + `domain/pipelines.ts` + 7 archivos de rutas/nav + 2 ADRs | **+1.082** |
| `b7249f5` | **Una sola** pantalla (Referentes): `domain/linkedin.ts`, `lib/referentes-linkedin.ts`, sus actions, su componente, `scoped.ts` y `024_rls_linkedin.sql` | **+1.427** |

**~2.500 líneas, 2 migraciones en `core/schema/`, 2 ADRs y ~15 archivos de `apps/dashboard/` — para
un pipeline que todavía no corre en n8n.** Comparalo con
[`agregar-cliente.md`](./agregar-cliente.md): una empresa nueva es SQL de datos y clics, cero código.

### Por qué el contraste, y qué se templatiza de verdad

**Una empresa es un parámetro. Un pipeline es un dominio.** El sistema se diseñó para que el eje
*+empresas* fuera barato —y lo logró: el motor es un workflow parametrizado y el dispatcher lo
multiplica— pero el eje *+pipelines* nunca se templatizó, porque **cada pipeline tiene entidades
propias** ([§2.D](../agents/plan-multi-tenant.md): tablas propias por pipeline). Un post de LinkedIn
no es un reel con otro nombre: tiene otros campos, otro scoring y otras pantallas.

**Lo que sí se puede templatizar, y por eso `core/templates/workflow-nuevo/` existe:** el manifest, la
estructura de la carpeta y **el checklist de lo que no hay que olvidarse** — que es donde se pierde el
tiempo de verdad. Los agujeros que costaron sesiones enteras (una tabla con RLS y sin policy, un
placeholder sin resolver que `onError: continue` se traga, un cron local en vez del dispatcher) son
todos **de olvido**, no de diseño.

**Lo que NO se puede, y no hay que fingir que sí:** el dominio, las pantallas y sus tablas.

> 📌 **Qué haría falta para que este runbook pase F5.** No se propone acá porque es una decisión con
> ADR, pero la forma se ve: que **una pantalla de curación sea configuración y no código** — un
> descriptor por pipeline (columnas, tipos, acciones) que rinda la tabla, el formulario y el mapa de
> `scoped.ts` desde un solo lugar. Hoy esas tres cosas se escriben tres veces por pantalla. **Es un
> proyecto, no un refactor**, y se decide con dos pipelines reales encima, no con uno.

---

## Antes de escribir una línea

**Escribí el ADR.** *Por qué* este pipeline existe, qué NO va a hacer, y qué entidades propias
necesita.

🔑 **Esto no es ceremonia, y hay una factura que lo prueba:** el flip de la Capa 2 se hizo **dos veces
el mismo día** por dos sesiones que no se vieron, y las dos llegaron al mismo diseño. La conclusión
quedó escrita: *escribir el ADR antes —como manda el repo— habría ahorrado el día duplicado.*

Y antes que el ADR, la pregunta que a LinkedIn le falta responder hace un mes: **¿cuál es la
definición de "funcionó"?** LinkedIn tiene tablas, cockpits y una pantalla, y sigue bloqueado por lo
**no técnico** — no hay definición de éxito, no existe el banco de referentes, faltan los few-shot.
**Construir superficie para datos que no existen es la forma cara de no avanzar.**

---

## Los pasos

El checklist marcable está en
[`core/templates/workflow-nuevo/CHECKLIST.md`](../../core/templates/workflow-nuevo/CHECKLIST.md).
Acá el porqué de los que tienen trampa.

### 1. El esqueleto

```bash
cp -r core/templates/workflow-nuevo Workflows/workflow-<id>
# completar workflow.yaml
cd core/scripts && npm run validate     # verde ANTES de escribir código
```

⚠️ **`id` tiene que ser el sufijo exacto de la carpeta**, y no se renombra jamás: es la key en
`workflows`, en `instances.workflow_id` y en `domain/pipelines.ts`. Si hay que cambiarlo, se retira el
workflow y se crea otro.

⚠️ **Las 8 etapas de `stages` van todas**, con `n/a` las que no apliquen. Es lo que hace comparables
dos workflows que no se parecen.

### 2. Las tablas — y sus policies, en el mismo acto

Migración nueva en `core/schema/`, con **su columna de tenant desde la primera versión**
(`instance_id` si es del cockpit, `client_id` si es de la empresa — el doble grano de
[§2.B](../agents/plan-multi-tenant.md)).

🩸 **El error que ya se cometió, y hay que no repetir.** La `020` creó las 4 tablas de LinkedIn con
`enable row level security` y **cero policies**, apoyándose en que la Capa 2 las cubriría. La `021`
no las nombró ni una vez. Resultado: 4 tablas que devolvían **cero filas sin un solo error** — y en un
pipeline recién nacido eso se lee como *"todavía no cargamos datos"*. Hizo falta la `024` para taparlo.

⚠️ **Desde el 2026-08-05 el flip de la Capa 2 está en producción, así que las policies de una
migración se evalúan desde el minuto que entra.** Ya no hay red: **la migración va a prod ANTES que
la pantalla**, nunca al revés.

**Verificá la migración por su EFECTO, no porque corrió.** Es la lección de la `019`
([§14.1](../agents/plan-multi-tenant.md)): se corrió sin error visible y **no había entrado**, porque
un `raise exception` del `§0` abortaba la transacción entera. Se dio por aplicada un día, y entró al
siguiente.

**Y corré el check** *"¿queda alguna tabla con tenant, RLS y sin policy?"* — el SQL está al pie de
[`024_rls_linkedin.sql`](../../core/schema/024_rls_linkedin.sql). **Cero filas.**

### 3. El cockpit

Dos archivos donde el compilador te cubre, y conviene tocarlos primero:

- **`domain/pipelines.ts`** — `ZONAS_POR_PIPELINE` y, si tiene pantallas propias de curación,
  `CURAR_POR_PIPELINE`. El índice de `curar` **deriva** sus tarjetas de acá y la guardia pregunta a lo
  mismo: una sola lista de qué existe en cada pipeline. El `Record<PantallaCurar, Copy>` es
  exhaustivo, así que sumar una pantalla **no compila** hasta escribirle su texto.
- **`lib/supabase/scoped.ts`** — las tablas nuevas al mapa `TABLAS`, **con su grano**. Sin esto la
  pantalla no compila, que es exactamente lo que uno quiere.

🩸 **Lo que la primera pantalla de LinkedIn destapó:** sus cockpits ya eran alcanzables y su zona
`curar` dibujaba **las 7 tarjetas de reels**. Seis llevaban a pantallas que leen las tablas de reels y
devolvían vacío para ese `instance_id`, **sin fallar**. ADR-056 había resuelto el nav por *zona* y
nadie miró un nivel más abajo. **Cuando agregues un pipeline, mirá los dos niveles.**

### 4. n8n

- **Es re-import, no `n8n:push`.** El push parchea `parameters` de nodos que ya existen y **se niega**
  ante topología nueva, a propósito ([ADR-053](../adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md)).
- **`npm run n8n:diff` inmediatamente después.** Dos veces se rompió el sistema por un
  `<<SUPABASE_URL>>` sin resolver que el `onError: continue` silenciaba. El diff es lo único que lo ve.
- **Apuntalo al error workflow global** (`settings.errorWorkflow`), como los otros 4.
- **Su cron va en el dispatcher, NO en el workflow.** Un cron local no tiene de dónde sacar la
  instancia: produciría corridas que abortan después de `Abrir run` y dejan la fila en `en_curso` para
  siempre — un fallo mudo, una vez por semana.
- `node Workflows/auditar-workflows.mjs` verde: caza `$('X')` que apunte a un nodo que no es ancestro
  suyo, que es la clase de bug que dejó el dedup sin efecto durante 3 corridas.

### 5. Prender, y corregir esta guía

Primero una corrida manual contra una **instancia de prueba en `draft`**, y **leer la fila de `runs`**.
Recién después: `status: active` en el manifest **y** `estado = 'active'` en la fila de `workflows`.

🔑 **Y el último paso es el que hace que la próxima vez sea más corta:** anotá acá lo que esta guía no
decía. PLAN §F5 lo pide literal — *"las guías quedaron corregidas con lo aprendido"*.

---

## El estado real de los pipelines, al 2026-08-06

| Pipeline | Manifest | Tablas | Cockpit | En n8n | Cron |
|---|:-:|:-:|:-:|:-:|:-:|
| `short-form-content` (reels) | ✅ | ✅ | ✅ 4 zonas | ✅ 34 nodos | ✅ lunes 08:00 |
| `linkedin` | ✅ | ✅ `020` + `024` | 🔧 1 pantalla de 7 | ❌ | ❌ |
| `substack` | ✅ | ❌ | ❌ | ❌ (corrió mar–abr 2026, se re-monta en F3) | ❌ |

**Un solo pipeline llegó a la meta**, y es el que se construyó antes de que existiera la plantilla.
Eso es lo que este runbook mide.
