# HANDOFF — estado vivo del MVP de reels

> **Si vas a trabajar en el repo, leé esto primero (2 min).** Acá vive el estado real: qué task
> está libre, quién tiene qué, y qué pasó en las últimas sesiones. El *qué hacer y cómo* de cada
> task vive en [ROADMAP §3](../../ROADMAP.md); el contexto de producto en [ROADMAP §1](../../ROADMAP.md) y el
> diseño en [PLAN.md](../../PLAN.md). El tablero activo del refactor vive en
> [refactor-voces-proyectos.md §4–§5](./refactor-voces-proyectos.md) (componentes A–E).

## Protocolo (lo único que hay que respetar)

1. **Al tomar un task:** ponete como dev y pasalo a 🔧 en el tablero. Commit chico ("toma B1").
   Así nadie duplica trabajo.
2. **Al terminar la sesión** (termines o no el task): actualizá el tablero, y agregá una entrada
   al log de abajo — *qué se hizo · qué quedó a medias · gotchas/aprendizajes · qué sigue*.
   Marcá `[x]` lo completado en el checklist del ROADMAP. Commit + push de todo junto.
3. **Credenciales e IDs: JAMÁS acá ni en ningún archivo del repo.** Todo va al gestor de
   contraseñas compartido (el validador escanea secretos en cada corrida).
4. Si un task revela que el diseño está mal → no parchear en silencio: anotarlo en el log y
   discutirlo (si es estructural, termina en ADR).

**Estados:** ⬜ libre · 🔧 en curso · ✅ hecho · ⛔ bloqueado

## Pendiente vivo (arrastres manuales de Mani — antes de la próxima corrida real)

> ## 🔥 2026-08-06 (cierre 99) · EL COCKPIT SE ADIVINABA, Y HACE 3 DÍAS ADIVINABA MAL
>
> **Leelo antes que nada: cambia lo que hay que hacer y desbloquea B1.** Salió buscando por qué el
> botón "Cargar más" del feed no funcionaba, y el botón era el síntoma más chico.
>
> ### El bug
>
> Las **~30 server actions** llamaban `exigirTenant(zona)` **sin segmentos**, porque una server
> action no recibe los `params` de la ruta. Sin segmentos, `resolverContexto` cae a *"el primero que
> alcance"* — un default correcto para la raíz `/`, y **una adivinanza en todas las demás**.
>
> Con `retia/reels` como única instancia activa, adivinar acertaba siempre. El **2026-08-03 20:46**
> entraron las 3 de LinkedIn; `leerInstancias()` ordena por `(client_id, slug)` y filtra
> `estado = active`, así que el primero pasó a ser **`30x/linkedin`**. Desde ese momento, cada acción
> del cockpit de Retia leyó y escribió en el tenant de 30X para quien tuviera la mala suerte de
> alcanzarlo. La tabla existe, la query es válida, devuelve cero filas: **el fallo mudo otra vez**,
> y esta vez en producción durante 3 días.
>
> ### 🎯 A quién le rompía: 3 de 8, y son exactamente los tres que no son del equipo de redes
>
> Calculado sobre las membresías reales y el orden de `leerInstancias()`. `retia/linkedin` es
> `draft`, así que no cuenta — por eso un operador de Retia veía **una sola** instancia y acertaba.
>
> | | `suyas[0]` | |
> |---|---|---|
> | **Manuel Mejia** y **Alejandro Dávila** (`es_dueno`) | `30x/linkedin` | 🔴 roto |
> | **Alejandro 30X** (`30x` + `estadox`) | `30x/linkedin` | 🔴 roto |
> | Majo, Jero, Alejo, Juan José, Manuel 30X (solo `retia`) | `retia/reels` | 🟢 andaba |
>
> 🩸 **O sea: el equipo de redes podía calificar y los dos devs no.** Que no haya un solo evento
> `candidatos.calificar` desde el 01/08 **no lo explica este bug** para Majo y Jero: a ellos la
> pantalla les funcionaba. Vale la pena preguntarles si intentaron y algo más los frenó, porque esa
> sería otra falla y no está diagnosticada.
>
> 📌 **Y corrige un dato del bloque 🅱️ de más abajo:** ahí dice *"Majo (`30x`+`estadox`)"*. En prod
> **Majo Duarte es solo `retia`**; la cuenta con doble membresía es **Alejandro 30X**. Los números
> de la prueba de B3 no cambian (se corrieron con sesiones reales), pero el nombre estaba cruzado.
>
> **La página nunca estuvo mal** — `page.tsx` sí recibe `params`. Solo las acciones. Por eso el feed
> mostraba 175 en el chip (página, tenant bueno) y "Cargar más" traía 0 (acción, tenant malo) y
> hacía desaparecer el botón sin decir nada.
>
> ### Medido contra prod, no deducido
>
> | | |
> |---|---|
> | `app.candidatos` de `retia/reels` | **175**, y **0 calificados** |
> | `app.candidatos` de `30x/linkedin` | **0** — lo que leía "Cargar más" |
> | último evento `candidatos.calificar` | **2026-08-01 17:39**. Nada en 3 días (ver el matiz de abajo: al equipo de redes la pantalla le andaba) |
> | último `outputs` escrito | 04/08, y sus 9 filas tienen `calificado_en` del **01/08** |
>
> 🩸 **Y una fila sospechosa que Mani tiene que mirar:** el evento `voces.crear` del **05/08 15:25**
> quedó registrado en la instancia **`30x/linkedin`**, y en `app.voces` hay una voz **"Alejo" con
> `client_id = 30x`**. Si la creaste parada en un cockpit de Retia, **está en la empresa
> equivocada** y ninguna pantalla de Retia te la va a mostrar. Si la creaste en `/30x/...`, está
> bien. No lo puedo distinguir desde afuera: la decisión es tuya.
>
> ### El arreglo (`c267980`, ya en `main`)
>
> `exigirTenant(zona, cliente, pipeline)` con los **dos obligatorios**. Un cockpit que falta pasó a
> ser un **error de compilación** — no un default fail-closed que explota cuando alguien hace click.
> Es la regla que `scoped()` ya aplica a las queries (ADR-047 Capa 1) un escalón más arriba: *si no
> se puede nombrar el cockpit, no se puede construir la guardia.* tsc listó los 25 call sites; el
> cockpit viaja desde el cliente con `usarCockpit()` (que lo lee de la URL, la misma fuente que
> `params`) y **no es un permiso**: se valida contra `instanciasVisibles`.
>
> ⚠️ **A5 se salvó por no estar deployada.** `ajustes/equipo/actions.ts` documentaba que *"la empresa
> no es un parámetro… sale del cockpit abierto"* como su defensa contra el modo de falla de ADR-051.
> Era cierto salvo por el detalle de que el cockpit abierto estaba adivinado: **habría dado de alta
> a la gente de Retia en 30X**, con el gate de rol evaluado contra el cockpit equivocado.
>
> ### El feed, además, dejó de paginar (decisión de Mani)
>
> Se van el cursor keyset (`Cursor`/`cursorDe`/`despuesDe` y sus 5 tests), `POR_PAGINA`, `hayMas` y
> el botón. **175 filas = 103,7 KB medidos**, y PostgREST las devuelve todas (no hay `db-max-rows`;
> se comprobó pidiendo sin `limit`). El filtro **se queda en la query**: es lo que sostiene el
> congelado de plan-cockpit §D6.4 sin tener que escribirlo.
>
> ### 🔓 Qué desbloquea, y qué falta
>
> **B1 estaba esperando algo imposible.** Su condición 4 pide *un archivado verde que escriba
> `outputs`*, y el archivado solo escribe si hay calificados — que es justo lo que este bug impedía.
> El orden real es: **deployar → que el equipo califique → archivado → recién ahí la `023`.**
>
> 🚧 **Lo único que falta y no puedo hacer yo: el deploy a Vercel.** Arrastra también A5 y el gate de
> costos del Carril 0, que seguían sin salir.

> ## 🚦 2026-08-06 · RETIA ENTRA, Y HAY UN PLAN DE DOS CARRILES: [plan-multi-tenant §15](./plan-multi-tenant.md#15-el-cierre-del-producto-en-dos-carriles)
>
> **Leelo antes de tomar nada de la tabla de abajo.** Tres personas de Retia —empresa cliente, no la
> agencia— empiezan a usar la herramienta, y eso cruzó tres disparadores que el repo dejó escritos
> con fecha: el alta manual de ADR-051, el gate de costos de `domain/roles.ts:25-31`, y el eje
> *+usuarios* de §10.
>
> **§15 está escrito para dos agentes trabajando en paralelo**, con dueño único por archivo (§15.C):
>
> | Carril | Rama | Qué | No toca |
> |---|---|---|---|
> | **A** | `carril-a-accesos` | La zona **Ajustes** (5ª), la pantalla de **equipo** con invitaciones, la migración **`025`** con las policies que la `021` dejó sin escribir, y la concurrencia visible en Operar | n8n, el motor |
> | **B** | `carril-b-cierres` | El gate de la **`023`**, el **check #1** contra prod, la prueba de **§14.6**, los **runbooks** + `core/templates/`, y la deuda de docs medida | `apps/dashboard/` |
>
> 🔴 **Antes de los dos, y lo hace Mani a mano (Carril 0, §15.0.bis):** el gate de costos de
> [`entender/page.tsx:41`](../../apps/dashboard/app/[cliente]/[pipeline]/(zonas)/entender/page.tsx)
> dice `rol !== "sponsor"`, así que **un `operador` ve lo que cuestan los proveedores**. Con gente de
> Retia adentro eso es el margen de la agencia, y *falla hacia MOSTRAR*. El arreglo ya estaba escrito
> en `roles.ts:31`: pasarlo a `rol === "dev"`. **Va antes de dar las 3 altas.**
>
> ⚠️ **Cuatro dependencias de orden que no se pueden invertir:** Carril 0 antes de las altas ·
> **A1 (`025`) antes que A5 en prod** (el flip está vivo: pantalla sin policy = cero filas o `42501`)
> · ~~**B2 después de A1**~~ · **B4 después de A5** (el runbook de alta de cliente cambia de forma
> cuando el alta deja de ser SQL).
> **📌 Corregido el 06/08: eran tres, no cuatro.** La de B2 partía de que la `025` crea tablas, y no
> crea ninguna — crea una función y policies. **B2 ya se corrió y dio cero filas** (bloque 🅱️ abajo).
> La de B4 tampoco bloqueó: el runbook se escribió asumiendo A5, con el paso marcado para verificarlo.
>
> 💣 **Landmine que la pantalla de equipo va a tocar primero:** `scoped.ts:51` declara
> `"app.usuarios": { grano: "cliente" }` ⇒ filtra por `client_id`, **columna que la `019` dropeó**.
> Hoy nadie lo ejerce porque `lib/auth.ts` lee esa tabla con `createClient()` directo. Es la tarea A2.

> ## 🅰️➡️ CARRIL A MERGEADO A `main` (2026-08-06) — 6 de 7. **Falta A7 y nada más.**
>
> El carril A se quedó sin usage antes de empezar **A7**. Todo lo demás entró: Carril 0 (`d89ef04`),
> ADR-060 (`dc9ae59`), la `025` (`0ad70ec`), A2+A3 (`8763333`), A4 (`7e261b7`), A5 (`8218347`).
>
> **Rebase sin un solo conflicto**, y eso es §15.C funcionando: los dos carriles editaron
> `plan-multi-tenant.md` y no se pisaron porque cada uno escribió solo su sub-bloque.
> Verificado sobre el árbol mergeado: `typecheck` · **222/222** · `build` · `validate` (2143 checks)
> · `n8n:diff` limpio en los 5.
>
> ### ✅ La `025` está aplicada, y **la verifiqué por su efecto contra prod**
>
> El commit de A decía *"falta aplicarla en el SQL Editor"* — Mani ya la corrió. No se da por
> aplicada porque haya corrido (la lección de la `019`): **26 policies** (eran 24), las 3 funciones
> existen, y `app.tarifas` dejó de ser `using (true)`. Y se corrió su verificación #2 con **sesiones
> reales** (`set local role authenticated`), que es lo que el fixture de A no podía dar:
>
> | sesión | membresías | personas | tarifas | emails | dueños que asoman |
> |---|---:|---:|---:|---:|---:|
> | dueño (`retia:dev`) | 8 | 7 | 8 | 6 | **0** |
> | Retia `operador` | 5 | 5 | **0** | 5 | **0** |
> | Majo (`30x`+`estadox`) | 2 | 1 | **0** | 1 | **0** |
>
> **Un `operador` obtiene 0 tarifas y un `dev` las 8**: el margen de la agencia quedó cerrado *en la
> base*, que era el hallazgo 4 de ADR-060 (el gate era solo de UI). Y **cero dueños asoman** en las
> tres sesiones ⇒ el bug que la medición de A cazó está corregido en prod.
>
> 📌 **Dos números difieren del fixture y ninguno es la policy:** `tarifas` del dueño da 8 y no 2
> (prod tiene 8 tarifas, el fixture sembró 2), y Majo da 2/1 y no 6/5 porque **en prod está en
> `30x`+`estadox`, no en `retia`+`30x`** como supuso el fixture. La suposición estaba mal; el
> comportamiento está bien.
>
> 🩸 **Y una anotación del pie de la `025` que NO hay que creerle** (su punto 4): *"B2 va después de
> esta migración"*. **Falso, y medido** — corregido en el propio archivo, en §14.6 y en §15.B.
>
> ### ✅ A7 hecha después del merge — el carril A queda **completo, 7 de 7**
>
> - `correrAhora()` gana el chequeo server-side **que su gemela ya tenía sesenta líneas más abajo**.
>   Reusa `hayCorridaViva` + `ultimasCorridasMotor`: cero dominio nuevo, cero query nueva.
>   **El mensaje dejó de mentir** — ahora dice *"Ya hay una corrida corriendo"* y no *"Señal enviada"*.
> - `auto-refresh.tsx` se monta **siempre**, 5 s con corrida viva y 30 s sin ella. Antes solo
>   polleaba si ya había corrida viva **al renderizar**, o sea que quien tenía Operar abierta cuando
>   otro disparó no se enteraba nunca.
>
> 🔑 **Una decisión que el plan no había tomado: el chequeo nuevo es fail-OPEN**, al revés que el de
> `buscarAhora`. Si la lectura de `runs` falla, dispara igual — el motor **tiene** guard
> single-flight en n8n y es la autoridad real, así que esto es UX. `buscarAhora` es fail-closed
> porque **no tiene guard del otro lado**: ahí el chequeo es la única defensa y dos clicks son dos
> corridas de Apify pagas. El porqué está en §15.A.
>
> ⏳ **Su verificación es de dos ventanas** y está escrita en
> [`verificaciones-humanas.md` §4-bis](../verificaciones-humanas.md).
>
> ### ⏳ Lo único que queda del carril A: el deploy
>
> El código está todo en `main`. **La pantalla de equipo (A5) y el gate de costos (Carril 0) no
> están en producción todavía** — hasta que se deployen, sus verificaciones de §15.D no se pueden
> hacer, y el runbook `agregar-cliente.md` tiene su paso de alta marcado
> `🚧 VERIFICAR CUANDO A5 ESTÉ EN PROD`.
> ⚠️ **La `025` ya está aplicada, así que el orden que no se podía invertir está respetado**: la
> pantalla se puede deployar cuando quieras, no va a caer en `42501` ni en cero filas.

> ## 🅱️ CARRIL B (2026-08-06, rama `carril-b-cierres`) — **5 de 6. Solo B1 sigue abierta, y es calendario.**
>
> Todo medido contra prod (PostgREST + SQL con sesiones reales) y contra n8n por su API; nada de
> memoria. **No se tocó `apps/dashboard/`, ni `domain/pipelines.ts`, ni se creó ninguna migración.**
>
> | | Estado |
> |---|---|
> | **B2** · check #1 contra prod | ✅ **CERO FILAS.** Y **no dependía de A1** — ver abajo |
> | **B3** · §14.6 con filas | ✅ **CORRIDA el 06/08: `1 y 1`**, con el `2` al lado que la hace legible. La escritura cruzada muere con `42501`. **Falta el clic** (item 10 del checklist humano) |
> | **B4** · runbooks + `core/templates/` | ✅ El criterio de F5 da **partido**: empresa 🟢, pipeline 🔴. **Y el paso 2 se corrigió contra A5 en prod: decía 5 cosas mal** |
> | **B5** · checklist de ojo humano | ✅ [`docs/verificaciones-humanas.md`](../verificaciones-humanas.md), **11 items** |
> | **B6** · deuda de docs | ✅ Eran **21 links rotos**, no 4, y la lista era más larga |
> | **B1** · gate de la `023` | ⏳ **2 de sus 4 condiciones firmadas (cierre 99). Ya no es calendario: es el deploy.** Ver el bloque de abajo y el 🔥 de arriba |
>
> ### ✅ B3 cerrada sin browser, y el discriminante es lo que la hace valer
>
> Se sembraron las 2 filas (una por empresa) y se corrieron **las dos capas con sesiones reales**
> (`set local role authenticated` + `request.jwt.claim.sub`), que es lo único que las ejercita:
>
> | Sesión | ve en `referentes_linkedin` | |
> |---|:-:|---|
> | `service_role` | **2** | el denominador |
> | **Alejandro 30X** (`30x`+`estadox`, no dueño) | **2** | RLS deja pasar lo suyo |
> | **Majo** (`retia`) | **0** | 🔴 **el discriminante**: mismas 2 filas, no ve ninguna ⇒ la policy **filtra** |
> | **Manuel** (`es_dueno`) | **2** | control: indistinguible de RLS apagado, por diseño |
>
> Y las dos capas compuestas como las corre la pantalla (sesión de Alejandro + el `.eq("instance_id")`
> de `scoped()`): **`/30x/linkedin` → 1 · `/estadox/linkedin` → 1 · `/retia/linkedin` → 0**, contra
> **2** sin el filtro de cockpit. **Es el `1 y 1`**, y el 2 de al lado prueba que el 1 no es *"hay una
> sola fila"*. El `insert` en instancia ajena muere con **`42501`**.
>
> 🩸 **Y destapó un modo de falla que no es de LinkedIn: `update`/`delete` cruzados no dan `42501`,
> dan 0 filas en silencio.** `with check` valida la fila que entra; `using` simplemente no ve las
> ajenas. Una pantalla que no mire el conteo de afectadas dice *"guardado"* sobre algo que no se
> guardó. `lib/referentes-linkedin.ts` ya lo cubre (`.select("id")` y tira si vuelve vacío) y **es un
> invariante que cada tabla nueva tiene que repetir** — hoy está escrito en un solo archivo.
>
> ⚠️ **Las 2 filas quedaron sembradas a propósito**, para que el clic se pueda hacer. Limpieza:
> `delete from app.referentes_linkedin where consulta like 'prueba rls%';`
>
> 🚫 **Por qué no hice el clic yo:** la cuenta de doble membresía es `alejandro.davila@30x.com`, una
> persona real. Generarle un magic link y entrar como él es suplantarlo, y eso no lo hace un agente
> aunque tenga la `service_role` para hacerlo.
>
> ### 🔄 B1, remedido el 06/08 de noche: Mani corrió el motor a mano y el gate avanzó a 2 de 4
>
> La corrida existe y es la primera del motor **después** de que la mitad de escritura de la `023`
> entrara al live el 05/08: **`2026-08-06 21:24 → 21:40`, `ok`, `execution_id 125`**, embudo
> `colectados=538 → asignados=880 → pretrim=710 → filtrados=80 → gate=17 → outputs=10`.
>
> Las 4 condiciones del §0 de la [`023`](../../core/schema/023_poda_write_only.sql), una por una:
>
> | # | Condición | |
> |---|---|---|
> | 1 | `n8n:diff` limpio en los 5 | ✅ **verificado hoy** — los 5 corren lo que dice el repo |
> | 2 | el deploy de Vercel con `lib/transcripciones.ts` en prod | ❓ **no lo puedo medir desde acá.** Lo confirma Mani |
> | 3 | corrida del motor verde **que escribió memoria de dedup** | ✅ **`intersección: 0 ✓`, contando por `run_id`** (48 filas la del 06/08, 121 la del 03/08). El `⛔ NO CUENTA` que se le puso ayer **no disparó**, o sea que el ∅ es de un dedup que funciona y no de una tabla vacía |
> | 4 | archivado verde **que escribió `outputs`** | ❌ **el último es del 04/08**, anterior al push. Y no podía llegar solo — ver abajo |
>
> 🔴 **La 4 no puede llegar sola.** El archivado toma `estado=neq.nuevo` —o sea que **cualquier**
> calificación sirve, 🔥 👍 o 👎— y hoy hay **0 de 175**. El propio §0 lo anticipa (*"si esa semana
> no hubo calificados, el archivado cierra con 0 y NO sirve de prueba"*). Para los dos devs esto
> era imposible por el bug del cockpit; para el equipo de redes, simplemente no pasó. **El camino es
> calificar aunque sea un puñado y después correr el archivado**, no esperar al domingo.
>
> 📌 **Dato de calidad, aparte del gate:** la corrida avisó *"65% de transcripciones vacías"* (31 de
> 48), contra un baseline del 23/07 de 41% y un 54% en la del 03/08. **Tres corridas subiendo.** No
> bloquea nada, pero si Supadata sigue así el `sin_guion` se come el supply.
>
> ### ✅ B1: su verificación ya no puede mentir (del cierre anterior)
>
> `verificar-corrida.mjs` imprimía **`intersección: 0 ✓ (∅, el dedup funciona)`** también cuando las
> dos corridas no habían escrito **ninguna** fila — o sea que el ∅ de un dedup perfecto y el ∅ de una
> tabla vacía se leían igual. **Y ese es exactamente el modo de falla que este gate existe para
> cazar**: `PGRST204` tragado por el `onError: continue`, motor cerrando en verde sin memoria. Ahora,
> si alguna de las dos corridas viene vacía, dice **`⛔ NO CUENTA`**. Probado por los dos lados: no
> dispara contra los datos reales (121 y 10 filas, por `run_id`, ✓) y dispara con una corrida forzada
> a vacío.
>
> ✅ **Y el live no se movió**: `n8n:diff` verde en los 5, así que la mitad de escritura de la `023`
> sigue puesta y la corrida del lunes vale.
>
> ### 🩸 B4 — el paso 2 del runbook decía 5 cosas mal, y una escondía una decisión
>
> Con A5 en prod se contrastó *"dar de alta a las personas"* contra el código y contra la base:
>
> | Decía | Es |
> |---|---|
> | *"El mail, el rol, y listo"* | Son **tres** campos: **nombre** (obligatorio), mail y rol |
> | *"`sponsor` (solo Entender)"* | 🩸 Ve **Entender + Ajustes**, y es **el único rol del cliente que administra su propio equipo**. Es el rol del jefe del cliente, y la línea vieja escondía eso |
> | *"a `dev` no se le da…"* (disciplina) | Además **está impuesto**: solo un `es_dueno` puede otorgarlo, ni forzando el POST |
> | *(nada)* | 📬 **Si ya tiene cuenta, NO llega mail.** Al agregar una empresa ese es el caso normal |
> | *(nada)* | La membresía es **por empresa, no por pipeline** |
>
> 🩸 **Y el hallazgo que ningún doc tenía: hoy ninguna empresa cliente puede darse de alta a sí misma.**
> **Cero `sponsor`** en las 3 empresas; los únicos 2 que administran equipo son los devs de la agencia
> (ambos `es_dueno`, en `retia`). `30x` y `estadox` tienen **una persona cada una, `operador`**, y un
> `operador` que entre a `/…/ajustes/equipo` sale rebotado. **El alta la hace la agencia.** Que el
> cliente se administre solo no está roto: está **sin usar**, porque nadie nombró un `sponsor`.
>
> ### 🛑 Decisión de Mani (06/08): el `workflow.json` de LinkedIn NO se construye todavía
>
> **No se crea en n8n, no se le da cron en el dispatcher, no se re-importa nada.** Lo que ya existe
> —la `020` y la `024` aplicadas, los 3 cockpits, la pantalla de Referentes, el manifest en `draft`—
> se queda como está y no molesta a nadie. El bloqueo sigue siendo **no técnico** (no hay definición
> de *"funcionó"*, no existe el banco de referentes, faltan los few-shot), y encima las 4 tablas
> tienen **0 filas**. El porqué completo, y qué **sí** se puede seguir haciendo mientras tanto, en
> [plan-multi-tenant §12](./plan-multi-tenant.md).
> ⚠️ **B3 no depende de esto**: ejercita RLS con dos filas sembradas a mano, no el pipeline.
>
> ### 🔴 Tres cosas que cambian lo que otro agente iba a hacer
>
> 1. **`B2 después de A1` era falso, y el check es más ciego de lo que se creía.** El argumento era
>    *"o el check reporta las tablas nuevas"*, y la **`025` no crea tablas** — crea una función y
>    policies. Peor: el check pregunta por *"RLS y **cero** policies"*, así que **no puede ver** el
>    agujero que la `025` tapa. `app.usuarios` ya tiene policy (del `007`) y **no tiene columna de
>    tenant** desde que la `019` dropeó `client_id`; `app.usuarios_clientes` ya tiene la suya (de la
>    `021`). La `025` arregla *"la policy es demasiado angosta"*, que es otra pregunta. La tabla con
>    la medición está en [§14.6](./plan-multi-tenant.md).
> 2. **🩸 La tabla de números esperados del bloque de abajo tiene 4 de 9 filas mal**, y son las que
>    alguien iba a usar para decidir si RLS anda. Pedían el `count(*)` crudo donde la pantalla filtra:
>    `/curar/historicos` son **31** (no 88) · `/operar` son **5** tarjetas (no 41) · `/curar/sugeridos`
>    son **6** (no 8) · `/curar/ajustes` son **8** para un `operador`. **La tabla buena está en
>    [`verificaciones-humanas.md` §0](../verificaciones-humanas.md).**
>    🔑 **Y la trampa inversa, que casi se cuela en la corrección:** `app.voces` tiene 4 filas y
>    `/retia/reels/curar/voces` muestra **3** — la cuarta es de 30X, porque `voces` es de grano
>    **empresa**. Con el doble grano, **un `count(*)` global no confirma ni desmiente nada.**
> 3. **Los 4 manifests de los pipelines vivos decían `status: draft`** con comentarios ya falsos
>    (*"cron sin activar"*, *"sin importar aún en la instancia n8n"*) mientras corrían en producción
>    hacía meses. Corregidos a `active` contra lo medido; `validate` verde. Es la mitad de **D2** del
>    ROADMAP. **La otra mitad es de Mani** porque escribe en prod: `workflows.estado` dice `draft`
>    para `short-form-content`. Nada lo lee (`scoped.ts:43` deja esa tabla fuera del mapa a propósito),
>    así que es cosmético — `update workflows set estado = 'active' where id = 'short-form-content';`
>
> ### 📏 La foto de prod al 2026-08-06, que ningún doc tenía junta
>
> **23 de 24 migraciones aplicadas** — la única que falta es la **`023`**, verificada por sus 7
> columnas todavía vivas. **24 policies** (18 en `app` + 6 en `public`) = 19 de la `021` + 4 de la
> `024` + 1 del `007`; *la `021` tiene **19**, no 17: los docs venían repitiendo mal ese número.*
> **3 clientes · 4 instancias · 8 usuarios / 9 membresías · 4 voces (3 de Retia) · 6 proyectos ·
> 16 referentes · 165 candidatos · 88 outputs (31 aprobados + 57 descartados) · 38 descartes ·
> 772 `processed_items` · 41 corridas (29 `ok`, 12 `fallo`)**. Los 5 workflows `active`, en
> `America/Bogota`, con **cero nodos y cero credenciales de Google**.
>
> ### ⚠️ Y dos que no se cerraron a propósito, porque el enunciado envejeció
>
> - **V6 (resiliencia) no se puede correr como está escrita.** Pedía romper la credencial de Supabase
>   *"para que el workflow IGUAL escriba a Airtable"*, y post-D7 **la entrega también es Supabase**:
>   romperla tumba las dos mitades, así que ya no separa registro de ejecución. El invariante #1 de
>   PLAN §2.5 sigue vivo; **lo que hay que rediseñar es cómo se ejercita**, y es decisión de Mani.
> - **V5 (incremental `dias=1`) no va antes del gate de la `023`.** Si `processed_items` deja de
>   escribirse, el `PGRST204` se lo traga el `onError: continue` y el motor cierra en verde **sin
>   memoria de dedup** — que es justo lo que V5 cree estar midiendo.

> ## ✅ AL CIERRE 98 (2026-08-06): EL FEED PAGINA. ANTES: EL FLIP CERRADO, LA BALDE 2 PODADA, AIRTABLE FUERA.
>
> **Lo único que bloquea algo:** la **`023`** espera **una corrida del motor y un archivado verdes**
> para firmar su gate — su mitad de escritura ya está en el live (`n8n:diff` limpio). Después de la
> corrida del lunes, `node Workflows/workflow-short-form-content/verificar-corrida.mjs 2` tiene que
> decir **`intersección: 0`** y contar por **`run_id`** (si cae a la ventana de `primera_vez`, la
> memoria no se escribió y hay que mirar por qué antes de dropear nada).
>
> ⏳ **Y no hay nada que hacer ahí hasta el fin de semana:** la última corrida en la base es del
> **04/08 21:12**, y la mitad de escritura salió el **05/08**, así que **ninguna corrida ejerció
> todavía el código nuevo**. El archivado es domingo 18:00 y el motor lunes 08:00. Dispararlo a mano
> arranca una corrida real y **paga**.
>
> ✅ **La paginación del feed (§12 #7) se cerró el 06/08** y con eso el checklist del multi-tenant
> queda con **un solo item: LinkedIn**. La pantalla pasó de ~405 KB a ~16 KB por carga. **Falta el
> clic** (ver la tabla de abajo, junto al del CSV): está verificada contra prod a nivel query y con
> tests, pero nadie la abrió en un browser.
>
> 🚀 **Y la Fase 5 arrancó el 06/08:** primera pantalla de LinkedIn (Referentes) + la **[`024`](../../core/schema/024_rls_linkedin.sql)**
> con sus 4 policies. ✅ **La `024` se APLICÓ el 06/08 y se verificó por su efecto** (`pg_policies`
> devuelve las 4 filas, todas con `instancias_visibles` en el `qual`). ⚠️ Ojo con una diferencia
> contra la `021`: aquella era inerte al entrar porque el BFF
> leía con `service_role`; **con el flip en prod, la `024` se evalúa desde el minuto que entra.**
>
> 🔴 **Aparte, y es de seguridad:** la `ANTHROPIC_API_KEY` del `.env` local es **la key filtrada en
> `d98d45a`, revocada, que da 401**. El pipeline no se ve afectado (el live trae otra y responde
> 200), pero hay que reponer la buena a mano — la línea del `.env` tiene el diagnóstico y el paso.
>
> ### Lo del cierre 96, que sigue igual: quedan dos clics
>
> **La Capa 2 está viva y verificada por las dos mitades**: con cuenta no dueña (3 de 4 voces sin
> filtro de tenant) y con cuenta dueña sobre las pantallas con datos (las 4 zonas, `Entender`
> incluida). La Fase 6 del plan quedó **completa**.
>
> Lo que queda son dos verificaciones de browser que no bloquean nada y se hacen en un login.
>
> | # | Qué | Quién | Estado |
> |---|---|---|---|
> | 1 | 🔴 **Entrar a `/retia/reels` con una cuenta DUEÑA y recorrer las 4 zonas** | Mani | ✅ **HECHO el 05/08.** Cuenta dueña, ventana aparte: **las 4 zonas cargan con datos, Entender incluida** — que era el riesgo concentrado (sus 12 vistas corren `security_invoker` y necesitan que el usuario alcance `clients`/`instances`/`workflows`). **Con esto el flip queda cerrado** |
> | 2 | 🟡 El botón **Descargar CSV** de `/curar/historicos` (ADR-057) | Mani | ⬜ **arrastre del cierre 94**, el más viejo abierto. El CSV está verificado contra las 31 filas reales con un parser RFC 4180 independiente; lo que nadie hizo es **el clic**. 15 columnas, acentos derechos |
> | 4 | 🟡 Que el tab **Entender** aparezca en el nav de un **operador** (`b8a3832`) | Jero o Alejo | ⬜ se ve solo, en su próximo login. La lógica tiene tests; falta el ojo. *No se probó desde una sesión de agente a propósito: habría requerido generar un magic link de la cuenta de otra persona* |
> | 3 | 📐 El **ADR del `origen` en el `TenantContext`** | quien retome | ✅ **ESCRITO: [ADR-058](../adr/ADR-058-el-flip-de-la-capa-2.md)** — cubre el `origen`, la ventana de ADR-047 que se cerró sin suspender cockpits, y por qué `lib/tenant.ts` se queda en `service_role` |
> | 5 | 🟡 Recorrer el **feed paginado** en `/curar/feed` (cierre 98) | Majo, Jero o Alejo | ⬜ **nuevo del 06/08**, y se despacha en el mismo login que el #2. Mirar tres cosas: que **Cargar más** traiga 25 sin repetir ni saltear, que los **chips digan el total real** (165, no 25) y que **abrir una tarjeta** traiga el guion. Calificar y después cargar más es el caso que el keyset existe para cubrir |
> | 6 | 🔬 **La prueba que cierra §14.6**: RLS de LinkedIn con datos reales | quien tenga la cuenta de 2 empresas | 🟡 **La mitad de query está CERRADA el 06/08: `1 y 1`, y `42501` en la escritura cruzada** (tabla completa en el bloque 🅱️ y en §14.6). **Queda el clic, y las 2 filas ya están sembradas esperándolo** |
> | 7 | 🔴 El **check #1 de la `021` contra PROD** | Mani o Alejo | ✅ **HECHO el 06/08: CERO FILAS**, sobre el corpus completo (con la `020` y la `024` aplicadas). No queda ninguna tabla con columna de tenant, RLS activado y cero policies |
> | 8 | 🔴 **Un alta real por `ajustes/equipo`** | Mani (o cualquier `es_dueno`) | ⬜ **nuevo del 06/08**, y es lo único que le falta a B4. Todo el resto del runbook está contrastado contra el código y contra prod; **lo que ningún agente puede confirmar es que salga el mail.** Necesita un mail que no esté en el sistema (un alias sirve). Pasos en [`verificaciones-humanas.md` §11](../verificaciones-humanas.md) |
>
> ⚠️ **Y el flip se hizo DOS VECES el mismo día, por dos sesiones que no se vieron** (`d8edea2` y una
> rama paralela, `capa-2-flip-scoped`, descartada). Las dos llegaron al mismo diseño: mismo campo
> `origen`, mismos dos valores, mismos dos constructores, mismas mediciones de la fachada. **Que
> converjan no valida el diseño, mide otra cosa:** la decisión estaba forzada por la forma del código,
> y escribir el ADR *antes* —como manda el repo— habría ahorrado el día duplicado. Es el costo real de
> haber dejado el ADR para después, y por eso queda anotado acá y no solo en el ADR.
>
> <details><summary>Registro: cómo se hizo el #1, y los números que tenía que dar</summary>
>
> Cuenta **`a.davila0423@gmail.com`** (Alejandro Dávila, `es_dueno: true`). **Ventana de incógnito**,
> si no el magic link cae sobre otra sesión.
>
> ⚠️ **Un dueño NO bypassa RLS**, y es lo que hace que esta prueba valga: `es_dueno` es un predicado
> *adentro* de `app.clientes_visibles()`, no un `BYPASSRLS`. Solo el `service_role` bypassa, y ese ya
> no es quien lee las pantallas. Así que esto ejercita grants, policies y `security_invoker` de
> verdad — sobre las tablas que sí tienen datos.
>
> 🩸 **NO USES ESTA TABLA — 4 de sus 9 filas están mal** (medido el 06/08, tarea B5). Pedían el
> `count(*)` crudo de la tabla donde la pantalla filtra: `/curar/historicos` son **31**, no 88
> (filtra `aprobado`; los 88 son 31 + 57 descartados) · `/operar` son **5** tarjetas, no 41
> (`limite = 5` sobre los runs del motor) · `/curar/sugeridos` son **6**, no 8 (solo `propuesto`) ·
> `/curar/ajustes` son 18 para un `dev` pero **8** para un `operador`. Se conserva como registro de
> cómo se hizo el #1. **La tabla buena vive en
> [`docs/verificaciones-humanas.md`](../verificaciones-humanas.md) §0.**
>
> | Pantalla | Tiene que mostrar *(números viejos, ver el aviso de arriba)* |
> |---|---|
> | **`/entender`** | ⚠️ **empezá por acá**: son las **12 vistas `security_invoker`**, la zona de más riesgo del flip |
> | `/operar` | **41** corridas |
> | `/curar/feed` | sobre **165** candidatos |
> | `/curar/voces` | **3** voces · **6** proyectos |
> | `/curar/referentes` | **16** |
> | `/curar/ajustes` | **18** knobs |
> | `/curar/descartes` | **38** |
> | `/curar/sugeridos` | **8** |
> | `/curar/historicos` | **88** — y acá se hace el **#2**, el clic al CSV (15 columnas, acentos derechos) |
> | `/transcribir` | **2** |
>
> Y **una escritura** (calificar en el feed, o mover un knob): prueba el `with check` de las policies
> y el insert a `app.eventos`, que ninguna lectura toca.
>
> 🩸 **Acá la alarma se INVIERTE respecto de la cuenta de prueba del cierre 95.** Con los cockpits de
> LinkedIn (vacíos) cualquier número era sospechoso; acá el peligro es el **cero**. Una pantalla que
> carga limpia y muestra 0 donde la tabla dice 165 es **una policy que no matchea**, y es el fallo
> silencioso — la misma familia que la vista que daba 18 filas para 17 referentes (`015`). Por eso
> están los números: *"se ve bien"* no distingue los dos casos. Un `42501` en pantalla, en cambio, es
> el fallo ruidoso: un grant que faltó, se arregla con SQL **sin revertir el deploy**.
>
> 🛟 **Rollback si algo se rompe feo:** `git revert d8edea2 && git push`, o el rollback instantáneo
> al deployment de `3f2105a` desde Vercel. La `021` puede quedarse aplicada: vuelve a ser inerte sola
> en cuanto el BFF regrese al `service_role`.
>
> </details>
>
> ### ✅ 🔬 #6 — CORRIDA el 2026-08-06. Las dos filas están sembradas; queda el clic.
>
> **Los pasos 1 y 2 se hicieron** (siembra + las dos capas medidas con sesiones reales) y dan
> **`1 y 1`**. La tabla con las 4 sesiones y el resultado de la escritura cruzada está arriba, en el
> bloque **🅱️ CARRIL B**, y completa en
> [plan-multi-tenant §14.6](./plan-multi-tenant.md) — **no se duplica acá: un hecho, un dueño.**
>
> | empresa | `instance_id` de su cockpit de LinkedIn | fila sembrada |
> |---|---|---|
> | **30X** | `f35d0282-2511-4905-b407-2ab338bc2336` | `prueba rls 30x` |
> | **EstadoX** | `f7baff77-8211-43f7-a64c-aed9e7a3e860` | `prueba rls estadox` |
>
> ⬜ **Lo único que falta es mirarlo en la pantalla** (`/30x/linkedin/curar/referentes` y
> `/estadox/linkedin/curar/referentes`, incógnito, con `a6464e1d-…`) y **agregar uno desde el botón**,
> que es lo único que ejercita los `grant insert` *por el camino de la app*. Los pasos exactos y qué
> significa cada resultado están en [`verificaciones-humanas.md` §10](../verificaciones-humanas.md).
>
> **Limpieza, después del clic:** `delete from app.referentes_linkedin where consulta like 'prueba rls%';`
>
> ### 📐 #3 — CERRADO: [ADR-058](../adr/ADR-058-el-flip-de-la-capa-2.md)
>
> **La autoridad viaja en el `TenantContext`** (`origen: "sesion" | "fachada"`), y ahora está escrito
> por qué: gobierna cómo se elige credencial en todo el BFF, así que sin ADR alguien iba a
> "simplificar" el discriminante por redundante. El ADR cubre las tres cosas que el código no
> explica — el `origen`, la ventana de ADR-047 que se cerró **sin** suspender cockpits, y por qué
> `lib/tenant.ts` se queda en `service_role`.
>
> <details><summary>Los tres pendientes del cierre 93, cerrados y medidos el 04/08 (registro)</summary>
>
> | # | Qué | Estado |
> |---|---|---|
> | 1 | 🔑 Rotar la API key de Anthropic | ✅ **HECHO Y VERIFICADO el 04/08.** La key del commit filtrado (`d98d45a`) da **401** contra la API de Anthropic ⇒ está revocada. Los 3 workflows del live traen **una sola** key cada uno y **coincide con el `.env`**. Nadie lo había anotado: se descubrió midiendo |
> | 2 | ✍️ Firmar y correr la `019` | ✅ **APLICADA por Mani el 04/08, y verificada por su EFECTO:** `app.usuarios` quedó en **`id, nombre, creado_en, es_dueno`** — murieron `rol` y `client_id`. Las 5 membresías intactas (3 operador + 2 dev, todas `retia`), `es_dueno` en los 2 devs. **La ventana del expand está cerrada: van 21 de 21 migraciones** |
> | 3 | 🩸 El archivado no archiva nada | ✅ **ARREGLADO, EMPUJADO AL LIVE Y VERIFICADO CON UNA CORRIDA REAL** (ejecución 124). Los números abajo |
> | + | ⚠️ Dos bugs nuevos del archivado, del mismo origen | ✅ **empujados al live el 04/08** (`n8n:diff` limpio en los 5). Se verifican solos en la próxima corrida — ver el hecho-cuando abajo |
>
> **Smoke-test después de la `019`** (es la migración que toca justo la fila que decide si alguien
> entra): `/` y `/retia/reels` → **307** al login · `/login` → **200** · `run-plan` → **200** ·
> `instancias?workflow=short-form-content` → **200** con la instancia de `retia/reels`, y
> `?workflow=linkedin` con las **2 active** (`retia/linkedin` queda afuera por `draft`, como se
> diseñó). ✅ **Y Mani entró con una cuenta operador: se ve bien.** Esa era la verificación que la
> base no puede dar.
>
> ### 🟡 El clic que faltaba *(sigue abierto — es el #2 de la tabla de arriba)*
>
> El botón **Descargar CSV** de `/curar/historicos` ([ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md)).
> Su parte frágil —el CSV— está verificada contra las 31 filas reales de prod con un parser RFC 4180
> independiente, pero **nadie hizo clic en el botón**: eso necesita una sesión con login por magic
> link. Abrí `/retia/reels/curar/historicos`, tocá **Descargar CSV** y abrilo. Tiene que traer
> **15 columnas** y los acentos derechos.
>
> ### 🩸➜✅ El archivado, cerrado con la misma tabla del cierre 93
>
> Causa raíz confirmada **leyendo la ejecución 123 nodo por nodo**, no deduciéndola: `Leer Candidatos
> calificados` emitió **9 items planos** (n8n parte el array de PostgREST en items) y el `IF` mandó
> **0 por true y 9 por false**. El fix pregunta por los items del nodo, con el mismo `_filas` que ya
> usan los nodos de abajo — así el IF y el code node no pueden volver a discrepar sobre la forma:
>
> ```
> ={{ $('Leer Candidatos calificados').all().map(i => i.json).flat().filter(r => r && r.id).length }}
> ```
>
> Y `alwaysOutputData: true` en `Leer Candidatos calificados`: **segunda regresión de D7, misma
> causa.** Con 0 calificados el nodo emite 0 items, el IF no corre y **`Cerrar run` no se ejecuta por
> ninguna rama** — el run queda abierto hasta que lo barre el zombie sweeper. Con Airtable no pasaba
> (`{records:[]}` era 1 item).
>
> | | Antes (03/08) | **Después (04/08, ejecución 124)** |
> |---|---|---|
> | candidatos calificados | 9 → **9** | 9 → **0** ✅ |
> | candidatos totales | 174 → 174 | 174 → **165** (9 borrados) ✅ |
> | `outputs` totales | 79 → **79** | 79 → **88** ✅ |
> | último `outputs` | 26/07 | **04/08 21:12** ✅ |
> | el IF | `[0 true, 9 false]` | **`[9 true, 0 false]`** ✅ |
> | la corrida | `ok` en 3,3 s | `ok`, `archivados: 9`, `execution_id: "124"` real |
>
> Al Sheet fueron **7** y no 9, y está bien: `Preparar filas Sheet` filtra `estado === 'aprobado'`, y
> de los 9 había 7 aprobados y 2 descartados.
>
> ### ⚠️ Los dos bugs que el fix DESTAPÓ (y el comando que falta)
>
> No los causó el fix: estaban **tapados** detrás del IF: como el archivado no archivaba desde D7,
> ningún nodo de abajo llegaba a correr. Los dos son la misma causa, y está escrita en el contrato:
> **`fields.uuid` murió en el run-plan v2** ([ADR-048 §5](../adr/ADR-048-run-plan-v2-motor-por-instancia.md)),
> el `id` **es** el uuid, y *"los tres `uuidDe` se fueron juntos"* — el motor ×2 y el descubrimiento
> ×1 se migraron; **los dos nodos del archivado se quedaron atrás**.
>
> | Nodo | Qué hacía mal | Consecuencia medida |
> |---|---|---|
> | `Armar filas archivado` | `projMap[f.uuid]` / `vozMap[f.uuid]`, y `f.uuid` hoy es `undefined` ⇒ los dos mapas vacíos | **Todo `outputs.metadata.proyecto` y `.voz` vacío**, y PROYECTO/VOZ vacíos en el Sheet. Medido: los 61 outputs del 26/07 tienen proyecto; los 9 de hoy salieron **todos vacíos** |
> | `Destilar criterios` | `const _uuid = projMeta[pid].uuid` ⇒ `null` siempre ⇒ `recs` vacío | **El loop de aprendizaje de ADR-022 está muerto**: `PATCH Proyectos criterios` nunca corre. Y encima **paga las llamadas a Haiku** y tira el resultado. Los 9 daban 5 (*Comunicación de parejas*) + 4 (*Storytelling*), **los dos ≥ el mínimo de 4**: tenía que destilar 2 proyectos y destiló 0 |
>
> ✅ **Los 9 `outputs` con metadata vacía ya se repararon** (backfill por `external_id`, preservando
> el resto del metadata: 5 *Comunicación de parejas* / Milena Morales + 4 *Storytelling* / Rosario
> Gomez, 0 vacíos restantes). **Las 7 filas del Sheet quedaron con PROYECTO y VOZ vacíos** y eso hay
> que arreglarlo a mano en el Sheet, o dejarlo — ver [ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md).
>
> ✅ **Empujados al live el 04/08** (`n8n:push -- archivado --nodos "Armar filas archivado,Destilar
> criterios" --apply`; `n8n:diff` limpio en los 5). Rollback si hiciera falta:
> `npm run n8n:restore -- archivado .n8n-snapshots/archivado-2026-08-04T21-31-43-595Z.json --apply`.
>
> 🎯 **Hecho cuando (lo único que queda de esto, y no se puede apurar):** la próxima corrida del
> archivado —el **cron del domingo 18:00**, o un disparo a mano— tiene que dejar
> `outputs.metadata.proyecto` y `.voz` **poblados** y `PATCH Proyectos criterios` **ejecutado** (o
> saltado por el mínimo de 4 legítimamente). Si vuelve a salir vacío, el fix del uuid no entró.
>
> <details><summary>🔑 Cómo se rotó la key de Anthropic (ya hecho — se deja como procedimiento)</summary>
>
> ### 🔑 Cómo se rota la key de Anthropic, y por qué `n8n:push` NO sirve acá
>
> **La key no es una credencial de n8n: va inline en el `jsCode` de 6 nodos.** Medido contra los
> `workflow.json` el 03/08 — no hay ninguna credencial `anthropic*` en la instancia:
>
> | Workflow | Nodos que la llevan |
> |---|---|
> | motor | `Pre-trim relevancia` · `Traducir (Claude Haiku)` · `Gate de relevancia` |
> | descubrimiento | `Vetting relevancia (Haiku)` · `Vetting TikTok (Haiku)` |
> | archivado | `Destilar criterios` |
>
> **El orden importa, y al revés de lo que parece:**
> 1. Rotar en la consola de Anthropic.
> 2. **Editar los 6 nodos a mano en n8n.** ⚠️ **`n8n:push` no puede hacerlo**: el repo guarda
>    `<ANTHROPIC_API_KEY>` y `n8n-sync` **aprende el valor del propio live** (esa es toda la idea de
>    ADR-053: una tabla a mano sería una segunda verdad). Si empujás antes de cambiarlo en n8n, el
>    push **reescribe la key vieja**, porque es la que aprendió.
> 3. Actualizar `ANTHROPIC_API_KEY` en el `.env` de la raíz (a mano; es local y gitignored).
> 4. `npm run n8n:diff` para confirmar verde.
>
> 🛟 **La red que ya existe si el paso 2 queda a medias:** el mapa de placeholders se aprende de los
> 5 workflows a la vez, así que si un workflow tiene la key nueva y otro la vieja, el placeholder
> entra en **conflicto** y `n8n-sync` lo **descarta** (`for (const k of conflictos) mapa.delete(k)`).
> El push queda con un placeholder sin resolver y **falla cerrado** en vez de escribir el valor
> equivocado. Un `n8n:diff` después de rotar te dice si quedó alguno sin cambiar.
>
> </details>
>
> ### ✅ Y lo que seguía en el plan, hecho al día siguiente
>
> El **flip de `scoped.ts`** (Fase 6, **paso 2 de 2**) entró el **05/08** (`d8edea2`). Este bloque
> decía *"alto riesgo concentrado en una línea"* y *"se prueba con la cuenta de Jero"*: **las dos
> cosas resultaron falsas**. No era una línea (la fachada comparte `scoped()`), y la cuenta que sirve
> no es la de Jero sino una **no-dueña con membresía en dos empresas**, porque es la única que separa
> las dos capas. Los dos hallazgos están en [§14.3](./plan-multi-tenant.md) y en el cierre 95.
>
> </details>
>
> ### Lo que sí quedó cerrado del runbook viejo
> | # | Paso | Estado |
> |---|---|---|
> | 1–2 | `018` + backfill | ✅ Alejandro, 03/08. 5 usuarios → 5 membresías, `es_dueno` en los dos correctos |
> | 3 | Merge `refactor/membresias` → `main` + push | ✅ **HECHO (`ad2de5b`)**, fast-forward limpio |
> | 4 | Probar el login con una cuenta operador | ✅ Mani: se ve bien |
> | 5 | `019_membresias_cierre.sql` | ✅ **aplicada el 04/08** (al segundo intento: la primera vez su gate humano abortó la transacción entera sin error visible). `app.usuarios` quedó en `id, nombre, creado_en, es_dueno` |
> | 6 | `020_pipeline_linkedin.sql` | ✅ aplicada: las 4 tablas responden y `linkedin` está en `workflows` |
> | 7 | El alta de EstadoX y 30X (SQL abajo) | ✅ aplicada: `clients` = **3** · `instances` = **4** (`retia/reels` active · `retia/linkedin` **draft** · `estadox/linkedin` active · `30x/linkedin` active), exactamente como se diseñó |
> | + | **`021_rls_capa_2.sql`** (Fase 6, paso 1) | ✅ aplicada. Es **inerte** hasta el flip: el BFF sigue en `service_role`, que bypassa RLS |
>
> ### El SQL del paso 7 — las dos empresas nuevas y los tres cockpits de LinkedIn
>
> ```sql
> begin;
>
> -- Las dos marcas que faltaban. `estado` acá es 'activo' (español) — ojo, en `instances` es
> -- 'active' (inglés). Las dos tablas usan vocabularios distintos desde la `001` y es fácil errarle.
> insert into clients (id, nombre, estado) values
>   ('estadox', 'EstadoX', 'activo'),
>   ('30x',     '30X',     'activo');
>
> -- Un cockpit de LinkedIn por marca (ADR-055: un cockpit = una fila en `instances`).
> -- El cockpit solo lista instancias `active`, así que el estado decide QUIÉN lo ve, no solo si
> -- corre. Activar no dispara nada: el dispatcher no tiene cron de LinkedIn y no existe el
> -- workflow en n8n.
> insert into instances (client_id, workflow_id, slug, nombre, estado) values
>   -- 🩸 `draft` a propósito, y esto se descubrió CORRIÉNDOLO. La membresía es por EMPRESA, no por
>   -- cockpit (ADR-051), así que un `active` acá le habría dado a Jero —y a Alejo, y a Manuel 30X—
>   -- un cockpit de LinkedIn vacío, sin motor y sin datos, más un selector de pipeline que no
>   -- pidió nadie. Pasa a `active` cuando LinkedIn tenga algo que mostrarle al equipo de Retia.
>   ('retia',   'linkedin', 'linkedin', 'LinkedIn', 'draft'),
>   -- Estas dos sí `active`: en `estadox` y `30x` **no hay ninguna membresía**, así que las ven
>   -- solo los dos dueños. Son el banco de pruebas del cockpit de LinkedIn sin tocarle la pantalla
>   -- a nadie del equipo.
>   ('estadox', 'linkedin', 'linkedin', 'LinkedIn', 'active'),
>   ('30x',     'linkedin', 'linkedin', 'LinkedIn', 'active');
>
> commit;
> ```
>
> **Sin membresías nuevas, y es a propósito** (decidido con Alejandro el 03/08): los dos devs son
> `es_dueno` y alcanzan las tres empresas sin necesitar fila. Jero, Alejo y Manuel 30X siguen viendo
> **solo Retia** — no se enteran de que existen las otras, que es exactamente lo que el selector de
> equipo tiene que garantizar.
>
> ### Qué tiene que verse después del paso 7 (la prueba de que funcionó)
> · Entrando con **tu** cuenta: aparece el **selector de equipo** con 3 opciones (retia, estadox,
>   30x) y **ningún selector de pipeline** (cada empresa tiene un solo cockpit visible: Retia solo
>   `reels` porque su LinkedIn queda `draft`) · en `/estadox/linkedin` **el nav NO dibuja
>   `Transcribir`**, y entrar a mano a `/estadox/linkedin/transcribir` **redirige** · con la cuenta
>   de **Jero**: ningún selector, y `/estadox/linkedin` lo rebota a su cockpit de Retia.
>
> ✅ **VERIFICADO contra un Postgres 16 real (2026-08-03).** Se corrió `001→020` completo en Docker,
> con el renombre `piloto`→`retia` en el medio, los gates humanos de la `017`/`019` descomentados y
> **el mismo seed que prod** (5 usuarios, 2 devs). Resultado: **5 usuarios → 5 membresías** ·
> `es_dueno` = **Alejandro Dávila y Manuel Mejia**, los correctos · la `019` dejó
> `app.usuarios` en `id, nombre, creado_en, es_dueno` (murieron `rol` y `client_id`) · las 4 tablas
> de LinkedIn creadas, `instance_id` **not null y sin default** en las 4 · **`app.plataforma` intacto
> (`instagram, tiktok`)** · `linkedin` registrado en `workflows`. **El SQL del alta también se corrió
> ahí mismo** y es de donde salió el hallazgo del `draft` de arriba.

> ## ✅ CERRADO EL 2026-08-03 (cierre 93): `params.execution_id` aparece en una corrida real
>
> **Ya no falta nada acá.** La corrida del archivado del 03/08 (21:19, `on_demand`) escribió
> `params.execution_id: "123"`, y se verificó contra `GET /api/v1/executions/123`: mismo
> `workflowId` que `N8N_WF_ARCHIVADO`, `status: success`, `startedAt` a 0,6 s del `runs.inicio`.
> ADR-054 queda verificado end-to-end. Lo de abajo es el enunciado original, como registro.
>
> <details><summary>El pendiente original (cierre 90)</summary>
>
> Los 3 `Abrir run` ya graban `params.execution_id = $execution.id` en producción y el error handler
> ya cierra por esa llave ([ADR-054](../adr/ADR-054-cada-run-lleva-su-execution-id.md)). Se probó
> end-to-end con un workflow desechable que se cae a propósito: el handler se disparó, capturó el id
> de la ejecución caída y su `PATCH` salió limpio contra Supabase. **Lo que todavía no pasó es una
> corrida de verdad**, así que ninguna fila de `runs` tiene la clave todavía. Después del próximo
> cron (lunes 8:00):
>
> ```sql
> select estado, params->>'workflow', params->>'execution_id', inicio from runs order by inicio desc limit 5;
> ```
>
> Las 3 últimas tienen que traer `execution_id` no nulo. Si viene nulo, el `Abrir run` de ese
> workflow no se empujó — se ve con `npm run n8n:diff` y se arregla con `n8n:push`.
>
> ### ⚠️ La regla nueva que sale de esta sesión: **`npm run n8n:diff` después de CADA import**
> El error handler se rompió **dos veces por lo mismo** (la copia original y el re-import del
> 2026-08-03): `<<SUPABASE_URL>>` quedó literal en el campo URL de un nodo HTTP. `<<…>>` no es
> sintaxis de expresión de n8n, así que el request muere — y como el nodo va con
> `onError: continueRegularOutput`, **la ejecución termina en verde igual**. Las dos veces lo
> encontró un diff, nunca una corrida. El nodo *parece* configurado porque la credencial queda en
> verde y el placeholder vive adentro del campo URL.
>
> ### ⚠️ Importar en n8n NO actualiza en el lugar: crea un workflow con id NUEVO
> El re-import del error handler creó `gBcKmzxc4EgXMwzv` y dejó el original archivado. Si volvés a
> importar cualquiera de los 5, hay que **actualizar su `N8N_WF_*` en el `.env`** y volver a apuntar
> lo que lo referencie (`settings.errorWorkflow` de los otros 4), o el alias del diff apunta al
> muerto y te miente en verde.
>
> </details>

> ## ✅ EL REFACTOR MULTI-TENANT ESTÁ EN PRODUCCIÓN (2026-08-03, madrugada)
>
> **Los 6 pasos del runbook están hechos y verificados contra la base y contra n8n, no de palabra.**
> `retia/reels` es el cockpit vivo; las URLs son `/retia/reels/...` y **entrar por la raíz `/` lleva
> solo** (es el link que hay que darle al equipo).
>
> ✅ **Los bookmarks viejos YA NO mueren (cierre 89, `e5c6668`).** Decía acá que morían, y era cierto
> hasta ese commit: la Fase 3 había dejado páginas solo para las **zonas**, así que `/retia/reels`,
> `/retia` y todo link pre-refactor daban **404 pelado**. Ahora `[cliente]` y `[cliente]/[pipeline]`
> son rutas de verdad y rebotan a la zona inicial del rol, y como los links viejos tienen 1–2
> segmentos, **los atrapan esas mismas rutas y caen solos en el cockpit correcto**. Hay además un
> `not-found.tsx` para lo que ni eso matchea. *No hace falta avisarle nada a Jero.*
>
> | | Paso | Verificado con |
> |---|---|---|
> | 1 | Renombre `piloto` → `retia`, slug → `reels` | 1 cliente, 1 instancia, 0 filas apuntando a otra cosa. **Los defaults puente se movieron** (probado insertando sin `client_id`) |
> | 2 | Merge `b1b8212` + deploy | `run-plan` responde **400 sin instancia · 403 ajena · 200 con `version: 2`**, y `fields.uuid` no viaja en ninguna de las 4 listas |
> | 3 | Re-import de los 4 workflows | Coinciden con el repo **nodo por nodo** (34·22·8·20), 0 placeholders, **24 llamadas a PostgREST bien scopeadas** (20 por instancia + 4 por `id=eq.`) |
> | 4 | Crons viejos apagados | 60 workflows en n8n, **5 activos**: los 4 nuestros + el *Error Workflow*. Los crons viven en el dispatcher (lunes 8am · domingo 18:00) |
> | 5 | Corrida de verificación | `ok` en 16,7 min **con `instance_id`** · embudo 545→836→12→1 · `supadata: 10` (el cap mordió exacto) · **0 filas fuera de `retia`** |
> | 6 | `017` aplicada | Las 10 columnas en `not null` sin default · el arbiter viejo da **`42P10`** · el nuevo escribe |
>
> ### 🩸 Y la prueba que convierte esto en un hecho, no en una promesa
> Se creó una **segunda instancia** de `retia` (`slug: prueba-dedup` — que de paso prueba el unique
> nuevo de la `016`, el que antes prohibía dos instancias del mismo pipeline), se metió un
> `external_id` **que ya existía** para la instancia real, y **entró**. Dos filas, mismo video, dos
> instancias. Antes de la `017` eso era imposible. Las dos filas de prueba se borraron y los
> conteos volvieron a la línea base (651 · 1 instancia · 1 cliente).
>
> ### 🚨 LO QUE APRENDIMOS Y NO ESTABA EN NINGÚN CHECKLIST: LAS CREDENCIALES
> El checklist del re-import cubría los **placeholders** y no decía una palabra de las
> **credenciales**. Costó dos intentos fallidos, los dos del mismo tipo: una credencial elegida mal
> de un desplegable. **El repo tenía la culpa**: sus `workflow.json` referencian credenciales por
> *nombre y sin id*, y el nombre de Supabase (`Supabase Registro`) **no existe en n8n** — la real se
> llama `Supabase account`. Al no poder emparejar, n8n las pide a mano: 25 clicks, y ahí se cuelan
> los errores.
> **Ya está corregido en el repo** (25 referencias), así que el próximo import engancha solo.
> **La tabla de qué credencial va en qué nodo — verificada contra n8n el 2026-08-03:**
>
> | Workflow | Nodo | Credencial |
> |---|---|---|
> | motor | `Disparo on-demand (webhook)` | `Webhook Motor Header` |
> | motor | `Leer plan (fachada)` | `Run Plan Header` |
> | archivado | `Disparo por instancia (webhook)` | `Webhook Motor Header` ← **el mismo que el motor, a propósito** |
> | archivado | `Leer plan (fachada)` | `Run Plan Header` |
> | archivado | `Append al Sheet Histórico` | la de Google Sheets (se elige a mano, no es texto) |
> | descubrimiento | `Buscar ahora (webhook)` | `Webhook Descubrimiento Header` |
> | descubrimiento | `Leer plan (fachada)` | `Run Plan Header` |
> | **dispatcher** | `Leer instancias (fachada)` | **`Run Plan Header`** ← el que falló |
> | **dispatcher** | `Disparar por instancia` | **`Webhook Motor Header`** |
> | los 25 nodos de Supabase | — | `Supabase account` |
>
> ⚠️ **Los dos fallos fueron por poner `Webhook Motor Header` donde iba otra.** Es fácil: el
> desplegable las muestra juntas y los nombres se parecen. **Al re-importar, revisá los nodos de
> `fachada` primero** — son los que rompen al arrancar.
>
> ### 🟢 Lo bueno de cómo falló
> Los dos errores dieron **403 en el primer nodo**, antes de tocar Apify, Supadata o Haiku. Cero
> pesos gastados en dos intentos fallidos. Es el fail-closed de ADR-028 funcionando como se diseñó.
>
> ### Lo que sigue
> **Nada bloquea la operación.** Lo que queda es construcción, en este orden: merge de
> `refactor/membresias` + `018` + `019` (ADR-051/052) → **Capa 2 (RLS)**, que con clientes externos
> ya no es diferible → paginación del feed → LinkedIn como pipeline N+1.
>
> 🔸 *Detalle que no molesta: `instances.config_ref` sigue diciendo `clients/piloto/…` y el
> directorio `clients/piloto/` no se renombró. Es config de prueba de la era piloto y su consumidor
> (`deploy.mjs`) está deprecado — renombrarlo etiquetaría datos falsos como si fueran de Retia.*

> 🟣 **QUIÉN USA ESTO HOY, Y LA RESTRICCIÓN QUE IMPONE (Mani, 2026-08-02).** Lo que está live
> —los 3 workflows y el cockpit— **es de Retia**. No hay diferenciador de empresa ni instancias
> concurrentes: hay **un** cliente (`piloto`), **una** instancia y **5 usuarios**, todos con
> `client_id = piloto`, y el que lo usa de verdad es **Jero** (`operador`, ya con su correo en el
> auth de Supabase). Todo el refactor multi-tenant se hace **encima de un producto en uso**.
>
> **La restricción, dicha como restricción: Retia no se puede quedar sin acceso ni sin motor
> mientras dure el refactor.** De lo que viene, tres cosas se lo pueden llevar puesto:
> · ~~**La Fase 3 le rompe los bookmarks**~~ ✅ **cerrado en el cierre 89**: los links viejos ahora
>   rebotan solos al cockpit. Entrar por la raíz `/` sigue siendo el camino a darle igual.
> · **La Fase 6 (RLS)** es la única que puede dejarlo afuera de verdad: hoy el BFF lee con
>   `service_role` y ahí pasa a leer con su sesión. Es la fase que hay que probar con la cuenta de
>   él, no con una de dev.
> · **El `018` de ADR-051** mueve el acceso de `usuarios.client_id` a `usuarios_clientes`. **Si no
>   backfillea las 5 filas de arriba, los 5 pierden el cockpit el día del deploy** — Jero incluido.
>
> 🟠 **DECIDIDO (Mani, 2026-08-02): `piloto` → `retia` y el slug → `reels`, ANTES del merge.**
> Desde la Fase 3 los dos van en la URL: `/piloto/short-form-content/curar/feed` hoy,
> `/retia/reels/curar/feed` después. Se hace antes del merge porque después ya hay links repartidos,
> y romperlos dos veces seguidas es lo que hace que la gente deje de confiar en el cockpit.
>
> > 🚨 **No es un `update clients set id = 'retia'`: eso falla.** Las **6 FKs** que apuntan a
> > `clients.id` están declaradas `references clients (id)` **a secas, sin `on update cascade`**
> > (la `001` y la `016`). Hay que crear, repuntar y borrar. Y la trampa que no se ve: **la `016`
> > dejó DEFAULTS puente apuntando a `'piloto'`** en las 4 tablas de grano empresa, y viven hasta
> > la `017` — si no se mueven, el primer insert que no mande `client_id` explícito viola la FK.
> >
> > ```sql
> > begin;
> >
> > -- 1. Nace el cliente nuevo con los datos del viejo.
> > insert into clients (id, nombre, estado, creado_en, parent_id)
> > select 'retia', 'Retia', estado, creado_en, parent_id   -- 👉 confirmá el nombre visible
> > from clients where id = 'piloto';
> >
> > -- 2. Repuntar TODO lo que le apunta. Los conteos son los de prod al 2026-08-02:
> > update instances      set client_id = 'retia' where client_id = 'piloto';  -- 1
> > update clients        set parent_id = 'retia' where parent_id = 'piloto';  -- 0 (no hay árbol aún)
> > update app.usuarios   set client_id = 'retia' where client_id = 'piloto';  -- 5  ← Jero acá
> > update app.voces      set client_id = 'retia' where client_id = 'piloto';  -- 3
> > update app.proyectos  set client_id = 'retia' where client_id = 'piloto';  -- 6
> > update app.referentes set client_id = 'retia' where client_id = 'piloto';  -- 16
> >
> > -- 3. Los defaults puente de la 016. SIN ESTO se rompe el primer insert.
> > alter table app.usuarios   alter column client_id set default 'retia';
> > alter table app.voces      alter column client_id set default 'retia';
> > alter table app.proyectos  alter column client_id set default 'retia';
> > alter table app.referentes alter column client_id set default 'retia';
> >
> > -- 4. Recién ahora.
> > delete from clients where id = 'piloto';
> >
> > -- 5. El otro segmento de la URL. `slug`/`nombre` no los referencia nadie.
> > update instances set slug = 'reels', nombre = 'Reels'
> >  where workflow_id = 'short-form-content';
> >
> > commit;
> > ```
> >
> > **Verificar después** (las tres tienen que dar lo esperado, no "parecer bien"):
> > `select id, nombre from clients;` → una fila, `retia` ·
> > `select client_id, slug from instances;` → `retia` / `reels` ·
> > `select count(*) from app.usuarios where client_id <> 'retia';` → **0**.
> >
> > **Lo que NO cambia, y conviene saberlo:** el **`instances.id` es el mismo uuid**, así que
> > `N8N_INSTANCE_ID`, los workflows re-importados y el dispatcher **no se tocan**. Y el código no
> > tiene el slug hardcodeado en ningún lado (verificado: solo aparece en un comentario).
> >
> > 🔸 **Dos cosas que quedan desalineadas a propósito:** `instances.config_ref` sigue diciendo
> > `clients/piloto/…` y el directorio `clients/piloto/` **no se renombró**. Ese yaml es config de
> > prueba de la era piloto (una voz falsa de "IA y productividad", cuentas de muestra) y su único
> > consumidor es `deploy.mjs`, que está **deprecado**. Renombrarlo etiquetaría datos falsos como si
> > fueran de Retia; limpiarlo o borrarlo es otra tarea.
>
> 📌 **Alta de usuarios: sigue manual y Mani quiere cambiarlo.** ADR-051 lo dejó como deuda
> consciente con disparador *"el primer usuario que no sea de la agencia"*. **Vale confirmar si ese
> disparador ya se cumplió**: si Jero entra como gente de Retia y no como equipo de la agencia, el
> alta manual (invite en Supabase + `insert` a mano en el SQL Editor) ya dejó de alcanzar.

> ✅ **REFACTOR MULTI-TENANT — FASES 0 a 4 EN PRODUCCIÓN. LA `016` Y LA `017` APLICADAS.**
> *(Este bloque decía «Fases 0 a 4 en la rama» y listaba cinco pasos pendientes — re-import, apagar
> crons, activar dispatcher, corrida de verificación, `017`. **Los cinco están hechos.** También murió
> acá el aviso del `slug`: hoy es `reels`, y el del techo de gasto: el re-import pasó.)*
>
> **El estado medido, con sus números, vive en un solo lugar:**
> [plan-multi-tenant §0](./plan-multi-tenant.md) (base + n8n + repo, verificado el 2026-08-03) y el
> checklist con marcas en **§12**. No lo dupliques acá.
>
> **Lo que falta está escrito para ejecutarse, en [plan-multi-tenant §14](./plan-multi-tenant.md):**
> **§14.1** la `018`/`019` sin mergear · **§14.2** `n8n:push` sin topología · **§14.3** RLS ·
> **§14.4** el Sheet global · **§14.5** knobs y cupos compartidos.
>
> 🚨 **Lo único de ahí que puede lastimar a alguien hoy, y por eso se repite acá:** la **`018`**
> mueve el acceso de `usuarios.client_id` a `app.usuarios_clientes`. **Si no backfillea las 5 filas
> de `app.usuarios` en la misma transacción, los 5 usuarios pierden el cockpit el día del deploy —
> Jero incluido.** Se verifica con `select count(*) from app.usuarios_clientes;` → **5**, antes de
> que Vercel deploye.

> ✅ **SACAR EL TECHO DE GASTO — CERRADO (2026-08-02/03).** *El re-import se hizo, el techo quedó en
> **250** por decisión (no por costo), y la corrida de verificación salió `ok`. Lo de abajo se
> conserva porque su hallazgo sigue vigente y es de los caros de re-derivar: **el cap POSTERGA, el
> presupuesto QUEMA**, y el cuello es el supply, no los cortes.* Mani pidió sacar
> `cap_top_n` (los planes pagos de Apify/Supadata/Claude no llegan ni a la mitad del cupo y se
> resetean solos) y que el motor sea lo más preciso posible trayendo el `N` de cada proyecto. La
> revisión encontró que **el cap no era lo que frenaba, y sacarlo hoy habría roto la corrida**.
> Salieron 2 ADRs: [044](../adr/ADR-044-todo-nodo-caro-tiene-presupuesto.md) ·
> [045](../adr/ADR-045-se-borra-solo-lo-que-nunca-produjo-nada.md).
>
> ### 🚨 El hallazgo que importa: `Traducir` era el techo real, y el único nodo caro SIN red
> Corría **serial con `sleep(1000)` y sin presupuesto**. Los referentes son casi todos ingleses: la
> corrida del 31/07 16:28 hizo **170 traducciones sobre 191 transcritos (89%)** y duró 31 min.
> `Transcribir` tiene presupuesto (840 s) justamente porque el watchdog del task runner
> (`N8N_RUNNERS_TASK_TIMEOUT`, 900 s en el pod) **mata el nodo entero** y la corrida muere sin
> entregar nada — pasó 3 veces el 07-10. `Traducir` no tenía ninguno: al doble de volumen se lleva la
> corrida puesta, después de pagar Apify y Supadata. **Era el modo de falla más caro del motor.**
>
> ### 🩸 Y la asimetría que hay que memorizar: el cap POSTERGA, el presupuesto QUEMA
> El orden en serie es `Heat-score v1 → Preparar procesados → POST processed_items → Transcribir`
> (ADR-029, enmienda del 31/07), o sea **el video se marca como procesado ANTES de transcribirse**.
> El que se queda sin presupuesto vuelve con transcript vacío → el gate lo descarta `sin_guion`
> (ADR-030) → y ya está en la memoria de dedup: **no se reintenta nunca**. El corte de `cap_top_n`,
> en cambio, pasa *adentro* de `Heat-score v1`, antes de ese POST: lo capado vuelve la corrida
> siguiente. Sacar el cap sin mover el presupuesto habría cambiado un aplazamiento por una pérdida
> permanente. *(Y con `CONCURRENCIA = 8` a ~27 s/video, 840 s daban ~250 videos: exactamente
> `cap_top_n = 250`. Los dos techos estaban calibrados al mismo punto, así que bajar uno no destrababa
> nada.)*
>
> ### ✅ Paso 1 HECHO — y el paso 2 se dio vuelta al mirarlo (2026-08-02)
> **1. ✅ Motor re-importado y publicado** por Mani, con el commit `f0a0936` en `origin/main`
> (Vercel deploya `main`, así que el cockpit con el borrado también está vivo).
> **2. 🔄 `Videos a transcribir por corrida` se puso en 0, se verificó, y se VOLVIÓ a 250.**
>
> > 🚨 **El techo no era freno de gasto: era el que raciona el supply.** `Leer procesados` lee
> > `processed_items` entera (`limit=50000`, **sin filtro de fecha**) y `POST processed_items` corre
> > **antes** de transcribir, así que todo lo que se transcribe queda en la memoria de dedup para
> > siempre — pase o no el gate, se entregue o no. Y la entrega la topan los `N`, que hoy suman
> > **100**. Con el techo en 0, la corrida transcribe ~500 (el backlog de 100 días entero), entrega
> > **los mismos 100**, y **quema ~265 videos que no vuelven**. Con 250 quema ~80 y el backlog dura
> > 2-3 semanas. *Sacar el techo no entrega un solo video más.*
> >
> > **Y el cuello está río abajo:** **143 candidatos sin calificar** en el feed (49 · 34 · 31 · 24 · 5)
> > contra **9 calificados en total** desde que el feed existe. Cada corrida grande le suma backlog a
> > un backlog. **El techo se sube cuando sube `sum(N)` o cuando el equipo vacía el feed**, no cuando
> > sobra cupo en Supadata. Detalle y la tabla de números: [enmienda de
> > ADR-044](../adr/ADR-044-todo-nodo-caro-tiene-presupuesto.md#enmienda-del-2026-08-02-mismas-horas--el-techo-se-queda-en-250-y-no-por-costo).
>
> ⚠️ *Los dos cambios de ese knob se hicieron por PostgREST, no por `/curar/ajustes`, así que sus
> eventos en `app.eventos` tienen `usuario_id: null` y un `origen` que lo dice. Son los dos únicos de
> la historia de ese knob sin autor; no los leas como un hueco.*
>
> ### ✅ La corrida se hizo (03/08 02:36 UTC, `ok`) — la guía de qué mirar queda para la próxima
> **3. Correr y mirar.** Con el techo en 250 y el backlog de 100 días, esperá que el cap **muerda**
> (el máximo histórico transcrito son 191). Lo que hay que mirar, en orden de qué te avisa antes:
> · **Apify primero, no `runs`.** Si algo murió en el arranque, `runs` deja la fila en `en_curso`
>   para siempre y parece lentitud. **Cero llamadas en Apify ⇒ murió antes de scrapear** (lo más
>   probable: `<<DASHBOARD_URL>>` sin rellenar). Ese reflejo desempató la sesión del 02/08.
> · **`[Traducir] Loop completo en …ms`** tiene que aparecer, y **`[Traducir] PRESUPUESTO agotado`**
>   NO. Si aparece, el techo pasó a ser Anthropic: subí `concurrencia_traducir` en `Config` (sin
>   re-import).
> · **`[Transcribir] PRESUPUESTO agotado`** es el que duele: cada video ahí es un video **quemado**
>   (ya está en `processed_items`, ver arriba). Si aparece, subí `concurrencia_transcribir`.
> · **`ventana_corrida_min` está en 60** y la estimación de esta corrida es ~27 min. Si se pasa de
>   60, el barredor la mata en vuelo y el guard deja arrancar otra en paralelo.
> · ⚠️ **Ojo con `cap_top_n` cuando muerde: corta GLOBAL.** Si un proyecto vuelve con `evaluados: 0`,
>   no es que no haya supply — es que el cap se lo llevó otro (pasó con el cap en 10 el 02/08).
>
> **4. Lo que NO es palanca ahora mismo:** subir `Resultados por cuenta de referente` de 40 a 50, que
> era la recomendación anterior. Con el feed en 143 sin calificar y la entrega topada por `sum(N)`,
> traer 160 crudos más solo aumenta lo que se quema. **Guardala para cuando el equipo esté al día.**
>
> ### ⚠️ Lo que esto NO arregla, y hay que decirlo
> **Ningún proyecto se va a acercar a su `N` por esto.** El cuello es el **supply**, no los cortes:
> todos los proyectos, en todas las corridas medidas, dicen `razon_faltante: supply`. Los 4 proyectos
> de comunicación comparten **7 cuentas** y piden 60 videos entre todos, y `Armar candidato` le da
> cada video a **un solo** proyecto. La corrida más gorda que hubo (31/07 16:28, 280 crudos, 191
> transcritos, sin que el cap mordiera) entregó **139 de 400**. Y el dedup contra `processed_items` es
> brutal: 2 h después de esa corrida, 491 pretrim quedaron en **35** filtrados. La recencia en 100 días
> va a drenar un backlog viejo en las próximas 1-2 corridas, y eso es real, pero es de una sola vez.
> **La palanca de verdad es sumar referentes.**
>
> 🔎 **Otro hallazgo que quedó anotado y no se tocó: `cap_top_n` corta GLOBAL, no por proyecto.**
> Medido en tu propia corrida de verificación `191ddc8b` (02/08, cap en 10): `Trading fast tips` se
> llevó los 10 lugares y los cuatro proyectos de comunicación quedaron en `evaluados: 0`. Mientras
> esté en un valor que muerda, mata proyectos enteros en vez de recortar parejo. Con el techo en 0 el
> problema no se plantea; repartirlo por proyecto sería un ADR propio.
>
> ### ✅ Lo que ya está hecho y verificado (código, sin tocar prod)
> · **`Traducir` con pool + presupuesto** y el `catch` mudo que ahora cuenta y loguea (una tanda
>   entera podía fallar y la corrida salía verde con los scripts en inglés).
> · **`Transcribir` de 8 a 24 en vuelo** (~0.9 req/s contra los 10 req/s del plan pago: 11× de aire).
>   840 s pasan a cubrir **~745 videos**.
> · **3 knobs nuevos en `Config`** (`concurrencia_transcribir`, `concurrencia_traducir`,
>   `presupuesto_traducir_s`): se editan a mano en n8n **sin re-importar**, que es el punto — el
>   handoff ya documenta lo que cuesta un re-import.
> · **Borrar records en el cockpit (ADR-045):** voces, proyectos y referentes. Verificado en vivo
>   contra la base: el rechazo («*Comunicación en empresas tiene 24 videos en el feed…*») y el borrado
>   feliz, con un proyecto y un referente de prueba que se crearon y se borraron. **De los 6 proyectos
>   vivos hoy solo *Trading Psychology* se puede borrar** (0 candidatos, 0 descartes); los otros cinco
>   tienen entre 10 y 60 filas colgando. **Sin migración y sin re-import.**
> · 🧹 **El `@casper_smc` duplicado que este handoff arrastra desde el 01/08 ya se puede limpiar solo,
>   sin SQL a mano.** Sigue vigente el cuidado: mirar qué proyectos tiene cada una de las dos filas
>   antes de borrar, porque si difieren, borrar la equivocada le saca fuentes a un proyecto.
>
> **Verde antes de commitear:** `npm run validate` 1616 checks · **138 tests** del dashboard (7 nuevos
> de `domain/borrado.ts`) · `typecheck` · `build` · `auditar-workflows.mjs` sin hallazgos ·
> `test-nodos.mjs` todo en verde con una sección nueva para `Traducir` (pool, presupuesto, dedup del
> fan-out, el español que no gasta llamada, y el fail-open ahora audible). ⚠️ El test del presupuesto
> de `Transcribir` tuvo que **fijar la concurrencia en 2**: con el pool en 24, los 30 videos del caso
> arrancan en dos vueltas y ningún budget razonable llega a morder.

> 🟡 **SEGUNDA RONDA DE REVISIÓN UI/UX — CÓDIGO LISTO, FALTAN 2 PASOS MANUALES DE MANI (2026-08-01).**
> 7 observaciones de Mani sobre el cockpit live. Como en la primera ronda, **tres eran defectos y no
> preferencias**, y una era una pantalla que decía algo falso. Salieron 4 ADRs:
> [040](../adr/ADR-040-los-criterios-de-la-voz-son-obligatorios.md) ·
> [041](../adr/ADR-041-la-metadata-del-referente-es-derivada.md) ·
> [042](../adr/ADR-042-el-techo-de-gasto-se-toca-desde-el-cockpit.md) ·
> [043](../adr/ADR-043-el-techo-se-muestra-la-entrega-no-se-promete.md).
>
> ### 🚨 Y apareció un bug PREEXISTENTE al verificar (migración `015`, sin aplicar)
> Contar las filas de `v_salud_referentes` para comprobar la columna `seguidores` dio **18 para 17
> referentes**. No lo causó ADR-041: **`v_senal_seleccion` agrupa por `(referente, idioma)`** y el
> `left join` de la `009` lo trataba como uno-a-uno. Cualquier cuenta que publique en dos idiomas se
> duplica. `@tori.trades` es una hoy:
> `otro → 0 de 1 (0.00)` · `en → 1 de 8 (0.13)`.
> O sea que la cuenta salía **dos veces** en `/curar/referentes` y «aprueban» mostraba **la tasa de un
> idioma elegido al azar por el join**, no la de la cuenta (la real es 1 de 9 ≈ 11%). Misma familia
> que todo lo demás: no falla, no avisa, y deja un número que se ve razonable y está mal. *`esFlojo`
> usa `tasa_gate`, no esta, así que* A revisar *nunca estuvo contaminado.*
> ✅ **[`core/schema/015`](../../core/schema/015_salud_referentes_una_fila.sql) aplicada** — la vista
> pasó de 18 filas a **17 (una por referente)** y `@tori.trades` da **0.11**, que es su 1 de 9 real. **Regla que deja para esa vista: todo join nuevo
> tiene que garantizar UNA fila por referente** — las CTEs de `seguidores` ya nacieron con
> `distinct on` justamente por eso.
>
> 🧹 **Dato sucio aparte, sin resolver: `@casper_smc` está DOS VECES en `app.referentes`**, dos ids
> distintos y la misma plataforma. No es la vista, son dos filas reales. Antes de borrar una hay que
> mirar qué proyectos tiene cada una: si difieren, borrar la equivocada le saca fuentes a un proyecto.
>
> ### ✅ CERRADO — las 3 migraciones aplicadas, el motor re-importado y el techo VERIFICADO EN VIVO
> Corrida `191ddc8b` del 2026-08-02, **`ok` en 17 min**, con el techo puesto en 10:
> `colectados 562 → asignados 912 → pretrim 754 → **filtrados 10** → supadata 10 → gate 5`.
> **10 videos distintos transcritos, no 250: ADR-042 funciona de punta a punta.** El techo volvió a
> **250**. *(Los `entregados=0` con `razon=supply` de 4 proyectos son artefacto del cap en 10, no una
> señal de capacidad: con el techo real esos números no significan nada.)* Apify ~$0.83.
>
> 🩸 **Costó TRES intentos, y los dos primeros murieron por lo mismo: `<<DASHBOARD_URL>>` sin
> rellenar tras el re-import.** El nodo `Leer plan (fachada)` arma su URL con
> `$('Config').first().json.dashboard_url + '/api/engine/run-plan?ambito=motor'`; con el placeholder
> literal la URL queda **relativa** y n8n se la pide **a sí mismo** →
> `404 ... webhook "GET <uuid>/api/engine/run-plan" is not registered`.
> **Por qué es la que se olvida:** `dashboard_url` es el placeholder **más nuevo** del workflow (entró
> con la fachada de ADR-028), así que no está en la memoria muscular de los re-imports viejos —
> `<<SUPABASE_URL>>` sí se rellenó las dos veces (por eso la fila de `runs` se escribía igual).
> ⚠️ **Y el fallo es MUDO donde importa:** un abort ahí deja la fila en `en_curso` para siempre, sin
> `fin` ni métricas. Parecía una corrida lenta. **Lo que lo desempató fue mirar Apify con el
> `APIFY_TOKEN` del `.env`: cero llamadas ⇒ murió antes de scrapear, no era lentitud.** Guardá ese
> reflejo: `runs` no distingue "colgada" de "muerta", Apify sí.
> **Checklist para el próximo re-import de este workflow (los 6, no 2):** `<<DASHBOARD_URL>>` ·
> `<<INSTANCE_ID>>` · `<<SUPABASE_URL>>` · `<<WEBHOOK_PATH_MOTOR>>` · `<ANTHROPIC_API_KEY>` ·
> `<SUPADATA_API_KEY>`. Los dos últimos muerden a mitad de corrida, no al principio.
>
> 🧹 Quedaron 2 runs en `fallo` del 02/08 (`a375351b`, `dbdd85a0`): son los intentos muertos, no hay
> nada que investigar ahí.

> ### ✅ Lo que quedaba de Mani — LOS 3 HECHOS (verificado 2026-08-02: la `014` está aplicada, el
> motor re-importado, y la corrida `191ddc8b` transcribió 10 videos distintos con el techo en 10).
> *Se dejan escritos porque el porqué de cada uno sigue valiendo para el próximo re-import.*
> **1. Aplicar [`core/schema/014`](../../core/schema/014_criterios_voz_y_perillas.sql) en el SQL
> Editor — ANTES del commit.** El código endurece el zod de `filaVoz` a `z.string()`: si el deploy
> llega primero y alguna voz tuviera `criterios_relevancia` null, se cae `/curar/voces` **y la
> fachada `/api/engine/run-plan` que alimenta a n8n**. Las 3 voces vivas tienen criterios
> (545–649 chars), así que el riesgo real es cero — pero el orden se respeta igual.
> **2. Re-importar y publicar el motor** (`workflow-short-form-content`). Después del deploy, no
> antes: si el workflow llega primero, `pick` no encuentra la clave nueva y cae al `Config` (250).
> No rompe nada, pero el knob no hace nada y ese silencio confunde.
> **3. El hecho-cuando, y es una corrida real:** poner *Videos a transcribir por corrida* en **10**,
> correr, y confirmar en `runs.metricas` que se transcribieron **10 videos distintos, no 250**.
> Después devolverlo a **250**. ⚠️ Si el cambio no agarró, **la corrida sale verde igual** y
> transcribe 250 — la misma familia de fallo silencioso que los 4 hallazgos de D7. Es la corrida más
> barata que se hizo hasta ahora, justamente por el cap en 10.
>
> ### Los tres hallazgos que no eran lo que parecían
> 1. **La hora de Actividad estaba mal por la misma razón que el repo declara timezone obligatoria en
>    el manifest** (`workflow-manifest.md:32`, «incidente real»). `entender/secciones.tsx` es un
>    Server Component y `toLocaleString` sin `timeZone` usa la del proceso: en Vercel, **UTC**. Todo
>    salía 5 h adelantado. Ahora hay un `lib/fechas.ts` con `America/Bogota`, que era la zona que el
>    repo ya había elegido para los crons. De paso se arregló un primo: `notaDePromocion` **persistía**
>    la fecha UTC, así que aprobar un sugerido de noche dejaba escrito el día siguiente, para siempre.
> 2. **«Candidatos por corrida» tenía una descripción falsa en la base.** Decía *«Cuántos videos
>    distintos trae la corrida en total»* — eso describe a `cap_top_n`, que es **otro knob**. Lo que
>    hacía era ser el default de `N` para proyectos con `N` vacío, y desde ADR-038 **no aplicaba a
>    ninguno**. Estaba inerte y mentía: se borró (ADR-042).
> 3. **Las notas se corrían de lado porque el control era un `<Input>` de una línea**, no un textarea
>    (`referentes/pantalla.tsx`). Y `sugeridos/actions.ts` escribe ahí automáticamente ~250 chars al
>    aprobar: en prod, `@smcandict` 243 y `@trademachineoff` 226.
>
> ### Lo que hay que saber antes de tocar las perillas de cantidad
> 🚨 **«Los knobs se esconden, NO se borran» era demasiado general.** Hay que mirar **caso por caso**
> qué valor tiene el `Config` del workflow, porque es ahí donde cae la clave borrada:
> · `Candidatos por corrida`: ajustes 100, `Config` `top_n` 100 ⇒ **se borró, cayó parada.**
> · `Días de recencia`: ajustes 200, `Config` **7** ⇒ **borrarla tira la recencia a 7 en silencio.**
> El aviso de ADR-038 sigue vigente para la recencia y para `Resultados por cuenta`.
>
> 🔀 **El gatillo de `fields.uuid` se disparó y NO se usó.** El handoff dejó anotado que `fields.uuid`
> y el `uuidDe` sin trabajo mueren «en el próximo re-import que haga falta por otra cosa». Este
> re-import es ese. Se decidió **no aprovecharlo**: son cambios sin relación, y si la corrida de
> verificación sale mal quedan dos sospechosos. La próxima vez ya no hay excusa de costo.
>
> ### Lo demás que entró
> · **Criterios de voz obligatorios** al crear y al editar, `not null` en Postgres (ADR-040). Para n8n
>   el campo pasa de "a veces null" a "siempre string": es un **aflojamiento**, no un cambio de
>   contrato — por eso no lo obliga a re-importar.
> · **Seguidores en Referentes**, derivados en `v_salud_referentes` (ADR-041). **9 de 17 cuentas van a
>   mostrar número**; las otras 8 se sembraron a mano y no tienen el dato en ningún lado ⇒ «—».
> · **`voz` y `engagement` vuelven al Feed** — eran las dos únicas pérdidas reales del corte en esa
>   pestaña. Y la **calidad global** vuelve a Entender, **sin migración**: `v_metricas_calidad` ya
>   trae los conteos crudos, y `calidadGlobal()` recalcula la precisión **desde las sumas** (promediar
>   precisiones de proyectos con volúmenes distintos da un número creíble y equivocado).
> · **Ajustes separa un bloque «Avanzado (solo devs)».** Antes un rol `dev` veía los 18 mezclados sin
>   ninguna marca, que es por qué la perilla inerte seguía llamando la atención.
> · **El techo de crudos** (ADR-043) debajo del campo `N`, en `/operar`, y con helper text en 6
>   lugares. **No es un pronóstico**: `domain/corrida.ts:17-25` decidió a propósito no estimar la
>   entrega, y esto es una multiplicación (`cuentas × resultados por cuenta`). Si alguien más adelante
>   quiere poner un «te van a llegar ~12», el razonamiento está en ADR-043 para no re-litigarlo.
> · **La migración `014` también registra `visibilidad`**, que el flip de ADR-038 había dejado solo en
>   prod: una base recreada desde `core/schema/` salía con los 18 knobs en dev y **el equipo no veía
>   ninguno**.
>
> **Verde antes de commitear:** `npm run validate` 1589 checks · **131 tests** del dashboard ·
> `typecheck` · `build` · `auditar-workflows.mjs` sin hallazgos · `test-nodos.mjs` todo en verde (con
> 3 casos nuevos para la precedencia del techo de gasto). ⚠️ El mock `CFG_PLAN` de `test-nodos.mjs`
> tenía `cap_top_n: 100` contra los **250** del `workflow.json` vivo: mismo drift que el contrato
> congelado, corregido a favor del que está corriendo.


> 🟢 **REVISIÓN UI/UX DE LA PRIMERA VERSIÓN LIVE — EN PRODUCCIÓN 2026-08-01 (commit `dce25a3`).**
> 10 observaciones de Mani sobre el cockpit recién deployado. Tres resultaron ser **bugs, no
> preferencias**, y una obligó a decir algo incómodo sobre la máquina. Cero re-imports de n8n, cero
> migraciones nuevas: todo en `apps/dashboard/` + un `UPDATE` de datos + un bucket de Storage.
> Salieron 3 ADRs: [037](../adr/ADR-037-miniaturas-por-proxy-propio.md) ·
> [038](../adr/ADR-038-una-sola-perilla-de-cantidad.md) ·
> [039](../adr/ADR-039-la-lista-resume-el-record-se-abre.md).
>
> **Los tres hallazgos que no eran lo que parecían:**
> 1. **Las miniaturas no fallaban por el expiry.** Los CDNs de Meta mandan
>    `cross-origin-resource-policy: same-origin`: el browser **bloquea siempre** un `<img>` directo,
>    con la URL fresca o vencida. `curl` daba 200 y por eso la hipótesis del handoff anterior apuntó
>    al lado equivocado — CORP no lo aplica curl, lo aplica el browser. Arreglado con
>    `/api/miniatura` (ADR-037). *El expiry también existía y se midió: **~5 días**, menos que la
>    cadencia semanal — por eso el proxy además cachea en Storage.*
> 2. **El botón del buscador no estaba escondido: no lo renderizaba nadie.** `BotonBuscar` quedó
>    escrito y sin importar desde el commit `270d107` que lo creó. Ahora está en Operar (y en
>    Sugeridos), y `buscarAhora` se mudó a `operar/actions.ts` al lado de `correrAhora` — la mezcla
>    de "aprobar es curar" con "disparar es operar" fue lo que dejó el botón huérfano.
> 3. **Las barras del embudo se salían porque no es un embudo.** `asignados` (1585) > `colectados`
>    (700): del fan-out en adelante se cuentan filas `(video × proyecto)`, no videos. Ahora son
>    **dos embudos con su propia base**, más clamp y `overflow-hidden`.
>
> **Y lo que hay que saber antes de tocar la cantidad de videos ([ADR-038](../adr/ADR-038-una-sola-perilla-de-cantidad.md)):**
> los 3 knobs globales (`Días de recencia`, `Resultados por cuenta de referente`, `Candidatos por
> corrida`) pasaron a `visibilidad = 'dev'` y el `N` del proyecto es obligatorio y único.
> 🚨 **Se escondieron, NO se borraron, y no hay que "limpiarlos" después:** `Armar plan de corrida`
> resuelve `pick('dias_recencia', …)` con `ajustes > Config`, y el `Config` del motor tiene
> `dias_recencia = 7`. Borrar la fila sin re-importar **tira la recencia de 100 a 7 en silencio** —
> la quinta de la familia. `visibilidad` es campo de UI, no del contrato: la fachada sigue sirviendo
> los **18** ajustes (verificado contra prod).
>
> **Verificado en producción tras el deploy:** `/operar` sin la palabra «hasta», con
> `pide N · X cuentas · la última entregó Y` por proyecto · `/api/miniatura` devuelve la imagen
> (200, 1080×1920, redirigiendo a Storage), **307 sin sesión** y **400 al host fuera de la
> allowlist** (el anti-SSRF) · fachada intacta en los dos ámbitos · `npm run validate` 1517 checks ·
> 116 tests.
>
> ### 🟠 Lo que queda, y es de Mani
> **1. ✅ `Resultados por cuenta de referente` está en 40 desde el 01/08.** (Se pedía subirlo de 20.
> Queda margen: el cap de `Config` es **50**, o sea 160 crudos más por corrida sin re-importar nada.)
> Es dev-only, así que la pantalla no lo recuerda. **Es la palanca más barata** para que los
> proyectos se acerquen a su número: con 20, un proyecto de 3 referentes miraba 60 videos crudos y
> entregaba ~10 contra un N de 15.
> **2. Avisarle al equipo que la pantalla cambió.** [El onboarding](../onboarding-equipo-redes.md)
> ya está reescrito (§0, §3.1, §5.2, §5.3, §5.5, §8.1). Lo que no puede faltar: *la lista resume y
> el record se abre tocando la fila*, *crear es un botón arriba*, y *el número de videos ahora vive
> en el proyecto y es el único que manda*.
> **3. El pronóstico honesto va a mostrar que varios proyectos no llegan.** No es un bug de la
> pantalla: es el estado real, que antes tapaba la palabra «hasta».

> 🟢 **D7 ESTÁ EN PRODUCCIÓN — 2026-08-01. Airtable salió del sistema.** Mergeado a `main`,
> deployado, **migración `013` aplicada**, dato migrado y **los 3 workflows re-importados y
> publicados**. El hecho-cuando mecánico está cumplido: `grep -c api.airtable.com
> Workflows/*/workflow.json` da **0 0 0**, `lib/airtable.ts` no existe y `<<AIRTABLE_BASE_ID>>` ya
> no es placeholder de nadie.
>
> **Verificado contra prod:** la fachada sirve `fields.uuid` con el `id` viejo intacto (el paso de
> expansión, vivo) · el webhook del descubrimiento responde **403 `Authorization data is wrong!`**
> (activo, path y credencial OK) · en Postgres hay 145 candidatos, 20 descartes y 8 propuestas con
> sus 16 pares.
>
> ✅ **PASO 1 CUMPLIDO — corrida `on_demand` `ok` el 2026-08-01 17:24 UTC.** Las escrituras de n8n a
> Postgres se estrenaron y funcionan: **2 candidatos** (147 en total) con `proyecto_id`/`voz_id`
> como **FK uuid de verdad**, **1 descarte** (21), **3 `processed_items` con `run_id`**,
> `registro_dedup: ok`. Corrida barata a propósito (`Días de recencia` 7 y `Resultados por cuenta`
> 10): 140 results de Apify, **≈$0.39**. ⚠️ **Los dos knobs quedaron recortados** — hay que
> devolverlos a **100** y **40** en `/curar/ajustes` o el cron del lunes 08:00 corre a media máquina.
>
> ✅ **PASO 3 CUMPLIDO Y EN PRODUCCIÓN — 2026-08-01 (commit `2260ec0`).** El `id` del contrato es el
> uuid en `voces`, `proyectos` y `referentes`. **No hizo falta un tercer re-import**, y esa fue la
> decisión de diseño: los consumidores en n8n resuelven el uuid con `uuidDe[x.id] = x.fields.uuid`,
> así que sirviendo los dos ids **iguales** ese mapa queda identidad. Por eso `fields.uuid` **no se
> borró** — sacarlo sí obligaría a re-importar; muere en el próximo re-import que haga falta por
> otra cosa. Las columnas `airtable_id` **siguen en las tablas** (traza al export y las usa
> `scripts/cortar-feed.ts`): se caen con la limpieza de D8. A/B contra prod: mismo reparto
> referente→proyecto (3/3/6/5), mismos 16 pares fuera de ámbito, demás campos idénticos.
>
> 🚨 **Y de paso apareció la CUARTA pérdida silenciosa de D7, ya arreglada por el paso 3.**
> `Destilar criterios` del archivado indexa `projMeta` por el `id` del plan y después busca por
> `candidatos.proyecto_id`, que desde D7 **es uuid**. Con el `id` en record id **nunca matcheaba**
> ⇒ `byProj` vacío ⇒ **cero destilaciones, en verde y sin avisar**: ADR-022 muerto. No se había
> notado porque destilar pide ≥4 calificados por proyecto y hay 0. Con el `id` en uuid, las dos
> puntas coinciden. *Es la misma familia que los 3 hallazgos del grilling: no falla, sale verde y
> deja un número en cero.*
>
> ### 🟠 Lo que queda, y es de Mani
>
> **1. Calificar 2 o 3 en `/curar/feed` — 2 minutos, gratis, y tiene fecha.** Es lo único que
> prueba el **hallazgo 4** (`fecha_calificacion`), porque ese campo lo escribe **la app al
> calificar**, no n8n: una corrida del motor no lo toca. Hoy `estado <> 'nuevo'` devuelve `[]`.
> Y el **archivado corre solo los domingos 18:00** (`0 18 * * 0`): si llega con la cola en cero,
> `Leer Candidatos calificados` vuelve vacío, no escribe un solo `output` y la cadena
> `fecha_calificacion` → `outputs.calificado_en` → `v_metricas_calidad` se queda otra semana sin
> probar. Con la cola cargada, ese archivado cierra el loop entero de una.
>
> **2. Devolver los 2 knobs** (`Días de recencia` → 100, `Resultados por cuenta de referente` → 40).
>
> **3. Sacar `AIRTABLE_PAT` y `AIRTABLE_BASE_ID` de Vercel.** Ya no los lee **ningún** código de la
> app (verificado por grep): es higiene, no un corte.
>
> **Las queries de verificación**, para cuando la cola tenga algo:
> ```sql
> select id, calificacion, estado, fecha_calificacion from app.candidatos where estado <> 'nuevo' limit 5;
> select * from app.v_metricas_calidad order by semana desc limit 5;
> select * from app.v_auditoria_descartes order by semana desc limit 3;
> ```
> `fecha_calificacion` **no puede ser null** después de calificar, y `v_metricas_calidad` **no puede
> dar cero filas** una vez que el archivado corrió sobre algo calificado.
>
> **Si algo falla, el síntoma más probable es un `404` contra una tabla que existe**: es el header
> de schema (`Content-Profile: app` para escribir, `Accept-Profile: app` para leer). Está en
> [`ingesta-registro.md §5`](../../core/contracts/ingesta-registro.md).
>
> ### Dos cosas para medir en esa primera corrida
> · **El thumbnail** (hallazgo 2): agarrá un `thumbnail_url` nuevo y pedilo con `curl -I` al día
>   siguiente. Airtable re-hosteaba las imágenes y ahora se guarda la URL cruda del CDN, firmada y
>   con expiry. Si vence antes de la semana, entra Supabase Storage. *(Los 145 arrastrados vienen
>   **sin miniatura a propósito**: eran adjuntos de Airtable con expiry de 2 h.)*
> · **`registro_dedup`** en `runs.metricas`, como siempre.
>
> ### Airtable
> El viaje de 9 páginas a congelar **dejó de importar**: ninguna máquina escribe ni lee ahí. Queda
> el trabajo no-código de **D8** (export final, base a read-only, cancelar la suscripción) y
> **avisarle a Majo y Jero que Airtable murió** — que ahora califican solo en el cockpit, y que la
> bandeja de Sugeridos **ya no se llena sola los lunes**: hay un botón, y conviene apretarlo recién
> cuando resolvieron las 8 que están esperando.
>
> 🔎 **Un zombie conocido, inofensivo:** hay un run de `descubrimiento` en `en_curso` desde el
> 27/07. El barredor de zombies solo corre cuando corre el workflow, y al sacarle el cron nadie lo
> barrió. No bloquea el botón (la guarda `hayBusquedaViva` usa ventana de 60 min, y ese tiene 5
> días), y `v_embudo_descubrimiento` no lo cuenta ni como ok ni como fallo. Se limpia solo la
> próxima vez que alguien busque.


> 📋 **El viaje a Airtable que se viene acumulando, junto, para hacerlo de una** (los 3 cortes de
> D5 y D6 dejaron su parte y ninguna se hizo todavía). **9 páginas a congelar** —solo-lectura o
> renombrar `[ARCHIVO] …`— y **ninguna tabla a bloquear**:
> *Configuración Global* · *Ajustes Dev-Only* (corte 1/4) · *Referentes* · *Referentes - Revisar* ·
> *Referentes - Sugeridos* (corte 2/4) · *Voces* · *Proyectos* (corte 3/4) · **y las 2 que suma D6:
> *Feed* y *Descartes*** (cierre 75 — calificar y auditar ya se hacen en `/curar/feed` y
> `/curar/descartes`). ⚠️ Las 2 de D6 son **las menos urgentes de las nueve**: la app y Airtable
> escriben la misma tabla, así que mientras las dos estén abiertas no hay divergencia posible, solo
> dos lugares para hacer lo mismo. Congelarlas es higiene, no seguridad.
> **La regla es la misma en los tres: se congela la PÁGINA, nunca la tabla.** Tres tablas siguen
> recibiendo escrituras de máquina — `Referentes propuestos` (la escribe el descubrimiento y la
> PATCHea la app), `Proyectos` (`criterios_aprendidos`/`advertencia_criterios`, ADR-033) y
> `Candidatos`/`Descartes` (el motor). Bloquear cualquiera de esas rompe algo vivo.
> **Y el aviso al equipo, que es la mitad que no es Airtable:** lo único peligroso de todo esto es
> **aprobar un sugerido desde Airtable** (detalle abajo, corte 2/4). El resto es inocuo pero inútil.

> 🟢 **EL CORTE 3/4 (Voces + Proyectos) ESTÁ EN PRODUCCIÓN — 2026-07-31.** Se corrió
> `npm run cortar:voces-proyectos` (3 voces · 6 proyectos idénticos a Airtable en los dos ámbitos ·
> los mismos 4 proyectos corriendo de los dos lados) y se mergeó a `main`. **No hubo migración**: a
> diferencia del corte 2/4, el schema `009` ya modelaba bien los dos dominios.
>
> **Verificado en prod tras el deploy:** `?ambito=motor` → **3 voces · 4 proyectos · 15 referentes ·
> 18 ajustes**, con la **N resuelta a 100** por el global y *Storytelling* con sus **5 referentes**
> (el que el modelo viejo dejaba en 0) · `?ambito=completo` → 6 proyectos, y los 2 de Trading con
> sus **862 y 1048 caracteres de `criterios_aprendidos` llegando desde Airtable**, que es ADR-033
> funcionando en vivo · fail-closed intacto (sin header 403 · ámbito con typo 400) ·
> `/curar/voces` responde y redirige a login sin sesión.
>
> 🟠 **Lo que queda, y es de Mani (2 min + el viaje a Airtable):**
> **El hecho-cuando:** apagar y volver a prender un proyecto desde `/curar/voces`, confirmar que la
> fachada lo refleja
> (`curl "$DASHBOARD_URL/api/engine/run-plan?ambito=motor" -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR"`)
> y que quedó su fila en `app.eventos` (`tipo = 'proyectos.editar'`, con anterior y nuevo). Es
> además la primera vez que alguien que no sea Claude entra a la pantalla.
>
> 🟠 **Y el paso de Airtable — que en este corte NO es "congelar y listo":**
> **Congelar las páginas *Voces* y *Proyectos*** (solo-lectura o `[ARCHIVO] …`). ⚠️ **Pero la tabla
> `Proyectos` sigue recibiendo escrituras de la máquina:** `Destilar criterios` del archivado le
> PATCHea `criterios_aprendidos` y `advertencia_criterios` cada domingo, y la app los lee de ahí
> hasta D7 ([ADR-033](../adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md)). O sea: se congela
> para **personas**, no se bloquea la tabla. Al equipo hay que decirle las dos cosas — que ya no se
> edita ahí, y que lo que vean cambiar solo no es un fantasma.

> 🟢 **EL CORTE 2/4 (Referentes) ESTÁ EN PRODUCCIÓN — 2026-07-31.** Los 3 pasos se ejecutaron en
> orden el mismo día: Mani borró en Airtable la fila `recYQotSNwtcfuY2x` (activa, 2 proyectos,
> **sin handle**: el motor la ignoraba gratis y el mapeo viejo la habría guardado como
> `"(sin handle)"`, que para el motor **sí** es handle válido ⇒ un pedido a Apify por corrida) ·
> aplicó la migración `012` · corrió `npm run cortar:referentes`. **La carga salió verde:**
> 15 referentes · **33 pares** · los 6 proyectos idénticos de los dos lados (**Storytelling con sus
> 5**, que es el que el modelo viejo dejaba en 0) · A/B de la fachada idéntico en los dos ámbitos.
> **Verificado en prod tras el merge:** `?ambito=motor` y `?ambito=completo` → **200**, 3 voces ·
> 4/6 proyectos · **15 referentes (33 pares)** · 18 ajustes.
>
> 🟠 **Lo que queda del corte, y es de Mani (Airtable + aviso al equipo):**
> 1. **Congelar 3 páginas** (solo-lectura o renombrar `[ARCHIVO] …`): **Referentes**,
>    **Referentes - Revisar/Flojos** y **Referentes - Sugeridos** (*Referentes Buscados*).
>    ⚠️ **Se congela la PÁGINA, no la tabla:** `Referentes propuestos` la sigue **escribiendo** el
>    descubrimiento y la **PATCHea** la app al aprobar; bloquear la tabla rompe las dos cosas.
>    *(Si las 2 de Ajustes —**Configuración Global** y **Ajustes Dev-Only**— siguen abiertas del
>    corte 1/4, van en el mismo viaje.)*
> 2. **Avisarle a Majo y Jero.** El [onboarding §5.3 y §8.1](../onboarding-equipo-redes.md) ya está
>    reescrito. **Lo que no puede faltar del aviso: aprobar un sugerido desde Airtable ahora es
>    dañino** — es la única de las páginas congeladas donde editar no es inocuo. Marcar `aprobado`
>    ahí dispara `POST Referentes (promoción)` del descubrimiento, que siembra la cuenta en la
>    tabla `Referentes` de Airtable, **que ya no lee nadie**: parecería aprobada y no traería un
>    solo video. La aprobación va en `Curar → Sugeridos`.
>
> **El hecho-cuando del corte** (2 min): apagar y volver a prender una cuenta desde
> `Curar → Referentes` y confirmar que la fachada lo refleja
> (`curl "$DASHBOARD_URL/api/engine/run-plan?ambito=motor" -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR"`)
> y que quedó su fila en `app.eventos` (`tipo = 'referentes.editar'`, con anterior y nuevo). Es
> además la primera vez que alguien entra a las pantallas nuevas: **no se pudieron probar en el
> browser** (entrar pide magic link).

> ✅✅ **LA 2ª CORRIDA DE FUEGO (dedup) SE CUMPLIÓ — 2026-07-31 19:18, y con eso los 3 hallazgos del
> cierre 70 están cerrados EN PRODUCCIÓN, no solo en el repo.** Re-import del motor hecho por Mani,
> corrida `on_demand` **`ok` en 9,4 min**. Los 4 criterios, todos:
> **`registro_dedup: ok`** ← *por primera vez desde que existe ADR-029* (H1: la memoria en serie
> entró) · **27 `processed_items` nuevas, las 27 con `run_id`** (H3; las 601 viejas siguen en null,
> total 628) · **intersección de `external_id` con la corrida de las 16:28 = ∅** · feed de 145
> candidatos con **0 `⚠️ SIN GUION`**, **145/145 con `external_id`** y **0 urls duplicadas**.
>
> **⏱️ Los 9,4 min contra los 31 de la corrida anterior NO son una corrida a medias: son la medida
> del dedup funcionando.** El embudo lo dice solo — mismos `colectados=280` y `asignados=635` que a
> las 16:28 (mismas cuentas, 3 h después, nada nuevo publicado), pero **`filtrados` cae de 361 a 35**.
> Ese escalón es `Heat-score v1`, que es donde vive el dedup: 456 de 491 se descartaron por estar ya
> en memoria. Y como lo que se transcribe es lo que sale de ahí, la fase cara pasó de 361 items a 35
> ⇒ el tiempo se desploma. **6 candidatos nuevos** (los que de verdad eran nuevos) sobre un feed que
> ya tenía 139. Si esta corrida hubiera durado 31 min y entregado ~139 otra vez, *eso* sí habría sido
> la alarma: querría decir que re-entregó lo mismo.
>
> 🟢 **CORTE 1/4 DE D5 (Ajustes) — DEPLOYADO Y VALIDADO POR ESTA MISMA CORRIDA.**
>
> ⚠️ **Y acá hay un aprendizaje de proceso que importa más que el corte:** el plan era pushear
> *después* de la corrida (regla "una corrida, una variable", cierre 69). **No pasó: el commit del
> flip ya estaba en `origin/main` 26 minutos antes de que la corrida arrancara** (reflog: `bd12a26`
> commiteado 18:51:24 UTC, en el remoto 18:52:03; corrida 19:18:16), y prod ya servía la forma de
> Postgres. **Quién empujó no está confirmado** —Claude no corrió `push`; lo más probable es que
> haya sido Mani sincronizando desde su editor mientras trabajaba en paralelo en el re-import— y
> tampoco hace falta saberlo para sacar la conclusión: **con Vercel deployando `main`, "commiteado
> pero sin publicar" no es un estado en el que se pueda confiar.** Si algo no debe estar vivo
> todavía, va en **rama**, no en `main`: la unidad de aislamiento es la rama, no el momento del push.
>
> **Lo bueno del accidente:** la corrida de las 19:18 corrió **con la fachada sirviendo los ajustes
> desde Postgres**, salió `ok`, y los 4 proyectos resolvieron `n_objetivo: 100` (que es
> `Candidatos por corrida` viajando por la fuente nueva). O sea el corte quedó **validado por una
> corrida real**, que era el hecho-cuando de la mitad-motor. Lo que falta del hecho-cuando es la
> mitad humana: editar una perilla desde el cockpit y verla llegar.
>
> 🟠 **2 pasos de Mani, YA EXIGIBLES (el deploy está hecho)** — hay que cerrarle la puerta vieja al equipo, porque hasta
> que se cierre hay dos superficies editables y una de las dos no la lee nadie:
> 1. **En Airtable: dejar las páginas *Configuración Global* y *Ajustes Dev-Only* en solo-lectura**
>    (o renombrarlas `[ARCHIVO] …`). El dato viejo se conserva; lo que importa es que nadie edite ahí
>    creyendo que aplica. **Avisarle a Majo y Jero** — el [onboarding §5.5](../onboarding-equipo-redes.md)
>    ya está reescrito con el cambio de lugar.
> 2. **El hecho-cuando del corte:** mover una perilla desde el cockpit y confirmar que la fachada la
>    devuelve —
>    `curl "$DASHBOARD_URL/api/engine/run-plan?ambito=motor" -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR"`
>    — y que quedó su fila en `app.eventos` (`tipo = 'ajustes.editar'`, con valor anterior y nuevo).
>
> **En Supabase no hay NADA que hacer para este corte** (la pregunta salió, queda escrita): la tabla
> `app.ajustes` existe desde la migración `009` —aplicada el 30/07— y sus 18 filas las cargó el
> import de sombra. El 31/07 se verificaron contra Airtable: **0 diferencias**. No hay SQL nuevo, no
> hay env var nueva, no hay credencial nueva. El corte es código, y el código ya está.
>
> ⚠️ **`sombra:import` ya NO toca `app.ajustes`** (salió del catálogo de `scripts/comun.ts`): con
> Postgres de dueño, un import pisaría en silencio lo que el equipo editó. Es el procedimiento para
> los 3 cortes que faltan, no un detalle de este.

> ✅ **El re-import del cierre 66 está HECHO** (confirmado por conducta, no por memoria): el cron del
> 27/07 **abortó** en `Leer procesados`, que es exactamente el camino fail-closed de ADR-029 — con el
> motor viejo (fail-open) el timeout se tragaba en silencio. ADR-029/030 están vivos.
>
> ✅ **RE-IMPORTS HECHOS el 2026-07-31 (cierre 70).** Los 3 workflows re-importados y el motor
> corriendo por la fachada: caen el re-import del fix del timeout (cierre 67) **y** el #1 de D4. La
> corrida de las 16:28 entregó **139 candidatos** en 31 min, `ok`. Detalle y los 5 fallos de config
> que hubo que destrabar antes: log del cierre 70.
> **Para el próximo re-import, el truco que ahorró horas:** un **POST con header inválido** al webhook
> distingue gratis y sin disparar nada — **404** = workflow inactivo o path equivocado ·
> **403 `Authorization data is wrong!`** = activo, path bien y credencial bien.
>
> ✅ **Corrida de fuego #2 (sin-guion + entrega): CUMPLIDA ENTERA por la corrida del 31/07.** **0**
> títulos `⚠️ SIN GUION` en el feed · `metricas.sin_guion` = **21 descartados** (>0, o sea ADR-030
> vivo) · los 4 proyectos con `razon_faltante: supply` y `tasa_gate` coherente.
> **✅ El último criterio también cerró (cierre 72): `transcripciones_vacias` = 21 sobre 191
> llamadas a Supadata = **11%**, contra el baseline de **41%** del 23/07.** El retry de ADR-030
> funciona y no hace falta el spike de actors por esta razón (el gatillo del 💤 Someday de más abajo
> era justamente "si las vacías siguen altas": no siguen). Salió del verificador, que ya calcula el
> cociente solo — `node Workflows/workflow-short-form-content/verificar-corrida.mjs`. *Ojo con el
> denominador: `llamadas.supadata` es una estimación del `Resumen del run`, así que el 11% es del
> mismo orden de precisión que el 41% con el que se compara — la caída es grande, la cifra exacta no.*
>
> ✅ **La corrida de fuego #1 (dedup) también está CUMPLIDA** (19:18 del 31/07, arriba). **Ya no
> queda ninguna corrida de fuego pendiente** — las dos cerraron el mismo día.
>
> 🟡 **Suelto, sin diagnosticar:** el run de **descubrimiento** del 27/07 14:00 UTC quedó `en_curso`
> sin cerrar (igual que el del motor, pero ese tiene causa conocida). Nadie lo miró.
>
> 🟡 **Decisiones de Mani que quedaron abiertas (cierre 66):**
> - **TikTok:** la rama TT corre en vacío (`apify_tt:1`, `[{}]`) porque hay **0 handles TT activos**. Se
>   dejó `buscar_referente_tiktok=1` a propósito (apagarlo deshabilitaría TT si el equipo suma handles).
>   Decidí: sembrar handles TT o apagar el toggle en `Config`. Es gasto de Apify menor pero constante.
> - **Watchdog vs cap_top_n=250:** el techo real de la transcripción es `N8N_RUNNERS_TASK_TIMEOUT`
>   (**900s en el pod**), no el presupuesto (840s, debajo a propósito). Con pool de 8 a ~27s/video, 250
>   videos ≈ 844s: entra justo. Para holgura (o si los videos son lentos), subí el watchdog en el pod o
>   la concurrencia. Si el presupuesto corta, lo no-transcrito ahora se **descarta** (ADR-030) = menos
>   entrega. No subir el presupuesto por encima de 900 (sería inútil: el watchdog mata primero).
> - **Spike Apify (Fase 6, opcional):** el paso 0 ya está resuelto — el actor IG `apify~instagram-scraper`
>   trae caption/duración/tipo confiables pero **NO** `hasAudio`, y `musicInfo` no discrimina las vacías
>   (39/41 usan audio original). Sin pre-filtro de sin-audio posible con este actor. Si querés comparar
>   actors, corré el spike de 1 tarde en la consola de Apify (criterios en el plan/ADR-030) — no es
>   migración, solo medición.
>
> 💤 **Someday (no urgente):** **revisar alternativas de actors en Apify si sigue flaqueando** — el
> transcript vacío / la calidad de scrape. Gatillo: si tras el retry de ADR-030 las vacías siguen altas
> o el supply queda corto de forma sostenida, correr el spike de arriba y evaluar migrar de actor (ADR
> aparte).

> ✅ **RESUELTO el 2026-07-31: la fachada responde 200 en prod.** Era el **valor** de
> `RUN_PLAN_HEADER_VALOR` en Vercel, que no coincidía con el del gestor (la env estaba presente: lo
> dijo el `motivo` del 403, que se agregó justo para no tener que adivinar entre "falta" y "está
> mal"). **En vez de cazar qué valor había, se rotó el par entero** — n8n todavía no consume la
> fachada, así que rotar salía gratis. **El header pasó a llamarse `X-Run-Plan-Auth`** (antes era
> `X-Motor-Auth`, igual que el del webhook: dos secretos con el mismo nombre era un pie de banco).
> **Verificado en prod:** `?ambito=motor` **200** (3 voces · 4 proyectos · 16 referentes · 18
> ajustes) · `?ambito=completo` **200** · sin header 403 · ambito con typo 400.
> **El par vive en:** `.env` de la raíz · `apps/dashboard/.env.local` · Vercel (Production) · la
> credencial **`Run Plan Header`** de n8n · el gestor. **`MOTOR_WEBHOOK_HEADER_*` NO se tocó**: sigue
> siendo `X-Motor-Auth`, es el del botón "Correr ahora", credencial **`Webhook Motor Header`**.
>
> ✅ **LOS 3 HALLAZGOS DEL CIERRE 70 ESTÁN ARREGLADOS EN EL REPO (cierre 71).** Lo que queda es
> **un re-import del motor y una corrida** — los detalles abajo. Qué cambió:
>
> **(1) La memoria del dedup dejó de ser una rama paralela: va EN SERIE.** `Heat-score v1 → Preparar
> procesados → POST processed_items → Transcribir`. Se descartó el fix propuesto (mover posiciones a
> x<4480): funciona, pero deja la garantía central de ADR-029 viviendo en dos coordenadas del canvas,
> o sea la próxima limpieza visual la rompe otra vez y en silencio. En serie es **topológica**.
> De arrastre, `POST processed_items` pasó a ser ancestro de `Resumen del run`, así que
> **`registro_dedup` revive** (deja de decir `no_corrio` siempre). Enmienda 2026-07-31 de ADR-029.
> **⚠️ La regla general, que sigue valiendo para cualquier cambio de ramas: el orden de ejecución lo
> decide la POSICIÓN EN EL CANVAS, no el JSON.** Reordenar el array no hace nada. Ahora hay un
> chequeo que lo caza solo: `node Workflows/auditar-workflows.mjs`.
>
> **(2) `ventana_corrida_min` = 60** en el repo (motor + archivado + manifest + `domain/corrida.ts` +
> las docs rezagadas). 45 se había elegido sobre un máximo medido de 23,2 min y la corrida del 31/07
> duró 31 (margen 1,45x). La ventana tiene que quedar **por encima de la corrida más larga posible**:
> debajo, el barredor mata una corrida en vuelo y el guard deja arrancar otra en paralelo.
>
> **(3) `processed_items.run_id`** lo escribe `Preparar procesados`, y viaja **`null` si el run no se
> pudo abrir** (es FK a `runs(id)`: un uuid de relleno reventaría el batch entero). 4 casos en
> `test-nodos.mjs`.
>
> ✅ **Pasos 1 y 2 (re-import del motor + placeholders + activar): HECHOS el 31/07** — la corrida de
> las 19:18 lo prueba por conducta (`registro_dedup: ok` no puede salir del JSON viejo).
> ⬜ **Paso 3, EL ÚNICO QUE SIGUE ABIERTO: archivado — `ventana_corrida_min` 120 → 60 a mano** en su
> `Config`. **No pide re-import** y por eso no vino de arrastre con el del motor. Es el barredor de
> zombies del archivado: con 120 tarda el doble en desbloquear una corrida que murió sin cerrar.
>
> 🟢 **RE-IMPORT #1 de D4 — listo en el repo, pasos exactos (cierre 69).** Va **después** del
> re-import del fix del timeout y de una corrida verde (decisión de Mani: separados). **Antes de
> tocar n8n: la env de Vercel** ya está arreglada (el bloqueante rojo cayó el 31/07, arriba) — confirmá con
> `curl "$DASHBOARD_URL/api/engine/run-plan?ambito=motor" -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR"`
> → tiene que dar **200**. Después:
> 1. **Credencial nueva en n8n:** tipo *Header Auth*, nombre **`Run Plan Header`**, con el par
>    `RUN_PLAN_HEADER_NOMBRE`/`_VALOR` **exacto** del gestor (distinto = 403 en silencio, misma
>    trampa de siempre).
> 2. **`<<DASHBOARD_URL>>`** en el nodo `Config` de **los 3** workflows (sin barra final:
>    el nodo concatena `/api/engine/run-plan`).
> 3. Re-importar los 3 (mismo path y mismo header del webhook del motor, regla de siempre).
> **Verificación en la ejecución:** `Leer plan (fachada)` con **1 ejecución / 1 item** y el mismo
> embudo de siempre. Si da 403/503, el run **aborta a propósito** — no es un bug, es el fail-closed
> de ADR-028: revisá la credencial y la env de Vercel, no le pongas `onError`.

> 🔴 **ROTAR EL `service_role` DE SUPABASE — sigue sin hacerse.** La rotación que pedía el cierre 57
> (PAT de Airtable + `service_role`) **sí se hizo el 2026-07-20** (cierre 64). Pero **el `service_role`
> se volvió a pegar en un chat el 2026-07-28** (cierre 67, para verificar si el run fallido había
> guardado IDs): tercera vez de la misma clase de exposición. **La key bypassa RLS: da acceso total a
> la base.** Rotar y actualizar la credencial `Supabase Registro` de n8n, la env de Vercel y el gestor.
> Si esto sigue repitiéndose, el fix no es rotar más rápido: es una key de solo-lectura aparte para
> diagnosticar, o el MCP de Supabase, en vez de pegar la `service_role` en el chat.
>
> 🟠 **Guard single-flight — sigue SIN prueba viva** (decisión de Mani, cierre 54; cero costo extra).
> Mientras una corrida esté **en ejecución** (n8n → Executions → running), abrí el motor y disparale un
> **Execute manual**. Esperado: la rama bloqueada muere en el NoOp **sin abrir run** (ninguna fila nueva
> en `runs`, cero gasto Apify) — el log dice que hay corrida viva. Si en cambio arranca una segunda
> corrida en paralelo, el guard no quedó vivo en el re-import → parar y revisar. *(La instrucción
> original lo ataba al cron del lunes 20/07; esa ventana pasó y la prueba nunca se hizo. El otro
> chequeo que iba pegado, `runs.trigger_type`, ya quedó confirmado: la corrida del 31/07 registró
> `on_demand` — log del cierre 70.)*

- 🟠 **Equipo (sobrevive la mudanza al cockpit propio — es dato, no herramienta):** sembrar 3–5
  referentes **TikTok** (bootstrap del eje TT: hoy la rama corre en vacío por 0 handles activos, ver la
  decisión de TikTok arriba) y aprobar los *Referentes propuestos* que el descubrimiento va dejando.

## Ciclo post-re-import — qué esperar (y qué NO es un fallo)

El re-import fue el **viernes 17/07**, entre el archivado del domingo y el motor del lunes. Como el
archivado computa la salud y los costos **leyendo `runs.metricas` del motor de los últimos 7 días**, el
primer ciclo sale **a medias por diseño**, no por un bug:

| Cuándo | Qué corre | Qué esperar |
|---|---|---|
| **dom 19/07 18:00** | archivado | ⚠️ **Parcial y está bien.** Solo ve runs del motor con código **viejo** (el motor nuevo aún no corrió) → `por_referente` y los contadores Apify vienen vacíos ⇒ **salud por referente sin poblar y costos Apify en $0**. Sí funcionan: `Métricas Proyectos` (calidad, sale de los calificados) y `Destilar criterios` (lee Airtable; necesita ≥4 calificados por proyecto — `min_muestra_destilar`). |
| **lun 20/07 08:00** | motor | 1ª corrida con código nuevo → `runs.metricas` completas (M1 + `apify_ig`/`apify_tt`). |
| **lun 20/07 09:00** | descubrimiento | 1ª con sus contadores Apify (`perfiles_semilla`/`detalle_sugeridos`/`lookalikes_tt`). |
| **dom 26/07 18:00** | archivado | ✅ **La primera fila de `Métricas Global` completa** (embudo + salud por referente + costos $ reales). Recién acá se juzga si el re-import salió bien. |

**No leas el domingo 19 como veredicto del re-import.** El primer ciclo end-to-end cierra el **26/07**.
*(Los 5 fixes de UI de Airtable siguen pendientes: sin publicar la página *Costos*, los costos existen
en la tabla pero no se ven.)*

## Tablero activo — refactor Voces→Proyectos

El detalle de cada componente y el "hecho cuando" viven en
[refactor-voces-proyectos.md](./refactor-voces-proyectos.md). Arranque (§5): **A.1 + A.2 juntos** primero
(de-riesgan el motor), después split.

| Componente | Qué | Carril | Estado |
|---|---|---|---|
| **A** Auditoría del pipeline vivo | mapa nodo/campo/página + reconciliar repo↔live + decisión §3 (ADR) | Dev 1 | ✅ **COMPLETO** — **A.5 cerrada (cierre 54): [ADR-025](../adr/ADR-025-cockpit-producto-propio.md)**, el cockpit migra a producto propio; Airtable interino curado al mínimo |
| **B** Dashboard / Cockpit | flujo del operador, racionalización de campos, Métricas/Costos | Dev 1 | 🔧 **B.4 ✅** · **B.2 ⛔ RETIRADA** (ADR-025: sin botón en Airtable free; disparo interino = Execute manual; la mitad n8n queda viva para el producto propio) · **B.6: guía ejecutable LISTA** (cierre 54: [mapa-campos §6](./mapa-campos.md) + checklist interactiva) — la ejecución es de Mani a mano (12 pasos; el paso *Descartes* espera records del lunes) · B.3/B.5 quedaron subsumidos en esa guía |
| **C** Motor de búsqueda | N por proyecto (ADR-024), `Voces.activo`, corte por proyecto, webhook single-flight (ADR-023) | Dev 2 | ✅ COMPLETO · **V-run ✅ (cierre 53)** · **spillover gap RESUELTO en el repo (cierre 54, enmienda ADR-024 + replay con outputs reales: TP 6→9)** — pendiente de **re-import** (con el paso de infra antes, §Pendiente vivo) · **guard single-flight: prueba viva el lunes 20/07** (instrucción en §Pendiente vivo) |
| **D** Archivado | confirmar que corridas por-proyecto no rompen Métricas/salud semanal | Dev 2 | ✅ **COMPLETO y VIVO** (cierres 48–49; re-importado el 2026-07-17, cierre 52): D.1/D.2 confirmados + matiz `runs_fallo`×`en_curso` + **D.3(b)** (→ `outputs.metadata`) + **D.4** (poda `tema`/`link_doc`) |
| **E** Capa de datos | `Voces.activo`, campos de disparo, racionalización | Dev 1 | ✅ **E.1 ✅** · **E.2 ✅ mitad-repo** (la mitad-Airtable murió con B.2/ADR-025) · **E.3 espera el diseño del producto propio** (ADR-025 §Toca: irá en sus propios ADRs) |

ADRs cerrados que gobiernan el refactor: [ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)
(disparo on-demand), [ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md) (N por proyecto).

## Para la próxima sesión — arrancá por acá

> ⚠️ **Esta sección viene del 17/07 y quedó MUY atrás** (habla del refactor de Voces→Proyectos, que
> terminó, y de Airtable, que murió en D7). Para saber qué sigue **hoy**, leé **§Pendiente vivo** y
> la **última entrada del log (cierre 76)**. Lo de abajo sirve como arqueología del refactor, no
> como lista de tareas — y varias de sus instrucciones (curar el cockpit de Airtable, congelar
> páginas) ya no aplican a nada.

> **Reescrito el 2026-07-17 (cierre 54). La sesión de auditoría completa del cierre 53 SE HIZO** — los 3
> frentes ①②③ están ejecutados en el repo (spillover, presupuesto de transcripción, ADR-025, guía de
> curado, onboarding). Lo que queda es **aplicación manual + verificación del ciclo**, y después arranca
> el producto propio.

**Lo manual de Mani (en orden):**
1. ~~Re-import del motor~~ ✅ **HECHO el 19/07** (los 3 workflows vivos, §Pendiente vivo).
2. **Lunes 20/07:** prueba viva del **guard** durante el cron de 08:00 (§Pendiente vivo) + verificar que
   el **descubrimiento** de 09:00 corrió bien post re-import (nunca se vio en vivo) + confirmar
   `runs.trigger_type` en Supabase.
4. **Curar el cockpit:** los 12 pasos de [mapa-campos §6](./mapa-campos.md) (checklist interactiva
   publicada como artifact "Curado del Cockpit"). **Ya hecho por MCP (cierre 56): todos los campos de
   las 9 tablas tienen description (el ⓘ)** — a mano queda visibilidad/permisos/filtros por página
   (spec campo a campo en **§6.2**) y el **helper text de cada elemento** (los 105 textos escritos en
   **§6.3**, copiables desde el artifact). El paso *Descartes* recién se puede después del lunes.
5. **Equipo (Majo/Jero):** vaciar el backlog de calificación (51 `nuevo` viejos) + sembrar 3–5
   referentes TikTok. El [onboarding](../onboarding-equipo-redes.md) ya está actualizado al refactor —
   compartirles la versión nueva.

**La verificación que cierra el ciclo:** el **26/07** (§Ciclo) — primera fila completa de `Métricas
Global` (embudo + salud por referente + costos $). Con el presupuesto nuevo, `sin_guion` debería
desplomarse vs. la corrida del 17/07 (6 de 16).

### 🟢 El cockpit propio (ADR-025): D0–D4 construidos, deployado y verificado en prod

Plan en [plan-cockpit-propio.md](./plan-cockpit-propio.md) (ADR-026..028). **App viva:**
https://pipeline-creacion-contenido.vercel.app (root `apps/dashboard`).

| Fase | Qué | Estado |
|---|---|---|
| **D0** Fundación | login magic link · 3 zonas con guardia por rol · migración `007` | ✅ código · ✅ infra · ✅ **login funcionando** (Resend SMTP + dominio `contact.retiagrowth.com`, cierre 65) · ✅ **equipo invitado**: `app.usuarios` tiene **5 filas** (Mani ×2, Alejandro `dev`, Jero `operador`, Alejo `operador`) |
| **D1** Operar | qué corre + ▶ Correr ahora + corridas recientes | ✅ código · env cargadas · ⏳ falta el hecho-cuando en vivo (Jero disparando una corrida real) |
| **D2** Entender | calidad/embudo/costos sobre migración `008` (3 vistas + tarifas) | ✅ código · migración aplicada · ✅ **devuelve datos desde el 29/07** (estuvo roto desde el día 1 por el grant faltante, cierre 68) |
| **D3** Sombra | migración `009` (schema `app` completo) + `sombra:import`/`sombra:diff` | ✅ **CORRIDO el 30/07 (cierre 69): espejo perfecto ×2** — voces 3 · proyectos 6 · referentes 16 · ajustes 18 · propuestos 8 (candidatos y descartes en 0 de los dos lados) · ⏳ falta **el 3er pase con una edición del equipo de por medio** (es de Mani, 2 min) |
| **D4** Fachada | `GET /api/engine/run-plan` (ADR-028), `?ambito=motor`/`completo` | ✅ mitad-app · ✅ **swap de nodos HECHO en los 3 `workflow.json` (cierre 69)**, verificado con replay A/B contra config real · ✅ **la fachada responde 200 en prod desde el 31/07** (par rotado, header ahora `X-Run-Plan-Auth`) · ✅ **re-import #1 HECHO y corrida real entera por la fachada** (cierre 70): hecho-cuando cerrado |
| **D5** Corte de config | dominio por dominio a Postgres, sin tocar n8n: Ajustes → Referentes → Voces+Proyectos | 🟢 **corte 3/4 (Voces + Proyectos) HECHO Y EN PROD (cierre 74)**: pantalla `/curar/voces` (voces con sus proyectos adentro) + flip + [ADR-033](../adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md) (un dueño por **campo**: `criterios_aprendidos`/`advertencia_criterios` siguen siendo de Airtable hasta D7, si no el loop de ADR-022 moría en silencio) · **sin migración** (el schema `009` ya modelaba bien los dos dominios, medido contra el dato vivo) · A/B contra la fachada de producción: **mismo plan, 0 diferencias** · carga verde y **verificado en prod**: `?ambito=motor` con 3 voces · 4 proyectos · N resuelta a 100 · *Storytelling* con sus 5 referentes, y los `criterios_aprendidos` llegando desde Airtable (ADR-033 vivo) · ⏳ faltan el **hecho-cuando** y el congelado de Airtable (§Pendiente vivo) · 🔧 **corte 2/4 (Referentes) HECHO Y EN PROD (cierre 73)**: pantallas `/curar/referentes` (con *A revisar* adentro) y `/curar/sugeridos` + flip + [ADR-032](../adr/ADR-032-referente-proyecto-es-n-a-n.md) (migración `012`: el vínculo con proyectos es N:M — el modelo de `009` tiraba 19 de 35 pares y apagaba *Storytelling*) · carga verde (15 referentes · **33 pares**, los 6 proyectos idénticos) y prod sirviéndolos · ⏳ faltan **congelar 3 páginas de Airtable + el aviso al equipo** (§Pendiente vivo) · 🔧 **corte 1/4 HECHO Y EN PROD (cierre 72): Ajustes.** Pantalla `/curar/ajustes` + la fachada sirve los 18 knobs desde `app.ajustes` · A/B Airtable↔fachada **0 diferencias** · ✅ **validado por la corrida real de las 19:18** (`ok`, `n_objetivo` resuelto por la fuente nueva) · ⏳ faltan **los 2 pasos manuales de Mani** (§Pendiente vivo) |
| **D6** Feed de calificación | el espacio de trabajo: mazo de tarjetas + auditoría de descartes + históricos | 🟢 **HECHO Y EN PROD (cierre 75).** 3 pantallas: `/curar/feed` (tarjetas compactas que se abren, agrupadas por proyecto y heat desc, filtro sin-calificar/🔥/aprobados/todos), `/curar/descartes` (el `veredicto` que **nunca se pudo marcar** — no era diseño, Airtable no deja configurar el permiso de un campo sin records en la página) y `/curar/historicos` (lo aprobado de todas las semanas, sobre `outputs`, de a 25). Gobernado por [ADR-034](../adr/ADR-034-calificar-es-un-solo-acto.md): **calificar es un solo acto y el Estado se deriva** · **NO es un corte** — Airtable sigue siendo el dueño de `Candidatos` y `Descartes` hasta D7, así que las 2 tablas **siguen** en el catálogo de sombra (al revés del procedimiento del corte 1/4) y no hubo migración ni re-import · verificado en vivo: escritura de los 2 campos + `app.eventos`, `veredicto` escrito por primera vez, paginado sin saltos, los 2 registros de prueba restaurados · ⏳ falta el **hecho-cuando** (una semana de calificación real) y congelar 2 páginas más de Airtable |
| **+ Transcribir** | 4ª zona: pegar enlaces → script literal + dedup, migraciones `010`/`011` ([ADR-031](../adr/ADR-031-transcriptor-a-pedido.md)) | ✅ código · ✅ migraciones aplicadas · ✅ la zona lee · ✅ **funciona end-to-end**: `app.transcripciones` tiene 2 filas `listo` con script (una del 30/07) + sus 2 `eventos`. ⚠️ *No se puede saber desde la base si eso corrió en prod o en local, así que **queda por confirmar que `SUPADATA_API_KEY`/`ANTHROPIC_API_KEY` estén en Vercel** (mismo viaje que el fix del header).* **Fuera de D0–D8**: pedido nuevo del equipo, no toca la migración de Airtable |

**Infra HECHA (cierres 63–64, Mani):** migraciones 007–009 corridas (9 tablas + 4 vistas) · `app`
en *Exposed schemas* · 2 usuarios en `app.usuarios` (cuentas de Mani; Majo/Jero en el beta) ·
deployado en Vercel con **las 8 env vars** (2 públicas + service_role + Airtable PAT/base + webhook
motor ×3 + run-plan ×2) · Site/Redirect URL de Auth. **Verificado por curl:** run-plan con header
devuelve la config real; sin header 403; ambito typo 400.

> ✅ **RESUELTO (cierre 65): el login por magic link funciona end-to-end con Resend SMTP.** Config:
> host `smtp.resend.com` · port 465 · username literal `resend` · password = API key `re_...` · Sender
> en el dominio verificado **`contact.retiagrowth.com`** (SPF/DKIM en el DNS de Squarespace de la
> agencia). **Gotchas del debug, para no repetirlos:** Resend exige dominio verificado (sin verificar
> solo entrega al mail dueño de la cuenta, rechaza el resto con 403 → Supabase 500); la cuenta Resend
> es de Daniel (su mail personal); 30x.com no se pudo usar (sin acceso a su DNS). El error
> real se diagnostica en **Supabase → Auth Logs** (500 = SMTP falló para invitado · 422 = mail no
> invitado, esperado), no en Vercel (salía `{}`). Detalle en el log del cierre 65.

**Lo que queda del cockpit, al 2026-08-01 (cierre 75).** D0–D4 y **D5 y D6 completos y en
producción**. El orden de acá en adelante:

1. ~~Publicar el corte 3/4~~ ✅ **hecho el 31/07.** Queda su hecho-cuando (2 min) y el congelado de
   *Voces* y *Proyectos* en Airtable, que en este corte tiene un matiz (ADR-033).
2. ~~Corte 4/4~~ ✅ **CONFIRMADO CON MANI: no existe.** La numeración salió de contar Voces y
   Proyectos por separado, pero van juntos por FK. Con Ajustes, Referentes, Voces y Proyectos
   adentro, **D5 está completo** — verificable en `lib/config.ts`, donde los 4 dominios salen de
   Postgres. Lo que queda en Airtable son las 3 tablas que **escribe n8n**, y eso es D7.
3. ~~D6 — el feed de calificación~~ ✅ **hecho el 01/08 y en prod** (fila D6 de la tabla de arriba).
   Queda su hecho-cuando, que es el único que no se puede apurar: **una semana entera de
   calificación pasando por la app**.
4. ~~D7 — corte de escritura~~ ✅ **HECHO Y EN PROD el 01/08** (cierres 76 y 77): Airtable salió del
   sistema, `grep -c api.airtable.com Workflows/*/workflow.json` da `0 0 0`, y el paso 3 del
   expand/contract cerró (el `id` del contrato es el uuid). Mató las 3 llamadas que le quedaban a
   Airtable en la app y la traducción de ids (ADR-033, que murió cumplida).
5. **D8 — apagado de Airtable + la poda del schema.** 📐 **Decidido y escrito el 2026-08-05:
   [ADR-059](../adr/ADR-059-lo-que-no-se-usa-no-existe.md).** La balde 2 resultó ser **5 vistas y
   12 columnas** (no las "4 y 6" que este doc recordaba) más las 6 `airtable_id`; el inventario
   completo vive en
   [plan-cockpit-propio §D8](./plan-cockpit-propio.md#la-balde-2--el-inventario-medido-el-2026-08-05).
   Manda el consumo de código, con dos excepciones: **`clients.parent_id` se queda** (ADR-051 §4 le
   dio trabajo nuevo) y **`runs.costo_estimado` se va con su línea del contrato**.
   - ✅ **[`022`](../../core/schema/022_poda_balde_2.sql) APLICADA por Mani el 05/08 y verificada
     por su efecto** (PostgREST: las 5 vistas fuera, las 3 columnas fuera, **cero `airtable_id`**,
     las 6 vistas de `app.` intactas, `parent_id` en su lugar). Prod después: `/` 307 · `/login`
     200 · `run-plan` 403 sin header y **`version: 2`** con header. Y el dedup, medido con
     `verificar-corrida.mjs`: **intersección 0 entre las 2 últimas corridas**.
   - 🟡 **[`023`](../../core/schema/023_poda_write_only.sql) ESCRITA, con su gate `§0` sin firmar.**
     **5 columnas, no 7**: `processed_items.url`/`.seguidores`/`.flag_viral`/`.idioma` +
     `outputs.source_items` + `transcripciones.pedido_por`. 🔎 **`run_id` y `primera_vez` salieron de
     la lista**: las lee `verificar-corrida.mjs` (la herramienta que verifica el dedup) y
     `test-nodos.mjs` tiene 4 asserts sobre `run_id`. *Tercera vez que el método sub-cuenta
     consumidores: el corpus no incluía los `.mjs` de herramientas.*
     ✅ **El lado "dejar de escribir" YA SALIÓ el 05/08**: `Preparar procesados` y `Armar filas
     archivado` empujados con `n8n:push` (`n8n:diff` limpio en los 5), y `lib/transcripciones.ts`
     va en el deploy de Vercel de este commit. **Falta ver correr una corrida del motor y un
     archivado, y firmar el gate.**
     🩸 **El orden no es estética:** PostgREST rechaza el insert entero con `PGRST204` y los dos POST
     son `onError: continue` ⇒ el 400 se traga, el motor cierra en verde **sin memoria de dedup**
     (⇒ duplicados re-pagados) y el archivado **borra calificados sin archivarlos**. Hay un guard
     nuevo en `test-nodos.mjs` que se pone rojo si alguien devuelve una columna al batch del dedup.
   ✅ **LA COLA DEL RE-IMPORT QUEDÓ VACÍA.** `fields.uuid` y los tres `uuidDe` ya habían muerto con el
   contrato v2 (ADR-048 §5) y **el Sheet salió el 05/08**: [ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md)
   cerrada entera. El archivado quedó en **17 nodos** y con ella se fue **la última dependencia de
   Google del pipeline** (credencial OAuth, consent screen y su runbook).
   🔑 **Cómo se hizo, porque es el patrón para la próxima topología:** los 3 nodos se borraron **a
   mano en el editor de n8n** y se reconectó `Registrar outputs` → `Preparar borrado candidatos`;
   los dos cambios de `parameters` (`Config` sin `sheet_id`/`sheet_tab`, `Armar filas archivado` sin
   la fila del Sheet) fueron por `n8n:push`. **NO fue un re-import**: importar crea un workflow con
   id NUEVO y se lleva el webhook, el target del dispatcher, el `errorWorkflow` y la activación.
   Total: 3 clics + un push, con `n8n:diff` limpio en los 5 después.
   🟡 **Y quedó claro que el re-import ya no es un límite técnico.** `PUT` reemplaza el array `nodes`
   entero, así que borrar nodos por API se puede: el que se niega es **nuestro** `n8n:push`, porque
   *"un push que crea nodos también puede borrarlos"* y falta la red de seguridad. Escrito para
   retomarlo en [plan-multi-tenant §14.2](./plan-multi-tenant.md) — ahora sin nada esperándolo.
   ✅ **"Nada de Airtable" — HECHO en el repo el 05/08** (pedido de Mani). Borrados
   `core/scripts/setup-airtable.mjs`, `core/contracts/airtable-cockpit.md` (sin reemplazo a
   propósito: **el modelo vivo son las migraciones**) y `apps/dashboard/scripts/cortar-feed.ts` con
   su npm script. `verificar-corrida.mjs` **volvió a correr entero**: su bloque del feed lee
   `app.candidatos` por PostgREST en vez de `api.airtable.com`. Menciones: README **1→0**,
   one-pager **2→0**, onboarding **18→2** (las 2 son el aviso de que ya no existe), PLAN **15→4**,
   ROADMAP **29→14**, CLAUDE.md reescrito. Lo que queda es **historia** (items `[x]`, nombres de
   archivo de ADRs, el porqué de decisiones viejas) y se deja a propósito.
   🔌 **La cuenta de Airtable quedó DESCONECTADA (Mani, 05/08): no se cancela, simplemente no se
   usa más.** No hay nada que hacer ahí.
   🎯 **Y el export final NO hacía falta** — era el último bloqueante.
   `Métricas Proyectos` y `Métricas Global` eran **proyección derivada y regenerable** (lo decía el
   propio contrato congelado): las 4 vistas de `app.` las reconstruyen desde `runs.metricas` +
   `outputs`, **desde el 2026-06-29** — más historia que la que esas tablas tuvieron (se partieron
   el 15/07). Verificado vista por vista contra prod. **Cancelar Airtable no pierde nada.**
6. **D7.5 (alternativa a D8, sin orden fijo):** que la app escriba `outputs` al calificar, para
   matar el archivado. Es enmienda de ADR-014 y toca `core/`: va con `/grill-with-docs`.

**Las 2 decisiones abiertas se CERRARON el 2026-07-16 (cierre 49, consultadas a Mani):**
el **descubrimiento NO respeta `Voces.activo` a propósito** (despensa para voces pausadas —
documentado en el plan §Descubrimiento y el README del descubrimiento para que nadie lo "arregle") ·
**`notas_equipo` + `viral_por_tamano` van a `outputs.metadata`** (D.3 salida (b); la (a) — que entren
al destilado — se decidirá con el corpus que (b) acumula).

*(Cerrada antes, mismo día: los 2 proyectos con 2 voces — **1 proyecto = 1 voz** es regla firme, dato ya
limpio. Sigue abierto, aparte: si un **referente** puede cruzar voces — [mapa-campos §2.5](./mapa-campos.md).)*

**Contexto que ahorra media hora de re-derivar:**
- **El arranque del motor cambió (C.3):** `Config → Barrer runs zombie → Leer corridas vivas → Guard
  single-flight → Abrir run`. El guard aplica a los 3 triggers; vivo/zombie lo decide
  `ventana_corrida_min` (Config, **60** desde el 31/07). No "arregles" el orden del barrido: que corra
  antes del guard es lo que evita que un zombie trabe el motor. Y la ventana tiene que quedar **por
  encima** de la corrida más larga posible: si queda debajo, el barredor mata una corrida en vuelo y
  el guard deja arrancar otra en paralelo.
- 🚨 **Antes de aflojar cualquier techo del motor, preguntá si POSTERGA o si QUEMA** (ADR-044). El
  corte de `cap_top_n` pasa dentro de `Heat-score v1`, **antes** de `POST processed_items`: lo capado
  vuelve la corrida siguiente. Los presupuestos de tiempo de `Transcribir` corren **después** de ese
  POST: lo que se quedan afuera ya está en la memoria de dedup y se pierde para siempre. Desde la
  pantalla de Ajustes los dos se ven igual.
- **No leas el costo de un nodo por su nombre.** `Traducir (Claude Haiku)` decía "Haiku" y se leía
  como barato; era el nodo más lento del motor y el único sin presupuesto, porque lo caro no era la
  llamada sino el `sleep(1000)` × 170 videos. El costo de un Code node es *llamadas × latencia ×
  serialidad*, y eso solo se ve leyendo el loop.
- El mapa de la superficie ya está completo: **[mapa-campos.md](./mapa-campos.md)** (§4 campos, §5 páginas).
  **No re-derives nada de ahí** — y leé §1 antes de grepear: el grep de campos **no sirve** en este repo.
- Hay **tests** del motor ahora: `test-nodos.mjs`. Si tocás `Armar plan` o `Armar candidato`, corrélos.
- **Un campo nuevo + un filtro nuevo = poblar el dato antes** (casi dejamos el motor en cero; cierre 46).
- **Un `httpRequest` de n8n corre una vez POR ITEM** (cierre 67). Después del fan-out entran cientos,
  así que todo lookup **de corrida** va `executeOnce` o dispara cientos de requests idénticos y muere
  por timeout. Vale para cualquier nodo HTTP nuevo, no solo los del dedup. Y el corolario que costó
  caro: **un fallo tragado por `onError` no desaparece, se convierte en datos malos** — este mismo
  timeout, cuando era fail-open, produjo los 15 duplicados del 20→21/07.
- El **primer ciclo completo post-re-import cierra el 26/07** (§Ciclo): el archivado del 19/07 sale
  parcial **por diseño**. No lo leas como veredicto.

## Log de avance (más reciente arriba)

**2026-08-06 (cierre 98) — El feed pagina, y el 71% de su payload eran tres campos que nadie dibujaba (Claude, con Alejo).**
**Qué se hizo:** el **#7 de [plan-multi-tenant §12](./plan-multi-tenant.md)**, el último item numerado antes de LinkedIn. La pantalla del feed pasó de **~405 KB a ~16 KB** por carga.

**🔬 El diagnóstico del plan estaba a medias, y medirlo antes de escribir código lo partió en dos.** §10 decía *"el feed carga sin paginación"*, o sea un problema de **cuántas filas**. Medido contra las 165 de prod: el payload eran 337 KB y **`script` solo era 207 de esos** — más `relevancia_razon` (30) y `notas_equipo` (3,3) = **240 KB, el 71%, en tres campos que la tarjeta CERRADA no dibuja**. El propio `tarjeta.tsx` ya lo decía en un comentario desde D6 (*"el script se lee solo cuando el título no alcanza"*) y aun así viajaban los 165. *El problema no era solo cuántas filas: era qué traía cada una.*

**⚖️ Dónde se trazó la línea, y por qué no en el lugar obvio.** Se fueron **solo los tres textos largos**; **todos los escalares se quedan** en la fila (voz, idioma, likes, seguidores, engagement, url, relevancia_score). Medido: entre todos suman ~15 KB, así que sacarlos no compraba nada y le habría costado al modal mostrar un spinner para su propio encabezado. Así el detalle pinta badges y subtítulo al instante y lo único que espera es la prosa.

**🩸 Keyset y no `offset`, y no por gusto — probado contra prod sin escribir una fila.** Con el filtro *Sin calificar* activo, **cada tarjeta que alguien califica sale del conjunto filtrado**. Simulando 3 calificaciones (excluyéndolas por id, read-only): `offset 25` devolvió las posiciones 29–31 ⇒ **se salteó exactamente 3 candidatos que nadie habría visto nunca**; el keyset devolvió las 26–28. `historicos` puede usar offset porque ahí no se edita nada. Verificado además que keyset(25+25) es **idéntico** a un `limit 50` corrido: intersección 0, sin huecos.

**🧹 Y el congelado de `visibles` quedó sin trabajo, así que se borró.** Era el `Set` que impedía que una tarjeta desapareciera de abajo del cursor al calificarla (plan-cockpit §D6.4) — la protección contra el misclick irrecuperable. Con el filtro **en la query**, `cargados` solo cambia cuando se le pide algo al server, y calificar no le pide nada: **la regla dejó de depender de mantener un `Set` sincronizado y pasó a ser estructural**. Queda escrito en `mazo.tsx` con su condición: *si el filtro vuelve al cliente, el congelado tiene que volver con él*.

**⚠️ Lo que el cambio creó y hubo que cerrar en el mismo movimiento: el filtro pasó a tener DOS expresiones** — `pasaFiltro` en memoria (la usan los contadores) y la condición de PostgREST. Es la forma exacta del bug que el archivado pagó en el cierre 93 (el `IF` y el code node discrepando sobre la forma del dato). Quedaron declaradas juntas en un `Record<Filtro, …>` exhaustivo: **agregar un filtro no compila** hasta decidir los dos lados.

**➕ De regalo, la misma familia en la misma pantalla:** la página cargaba `leerDescartes()` **entero** —los 38 con sus scripts, **77 KB**— para terminar en un `.filter().length`. Ahora es un `head` count.

**🔎 Los contadores de los chips siguen siendo el avance real** (no el tamaño de la página): 4 `head` counts sobre la tabla entera + los deltas de la sesión, cada uno desde la calificación **original** de la fila, así que re-clickear tres emojis vale un solo delta y el ajuste sobrevive a un cambio de filtro.

**Verde:** `typecheck` · **185 tests** (+10) · `build` · `validate` 2053 checks. Contra prod: los 4 contadores dan 165/0/0/165, y los filtros de emoji se verificaron contra `outputs` —donde sí hay datos— porque **en `candidatos` el 0 no distinguía "filtro correcto" de "filtro que no matchea"**: `eq.🔥`→12 y `in.(🔥,👍)`→36 = 12+24, que es el reparto real.
**Qué quedó a medias:** ⏳ **nadie hizo clic.** Está verificado a nivel query contra prod y de unidad, pero la pantalla no se abrió — hace falta un login por magic link. Mismo hueco que arrastra el botón *Descargar CSV*.

---

**Y la misma sesión siguió con dos cosas más: el `.env` y el arranque de la Fase 5.**

**🔴 El `.env` guardaba la API key de Anthropic FILTRADA Y REVOCADA.** Da 401 (*"API key is invalid"*), y comparada por hash contra el commit `d98d45a` es **exactamente la que se filtró** y que el cierre 93 dio por revocada. O sea que este archivo venía guardando la key quemada. **El pipeline NO está roto:** los 3 workflows del live traen otra key, la misma en los tres, verificada con un 200 — lo desactualizado es solo la copia local, así que hoy no se puede probar un prompt de Claude fuera de n8n. *Y esto corrige el cierre 93, que dice que las del live "coinciden con el `.env`": ya no.* 🔒 Copiar la key viva al archivo lo **bloqueó el guard del entorno**, y se dejó así a propósito: la línea quedó marcada con el diagnóstico y el paso para que lo haga un humano.

**✅ Lo que sí se arregló del `.env`:** faltaban las **5 `N8N_WF_*`** (`N8N_API_KEY` **sí estaba** — el error del script engañaba). Se sacaron de la API: la instancia tiene **61 workflows y solo 5 activos**, emparejados **100% por conjunto de nombres de nodo** contra los `workflow.json`, con 5 ids distintos, y después **`n8n:diff` verde en los 5** — que es la segunda vía que descarta un mapeo cruzado (un alias mal apuntado haría que `n8n:push --apply` escriba los parameters de un workflow en otro). *Ahora `n8n:diff` corre desde la máquina de Alejo.* Se podaron además `AIRTABLE_*` y `GOOGLE_SHEET_*` (medido: no los lee nadie) y se corrigieron 4 comentarios que mentían.

**🚀 Fase 5 (§12 #9) ARRANCÓ — la primera pantalla de LinkedIn + sus policies.**
- **[`024_rls_linkedin.sql`](../../core/schema/024_rls_linkedin.sql) APLICADA por Alejo el 06/08 y verificada por su EFECTO**: `pg_policies` da las **4 filas**, todas `tenant` y todas con **`instancias_visibles`** (grano instancia — el error fácil era copiar el `clientes_visibles` de su hermana de reels). Como el SQL Editor corre el script como una unidad, que las policies existan prueba que las guardas del `§0` y los `grant` del `§1` pasaron. ⚠️ **No tuvo la red que tuvo la `021`**: aquella no cambiaba nada porque el BFF leía con `service_role`; con el flip en prod, estas se evalúan desde que entran. 🔧 **La `024` sí se puede re-correr** (`drop policy if exists` antes de cada `create`), al revés que la `021` — Postgres no tiene `create or replace policy` y un segundo intento moría con `42710`, justo cuando uno duda de si el primero pasó, que es la duda que dejó la `019`.
- **Pantalla de Referentes**: `domain/linkedin.ts` (+17 tests), `lib/referentes-linkedin.ts`, `actions-linkedin.ts`, `pantalla-linkedin.tsx`, y `curar/referentes/page.tsx` **ramificando por `cockpit.workflowId`**. Las 4 tablas entraron al mapa `TABLAS` de `scoped.ts`.
- 🔑 **Dónde va el ramificado, que era la decisión de diseño:** en la **página**, no en `lib/`. `TenantContext` **no lleva el pipeline** y se dejó así — es de tenancy, y de quién es un dato no depende de qué pipeline lo produjo; meterlo ahí obligaba a las ~60 funciones de `lib/` a recibirlo para que dos lo usaran. `exigirTenant` ya devuelve el `cockpit` con su `workflowId`.
- 🩸 **Hallazgo:** los cockpits de LinkedIn **ya eran alcanzables** (2 de 3 `active`, y hay una cuenta con membresía en 30X y EstadoX desde el 05/08) y su zona `curar` dibujaba **las 7 tarjetas de reels**, seis de ellas apuntando a pantallas que devuelven vacío sin fallar. ADR-056 resolvió el nav **por zona** y nadie miró un nivel más abajo. El índice ahora es por pipeline y **lista lo que existe**.
- ✅ **La media deuda que eso dejó, cerrada el mismo día:** `exigirPantallaDeCurar` (`lib/auth.ts`). Escribir la URL a mano entraba igual, porque la guardia de `exigirTenant` es por ZONA y `curar` existe en los dos pipelines. Las 7 páginas preguntan ahora por SU pantalla y el que no corresponde cae al índice de `curar`, no a la raíz (no es un problema de permisos: esa pantalla no existe en ese pipeline). 🔑 **Y la lista quedó UNA**: `PANTALLAS_CURAR` + `CURAR_POR_PIPELINE` en `domain/pipelines.ts`, el índice **deriva** sus tarjetas de ahí y la guardia pregunta a lo mismo — el primer arreglo había dejado dos listas libres de divergir, con el peor síntoma posible (una tarjeta que lleva a un redirect).
- 🔎 **Y la rama `capa-2-flip-scoped` se revisó: no tiene nada que rescatar.** Su commit de LinkedIn son 33 líneas de doc **idénticas a la §14.6 de `main`** salvo una palabra del título; su `app/sonda/page.tsx` está estampado *"NO MERGEAR"*; y la rama está atrás (sin `022`, `023`, ADR-059, la salida del Sheet ni la paginación). Mergearla sería una regresión.

**Verde al cierre:** `typecheck` · **207 tests** (+32 en el día) · `build` · `validate` **2062 checks** · **`n8n:diff` limpio en los 5**.
**Qué sigue:** la **prueba de §14.6 con filas** (#6 del Pendiente vivo, escrita entera ahí) + el **check #1 contra prod** (#7) → el gate de la **`023`**, que sigue esperando corridas (última en la base: **04/08 21:12**; la mitad de escritura salió el 05/08, así que **ninguna corrida ejerció el código nuevo**: archivado el domingo, motor el lunes) → seguir la Fase 5 por candidatos/voces, el workflow en n8n y su cron → `core/templates/` + los runbooks `agregar-workflow.md`/`agregar-cliente.md`, que F5 pidió siempre y nunca se escribieron (y son la auditoría honesta de todo esto: *"si algún paso de la guía exige modificar el núcleo, el diseño no está listo"*).

**2026-08-05 (cierre 97) — La balde 2 medida y podada, y Airtable fuera del repo hasta la última mención (Claude, con Mani).**
**Qué se hizo:** el inventario que D7 apartó y nunca listó, la sesión de grilling que lo decidió (**[ADR-059](../adr/ADR-059-lo-que-no-se-usa-no-existe.md)**), la **`022` aplicada y verificada por su efecto**, la **`023` escrita y gateada** con su mitad de escritura ya en el live, y la purga de Airtable del repo entero.

**🩸 El inventario dijo "5 vistas y 12 columnas" donde el recuerdo decía "4 y 6" — y casi nada era huérfano.** De las 5 vistas, **4 tenían dueño escrito**: ADR-019 §4 conserva `v_senal_tema` *a propósito* y **descartó por escrito esta misma migración**; ADR-009 tenía `v_corpus_aprobados` "en pausa"; `v_historico_seleccionados`/`v_selecciones_por_dia` son criterio de aceptación del ROADMAP §C3. Y 2 columnas estaban declaradas en `ingesta-registro.md`. *Medir el código no alcanzaba: había que medirlo contra las decisiones.*

**🔬 El método sub-contó consumidores TRES veces, y las tres por el mismo hueco.** (1) `v_outputs_recientes` figuraba huérfana y su consumidor era **§Verificación de un contrato**: un humano en el SQL Editor, invisible a grep. (2) Lo mismo, más barato, con las otras tres vistas y sus ADRs. (3) `processed_items.run_id` y `primera_vez` figuraban write-only y las lee **`verificar-corrida.mjs`**, justo la herramienta que prueba que el dedup no trae duplicados — el corpus medía `apps/dashboard` y los `workflow.json` y dejaba afuera los `.mjs`. **La regla que queda: un objeto también está vivo si lo cita un runbook o una herramienta del repo.**

**⚖️ La decisión de Mani fue "manda el consumo de código"** — *"no aporta tener cableados muertos, o que cambiaron y ya no son así"* — con dos excepciones decididas de frente: **`clients.parent_id` se queda** (ADR-051 §4 le dio trabajo nuevo hace tres días, y es del modelo de tenancy que se está construyendo) y **`runs.costo_estimado` se va con su línea del contrato**, porque el costo de este sistema **se calcula** (`metricas × tarifas` → `v_costos_semana`), no se guarda.

**🚨 Y el hallazgo que partió la poda en dos: dropear una columna write-only NO es gratis.** Medido: **PostgREST rechaza el insert entero con `PGRST204`** si el body trae una columna inexistente. Y los dos POST que las mandaban son **`onError: continueRegularOutput`**, así que el 400 **se traga**: el motor cerraría **en verde sin escribir la memoria del dedup** (⇒ la corrida siguiente re-trae y re-paga: los 15 duplicados del 20→21/07 otra vez) y el archivado cerraría **en verde habiendo borrado los calificados sin archivarlos**. De ahí: **`022` = lo que nadie escribe** (corre sola) y **`023` = lo que alguien escribe**, después del push, con gate humano.

**✅ La `022` se aplicó y se verificó por su EFECTO, no porque corriera** (la lección de la `019`): 5 vistas fuera, 3 columnas fuera, **cero `airtable_id` en toda la base**, las 6 vistas de `app.` intactas, `parent_id` en su lugar. Prod después: `/` 307 · `/login` 200 · `run-plan` **`version: 2`**. Y el invariante que Mani puso como condición, medido: **intersección 0** entre las 2 últimas corridas.

**🧹 Airtable salió del repo, no solo del sistema.** Borrados `setup-airtable.mjs`, `core/contracts/airtable-cockpit.md` (**sin reemplazo a propósito: el modelo vivo son las migraciones, no una prosa que las describa**) y `scripts/cortar-feed.ts`. **`verificar-corrida.mjs` volvió a correr entero** — estaba medio muerto desde D7 porque su bloque del feed pegaba a `api.airtable.com`; ahora lee `app.candidatos` y el reparto sale con nombres de proyecto. Menciones: README 1→0 · one-pager 2→0 · **onboarding 18→2** (§2 pasó de *"Airtable, donde viven el 95% del tiempo"* a las 4 zonas del cockpit) · PLAN 15→4 · ROADMAP 29→14. Lo que queda es historia y se deja.

**🎯 Y el export final —el último bloqueante para apagar Airtable— no hacía falta.** `Métricas Proyectos` y `Métricas Global` eran *"proyección derivada y regenerable"* según el propio contrato congelado: las 4 vistas de `app.` las reconstruyen desde `runs.metricas` + `outputs` **y cubren desde el 2026-06-29**, más historia que la que esas tablas tuvieron. *Lo que parecía el único dato irrecuperable era una caché de algo que el sistema ya sabe calcular.* La cuenta queda **desconectada, no cancelada** (decisión de Mani).

**🔻 Y al final de la sesión salió el Sheet, con lo que ADR-057 quedó cerrada entera.** Los 3 nodos se borraron **a mano en el editor** (Mani) y los 2 cambios de `parameters` por `n8n:push`. El archivado quedó en **17 nodos**, sin una sola dependencia de Google, y **la cola del re-import quedó vacía**. 🩸 *Lo que se fue con el Sheet y hay que tener presente: el append NO era continue-on-fail a propósito —si fallaba, cortaba antes de borrar los candidatos—, así que era la red que protegía la curación. Hoy el único escritor del histórico sí es continue-on-fail y tiene el borrado aguas abajo: es exactamente el modo de falla que gatea la `023`.*

**Verde:** `typecheck` 0 · **175 tests** (+1: el guard de la `023`) · `build` · `validate` **2053 checks** · `auditar-workflows` sin hallazgos · `test-nodos` verde · **`n8n:diff` limpio en los 5**.
**Qué sigue:** ver correr un motor y un archivado → firmar el gate de la **`023`** → paginación del feed (§12 #7) → **Fase 5, LinkedIn**, que arranca por §14.6 (sus 4 tablas sin policy). Sin apuro: la red de seguridad de topología en `n8n-sync` ([§14.2](./plan-multi-tenant.md)) — ya no hay nada esperándola.
**Skills sugeridas:** `/diagnose` si la corrida del lunes cierra verde pero `verificar-corrida.mjs` cae a la ventana de `primera_vez` · `/grill-with-docs` antes de tocar la topología por API.


**2026-08-05 (cierre 96) — El mismo flip, hecho dos veces el mismo día: lo que sobró se tiró y lo que faltaba se escribió (Claude, pedido de Mani).**
**Qué se hizo:** una sesión que arrancó a construir el flip de la Capa 2, lo construyó entero y verificado, y al ir a mergear **descubrió que ya estaba en `main`** hecho por Alejandro. Se descartó el código duplicado y se quedó lo que la otra sesión no tenía: **[ADR-058](../adr/ADR-058-el-flip-de-la-capa-2.md)**, el hallazgo de LinkedIn sin policies (§14.6 del plan), dos términos de glosario, la enmienda a ADR-047, seis comentarios que el flip volvió falsos, y **el operador entrando a Entender**.

**🩸 El hallazgo que reencuadró la sesión entera, y salió de medir en vez de leer.** El plan §0, el handoff y `CLAUDE.md` daban **5 usuarios y 5 membresías, todas de Retia**. Medido contra prod: **6 usuarios, 7 membresías en 3 empresas**, una persona **no dueña con membresía en dos** (la primera del sistema) y **una voz de `30x`**. O sea que **el disparador de la Capa 2 escrito en ADR-047 —*"antes de que un segundo cliente real tenga usuarios en producción"*— ya se había cruzado y nadie lo había anotado.** El segundo cockpit no estaba dado de alta: estaba **en uso**. *Es la tercera vez este mes que el estado real solo aparece midiendo, y la segunda en que un doc daba por cierto lo contrario.*

**⚠️ Y el flip se hizo DOS VECES, por dos sesiones que no se vieron.** Las dos llegaron al mismo diseño: mismo campo `origen`, mismos dos valores, mismos dos constructores, mismas mediciones de la fachada. **Que converjan no valida el diseño — mide que estaba forzado por la forma del código.** La lección accionable no es "coordinar mejor": es que **el ADR escrito antes de construir habría ahorrado el día**, que es exactamente lo que el repo ya manda (*`core/` solo cambia con ADR*) y lo que las dos sesiones saltearon. Quedó escrito en el propio ADR-058, no solo acá.

**📐 ADR-058 cierra el item #3 que el cierre 95 dejó abierto.** Registra tres cosas que el código no explica: por qué la autoridad va en el `TenantContext` y no en un parámetro (**elegir mal entre dos funciones sueltas es silencioso justo en la dirección peligrosa** — declarar `"fachada"` en una pantalla saltea RLS sin romper nada, ningún test se pone rojo); por qué **no se aplicó** la regla de ADR-047 al cumplirse su disparador (se escribió cuando retrasar el segundo cockpit costaba cero, y para cuando llegó costaba sacarle la herramienta a alguien que la usaba); y por qué `lib/tenant.ts` se queda en `service_role`, con el selector en Capa 1 sola.

**🩸 Las 4 tablas de LinkedIn no tienen policy, y lo interesante es por qué no se vio** (§14.6). La `020` las crea con RLS enabled y cero policies, apoyada en que la Capa 2 las cubriría (*"nacen del lado correcto del disparador y NO hay que acordarse de volver"*); la `021` **no las nombra ni una vez**. El check #1 de la propia `021` es exactamente el que lo caza y dio *"cero filas, sin excepciones"* — porque corrió en Docker sobre `001→018` + `021`, **sin la `020` en el medio**. *El agujero no estaba en la verificación sino en el corpus sobre el que se corrió.* Falla cerrado y hoy nada las lee; muerde en la Fase 5, disfrazado de *"todavía no hay datos"*.

**🧹 Seis comentarios que el flip volvió falsos, y dos eran peores que los otros cuatro.** Cuatro cabeceras de `lib/` seguían diciendo *"con service_role — `app.*` tiene RLS sin policies, el browser no llega solo"*. Los otros dos mentían en la **justificación**, que es lo caro: `admin.ts` decía que `runs`/`outputs` no tienen policies (la `021` se las puso, con grant a `authenticated`) y `tenant.ts` justificaba usar admin con que `usuarios_clientes` no es alcanzable desde el browser (la `021` le puso policy). La razón verdadera para seguir con admin ahí es otra —**es la tabla con la que se decide el scope, y scoparla sería circular**— y ahora está escrita.

**👁️ El operador entró a Entender** (`b8a3832`), a pedido de Mani. De las tres exclusiones de la tabla de zonas era **la única sin motivo escrito**: venía de repartir una zona por verbo y quedó por inercia. Gana precisión de entrega y separación del gate (la salud por referente ya la tenía en Curar). **El filo es el gate de costos:** dice `rol !== "sponsor"`, así que el operador **ve lo que cuestan los proveedores**. Se aceptó por una razón **de hecho y no de diseño** —hoy todos los operadores son gente de adentro, confirmado contra las 7 membresías— y el supuesto quedó escrito en **tres** lugares (el gate, `roles.ts`, ADR-052 enmendado) porque quien toca el gate puede no leer el ADR y viceversa. 🚨 **El día que alguien de una empresa cliente reciba `operador`, ese gate le publica el margen — y falla hacia MOSTRAR, así que no se rompe: filtra.**

**🔬 Y una cosa sobre cómo se verificó el flip, que vale para el próximo cambio de este tipo.** Después del flip **ninguna pantalla puede probar que funcionó**: la Capa 1 filtra por el cockpit abierto *antes* de que RLS opine, así que un operador de Retia ve sus 3 voces con RLS y sin. Hizo falta un instrumento aparte —una sonda temporal que lee sin filtro de tenant por los dos caminos y los pone al lado— y **no vale con cuenta dueña**: `clientes_visibles()` le devuelve todas las empresas, así que sus dos números coinciden por diseño. La sonda vivió solo en la rama descartada; si hace falta volver a medir, son 20 líneas.

**Verde:** `typecheck` 0 · **175 tests** · `build` · `validate` **2046 checks** · `n8n:diff` **limpio en los 5**.
**Docs alineados con lo medido:** plan §0 reescrito (decía 5 usuarios y *"el aislamiento sigue siendo solo la Capa 1"*), §12 fila 8 a ✅, la cabecera del plan, ADR-047, ADR-052, plan-cockpit §2.1, el glosario (**Cockpit** y **Fachada**, que se usaban en todos los ADRs y no estaban definidos en ninguno).
**Qué sigue:** los dos clics de §Pendiente vivo (el CSV y el tab del operador) → **D8** (apagado de Airtable + `fields.uuid` + sacar los nodos del Sheet: los tres esperan el mismo re-import) → **paginación del feed** (§12 #7) → **Fase 5, LinkedIn**, que arranca por §14.6 (sus 4 tablas sin policy) y sigue bloqueada por lo no-técnico de ADR-055. Deuda vieja: 18 menciones a Airtable en el onboarding, 3 en el one-pager.
**Skills sugeridas:** `/grill-with-docs` antes de D8 (borrar nodos es topología y hay tres cosas esperando el mismo re-import: conviene decidir el orden antes) · `/diagnose` si algo del flip aparece raro en una pantalla · `/handoff` al cerrar.

**2026-08-05 (cierre 95) — El flip de la Capa 2 en producción: el aislamiento entre empresas dejó de ser TypeScript (Claude, con Alejandro).**
**Qué se hizo:** el **paso 2 de 2 de la Fase 6** (ADR-047) escrito, deployado y verificado. La `021` llevaba dos días aplicada e **inerte**; ahora las 17 policies se evalúan de verdad. Commit `d8edea2`, Production en Vercel.

**🩸 El flip no era una línea, y el plan decía que sí.** §14.3 afirmaba *"la fachada y n8n no se tocan"* — cierto como intención, **falso como código**. `run-plan` llega a `scoped()` por dos saltos: `route.ts` → `lib/config.ts` → `leerAjustes`/`leerVoces`/`leerProyectos`/`leerReferentes`, **las mismas funciones que usan las pantallas** (el corte de D5 las hizo compartidas a propósito). Flipear `scoped()` a secas dejaba a la fachada en `42501 permission denied for schema app` —sin sesión no hay `auth.uid()` contra el que evaluar una policy— y **al motor sin plan que leer**. *Nadie lo tenía escrito porque `lib/config.ts` no aparece grepeando consumidores de `scoped`: la dependencia es transitiva.* Habría fallado cerrado y barato (500 en el primer nodo, cero pesos), pero se habría descubierto **el lunes 8:00 con el cron**.

**La forma elegida: la autoridad viaja en el contexto.** `TenantContext` gana `origen: "sesion" | "fachada"`, estampado en los **dos únicos** constructores que existen (`armarContexto` y `contextoDeFachada`). Se prefirió sobre dos puertas separadas (`scoped` + `scopedDeFachada`) porque **no hay nada que hilar** —cada función ya recibe `ctx`— y porque falla en la dirección correcta: **un constructor nuevo no compila** hasta declarar de dónde saca la autoridad, la misma disciplina que el mapa de tablas. Efecto colateral: `scoped()` es **async** (el cliente de sesión necesita `await cookies()`), así que los **36 call sites** pasaron a `(await scoped(ctx))`. No se cachea el cliente entre requests: un cliente cacheado es la sesión de otra persona. 📐 **Falta el ADR** — es estructural y sin él alguien va a borrar el discriminante por redundante.

**🎯 Y la prueba que hasta hoy era imposible de hacer.** El plan pedía probar con **Jero**; la cuenta que sirve es otra. `alejandro.davila@30x.com` es **no-dueña** (⇒ las policies se evalúan, sin bypass) y tiene membresía en **`30x` y `estadox`**, no en `retia`. Es el único perfil que **separa las dos capas**: RLS le habilita las dos empresas —es lo máximo que puede saber la base— y solo el `.eq()` de `scoped.ts` la acota al cockpit abierto. *Ese escenario no existía en producción hasta hoy: era un comentario en la `021` y pasó a ser un hecho.* Verificado en pantalla: **la voz de 30X no apareció en EstadoX** (`30x` tiene 1 voz, `estadox` 0 — esa sola fila es todo el test) · **ni un `42501` navegando**, o sea que los grants de `authenticated` son correctos en prod y no solo en Docker · selector de equipo con **2 opciones, sin Retia** · **ADR-056 en las dos direcciones** (`Transcribir` escondida por el pipeline, `Entender` por el rol) · **las 4 URLs a mano rebotaron**, incluida `/retia/reels/curar/feed`, que es por donde se habrían filtrado los 165 candidatos · todo lo demás en **0**, cero fugas.

**Lo medido sin browser:** fachada contra el live **200 · 403 · 400 · 403 · 200 · 200** (`version: 2`, 3 voces · 5 proyectos · 18 ajustes · 16 referentes) — el cron del lunes tiene su plan. Con la anon key, `app.*` da **42501** y `runs`/`outputs` dan **200 con 0 filas**: fail-closed en las dos formas. `typecheck` 0 · **174 tests** (+1: todo contexto de pantalla nace `sesion`) · `validate` **2037 checks** · `build` limpio.

**⏳ Lo que NO se verificó, y es la otra mitad del riesgo:** todo lo de arriba corrió sobre cockpits **vacíos**. Las pantallas **con datos** (`/retia/reels`) siguen sin abrirse con una sesión, y **`Entender` —las 12 vistas `security_invoker`— es la zona de más riesgo del flip entero**. Está en §Pendiente vivo con los números que tiene que mostrar cada pantalla, porque **acá la alarma se invierte**: en los cockpits vacíos cualquier número era sospechoso; en Retia el peligro es **el cero**, que es el fallo silencioso (una policy que no matchea) y no se distingue mirando si "se ve bien".

**📄 De paso, dos datos que el handoff tenía viejos:** hay **6 usuarios y 7 membresías** (decía 5 y 5 — se sumaron "Alejandro 30X" y "Manuel 30X" después del cierre 94), y **`danieltovartech@gmail.com` está en `auth` pero no en `app.usuarios`**, así que esa cuenta cae en `/sin-rol` si intenta entrar.

**Qué sigue:** el login dueño de §Pendiente vivo (cierra el flip **y** el clic del CSV de una sola vez) → el ADR del `origen` → **D8** (apagado de Airtable + `fields.uuid` + sacar los nodos del Sheet: los tres esperan el mismo re-import) → la deuda de docs (18 menciones a Airtable en el onboarding, 3 en el one-pager).

**2026-08-04 (cierre 94) — Auditoría del refactor contra prod: dos de los tres pendientes cerrados, y el que se arregló destapó dos más (Claude, pedido de Mani).**
**Qué se hizo:** una auditoría medida (base por PostgREST, n8n por su API, los 4 feedback loops), el **arreglo del archivado empujado al live y verificado con una corrida real**, el backfill de los 9 `outputs` que salieron con metadata vacía, los docs corregidos donde mentían, y [ADR-057](../adr/ADR-057-el-sheet-historico-por-instancia-o-ninguno.md) abierto.

**🔑 La key de Anthropic ya estaba rotada y nadie lo había anotado.** El commit filtrado sigue vivo en el repo local, así que se pudo comparar: su key **no es** la que corre hoy y da **401** contra la API ⇒ revocada. Los 3 workflows del live traen una sola key y coincide con el `.env`. *El pendiente #1 del cierre 93 llevaba un día cerrado en la realidad y abierto en el handoff.*

**📄 Y tres docs decían cosas falsas sobre las migraciones.** `CLAUDE.md` y el plan multi-tenant (§0, §12, §14.1, §14.3) daban la `020` y la `021` por **no aplicadas**. Medido: las 4 tablas `*_linkedin` responden y `app.clientes_visibles()` existe (el `42501` con `service_role` es *"existe pero no tenés EXECUTE"*, no *"no existe"*). Van **20 de 21**; la única que falta es la `019`. *El mismo modo de falla del cierre 93 con la `019`, al revés: dar por no aplicado lo que sí entró.*

**🩸➜✅ El archivado archiva de nuevo, y el diagnóstico salió de la ejecución, no del código.** Se bajó la ejecución 123 con `includeData=true`: `Leer Candidatos calificados` emitió **9 items planos** y el IF mandó **`[0 true, 9 false]`**. Fix + `alwaysOutputData` (la 0-calificados dejaba el run abierto: **segunda regresión de D7**), push, y una corrida real: **9 → 0 calificados · 79 → 88 outputs · IF `[9 true, 0 false]`**.

**🩸🩸 Y ahí aparecieron dos bugs que llevaban tapados desde D7, los dos por `fields.uuid`.** El contrato v2 (ADR-048 §5) lo mató y dice que *"los tres `uuidDe` se fueron juntos"* — el motor ×2 y el descubrimiento ×1 se migraron, **los dos nodos del archivado no**. `Armar filas archivado` dejaba `metadata.proyecto`/`.voz` **vacíos en todos los outputs**; `Destilar criterios` armaba `recs` vacío siempre ⇒ **el loop de ADR-022 estaba muerto**, pagando las llamadas a Haiku y tirando el resultado (los 9 daban 5+4, los dos por encima del mínimo: tenía que destilar 2 proyectos y destiló 0). *La lección: **arreglar el nodo que corta el flujo destapa todo lo que estaba tapado detrás**, y por eso la corrida de verificación importa más que el diff.* Arreglados en el repo; el `--apply` quedó pendiente (lo bloqueó el clasificador de permisos) y es el único comando que falta.

**✅ Y al final de la sesión cerró todo lo que quedaba.** Mani corrió la `019` (esta vez sí: se
verificó por su **efecto**, `app.usuarios` quedó en `id, nombre, creado_en, es_dueno`) ⇒ **21 de 21
migraciones** y la ventana del expand cerrada. Se empujaron al live los dos nodos del uuid y
`n8n:diff` quedó limpio en los 5. Smoke-test post-`019`: `/` y `/retia/reels` → 307, `/login` → 200,
`run-plan` → 200, `instancias?workflow=short-form-content` → la instancia de `retia/reels` y
`?workflow=linkedin` → las 2 `active` (la `draft` de Retia afuera, como se diseñó). **La lista de
pendientes quedó vacía; lo que sigue es el flip de `scoped.ts`.**

**📐 ADR-057 se abrió y se cerró el mismo día: el Sheet se muere, con el export construido primero.**
`/curar/historicos` ahora tiene **Descargar CSV** con **las 15 columnas del Sheet en su orden** (incluida `ESTADO`, que acá siempre vale `aprobado`: una columna que desaparece rompe a quien lea por posición). **Lo que inclinó la decisión no fue el ahorro sino de quién es el dato:** el Sheet deja el histórico de cada empresa en un archivo de Google colgado de una cuenta personal, donde el aislamiento del cockpit no llega — parametrizarlo hacía eso 3 veces en vez de 1. **El paso 2 (sacar los nodos) va en el re-import de D8**, que ya espera por `fields.uuid`; hasta entonces conviven los dos y el equipo nunca se queda sin el descargable. Es un **Server Action, no una route**, para que el export pase por la misma `exigirTenant` que la pantalla y no haya una segunda copia de esa guardia. Dos detalles que cuestan poco y deciden si se siente igual de bueno: **BOM** (sin él Excel abre *ComunicaciÃ³n*) y **citar siempre** — la columna que importa es `SCRIPT`, con saltos de línea y comillas, y un escapado condicional acierta en las 14 fáciles y falla justo en la que corre las columnas. Verificado contra prod: las 31 filas aprobadas reales, releídas con un parser RFC 4180 independiente ⇒ 31 registros, 15 columnas en todas, acentos y emoji intactos.

**📄 Y quedó a la vista una deuda que no es de esta sesión: el onboarding del equipo y el one-pager del jefe todavía describen Airtable como el tablero**, tres días después de que saliera del sistema. Se actualizó solo lo del Sheet (es lo que tocaba ADR-057); las **18 menciones a Airtable del onboarding** y las 3 del one-pager quedan como task aparte. *El onboarding además está compartido como Google Doc, así que arreglarlo acá no alcanza.*

<details><summary>El enunciado del ADR-057 cuando se abrió, antes de decidirlo</summary> El Sheet Histórico es global (§14.4) y hay dos salidas: parametrizarlo por instancia, o matarlo porque `outputs` ya es el histórico canónico y `/curar/historicos` lo muestra. Lo que las separa **no es técnico**: el onboarding le promete al equipo *"el archivo de lo ya elegido"* y el one-pager le promete al jefe un **descargable a Excel**, y el cockpit todavía no exporta. Recomendación escrita: matarlo, **condicionado a construir el export primero**. </details>

**2026-08-03 (cierre 93) — El refactor llegó a prod y la Capa 2 quedó escrita; tres cosas rotas aparecieron por medir, no por leer (Claude, pedido de Mani).**
**Qué se hizo:** el **merge a `main`** (paso 3, `ad2de5b`), los docs de los 5 workflows migrados a la forma nueva de ADR-053, la **`021` de RLS** escrita y verificada contra un Postgres 16 real, y el repo limpiado a una sola rama. Mani aplicó la `020`, la `021` y el alta de EstadoX y 30X.

**🔑 Hay una API key de Anthropic commiteada y pusheada a GitHub, y `main` nunca la tuvo.** La rama `refactor/multi-tenant-fase-0-adrs` (`d98d45a`, *"n8n snapshots"*) commiteó 5 snapshots del live; 4 traen la key en claro adentro del `jsCode` (motor ×6, motor ×6, descubrimiento ×4, archivado ×2). `.n8n-snapshots/` **sí** está en `.gitignore` (línea 12), así que entró con `add -f` o antes de la regla. La rama se borró en local y en `origin`, **pero borrar no es el arreglo**: hay que **rotar**. Es el punto 1 de §Pendiente vivo. *El validador de secretos corre sobre el working tree, no sobre las ramas: un `git add -f` se le escapa entero.*

**⛔ La `019` no se aplicó, y todo indicaba que sí.** Mani la corrió, no dio error visible, y `app.usuarios` **sigue teniendo `rol` y `client_id`**. Es el gate humano del §0 abortando la transacción entera — exactamente para lo que existe. *La lección de método: una migración con gate no se da por aplicada porque se haya corrido; se da por aplicada cuando se mide su efecto.* Se midió por PostgREST, no por memoria.

**🩸 El archivado no archiva nada desde el 01/08 y cierra en verde.** Lo encontró el task del README (`c7c282e`) y se **verificó contra prod, independientemente**: la corrida del 02/08 cerró `estado: ok` con `metricas.archivados: 9`, el último `outputs` es del **26/07**, y los 9 candidatos calificados el 01/08 siguen vivos en `app.candidatos`. La causa: `IF — hay calificados` pregunta por `$json.records`, el sobre de **Airtable**; PostgREST devuelve el array pelado ⇒ `false` siempre. Entró en `6e86481` (D7), cuando el nodo de lectura migró a PostgREST y el IF quedó con la forma vieja. Los nodos de abajo sí se migraron (usan `_filas`), **por eso nada explota**. Y `metricas.archivados` cuenta lo **leído**, no lo archivado, así que el registro tampoco lo delata. *La tercera vez este mes que un cambio de D7 deja un contador mintiendo en cero mientras la ejecución termina verde.*

**🩸 La Fase 6 tenía un agujero que ningún plan tenía escrito: las 27 vistas no eran `security_invoker`.** En Postgres una vista corre con los permisos de **su dueño**, así que escribir policies sobre las tablas base y dejar las vistas como estaban habría dejado toda la zona *Entender* sin RLS — y no se habría notado, porque con un tenant devuelven las filas correctas igual. **Medido con un A/B:** apagando `security_invoker` en `v_metricas_calidad`, un operador de Retia pasa a ver **2 filas en vez de 1**, las de EstadoX incluidas. Sin error y sin aviso. Es la familia de la `015`.

**Y dos cosas más las encontró la corrida, no el diseño**, las dos habrían roto *Entender* el día del flip: con `security_invoker` la vista necesita que **el usuario** alcance todo lo que cruza, así que `clients`/`instances`/`workflows` (los cruzan `v_outputs_recientes` y `v_salud_referentes`) y las 6 vistas de `public` necesitan sus propios grants. *Este archivo llegó a decir por escrito que el registro no necesitaba policies "a propósito", y era falso.*

**La `021` va partida en dos a propósito**, con el mismo expand/contract de la `016`/`017` y la `018`/`019`: **paso 1** (aplicada) escribe grants, 2 funciones de alcance (`security definer` + `stable` + `search_path` pinneado), 17 policies y `security_invoker` en las 12 vistas, y **no cambia nada** porque el BFF sigue en `service_role`; **paso 2** es el flip de `scoped.ts`, una línea, y ahí el aislamiento se vuelve real. ADR-047 dice que la Capa 2 es *"la fase con más riesgo de romper lo que funciona"* — partirla deja el paso caro verificable sin que nadie pueda perder el cockpit.
**🔒 Y la razón por la que RLS NO reemplaza al filtro de `scoped.ts`, escrita en la migración para que nadie lo borre por redundante:** RLS acota a **todas las empresas del usuario** (es lo máximo que puede saber la base, que no sabe qué cockpit hay abierto); `scoped.ts` acota **al cockpit abierto**, que es más angosto.

**✅ Verificado contra un Postgres 16 real:** `001→018` + `021` de cero, con el seed de prod y **una segunda empresa con datos propios** — el escenario que en producción todavía no existía. Operador de Retia: ve 1 fila donde hay 2, y pedir explícito `where client_id = 'estadox'` da **0**, no un error. Dueño sin membresías: ve las 2. Anónimo: `permission denied for schema app`. **Las 12 vistas responden** como operador (ninguna con `42501`) y el dueño ve **el doble** en todas — ese "el doble" es la señal de que la vista scopea.

**Los docs de los 5 workflows dicen la forma nueva** (`ad2de5b`): cada uno abre con **§Operación** — cambiar un workflow es `n8n:push`, el re-import queda **solo para topología** — y los placeholders quedaron rotulados como tales. De paso se corrigieron dos cosas que no eran viejas sino **falsas**: la tabla de placeholders del archivado tenía 3 de 6 filas muertas y nombraba dos credenciales inexistentes (`Airtable PAT`, `Supabase Registro`), y `CLAUDE.md` decía que la `018` no estaba aplicada.

**Limpieza del repo:** de 8 ramas a **1**. Se mergeó el README del archivado (`c7c282e`, el task), se sacó el worktree, se borraron 6 ramas locales ya en `main` y las 2 de `origin`. Quedan `main` y las dos del bot de Vercel.

**Verde:** `typecheck` 0 · **165 tests** · `validate` **2028 checks / 7 workflows** · `n8n:diff` **limpio en los 5** contra el live.
**⚠️ Lo que NO se vio corriendo:** el cockpit de LinkedIn y los dos selectores nuevos. El alta se aplicó, pero **nadie abrió una pantalla** — la prueba de §Qué tiene que verse después del paso 7 sigue pendiente.
**Qué sigue:** los 3 de §Pendiente vivo (rotar · firmar la `019` · el `IF` del archivado) y después el **flip de `scoped.ts`**. Skills sugeridas: `/diagnose` para el IF del archivado (hay un modo de falla medido y un fix de un nodo), `/grill-with-docs` antes del flip.

**— Addendum del mismo cierre, después de las tres preguntas de Mani —**

**🔑 Rotar la key de Anthropic NO es un `n8n:push`, y eso es contraintuitivo.** La key **no es una credencial de n8n**: va inline en el `jsCode` de **6 nodos** (motor ×3, descubrimiento ×2, archivado ×1; medido contra los `workflow.json`, no hay ninguna credencial `anthropic*` en la instancia). Y `n8n-sync` **aprende el valor del live**, así que un push antes de cambiarla a mano **reescribe la key vieja**. El orden correcto y la red de seguridad —el placeholder entra en conflicto y se descarta, o sea falla cerrado— quedaron escritos en §Pendiente vivo. *Es la primera vez que "los placeholders se aprenden del live" juega en contra en vez de a favor, y valía anotarlo.*

**⛔ La `019` volvió a rebotar, y el error es el correcto.** `P0001: 019: falta confirmar el deploy del refactor`. No es un bug: es el gate del §0 haciendo su trabajo. Falta borrarle el `-- ` a la línea 23 (`insert into _cierre_membresias values (true);`) **antes** de pegar el archivo en el SQL Editor.

**🩸 El bug del archivado, reproducido a pedido y con números.** Se disparó a mano contra `retia/reels`. **Antes:** 9 calificados · 79 `outputs` · último 26/07. **Después:** 9 · 79 · 26/07, y la corrida `ok` en **3,3 s** con `archivados: 9`. Leyó 9, reportó 9, escribió 0, borró 0, cerró verde. *Los 3,3 s son la señal más barata que hay: la corrida del 26/07 archivó 61 y no se hace en ese tiempo.* El barrido de higiene no borró nada (se contó antes: **0** candidatos `nuevo` de más de 20 días). El próximo task arranca con el antes/después ya medido.

**✅ Y esa misma corrida cerró el último pendiente del cierre 90.** Escribió `params.execution_id: "123"`, verificado contra `GET /api/v1/executions/123`: mismo `workflowId`, `status: success`, `startedAt` a 0,6 s del `runs.inicio`. **ADR-054 verificado end-to-end en una corrida real.** El bloque de §Pendiente vivo que lo pedía quedó marcado como cerrado.

**2026-08-03 (cierre 92) — Los dos ejes del día: las membresías listas para prod, y LinkedIn entrando como pipeline (Claude, con Alejandro).**
**Qué se hizo:** el merge de `refactor/membresias` con `main` (verde, sin aplicar), y LinkedIn construido hasta donde se puede construir sin las respuestas que faltan. **Dos ADRs nuevos (055, 056), la migración `020`, el manifest del workflow y la superficie del cockpit.** Nada aplicado en prod: el runbook ordenado está arriba, en §Pendiente vivo.

**🩸 El conflicto del merge que git NO ve, y es el que importa.** El merge chocó en un solo archivo (el log de este handoff, trivial). El de verdad no lo marca nadie: las dos páginas que `main` agregó en el cierre 89 llaman `zonaInicial(usuario.rol)`, y en esta rama **`usuarioActual()` ya no devuelve `rol`** — ADR-051, *sin cockpit no hay rol*. Lo destapó `typecheck`, no git. Pasaron a leer `sesion.rol`, que **es lo correcto y no solo lo que compila**: es el rol en ESE cockpit, y la misma persona puede ser operadora en una empresa y sponsor en otra. *Merge limpio ≠ merge correcto: acá el compilador fue la red, y por eso el merge va de `main` hacia la rama y no al revés.*

**🔑 El hallazgo del eje de LinkedIn, y no estaba en ningún plan: la zona `transcribir` no existe ahí.** LinkedIn ya es texto, así que su etapa `enriquecer` es `n/a`. Eso suena a detalle del manifest y **no lo es**: significa que *"qué zonas tiene este cockpit"* deja de ser una pregunta del **rol** y pasa a ser también del **pipeline**. De ahí sale **ADR-056**: las zonas visibles son `zonasDe(rol) ∩ zonasDePipeline(workflowId)`, aplicada en los dos lados de la costura que ya existía —el layout esconde, `exigirTenant` impide—. Y se keyea por `workflowId`, **no** por el slug de la URL: el slug es de la instancia y renombrar un cockpit no puede cambiarle las zonas.

**El selector se partió en dos, por un comentario de Alejandro en el medio de la sesión** (*"debería haber un selector de equipos que muestre solo el equipo al que pertenece"*). Uno plano mentía en los dos sentidos: con LinkedIn adentro, alguien de **una** empresa vería dos opciones en un control que significaba *cambiar de empresa*; y alguien de dos empresas tendría empresa y pipeline mezclados en el mismo string, o sea que **saltar de equipo y saltar de trabajo serían el mismo gesto**. Ahora son `SelectorEquipo` + `SelectorPipeline`, cada uno con su propia condición de aparecer. La del equipo (`> 1 membresía`) es lo que hace que **nadie vea el nombre de una empresa ajena**.

**ADR-055 cerró una pregunta que llevaba abierta desde el 28/07:** dónde se construye la máquina de LinkedIn. Se decidió **acá, como pipeline N+1**, y con eso muere `maquina-linkedin/ADR 001 §3` (se escribió allá el **ADR 004**, y ese repo pasó a ser el de **diseño**; este es el de construcción). Se descartó el repo propio porque duplicaría cockpit, login, membresías, dedup e histórico —todo lo que acaba de costar el refactor— y le daría al equipo **dos logins para dos pipelines de la misma empresa**.
**Lo que ADR-055 importa de la entrevista a Fernando, y es lo que destraba el proyecto:** la etapa 1 se bifurca en dos carriles y **la fuente del copiable NO es LinkedIn, es Pinterest e inglés**. El material que se rebrandea es visual y nunca nació en LinkedIn — buscarlo ahí era buscarlo en el peor sitio, y encima en el único que no se deja rastrear. El riesgo *"LinkedIn no se deja scrapear"*, que era el bloqueante #1, **se resolvió por rodeo, no por fuerza**.

**Una tabla que ADR-049 no había previsto: `app.voces_linkedin`.** La firma (R-2), el espaciado (R-3) y la separación mínima (R-4) **no tienen sentido sin saber que hablamos de LinkedIn**, y `app.voces` es de grano empresa y la comparten los dos pipelines. Meterlas ahí era exactamente la tabla ancha llena de nulls que ADR-049 descartó. La regla del propio ADR-049 la autoriza: *¿cambia de forma según el pipeline? es propio.*
**Y una trampa de FK que casi queda para el final:** `instances.workflow_id` referencia `workflows`, así que sin una fila `linkedin` ahí **el cockpit no se puede crear**. La `020` lo registra ella misma en vez de dejarlo como un paso suelto que alguien tiene que acordarse de correr.

**🔴 Lo que sigue bloqueado y NO es técnico** (está en ADR-055 §Consecuencias y en el README del workflow, para que no haya que re-derivarlo): no hay **definición de "funcionó"** —lo que hay es *"impresiones y reacciones"*, volumen puro, y construir sobre eso converge en el post motivacional con máximas reacciones y cero clientes—, **no existe el banco de referentes** (*"no tengo el listado"*), y **faltan los few-shot** (3–4 posts perfectos por cuenta, el pedido más barato del proyecto). Por eso **no hay `workflow.json`, y el manifest lo dice**: lo que se construyó es la detección, la curación y el cockpit, que es lo que sí se puede sin esas respuestas.

**✅ Verificado contra un Postgres 16 real, no de palabra:** se corrió **`001→020` completo** en Docker, con el renombre `piloto`→`retia` en el medio, los gates humanos de la `017`/`019` descomentados y **el mismo seed que prod** (5 usuarios, 2 devs). Las 20 pasaron limpias: 5 usuarios → **5 membresías** · `es_dueno` en los dos correctos · la `019` dejó `app.usuarios` en `id, nombre, creado_en, es_dueno` · las 4 tablas de LinkedIn con `instance_id` **not null y sin default** · **`app.plataforma` intacto** (`instagram, tiktok`) · `linkedin` en `workflows`.

**🩸 Y el hallazgo salió de CORRER el SQL del alta, no de leerlo: la membresía es por EMPRESA, no por cockpit.** Un `retia/linkedin` en `active` le habría dado a Jero —y a Alejo, y a Manuel 30X— un cockpit de LinkedIn **vacío, sin motor y sin datos**, más un selector de pipeline que no pidió nadie. Nace `draft`; `estadox` y `30x` quedan `active` porque ahí **no hay ninguna membresía** y los ven solo los dos dueños, así que sirven de banco de pruebas del cockpit sin tocarle la pantalla al equipo. *Es el mismo tipo de cosa que ADR-051 ya dice —"la membresía decide a qué cockpits entrás"— y que igual no se ve hasta que hay dos pipelines.*

**Verde:** `typecheck` 0 · **165 tests** (157 + 8 de `pipelines.test.ts`) · `build` · `validate` **2019 checks / 7 workflows** · `auditar-workflows` sin hallazgos.
**⚠️ Lo que NO se vio corriendo, dicho como tal:** **ninguna pantalla**. El cockpit de LinkedIn no existe hasta que se apliquen la `020` y el alta, y los dos selectores nuevos no se pueden ver con un solo cliente y un solo pipeline. Lo verificado es compilación, tests, rutas registradas en el build y las migraciones contra Postgres — **no el navegador**. La prueba de pantalla es el paso 4 del runbook, y va con la cuenta de Jero.
**Qué sigue:** el runbook de §Pendiente vivo, que arranca en el **paso 3** (el merge). Después: **Capa 2 (RLS)**, que con la segunda empresa dada de alta **deja de ser diferible** — su disparador escrito en ADR-047 es justamente *"antes de que un segundo cliente real tenga usuarios en producción"*, y el paso 7 crea esas empresas.

**2026-08-03 (cierre 91) — Revisión de estado de los dos ejes, y tres huecos que solo aparecen midiendo (Claude, pedido de Mani).**
**Qué se hizo:** una revisión completa del estado real —qué está hecho, qué está live, qué falta, qué está roto— por los dos ejes que cambiaron juntos (**la API key de n8n** y **el producto pasando de individual a repartido**), y después la alineación de los docs con lo medido. **Cero código, cero cambios en prod.** Todo lo que sigue se leyó de Supabase y de la API de n8n el 03/08, no del handoff — que es el punto: el estado real ya no se podía reconstruir leyendo.
**Lo verde, para que quede el número:** `clients` 1 (`retia`) · `instances` 1 (`retia`/`reels`) · `app.usuarios` 5, las 5 en `retia` · 5 workflows activos y `n8n:diff` **limpio en los 5** · 158 tests + `typecheck` + `build` · `validate` 1897 · `auditar-workflows` sin hallazgos. **Las Fases 0–4 están en producción y no hay nada roto para Retia hoy.**

**🩸 Los tres huecos, y los tres muerden con la SEGUNDA empresa, no con esta.** Están escritos para ejecutarse en **[plan-multi-tenant §14](./plan-multi-tenant.md)** — cada uno con evidencia, qué lo destraba y hecho-cuando. Acá el titular:
· **El Google Sheet del histórico es UNO SOLO** (§14.4). En el archivado, `instance_id` viaja por el body pero `sheet_id`/`sheet_tab` son **constantes del nodo `Config`**. Con un solo workflow sirviendo a todas las instancias, los aprobados de la empresa B se appendean al Sheet de Retia. **No estaba anotado en ningún ADR ni en el plan.** La regla que lo arregla ya existe (ADR-035: *n8n lee su config por la fachada*), pero toca `core/contracts/run-plan.md`, así que necesita ADR.
· **La `018`/`019` está escrita y no está en ninguna parte** (§14.1). `origin/refactor/membresias`, un commit (`3f2d43f`), merge-base **anterior** al merge de las Fases 0–4 (le faltan 4 commits de `main`). `app.usuarios_clientes` no existe en prod. **Si la `018` no backfillea las 5 filas en la misma transacción, los 5 usuarios pierden el cockpit — Jero incluido.**
· **El aislamiento entre empresas hoy es solo TypeScript** (§14.3). RLS está *enabled* en todo pero **sin una sola policy**; el BFF lee con `service_role`. Probado con la anon key: `app.candidatos` → 401, `public.runs` → 200 con **0 filas**. No hay fuga hacia afuera, y por eso no es una emergencia — pero adentro del BFF un `.eq()` olvidado no lo atrapa nada.

**🟡 Y el hallazgo que cambia el eje 2: la razón que da ADR-053 para no cubrir topología ya no es cierta.** El ADR descarta empujar nodos nuevos porque *"el repo guarda un nombre sin id"*. **`GET /api/v1/credentials` existe y responde 200** con las 12 credenciales y su `{id, name, type}` — el mapa nombre→id se puede **aprender de la instancia**, igual que los placeholders. Y los nombres del repo **ya coinciden** con los reales (`Supabase account` ×26, `Run Plan Header` ×4, `Webhook Motor Header` ×3). O sea: cubrir topología pasó de ser un límite de la API a ser una decisión de red de seguridad (`nodes` **reemplaza**, así que un push que crea nodos también puede borrarlos). Anotado como **hallazgo abierto dentro del propio ADR-053** y como §14.2. *(De paso: `/variables` y `/projects` dan **403 por licencia** — no sirven para config por tenant, vale saberlo antes de diseñar sobre ellos.)*

**🧹 Dos fuentes de verdad, y la que vivía en `core/` era la equivocada.** `core/n8n/error-workflow-registro.json` era la versión de **5 nodos** con la rama `Insertar run de fallo` que ADR-054 borra. Se eliminó y `core/n8n/README.md` quedó como puntero a `Workflows/workflow-registro-fallos/`. La razón de fondo, que vale para cualquier JSON futuro: **`n8n:diff` compara contra `Workflows/*/workflow.json`, así que un workflow guardado fuera de esa carpeta queda fuera del bucle de feedback por construcción** y se desactualiza en silencio. Se repuntaron `ROADMAP.md` (B5, ahora `[x]`) e `ingesta-registro.md`.

**Docs alineados:** `plan-multi-tenant.md` (§0 estado medido + §12 con columna de estado + §14 pendientes + la fila del Sheet en §10) · `handoff` §Pendiente vivo (el bloque decía que faltaban 5 pasos que **están hechos**) · `CLAUDE.md` (`core/schema/` decía 15 aplicadas; son 17) · `docs/adr/README.md` (dos líneas en blanco partían la tabla en tres) · `run-plan.md` y `plan-cockpit-propio.md` (el *"re-import coordinado"* ya casi nunca lo es) · el README del descubrimiento (pedía placeholders de Airtable y anunciaba un cron que se sacó a propósito en `270d107`).

**🔑 `.env` y `.env.local`: Airtable podado de los dos y el PAT revocado.** La app no lo lee en ningún archivo (verificado sobre `app/`, `lib/`, `domain/`: el único `process.env` dinámico es `leerClave` en `lib/transcribir.ts`, y solo pide Supadata y Anthropic) y los workflows tienen 0 llamadas a `api.airtable.com` desde D7. Quedaron sin credencial `setup-airtable.mjs` y `verificar-corrida.mjs`, **a propósito y con el aviso en su cabecera** — para que el próximo que los abra sepa en 5 segundos que no están rotos, sino jubilados.

**⚠️ Lo que NO se hizo, y es deliberado:** ninguno de los tres huecos se arregló. Se **registraron**. Los tres necesitan una decisión (dos de ellos un ADR) y ninguno bloquea a Retia hoy.

**Un dato para calibrar, no es tarea:** la última corrida real fue el 03/08 02:36 UTC y su `params` **no tiene `execution_id`** — es anterior al push de ADR-054 (05:2x UTC). El live ya lo escribe y el handler ya cierra por ahí, pero eso **todavía no se probó con una corrida de verdad**. Se cierra solo en la próxima.

**Skills sugeridas para la próxima sesión:** `/grill-with-docs` para el ADR del Sheet por instancia (§14.4) — es el más barato de los tres y el único que rompe aislamiento; después el mismo skill para la Capa 2 (RLS), que es la decisión grande.

**2026-08-03 (cierre 90) — Tocar un workflow deja de ser un re-import, y el error handler que nunca había funcionado (Claude).**
**Qué se hizo:** dos ADRs y sus dos implementaciones, las dos ya en producción. **[ADR-053](../adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md):** `core/scripts/n8n-sync.mjs` parchea los workflows por la API pública de n8n en vez de re-importarlos. **[ADR-054](../adr/ADR-054-cada-run-lleva-su-execution-id.md):** cada run graba el id de su ejecución y el error handler cierra por ahí. Commits `c560754` y `3d54a15`.
**El principio de ADR-053, que es lo que hay que entender antes de tocarlo:** *el repo es la forma, el live es el estado.* Nunca se empuja el repo entero — se toma el live como base (que ya tiene credenciales, ids internos de Apify y settings de instancia) y se le aplican los `parameters` del repo. **Los placeholders no se mapean en el `.env`: se APRENDEN del propio live**, alineando cada string del repo contra su gemelo (`const KEY = '<ANTHROPIC_API_KEY>'` contra `const KEY = 'sk-ant-…'` enseña el valor). Se descartó la tabla `<<X>> → $VAR` porque es una segunda verdad que se atrasa sola el día que alguien cambia una URL en n8n.
**La semántica del PUT se MIDIÓ contra la instancia, con workflows desechables, no se supuso.** Y tres de esas mediciones cambiaron el diseño: `settings` **mergea** (por eso `binaryMode`/`timezone`/`errorWorkflow` sobreviven sin mandarlos — era el riesgo que más miedo daba y resultó ser ninguno), `nodes` **reemplaza** (siempre va el array completo), y un PUT sobre un workflow **activo** lo deja activo con `webhookId` y `path` intactos. El `versionId` **no** sirve de rollback (no cambió en uno de dos saves), así que el snapshot es propio, en `.n8n-snapshots/` (gitignored).
**El diff clasifica en vez de listar, y esa es la diferencia entre útil e ignorable:** el diff crudo daba **26 diferencias**, todas normalizaciones de n8n. Clasificadas (drift · topología · orden · defaults que n8n borra · campos que agrega · resourceLocators de Apify), quedó **1 accionable**. Un diff ruidoso se aprende a ignorar y ahí se esconde el drift real.
**🩸 El hallazgo que encontró el diff, y que estaba corriendo hace meses:** en el motor, `Armar candidato` abría dos ramas y **el orden estaba invertido** — `Resumen del run → Cerrar run` corría ANTES que `Preparar candidatos → POST Candidatos`. O sea: `Cerrar run` escribía `estado: 'ok'` **con métricas de N candidatos antes de insertarlos**, y `POST Candidatos` no tiene `onError`, así que un fallo suyo dejaba un run registrado como exitoso con la tabla vacía. En el orden del repo, el mismo fallo corta el workflow, el run queda `en_curso` y lo levanta el barredor de zombies. **Se midió cómo ordena n8n v1** (3 ramas cuyos órdenes por X y por Y eran distintos): **por Y, arriba primero, desempata X**. Arreglado con `npm run n8n:orden -- motor --apply`.
**🩸 El segundo hallazgo: el *Error Workflow* nunca funcionó, ni un día.** Apareció al versionarlo (no estaba en git). Buscaba el run por `instance_id=eq.<<INSTANCE_ID>>` —placeholder literal— y ADR-048 además le había sacado el piso: la instancia viaja en el payload del webhook, que el Error Trigger **no recibe**. Y aunque se resolviera, `instance_id` identifica al **tenant**, no a la **corrida**: con el dispatcher (una ejecución por instancia) y tres pipelines compartiendo instancia, tocaba la fila equivocada o varias. **La llave pasó a ser `$execution.id`** — medido: existe adentro del workflow, el Error Trigger recibe *ese mismo* id, y PostgREST filtra `params->>clave` (así que **no hizo falta migrar**, que importa porque la cola está trabada: la `017` espera y `018`/`019` ya están pedidas).
**Lo que se borró y por qué:** la rama `¿Había run abierto?` → `Insertar run de fallo`. No es implementable: `runs.instance_id` es `not null references instances(id)`, así que un run de fallo huérfano exige inventar un tenant, y eso es la Capa 1 de ADR-047. Cubría caerse *antes* de abrir el run — 4 nodos, dos de ellos requests a Supabase, o sea que su modo de falla dominante es "Supabase no responde", donde tampoco se podría escribir la fila.
**⚠️ Gotchas para el próximo (los tres están en §Pendiente vivo):** (1) **el diff va después de CADA import** — el mismo `<<SUPABASE_URL>>` se coló dos veces y las dos en silencio, porque `onError: continue` termina la ejecución en verde con el request roto; (2) **importar crea un workflow con id NUEVO**, nunca actualiza en el lugar (hay que tocar `N8N_WF_*` en el `.env` y re-apuntar `settings.errorWorkflow`); (3) **cambios de topología no van por `push`** — el push los detecta y se niega, van por re-import.
**Verde:** `validate` **1897 checks** · `auditar-workflows.mjs` sin hallazgos · `n8n:test` **15/15** · `n8n:diff` con **los 5 workflows en sync**. n8n quedó con 61 workflows, 56 archivados, **5 activos y todos correctos**.
**Qué sigue:** sin cambios de fondo — merge de `refactor/membresias` + `018`/`019` → **Capa 2 (RLS)** → paginación del feed → LinkedIn. Lo único nuevo es la verificación de §Pendiente vivo: mirar que `params.execution_id` aparezca después del cron del lunes.
**Skills sugeridas para la próxima sesión:** `/diagnose` si el `execution_id` no aparece en la corrida real; `/grill-with-docs` antes de meterse con la Capa 2 (RLS), que es la decisión grande que queda.


**2026-08-03 (cierre 89) — El 404 que dejó la Fase 3: la base del cockpit no era una ruta (Claude, reporte de Alejandro).**
**Qué pasó:** Alejandro reportó *"el cockpit no está funcionando del todo"* → **404 Page not found**. El diagnóstico empezó descartando lo caro: `clients` y `instances` en prod son `retia` / `retia`+`reels`+`active`, las **5 filas de `app.usuarios` con `client_id = retia`**, la raíz responde `307 → /login`, `typecheck` y **158 tests** verdes. **No era el refactor.**
**La causa, y es un hueco que la Fase 3 dejó abierto:** solo existían páginas para las **zonas**. `/retia/reels` y `/retia` eran 404 aunque el cockpit exista — y lo agrava que `baseDe()` / `rutaDe(c)` del **propio dominio** construyen justo esa URL (`rutas.test.ts` ya la testea como válida). Encima **no había `not-found.tsx` en toda la app**, así que cualquier ruta sin match caía en el 404 default de Next: pantalla en blanco, sin decir qué pasó y sin salida.
**Arreglado en `e5c6668` (pusheado a `main`, 3 archivos nuevos, nada modificado):** `app/[cliente]/[pipeline]/page.tsx` → zona inicial del rol · `app/[cliente]/page.tsx` → primer cockpit suyo de esa empresa · `app/not-found.tsx` → pantalla con el botón a `/`. Los tres reusan `resolverContexto` + `zonaInicial`, que ya existían; ajeno o inexistente sale por `redirect("/")`, que es la salida de emergencia que `app/page.tsx` ya se documentaba como ser.
**🟢 El efecto colateral que salió mejor de lo planeado: los bookmarks pre-Fase 3 se arreglaron solos.** Las rutas viejas tienen **uno o dos segmentos** (`/operar`, `/curar/feed`), así que ahora las atrapan las rutas dinámicas nuevas: `resolverContexto` no encuentra ningún cliente llamado `curar`, devuelve `null` y rebotan al cockpit correcto. **No hay que avisarle nada a Jero** — contra lo que decía §Pendiente vivo (*"los bookmarks viejos murieron"*), ya no mueren. El `not-found` quedó para lo que ni eso matchea (3 segmentos o más).
**Una decisión chica, dicha para que no se re-litigue:** el `not-found` **no redirige a propósito**. El que llega ahí se equivocó de mucho y un salto silencioso le esconde que la URL está mal; además `redirect()` adentro de un `not-found` es frágil (en respuestas streameadas termina siendo un salto de cliente). Los que se equivocaron de poco ya rebotan solos por las rutas de arriba.
**Verde:** `typecheck` · **158 tests** · `build` (el mapa de rutas muestra `/[cliente]` y `/[cliente]/[pipeline]` registradas) · `validate` **1786 checks**.
**⚠️ Lo que NO se verificó, y es honesto decirlo:** el redirect **corriendo**. La cadena completa necesita sesión iniciada y no había navegador disponible en la sesión. Se comprueba en 10 segundos con el deploy arriba: `/retia/reels` tiene que caer en `/retia/reels/operar`.
**Qué sigue:** sin cambios respecto del cierre 88 — merge de `refactor/membresias` + `018`/`019` → **Capa 2 (RLS)** → paginación del feed → LinkedIn. Y para *ver* las tres empresas separadas hace falta darlas de alta: hoy hay un cliente y una instancia, así que el `SelectorCockpit` existe pero el layout no lo dibuja (`opciones.length > 1`).


**2026-08-03 (cierre 88) — El refactor multi-tenant entró a produccion: los 6 pasos del runbook, con Alejandro al teclado (Claude).**
**Que se hizo:** se ejecutaron los 6 pasos de punta a punta en una sola sesion. Alejandro corrio el SQL y n8n; yo verifique cada paso contra la base y contra la API de n8n, nunca de palabra. El estado y la tabla de resultados estan arriba, en **Pendiente vivo**.
**Lo que mas cuesta y no estaba escrito: LAS CREDENCIALES DEL RE-IMPORT.** Dos intentos fallidos, los dos por una credencial elegida mal de un desplegable — `Webhook Motor Header` donde iba `Run Plan Header` (dispatcher) y donde iba `Webhook Descubrimiento Header` (descubrimiento). **La causa raiz era del repo:** los `workflow.json` referencian credenciales *por nombre y sin id*, y el nombre de Supabase que declaraban (`Supabase Registro`) **no existe en n8n** — la real es `Supabase account`. Sin match, n8n las pide a mano: 25 clicks. **Corregido en el repo** (25 referencias en los 3 workflows), asi que el proximo import engancha solo. La tabla nodo→credencial quedo en Pendiente vivo.
**Como fallo, que es la parte buena:** los dos errores dieron **403 en el primer nodo**, antes de Apify/Supadata/Haiku. Dos intentos fallidos, cero pesos. El fail-closed de ADR-028 hizo exactamente lo suyo.
**La prueba que cierra el refactor, y va con datos:** segunda instancia de `retia` + el mismo `external_id` que ya existia → **entro**. Dos filas, mismo video, dos instancias. Antes de la `017` era imposible, y ese era el peor hallazgo del diagnostico (el dedup global le habria dado a la segunda empresa un *"el motor no trae contenido"* sin un solo error). Filas de prueba borradas, conteos de vuelta en la linea base.
**Dos cosas que dije mal y corregi en el momento, por si sirven de calibracion:** (1) di por viejo un workflow porque su `Config` tenia `instance_id` — la Fase 4 **conserva** ese campo, lo que cambia es que ahora es una expresion que lee el body; lo resolvi comparando nodo por nodo contra el repo en vez de por una heuristica. (2) dije que la corrida con el cap en 10 tardaria 5-10 min: **el cap abarata, no acorta** — lo lento es Apify, que hace una llamada por referente (16), y tardo 16,7 min.
**Una trampa de herramienta, para el proximo:** un `PATCH` a PostgREST con **acentos** en el cuerpo fallo en silencio desde el shell (JSON mal codificado, la respuesta era un objeto de error que parecia una lista vacia). Con el texto sin tildes entro. Si un PATCH "no matchea" y la fila existe, mira la codificacion antes que el filtro.
**Verde:** `validate` · `auditar-workflows.mjs` sin hallazgos.
**Que sigue:** nada bloquea la operacion. Construccion, en orden: merge de `refactor/membresias` + `018` + `019` → **Capa 2 (RLS)** → paginacion del feed → LinkedIn.


**2026-08-02 (cierre 87) — ADR-051/052 implementados: membresías, el flag de la agencia y el sponsor sin costos. Rama aparte (Claude, con Alejandro).**
**Dónde vive:** rama **`refactor/membresias`**, salida de `7118171`. **Aparte a propósito:** la rama `refactor/multi-tenant-fase-0-adrs` ya está verificada y su merge desbloquea prod (Transcribir está roto ahí, ver abajo); meterle encima un refactor de las guardias la hace más grande y más lenta de revisar. Esta se mergea después.
**Migraciones: `018_membresias.sql` + `019_membresias_cierre.sql`.** Otra vez **dos archivos, y por el mismo motivo que la 016/017**: la `018` NO borra `usuarios.rol` ni `usuarios.client_id` —el código desplegado todavía las lee— y la `019` las tira recién después del deploy, con gate de confirmación humana. **Verificadas corriendo 001→019 sobre Postgres 16 en Docker**, con el renombre de Mani aplicado en el medio y 5 usuarios / 2 devs sembrados igual que prod: 5 membresías, 2 dueños, y `app.usuarios` termina en `id, nombre, creado_en, es_dueno`.
**🚨 Una interacción entre la `018` y el renombre que hay que respetar: el renombre va PRIMERO.** La FK de `usuarios_clientes` a `clients` es **RESTRICT y no CASCADE** —con cascade, borrar una empresa le saca el acceso a su equipo en silencio— así que si la `018` corre antes, el `delete from clients where id = 'piloto'` del renombre **falla** en vez de borrar las membresías. Falla ruidoso, que es lo correcto, pero es un paso extra en medio de una transacción ya escrita. **Probado: el delete de un cliente con gente adentro es error de FK.**
**El código:** `domain/tenant.ts` reescrito (visibilidad por membresía, no por árbol; `empresasAlcanzables`, `rolEn`, `ROL_DE_DUENO`), 12 tests nuevos · `lib/tenant.ts` (lee `usuarios_clientes` con el cliente admin: quien decide qué ve alguien no puede ser una tabla que ese alguien lea desde el browser) · `lib/auth.ts` (**`usuarioActual()` ya no trae `rol`**; `exigirZona` desaparece y la guardia se unifica en `exigirTenant`, que además autoriza la zona **contra el rol de ESE cockpit**) · `app/page.tsx` con el orden dado vuelta · el layout y 3 pantallas.
**🔒 Y el bug que esto cierra, que era el motivo real de la conversación:** `scoped.ts` filtraba el grano empresa por `client_id in (visibles)` —las empresas del **usuario**— sin mirar qué cockpit estaba abierto. Ahora es `= ctx.clientId`, **la empresa del cockpit**. Con un tenant no se veía; con dos, una pantalla de EstadoX habría mostrado los proyectos de 30X sin un solo error. Hay un test que lo fija (*"el contexto lleva la empresa DEL COCKPIT, no la del usuario"*).
**ADR-052 aplicado:** el `sponsor` deja de ver el bloque de costos de Entender, y el corte está **en el servidor** (`veCostos ? leerCostos(ctx) : []`): esconder la tarjeta en React dejaría los números viajando al browser igual.
**Verde:** `typecheck` 0 · **157 tests** · `build` · `validate` **1804 checks / 5 workflows**.
**⚠️ Lo que sigue sin resolverse y no es mío:** el orden de prod. Hoy la `016` está aplicada pero **Vercel sirve `main` (código viejo, `run-plan` v1)** — verificado. Esa ventana **tiene roto pegar enlaces en Transcribir**: el código vivo hace upsert con `on_conflict=plataforma,external_id` y la `016` reemplazó ese unique. Probado contra la base real, sin escribir: el viejo da `42P10`, el nuevo `201`. **Lo cierra el merge de la otra rama**, no esta.
**El orden completo, para no perderlo:** renombre `piloto`→`retia` → merge de `refactor/multi-tenant-fase-0-adrs` + deploy → re-import de los 4 workflows + apagar crons viejos → corrida de verificación → `017` → merge de `refactor/membresias` + deploy → `018` → `019` → **Capa 2 (RLS)**, que con clientes externos ya no es diferible.

**2026-08-02 (cierre 86) — Fase 4 del refactor multi-tenant: `run-plan` v2, el motor por instancia y el dispatcher (Claude, pedido de Mani).**
**Qué se hizo:** la fase que **obliga al re-import**, entera y en el repo. El contrato sube a **`version: 2`** con `?instancia=<uuid>` **obligatorio**, `<<INSTANCE_ID>>` deja de existir como placeholder, nace `GET /api/engine/instancias`, y nace [`Workflows/workflow-dispatcher/`](../../Workflows/workflow-dispatcher/). `typecheck` 0 · **158 tests** · `build` · `validate` **1786 checks / 5 workflows** · `auditar-workflows.mjs` sin hallazgos · `test-nodos.mjs` verde con dos secciones nuevas. **Nada aplicado en prod: el re-import es de Mani.**
**🚨 La tensión que el plan no tenía resuelta, y que cambió el diseño: los crons se quedaban sin instancia.** El motor tenía 3 triggers y el archivado 2, y **ni el cron ni el manual tienen payload**. Un cron que sobrevive a esta fase no corre como antes: corre y **aborta**, después de `Abrir run`, dejando una fila en `en_curso` para siempre — el mismo fallo mudo que ya costó una sesión (*"parecía una corrida lenta"*), una vez por semana. Así que **los dos crons se mudaron al dispatcher con su horario intacto** (lunes 8am · domingo 6pm), y eso corrige una línea de ADR-050 que decía lo contrario (*"cada workflow conserva su trigger natural"*) mientras su propio diagrama ya decía esto. Está escrito como [enmienda en el ADR](../adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md#enmienda-del-2026-08-02-implementación--los-crons-sí-se-mudan-y-el-archivado-necesitó-un-webhook), no en silencio.
**🔎 Y el hueco que apareció al mirar los triggers: el archivado no tenía webhook.** Era cron + manual, o sea **ninguna puerta por la que recibir una instancia** — y la necesita, porque su `candidatos?estado=neq.nuevo` sin filtro archiva los calificados de **todas** las empresas dentro de una corrida, los escribe en el `outputs` del tenant equivocado y después **los borra**. Le entró `Disparo por instancia (webhook)`. Costo: un placeholder más (`<<WEBHOOK_PATH_ARCHIVADO>>`) y un segundo cron en el dispatcher.
**El `Ejecutar manual` se conservó, y sin reintroducir un default silencioso.** `Config.instance_id` es una expresión que lee el body del webhook y cae a `''`; para una corrida manual se pega el uuid en ese `''` (anotado en el nodo). **En git va vacío siempre**, y vacío ⇒ `run-plan` 400 ⇒ no arranca. Es lo contrario del default que ADR-048 descartó: aquel caía al piloto (y escribía en la empresa equivocada, en verde), este aborta.
**Lo que se relevó y NO eran 7 URLs, eran 13.** El checklist del cierre 82 se quedó corto: faltaban los **cuatro `runs` del single-flight y del barredor** en los tres workflows (sin `&instance_id=eq.` la corrida de una empresa le bloquea el arranque a otra, y el barredor le marca `fallo` los zombies ajenos) y el **DELETE de `Barrer candidatos sin calificar`**, que sin filtro le borra el feed sin calificar a las otras empresas. Todas están puestas; la lista completa, abajo.
**☠️ `fields.uuid` murió, y con él los tres `uuidDe`.** Quedaba anotado que *"muere en el próximo re-import que haga falta por otra cosa"* — este es ese. El mapa era identidad desde el paso 3 de D7, así que `uuidDe[d.proyecto_id] || null` y `d.proyecto_id || null` son lo mismo: verificado siguiendo el id hasta `Armar plan de corrida`, donde `projects` se keyea por el `p.id` del plan. **Se le agregó test:** `Preparar candidatos` y `Preparar descartes` no estaban cubiertos por `test-nodos.mjs` y son los que escriben el cockpit — sus dos modos de falla (fila sin `instance_id` ⇒ tenant equivocado; `proyecto_id` perdido ⇒ todo al grupo *(sin proyecto)*) entregan **en verde**, mal.
**Un detalle del contrato que no se parcheó:** el manifest v1 exige ≥1 `outputs` con `registered: pending|yes`, y **el dispatcher no produce nada** (ADR-050 §4: no registra, no escribe). Quedó declarado como `senal_de_corrida / pending`, que es lo más honesto que admite el contrato hoy, con el comentario puesto en el yaml. Es un hueco chico de `workflow-manifest.md`, no una decisión de diseño — si molesta, es una enmienda de una línea.

> ### 📋 EL CHECKLIST DEL RE-IMPORT (es de Mani, y va en este orden)
> 1. ✅ **`016` aplicada** por Mani el 2026-08-02, y verificada contra la base (el detalle, en §Pendiente vivo). El `@casper_smc` duplicado ya estaba limpio. **Con esto, el deploy de la rama dejó de estar bloqueado.**
>
> > 🧪 **Y con la `016` puesta, el contrato v2 se probó CONTRA LA BASE REAL antes de gastar el re-import** (dev server local + las credenciales del `.env`, todo lecturas): `?instancia` ausente ⇒ **400 `instancia_ausente`** · inexistente ⇒ **403 `instancia_desconocida`** · sin header ⇒ **403 `header_ausente_o_distinto`** · instancia real ⇒ **200 con `version: 2`**, 3 voces · 5 proyectos (los 6 menos el de voz apagada, o sea el gate vivo) · 16 referentes · 18 ajustes, y **`fields.uuid` ausente en las cuatro listas**. El endpoint nuevo: sin `?workflow` ⇒ 400 · `short-form-content` ⇒ la instancia · un pipeline que no existe ⇒ **200 con lista vacía**, que es lo que evita que el dispatcher entre a su rama de fallo por un caso normal.
> > **Lo que esto NO prueba:** nada del lado de n8n. Los `jsCode` y las URLs nuevas recién se ejercitan en la corrida del paso 5.
> 2. **Re-importar los 3 workflows + importar el dispatcher.** Placeholders, por workflow — `<<INSTANCE_ID>>` **ya no está en ninguno**:
>    · **motor (5):** `<<DASHBOARD_URL>>` `<<SUPABASE_URL>>` `<<WEBHOOK_PATH_MOTOR>>` `<ANTHROPIC_API_KEY>`×3 `<SUPADATA_API_KEY>`
>    · **archivado (7):** los 2 de siempre + `<<WEBHOOK_PATH_ARCHIVADO>>` **(nuevo)** + `<<GOOGLE_SHEET_ID>>` `<<NOMBRE_PESTANA_SHEET>>` `<<CREDENCIAL_GOOGLE_SHEETS>>` `<ANTHROPIC_API_KEY>`
>    · **descubrimiento (4):** `<<DASHBOARD_URL>>` `<<SUPABASE_URL>>` `<<WEBHOOK_PATH_DESCUBRIMIENTO>>` `<ANTHROPIC_API_KEY>`×2
>    · **dispatcher (3):** `<<DASHBOARD_URL>>` `<<WEBHOOK_URL_MOTOR>>` `<<WEBHOOK_URL_ARCHIVADO>>` — **URLs completas**, no paths
>    ⚠️ **`<ANTHROPIC_API_KEY>` y `<SUPADATA_API_KEY>` muerden a mitad de corrida**, no al principio.
> 3. **Apagar los crons viejos en n8n** (motor lunes 8am, archivado domingo 6pm). El repo ya no los tiene, pero n8n conserva lo importado: si quedan vivos, el piloto corre dos veces y una muere a mitad.
>
> > 🔑 **De dónde salen los valores del paso 2, para no inventarlos:** `<<WEBHOOK_PATH_ARCHIVADO>>` y su URL se generaron el 2026-08-02 y viven en el **`.env` de la raíz** (`ARCHIVADO_WEBHOOK_PATH` / `ARCHIVADO_WEBHOOK_URL`), 32 hex como los otros. **El header del archivado es EL MISMO que el del motor** (`MOTOR_WEBHOOK_HEADER_*`, credencial `Webhook Motor Header` en n8n): el dispatcher dispara los dos destinos desde **un solo nodo httpRequest**, que lleva una sola credencial. Separarlos obligaría a partir el dispatcher en dos ramas. *(El descubrimiento sí conserva su propio par: no lo dispara el dispatcher, lo dispara el botón.)*
> 4. **Activar el dispatcher** recién después del paso 3.
> 5. **Corrida de verificación** con el techo en 10 (la más barata). Reflejo de siempre: **`runs` no distingue "colgada" de "muerta", Apify sí** — cero llamadas ⇒ murió antes de scrapear, y el sospechoso #1 sigue siendo un placeholder sin rellenar.
> 6. **Recién ahí la `017`**, que tiene gate de confirmación humana adentro. Y el techo vuelve a 250.
>
> **Con una sola instancia esto no prueba nada por sí solo** (el resultado es idéntico al de antes). Lo que lo prueba es el paso 7 de [plan §11.3](./plan-multi-tenant.md): con dos instancias, N videos distintos por instancia y ninguno cruzado, mirado con un `select`.

**Qué sigue, y el cierre 85 le cambió el orden a esto mientras se escribía.** El plan §12 ponía la Capa 2 (RLS) en el anteúltimo lugar; **ADR-051 activó su disparador**, así que la secuencia de código pasa a ser: **`018_membresias.sql` + el refactor de las guardias → Capa 2 (RLS) → #7 paginación del feed → #9 Fase 5 (LinkedIn)**. Lo que la Fase 4 le deja a la 5 ya está: `?workflow=<slug>` en el dispatcher y `instances` como (pipeline × empresa) es todo lo que un pipeline nuevo necesita del núcleo.
**🔁 Y lo que el cierre 85 le va a tocar a ESTA fase, para que no sorprenda:** ADR-051 saca `rol` de `usuarioActual()` y unifica las guardias en `exigirTenant`. De lo que se escribió acá, lo único que queda en su camino son los dos botones de Operar (`exigirTenant("operar")`); **la fachada no se toca** — `run-plan` e `instancias` se autentican por header compartido y no tienen usuario, así que las membresías les son ajenas por diseño.
**🔧 Dos drifts pre-existentes que encontré y NO toqué** (no los creó esta fase, y arreglarlos a la pasada mezcla cambios): el manifest del descubrimiento declara `type: cron` lunes 9am pero su `workflow.json` **no tiene cron** desde la enmienda de ADR-020 (es el botón *Buscar ahora*); y el `dev-doc §3.2` lo lista igual. El manifest del archivado decía "diario 9:00" contra el `0 18 * * 0` del JSON — **ese sí quedó corregido**, porque el trigger es justo lo que esta fase cambió.

**2026-08-02 (cierre 85) — El modelo de acceso: membresías en vez de herencia. ADR-051 + ADR-052, sin una línea de código (Claude, diseño con Alejandro).**
**Qué pasó:** Alejandro trajo una idea —*"el cockpit tiene una especie de auth: los asociados con 30X solo ven 30X, y los únicos que ven todo son los devs"*— y al aterrizarla salieron **cuatro hechos que ADR-046 no tenía** y que le cambian el modelo de acceso. Salieron 2 ADRs; **nada construido todavía**, a propósito: `core/` solo cambia con ADR.
**Lo que se descubrió, en orden de impacto:** (1) **las tres empresas son clientes EXTERNOS**, o sea que gente de afuera se loguea — el aislamiento deja de ser higiene y pasa a ser una promesa reclamable; (2) **una cuenta puede pertenecer a varias empresas** con un switch en el nav, lo que mata `usuarios.client_id` singular; (3) **los dueños son dos y además tienen que ser invisibles** para el cliente (el *"secret owner"* son dos requisitos pegados: acceso total **e** invisibilidad); (4) **el equipo de la agencia no es transversal** — Majo y Jero son de una empresa y no tocan las otras, así que "ser de la agencia" tampoco implica ver todo.
**🔎 Y un hallazgo del código que ya está escrito, que el ADR arregla:** `scoped.ts` filtra el grano empresa por **`client_id in (visibles)` — el subárbol entero del usuario, sin importar qué cockpit esté abierto**. Con alguien que alcance más de una empresa, eso **mezcla voces, proyectos y referentes de varias en una sola pantalla**. Hoy no se ve porque hay un tenant; con el segundo sería otra vez un número que se ve razonable y está mal. La regla que lo cierra: **la membresía decide a qué cockpits entrás, no qué filas ves adentro.**
**[ADR-051](../adr/ADR-051-el-acceso-es-membresia-explicita.md):** `app.usuarios_clientes (usuario_id, client_id, rol)` reemplaza a `usuarios.client_id` y a `usuarios.rol` · **el rol vive en la membresía** · `usuarios.es_dueno` como flag (y fuera de toda lista de personas) · **`clients.parent_id` deja de gobernar acceso** y queda como linaje. *La propuesta inicial era que el rol FUERA la empresa (`30X`, `EstadoX`, `Retia`); se descartó porque obliga a `EstadoX-operador`/`EstadoX-sponsor`/`EstadoX-dev` — tres roles nuevos por cliente— y pierde la pregunta de qué puede hacer alguien adentro.*
**[ADR-052](../adr/ADR-052-el-sponsor-externo-no-ve-el-costo-del-proveedor.md):** el `sponsor` ve **una sola zona, Entender**… que es justo la que muestra `app.tarifas`. O sea que **la única pantalla del jefe de un cliente externo le mostraba lo que cuestan los proveedores de la agencia**. Se corta el bloque de costos, **en el servidor** (`display:none` sobre datos que ya viajaron no esconde nada).
**🚨 Lo que esto le hace a la secuencia: la Capa 2 (RLS) deja de ser la última fase.** El disparador que ADR-047 dejó escrito —*"antes de que un segundo cliente real tenga usuarios en producción"*— **está activado**. Y encima los clientes externos **curan su propio feed**, o sea que escriben en la base desde el cockpit: la combinación que más le exige a RLS. La buena noticia es que con membresías la policy se abarata: `es_dueno or client_id in (select …)`, sin recursión — con herencia por árbol habría necesitado un CTE recursivo **por fila leída**.
**⚠️ Y un refactor que hay que presupuestar: `usuarioActual()` deja de devolver `rol`**, porque el rol pasa a depender del cockpit abierto. Toca 7 lugares y **da vuelta un orden**: `app/page.tsx` hoy elige la zona inicial por el rol y después resuelve el cockpit; va a tener que resolver el cockpit primero. `exigirZona` sola deja de alcanzar y las guardias se unifican en `exigirTenant`. Es refactor de lo que se construyó en las Fases 2 y 3.
**Decisión de Alejandro con el riesgo sobre la mesa: el alta de usuarios sigue MANUAL una vuelta más.** Vale saber cuál es el riesgo que se aceptó: una membresía con la empresa equivocada mete a alguien en el cockpit de otro cliente **sin un solo error**. La mitigación acordada no es código: la migración `018` deja escrita la query de verificación post-alta y correrla es parte del alta. **Disparador para automatizarla: el primer usuario que no sea de la agencia.**
**Qué sigue:** la migración **`018_membresias.sql`** + el refactor de las guardias, y después la **Capa 2**. Ojo con el orden respecto de Mani: la `016` sigue sin aplicarse y **va primero**. `npm run validate` en verde (1688 checks).

**2026-08-02 (cierre 84) — Fase 3 del refactor multi-tenant: un cockpit por (empresa × pipeline), con el tenant en la URL (Claude).**
**Qué se hizo:** el árbol de rutas entero se movió a **`app/[cliente]/[pipeline]/(zonas)/`** (con `git mv`, así que el historial de cada archivo sigue). Las URLs pasan a ser **`/30x/reels/curar/feed`**. Nuevos: `domain/rutas.ts` (puro, 6 tests), `components/selector-cockpit.tsx`, `(zonas)/usar-cockpit.ts`. `typecheck` 0 · **157 tests** · `build` verde, con las 13 rutas de zona bajo los dos segmentos. **No toca prod hasta el deploy**, pero **este sí cambia lo que ve el equipo**: ver abajo.
**🚨 Lo único con consecuencia para Majo y Jero: los bookmarks se rompen.** `/curar/feed` deja de existir; ahora es `/30x/reels/curar/feed`. La guía de [onboarding](../onboarding-equipo-redes.md) **no hardcodea URLs**, así que no hay que reescribirla — pero **entrar por la raíz `/` sigue funcionando y ahora es el camino recomendado**: resuelve el cockpit del usuario y su zona inicial, y es la salida de emergencia a la que caen todos los `redirect("/")`. Conviene avisarles antes del deploy y decirles que re-marquen.
**Las tres reglas que quedaron escritas, porque son las que hacen que esto no se pudra:** (1) **ningún `href` ni `revalidatePath` se escribe a mano** — se arman con `domain/rutas.ts`, que es puro y testeado; con el prefijo variable, cada string a mano es una chance de mandar a alguien (o de revalidar) el cockpit equivocado. (2) **los segmentos crudos de la URL solo sirven para RESOLVER**: todo lo que se renderiza se arma con el cockpit que devolvió `exigirTenant`, o la pantalla puede terminar mostrando los datos de un cockpit y los links de otro. (3) los componentes cliente leen el cockpit de la URL con `usarCockpit()` en vez de recibirlo por props tres niveles abajo solo para armar un `href`.
**⚠️ El layout NO es la guardia, y está comentado en el archivo para que nadie lo lea así:** en el App Router el layout y la página renderizan **en paralelo**, así que un chequeo ahí no llega a tiempo para proteger a la página. El layout valida para lo suyo (no dibujar el nav de un cockpit que no existe) y cada `page.tsx` valida lo suyo con `exigirTenant`. Es la misma división que ya tenía `proxy.ts` — que **no cambió y no tenía que cambiar**.
**Dos cosas que se movieron y conviene saber por qué:** `cerrarSesion` salió de `(zonas)/actions.ts` a **`app/actions.ts`** — la usan el nav (adentro del tenant) y `/sin-rol` (afuera, donde el usuario justamente puede no tener tenant todavía), así que colgarla de un cliente estaba mal. Y `FilaProyecto` de Operar recibe el cockpit **por prop**: es un helper de servidor, no un componente cliente, así que no puede leer la URL.
**Detalle de Next 16 que hay que tener presente al tocar rutas:** `params` es un **Promise** y se `await`ea; los componentes cliente usan `useParams()`. Está en `node_modules/next/dist/docs/`, que es lo que manda el `AGENTS.md` del dashboard. Y ojo con el `.next/` viejo: después de mover el árbol, `typecheck` tira errores fantasma de `.next/types/validator.ts` apuntando a las rutas viejas hasta que se borra la carpeta.
**Qué sigue — Fase 4 (`run-plan` v2 + motor parametrizado + dispatcher):** es la que **obliga al re-import** y la que después habilita correr la `017`. El checklist de las 7 URLs de PostgREST que hay que tocar además de los 6 placeholders está en el cierre 82. Y sigue pendiente lo de Mani: limpiar el `@casper_smc` duplicado y aplicar la `016` **antes** de que Vercel deploye esto.

**2026-08-02 (cierre 83) — Fase 2 del refactor multi-tenant: la Capa 1, el tenant que el compilador no deja olvidar (Claude).**
**Qué se hizo:** la Capa 1 de [ADR-047](../adr/ADR-047-aislamiento-en-dos-capas.md) entera. `domain/tenant.ts` (puro, 13 tests nuevos) · **`lib/supabase/scoped.ts`** · `lib/tenant.ts` (el resolvedor) · `lib/auth.ts` con `exigirTenant` · **los 13 archivos de `lib/` que hacían IO** · los **21 de `app/`** que los llaman. `typecheck` en 0, **151 tests** verdes, `build` verde. **No toca prod**: es tipado y ruteo de un parámetro. Rama y PR: [#3](https://github.com/Agencia-Dani/pipeline-creacion-contenido/pull/3).
**La pieza que importa es `scoped.ts`, y su garantía está verificada, no afirmada.** Envuelve el acceso a Supabase de forma que no se pueda construir una query sin `TenantContext`, y el mapa tabla→grano (24 entradas) vive ahí y solo ahí. Lo probé con dos archivos de prueba que **tienen que romper**: una tabla que no está en el mapa da `TS2345` con la lista de las válidas, y `scoped()` sin contexto da `TS2554`. Los dos casos son error de compilación, que es la única forma conocida de ganarle a un `.eq()` olvidado.
**El typecheck produjo la lista de trabajo y no dejó terminar hasta vaciarla — 83 → 0.** Ese es el punto entero de la fase y funcionó tal cual: no enumeré un solo archivo a mano.
**⚠️ El orden de deploy es un requisito, no una recomendación: la `016` va ANTES de este código.** El BFF pasó a pedir `client_id`/`instance_id` y a nombrar los uniques nuevos en los `onConflict` de `lib/transcripciones.ts`. Contra una base sin la `016` eso es columna inexistente y `42P10`. Es la misma trampa que la `014`, que también tenía que ir antes de su código. Quedó escrito en el README del dashboard, arriba del setup.
**Lo que cambió de comportamiento y conviene saber (todo no-op con un tenant):** los knobs pasan a ser **por instancia** (la PK compuesta de la `016`, así que un `update` por `clave` ya no puede pisar el ajuste de otra empresa) · el single-flight del buscador pasa a ser **por instancia** (ADR-050) · calificar un candidato de otro cockpit ahora devuelve *"ese candidato ya no está en el feed"* en vez de escribirlo — el filtro entra en el `update`, no solo en el `select` · un usuario **sin `client_id` cae en `/sin-rol`**, igual que uno sin rol: las dos son la misma alta a medias, y el `insert` manual del alta ahora lleva cliente.
**La fachada quedó a medio camino, a propósito y con el borde declarado.** `/api/engine/run-plan` no tiene sesión (se autentica por header compartido), así que resuelve su tenant con `contextoDeFachada`: acepta `?instancia=` **opcional** —forward-compatible con ADR-048— y si no viene cae a la única instancia activa. **Con dos instancias y sin parámetro responde 400 en vez de adivinar**, que es el fail-closed de ADR-028 §4 aplicado a lo que sabemos hoy: servirle al motor la config de otra empresa es peor que no servirle nada. El contrato **sigue en `version: 1`**; subirlo a 2 y volver el param obligatorio es la Fase 4.
**Un detalle de tipos que va a volver si alguien toca `scoped.ts`:** el genérico recursivo (`Q extends Filtrable<Q>`) sobre el builder de supabase-js hace que tsc se rinda con `TS2589` *"type instantiation is excessively deep"*. Está resuelto con un tipo plano y un cast localizado, comentado en el archivo. Mismo motivo para el `as string` del schema: sin `database.types.ts` generado, los genéricos ya colapsan a `any` y el literal no compra tipado, pero sí arma una unión de 2×24 que revienta.
**Qué sigue — Fase 3:** rutas `[cliente]/[pipeline]`, el `layout.tsx` resolviendo `(cliente, pipeline) → instance` en el servidor, y el selector de empresa/pipeline (visible solo si el usuario tiene más de uno). **El modelo ya está**: `resolverContexto(usuario, cliente, pipeline)` acepta los dos segmentos desde hoy y no los recibe de nadie — la Fase 3 es cablearlos, no rediseñar. Y sigue pendiente lo de Mani: limpiar el `@casper_smc` duplicado y aplicar la `016`.

**2026-08-02 (cierre 82) — Fase 1 del refactor multi-tenant: la fundación de datos, partida en dos migraciones y verificada contra un Postgres real (Claude).**
**Qué se hizo:** [`core/schema/016_multi_tenant.sql`](../../core/schema/016_multi_tenant.sql) + [`017_multi_tenant_cierre.sql`](../../core/schema/017_multi_tenant_cierre.sql). **Ninguna está aplicada en prod todavía** — se aplican a mano, y la `017` ni siquiera se puede correr hasta después del re-import. Rama `refactor/multi-tenant-fase-0-adrs`.
**🧪 No es SQL "revisado": se corrió.** Se levantó un Postgres 16 descartable en Docker, se aplicaron las **15 migraciones en orden** sobre datos sembrados parecidos a prod, y encima la `016` y la `017`. Todo verde de cero, dos veces. Lo que eso probó, y que ningún review a ojo hubiera dado: la regresión de la `015` **no vuelve con dos tenants** (3 filas para 3 referentes), la misma cuenta vigilada por dos empresas devuelve **0.44 y 0.99 por separado** en vez de un número contaminado, y el `on_conflict` viejo del motor tira exactamente `42P10` en cuanto se corre la `017`. *(Stubs necesarios para que las 15 corran fuera de Supabase: `auth.users`, `auth.uid()`, los roles `authenticated`/`service_role`. Está en el scratchpad, no en el repo.)*
**🚨 Tres trampas de orden que el plan no tenía, y una es cara.** El plan traía la de siempre (nullable → backfill → not null). Las otras dos salieron de preguntar **quién escribe cada tabla**:
· **Un `unique` que n8n nombra en un `on_conflict=` NO se puede reemplazar antes del re-import.** PostgREST exige que el arbiter coincida con un unique existente; si no, `42P10` y el insert muere entero. Son dos: `processed_items?on_conflict=platform,external_id` (motor, **antes** de transcribir) y `outputs?on_conflict=external_id` (archivado, **al entregar** — o sea después de pagar Apify + Supadata + Haiku). Correr el §4.3 del plan tal cual en la Fase 1 **rompía el dedup del motor en la corrida siguiente**. Por eso los dos van por expand/contract: el unique nuevo nace en la `016`, el viejo muere en la `017`. **Es la razón entera de que la Fase 1 sean dos archivos.**
· **Toda columna de tenant nace con un DEFAULT puente al piloto.** Entre la `016` y la Fase 2/4 hay una ventana donde el BFF y n8n siguen insertando sin mandar tenant. Sin default esas filas nacen en null y, apenas la Capa 1 empiece a filtrar, **desaparecen de las pantallas** — un candidato pagado que no se ve. Los defaults mueren en la `017`, y ese es el único motivo por el que son seguros.
**⚠️ Y una corrección al SQL del plan que rompía el archivado:** el índice nuevo de `outputs` **no lleva `where external_id is not null`**. La `005` sacó ese predicado justamente porque Postgres no acepta un índice parcial como arbiter de ON CONFLICT y PostgREST no repite el predicado (`42P10`, verificado en vivo en su día). Copiarlo del plan reintroducía el bug que la `005` arregló.
**🔎 Dos huecos de inventario, no de criterio:** (1) **`app.transcripciones` no estaba en la lista del plan** y es de grano instancia — traía además un **sexto** unique global (`plataforma, external_id`), de la misma familia que los cinco que el plan sí encontró. Se agregó a la tabla de granos de [ADR-046](../adr/ADR-046-el-cockpit-es-multi-tenant.md). (2) **Las vistas no son 8, son 12**: faltaban `v_embudo_descubrimiento`, `v_historico_seleccionados`, `v_selecciones_por_dia` y `v_senal_tema`; y `v_falsos_negativos` no existe con ese nombre — es `app.v_auditoria_descartes` (ADR-036).
**Dos decisiones de diseño que vale la pena conocer:** `outputs.instance_id` **se deriva con un trigger** desde `runs`, no con un default — es el dato exacto en vez de una suposición (mismo principio que ADR-041) y de paso **no le suma un séptimo ítem al checklist del re-import**: el archivado sigue insertando igual. Y el tenant piloto **se autodetecta** en un bloque de guardas en vez de escribirse en el archivo, así que no hay un solo id en el repo.
**Las guardas de la `016`, que abortan antes de tocar nada:** las 15 previas aplicadas · **`@casper_smc` duplicado** (probado: aborta con el handle en el mensaje) · exactamente 1 cliente y 1 instancia, con la salida manual documentada si algún día no.
**📋 Lo que esto le AGREGA al checklist de la Fase 4 (URLs exactas, ya relevadas):** además de los 6 placeholders, el re-import tiene que meterle la instancia a **7 lecturas/escrituras que hoy no filtran nada**: `processed_items?select=external_id,platform&limit=50000` (⚠️ **la más importante: el constraint arregla la escritura, pero el dedup sigue leyendo GLOBAL hasta que este GET filtre**) · `processed_items?on_conflict=` → `instance_id,platform,external_id` · `outputs?on_conflict=` → `instance_id,external_id` · `candidatos?select=external_id&external_id=not.is.null` · `candidatos?estado=neq.nuevo`, `?estado=eq.nuevo&creado_en=lt.` (archivado) · `referentes_propuestos?select=handle,plataforma` · y **`v_senal_seleccion` en los dos workflows**, que ahora devuelve una fila por instancia: sin `&instance_id=eq.`, el heat-score aprende del vecino.
**Verde:** `npm run validate` → 1670 checks, 0 errores. No se tocó código de app: typecheck/tests/auditor no tienen nada nuevo que mirar.
**Qué sigue — Fase 2 (Capa 1), y su punto entero es no enumerar archivos a mano:** `domain/tenant.ts` + `lib/supabase/scoped.ts` + los ~15 de `lib/`; `npm run typecheck` produce la lista y no deja terminar hasta que esté vacía. **Antes de eso, lo de Mani:** limpiar el `@casper_smc` duplicado (desde el cockpit, mirando qué proyectos cuelgan de cada fila) y aplicar la `016` en el SQL Editor. La `017` **no**: esa espera al re-import.

**2026-08-02 (cierre 81) — Fase 0 del refactor multi-tenant: los 5 ADRs (046–050). Cero código, a propósito (Claude, pedido de Alejandro).**
**Qué se hizo:** se ejecutó la **Fase 0** de [plan-multi-tenant.md §3](./plan-multi-tenant.md) — cinco ADRs en `docs/adr/`, el índice actualizado, y nada más. `core/` solo cambia con ADR y los ADRs eran justamente lo que faltaba, así que **no se escribió una línea de SQL ni de TypeScript**. Rama: `refactor/multi-tenant-fase-0-adrs`.
· **[046](../adr/ADR-046-el-cockpit-es-multi-tenant.md)** — el cockpit es multi-tenant: `client_id`/`instance_id` en `app` con **doble grano**, `clients.parent_id`, y los 5 uniques globales reparados. **Extiende ADR-003, no lo corrige:** cuando ADR-003 se escribió el cockpit era Airtable y el aislamiento lo daba la herramienta; cubrió el registro porque el producto no existía. Eso está dicho así en el ADR para que nadie lo lea como deuda sucia.
· **[047](../adr/ADR-047-aislamiento-en-dos-capas.md)** — dos capas, con **el disparador de la Capa 2 escrito**: entra *antes de que un segundo cliente real tenga usuarios en producción*, y la instancia de prueba de la verificación **no** lo dispara (cliente ficticio, sin usuarios). Queda dicho por qué la Capa 1 no se salta ni con RLS puesto: la fachada y n8n **no tienen sesión de usuario**, ahí el único filtro posible es el tipado.
· **[048](../adr/ADR-048-run-plan-v2-motor-por-instancia.md)** — `run-plan` v2 + `?instancia` obligatorio + `/api/engine/instancias`, y `<<INSTANCE_ID>>` **derogado como constante de instancia**.
· **[049](../adr/ADR-049-un-pipeline-sus-tablas.md)** — un pipeline, sus tablas; el enum `app.plataforma` no se toca.
· **[050](../adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md)** — el dispatcher dispara **una ejecución por instancia**, con la tabla punto-por-punto de por qué **no** es el workflow padre que ADR-006 descartó (y ADR-006 ya lo autoriza como C9, textual).
**⚠️ Lo único que se encontró y NO se parcheó — para Mani, es una decisión, no un bug de esta sesión.** [ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md) declara en sus consecuencias que `core/contracts/run-plan.md` **sube a `version: 2`** por el flip de ids (record id de Airtable → uuid). **Ese bump nunca se ejecutó: el contrato sigue en `1`**, y con razón — el flip terminó siendo pass-through (`fields.uuid` viajaba en paralelo, el mapa `uuidDe` quedó identidad) y por eso el paso 3 de D7 no necesitó un tercer re-import. O sea que la decisión de ADR-035 está bien; lo que quedó viejo es esa línea suya. **No se editó ADR-035.** ADR-048 lleva una *Nota de numeración* explicando la historia y declarando que **él** es el que sube el contrato a v2 —el mismo idioma que ADR-035 usó para su propia nota de numeración con ADR-029—. Si Mani prefiere que ADR-035 lleve una enmienda apuntando acá, es una línea.
**Verde:** `npm run validate` → **1670 checks, 0 errores** (la baseline en `main` es 1625; el delta son los 5 archivos nuevos entrando al escaneo de secretos — se verificó stasheando). No se corrió nada más porque **no se tocó código**: ni `typecheck`, ni `npm test`, ni `auditar-workflows.mjs` tienen nada nuevo que mirar.
**Qué sigue — Fase 1, y el orden importa más que el SQL:** `core/schema/016_multi_tenant.sql` ([plan §4](./plan-multi-tenant.md)). Tres cosas que no se pueden invertir: (1) **🧹 limpiar el `@casper_smc` duplicado ANTES** —con `client_id not null` esa fila se congela en el modelo nuevo, y hay que mirar qué proyectos cuelgan de cada una antes de borrar, porque borrar la equivocada le saca fuentes a un proyecto (ADR-045 ya permite hacerlo desde el cockpit, sin SQL); (2) las columnas **nacen nullable → backfill → recién ahí `not null`**, o la migración falla sobre datos vivos; (3) `v_salud_referentes` es la vista delicada: la regla de la [`015`](../../core/schema/015_salud_referentes_una_fila.sql) —*"todo join nuevo tiene que garantizar UNA fila por referente"*— se respeta, porque agregar el eje de tenant es exactamente el cambio que reintroduce el fan-out.

**2026-08-02 (cierre 80) — Sacar el techo de gasto: el cap no era el problema, y sacarlo así habría roto la corrida. Más: borrar records en el cockpit (Claude, pedido de Mani).**
**Qué se hizo:** Mani trajo tres cosas — recencia ya en 100, "no debería haber cap para regular costos, quiero el motor lo más preciso posible trayendo el `N` por proyecto, revisá qué lo está afectando", y "dejame borrar voces, proyectos y referentes". La revisión del punto 2 dio vuelta el pedido: **el cap no era lo que frenaba, y sacarlo tal como estaba el motor habría matado la corrida y quemado videos para siempre.** Salieron 2 ADRs ([044](../adr/ADR-044-todo-nodo-caro-tiene-presupuesto.md), [045](../adr/ADR-045-se-borra-solo-lo-que-nunca-produjo-nada.md)) y todo el código está listo; el re-import es de Mani (§Pendiente vivo).
**🚨 El hallazgo: `Traducir (Claude Haiku)` era el techo real y el único nodo caro SIN red.** Serial, con `sleep(1000)`, sin presupuesto. Los referentes son casi todos ingleses: **170 traducciones sobre 191 transcritos** el 31/07 (89%). `Transcribir` tenía presupuesto justamente porque el watchdog del task runner mata el **nodo entero** a los 900 s y la corrida muere sin entregar nada — pasó 3 veces el 07-10. A `Traducir` no se lo habían puesto nunca. *El sesgo que lo escondió: el nodo tenía "Haiku" en el nombre y se leía como barato. Lo caro no era la llamada, era el `sleep` × 170.*
**🩸 Y la asimetría que hay que memorizar, porque decide qué se puede aflojar: el cap POSTERGA, el presupuesto QUEMA.** `POST processed_items` corre **antes** de `Transcribir` (ADR-029, enmienda del 31/07), así que el video que se queda sin presupuesto ya está en la memoria de dedup: vuelve sin transcript, el gate lo tira como `sin_guion` (ADR-030) y **no se reintenta nunca**. El corte de `cap_top_n` pasa *adentro* de `Heat-score v1`, antes de ese POST, y vuelve la corrida siguiente. Un techo seguro y uno destructivo, con el mismo aspecto desde la pantalla de Ajustes.
**La coincidencia que confirmó el diagnóstico:** con `CONCURRENCIA = 8` a ~27 s/video, 840 s dan ~250 videos — **exactamente `cap_top_n = 250`**. Los dos techos estaban calibrados al mismo punto, así que bajar uno no destrababa nada. Y el aire sin usar era enorme: Supadata pago da 10 req/s y 8 en vuelo iniciaban 0.3.
**⚠️ Lo que la revisión tuvo que decir y no era lo que el pedido esperaba: esto NO acerca ningún proyecto a su `N`.** El cuello es el **supply**: todos los proyectos, en todas las corridas, dicen `razon_faltante: supply`. Los 4 proyectos de comunicación comparten **7 cuentas** y piden 60 videos entre todos, y cada video va a **un solo** proyecto. La corrida más gorda que hubo entregó **139 de 400**. El dedup se come el 93% dos horas después de una corrida (491 pretrim → 35). Lo que estos cambios compran es que sacar el techo **no rompa nada**; la palanca de verdad sigue siendo sumar referentes, igual que dice ADR-043.
**El otro hallazgo, anotado y no tocado:** `cap_top_n` **corta global, no por proyecto**. Medido en la propia corrida de verificación de Mani (`191ddc8b`, cap en 10): *Trading fast tips* se llevó los 10 y los cuatro de comunicación quedaron en `evaluados: 0`. Cuando muerde no recorta parejo, mata proyectos enteros. Con el techo en 0 no se plantea; repartirlo sería un ADR propio.
**Borrar records (ADR-045):** la pregunta no era de UI sino de FK, y había dos mundos. **Los referentes salen limpios** (la puente cascadea y su historia se guarda por *handle en texto*, no por FK: `candidatos.referente`, `descartes.referente`, `v_senal_seleccion` desde `outputs`). **Las voces y los proyectos no**: `candidatos.proyecto_id`, `candidatos.voz_id`, `descartes.proyecto_id` y `proyectos.voz_id` son FK sin `on delete`. Se descartó el `cascade` (borraría 143 candidatos sin leer con el mismo click que borra un proyecto vacío) y el `set null` (cambia un error claro de Postgres por filas que se ven bien y no significan nada — la familia exacta que este repo viene cazando). Queda **la regla: se borra solo lo que nunca produjo nada**, y el rechazo dice **cuánta** historia hay y ofrece apagar. Hoy eso deja borrable solo *Trading Psychology*, y es correcto. Bonus: el `@casper_smc` duplicado ya se limpia sin SQL.
**Verificación en vivo, contra la base real:** el rechazo (*«Comunicación en empresas tiene 24 videos en el feed…»*, modal abierta, URL sin cambiar) y el camino feliz, con un proyecto y un referente **de prueba creados y borrados** para no tocar el dato de Mani — la fila desaparece, la modal cierra, la lista refresca y `app.eventos` queda con el registro completo. 138 tests · typecheck · build · validador (1616 checks) · `auditar-workflows.mjs` sin hallazgos · `test-nodos.mjs` verde con sección nueva de `Traducir`.
**El detalle de test que vale guardar:** el caso del presupuesto de `Transcribir` empezó a fallar al subir el pool a 24 — los 30 videos arrancaban en dos vueltas y ningún budget razonable llegaba a morder. Se arregló **fijando la concurrencia en 2 en ese test**, no aflojando el assert: el test prueba el presupuesto, no el throughput, y mezclarlos era lo que lo volvía frágil.
**🔄 Y el cierre se dio vuelta a último momento, que es la mejor parte:** Mani re-importó, se puso el techo en 0, se verificó punta a punta… y al mirar qué iba a pasar en la corrida apareció lo que la revisión no había mirado. **`cap_top_n` no era freno de gasto: era el que raciona el supply.** `Leer procesados` lee `processed_items` **entera y sin filtro de fecha**, y el POST corre **antes** de transcribir ⇒ todo lo transcrito queda en la memoria de dedup para siempre, pase o no el gate, se entregue o no. Y la entrega la topan los `N` (`sum = 100`), no el cap. O sea: **con 0 se transcriben ~500, se entregan los mismos 100, y se queman ~265 que no vuelven.** Se revirtió a 250 en el acto. *Lo que lo destapó no fue leer más código: fue preguntarse "¿qué números va a dar esta corrida?" antes de dispararla, y darse cuenta de que el de entregados no se movía.*
**Y el dato que reordenó la prioridad entera: el cuello está río abajo.** **143 candidatos sin calificar** contra **9 calificados en total** desde que el feed existe. Traer más videos no es el problema de esta semana, y la recomendación anterior (subir `Resultados por cuenta` de 40 a 50) queda **archivada hasta que el equipo esté al día**: hoy solo aumentaría lo que se quema.
**La regla que deja, y vale para cualquier límite del sistema:** antes de aflojar uno, preguntá **qué está limitando de verdad**, no qué dice su nombre. Este se llama *Videos a transcribir por corrida* y se lee como presupuesto de plata; lo que gobierna es cuántas semanas dura el pozo de videos frescos.
**Siguiente sesión:** la corrida (§Pendiente vivo tiene qué mirar, en orden de qué avisa antes). Después, lo que sigue abierto es que **el equipo consuma el feed** — todo lo demás río arriba está bloqueado por eso. Si en algún momento la capacidad de calificación sube, la solución de fondo para el `N` sigue siendo escalar lo que se le pide a Apify **por proyecto** (`ceil(N / (referentes × tasa))`), identificada en ADR-038 y todavía sin hacer.

**2026-08-01 (cierre 78) — La primera revisión de UI/UX sobre el cockpit live: 10 observaciones, 3 bugs, 3 ADRs (Claude, pedido de Mani).**
**Qué se hizo:** Mani usó la primera versión live y trajo 10 observaciones de layout/UX pensando en Majo y Jero. Se ejecutaron las 10 en un solo pase, sin tocar `Workflows/` ni `core/`: cero re-imports, cero migraciones. Commit `dce25a3`, deployado y verificado contra prod.
**Lo que enseñó la sesión, y es el patrón: tres de las diez "preferencias" eran bugs, y ninguno se veía como bug.**
· **«Todos los videos salen sin thumbnail»** → no era el expiry, que es lo que decía la hipótesis del cierre 77. Los CDNs de Meta mandan `cross-origin-resource-policy: same-origin` y **el browser bloquea el `<img>` cross-origin siempre**. La hipótesis se había verificado con `curl`, que da 200 porque **curl no aplica CORP**: la herramienta con la que medimos era ciega justo a la causa. *Corolario: para verificar algo que solo hace el browser, hay que medirlo en un browser.* (El expiry existía igual y se midió: **~5 días** contra una cadencia de 7, y por eso el proxy además cachea en Storage — ADR-037.)
· **«No veo el botón del buscador»** → `BotonBuscar` estaba escrito y **no lo importaba nadie** desde el commit `270d107` que lo creó. Un `grep` de una línea lo dijo. La causa de fondo es de ubicación: el componente y su acción vivían en `curar/sugeridos/`, mezclando "aprobar es curar" con "disparar es operar", y nadie lo montó. Ahora `buscarAhora` está al lado de `correrAhora`.
· **«Las barras negras se salen»** → se salían porque **no es un embudo**: `asignados` (1585) > `colectados` (700) porque del fan-out al gate se cuentan filas `(video × proyecto)`, no videos. Se partió en dos embudos con su propia base. *El CSS estaba gritando un error del modelo, no de estilo.*
**Y la observación que obligó a discutir en vez de obedecer (ADR-038):** Mani pidió que Operar dijera «trae 15» en vez de «hasta 15», *"que sea un dato confiable"*. Pero `N` es un techo duro y la entrega es best-effort: las 3 corridas con `por_proyecto` dicen `razon_faltante: supply` en **todos** los proyectos. Cambiar la etiqueta habría convertido un dato honesto en una promesa incumplible. Se resolvió mostrando **tres números medidos** —`pide N · X cuentas · la última entregó Y`— con la razón y la palanca. *Se descartó un pronóstico calculado al mirar los datos: hay 3 corridas y son incomparables (49 · 4 · 1 para el mismo proyecto). Una mediana sobre eso es precisión falsa.*
**La trampa que se esquivó:** para dejar un solo knob de cantidad, los 3 globales pasaron a `visibilidad = 'dev'` en vez de borrarse. Borrar la fila de `Días de recencia` **habría tirado la recencia de 100 a 7 en silencio**, porque `Armar plan de corrida` cae al `Config` del motor (que tiene 7). Habría sido la quinta de la familia "no falla, sale verde, deja un número peor".
**Verificación:** 116 tests · typecheck · build · validador (1517 checks). Y contra **producción**: `/operar` sin la palabra «hasta» · `/api/miniatura` 200 con la imagen (1080×1920, redirigiendo a Storage), **307 sin sesión**, **400 al host fuera de la allowlist** · fachada intacta (3 voces · 15 referentes · **18 ajustes**, recencia 100 llegando al motor) · en el browser, las 2 miniaturas vivas renderizando y ninguna barra excediendo su riel.
**Lo que queda:** subir `Resultados por cuenta de referente` a 40 (sigue en 20, y ahora es dev-only así que la pantalla no lo recuerda) y avisarle al equipo que la pantalla cambió — el onboarding ya está reescrito.

**2026-08-01 (cierre 77) — La corrida que estrenó las escrituras, y el paso 3: D7 cierra (Claude, pedido de Mani).**
**Qué se hizo:** Mani disparó la corrida que faltaba y con eso las escrituras de D7 dejaron de ser teoría; después salió el **paso 3 del expand/contract** a producción (commit `2260ec0`). D7 está cerrado del lado del código.
**La corrida (17:24 UTC, `ok`):** 2 candidatos con `proyecto_id`/`voz_id` como FK uuid, 1 descarte, 3 `processed_items` con `run_id`, `registro_dedup: ok`. **Se corrió barata a propósito** —`Días de recencia` 7 + `Resultados por cuenta` 10 ⇒ 140 results de Apify en vez de 280, **≈$0.39**— y eso vino de medir antes: con las tarifas de `app.tarifas`, una corrida sale ~$1 y **la mitad es Apify, que se paga ANTES del dedup**. El knob que da ganas de tocar, `Candidatos por corrida`, **no ahorra un peso**: corta en `Armar candidato`, después de transcribir. ⚠️ Los 2 knobs quedaron recortados; hay que devolverlos.
**El paso 3, y la decisión que lo hizo barato:** el `id` del contrato pasa a ser el uuid en voces/proyectos/referentes. **No hizo falta un tercer re-import**, y no por suerte: los cuatro consumidores en n8n resuelven el uuid con `uuidDe[x.id] = x.fields.uuid`, así que sirviendo los dos ids **iguales** el mapa queda **identidad**. De ahí que `fields.uuid` **no se borre** (sacarlo sí obligaría a re-importar) y que las columnas `airtable_id` sigan en las tablas hasta D8. *La regla que deja: cuando dos lados no se deployan juntos, un campo redundante cuesta menos que una corrida.*
**🚨 Y apareció la CUARTA pérdida silenciosa de D7 — la arregla el mismo paso 3.** `Destilar criterios` indexa `projMeta` por el `id` del plan y busca por `candidatos.proyecto_id`, que desde D7 es uuid: con el `id` en record id **nunca matcheaba** ⇒ `byProj` vacío ⇒ **cero destilaciones, en verde, sin avisar** (ADR-022 muerto). No se había notado porque destilar pide ≥4 calificados y hay 0 — o sea habría aparecido la **primera semana que el equipo calificara**, que es peor. Misma familia que los 3 del grilling: no falla, sale verde, deja un número en cero. **El corolario de método: un corte de ids no termina cuando el contrato compila, termina cuando listaste quién INDEXA por ese id, no solo quién lo escribe.**
**Verificación:** A/B contra la fachada de producción — mismo reparto referente→proyecto (3/3/6/5), mismos 16 pares fuera de ámbito (referentes de los 2 proyectos de Trading, apagados; el motor los saltea con `if (!projects[proy]) return`), demás campos idénticos. 114/114 tests · typecheck · build · validador (1517 checks) · `auditar-workflows.mjs` sin hallazgos. Y post-deploy contra prod: todos los ids uuid, `fields.uuid == id`, cruces válidos.
**⚠️ Lo que sigue sin probarse, y es lo único:** `fecha_calificacion` (hallazgo 4). Lo escribe **la app al calificar**, no n8n, así que ninguna corrida del motor lo toca — hay 0 candidatos calificados. Son 2 min en `/curar/feed` y conviene hacerlo **antes de un domingo 18:00**, para que el archivado tenga trabajo real y cierre la cadena `fecha_calificacion` → `outputs.calificado_en` → `v_metricas_calidad` de una.
**Siguiente sesión:** con el hallazgo 4 verde, arranca **D7.5** (que la app escriba `outputs` al calificar, para matar el archivado — enmienda ADR-014, es `core/`, va con `/grill-with-docs`) o **D8** (apagado de Airtable + la migración `014` de limpieza: balde 2 + las columnas `airtable_id`).

**2026-08-01 (cierre 76) — D7: Airtable sale del sistema. El corte de escritura, de punta a punta (Claude, pedido de Mani).**
**Qué se hizo:** el grilling completo de D7 y después su implementación entera — 9 commits en `d7-corte-escritura`, mergeados a `main`, con la migración `013` aplicada, el dato migrado y los 3 workflows re-importados por Mani. **Cero `api.airtable.com` en los 3 workflows y en toda la app**; `lib/airtable.ts`, `domain/sombra.ts` y los 4 scripts del modo sombra se borraron. El archivado bajó de 35 nodos a 20.
**La decisión raíz es [ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md): PostgREST directo, no endpoint de la app.** La simetría con ADR-028 era falsa — n8n ya escribía `runs`/`outputs` directo desde el día 1, y meter la app en el camino de la **entrega** la vuelve dependencia justo donde el sistema es fail-open a propósito. La regla que queda, y cubre los 3 workflows y los que vengan: **n8n LEE su config por la fachada, ESCRIBE sus resultados por PostgREST.**
**🚨 De los 6 hallazgos del grilling, 3 eran pérdidas SILENCIOSAS — de las que no fallan, salen verdes y dejan un número en cero.** (a) **`fecha_calificacion` no tenía autor**: en Airtable era un `lastModified` que se calculaba solo, y de él cuelga `outputs.calificado_en` → `v_metricas_calidad`, que filtra `calificado_en is not null` ⇒ la pantalla *Calidad* habría dado **cero filas** y la **precisión de entrega**, la métrica norte de ADR-021, habría desaparecido sin que nada fallara. (b) **`falsos_negativos` no sale de `runs.metricas`** sino de contar descartes auditados, así que ninguna vista lo cubría y D7 lo mataba **por segunda vez** — lo arregla [ADR-036](../adr/ADR-036-los-descartes-no-se-barren.md): los descartes dejan de barrerse y el contador pasa a ser vista viva. (c) **el embudo del descubrimiento** se quedaba sin reemplazo (`v_embudo_semana` filtra `workflow='motor'`).
**🚨 Y uno medido, que era el peor: `Referentes propuestos` es N:M.** Se midió contra el dato vivo antes de escribir código: **las 8 propuestas tenían 2 proyectos cada una**, y el schema `009` les daba un `proyecto_id` simple ⇒ el corte tiraba **8 de 16 pares, el 100% de la atribución**. Es el bug del corte 2/4 en la misma forma exacta, pero completo. Enmienda de [ADR-032](../adr/ADR-032-referente-proyecto-es-n-a-n.md) + tabla puente. **Que cayera en el descubrimiento es exactamente por qué se eligió como piloto**: si quedaba para D8, aparecía después de re-importar el motor.
**La regla de método que deja este corte, y completa la trilogía:** el 2/4 dejó *"medí el dato vivo contra el schema que lo va a recibir"*, el 3/4 dejó *"listá quién ESCRIBE cada campo"*, y D7 agrega **"listá qué campos NO los escribía nadie, porque Airtable los calculaba solo"**. Los `createdTime`, `lastModified` y las columnas-fórmula no tienen autor: al migrar se vuelven NULL en silencio y se llevan puesto lo que dependía de ellos.
**Lo que el corte simplificó, y conviene no deshacer:** mueren `typecast` (o sea desaparece la clase "proyecto fantasma": un id mal formado ahora **viola una FK** en vez de crear datos malos en silencio), los batches de 10, y la traducción de ids. `external_id` entra al schema **con `unique`**, así que la 3ª línea del dedup de ADR-029 pasa de procedural a estructural — pero **`Leer feed vivo` NO se borró**: el constraint atrapa el duplicado *después* de pagar la transcripción, el nodo lo mata *antes* (es lo que bajó la corrida del 31/07 de 31 a 9,4 min).
**Muere ADR-033.** Los criterios destilados y su escritor volvieron al mismo lugar (`Destilar criterios` PATCHea `app.proyectos`). Era una regla con fecha de vencimiento puesta en D7, y esta fue la fecha. Se verificó antes de cortar que Postgres y Airtable tenían **valores idénticos**: no se perdió nada.
**Limpieza de peso muerto (auditoría del mismo día).** Los 18 knobs de `Ajustes` están **todos vivos** — ahí no había nada que tirar. Sí lo había en otro lado: **11 nodos muertos** (la cadena de Métricas, la de salud de referentes, y la de promoción del descubrimiento, que estaba muerta desde el corte 2/4), 3 nodos que quedaron **huérfanos** al morir sus únicos consumidores, y `app.eventos`, que 7 actions escribían y **nadie leía** — ahora tiene pantalla dev-only en *Entender*. Balde 2 (4 vistas sin consumidor + 6 columnas write-only) queda para una migración `014` aparte, a propósito: si D7 salía mal, no había que bisectar entre el corte y la limpieza.
**➕ Enmienda a [ADR-020](../adr/ADR-020-motor-descubrimiento-referentes.md): el buscador perdió el cron y ahora es un botón** en *Curar → Sugeridos*. La razón es medida: había **8 propuestas pendientes y 0 resueltas**, o sea que la bandeja se llenaba más rápido de lo que el equipo la vacía, y cada corrida paga 3 actores de Apify + Haiku. Se hizo **en el mismo re-import** porque agregarlo después costaba un cuarto re-import. El guard contra doble click vive en la Server Action (`hayBusquedaViva`), no en el workflow: hay un solo camino de entrada y el peor caso es una corrida repetida.
**Herramientas que se ganaron el sueldo:** `auditar-workflows.mjs` atrapó **dos veces** conexiones rotas por renombrar nodos (el rename deja los destinos apuntando al nombre viejo), y `test-nodos.mjs` atrapó el cambio de forma del feed vivo. Sin ellos, los dos se veían recién en producción.
**⚠️ Lo que NO se probó:** ninguna **escritura** de n8n a Postgres se ejecutó todavía. La lectura sí (fachada, corte, vistas, todo contra datos reales). El paso 3 del expand/contract queda pendiente, gateado por una corrida verde.
**Siguiente sesión:** verificar la corrida (§Pendiente vivo tiene las queries), después el paso 3 del expand/contract. Con eso cierra D7 y arranca **D7.5** (que la app escriba `outputs` al calificar, para matar el archivado) o **D8** (apagado de Airtable, todo no-código). Skills: `/diagnose` si la corrida falla, `/grill-with-docs` antes de D7.5 — enmienda ADR-014, que es `core/`.

**2026-08-01 (cierre 75) — D6: el feed de calificación, y el dato que corrigió el diagnóstico a mitad de camino (Claude, pedido de Mani).**
**Lo que se construyó:** las 3 pantallas del espacio de trabajo. **`/curar/feed`** (mazo de tarjetas compactas que se abren como el expand de Airtable, agrupadas por proyecto y por heat descendente adentro, con filtro sin-calificar/🔥/aprobados/todos), **`/curar/descartes`** (la auditoría del gate) y **`/curar/historicos`** (todo lo aprobado de todas las semanas, de a 25). Directo a `main`.
**🚨 La medición que decidió la forma, y el error que corrigió a mitad de sesión.** Arranqué diciendo que el loop de calificación "nunca arrancó" porque los 145 candidatos vivos estaban todos en `nuevo`. **Era falso y lo desmintió `outputs`: hay 79 candidatos calificados entre el 01 y el 26 de julio** (24 aprobados / 55 descartados = 30% de precisión de entrega). Los 145 en `nuevo` eran de las corridas de ese mismo día. Lo que el dato sí mostró, y sostiene el diseño: **11 de 79 (14%) tienen `estado` decidido y ningún emoji** — la fricción de dos campos es medible, y el que se pierde es siempre el emoji, o sea justo el campo del que depende ADR-022 para elegir ejemplos. **La lección de método: medí antes de diagnosticar, y medí en la tabla correcta — el feed vivo dice qué falta hacer, no qué se hizo.**
**La decisión de diseño, que es [ADR-034](../adr/ADR-034-calificar-es-un-solo-acto.md): calificar es UN acto y el Estado se deriva** (🔥/👍 ⇒ aprobado · 👎 ⇒ descartado). Enmienda el glosario, que los declaraba "distintos a propósito". Los dos campos se siguen escribiendo con el mismo vocabulario, así que **ninguna máquina se entera** — el archivado sigue filtrando `NOT nuevo` y `Destilar` sigue eligiendo los 🔥. El precio, explícito: se pierde "buen video pero no lo quiero", que ahora vive en `notas_equipo`.
**🚨 El otro hallazgo, y es el que más valor entrega: `veredicto` nunca se escribió, y no era una decisión.** 0 auditorías desde que la tabla existe, contra 79 candidatos calificados en el mismo período. La causa está en mapa-campos §5.1-1: **Airtable no deja configurar el permiso de un campo sin records en la página**, así que el equipo nunca *pudo* marcarlo. La API sí lo escribe — se verificó en vivo. Mientras estuvo en 0, `falsos_negativos` daba siempre 0 y eso se lee como *el gate está perfecto*. Por eso la pantalla va **encadenada al pie del feed**, no suelta.
**⚠️ D6 NO es un corte, y eso invierte una regla del procedimiento.** Airtable sigue siendo el **dueño** de `Candidatos` y `Descartes` hasta D7 (los escribe el motor y los lee el archivado en **7 nodos**), así que la app cambia la superficie, no la propiedad. Consecuencia contraintuitiva: las 2 tablas **SIGUEN** en el catálogo de sombra de `scripts/comun.ts` — la regla del corte 1/4 ("la tabla cortada sale del catálogo") no aplica porque no hay flip, y Postgres tiene que seguir siendo su espejo. Sin migración, sin re-import, sin tocar n8n.
**🖥️ Las pantallas se miraron en el browser antes de publicarlas** (procedimiento del corte 3/4, aplicado). Encontró 4 cosas que ningún test iba a encontrar: **(a)** las miniaturas se servían a **resolución completa** — 144 imágenes de 1080×1920 son ~15 MB por carga para mostrar recuadros de 200 px; Airtable ofrece `thumbnails.large` (512 px) y ahora sale de `urlDeMiniatura`, en `lib/airtable.ts`, una sola vez. **(b)** las tarjetas con la proporción real del video (9:16) hacían que **una fila llenara la pantalla**, que es exactamente lo que Mani pidió evitar: se recortan a 4:5. **(c)** el `<dialog>` nativo no se centraba — el reset de Tailwind pisa el `margin: auto` que trae `showModal()`; se arregla con `m-auto` y se verificó midiendo el DOM, no mirando el screenshot (la captura a scroll profundo engaña). **(d)** la razón del descarte estaba clampada a 3 líneas y se desbordaba: **es el dato con el que se decide el veredicto**, así que se muestra entera.
**🐛 Y un defecto de diseño propio, encontrado releyendo lo que había escrito:** la invitación a auditar descartes estaba condicionada a *"calificaste los 145"*. Con 145 semanales nadie los despacha de una sentada, así que **no se dispararía casi nunca** — la invitación faltaría justo en las sesiones normales. Ahora va siempre al pie del mazo; lo que cambia con la cola vacía es el énfasis, no la existencia.
**Verificación (en vivo, contra datos reales, y los 2 registros de prueba restaurados):** los 4 grupos con sus conteos exactos (53/23/31/38) y heat descendente adentro · **la calificación escribe los DOS campos** (`👍` + `aprobado`) y Airtable llena `fecha_calificacion` sola, con su fila en `app.eventos` · **`veredicto` escrito por primera vez** en la historia de la tabla, con su evento · el diálogo con header fijo, 462 px de scroll sobre 629 de contenido y el pie alcanzable · **el paginado del histórico verificado simulando páginas de 10 contra las 24 filas reales: sin saltos, sin repetidos, y el bucle termina** (con 24 registros el "Cargar más" no aparece, así que el borde no se probaba solo) · dashboard **128/128** (+19) · typecheck y `build` limpios con las 3 rutas · validador **1490/0** · auditor de workflows **0 hallazgos** · las 3 rutas redirigen a `/login` sin sesión.
**Próximo paso:** el hecho-cuando de D6 es el único que no se puede apurar — **una semana entera de calificación pasando por la app**. En Airtable quedan 2 páginas más para congelar (*Feed* y *Descartes*), que ahora entran en el mismo viaje que las 7 de §Pendiente vivo. Después, **D7**: el corte de escritura y el re-import #2. D6 le dejó el camino hecho — `/curar/historicos` ya lee `outputs` y no cambia, y las 2 tablas que D7 corta ya tienen superficie propia.
**Skills para la próxima sesión:** `/grill-with-docs` antes de D7 (hay un ADR sin escribir: endpoint de la app vs. insert directo a Postgres desde n8n) · `/handoff` al cerrar. Para mirar pantallas, la receta del cierre 74 sigue andando: `auth.admin.generateLink` con el service_role devuelve el token sin mandar mail.

**2026-07-31 (cierre 74) — D5 corte 3/4: Voces + Proyectos, y el loop de ADR-022 que el corte habría matado en silencio (Claude, pedido de Mani).**
**Lo que se construyó:** el tercer corte de config. Pantalla **`/curar/voces`** — las voces con sus proyectos **adentro**, no en dos páginas: la voz es la espina dorsal (apagarla apaga sus proyectos sin tocarlos), así que separarlas dejaba la consecuencia del click en la otra pantalla. Trae alta de voz y de proyecto, la N por proyecto con el global de placeholder, los criterios plegados (son 400–650 caracteres cada uno; con 6 abiertos la pantalla dejaba de ser una lista), el aviso de *voz prendida sin proyectos activos* y el de *proyecto activo cuya voz está apagada* — que es la trampa que hoy solo se ve en los logs de n8n. **Y `advertencia_criterios` por fin se muestra:** es la primera superficie que lo hace desde que existe ADR-022. Va en la rama `corte-3-voces-proyectos`.
**🚨 El hallazgo, y salió de listar quién ESCRIBE cada campo (no de leer el schema):** de los 8 campos de `Proyectos`, **2 no los escribe nadie del equipo**. `Destilar criterios` del archivado le pide a Haiku cada domingo un resumen de lo calificado y PATCHea `criterios_aprendidos` + `advertencia_criterios` **en Airtable**; el motor lee `criterios_aprendidos` por la fachada para el prompt del gate. Cortar la tabla entera dejaba al archivado escribiendo en una tabla congelada y al motor leyendo otra fuente: **el loop de ADR-022 muerto, sin un solo error**, y estrenando la pantalla que existía para mostrar justamente eso. Decisión de Mani: **[ADR-033](../adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md) — la unidad de propiedad es el CAMPO, no la tabla.** Esos 2 se leen de Airtable (fail-open) hasta D7, que es cuando su escritor se mueve. No afloja el "un dueño por dato" de ADR-027: lo aplica al pie, porque son datos distintos con un escritor cada uno.
**🚨 El segundo hallazgo: la documentación afirmaba algo falso y era caro.** El contrato, `lib/referentes.ts` y el cierre 73 decían que la traducción `id` = record id de Airtable "se cae en el corte 4/4". **Se cae en D7.** Cuatro nodos vivos lo consumen como record id, y el peor es `Preparar batch Airtable`: escribe `Candidatos.proyecto`/`.voz` como *links* **con `typecast: true`**, o sea un uuid **no da error** — Airtable **crea un proyecto fantasma** con el uuid de nombre y le enlaza el candidato. De ahí sale la otra decisión de Mani: **una voz o un proyecto nacidos en la app acuñan su record id en Airtable al crearse** (~15 líneas, se borran en D7). La alternativa —no dejar crear hasta D7— dejaba al equipo sin ningún lugar donde hacerlo, con la página de Airtable congelada.
**Este corte NO necesitó migración, y eso se supo antes de escribir código.** El schema `009` ya modelaba bien los dos dominios: medido contra el dato vivo, **los 6 proyectos tienen exactamente 1 `voz_default` y los 6 tienen `criterios_relevancia`**, o sea las dos constraints que Airtable no podía hacer cumplir (`voz_id not null`, `criterios_relevancia not null`) aguantan. Que el corte 2/4 haya necesitado un ADR y una migración y este ninguno es el resultado de medir primero, no la suerte.
**Verificación (todo lectura, cero créditos, cero escrituras en prod):** **A/B contra la fachada de PRODUCCIÓN** (que todavía lee Voces/Proyectos de Airtable) vs. la local (que los lee de Postgres): **mismo plan en los dos ámbitos**, 3 voces · 4 y 6 proyectos · 15 referentes · 18 ajustes · **0 diferencias** una vez normalizado que *Airtable omite lo vacío y Postgres dice `null`/`false`* · **replay del code node real `Armar plan de corrida`** alimentado por las dos fachadas ⇒ **mismo plan por contenido** (4 proyectos, 7 urls IG, N=100 resuelta, *Storytelling* con sus 5 referentes) · el script del corte en `--dry` verde · dashboard **109/109** (+15) · typecheck y `build` limpios con `/curar/voces` en la tabla de rutas · validador **1472/0** · auditor de workflows **0 hallazgos** (este corte no toca n8n, que es el punto).
**ℹ️ La única diferencia real, y queda anotada porque va a reaparecer:** el **orden** de las listas. Airtable devuelve el orden del grid (que cambia si alguien arrastra una fila), Postgres ordena por nombre. Entra en `ig_urls` (en qué secuencia se le piden las cuentas a Apify) y en `ig_owner_to_proj` (qué copia de un video se crea primero). Lo único que podría cambiar por eso es un **empate exacto** de relevancia y heat entre dos proyectos para el mismo video — un desempate que ya era arbitrario. El orden nuevo, además, es estable; el viejo no lo era.
**🖥️ Y por primera vez las pantallas se probaron EN EL BROWSER.** Los 3 cortes anteriores se publicaron sin verlas ("entrar pide magic link"). Se resuelve con `auth.admin.generateLink` y el service_role, que **no manda ningún mail**: devuelve el token, se pega en `/auth/confirm` y hay sesión local. Encontró 3 cosas que ningún test iba a encontrar: (a) el nombre de una voz y el de un proyecto eran dos inputs idénticos y **la jerarquía —que es la regla del sistema— no se veía**: se arregló con la etiqueta `VOZ`, el input más grande y un borde izquierdo con `SUS PROYECTOS`; (b) en *Agregar un proyecto* el botón Crear estaba **arriba** del campo obligatorio de criterios, o sea se clickeaba antes de haber visto lo que lo iba a rechazar; (c) el placeholder del nombre era "Storytelling", que es un proyecto que ya existe. **Esto queda como procedimiento: la pantalla se mira antes de publicarla.**
**Suelto que apareció mirando el plan y no es de este corte:** `Días de recencia = 100`, con `Mínimo de vistas`, `Mínimo de likes` y `Relevancia mínima` en **0**. Las perillas están abiertas del todo — coherente con que los 4 proyectos reporten `razon_faltante: supply`, pero conviene saberlo antes de leer una corrida.
**❓ Una pregunta para Mani que salió de terminar este corte: no existe un "corte 4/4".** La numeración salió del cierre 72 contando Voces y Proyectos por separado, pero van juntos por FK y ya están adentro. Con Ajustes, Referentes, Voces y Proyectos cortados, **D5 está completo**: lo que queda en Airtable son las 3 tablas que ESCRIBE n8n (`Candidatos`, `Descartes del gate`, `Referentes propuestos`), y esas son D7, no D5. Conviene confirmarlo antes de que alguien salga a buscar un dominio que no existe.
**Próximo paso (actualizado el mismo día: el corte ya se publicó):** el hecho-cuando de 2 min → congelar *Voces* y *Proyectos* en Airtable (⚠️ para personas: la máquina sigue escribiendo ahí) → **D6, el feed de calificación**, que es la pantalla que el equipo más usa y la última pieza de config ya está. Ojo con lo que D6 ya tiene escrito: `veredicto` de *Descartes* **tiene que quedar editable** — con el campo bloqueado, `falsos_negativos` da siempre 0 y "0 falsos negativos" se lee como *el gate está perfecto*, que es la conclusión opuesta a la verdad.
**Skills para la próxima sesión:** `/grill-with-docs` antes de arrancar D6 (es la pantalla que decide si la migración se siente bien, y el PRD pide validarla con Jero y Majo con la pantalla en la mano) · `/tdd` para el dominio de la calificación · `/handoff` al cerrar. Para las pantallas, **el login local ya no es un bloqueo**: `auth.admin.generateLink` con el service_role devuelve el token sin mandar mail (receta en este mismo cierre).

**2026-07-31 (cierre 73) — D5 corte 2/4: Referentes, y el bug de modelo que casi apaga un proyecto entero (Claude, pedido de Mani).**
**Lo que se construyó:** el segundo corte de config. Pantallas **`/curar/referentes`** (el banco: alta, poda, proyectos por cuenta, notas, con la salud read-only al lado y la vista *A revisar* **adentro** en vez de en otra página — separarlas obligaba a saltar de pantalla para hacer justo la acción que la lista existe para provocar) y **`/curar/sugeridos`** (la bandeja del descubrimiento), más el flip en `lib/config.ts`. **Va en la rama `corte-2-referentes`: el flip no puede vivir en `main` hasta que la migración y la carga estén hechas** (§Pendiente vivo tiene los 3 pasos en orden). La unidad de aislamiento es la rama — aprendizaje del cierre 72, aplicado.
**🚨 El hallazgo que cambió la forma del corte, y que salió de mirar el dato vivo ANTES de escribir código:** `app.referentes` (migración `009`) modela **un** proyecto por referente, y en producción cada referente alimenta **2 a 4**. `Referentes.proyecto` de Airtable es un link múltiple y `Armar plan de corrida` lo recorre **como array**; el mapeo de sombra tomaba `[0]`. Medido: **35 pares (referente, proyecto) → 16**, o sea **19 perdidos (54%)**, y **el proyecto *Storytelling* se quedaba con CERO referentes** (no es `proyecto[0]` de ninguno de sus 5) — el corte lo habría apagado sin un solo error en ningún lado. Decisión de Mani: tabla puente. Es **[ADR-032](../adr/ADR-032-referente-proyecto-es-n-a-n.md)** + migración `012` (`app.referentes_proyectos`, con backfill, y `referentes.proyecto_id` muere: dos lugares para el mismo vínculo es el "dos dueños" que prohíbe ADR-027).
**🔍 Por qué el modo sombra no lo cazó, habiendo dado "espejo perfecto ×2":** el diff compara *Airtable ya mapeado* contra Postgres, y el mapeo truncaba a `[0]` **de los dos lados**. La dimensión perdida le es invisible por construcción. **La regla que queda: un diff que pasa por el mapper valida el transporte, no el modelo.** Por eso el procedimiento del corte suma un paso: *antes de cortar un dominio, medí el dato vivo contra el schema que lo va a recibir*.
**🔍 El segundo hallazgo, del A/B contra Airtable vivo (no de leer código):** la fila `recYQotSNwtcfuY2x` está **activa, con 2 proyectos y sin handle**. Hoy el motor la ignora gratis (`if (!handle) return;`), pero `mapearReferente` la guardaba como `"(sin handle)"` — que para el motor **sí** es un handle válido ⇒ le pediría esa cuenta a Apify en cada corrida. Ahora falla loud, como `mapearProyecto`: es una decisión humana, no un default que inventar. Bloquea el script de carga hasta que se limpie (paso 1 de §Pendiente vivo).
**Las 2 decisiones de diseño que este corte agregó al procedimiento:**
**(a) El `id` del contrato dejó de ser opaco.** A diferencia de `ajustes` (donde nadie lo consume y viaja la clave), `referentes[].id` **sí** lo usa alguien: `Computar salud referentes` del archivado PATCHea Airtable con él. Por eso la fachada sirve el `airtable_id`; un referente nacido en la app viaja con su uuid y, en el peor caso, ese PATCH descarta un batch **en una tabla que ya no lee nadie** (es fail-open y muere en D7). Y `fields.proyecto` viaja con **record ids de Airtable**, porque Proyectos corta recién en 4/4: el motor cruza las dos listas por ese id. Las dos traducciones se caen solas en el corte 4/4.
**(b) Si el corte rompe un loop que cierra n8n, el loop se mueve en el MISMO cambio.** Aprobar un sugerido disparaba `POST Referentes (promoción)` → sembraba el referente **en Airtable**, o sea nacía invisible. La aprobación pasó a la app, y marca la propuesta **`promovido` salteando `aprobado`** — que es exactamente el estado por el que filtra el nodo viejo. El loop de ADR-020 cierra **sin tocar n8n** y el nodo queda sin trabajo hasta que D7 lo borre. *Corolario que hay que avisarle al equipo: aprobar desde Airtable ahora es dañino.*
**(c) La carga de datos de un corte es un script propio,** `scripts/cortar-referentes.ts` (`npm run cortar:referentes`, con `--dry`), no el `sombra:import` — que en el mismo cambio deja de ver la tabla (procedimiento del corte 1/4). Corre una vez, y termina imprimiendo la evidencia que ADR-027 §5 pide: referentes por proyecto de los dos lados **y** el A/B registro por registro en los dos ámbitos, usando `aRegistrosDelPlan`, la misma función que usa la fachada (si el A/B reimplementara la transformación compararía dos escrituras del mismo autor, no dos mundos).
**Verificación (todo lectura, cero créditos):** **A/B de la transformación contra Airtable vivo: 15 referentes · 33 pares · idénticos byte a byte en `?ambito=motor` y `?ambito=completo`** (con la fila rota excluida; con ella adentro, el A/B es justo lo que la detectó) · dashboard **94/94** (+30) · typecheck y `build` limpios, con `/curar/referentes` y `/curar/sugeridos` en la tabla de rutas · las 4 rutas de Curar redirigen a `/login` sin sesión · validador **1472/0** · auditor de workflows **0 hallazgos** (este corte no toca n8n, que es el punto) · **la fachada local responde 503 con el flip y sin la migración** — el fail-closed de ADR-028 funcionando, y la prueba de por qué esto va en rama.
**Lo que NO se pudo probar:** las pantallas en el browser (entrar pide magic link) y el round-trip real por Postgres (la migración es paso de Mani). Por eso el hecho-cuando del corte es suyo y son 2 minutos.
**Próximo paso:** los 3 pasos de §Pendiente vivo → merge → los 2 pasos de congelar Airtable → **corte 3/4: Voces + Proyectos** (van juntos, por FK). Ojo con lo que ya se sabe de ese corte: la pantalla de Proyectos **tiene que mostrar `advertencia_criterios`**, que hoy no muestra ninguna superficie (el archivado gasta un Haiku cada domingo escribiendo un aviso que nadie lee), y es el corte donde las dos traducciones de (a) se caen.

**2026-07-31 (cierre 72) — D5 arranca: Ajustes cortado de Airtable, pantalla + flip en el mismo cambio (Claude, pedido de Mani).**
**Qué se hizo:** el primer corte de config del plan del cockpit. Pantalla **`/curar/ajustes`** (los 18 knobs agrupados por quién los consume, el operador ve solo los de `visibilidad=equipo`, el botón Guardar aparece solo si el valor cambió) y, **en el mismo cambio**, el flip: la fachada sirve `ajustes` desde `app.ajustes`, no desde Airtable.
**La decisión que vale para los 3 cortes que faltan: pantalla y flip son un solo paso.** La alternativa —publicar la pantalla y flipear después— deja una ventana con **dos superficies editables** para el mismo dato, que es exactamente lo que prohíbe el principio §3.1 del plan, y la mitad de esa ventana el equipo estaría editando en la superficie que ya no lee nadie. El flip es reversible con un revert; la divergencia de datos, no.
**🔧 La costura, que es lo que hace baratos los cortes 2/4, 3/4 y 4/4:** `apps/dashboard/lib/config.ts`. Acá y solo acá se decide de qué almacenamiento sale cada dominio; `lib/airtable.ts` se achica en cada corte hasta morir en D8. Mover Referentes es una línea más su pantalla.
**⚠️ La trampa que este piloto encontró y dejó cerrada:** una tabla cortada tiene que **salir del catálogo de sombra** (`scripts/comun.ts`) en el mismo cambio. Si se queda, el próximo `sombra:import` la pisa con los valores viejos de Airtable —revirtiendo en silencio lo que el equipo editó en la app— y el `sombra:diff` empieza a reportar como error las diferencias legítimas. Anotado como procedimiento en el plan §D5.
**Detalles chicos con motivo:** `app.ajustes.valor` es `numeric` y PostgREST lo devuelve **string** — se normaliza en `lib/ajustes.ts`, una vez, para que ni el dominio ni la pantalla lo sepan · el `id` del contrato viaja **la clave** (nadie lo consume: los 2 workflows leen por `fields.clave`), así que no hubo que inventarle un record id a Postgres · la acción **revalida el rol contra la fila real** antes de escribir, no confía en lo que la pantalla mostró · cada edición deja `app.eventos` con valor anterior y nuevo, que es la única forma de reconstruir por qué una corrida salió rara tres semanas después.
**Verificación (todo lectura, cero créditos):** **A/B Airtable ↔ fachada: 18 claves de los dos lados, 0 diferencias** · la fachada local devuelve **200** con 3 voces · 4 proyectos · 16 referentes · **18 ajustes**, y la N por proyecto sigue resolviendo a 100 desde `Candidatos por corrida` · typecheck limpio · dashboard **63/63** (cae 1 test: el de `mapearAjuste`, que se fue con su función) · validador **1454/0**. *No se pudo probar la pantalla en el browser: entrar pide magic link.* Por eso el hecho-cuando del corte es de Mani, y son 2 minutos (§Pendiente vivo).
**⚠️ Orden de operaciones: se planeó y NO se ejecutó — el aprendizaje de proceso de la sesión.** La decisión fue no pushear hasta que la 2ª corrida de fuego estuviera verificada (regla "una corrida, una variable", cierre 69). **Pero el commit del flip ya estaba en `origin/main` 26 minutos antes de que la corrida arrancara** (reflog `bd12a26`: commit 18:51:24 UTC, remoto 18:52:03; corrida 19:18:16), y con Vercel deployando `main` eso significa que estuvo vivo. Claude no corrió `push`; quién lo hizo quedó sin confirmar (lo más probable: Mani sincronizando desde su editor, que estaba trabajando en paralelo en el re-import — un commit de prueba 45 min después **no** se pusheó solo, así que no parece haber automatismo). **La conclusión no depende de eso y vale para los cortes 2/4, 3/4 y 4/4: "commiteado pero sin publicar" no es un estado confiable acá, así que la unidad de aislamiento es la RAMA, no el momento del push.**
**No hizo daño, y de hecho pagó:** la corrida de las 19:18 corrió con los ajustes saliendo de Postgres, terminó `ok` y los 4 proyectos resolvieron `n_objetivo: 100` por la fuente nueva ⇒ el corte quedó **validado por una corrida real**, no solo por el A/B estático.

**🏁 En la misma sesión, Mani re-importó el motor y disparó la 2ª corrida de fuego: los 3 hallazgos del cierre 70 quedaron cerrados EN PRODUCCIÓN.** Corrida 19:18, `on_demand`, **`ok` en 9,4 min**. Los 4 criterios: **`registro_dedup: ok`** (primera vez desde que existe ADR-029 — H1 vivo) · **27 `processed_items` nuevas, las 27 con `run_id`** (H3; total 628, las 601 viejas siguen null) · **intersección de `external_id` con la corrida previa = ∅** · feed de 145 con **0 `⚠️ SIN GUION`**, **145/145 `external_id`**, **0 urls duplicadas**.
**🔍 Los 9,4 min contra 31 asustan y no deberían: son la medida del dedup.** Mismos `colectados=280` y `asignados=635` (mismas cuentas, 3 h después), pero **`filtrados` cae de 361 a 35** — ese escalón es `Heat-score v1`, donde vive el dedup: 456 de 491 salieron por estar ya en memoria. Como lo que se transcribe es lo que sale de ahí, la fase cara pasó de 361 items a 35 y el tiempo se desplomó. Entregó **6 candidatos nuevos** sobre un feed que ya tenía 139. **El resultado alarmante habría sido el opuesto:** 31 min y ~139 entregados otra vez = re-entrega de lo mismo. Queda escrito porque la próxima vez que alguien vea una corrida corta va a dudar igual.
**Sin verificar todavía (no lo tapa esta corrida):** el **guard single-flight** sigue sin prueba viva, y el paso 3 del cierre 71 —**`ventana_corrida_min` 120 → 60 en el `Config` del archivado**— sigue abierto: no pide re-import, así que no vino de arrastre con el del motor.
**Próximo paso:** push (= deploy) del corte 1/4 → los 2 pasos manuales de §Pendiente vivo → **corte 2/4: Referentes** (+ la vista de flojos y los Sugeridos).

**2026-07-31 (cierre 71) — Los 3 hallazgos del cierre 70, cerrados en el repo + un auditor que caza esta clase de bug sola (Claude, pedido de Mani).**
**H1 — la memoria del dedup dejó de ser una rama.** Decisión de Mani sobre la alternativa propuesta en el cierre 70: en vez de mover posiciones (`x<4480`), **serializar**: `Heat-score v1 → Preparar procesados → POST processed_items → Transcribir`. El argumento es que mover posiciones deja la garantía central de ADR-029 viviendo en dos coordenadas de canvas, o sea la próxima limpieza visual la rompe otra vez y en silencio; en serie la garantía es **topológica**. Tres detalles la sostienen: `alwaysOutputData` en el POST (PostgREST devuelve body vacío con `resolution=ignore-duplicates`, y sin item de salida `Transcribir` no dispararía), `Transcribir` pasa a leer `$('Heat-score v1').all()` en vez de `$input` (su input ahora es la respuesta del POST), y `onError: continueRegularOutput` **se conserva** — la escritura sigue siendo fail-open, como manda el ADR. **De arrastre, `registro_dedup` revive:** `POST processed_items` es ahora ancestro de `Resumen del run`. Quedó como [enmienda 2026-07-31 de ADR-029](../adr/ADR-029-dedup-blindado-fail-closed-y-feed.md), con la decisión #2 original **tachada** — el mecanismo que describía era falso y nadie debería leerlo de buena fe.
**🔧 El auditor, que es lo que hace que esto no vuelva a pasar:** `node Workflows/auditar-workflows.mjs` (sin dependencias, solo lee). 5 chequeos sobre los 3 workflows: conexiones rotas · inalcanzables · **todo `$('X')` tiene que apuntar a un ancestro topológico** · `jsCode` que compile como AsyncFunction · inventario de placeholders del re-import. **El tercero es el que importa:** corrido contra el repo ANTES del fix marcaba **exactamente 1 hallazgo en todo el pipeline — `Resumen del run` → `POST processed_items`**, o sea el bug del cierre 70 y nada más. Después del fix: **0**. Estos chequeos ya se habían escrito a mano y tirado dos veces (cierres 67 y 69); a la tercera se commitean. Enganchado en §Feedback loops del CLAUDE.md raíz.
**H2 — `ventana_corrida_min` 45 → 60** en los 5 lugares que lo tienen (motor, archivado, manifest, `domain/corrida.ts`, docs). De paso se podó la duplicación del número en prosa: el README del motor, `airtable-cockpit.md` y ADR-023 ahora **apuntan al manifest** en vez de repetir un valor que se les quedaba viejo (los tres decían 120).
**H3 — `run_id` en `Preparar procesados`**, `null` si el run no se abrió: la columna es FK a `runs(id)` y un uuid de relleno haría fallar el INSERT del batch entero, o sea la corrida entregaría sin memorizar — peor que el bug original. 4 casos nuevos en `test-nodos.mjs`.
**🔍 El hallazgo del audit, que salió de probar el verificador contra la base viva y no de leer código:** el fallback por ventana de `primera_vez` devolvía **0 filas** para la corrida del 31/07. Razón: sus 191 filas de memoria se escribieron a las **16:59:10**, y `Cerrar run` había cerrado el run a las **16:59:08** — la memoria aterrizó **2 segundos después de cerrar la corrida**. Es la medida exacta del hallazgo 1, y de paso la prueba de que el techo de la ventana no puede ser `fin`: se cambió al **arranque de la corrida siguiente**. Con eso el fallback encuentra las 191. *(Límite anotado en el propio script: `processed_items` tiene dos escritores desde ADR-031 — el motor y el transcriptor de la app — así que la ventana puede sumar de más algún enlace pegado a mano entre corridas. Por `run_id` la atribución es exacta, que es justo lo que H3 desbloquea.)*
**Suelto que se cierra sin tocar nada:** el run de **descubrimiento** del 27/07 en `en_curso` **no es un bug**. Su `Barrer runs zombie` no filtra por antigüedad (`estado=eq.en_curso&id=neq.<propio>`), así que la corrida del lunes 03/08 lo marca `fallo` sola. Queda escrito para que nadie lo re-diagnostique.
**Verificación (todo estático, sin gastar un crédito):** auditor **0 hallazgos** en los 3 workflows · `test-nodos.mjs` **verde con los asserts de Transcribir intactos** (solo cambió el mock, que es la prueba de que la lógica no se movió) · validador **1454/0** · dashboard **64/64** + typecheck limpio. Contra la base viva, solo lecturas: 601 `processed_items` (**601 con `run_id` null** — la corrida nueva va a ser la primera con atribución) y la corrida del 31/07 medida en **31,0 min**, que es lo que condena a 45.
**Próximo paso:** el re-import del motor + la corrida de fuego (§Pendiente vivo, 3 pasos manuales). Después **D5**, que sigue desbloqueado: la config migra a Postgres sin volver a tocar n8n. Arrancar por **Ajustes**, que ya tiene su base en [`domain/ajustes.ts`](../../apps/dashboard/domain/ajustes.ts) (valida los 18 knobs). Sigue pendiente el 3er pase del diff de D3.

**2026-07-31 (cierre 70) — Re-import #1 vivo y la primera corrida con la fachada (139 candidatos); aparecieron 2 hallazgos que quedan para atacar (Mani ejecutó, Claude diagnosticó).**
**Los 3 workflows re-importados y el motor corriendo por la fachada.** Antes hubo una cadena de 5 fallos, **todos de configuración, ninguno de código** — el swap de D4 y el fix del timeout entraron bien de una: (1) Vercel tenía **otro valor** en `RUN_PLAN_HEADER_VALOR` (lo dijo el `motivo` del 403 que agregamos ese mismo día) ⇒ se **rotó el par** y el header pasó a llamarse **`X-Run-Plan-Auth`**, que además mata la colisión de nombre con el del webhook; (2) `MOTOR_WEBHOOK_URL` apuntaba a la **URL de _test_ de n8n** (`/webhook-test/`), que solo responde con *Listen for test event* armado — **el botón nunca había funcionado, y no era culpa del re-import**; (3) el motor re-importado **no estaba `Active`**, y sin eso toda URL de producción da 404; (4) el **path del webhook cambió** en el re-import ⇒ se adoptó el nuevo (más barato: la variable de Vercel se editaba igual); (5) la credencial `Run Plan Header` tenía el par viejo. **Método que ahorró horas y sirve para la próxima:** un **POST con header inválido** distingue gratis y sin disparar nada — **404** = workflow inactivo o path equivocado · **403 `Authorization data is wrong!`** = activo, path bien y credencial bien.
**La corrida (16:28, `on_demand`, 31 min, `ok`):** **139 candidatos** repartidos en los 4 proyectos (49/37/30/23) · **0 con `⚠️ SIN GUION`** (ADR-030 vivo: 21 sin transcript **descartados** en el gate) · **0 urls duplicadas** · **139/139 con `external_id`** (ADR-029) · **191 `processed_items`** escritos (410 → **601**) · los 4 proyectos con `razon_faltante: supply`, o sea el gate funciona y lo que falta es material. **Cierra el hecho-cuando de D1** (disparo desde el dashboard sin abrir n8n, `trigger_type=on_demand`) y el de **D4** (una corrida real entera por la fachada).
**🚨 HALLAZGO 1 — la garantía central de ADR-029 NO está en vigor.** El ADR dice *"reorden de ramas para grabar la memoria ANTES de entregar"*, y ese reorden se hizo en el **array de conexiones**. Pero el workflow corre con **`executionOrder: v1`, que ordena las ramas paralelas por POSICIÓN EN EL CANVAS (y, luego x), no por el array**. Las posiciones reales: `POST Airtable Candidatos` **x=7560** · `Resumen del run` **x=8200** · `POST processed_items` **x=8960** ⇒ **se entrega primero y se graba la memoria después**, justo al revés. **La prueba está en los datos de esta corrida:** `Resumen del run` reportó `registro_dedup: 'no_corrio'` (su `$('POST processed_items').all()` tiró porque ese nodo aún no había corrido) **y sin embargo las 191 filas existen** — o sea se escribieron *después* del resumen. **Dos consecuencias:** (a) **`registro_dedup` es un tripwire muerto**: va a decir `no_corrio` en toda corrida, así que la alarma que ADR-029 puso para detectar el fallo de dedup **no puede dispararse nunca**; (b) **la ventana de riesgo de los 15 duplicados sigue abierta** — si el motor muere entre la entrega y la escritura de memoria, los videos quedan entregados sin memorizar y la corrida siguiente los re-entrega. Hoy no mordió porque la corrida completó entera. **Fix propuesto (chico):** mover `Preparar procesados` y `POST processed_items` a **x < 4480** (a la izquierda de `Transcribir`). Cambia solo `position`, no la topología, y arregla las dos consecuencias de una. Pide re-import.
**⚠️ HALLAZGO 2 — `ventana_corrida_min` = 45 quedó corta.** Se eligió ese valor sobre un máximo medido de **23,2 min** (10 corridas) y esta corrida duró **31 min**: margen real **1,45x**, no 2x. Era el riesgo que se dejó anotado horas antes ("los caps subieron después de esas mediciones"), confirmado más rápido de lo esperado. **Recomendación: 60.** Sigue desbloqueando rápido (contra las 2 h originales) sin dejar al barredor matando corridas vivas.
**HALLAZGO 3 (menor) — `processed_items.run_id` viene `null`:** `Preparar procesados` no lo setea. No rompe el dedup (la clave es `platform+external_id`), pero **impide atribuir memoria a corridas**, que es exactamente lo que hace falta para auditar duplicados.
**Otros cambios del día:** `ventana_corrida_min` 120 → 45 en el repo (motor + archivado + el duplicado de `apps/dashboard/domain/corrida.ts`) — **falta aplicarlo a mano en n8n** · el 403 de la fachada ahora dice `motivo` · el test de `hayCorridaViva` deriva sus fixtures de la constante en vez de un hueco fijo · base de D5 commiteada (`domain/ajustes.ts`: valida los 18 knobs, que ni Airtable ni el schema validaban).
**Verificación:** validador 1436/0 · dashboard 64/64 + typecheck · `test-nodos.mjs` verde.
**Próximo paso:** **plan aparte para los 3 hallazgos** (sesión nueva, pedido de Mani) y después **D5**, que ya está desbloqueado: con la fachada viva, la config migra a Postgres **sin volver a tocar n8n**. Sigue pendiente la **2ª corrida de fuego** (dedup): ahora vale más que antes, porque con 191 en memoria la intersección de `external_id` entre ambas debe dar **∅**.

**2026-07-30 (cierre 69) — D3 cerrado (el espejo vive) + el swap de D4 hecho en los 3 workflows y verificado con replay A/B; el re-import queda listo pero bloqueado por una env de Vercel (Claude, pedido de Mani).**
**Lo que se hizo, en orden:** cerrar D3 (correr el modo sombra de verdad) y hacer la mitad-n8n de D4 (los 3 `workflow.json` dejan de leer la config). Decisión de Mani al arrancar: el re-import de D4 va **separado** del re-import del fix del timeout (cierre 67), que sigue siendo lo urgente — así, si una corrida falla, se sabe cuál de los dos fue.
**🔑 D3 — por qué nunca había corrido, y no era solo el `42501`:** el `.env.local` del dashboard tenía **6 placeholders sin reemplazar** (`AIRTABLE_PAT`, `AIRTABLE_BASE_ID` y los 4 de headers; `AIRTABLE_BASE_ID` era literalmente `TU-...`). El cierre 68 lo atribuyó todo al grant faltante — era eso **y** esto. Sincronizados desde el `.env` de la raíz, que es el hub y los tenía reales. **Espejo perfecto ×2:** voces 3 · proyectos 6 · referentes 16 · ajustes 18 · propuestos 8.
**🗑️ El dato sucio que lo destapó (decisión de Mani: las dos cosas).** `app.referentes` reventaba por `plataforma NOT NULL`: de 21 filas de Airtable, **5 eran basura**. Se separaron en dos clases con tratamiento distinto: **(a) filas fantasma** — sin ningún campo humano — que las **genera sola la grilla de Airtable y reaparecen**, así que el espejo las ignora (`esFilaFantasma` en `domain/sombra.ts`, filtrado en `leerTablaAirtable` para que **import y diff vean lo mismo**: si solo filtrara el import, el diff las reportaría como faltantes para siempre); **(b) filas a medio cargar** (`'@'` y `@the.rumers` sin plataforma), que **siguen fallando loud** porque ahí sí hay una decisión humana — esas 2 se borraron en Airtable (backup en el scratchpad). **El caso que obligó a afinar la regla:** un referente vaciado a mano cuyo único contenido era `tasa_gate: 0.12` / `videos_evaluados: 26` — **salud que escribe el archivado, no una persona**, y que en `app.referentes` ni siquiera es columna (es la vista `v_salud_referentes`, plan §4). Por eso los 3 campos derivados no cuentan como contenido. **Verificado de paso: el motor nunca estuvo afectado** — `Armar plan de corrida:55` hace `if (!handle) return;`. Dato suelto: `recYQot…` está `activo=true` con proyectos pero **sin handle**, o sea el equipo lo cree vivo y el motor lo ignora en silencio.
**🔧 D4 — el swap, workflow por workflow.** Nodo nuevo idéntico en los 3: **`Leer plan (fachada)`**, GET a `{dashboard_url}/api/engine/run-plan`, credencial `httpHeaderAuth` (`Run Plan Header`), **`executeOnce`** (la regla del cierre 67 aplicada aunque hoy entre 1 item), retry ×3 / 2s, timeout 30s y **SIN `onError`** — fail-closed como manda el contrato. `dashboard_url` entra en `Config` con placeholder `<<DASHBOARD_URL>>` (misma convención que `supabase_url`). **Motor** (`?ambito=motor`): mueren 4 nodos en cadena, 1 code node tocado. **Descubrimiento** (`?ambito=completo`): mueren 4. **Archivado** (`?ambito=completo`): mueren 3, 4 code nodes consumidores.
**⚠️ El hallazgo del swap, que casi cambia la conducta en silencio:** el `Leer Proyectos` del **descubrimiento** filtraba `{activo}` server-side y su code node **NO** re-filtraba — pero sus `Leer Voces`/`Leer Referentes` no filtraban nada. O sea **ningún ámbito calzaba tal cual**: `completo` lo habría puesto a proponer referentes para proyectos apagados. Se resolvió como manda el contrato (*"cada workflow aplica su propia lógica sobre el total"*): una línea explícita `if (!f.activo) return;` en `Armar plan de descubrimiento`, igual que los referentes ya hacían 20 líneas abajo. **La regla dejó de estar escondida en un query param.** El archivado, en cambio, no filtraba nada en sus 3 lecturas ⇒ `completo` calza exacto (verificado campo por campo).
**Topología: los nodos muertos NO estaban todos en cadena.** En descubrimiento `Leer Ajustes` era un **punto de join** (lo alimentaban `IF — hay aprobados` rama false y `PATCH Propuestos promovidos`) y en archivado `Leer Referentes (archivado)` estaba a mitad de flujo. El builder hace **bypass** de cada muerto (cada arista que le entraba va a su propio destino vivo, preservando los índices de salida del IF) y recién ahí **inserta** la fachada tras `Barrer runs zombie`. Un guard que compara destinos abortó el primer intento — por eso está.
**Verificación (todo sin gastar un crédito):** **replay A/B del motor** — code node viejo (`git show HEAD`) alimentado por las 4 lecturas de Airtable con sus filtros originales vs. code node nuevo alimentado por la **fachada real** ⇒ **mismo plan, byte a byte** (`assert.deepStrictEqual`). **Replay A/B del descubrimiento** (el que más lo necesitaba, por el filtro nuevo): fachada devuelve 6 proyectos, el código filtra a los mismos 4 ⇒ **mismo plan**. **Archivado:** comparación a nivel dato, `?ambito=completo` **== lecturas sin filtro, campo por campo** en las 3 tablas (cubre sus 4 code nodes, cuyos cambios son sustituciones de la misma expresión). Además: `test-nodos.mjs` **todo verde con los asserts intactos** (solo cambió el mock de `$`, que es justo la prueba de que la lógica no se movió) · grafo de los 3: **0 rotas / 0 huérfanos / 0 inalcanzables** · **31/31 code nodes compilan como AsyncFunction** · validador **1436/0** · dashboard **49/49** + typecheck limpio.
**🔴 El bloqueante que apareció al verificar:** la fachada en **prod responde 403** con el par del `.env`; **local responde 200** (y 403 sin header, 400 con typo). El código está bien: lo que no calza es la env en Vercel (ausente o distinta — `headerValido` da false en los dos casos). **Con esto así, re-importar D4 deja al motor abortando en todas las corridas.** Va a §Pendiente vivo. No pude mirarlo yo: la cuenta de Vercel conectada por MCP no tiene ese proyecto.
**Archivos:** `Workflows/*/workflow.json` ×3 · `test-nodos.mjs` (mock) · `domain/sombra.ts` + `.test.ts` (+5 casos) · `scripts/comun.ts`. Docs: dev-doc (nodo nuevo ×3, diagramas, tablas, nodos que mueren), CLAUDE.md y README del motor, README del archivado, este handoff.
**Próximo paso:** (1) **arreglar la env de Vercel** y re-verificar con curl · (2) el re-import del fix del timeout + las 2 corridas de fuego (sigue pendiente del cierre 67) · (3) **re-import #1 de D4** con la credencial `Run Plan Header` y `<<DASHBOARD_URL>>` en `Config` · (4) el 3er pase del diff de D3 con una edición del equipo · (5) **D5**, que el swap acaba de desbloquear: de acá en adelante la config migra a Postgres **sin volver a tocar n8n**. **Y rotar el `service_role`**, que sigue sin hacerse desde el 19/07.

**2026-07-29 (cierre 68) — El transcriptor (ADR-031, 4ª zona) + el bug que tenía a todo el BFF sin poder leer el schema `app` (Claude, con Mani).**
**Lo que se construyó:** la zona **Transcribir** del cockpit — el equipo pega N links en un textarea (uno por línea, con comas, o el chat de WhatsApp copiado entero: se extraen con regex) y recibe el **script literal** en español. Los enlaces entran al **dedup del motor**, que era el requisito duro del pedido.
**🔑 El hallazgo que definió el diseño:** el dedup del motor es `processed_items` con clave `(platform, external_id)`, y para IG ese `external_id` es el **pk numérico de Apify** (`item.id`), que **no está en la URL** que el equipo pega. Parecía que había que resolverlo con una llamada extra a Apify por link, o tocar `Heat-score v1` (= re-import). Ninguna de las dos: **el shortcode de IG *es* ese número escrito en base64 url-safe**. Verificado contra la base viva con el parser real: **408/408 filas, cero mismatches** (381 IG por shortcode, 27 TT por el id que ya viaja en `/video/<id>`). Así que la app **deriva** el `external_id` exacto desde la URL y el dedup es un `INSERT` idempotente en `processed_items`: **cero cambios en n8n, cero re-import.**
**⚠️ La invariante que queda viva:** *para Instagram, `processed_items.external_id` == decimal de base64(shortcode de la URL)*. Si alguien "arregla" `Normalizar IG` para preferir `item.shortCode` sobre `item.id`, el dedup entre las dos herramientas se rompe **en silencio**. La alarma son los **8 pares reales** clavados en `apps/dashboard/domain/enlace.test.ts`.
**Decisiones (todas en [ADR-031](../adr/ADR-031-transcriptor-a-pedido.md)):** corre **en la app, no en n8n** (Supadata mide **0.8–1.7s/video**, no los ~27s que dice el comentario viejo del nodo; con pool de 8 y presupuesto de 45s una pasada cubre más links de los que van a pegar, y como cada enlace se marca apenas vuelve, un timeout de Vercel no pierde nada — la pasada siguiente sigue) · el dedup se escribe **solo si transcribió OK** (si no hay transcript el enlace queda libre; se auto-corrige porque el gate lo descartaría por `sin_guion`, ADR-030) · lo que produce **NO es un Candidato** (sin gate, sin heat-score, sin N, sin dupla video×proyecto) y vive en `app.transcripciones` · **4ª zona**, que enmienda el "tres zonas" de plan-cockpit §2.1 — la regla que importaba era *una zona = un verbo*, y el sponsor no la ve. El prompt de traducción está **copiado textual** del nodo `Traducir (Claude Haiku)`: las dos superficies tienen que dar el mismo script literal (ADR-009).
**🚨 El bug que apareció al probarlo, y que no era del feature:** la zona mostraba "no se pudo leer la lista". Causa: **`007` otorgó `usage on schema app` SOLO a `authenticated`, nunca al `service_role`**, y **`008` lo dio por sentado por escrito** ("por REST solo las lee el service_role (bypassa RLS y tiene los suyos)"). Eso es falso: **BYPASSRLS saltea las policies, pero no otorga USAGE sobre un schema propio ni privilegios de tabla** — Postgres los pide igual y Supabase solo auto-otorga sobre `public`. Diagnóstico: la misma key leía `public.processed_items` (408 filas, RLS sin policies) y daba `42501 permission denied for schema app` sobre `app.usuarios`, que existe desde 007. **Consecuencia real: TODO lo que el BFF lee de `app.*` estuvo roto desde el día 1** — `/entender` (sus 3 vistas) y los scripts de sombra incluidos. **El login lo tapaba** porque va por la anon key con el rol `authenticated`, que sí tenía su grant desde 007. Por eso D2 y D3 figuraban ✅: el código estaba bien, **nunca llegó a leer**. Fix: `011_grants_app_service_role.sql` (+ corrección del comentario mentiroso en 008). **Confirmado después de aplicarla: `/entender` devuelve datos por primera vez.**
**🔐 Tercer hallazgo (revisar en Vercel):** en `apps/dashboard/.env.local` las variables estaban **cruzadas** — la key `sb_secret_` metida en `NEXT_PUBLIC_SUPABASE_ANON_KEY` (comprobado: leía `processed_items` con RLS sin policies) y el **placeholder literal** `TU-SERVICE-ROLE` en `SUPABASE_SERVICE_ROLE`. Se arregló local. **El deploy está limpio** (bajé el HTML + los 13 chunks de `/login`: cero ocurrencias de `sb_secret_`), pero **por suerte, no por diseño**: el login es un server action, así que ningún componente cliente referencia esa variable y Next nunca la inyecta. El día que alguien use `createBrowserClient`, si en Vercel está el mismo cruce, **la key secreta se publica en el bundle**. Va a §Pendiente vivo.
**Archivos:** `domain/enlace.ts` + `.test.ts` (parser puro, **`BigInt` y no `Number`**: son 19 dígitos y float64 los redondea) · `lib/transcribir.ts` (Supadata + Haiku) · `lib/transcripciones.ts` (cola + `registrarEnDedup`) · `lib/eventos.ts` (auditoría, sumidero) · `app/(zonas)/transcribir/` (page + actions + 3 componentes cliente) · `core/schema/010` y `011` · `domain/roles.ts` + layout (la zona nueva). Docs: ADR-031 + índice · glosario `context.md` (**Enlace pegado**, **Transcripción a pedido**, **el transcriptor**) · plan-cockpit §2.1 (enmienda) · README del dashboard + `.env.example` · onboarding §1.1, §8.2 y §9.
**Verificación:** dominio **44/44** (15 nuevos) · parser vs base viva **408/408** · `typecheck` + `build` limpios (`ƒ /transcribir` en la tabla de rutas) · validador **1436/0** · Supadata+Haiku ejercitados con el código real (inglés → *"Esta es liquidez. Comercia hacia ella…"*) · link corto de TikTok rechazado con instrucción · guard de zona: `/transcribir` anónimo → `/login`.
**Gotchas para el próximo:** (1) el `tsconfig` apunta a **ES2017**, que prohíbe literales `0n` — de ahí el `BigInt(0)`; (2) `app.voces` y `app.proyectos` están **vacías**, o sea el `sombra:import` de D3 nunca pudo correr — mismo 42501, no era otra cosa; (3) la migración se aplica a mano en el SQL Editor: no hay credencial de Postgres directo en el `.env`, solo PostgREST, que no corre DDL.
**Próximo paso:** las 2 corridas de fuego + el re-import siguen pendientes del cierre 67 (nada de esto los toca) · revisar el cruce de env vars en Vercel · **rotar el `service_role`**, que sigue sin hacerse desde el 19/07. **Skills sugeridas:** `/diagnose` si la corrida de fuego #1 falla; `/tdd` para D5 (el corte de config, ahora desbloqueado por el 011).

**2026-07-28 (cierre 67) — El cron del 27/07 murió por timeout en `Leer procesados`: no era el timeout, era el nodo corriendo ~600 veces (Claude, reporte de Mani).** **La causa raíz, que no es la que parecía:** un `httpRequest` de n8n corre **una vez por item de entrada**, y el propio error lo delata (`"itemIndex": 2`). Después del fan-out entran ~600 items (280 videos IG → 635 filas video×proyecto), así que `Leer señal selección` disparaba ~600 GETs idénticos, y como esa respuesta se despliega en items, `Leer procesados` disparaba **miles** — cada uno con la **misma** URL de 5,1 KB (257 `external_id` dentro del `in.(…)`), porque el nodo arma su URL desde `$('Pre-trim relevancia').all()`, no desde el item que procesa. Trabajo O(N²): N requests idénticos de tamaño N. Subir el timeout no arreglaba nada (600 requests secuenciales a 2s = 20 min). **🚨 Lo más importante del cierre:** este mismo timeout **ya venía pasando antes de ADR-029**, cuando `Leer procesados` era `continueRegularOutput` — se lo tragaba en silencio, `seen` quedaba vacío y el motor re-entregaba todo. **Es el origen de los 15 duplicados del 20→21/07.** ADR-029 no lo causó: lo hizo visible. Arreglar esto ES arreglar los duplicados, no un tema aparte. **Fix (3 cosas, ningún nodo nuevo, ninguna conexión nueva):** (1) **`executeOnce: true`** en `Leer señal selección`, `Leer procesados` y `Leer feed vivo` — son lookups **de corrida**, no de item; de ~600 requests a 1. Los tres, no solo el que falló: `Leer feed vivo` era la próxima bomba (600 ejecuciones × hasta 30 páginas contra Airtable, que limita a 5 req/s = horas). Seguro porque `Heat-score v1` **no usa su input directo**, lee todo por referencia. (2) **Fuera el `in.(…)`**: la URL vuelve a ser constante (`select=external_id,platform&limit=50000`). Revierte el "dedup acotado #5" del cierre 15, que se decidió **sin medir la tabla**: `processed_items` tiene **408 filas / 26 KB**, o sea el filtro de 5,1 KB existía para evitar leer 408 filas. De paso muere el techo de 414 (a ~700 ids distintos la URL pasa los 8 KB). (3) **Retry nativo ×3 / 2s + timeout 30s** en los tres — un hipo de red ya no mata la corrida; si tras 3 intentos la memoria sigue sin leerse, el run **aborta** (decisión de Mani: los duplicados son inservibles, ADR-029 intacto). **⚠️ No le pongas `onError` a `Leer procesados`:** fail-open ahí es literalmente la falla que estamos arreglando. **Verificado contra Supabase:** el run fallido **no guardó ningún ID** (cero filas del 27/07; la última escritura es del 23/07) — coincide con la topología, `Leer procesados` está aguas arriba de `Heat-score → Preparar procesados → POST processed_items`. No hay nada que limpiar. **Quedó como enmienda a [ADR-029](../adr/ADR-029-dedup-blindado-fail-closed-y-feed.md#enmienda-2026-07-28--el-fail-closed-necesitaba-una-lectura-que-no-se-cayera-sola), no ADR nuevo:** no cambia la decisión, la hace ejecutable — y cierra el contexto original del ADR, que describió el agujero "lectura fail-open" sin saber que ya se estaba disparando. La enmienda deja escrita **la regla que sobrevive al fix: cualquier lookup de corrida nuevo va `executeOnce`.** **Verificación:** `test-nodos.mjs` **+1 caso** (memoria truncada en el límite aborta) todo verde · validador **1409/0** · grafo 38 nodos / 3 triggers / 0 rotas / 0 refs colgadas / 0 inalcanzables · 15 code nodes compilan como AsyncFunction. **Docs:** enmienda ADR-029 + índice de ADRs, dev-doc §2.1 (el bullet 🔴 del execute-once) + filas 18/19/19b + nodo 20, CLAUDE.md del motor (la trampa del "corre una vez por item", que va a reaparecer con cualquier lookup nuevo). El README del motor y `workflow.yaml` no se tocan: describen el dedup a un nivel que no cambió. **Próximo paso:** re-import + las 2 corridas de fuego del cierre 66, que siguen sin correrse. **Y rotar el `service_role`** (§Pendiente vivo): se pegó en el chat por tercera vez.

**2026-07-24 (cierre 66) — Audit del run manual de Jero: dedup blindado + descarte duro de sin-guion + métricas por proyecto + caps de entrega (Claude, pedido de Mani).** Tres fallas del run del 23/07, confirmadas contra código + `outputs-main` + Supabase + Airtable, cerradas en 2 ADRs y 3 commits. **[ADR-029](../adr/ADR-029-dedup-blindado-fail-closed-y-feed.md) — duplicados:** la causa raíz de los 15 duplicados del run 20→21/07 fue triple (memoria de `processed_items` ausente + `Leer procesados` fail-open + feed sin `external_id`). Fix: `Leer procesados` **fail-closed** (GET caído aborta, no re-entrega); nodo nuevo **`Leer feed vivo`** (GET paginado a Airtable, última línea de dedup, fail-open); `Heat-score` une las dos memorias + tripwire; **reorden de ramas** para grabar la memoria **antes** de entregar; `external_id` ahora se escribe en el feed (`Preparar batch Airtable`) + campo creado en la base viva; `Resumen` reporta `registro_dedup`+`avisos`. **[ADR-030](../adr/ADR-030-descarte-duro-sin-transcript.md) — sin-guion (revierte la decisión #6):** un video sin transcript se **descarta** en el `Gate` (`descarte_razon:'sin_guion'`, no gasta Haiku ni N), se retira el fallback por caption, no van a *Descartes del gate*; `Transcribir` reintenta 1 vez y loguea la respuesta cruda de las vacías (el 41% del 23/07: 39/41 usaban audio original → NO es música licenciada, el actor IG no trae `hasAudio` → no hay pre-filtro por metadata posible con este actor). **Entrega (Falla 2):** `cap_top_n` 100→250 y `presupuesto_transcribir_s` 780→**840** (⚠️ el plan decía 1560 pero el **watchdog del task runner es 900s** y el presupuesto DEBE quedar debajo; 1560 lo rompía — corregido). **Métrica de criterios (Falla 5):** `Resumen` arma `metricas.por_proyecto {evaluados, sin_guion, gate_pass, tasa_gate, entregados, razon_faltante}` + **card nueva en Operar** (`apps/dashboard`, `domain/corrida.ts` → `embudoPorProyecto`/`ultimoEmbudo`, 4 tests). **Verificación:** `test-nodos.mjs` +13 casos (harness `runHeatScore` y `runGate` nuevos, retry de Transcribir) todo verde · validador **1409/0** · dashboard 29/29 tests, typecheck limpio en mis archivos (los 2 errores de `layout.tsx` son `@vercel/*` sin instalar, preexistentes). **Fase 0:** borrados los **15 duplicados** del feed (conservando la copia calificada/vieja de cada par; los 15 están en `processed_items` desde el 21/07 así que no resucitan). **Docs:** ADR-029/030 + índice, dev-doc (nodo nuevo, Gate, Resumen, Transcribir), CLAUDE.md del workflow (fail-open matizado), onboarding equipo (sin-voz se descarta solo + cómo leer la tasa de gate), mapa-campos, `setup-airtable.mjs` (+external_id), `workflow.yaml` (presupuesto). **Decisiones pendientes de Mani:** ver §Pendiente vivo (re-import, TikTok, watchdog, corrida de fuego, spike Apify). **Próximo paso:** re-import del `workflow.json` (trae Fase 1–4 juntas) + corrida de fuego doble para verificar dedup.

**2026-07-20 (cierre 65) — DESBLOQUEADO D0: el login por magic link funciona end-to-end con Resend SMTP; cae el único bloqueante del cierre 64 (Mani ejecutó, Claude diagnosticó).** Sesión de puro debug de config, sin código. **El síntoma:** "configuré SMTP con Resend pero el correo no se manda". **Diagnóstico paso a paso** (el código ya estaba instrumentado para esto, cierre 64): el error real NO vive en Vercel (salía `{}`) sino en **Supabase → Auth Logs** — `POST /auth/v1/otp` daba **500** para mail invitado (SMTP falló) y **422** para no invitado (esperado, `shouldCreateUser:false`). **La causa raíz encadenada:** (1) **Resend exige dominio verificado**; sin verificar está en modo test y solo entrega al mail dueño de la cuenta, rechazando el resto con **403** → Supabase 500. (2) **La cuenta Resend es de Daniel** (su mail personal), no de Mani — se probó el pipeline completo invitando ese mail y funcionó (cayó en spam la 1ª vez: `onboarding@resend.dev` sin firmar). (3) **30x.com NO se pudo verificar** (no controlan su DNS) → se usó **`retiagrowth.com`** (dominio de la agencia, DNS en Squarespace). **Fix final:** verificado el subdominio **`contact.retiagrowth.com`** en Resend (SPF/DKIM cargados en Squarespace) + Sender de Supabase apuntado ahí. Ahora el magic link llega a cualquier mail invitado, sin spam. **Config SMTP que quedó (al gestor, no acá):** host `smtp.resend.com` · port 465 · username literal `resend` · password = API key `re_...` · Sender en `contact.retiagrowth.com`. **Doc actualizada:** este log + tabla D0–D4 (D0 ✅) + bloque del bloqueante (resuelto), README del dashboard ([:54](../../apps/dashboard/README.md) — gotcha del dominio verificado), memoria del cockpit. **Próximo paso:** invitar los mails reales de Majo/Jero (*Authentication → Users* + fila en `app.usuarios`) → cerrar hecho-cuando D0 con el equipo → swap de nodos + re-import #1 (D4 completo) → D5.

**2026-07-20 (cierre 64) — Deploy + setup de infra del cockpit, verificado en prod; D4 mitad-app confirmada leyendo Airtable real; login bloqueado por el email de Supabase (Mani ejecutó, Claude guió).** Sesión de puesta en marcha, no de código nuevo grande. **Hecho por Mani con guía:** migraciones 007–009 en Supabase (confirmadas por query: 9 tablas + 4 vistas) · schema `app` en *Exposed schemas* · 2 usuarios en `app.usuarios` · **deploy en Vercel** (root `apps/dashboard`) con las 8 env vars (2 públicas + service_role + `AIRTABLE_PAT`/`AIRTABLE_BASE_ID` + `MOTOR_WEBHOOK_*` ×3 + `RUN_PLAN_HEADER_*` ×2) · Site/Redirect URL de Auth · **credenciales rotadas** (cae el pendiente rojo del cierre 57). **Verificación en prod (curl + código):** `/` y `/operar` → 307 a `/login` · `/login` 200 · `/api/engine/run-plan` sin header 403, ambito typo 400, **con header devolvió la config REAL** (3 voces: Juan Pablo Vieira/Rosario Gómez/Milena Morales · 2 proyectos TP N=20 / TfT N=10 · 5 referentes con salud · 18 ajustes) — **D4 mitad-app probada end-to-end contra Airtable vivo, sin tocar n8n.** **Fixes de código de la sesión:** `?ambito=motor|completo` en la fachada (decisión de Mani "la más efectiva": un endpoint, no dos) + `armarRunPlanCompleto` (25/25 tests) · logging del error real en `auth/confirm` y `login/actions` (para diagnosticar el magic link sin adivinar). **El bloqueante:** el magic link no llega — rate limit del email built-in de Supabase (free). Detalle y plan (Resend) en §Para la próxima sesión. **Gotcha aprendido:** en Supabase free, editar email templates requiere custom SMTP, y el built-in tiene cuota de envío muy baja — para cualquier app con login por mail hay que conectar un SMTP propio (Resend) desde el arranque. **Doc actualizada:** handoff (este bloque + la tabla D0–D4 arriba), README del dashboard, CLAUDE.md (contrato run-plan.md + migraciones 001–009), memoria. **Próximo paso:** destrabar el login (Resend) → cerrar hecho-cuando D0 → swap de nodos + re-import #1 (D4 completo) → D5.

**2026-07-20 (cierre 63) — La decisión de la fachada: query param, no endpoint hermano (Mani eligió "la más efectiva"; Claude implementó).** `GET /api/engine/run-plan?ambito=motor` (default) = filtros de ADR-028 §2 + N resuelta · `?ambito=completo` = mismo shape sin filtros de `activo` y N tal cual, para el **archivado** (todas las voces) y el **descubrimiento** (ignora `activo`, cierre 49) · ambito desconocido = **400** (un typo en n8n no degrada en silencio). Un solo endpoint = una credencial y una URL en n8n. Contrato actualizado ([run-plan.md §Los dos ámbitos](../../core/contracts/run-plan.md)) · 25/25 tests · verificado vivo con curl (400 typo / 503 fail-closed). **Setup de infra HECHO y verificado en prod (cierre 63, Mani + Claude):** migraciones 007–009 corridas (9 tablas + 4 vistas confirmadas por query) · schema `app` en *Exposed schemas* · 2 usuarios en `app.usuarios` (por ahora 2 cuentas de Mani; Majo/Jero se invitan en el beta) · **app deployada en Vercel**: https://pipeline-creacion-contenido.vercel.app (root `apps/dashboard`, 2 env públicas `NEXT_PUBLIC_SUPABASE_*`) · Site URL + Redirect URL de Auth apuntando a la URL de Vercel. **Verificado por curl:** `/` y `/operar` → 307 a `/login` · `/login` → 200 renderiza completo · `/api/engine/run-plan` sin header → 403 (NO redirige: el fix del proxy vive en prod). **Falta para cerrar hecho-cuando de D0:** Mani entra con su mail (magic link) y ve nombre+rol — es un click suyo, no queda nada de código. **Faltan las 8 env de D1/D4** (service_role, Airtable PAT+base, webhook motor ×3, run-plan ×2) en Vercel: cargar los valores **post-rotación** del martes 21/07 (cierre 57) — hasta entonces Operar/Entender muestran sus avisos de error a propósito y el resto anda.

**2026-07-20 (cierre 62) — D4 del cockpit propio, mitad-app: la fachada `GET /api/engine/run-plan` viva y verificada; el swap de nodos n8n queda diseñado pero NO ejecutado (Claude, /goal "sigue con los D").** **El endpoint** ([`app/api/engine/run-plan/route.ts`](../../apps/dashboard/app/api/engine/run-plan/route.ts)): header compartido con comparación timing-safe (`RUN_PLAN_HEADER_*`, par NUEVO del gestor — no se reusa el del webhook) · **fail-closed en cada camino** (sin env → 403; header malo → 403; Airtable caído → 503; nunca un 200 sin config) · hoy lee Airtable por dentro con los MISMOS filtros server-side que los 4 nodos que reemplaza. **El dominio puro** ([`domain/run-plan.ts`](../../apps/dashboard/domain/run-plan.ts)): el gate proyecto-activo-de-voz-activa + N ya resuelta contra `Candidatos por corrida` (fail-open a 100) + pass-through de voces/referentes/ajustes — 3 tests nuevos (24/24). **El contrato** ([`core/contracts/run-plan.md`](../../core/contracts/run-plan.md), hermano de lectura de ingesta-registro como pedía ADR-028): forma v1 = listas `{id, fields}` (lo que el motor ya parsea → el swap es un nodo, no una refactorización), `version` gobierna compatibilidad, fail-closed explícito (el HTTP Request va SIN continue-on-fail). **Gotcha resuelto:** el proxy redirigía TODO a `/login` — un GET del motor habría recibido un 302→200 con HTML (fail-closed roto en silencio); `/api/engine` quedó como ruta pública con su propia auth. **Verificado en vivo** (dev server + curl): sin header 403 · header equivocado 403 · header correcto con Airtable placeholder **503 fail-closed**. Typecheck · 24/24 · build · validador verdes. **Lo que queda de D4 (NO hecho, a propósito):** (1) el swap en los 3 `workflow.json` (4+ nodos de lectura → 1 HTTP Request c/u) — es cirugía del carril del motor, pide `test-nodos.mjs` + replay contra la corrida anterior y el re-import #1 manual; (2) **decisión abierta del arquitecto:** archivado (necesita TODAS las voces) y descubrimiento (ignora `activo` a propósito, cierre 49) no pueden consumir los filtros del run-plan tal cual — ¿query param o endpoint hermano? Está flaggeado en el contrato §Alcance. **Próximo paso:** decidir esa variante con Mani → swap + re-import #1 → verificar mismo plan con replay (hecho-cuando de D4) → D5 (corte de config dominio por dominio, empezando por Ajustes).

**2026-07-20 (cierre 61) — D3 del cockpit propio: capa de datos y modo sombra construidos; el espejo vivo espera las env reales (Claude, /goal "sigue con los D").** **Migración [`009_app_config_sombra.sql`](../../core/schema/009_app_config_sombra.sql):** el schema `app` completo — `voces` · `proyectos` (con las 2 reglas que Airtable no podía hacer cumplir como constraint: `voz_id NOT NULL` y `criterios_relevancia NOT NULL`) · `referentes` (plataforma como enum; la salud NO se guarda: es la vista `v_salud_referentes`, derivada de `runs.metricas.por_referente` 7d + `v_senal_seleccion` como el nodo 24 del archivado) · `ajustes` (`clave` con CHECK contra los 18 knobs del AJUSTE_MAP — un typo revienta al escribir en vez de ignorarse en silencio; `visibilidad` equipo/dev reemplaza al checkbox "Mostrar al equipo") · `candidatos` (sin cuota; `output_id` FK a `outputs` para el archivado futuro) · `descartes` (`veredicto` por fin editable) · `referentes_propuestos` · `eventos` (auditoría C7). **Identidad sombra:** cada tabla lleva `airtable_id` único; el import upsertea por esa clave y el diff compara por ella (legado inofensivo post-D8). Validada igual que la 008: Postgres 16 local, 001→009 en orden limpio, vista de salud computando (9/12=0.75) y las constraints mordiendo (proyecto sin voz ✖, knob inventado ✖). **Los scripts** (`apps/dashboard/scripts/`, imports relativos porque fuera de Next no hay alias `@/`): `npm run sombra:import` = espejo idempotente (upsert por `airtable_id`/`clave` + borrado de lo que Airtable ya no tiene; FKs resueltas contra los padres con error con nombre si falta el orden) · `npm run sombra:diff` = compara los 2 mundos campo a campo y sale 1 si difieren. **El mapeo y el diff son dominio puro** (`domain/sombra.ts`, borrado con el modo sombra en D7): normalización entre mundos (checkbox ausente=false, ''≡null, timestamps por instante Z≡+00:00, numeric-string≡number), y los 2 fail-loud con mensaje útil (proyecto sin voz / sin criterios) — 5 tests nuevos (21/21). **Verificación:** typecheck · 21/21 · scripts parsean y mueren limpio sin env (exit 1) · validador verde. **Ojo:** la corrida real de import/diff necesita las env de D1 en `.env.local` — es de Mani (o de una sesión con el gestor a mano). El hecho-cuando de D3 = diff en cero **3 corridas seguidas**, una con ediciones del equipo en el medio. **Próximo paso:** **D4 — la fachada** (`GET /api/engine/run-plan` leyendo Airtable por dentro, ADR-028; los 3 workflows cambian sus nodos de lectura por 1 HTTP Request = re-import #1; verificar con `test-nodos.mjs` + replay).

**2026-07-20 (cierre 60) — D2 del cockpit propio: la zona Entender completa (las 3 páginas rojas, bien hechas); migración 008 validada contra Postgres real (Claude, /goal "sigue con los D").** Cero riesgo como manda el plan: no escribe nada. **Migración [`008_entender_tarifas_y_vistas.sql`](../../core/schema/008_entender_tarifas_y_vistas.sql):** `app.tarifas` (las 8 tarifas que estaban baked en fórmulas de Airtable, seed del contrato §Tarifas) + las 3 vistas de ADR-027 — `app.v_metricas_calidad` (por semana×proyecto desde `outputs`, con `relevancia_score` para separación del gate), `app.v_embudo_semana` (suma `runs.metricas` del motor; una `en_curso` no ensucia porque sus metricas aún son null), `app.v_costos_semana` (**formato largo** semana×servicio: unidades × tarifa; motor por `params->>workflow='motor'`, descubrimiento por `'descubrimiento'`; `haiku_lote` = lotes pretrim+gate). **Validación de verdad, no a ojo:** Postgres 16 local (homebrew) + base descartable con stubs de Supabase (`auth.users`, `auth.uid()`, roles) → 001–008 aplican en orden limpio → datos de prueba → las 3 vistas devuelven exactamente lo calculado a mano ($5.54 la semana, 84×0.009=0.76, precisión 0.75, separación 0.40). ⚠️ Gotcha para el SQL Editor: **`precision` va quoted (`"precision"`)** — keyword de SQL. **La pantalla:** `entender/page.tsx` orquesta (auth + `Promise.allSettled`, cada bloque falla solo) y las secciones presentacionales viven en `secciones.tsx` (renderizables con fixtures) · calidad con el **`diagnostico` del archivado portado 1:1** a `domain/entender.ts` (mismos umbrales <0/<0.10/<0.20 + apéndice de ruido si precisión<40%; tests de bordes exactos) · embudo con tiles + barras de una sola serie con labels directos (skill dataviz: sin paleta categórica, texto en tokens de texto) · costos con número héroe + tabla por servicio + totales de semanas anteriores. `lib/entender.ts` lee las vistas vía `.schema("app")` con service_role, Zod en el borde. **Verificación:** typecheck · 16/16 tests (2 nuevos de diagnóstico) · build verde · **verificación visual real** (las secciones renderizadas con fixtures en una ruta temporal ya borrada: embudo proporcional, diagnósticos y totales correctos en pantalla) · validador 1355+/0. **Lo manual de Mani:** aplicar `008` después de `007` (mismo SQL Editor; el resto del setup no cambia). **Próximo paso:** **D3 — capa de datos y modo sombra**: migración con el schema `app` completo (voces, proyectos, referentes, ajustes, candidatos, descartes, referentes_propuestos, eventos), script de **import idempotente** desde Airtable y script de **diff** Airtable↔Postgres; Airtable sigue siendo el dueño hasta que el diff dé cero 3 corridas seguidas.

**2026-07-20 (cierre 59) — D1 del cockpit propio: la pantalla Operar completa (el muro de B.2, derribado en el repo); falta el env real para el hecho-cuando (Claude, pedido de Mani).** Sin migrar un solo dato, como manda el plan. **Lo nuevo en `apps/dashboard/`:** (1) **Dominio puro** [`domain/corrida.ts`](../../apps/dashboard/domain/corrida.ts): `armarVistaOperar` espeja el gate del motor (proyecto activo de voz activa; N vacía o 0 → default global, ADR-024) + lecturas legibles de `runs` (`hayCorridaViva` con la MISMA ventana de 120 min del guard single-flight, duración, "entregó N candidatos" de `metricas.outputs`) — 9 tests nuevos (14/14 verdes). (2) **BFF:** `lib/airtable.ts` (borrado en D5/D7, como decía la línea de al lado) lee Voces/Proyectos/Ajustes read-only con los mismos `filterByFormula={activo}` del motor (Zod en el borde; **muere en D5**) · [`lib/supabase/admin.ts`](../../apps/dashboard/lib/supabase/admin.ts) el service_role entra como estaba previsto, solo server · [`lib/runs.ts`](../../apps/dashboard/lib/runs.ts) últimas corridas del motor con el mismo discriminador del archivado (`params->>workflow='motor'`). (3) **Server action `correrAhora`:** POST señal desnuda al webhook con el header (ADR-023), `exigirZona("operar")` antes de disparar, 403 explicado en el mensaje (el gotcha del header), y quién disparó a los logs de Vercel (auditoría interina hasta `app.eventos`/D3). (4) **La pantalla:** "Qué va a correr" (por voz, cada proyecto con su N y si es default; los activos con voz apagada avisan que NO corren) + botón con **confirmación explícita** ("correr gasta créditos", plan §3.3) que se deshabilita si hay corrida viva + "Corridas recientes" (estado/hace cuánto/disparo/duración/entrega/error) con **polling de 5 s solo mientras haya una `en_curso`** (plan §8). Las dos mitades fallan solas (`Promise.allSettled`): sin Airtable igual se ven las corridas, y al revés. **Verificación:** typecheck · 14/14 tests · build verde · smoke browser (login renderiza, `/` redirige) · validador **1364/0**. **Env nuevas en `.env.example`** (valores al gestor, jamás en git): `SUPABASE_SERVICE_ROLE` · `AIRTABLE_PAT`/`AIRTABLE_BASE_ID` · `MOTOR_WEBHOOK_URL`/`_HEADER_NOMBRE`/`_HEADER_VALOR` (el par EXACTO de la credencial `Webhook Motor Header`; distinto = 403 silencioso). **Lo manual de Mani:** los pasos de D0 del cierre 58 + cargar estas 6 env vars en Vercel/`.env.local`. Con eso se prueba el hecho-cuando de D1 (Jero dispara sin abrir n8n y ve cuándo terminó) — **ojo:** el click de prueba gasta créditos reales; conviene probarlo cuando el feed ya se calificó, no antes de una corrida que importe. **Próximo paso:** hecho-cuando de D0+D1 en vivo → **D2: Entender** (las 3 vistas SQL `v_metricas_calidad`/`v_embudo_semana`/`v_costos_semana` + tabla de tarifas + las 3 pantallas read-only).

**2026-07-20 (cierre 58) — D0 del cockpit propio: el andamio construido y verificado; quedan los 3 pasos manuales de Supabase/Vercel (Claude, pedido de Mani).** Arranca la ejecución del [plan-cockpit-propio](./plan-cockpit-propio.md). **`apps/dashboard/` existe:** Next.js 16 (App Router, Turbopack) + TS + Tailwind v4 + shadcn copiado al repo (`components/ui`, preset radix-nova) · login por **magic link** con `shouldCreateUser: false` (un mail no invitado no crea cuenta) · `auth/confirm` soporta los **dos** formatos del mail de Supabase (`token_hash` y `code`, así no depende de editar el email template) · `proxy.ts` refresca sesión y manda a `/login` (**en Next 16 middleware se llama proxy** — el archivo `middleware.ts` es la convención vieja) · las **3 zonas** (`operar`/`curar`/`entender`) con empty states que explican qué llega en qué fase, y **guardia por rol en el servidor**: `exigirZona()` en cada página + dominio puro en `domain/roles.ts` (operador=operar+curar · sponsor=entender · dev=todo). **Migración [`007_app_usuarios.sql`](../../core/schema/007_app_usuarios.sql) lista:** schema `app` + enum de 3 roles + RLS "cada quien lee su fila" + grants; el alta de usuarios es invite + insert (snippet en el header). **Feedback loops nuevos** (CLAUDE.md §Feedback loops): `npm run typecheck` + `npm test` en `apps/dashboard` — el dominio se testea con `node:test` corriendo los `.ts` directo (Node 26 los ejecuta sin transpilar). **Verificación:** typecheck verde · 5/5 tests · `next build` verde (8 rutas + proxy) · smoke en browser con env placeholder (`/` redirige a `/login`, la página renderiza) · validador **1355/0**. **Gotchas del scaffold que ahorran una hora al próximo:** (1) `shadcn init` dejó `--font-sans: var(--font-sans)` **circular** en `globals.css` → toda la UI salía serif; se apunta a `var(--font-geist-sans)`. (2) Turbopack infería `/Users/mani` como workspace root por un `package-lock.json` suelto en el home → `turbopack.root` fijado en `next.config.ts`. (3) `node --test domain/` no anda en Node 26: hace falta el glob `"domain/**/*.test.ts"` + `allowImportingTsExtensions` en tsconfig. (4) `.gitignore` de create-next-app ignora `.env*` ⇒ excepción `!.env.example`. **Sin secretos nuevos:** la app solo usa URL + anon key (RLS manda); el `service_role` recién entra en D1+ y solo en el BFF. **Lo manual de Mani** (los 3 pasos del [README §Setup](../../apps/dashboard/README.md)): aplicar `007` + agregar `app` a *Exposed schemas* · invitar los 5 mails + insertar filas en `app.usuarios` · proyecto Vercel (root=`apps/dashboard`, 2 env vars del gestor) + Redirect URL en Supabase Auth. Con eso se cumple el hecho-cuando de D0 (Majo entra, ve nombre y rol, `/entender` la rebota). **Próximo paso:** los 3 pasos manuales → verificar el hecho-cuando → **D1: ▶ Correr ahora** (pantalla Operar leyendo Airtable read-only + POST al webhook desde el BFF + estado leyendo `runs`).

**2026-07-19 (cierre 57) — Los 3 re-imports hechos + feed reseteado a mano para la corrida del lunes (Mani + Claude).** **(1) Re-imports ✅** — Mani re-importó los 3 workflows: el motor entra con **spillover** (enmienda ADR-024) y **pool de 8 concurrentes** en `Transcribir` (cierre 55). Caen los pendientes de los cierres 54–55. **Confirmación independiente de que el archivado quedó bien:** su cron del domingo 19/07 18:00 corrió **`ok`**, dejó *Descartes del gate* en 0 y sumó 2 filas a `outputs`. **(2) Reset del feed, pedido por Mani para arrancar limpio.** Antes de borrar se auditó el blanco: `Candidatos` tenía **65 records, TODOS `nuevo`** (07-10/11/13/17) ⇒ cero calificaciones perdidas, y confirma otra vez el feed apilado del cierre 53. **La ambigüedad que hubo que resolver antes de tocar nada:** "borrar de Airtable y Supabase" no mapea 1:1 — en Supabase no existe "Feed de Calificación"; lo que gobierna si la corrida es realmente limpia es **`processed_items`** (el dedup), y aparte están `outputs` (histórico canónico, ADR-014, alimenta `v_senal_seleccion`) y `runs` (bitácora que el archivado lee para Métricas). **Decisión de Mani: solo lo del feed actual, el resto del histórico procesado se respeta.** Ejecutado: 65 `Candidatos` borrados + **sus** 65 filas de `processed_items` (**298 → 233**), con `outputs` (18) y `runs` (22) intactos. **El join no era obvio:** `Candidatos` **no guarda `external_id`**, así que el vínculo con el dedup es por `url_referente` ↔ `processed_items.url` — el cruce dio **65/65 exacto, cero huérfanos**. Backup de los 65 records en el scratchpad antes de borrar. **Gotcha de tooling que vale para la próxima:** el sandbox corta las requests curl con URL larga (**HTTP 000 en 0.000s** — no es rate limit de Airtable, que fue mi primera hipótesis equivocada): el DELETE de Airtable anda de a 1–2 ids por query string y **muere a partir de ~5**; la salida es el **MCP `delete_records_for_table`** (50 por request, sin límite de URL). También: el Python del sistema **no tiene certs CA** (`CERTIFICATE_VERIFY_FAILED`) ⇒ para HTTPS usar `curl`, no `urllib`. **(3) 🔴 Credenciales expuestas:** Mani pegó el **PAT de Airtable** y el **`service_role` de Supabase** en el chat (misma clase que el cierre 36). Se usaron desde un archivo en el scratchpad con permisos 600, **nunca** dentro del repo, y se borró al terminar. **Decisión de Mani: rotar el martes 21/07, después de la corrida**, para no romper la prueba del lunes → §Pendiente vivo. **Qué esperar el lunes:** pool = 65 videos liberados (ya habían pasado el gate una vez ⇒ buen material para ver el spillover repartiendo entre TP y TfT) + lo publicado desde el 17/07; los 68 vistos-y-no-entregados del 17/07 siguen bloqueados, así que `colectados` va a ser más bajo que el viernes y **eso no es un fallo**. **Archivos:** solo handoff (§Pendiente vivo + este log). **Próximo paso:** la corrida del lunes con sus 3 verificaciones (guard, descubrimiento, `trigger_type`), después el curado del cockpit, y el martes rotar credenciales.

**2026-07-18 (cierre 56) — Pre-re-import: el cockpit gana su capa de ayuda (53 descriptions escritas por MCP) y el spec por página queda campo a campo (Mani + Claude).** Pedido de Mani antes del re-import: onboarding completamente ready (cada campo de cada página explicado) + guía tabla por tabla. **El hallazgo que lo simplificó todo: `update_field` SÍ edita descriptions** — el límite de la API (cierre 50) es la config de *páginas*, no el schema. Así que los "textos de ayuda" dejaron de ser un paso manual: **por MCP se escribieron las descriptions de TODOS los campos de las 9 tablas** (53 nuevas: `Candidatos` 21 — estaba en cero —, `Proyectos` 5, `Voces` 3, `Descartes` 7, `Métricas Global` 17 de contadores/costos; el resto ya las tenía de pasadas previas) **+ la descripción de la tabla `Voces`** (era pre-ADR-009, "Eje de generación" — poda de B.3 que estaba esperando). El equipo ahora ve el ⓘ en cada campo. **2 verificaciones en vivo de paso:** `Métricas Proyectos.precision` **ya es tipo percent** (el fix "(3) % en Calidad" de B.6 quedó sin objeto) · la tabla `Métricas Global` mezcla filas GLOBAL y DESCUBRIMIENTO ⇒ la página *Salud del Sistema* necesita **filtro `ambito = GLOBAL`** (sumado al paso 7 de la guía; sin él, el embudo muestra filas vacías del descubrimiento). **Entregables:** [mapa-campos §6.2](./mapa-campos.md) nueva — el spec por página campo a campo (orden, ✏️/👁, qué ocultar: links inversos en Proyectos/Voces, `fecha`/`fecha_calificacion` del Feed, calidad+costos fuera de *Salud*) · onboarding gana los diccionarios que faltaban (campos de *Descartes*, *Calidad por Proyecto*, *Salud*, *Costos* + la nota del ⓘ) · dev-doc §5 apunta al spec y fija la regla "campo nuevo = description junto con el campo" · artifact "Curado del Cockpit" republicado (v2: helper texts ✅, filtro ambito, precision sin objeto). **Lo que queda a mano para Mani:** visibilidad + permisos + filtros por página (los 12 pasos) y el helper text de cada elemento. **Adenda del mismo cierre — §6.3, el helper text por página:** Mani pidió el texto de ayuda de *cada campo mostrado en cada página*, que es una cosa **distinta** de la description de tabla — Airtable tiene dos: el **ⓘ del campo** (ya cargado por MCP) y el **helper del elemento en la página** (debajo del campo, se escribe a mano al armar la vista, la API no lo toca). Escritos los **105 helpers** de las 12 páginas + el form, en tono para Majo/Jero, con la regla de triage "si vas corto de tiempo, cargá solo los ✏️ editables — los 👁 ya se explican con el ⓘ". Viven en [mapa-campos §6.3](./mapa-campos.md) y en el artifact v3 (acordeón por página, botón de copiar por campo). **Próximo paso:** sin cambios — re-import (spillover + pool) y el checklist del lunes.

**2026-07-18 (cierre 55) — Transcribir gana un pool de 8 llamadas concurrentes: la corrida baja de ~38 min a ~5 y el paso de infra del cierre 54 queda sin objeto (Mani + Claude).** Dato nuevo de Mani que cambió el fix: **Supadata está en plan pago ($17/mes: 3.000 créditos, 10 req/s, batch)** — la memoria del repo asumía el free tier de 1 req/s, que era lo que prohibía la concurrencia. **Propuesta de Mani:** paralelizar con ~8 nodos de transcripción + Merge. **Consensuado a la versión simple:** un **pool de 8 llamadas concurrentes dentro del ÚNICO nodo** `Transcribir` — misma velocidad, cero cambio de topología, y la razón de fondo: partir el fan-out en ramas **rompe el dedup por `external_id`** (copias del mismo video en ramas distintas = doble cobro), que es exactamente lo que el cierre 31 arregló. Implementado con builder: workers sobre un cursor compartido, `SLEEP_MS` eliminado (era del free tier), el presupuesto ahora corta *arranques* (los en vuelo terminan). **Números:** 8 en vuelo × ~27s/video inician ~0.3 req/s (lejos del límite de 10); 84 videos ≈ 5 min; **780s cubren ~200 videos** ⇒ `presupuesto_transcribir_s` **volvió a 780** y **el env de InstaPods NO se toca** (los pasos de SSH+restart del cierre 54 se retiraron del §Pendiente vivo). **El harness ahora también cubre Transcribir** (compilado como AsyncFunction + `this.helpers.httpRequest` mockeado): 11 casos nuevos — concurrencia en vuelo ≤8, dedup 1 llamada por único con fan-out, fail-open con Supadata caída, corte por presupuesto con aviso, fallback de idioma. **42/42 verdes**, validador 1229/0. **Docs:** workflow.yaml (knob + etapa enriquecer), dev-doc (Config + nodo 21), README del motor, CLAUDE.md del motor (además se corrigió el "no hay tests", drift desde el cierre 46), memorias transcribir/costos. **Batch API de Supadata:** existe y queda anotada como mejora futura (submit+poll es más código que el pool y el pool ya deja el nodo en ~5 min). **Próximo paso:** sin cambios — re-import del motor (ahora spillover + pool en una sola pasada, §Pendiente vivo) y el checklist del lunes.

**2026-07-17 (cierre 54) — La sesión de auditoría completa: spillover construido y verificado con datos reales, el hallazgo nuevo de transcripción, ADR-025 firmado y la guía de curado lista (Mani + Claude).** Ejecuta los 3 frentes que el cierre 53 parkeó. **① Fixes con decisiones de Mani (consultadas en vivo):** **(1) Spillover ✅ (enmienda de ADR-024):** `Armar candidato` gana el paso 3 — dedup → corte → **spillover**: los sobrantes van al proyecto con cupo que también los gateó, con LA COPIA de ese proyecto (su `relevancia_*`). **Garantía dura pedida por Mani: un video sale en UN solo proyecto, siempre** (N candidatos distintos). 8 casos nuevos en `test-nodos.mjs` (35/35 verdes) **+ replay con los outputs reales de la V-run: TP 6→9 clavado** (los 3 videos exactos del diagnóstico del 53), TfT 10, 0 duplicados. Semántica final documentada: **N es techo exacto, la entrega es best-effort sobre el supply**. **(2) Referentes compartidos entre proyectos de una voz = VÁLIDO** (decisión Mani): el pipeline ya dedupa las etapas pagas; el under-delivery se ataca sembrando referentes, no prohibiendo el solape. **(3) Guard single-flight → prueba viva el lunes 20/07 con el cron** (cero costo extra; instrucción paso a paso en §Pendiente vivo). **(4) Feed apilado → onboarding + tarea del equipo.** **② El barrido destapó el hallazgo gordo que la V-run no vio: la transcripción degradada en silencio.** De 84 videos únicos solo **28 salieron con transcript** — el patrón en `outputs-main` es un prefijo perfecto: `presupuesto_transcribir_s`=780 cortó el loop (~27s/video de Supadata; el sleep es 1s). Consecuencia real: **6 de los 16 entregados salieron ⚠️ SIN GUION** y el "supply fino" del 53 estaba en parte contaminado (el gate juzgó 56 videos solo por caption). **Decisión Mani: subir infra** — repo pasa el presupuesto a **3000**; Mani sube `N8N_RUNNERS_TASK_TIMEOUT` a 3600 en InstaPods **ANTES** del re-import (al revés = modo de fallo del 07-10: el watchdog mata el nodo entero; fallback documentado). El cierre 53 decía "84 transcritos" — era impreciso: 84 *procesados*. También del barrido: grafo limpio en los 3 workflows (0 refs rotas, 31 code nodes compilan), `ventana_corrida_min` vivo en el archivado, el no-filtro de voces del descubrimiento intacto, TikTok vacío confirmado como falta de siembra (`tt_profiles: []`), y un falso positivo documentado para no re-investigar: **`POST-airtable.json` es la RESPUESTA de Airtable y omite checkboxes false** — `viral_por_tamano` sí se escribe. **③ A.5 CERRADA: [ADR-025](../adr/ADR-025-cockpit-producto-propio.md)** — el cockpit migra a producto propio (toda la superficie); Airtable interino curado al mínimo; **B.2 RETIRADA** (el muro del free plan fue el empujón); disparo interino = Execute manual. Sin gate de aprobación (Mani lo propone al equipo y avanza). Enmienda del invariante transversal en ROADMAP §1. **Entregables de superficie:** guía de curado **ejecutable** en [mapa-campos §6](./mapa-campos.md) (12 pasos con textos de ayuda copiables) + **checklist interactiva** publicada como artifact ("Curado del Cockpit"); [onboarding](../onboarding-equipo-redes.md) actualizado al refactor (corridas a demanda §3.1, `N` y su semántica de máximo, `Voces.activo`, referentes compartidos, páginas nuevas del menú, FAQ). **Limpieza pedida por Mani:** el nombre "Andrés" borrado de docs y memoria (one-pager, plan §0, este log). **Verificación:** 35/35 tests, validador 1229/0, secretos limpios. **Archivos:** motor (`workflow.json` Armar candidato + Config, `workflow.yaml`, `test-nodos.mjs`, README), ADR-024 (enmienda), ADR-025 (nuevo), ADR README, ROADMAP §1, plan (A.5/B.2/C.1/§6), mapa-campos (§5.2 + §6 nueva), dev-doc (§ enmiendas + nodos 21/24 + Config), onboarding, CLAUDE.md (rango ADRs), one-pager. **Próximo paso:** todo manual — el checklist de §Para la próxima sesión (infra → re-import → lunes → curado → equipo); el ciclo se juzga el 26/07; después, kickoff del producto propio.**

**2026-07-17 (cierre 53) — V-run: C.1 (N por proyecto) CONFIRMADO en vivo; el corte funciona, pero destapó el límite de supply + un spillover gap con proyectos que comparten referentes (Mani + Claude).** Mani corrió el motor por *Execute manual* post re-import y actualizó `/outputs` (gitignored). **Diagnóstico del run:** **✅ C.1 vivo** — el plan entregó N por proyecto: *Trading fast tips* = **10 exactos** (su N), no ~100 del global ⇒ el re-import del cierre 52 cargó C. **Verificado en Airtable por MCP:** 16 records nuevos fecha 07-17 (**TP 6 · TfT 10**), `estado=nuevo`, links proyecto/voz/referente correctos, calzan clavo con `POST-airtable.json`. **⚠️ Under-delivery: 16 entregados vs 30 objetivo (TP 6/20, TfT 10/10), dos causas con datos:** **(a) Supply (dominante)** — de 84 videos únicos transcritos (cap_top_n=100 no mordió), el gate pasó solo **22 únicos** (TP 11 = 3 exclusivos + 8 compartidos; TfT 19). **TP topa en 11 aun con asignación perfecta**, nunca 20: el pool no tiene 20 videos psychology-relevantes y el gate hace su trabajo (rechaza fast-tips para TP). **(b) Spillover gap (arreglable, NO parcheado)** — 3 videos que pasaron el gate de TP se **descartaron enteros** porque el dedup→corte de C.1 los asignó a TfT (mayor `relevancia_score`) y TfT ya estaba lleno (10), **sin spillover** al TP hambriento (tenía 14 slots). Arreglarlo llevaría TP 6→9. **El plan (C.1) decía "N se cumple exacto" — es media verdad:** N es un techo exacto (nunca lo pasa) pero no una entrega garantizada cuando el supply es fino o el pool compartido se concentra en un proyecto; dedup→corte no reparte los sobrantes. **No lo parcheé** (protocolo #4): toca la filosofía "N techo vs entrega" → decisión de Mani, posible enmienda de ADR-024. **Raíz que lo destapó:** los 2 proyectos activos comparten **la misma voz (Juan Pablo Vieira) y los MISMOS 5 referentes** (@abeteddymaruta, @nicholascrown, @martinelli_paul, @casper_smc, @krosh.ivan) — el peor caso del modelo Netflix ("universos separados"). Pregunta de producto abierta: ¿proyectos bajo una voz con referentes distintos, o se acepta N bajo para nichos finos? **🔵 Falso positivo que casi reporto, descartado (para que nadie lo re-investigue):** sospeché doble cobro Supadata/Haiku (126 filas video×proyecto para 84 únicos, 42 duplicados). **NO lo hay:** `Transcribir` y `Traducir` **dedupan por `external_id`** y reparten el resultado a las copias del fan-out (arreglado en cierre 31) ⇒ 84 llamadas, no 126. El pipeline ya maneja bien el caso de referentes compartidos en las etapas pagas. **NO probado:** el guard single-flight (fue un solo Execute) y `trigger_type='manual'` en `runs` (Supabase, sin acceso desde outputs). **Integridad Airtable (nota operativa, no bug):** la tabla `Candidatos` tiene **67 records** — 51 son `nuevo` sin calificar de corridas viejas (07-10/11/13): el equipo no está calificando; el archivado los purga a los 20 días, así que no rompe, pero el feed está apilado. **Decisión de producto de la sesión (turno previo, contexto para el ADR de A.5):** ante el muro de B.2 (Airtable free bloquea "Run a script"), Mani decidió **mover todo a un producto propio** (frontend+backend+auth+escalabilidad) → resuelve A.5 hacia producto propio para toda la superficie (Mani lo propone al equipo y avanza por su cuenta, sin gate de aprobación); **B.2 deferido**, el equipo dispara por Execute manual. Near-term nada se desarma (motor/archivado/descubrimiento + Airtable siguen vivos). Memoria `refactor-voces-proyectos` actualizada. **Archivos:** solo docs (handoff: §Pendiente vivo V-run ✅ + B.2 deferido, tablero C, este log). **Próximo paso:** (1) decidir el **spillover** (enmendar C.1/ADR-024 o aceptar N como techo); (2) decidir **referentes-por-proyecto** bajo una voz; (3) escribir el **ADR de A.5** (Airtable→producto; sin gate de aprobación); (4) el **guard single-flight** sigue sin prueba viva (un 2º Execute encima de una corrida viva).

**2026-07-17 (cierre 52) — Re-import de los 3 workflows: el motor nuevo, el archivado nuevo y el descubrimiento están VIVOS (Mani).** Cae el bloqueante que arrastraba desde el cierre 45: todo lo que estaba "en el repo pero no en n8n" ahora corre. **Motor:** re-importado, publicado y activo, con el webhook on-demand + guard single-flight (C.3, 37 nodos), N por proyecto (C.1) y gate por `Voces.activo` (C.2). El path del webhook (`<<WEBHOOK_PATH_MOTOR>>` reemplazado) y la credencial `httpHeaderAuth` **`Webhook Motor Header`** (header + value) quedaron creados — **los dos en el gestor de contraseñas, jamás en git** (enmienda auth de ADR-023). **Archivado:** re-importado con los cambios de D (D.3b `notas_equipo`/`viral_por_tamano` → `outputs.metadata`, D.4 poda `tema`/`link_doc`, matiz D.2 `runs_fallo`×`en_curso`). **Descubrimiento:** también publicado y corriendo. Las versiones viejas quedaron **desactivadas** (confirmado por Mani) — sin riesgo de cron doble el lun 20/07. **Lo que NO cambia con esto:** el re-import es la mitad n8n del webhook; falta la mitad Airtable (**B.2**: automation `fetch(POST)` a la URL + botón "▶ Correr ahora", mandando el MISMO header — la API de Airtable no lo crea, es de Mani a mano). Y **la prueba viva de C sigue pendiente**: es la V-run (corrida post re-import — botón o Execute manual — verificando que *Trading Psychology* entrega ~20 y *Trading fast tips* ~10, no ~100 repartidos → C.1 probado en vivo). **El primer ciclo end-to-end sigue cerrando el 26/07** (§Ciclo): el archivado del dom 19/07 sale parcial por diseño (aún no corrió el motor nuevo). **Regla que se activa ahora:** en cada re-import futuro reusá el MISMO path y el MISMO header (memoria `reimport-eslabon-debil`, versión webhook); valores nuevos = automation apuntando al endpoint viejo, botón 403 en silencio. **Próximo paso:** B.2 (botón + automation en Airtable, con un click de prueba antes de dárselo a Majo/Jero) + esperar/disparar la V-run. Los fixes de UI de B.6 siguen en el carril de Mani.

**2026-07-16 (cierre 51) — El webhook del motor gana Header Auth: enmienda de auth a ADR-023 (Mani + Claude).** Salió de una pregunta de Mani sobre qué era `<<WEBHOOK_PATH_MOTOR>>`. **El hallazgo:** el nodo webhook de C.3 quedó **sin autenticación** (`credentials: null`, sin opción de auth) ⇒ el **path hacía de bearer token por omisión, no por decisión** — y revisando ADR-023, **el ADR nunca decidió el tema**. Quien consiguiera la URL podía disparar corridas **pagas** (Apify + Supadata + Haiku) a voluntad; el guard single-flight acota un click repetido, no el abuso sostenido. **Decisión de Mani: Header Auth.** El nodo `Disparo on-demand (webhook)` ahora lleva `authentication: headerAuth` + credencial `httpHeaderAuth` **`Webhook Motor Header`** (builder Node, como manda el CLAUDE.md del motor; solo el nombre en git, nunca el valor). **Lo que cambia el modelo de amenaza:** el path pasa de secreto a identificador y el secreto es el header, que **no viaja en la URL** (donde una URL se filtra sola: logs de proxy, historiales, referers). El path aleatorio queda igual, como defensa en profundidad. La auth es del **trigger**, así que un POST no autorizado da 403 y **ni abre run** (no consume el guard, no ensucia `runs`). No toca cron ni Execute manual (no pasan por HTTP). **Descartadas** (en el ADR, con su porqué): Basic Auth, JWT, y seguir sin auth. **⚠️ El costo aceptado, que es el que va a morder:** un lugar más donde el re-import falla **en silencio** — si el header de la automation y el de n8n no coinciden, el botón da 403 y nadie se entera. Por eso el §Pendiente vivo ganó el paso de la credencial + "probalo con un click antes de dárselo al equipo" + **la regla de reusar el MISMO path y header en cada re-import futuro** (la versión webhook de `reimport-eslabon-debil`: valores nuevos = automation apuntando al endpoint viejo). **Corrección de algo que dije mal en la sesión:** avisé que el riesgo del timeout de 900s en `Transcribir` seguía vivo — **hay mitigación desde antes**, el knob `presupuesto_transcribir_s` (780) del Config: al excederlo el resto pasa **sin transcript** (fail-open) en vez de morir por el watchdog. El riesgo real de una corrida grande no es que muera, es **degradación silenciosa** (muchos ⚠️ SIN GUION). **Verificación:** grafo 0 problemas (37 nodos, 3 triggers), 15 code nodes compilan (ojo: hay que compilarlos como **AsyncFunction** — n8n los corre en contexto async, así que un `new Function()` pelado da 4 falsos positivos por el `await` de nivel superior), `test-nodos.mjs` verde, validador **1229/0** (+1: el manifest declara la credencial nueva), secretos limpios. **Archivos:** `workflow.json` (1 nodo), `workflow.yaml` (trigger + credentials + setup), ADR-023 (enmienda auth), contrato cockpit §Disparo on-demand (snippet del `fetch` con header), handoff (§Pendiente vivo). **Próximo paso:** sin cambios — el re-import del motor sigue siendo el único bloqueante de la V-run, ahora con un paso más.

**2026-07-16 (cierre 50) — Barrido de "qué puede hacer el agente y qué no" antes de la corrida manual: B.4 cerrado, *Costos* publicada, N sembrada (Mani + Claude).** No es código: es destrabar a mano lo destrabable y **dejar por escrito el límite de la API**, que era lo que se re-derivaba cada sesión. **(1) B.4 ✅** — el permiso MCP de escritura que se denegó en el cierre 49 esta vez pasó: tildado `Mostrar al equipo` en *Mínimo de likes* y *Mínimo de vistas*. Cero riesgo (la máquina no lee ese checkbox; es el filtro de la página *Configuración Global*). **(2) *Costos* publicada** por `publish_interface` — Mani autorizó publicar el interface *Cockpit Redes* **entero** sabiendo que promueve todos los drafts, no solo esa página. Queda verificar a ojo el filtro de semana (§Pendiente vivo). **(3) N sembrada, y es lo que le da sentido a la corrida manual:** el hallazgo del cierre — con `N` vacía en los 6 proyectos, **el motor nuevo entrega exactamente lo mismo que el viejo** (todo cae al global 100), así que la V-run habría verificado "no rompí nada" sin probar **ninguna** feature de C. Decisión de Mani: N **asimétrica** en los 2 únicos proyectos activos — *Trading Psychology* = 20, *Trading fast tips* = 10. Si post re-import entrega ~20 y ~10, C.1 (corte por proyecto, ADR-024) queda probado en vivo con una sola corrida. **(4) El límite de la API, ahora documentado para no re-derivarlo:** el MCP de Airtable escribe *records* y publica interfaces, pero **no edita la config de una página** — no existe `update_page`, solo `create_page`/`delete_page`/`publish_interface`. ⇒ **todo B.6 restante + B.5 son de Mani a mano, sin atajo de agente**. Verificado de paso por MCP: `veredicto` sigue `isEditable: false` en *Descartes* (el loop de ADR-021 sigue muerto), *Salud del Sistema* sigue sin un solo campo del embudo, y la página *Voces* no muestra `activo`. **(5) Chequeos de estado que dieron limpio:** `test-nodos.mjs` verde, working tree limpio, el placeholder `<<WEBHOOK_PATH_MOTOR>>` intacto en el `workflow.json`, los 6 proyectos con 1 sola voz (la limpieza del cierre 47 aguantó), las 3 voces activas. **Archivos:** solo docs (handoff + plan §B.4/§B.6(4)/§C.1). **Estado:** el único bloqueante de la corrida manual es el **re-import del motor** — no espera nada más. **Próximo paso:** Mani hace el re-import (checklist §Pendiente vivo) y dispara el Execute; el botón/automation de B.2 es aparte y solo hace falta para probar el webhook, no la corrida manual.

**2026-07-16 (cierre 49) — Las 3 decisiones abiertas del carril, consultadas y ejecutadas: D queda COMPLETO en el repo (Mani + Claude).** Continuación inmediata del 48; cierra todo lo que el carril del motor tenía "esperando a Mani" preguntándole en vivo. **(1) D.3 → salida (b):** `Armar filas archivado` ahora lleva **`notas_equipo` y `viral_por_tamano` a `outputs.metadata`** (al Sheet no van). La señal cualitativa del equipo (el *por qué* de un 👎) y la marca viral dejan de morir con el record cada domingo; "¿lo viral se aprueba más?" pasa a ser una query SQL. **La (a) — que las notas entren al destilado de Haiku — queda abierta a propósito:** se decide con el corpus que (b) empieza a acumular (si va, es enmienda de ADR-022). **(2) D.4 aprovechado** (el plan lo autorizaba solo si D.3 iba por (b)): podadas las lecturas vestigiales `f.tema`/`f.link_doc` del mismo nodo — archivaban `''` desde ADR-019/009; las filas viejas conservan sus keys en el jsonb y `v_senal_tema` ya era inerte. **(3) Matiz D.2 arreglado:** `Computar métricas semana` **saltea los `en_curso` más jóvenes que `ventana_corrida_min`** al contar `runs_ok/fallo` (knob nuevo en el Config del archivado, 120, mismo nombre/semántica que el motor) — un click del botón cerca del domingo 6pm ya no cuenta como fallo; un `en_curso` más viejo es zombie y sigue contando. Loguea `corridas vivas salteadas: n`. **(4) Descubrimiento vs `Voces.activo` → se queda como está, DELIBERADO:** una voz apagada sigue recibiendo propuestas (barato, despensa para cuando se prenda). Documentado en el plan §Descubrimiento y en el README del descubrimiento con "no lo arregles" explícito — la decisión pasó de "pendiente" a "tomada", que es lo que evita el fix silencioso de un agente futuro. **Archivos:** `workflow-archivado/workflow.json` (builder Node, 3 nodos tocados: Config, `Armar filas archivado`, `Computar métricas semana`), plan (D.3/D.4 ✅, D.2 actualizado, §Descubrimiento decidido), mapa-campos (§2.1/§2.2/§4 resueltos), dev-doc (§4.2 filas 3/10/17d, §6 convención de metadata), README del descubrimiento. **Verificación:** grafo del archivado limpio (37 nodos, 10 code nodes, sintaxis OK), validador **1228/0**, secretos limpios. **Estado:** C y D completos en el repo, **ninguno re-importado** — el §Pendiente vivo tiene los 2 checklists (motor con webhook path; archivado sin placeholders nuevos, puede ir en la misma sesión de n8n). **Próximo paso:** los re-imports + botón/automation (Mani); en código del refactor no queda nada que no espere a A.5/B (carril superficie).

**2026-07-16 (cierre 48) — C.3 + C.4: el webhook single-flight está construido y C queda COMPLETO en el repo (Mani + Claude).** Cierra el carril del motor. **C.3 (ADR-023, builder Node):** nodo `Disparo on-demand (webhook)` (POST, path placeholder `<<WEBHOOK_PATH_MOTOR>>` — la URL de Producción dispara corridas pagas, va al gestor, jamás a git; responde 200 inmediato) + el guard. **Las 3 decisiones las tomó Mani** (consultadas, no asumidas): (1) **el guard aplica a los 3 triggers**, no solo al webhook — sin eso el cron del lunes podía arrancar encima de una on-demand viva, el barredor zombie la marcaba `fallo` y las dos corrían en paralelo pagando doble; costo aceptado: si hay corrida viva a la hora del cron, esa semana se saltea (recuperable con el botón). (2) **Vivo vs. zombie por `ventana_corrida_min`** (knob nuevo del Config, 120 min; 19→20 knobs): `en_curso` más joven = viva (bloquea), más viejo = zombie. **El barredor zombie se movió ANTES del guard** y ganó umbral de edad — así un zombie jamás traba el motor (con el orden viejo, barrido-después-de-abrir, un zombie habría bloqueado todo para siempre) y ya no necesita excluir su propio run id. (3) **Check-then-act aceptado**: ventana residual de ~1-2 s entre clicks casi simultáneos (peor caso: costo doble + candidatos duplicados esa vez; `processed_items` no se ensucia); se descartó el unique index parcial en Supabase. **Arranque nuevo del motor (33→37 nodos):** `[cron|manual|webhook] → Config → Barrer runs zombie → Leer corridas vivas → Guard single-flight → (libre) Abrir run → Leer Proyectos`, con la rama bloqueada muriendo en un NoOp **sin abrir run** (un click bloqueado no ensucia `runs_fallo` ni la salud). Fail-open intacto: Supabase caído ⇒ el guard deja pasar. **Bonus de trazabilidad:** `Abrir run` registra el `trigger_type` real (`on_demand`/`manual`/`cron` vía `isExecuted` — antes TODO se registraba `'cron'`; el check de 001 ya permitía los 3). **C.4 (confirmar, no asumir — confirmado a nivel repo):** la coexistencia secuencial cron+on-demand es limpia por diseño (`unique(platform, external_id)` de 002 + `ignore-duplicates` + `Leer procesados`/`Heat-score` — quien corre primero se lleva el video) y **el archivado no filtra por `trigger_type`** ⇒ las corridas on-demand entran solas a Métricas (medio D.2 de regalo). Matiz documentado en el contrato: **un segundo click re-paga scrape+pre-trim aunque entregue nada nuevo** (el dedup corta en Heat-score, después del pre-trim) — el botón no es gratis. **E.2 quedó ✅ en su mitad-repo:** con la señal desnuda no hay tabla `Corridas` ni campos nuevos; lo que falta es a mano (botón + automation, la API no los crea) → B.2, checklist en §Pendiente vivo y en el contrato §Disparo on-demand. **Drift ajeno corregido de pasada:** el manifest (`workflow.yaml`) todavía listaba `banda_descarte_min/max` como filters (C.5 los podó del Config en el cierre 45) — podados; sumado el trigger webhook y `ventana_corrida_min`. **Docs:** enmienda C.3 en ADR-023 (el "cómo" del guard) · dev-doc §1/§2.1/§2.2/§9 (topología nueva, filas 2b/4/4b/4c/4d) · contrato cockpit §Disparo on-demand nuevo · README/CLAUDE.md del motor · checklist manual de `setup-airtable.mjs`. **Verificación:** grafo 0 problemas (37 nodos, 3 triggers, 15 code nodes) · `test-nodos.mjs` verde (los jsCode no se tocaron) · validador **1228/0**, secretos limpios. **⚠️ El guard NO está probado en vivo** (es httpRequest+IF, no code node — `test-nodos.mjs` no lo cubre): la prueba real es el re-import + un Execute con una corrida ya corriendo. **Bonus del mismo cierre — D.1 + D.2 ✅:** leídos `Computar métricas semana` y `Computar salud referentes` del archivado: **no asumen el barrido total** — suman sobre todos los runs de la semana (dedup por id, `duracion_min` promedia, `por_referente` acumula, min de muestra al total semanal); la calidad por proyecto ni mira runs. Matiz flagueado sin parchear (D.2 del plan): `runs_fallo` contaría como fallo un run legítimamente `en_curso` al momento del archivado — imposible con solo cron, posible con un click del botón ~5:45pm del domingo; cosmético, fix barato si Mani lo quiere. **Próximo paso:** re-import del motor (Mani, checklist §Pendiente vivo) + botón/automation en Airtable (B.2); en código del carril motor solo quedan decisiones de Mani (D.3, D.4, matiz D.2); los carriles de superficie siguen (B.6 → A.5).

**2026-07-16 (cierre 47) — el dato de las 2 voces, limpio; la regla del modelo queda escrita (Mani).** Cierre del hallazgo del 46, mismo día. **Mani fijó la regla, y es la esencia del refactor: un proyecto tiene UNA voz; una voz tiene VARIOS proyectos.** Limpió los 2 proyectos en Airtable; verificado por MCP: los 6 con una sola voz, 2 por voz (Milena → parejas + empresas · Rosario → Storytelling + líderes · Juan Pablo → los 2 de Trading). **Coletazo que vale anotar:** en *Comunicación para lideres* eligió **Rosario**, y el motor venía usando **Milena** (era `[0]`) ⇒ ese proyecto **va a filtrar con otros criterios de voz** cuando se prenda. No hay efecto hoy (está inactivo; solo corren los 2 de Trading), pero es exactamente el silencio que el hallazgo destapó: nadie sabía qué voz estaba aplicando. **Lo que NO se puede cerrar y queda como guarda:** Airtable no ofrece un link "exactamente uno" por API, así que `voz_default` sigue siendo multi-link y nada impide re-romperlo. Por eso quedan las 3 capas: la regla en el contrato, el **aviso por log** del motor, y el test. **Si el aviso aparece, se limpia el dato — no se toca el código.** Escrito en [mapa-campos §2.6](./mapa-campos.md) (la vieja §2.5 se partió: el multi-link de **Referentes** sigue abierto, es otra pregunta), el contrato y §Pendiente vivo. Decisiones abiertas del refactor: de 3 a **2**.

**2026-07-16 (cierre 46) — E.1 + C.2 (`Voces.activo` vivo y respetado) + tests de verdad para el motor + un dato sucio que apareció solo (Mani + Claude).** Cierra el bloque de C que no depende del webhook. **E.1:** `Voces.activo` creado en contrato + `setup-airtable.mjs` + **la base viva** por MCP (`fldqekbuBxhzgOSG1`). **🚨 El gotcha del cierre, vale para E.2 y para cualquier toggle futuro:** crear un checkbox en Airtable deja **todos los records existentes destildados**, y como C.2 filtra server-side por `{activo}`, desplegar así habría dejado **cero voces activas ⇒ el motor entregando nada**. Se prendieron las 3 voces a mano en la misma pasada. **Campo nuevo + filtro nuevo = poblar el dato ANTES, siempre.** **C.2:** `Leer Voces` del motor (solo el motor) filtra `filterByFormula={activo}`; `Armar plan` saltea los proyectos cuya voz no llegó y **loguea cuál**. **Por qué server-side y no en el code node** (esto es lo que hay que entender antes de tocarlo): Airtable **omite los checkbox destildados** del payload, así que en el code node `activo` ausente es indistinguible de *el campo no existe* → no hay fail-open posible sin ambigüedad. El filtro lo resuelve en el server, y **es el mismo patrón que ya usaba `Leer Proyectos`** — no inventamos nada. Proyecto **sin** voz: no gateado. Bonus verificado: el gate corta **antes del scrape**, así que un proyecto salteado **no se paga en Apify**. **🔴 Lo que apareció solo mirando el dato vivo (lo más importante del cierre):** **2 de 6 proyectos tienen 2 voces linkeadas** — *Comunicación para lideres* y *Comunicación en empresas* → `[Milena Morales, Rosario Gomez]`. El código lee `voz_default[0]` ⇒ gana Milena y **Rosario se ignora en silencio**: esos proyectos vienen aplicando el ajuste de voz de Milena y archivando `voz: "Milena Morales"` mientras alguien linkeó a Rosario esperando algo. **Corrige un error mío del cierre 43:** el mapa decía que *"1 proyecto = 1 voz está garantizado por el código"* — media verdad: el código elige una, pero **el dato tiene dos** y nada lo impedía. Con C.2 se agrava (apagar Milena apaga esos proyectos aunque Rosario esté prendida). **Decisión de qué hacer: NO la tomé** — es dato, no código: o se limpia el link de más y el contrato se hace cumplir, o multi-voz entra al modelo (y cambian gate, criterios y archivado). Lo que **sí** hice: el motor **avisa por log** (`[Plan] ⚠️ … tiene 2 voces linkeadas`) en vez de tragárselo. Documentado en [mapa-campos §2.5](./mapa-campos.md), el contrato y el §Pendiente vivo. **Tests — cambia el feedback loop del repo:** nuevo [`Workflows/workflow-short-form-content/test-nodos.mjs`](../../Workflows/workflow-short-form-content/test-nodos.mjs), node pelado sin dependencias, que saca el `jsCode` del JSON y lo corre con un `$` de n8n mockeado. **23 casos verdes** sobre `Armar plan de corrida` y `Armar candidato`: gate por voz, proyecto sin voz, el multi-voz, Apify no pagado, N por proyecto + fallback + N=0 + el global de Ajustes, corte por proyecto, el orden dedup→corte con el video disputado, PISO, `_descarte`, `normLang`, ⚠️ SIN GUION. **Por qué vale la pena:** el motor corre en n8n, así que sin esto la lógica se verifica recién en producción una semana después, quemando Apify/Supadata/Haiku. `CLAUDE.md` §Feedback loops actualizado (el validador ya **no** es la única verificación). **Sin decidir, anotado:** el **descubrimiento no respeta `Voces.activo`** → una voz apagada no corre en el motor pero **sí recibe propuestas de referentes** cada semana. Fix de 1 línea, pero cambia conducta y puede ser deseable (tener referentes listos para cuando la prendas) → plan §Descubrimiento. **Validador 1221/0**, tests 23/23, secretos limpios. **Estado de C:** C.1/C.2/C.5 hechos en el repo, **sin re-importar** (hoy no cambian conducta: N vacía en los 6 proyectos, las 3 voces prendidas). **Próximo paso: C.3** — el webhook single-flight de ADR-023, que es el que falta para cerrar C y disparar el re-import. Ver §Para la próxima sesión abajo.

**2026-07-16 (cierre 45) — C.1 + C.5 en el motor (N por proyecto, probado) + la pasada única de `core/` desagrupada: 3 de 4 hechas (Mani + Claude).** Primer código del refactor. Split del plan §5 en vivo: Mani toma los fixes de UI de Airtable (la API no los hace), Claude el motor. **C.5:** podados `banda_descarte_min`/`max` del `Config` (21 → **19 knobs**), muertos desde la enmienda top-K del 07-13. **C.1 (ADR-024):** `Armar plan de corrida` lee `Proyectos.N` con fallback al global; `Armar candidato` **corta por proyecto**. `cap_top_n` intacto (ya muerde antes, en `Heat-score v1`). **La decisión de diseño del cierre — el ADR-024 no la fijaba:** el **orden** entre el corte y el dedup de ADR-018. Estaba corte→dedup; lo invertí a **dedup→corte**. Con el orden viejo, 2 proyectos que pescan el mismo video colisionan y **los dos** quedan cortos (el dedup solo resta después de cortar) ⇒ N sería un techo, no una entrega; con dedup primero cada video queda en un solo proyecto (gana el que lo juzgó más relevante) y cada proyecto rellena hasta **su** N exacto. **Revisable si Mani no coincide, es un cambio chico.** **Probado de verdad, no solo validador:** test fuera de n8n con el `$` de n8n mockeado (script en scratchpad) — 10 casos verdes: N por proyecto, fallback al global, el video disputado (una sola copia + el perdedor no queda corto), PISO round-robin dentro del proyecto, `_descarte` sin consumir cupo, N que no inventa candidatos, + regresiones de `normLang` y ⚠️ SIN GUION. Más el chequeo de grafo de siempre (0 refs colgadas, 0 conexiones rotas, sintaxis OK en los 33 code nodes) y que nadie lea los knobs podados. **`core/` — la pasada única se DESAGRUPÓ (decisión de Mani):** dejarla esperando obligaba al contrato a mentir (el motor ya lee `Proyectos.N`) y la 4ª parte depende de A.5, que no tiene fecha. Además el motivo del bundle casi no aplicaba: 1/2/4 tocan `Proyectos`/`Ajustes`/`Candidatos`, (3) toca `Métricas Global`+links+`Voces`. **Hechas 3 de 4:** (1) `Proyectos.N` en el script + contrato, `Candidatos por corrida` pasa de *N total* a **default por proyecto**; (2) los 2 toggles del descubrimiento en `ajustesSeed`; (4) **`Candidatos.fecha`** — resultó que la API **sí** crea computados (el script ya creaba `fecha_calificacion`, un `lastModifiedTime`), así que ahora **intenta crear `fecha`** y si falla lo tira a una lista `pendientes` que se imprime fuerte **y sale con exit 1**, en vez de un `console.log` entre otros seis. Queda solo (3), esperando A.5. **Base viva:** creado `Proyectos.N` por MCP (`fld9MCZ5y2pSWRxHc`, number precision 0, con descripción para el equipo), **vacío en todos los proyectos** = conducta de hoy. **Corrección de un error mío del cierre 43:** reporté las "lecturas fantasma" `tema`/`link_doc` como hallazgo 🔴 nuevo — **ya estaban documentadas** como vestigiales deliberadas ([dev-doc §8](./dev-doc.md): *`tema` `''` fail-safe*, *`link_doc` vestigial siempre `''`*) y en `core/schema/004`. Bajado a 🟡 y D.4 pasa a poda opcional/cosmética. **También corregido del 44:** `veredicto` read-only **no es** decisión de diseño — Airtable no deja configurar el permiso del campo con la página vacía (*Mani*); el fix es el de B.6 y la ventana abre tras la corrida del lunes. **🟠 Re-import del motor pendiente** (§Pendiente vivo): no urgente ni riesgoso (con `N` vacía el motor nuevo = el de hoy); conviene hacerlo cuando C esté completo, así carga solo lo de C. Validador **1221/0**, secretos limpios. **Próximo paso:** C.2 (`Voces.activo`) está bloqueado por **E.1** (el campo no existe) — se puede codear fail-open igual, o crear E.1 primero por MCP y hacer los dos juntos. Después C.3 (webhook single-flight, ADR-023, con builder Node) y C.4 (confirmar que el dedup hace limpia la coexistencia cron+on-demand). En el carril de Mani: los fixes de UI de B.6, con B.6(2) como precondición de A.5.

**2026-07-16 (cierre 44) — A.3 cerrado: las 12 páginas del cockpit mapeadas + 3 hallazgos 🔴 que hacen a B.6 urgente (Mani + Claude).** Sigue del cierre 43, mismo día. **NO es código — auditoría + docs.** El interface *Cockpit Redes* leído **por MCP** (`list_pages_for_base` + `get_form_schema`, no por captura): **12 páginas + 1 form standalone**. Entregable en **[mapa-campos.md §5](./mapa-campos.md)** — el doc pasó a cubrir los 2 ejes (campos §4 + páginas §5) y se retituló *Mapa del cockpit*; no se creó doc nuevo (docs lean). **La buena: no hay páginas huérfanas** — las 9 tablas tienen página, ninguna página quedó sin tabla. El problema no es sobra de páginas, es **qué campo muestra cada una**. **3 hallazgos 🔴:** (1) **`veredicto` es read-only en *Descartes*** — ya estaba en B.6 como fix de UI, pero **no es cosmético**: es el **único** campo de esa tabla que lee una máquina (el archivado cuenta los `era bueno` → `falsos_negativos`), así que ese contador es **siempre 0** y "0 falsos negativos" se lee como *el gate está perfecto*, la conclusión opuesta a la verdad. El loop de auditoría de ADR-021 está **muerto, no incompleto**. Y la página sí deja editar `titulo`/`thumbnail`/`proyecto`/`referente`: está al revés. (2) **La mitad humana del loop de ADR-022 nunca llega al humano**: la página *Proyectos* no muestra `advertencia_criterios` — un campo que existe **solo** para que una persona lo lea (el gate no lo lee, por contrato). El archivado gasta una llamada a Haiku cada domingo para escribir un aviso que nadie ve. Huérfano por superficie, no por schema. `criterios_aprendidos` tampoco está (menos grave: el gate sí lo lee). (3) **_Salud del Sistema_ no muestra salud**: el split del 2026-07-15 partió las tablas y **nadie curó las páginas** — la página muestra campos de *calidad* (`calificados`/`aprobados`/`precision`, que post-split son de `Métricas Proyectos`) + `diagnostico`, que es una de las 4 columnas muertas de `Métricas Global` ⇒ **le muestra al equipo una columna siempre vacía** (el huérfano de §2.1 confirmado desde el otro lado). El embudo entero (`colectados`/`pretrim`/`gate_pass`/`entregados`/`runs_ok`/`runs_fallo`/`duracion_min`/`sin_guion`/`falsos_negativos`) **no está en ninguna página**. **+1 hallazgo 🔴 nuevo: el form *Nuevo Proyecto* es una trampa** — standalone (`interfaceId: null`, fuera del interface, no documentado hasta hoy), `criterios_relevancia` **no obligatorio**, y expone el link inverso `Candidatos` en el alta. Un proyecto sin criterios no es inofensivo: el gate del motor es **fail-open** (sin criterios deja pasar TODO y ordena por métrica) mientras el descubrimiento es fail-closed y lo saltea → es la forma más fácil de romper la relevancia sin darse cuenta. → **B.1/B.3**. **🟠 transversal:** campos de la máquina editables por el equipo en 4 páginas (*Feed*: `titulo`/`thumbnail`/`referente` · *Referentes - Revisar*: las 3 tasas de salud · las 2 páginas de Métricas: **todo**, sobre tablas que el contrato declara solo-lectura). No rompe (el domingo se pisa), pero confunde. El modelo sano a copiar es *Configuración Global* (contexto read-only + solo `valor` editable) → B.3. **Aporte a A.5 ([§5.2](./mapa-campos.md)):** el mapa parte limpio en dos y **confirma el matiz de "partir la superficie"** — el eje operativo funciona en Airtable (sus problemas son de curaduría, ninguno justifica infra nueva; respalda ADR-023), el analítico es donde se rompe (las 3 páginas analíticas son las 3 con hallazgos estructurales, y todo eso ya vive en Supabase). **Pero ojo con el sesgo, y esto es lo importante del cierre:** ninguna de las 3 se curó después del split, así que decidir hoy sería comparar **Airtable-mal-configurado** contra un dashboard imaginario. **La prueba honesta es hacer B.6(2) (curar *Salud del Sistema*, horas de trabajo) ANTES de A.5.** Eso reordena el carril: B.6 deja de ser arrastre y pasa a ser precondición de la decisión. **Menores:** *Ajustes Dev-Only* tiene `valor` read-only (un dev no puede editar desde su propia página) · *Costos* sigue sin publicar y hay que **verificar que tenga filtro de semana** (los 9 `bigNumber` suman con `summaryFunction: sum`; sin filtro suman toda la historia, y `Métricas Global` no se barre nunca) · la vista "🔥 Seleccionados" del jefe es vista de tabla cruda, no página. **Lo que NO se tocó:** nada de la base viva, ni `workflow.json`, ni `core/`. Validador **1221/0**. **Próximo paso:** **A.5 está a un paso pero no arranca por A.5** — hacer primero B.6(2) (+ el resto de los fixes de UI, que ahora tienen diagnóstico preciso en [§5.1](./mapa-campos.md)), y recién ahí el ADR de herramienta con evidencia limpia. El carril del motor (C) sigue destrabado en paralelo.

**2026-07-16 (cierre 43) — A.2 cerrado: las 9 tablas barridas campo por campo + 3 hallazgos nuevos (Mani + Claude).** Continuación directa del cierre 42. **NO es código — es auditoría + docs.** Entregable completo en **[mapa-campos.md](./mapa-campos.md)**: §4 ahora tiene el mapa *escribe / lee / veredicto* de las 6 tablas que faltaban (`Proyectos`, `Voces`, `Candidatos`, `Referentes propuestos`, `Descartes del gate`, `Métricas Proyectos`). **Método (vale para A.3):** el grep sigue sin servir (§1 del mapa) — se leyeron los `jsCode` de los nodos que arman `fields:` (los escritores) y los `Armar plan`/`Computar`/`Destilar`/`Armar filas` (los lectores), más los `filterByFormula` de los `Leer *` (que es donde vive la mitad de la semántica: `Leer Proyectos` filtra `{activo}`, `Leer Candidatos calificados` filtra `NOT({estado}='nuevo')`). **3 hallazgos nuevos, ninguno rompe nada hoy:** (1) 🔴 **lecturas fantasma** — `Armar filas archivado` lee `f.tema` y `f.link_doc` para llenar `outputs.metadata`, y **esos campos no existen** en `Candidatos`: archiva `''` siempre desde vaya a saber cuándo (residuo pre-ADR-009). Enganchado como **D.4** (toca `workflow.json` → se arrastra con el re-import, igual que C.5). (2) 🟠 **`viral_por_tamano` es hermano de `notas_equipo`**: lo escribe el motor, no va a `outputs.metadata` ni al Sheet, muere con el record cada domingo ⇒ nunca vamos a poder preguntar "¿lo viral se aprueba más?". Sumado a **D.3** — la salida (b) (archivar a `metadata`) los cubre a los dos de una. (3) ⭐ **el multi-link cruza voces**: `Referentes.proyecto` es `multipleRecordLinks` y `Armar plan de corrida` **itera el array entero** → un referente puede alimentar proyectos de 2 voces distintas. El plan §2 daba esto como ✅ *"implícito (referente → 1 proyecto → 1 voz)"* — **era falso**: es una convención del equipo, no una garantía del schema. Contraste: `Proyectos.voz_default` también es multi-link pero los 3 workflows leen `[0]` → **1 proyecto = 1 voz sí** está garantizado por código. Importa para el norte Netflix ("voces = universos separados") → a decidir en **B.1/E**, fila de §2 del plan corregida. **1 hallazgo menor a la pasada única (ahora 4 cosas):** `Candidatos.fecha` (createdTime) es **load-bearing** — el barrido de `nuevo` viejos filtra por `IS_BEFORE({fecha}, -20 días)` — pero la API no crea campos computados, así que `setup-airtable.mjs` solo lo **pide por consola**: base nueva sin `fecha` ⇒ barrido roto **en silencio**. Misma clase que los toggles faltantes; muerde en F5. **Confirmaciones que valen (no re-derivar):** el archivado **no** filtra `Proyectos.activo` y está bien (no querés perder lo ya calificado de un proyecto apagado); `Métricas Global` no se barre nunca y `Métricas Proyectos` sí a 84 días (deliberado, guarda el trend); `Proyectos.descripcion` y `Voces.descripcion` no los lee ningún workflow (contexto humano, decorativo — documentado para que nadie espere que influyan, **no** son poda). **Lo que NO se tocó:** ni `workflow.json` ni `core/` — todo lo intrusivo quedó enganchado a su componente. **Próximo paso:** **A.3** (mapa página/vista × tabla × propósito del interface *Cockpit Redes*) — es lo último antes de **A.5**, la decisión §3 (Airtable vs dashboard) que gobierna la forma de B. En paralelo, el carril del motor (C) ya está destrabado: A.1+A.2 cerrados es justo la precondición del split de §5.

**2026-07-16 (cierre 42) — A.1 cerrado (grafo limpio, dev-doc corregido) + A.2 arrancado: 3 huérfanos reales y la reconciliación repo↔live (Mani + Claude).** Arranque del refactor por la auditoría. **A.1 ✅:** chequeo de grafo de los 3 `workflow.json` (script en scratchpad, patrón de cierres 34/36) → **0 conexiones rotas · 0 refs `$('…')` colgadas · 0 nodos inalcanzables · 0 huérfanos · 0 deshabilitados**. Conteos reales **motor 33 · descubrimiento 27 · archivado 37**. Motor y descubrimiento calzan nodo por nodo con dev-doc §2.2/§3.2, y el motor calza con la topología §2.1 (incl. `Abrir run` en serie). Verificado que el loop de ADR-022 **cierra de verdad**: motor lee `criterios_aprendidos` en `Armar plan`+`Gate`, archivado lo escribe vía `Destilar criterios`→`PATCH Proyectos criterios`. **El archivado era el hueco: dev-doc documentaba 30 y se contradecía consigo mismo** (§1 decía 24, §4 decía 30, §4.2 llegaba a 24). Los 7 nodos no documentados eran M2/ADR-022 + costos de cierre 37. **Corregido en una pasada:** encabezado (faltaba ADR-022 entero), §1 (24→37), §4 (30→37), diagrama §4.1 (**4** ramas laterales de `Cerrar run`, no 2, + `Leer runs descubrimiento`), tabla §4.2 (+7 nodos: 17b′, 19–24), §5 (8→9 tablas, `Métricas` partida, `Proyectos`/`Referentes` ahora con sus PATCH de ADR-022). **A.2 🔧 — entregable nuevo: [mapa-campos.md](./mapa-campos.md)** (por campo; el por-tabla se queda en dev-doc §5). **3 huérfanos confirmados:** `banda_descarte_min`/`max` en el Config del motor (muertos desde la enmienda top-K del 07-13 → **C.5** nuevo); las 4 columnas de calidad que `Métricas Global` arrastra del split (la tabla live es la vieja `Métricas` renombrada → **B.3**); `Candidatos.notas_equipo` (§abajo). Los links inversos auto-creados y la descripción pre-ADR-009 de `Voces` también → B.3. **Base viva confirmada por MCP** (`appkdNLlN1v6XdKHn`): **no existe `Voces.activo`** (confirma E.1) ni N en `Proyectos` (confirma C.1/ADR-024). **Fix de doc:** el contrato decía `cap_resultados_referente` 30, el JSON dice **50** → corregido (gana el JSON). **2 falsos positivos míos, valen como aprendizaje:** (1) reporté el barrido de `Métricas Global` como bug — **es deliberado y está en el contrato** (se guarda el trend); quedó documentado como "no lo arregles". (2) el grep mecánico de campos **no sirve**: es ciego a namespaces (`descripcion`/`bio`/`razon` son campo Airtable *y* key del `content_item`) y da falsos negativos por las claves sin comillas de los code nodes — método anotado en mapa-campos §1. **Decisiones de Mani:** `Días de recencia`=100 en vivo **no es drift** — es el equipo usando su knob, queda a libre elección (documentado para que nadie lo "corrija" a 7); `notas_equipo` → **D.3** a revisar. **Lo que NO se tocó:** ni `workflow.json` ni `core/` fuera del fix de un número en el contrato; todo lo intrusivo quedó enganchado a su componente (C.5, B.3, D.3) para arrastrarse con el re-import. El seed faltante de los toggles del descubrimiento se sumó a la **pasada única** de `setup-airtable.mjs` (ahora acumula 3 cosas). Validador **1221/0**, secretos limpios. **🚨 Lo más importante del cierre: Mani hizo el RE-IMPORT de los 3 workflows + ROTÓ las credenciales** (jueves 16/07, tras la charla de timing). Cae el bloqueante que arrastraba desde el cierre 37: M1, M2/ADR-022, costos $, contadores Apify y `normLang` **están vivos**. Razón del timing (vale para la próxima): se importó **antes** de C **justamente porque vienen cambios** — así el backlog queda vivo y probado sobre un repo verificado, y el re-import de C carga **solo lo de C** (un fallo apunta a un culpable). Se descartó el re-import parcial: la cadena nueva del archivado **depende de `runs.metricas` del motor** (`por_referente`, contadores Apify), así que importar solo el archivado dejaba la salud por referente y los costos vacíos. **Ver §Ciclo post-re-import: el archivado del 19/07 sale parcial POR DISEÑO** (aún no corrió el motor nuevo); el primer ciclo completo cierra el **26/07** — no leer el 19 como veredicto. **Próximo paso:** A.2 sigue en [mapa-campos.md §4](./mapa-campos.md) — falta barrer `Proyectos` (resto), `Voces`, `Candidatos` (resto), `Referentes propuestos`, `Descartes del gate`, `Métricas Proyectos`; lo verificado ya está listado ahí, no re-derivar.

**2026-07-15 (cierre 41) — Limpieza del repo antes del refactor + compactación de este handoff (Mani + Claude).** Pedido de Mani: dejar el repo lo más limpio posible para arrancar el refactor Voces→Proyectos con lo que de verdad importa. **NO es código — es higiene de docs.** **Survey completo:** la mayoría de lo que parecía borrable resultó load-bearing y se verificó uno por uno (substack = workflow probado en prod parkeado para F3; `clients/` + schemas = invariante multi-cliente que `validate.mjs` testea; transcript 06-12 = citado por README/ROADMAP/PLAN/ADR-009). **Decisiones de Mani:** quedan los dumps gitignored (`outputs-*`, `dist`, `.DS_Store`) y los snapshots `workflow-versions/`; `deploy.mjs` queda como semilla F5. **Borrados (2 docs que describían un flujo que ya no aplica):** `guia-reunion-redes.md` (prep de una reunión ya pasada) y `refactor-relevancia.md` (plan de un refactor ya ejecutado). **Dead links limpiados** en los 7 referrers: `CLAUDE.md` (mapa de docs), `airtable-cockpit.md` (core/, fix de link), `workflow.yaml` (×2), `refactor-voces-proyectos.md` (Component A ahora apunta solo a dev-doc), ADR-010/021/022 (los punteros al plan → "histórico en git"). Validador **1212/0**, secretos limpios. **Este handoff:** compactado de 1743 líneas — el log histórico (cierres 1–39) se destiló a una línea por cierre; las secciones de planes de producción M0–D3 y la auditoría 2026-06-16 (todas superadas, ✅ resueltas) se retiraron (viven en git: `git log docs/agents/handoff.md`); se consolidó el *Pendiente vivo* y se puso el tablero A–E del refactor como activo. **Próxima skill sugerida:** arrancar A.1/A.2 (`/improve-codebase` o directo) + el motor lane con `/tdd` sobre C.1.

**2026-07-15 (cierre 40) — Grilling del refactor Voces→Proyectos: se verifica el norte contra ROADMAP/ADRs y se cierran 2 ADRs (Mani + Claude).** Pedido de Mani: interrogarlo a fondo para verificar que el norte del refactor es lo que de verdad quiere y que el plan ([refactor-voces-proyectos.md](refactor-voces-proyectos.md)) está alineado con el contrato y los ADRs. **NO es código, es alineación + docs.** Se resolvieron 5 ramas, 2 eran desalineaciones reales, no cosméticas. **(1) El norte se contradecía:** el refactor decía "sin depender del cron" contra ROADMAP §1 "corre sola" → por la regla *gana el norte*, había que reconciliar. **Decisión: los 2 modos COEXISTEN** (cron semanal autónomo + on-demand se suma, no lo retira). ROADMAP §1 enmendado por escrito. **(2) El contrato de disparo del plan (`{project_id, N}`) quedó superado** por una simplificación de Mani durante el grill: **señal desnuda** (botón Airtable → "Run automation" → webhook de Producción n8n, sin payload) y **el motor lee Airtable** (toggles + N por proyecto). Una corrida = **todos los proyectos activos**, cada uno a su N; la selección se expresa con los toggles, no con un payload. Webhook **single-flight** (no arranca si ya hay corrida; el *cómo* queda para C.3). → **[ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)** (cerrado). **(3) N por proyecto revierte a conciencia ADR-016:** N vuelve a `Proyectos`, el global `Candidatos por corrida` pasa a **default por proyecto**, misma semántica en cron y on-demand, **corte final por proyecto**, `cap_top_n` intacto como techo duro total. Trade registrado: se cambió costo-predecible por control por proyecto (el cap es el cinturón). → **[ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)** (cerrado, enmienda ADR-016). **(4) Secuencia de la auditoría des-serializada:** A.1+A.2 juntos primero (de-riesgan el motor); después **split de A** — C/D/E son tool-agnósticas y el motor lane arranca en paralelo, mientras Dev 1 termina A.3–A.5 + la decisión §3 (que sólo gobierna la forma de B). **(5) Chequeo que dio consistente:** `Voces.activo` vs la enmienda ADR-010 (gate operativo, no filtro de relevancia — no chocan). **Knock-on:** cada decisión hizo el eje operativo caber mejor en Airtable → la pregunta §3 (Airtable vs dashboard) se **acota** a lo analítico read-only (Métricas/Costos); el operativo se queda en Airtable. **Archivos (todo docs, sin código ni base viva):** nuevos ADR-023/024; ROADMAP §1 (enmienda), [ADR README](../adr/README.md) (2 filas + ADR-016 marcada enmendada), [context.md](context.md) (glosario: término *Corrida*), refactor-voces-proyectos.md (reescritas §0, §2, B.2, C.1, C.3, C.4, intro §4, §5, §6, §7). Validador **1230/0**, secretos limpios. **🟠 PENDIENTE anotado (motor lane, autorizado por ADR-024 pero NO hecho):** `setup-airtable.mjs` + `airtable-cockpit.md` todavía describen N como global — se deja para hacerlo en una sola pasada con la racionalización de campos de la auditoría (A.2), para no tocar campos adyacentes dos veces. **Todo lo de cierres 38–39 sigue igual** (re-import de los 3 workflows, 5 fixes de UI Airtable, rotar credenciales, sembrar TT, aprobar propuestas; 12 archivos staged sin commitear). **Próxima skill sugerida:** `/grill-with-docs` no más — arrancar la auditoría (A.1/A.2) con `/improve-codebase` o directo, y el motor lane con `/tdd` sobre C.1 (N por proyecto).

### Histórico (una línea por cierre; el detalle vive en git: `git log docs/agents/handoff.md`)

- **cierre 39** (07-15) — Prep de reunión con redes + auditoría del scoring del descubrimiento (afinidad = juicio semántico Haiku; similitud solo genera/desempata; 3 debilidades TT flageadas). *(La guía de reunión que creó, `guia-reunion-redes.md`, se borró en cierre 41.)*
- **cierre 38** (07-15) — Auditoría completa + reconciliación repo↔live + fix de docs (pre-sesión Airtable); working tree = ADR-021 bis + enmienda ADR-010; gaps de UI flageados.
- **cierre 37** (07-14) — Métricas lista + costos en $ (Supadata/Haiku vivos, Apify implementado) + página *Costos* (borrador) + contadores Apify por actor en los 3 workflows.
- **cierre 36** (07-14) — Fase M2 (ADR-022) construida: loop de aprendizaje de criterios (motor lee `criterios_aprendidos`, archivado destila + salud por referente, 30→36 nodos) + página "A revisar".
- **cierre 35** (07-14) — Audit de 4 preguntas del equipo → higiene del archivado (barridos de descartes/Métricas) + `diagnostico` (semáforo sin IA) en Métricas.
- **cierre 34** (07-14) — Pipeline listo para el equipo: diagnóstico de integridad de los 3 workflows + onboarding actualizado + higiene del campo `idioma` (`normLang`).
- **cierre 33** (07-13) — Descubrimiento gana eje TikTok (ADR-020 §8, enmienda): rama paralela lookalike.
- **cierre 32** (07-13) — Diagnóstico del 1er ciclo real de M1 + Fase Volumen/Utilidad + fixes de M1.
- **cierre 31** (07-10) — 3 mejoras de robustez/costo del motor antes de la corrida de prueba.
- **cierre 30** (07-10) — ADR-021/022 firmados + Fase M1 (medición) construida: motor 30→33 nodos, archivado 18→24, cockpit 6→8 tablas + 3 páginas.
- **cierre 29** (07-10) — ADR-020 ejecutado: motor de descubrimiento de referentes construido (workflow nuevo, 24 nodos).
- **cierre 28** (07-10) — ADR-019 ejecutado: remoción TOTAL del eje keyword, motor solo-referentes (36→30 nodos).
- **cierre 27** (07-09) — Auditoría de calidad del run 07-09 + 3 decisiones ejecutadas (pre-trim por eje, marca ⚠️ SIN GUION, keywords OFF).
- **cierre 26** (07-09) — Run manual de Jero diagnosticado: duplicados = fan-out con proyectos gemelos.
- **cierre 25** (07-07) — 1er run automático real (con config del equipo) revisado + 2 fixes.
- **cierre 24** (06-26) — Entra a PRODUCCIÓN: archivado pasa a semanal + base limpiada de pruebas.
- **cierre 23** (06-25) — Audit final pre-producción + Ajustes verificados en vivo + dirección keyword.
- **cierre 22** (06-25) — ADR-017: motor listo para prod, keyword TikTok reactivado como toggle + 3 toggles.
- **cierre 21** (06-24) — Refactor post-producción firmado: referente-only + keyword dormido.
- **cierre 20** (06-24) — Dashboard del equipo (interfaz Airtable "Cockpit Redes") construido.
- **cierre 19** (06-23) — Archivado corrido end-to-end + auditoría del ciclo de vida de documentos.
- **cierre 18** (06-23) — Run de Fase 3 diagnosticado = éxito + bug fan-out×dedup arreglado.
- **cierre 17** (06-23) — V1 en vivo diagnosticado = éxito + Fase 2 y código de Fase 3.
- **cierre 16** (06-23) — Fase 0 (artefacto final): metadata template + `deploy.mjs`.
- **cierre 15** (06-23) — 4 mejoras pre-cron de código (paginación, dedup acotado).
- **cierre 14** (06-19) — F3 resuelto (bug de código) + fan-out multi-proyecto (ADR-013) + D3 cerrado.
- **cierre 13** (06-18) — Run post-F1 verificado: embudo coherente, F1/F4/F5 en verde.
- **cierre 12** (06-18) — F1 cerrado en código: Merge antes de cada Normalizador.
- **cierre 11** (06-18) — Revisión nodo-por-nodo del último run con `outputs/*.json`.
- **cierre 10** (06-18) — Revisión del embudo Apify con los 4 outputs reales + estado vivo.
- **cierre 9** (06-18) — Fix reels-only en IG + auditoría del estado vivo.
- **cierre 8** (06-17) — Primera corrida con config real + diagnóstico de timeout (Dev3).
- **cierre 7** (06-17) — Docs + verificación + cierre de manuales.
- **cierre 6** (06-17) — Las 6 decisiones lockeadas ejecutadas en código.
- **cierre 5** (06-17) — V-run de este repo validada + fix del no-transcript.
- **cierre 4** (06-16) — Objetivos del MVP afilados + grill-me de cumplimiento.
- **cierre 3** (06-16) — Bugfix de orden + refactor front-to-back (grilling).
- **cierre 2** (06-16) — Stage 4 del refactor de relevancia cerrado en `main`.
- **cierre 1** (06-16) — Refactor de relevancia Stages 1–3 en `main`: doble gate Haiku.
- **06-16** (noche) — V1 corrió y pobló Candidatos; abierto el refactor de relevancia.
- **06-16** (tarde) — Bloqueante #6 resuelto: Apify migrado a community node.
- **06-16** — Carril C completo (C2 + C3, Dev 3).
- **06-14** — Motor B3 construido + n8n listo para correr (`workflow.json`, ADR-009).
- **06-13** — Carril A en curso (Alejo): Supabase con `service_role`.

> **Planes de producción M0–D3 y auditoría técnica 2026-06-16:** ejecutados y superados por el estado
> actual; se retiraron de este handoff en cierre 41. Recuperables en git si hicieran falta.
