# Checklist — pipeline nuevo

> Copiá este archivo junto con el resto de la carpeta y marcá a medida que avanzás. Su guía, con el
> porqué de cada paso, es [`docs/runbooks/agregar-workflow.md`](../../../docs/runbooks/agregar-workflow.md).
>
> 🔴 = **toca el núcleo o el código de la app.** No son opcionales, y son la razón por la que este
> checklist es más largo que el de `agregar-cliente.md`. Ver el veredicto de F5 en el runbook.

## Antes de escribir nada

- [ ] **El ADR.** *Por qué* este pipeline existe, y qué NO va a hacer. Se escribe **antes**, y no es
      ceremonia: el flip de la Capa 2 se hizo dos veces el mismo día por saltear este paso. 🔴
- [ ] `cp -r core/templates/workflow-nuevo Workflows/workflow-<id>`
- [ ] Completar `workflow.yaml` y **`cd core/scripts && npm run validate` verde.**
- [ ] `README.md` del workflow, abriendo con **§Operación** como los otros 5.

## Los datos

- [ ] **Fila en `workflows`** (`id`, `nombre`, `motor`, `estado`). El `id` = el del manifest.
- [ ] **¿Tablas propias?** Si el pipeline tiene entidades que no son las de reels, van en una
      **migración nueva** en `core/schema/` — con su **columna de tenant** (`instance_id` o
      `client_id`, según el grano) desde la primera versión. 🔴
- [ ] **Sus policies de RLS, en la MISMA migración o en la siguiente.** Una tabla con
      `enable row level security` y cero policies devuelve **cero filas sin error**, y en un pipeline
      nuevo eso se lee como *"todavía no cargamos datos"*. Le pasó a LinkedIn: la `020` las creó sin
      policy y hubo que escribir la `024`. 🔴
- [ ] **Correr el check:** *"¿queda alguna tabla con tenant, RLS y sin policy?"* — el SQL está al pie
      de [`core/schema/024_rls_linkedin.sql`](../../schema/024_rls_linkedin.sql). **Cero filas.**
- [ ] **Verificar la migración por su EFECTO**, no porque corrió (la lección de la `019`).

## El cockpit

- [ ] `domain/pipelines.ts`: el pipeline entra a `ZONAS_POR_PIPELINE` y, si tiene pantallas de
      curación propias, a `CURAR_POR_PIPELINE`. 🔴
- [ ] `lib/supabase/scoped.ts`: sus tablas entran al mapa `TABLAS` **con su grano**. Sin esto la
      pantalla no compila — que es la red que uno quiere. 🔴
- [ ] Sus pantallas (`domain/<pipeline>.ts` puro + `lib/<pipeline>.ts` para el IO + la página). 🔴
- [ ] `npm run typecheck && npm test && npm run build` en `apps/dashboard/`.

## n8n

- [ ] Construir el `workflow.json` e **importarlo** (topología = re-import, no `n8n:push`).
- [ ] Resolver placeholders y credenciales, y **`npm run n8n:diff` inmediatamente después**. Dos
      veces se rompió el sistema por un `<<SUPABASE_URL>>` sin resolver que `onError: continue`
      silenciaba.
- [ ] Apuntarlo al error workflow global (`settings.errorWorkflow`).
- [ ] **Su cron va en el dispatcher**, no en el workflow.
- [ ] `node Workflows/auditar-workflows.mjs` verde.

## Prender

- [ ] Una corrida manual con **una instancia de prueba en `draft`**, y leer la fila de `runs`.
- [ ] `status: active` en el manifest **y** `estado = 'active'` en la fila de `workflows`.
- [ ] Anotar en el runbook lo que esta guía no decía. **Es el paso que hace que la próxima sea más
      corta**, y es lo que PLAN §F5 pide literalmente.
