# Refactor Voces→Proyectos — plan por componentes

> **Qué es esto:** el plan de alto nivel del refactor del pipeline, **organizado por componentes
> estructurales** (dashboard, motor de búsqueda, archivado, capa de datos) para que **dos devs trabajen
> en paralelo**. Cada componente dice qué es, qué cambia, sus subsets, y su "hecho cuando". Es el
> **scope general** de en qué nos estamos metiendo; el detalle de implementación de cada subset se
> resuelve en su propia sesión leyendo este doc + el [handoff](./handoff.md).
>
> **Disparador:** reunión con el equipo de redes (Majo, Jero) del **2026-07-15** + comentarios de cierre
> de Mani. De ahí salió el modo de operación on-demand por proyecto, los toggles por Voz, y la pregunta
> abierta de **si Airtable alcanza o conviene un dashboard propio** (§3).
>
> **Regla de avance:** ningún subset se declara hecho sin cumplir el "hecho cuando" de su componente. Si
> algo obliga a tocar `core/` fuera de lo previsto acá, se para y se discute (puede terminar en ADR).

## 0. Contrato del producto (el PRD — leé esto primero)

> La base para **no improvisar**: qué estamos construyendo, para quién, cómo debe sentirse, y qué tiene
> que cumplir. Todo lo de abajo (componentes, ADRs) sirve a este contrato. Si un cambio no sirve a esto,
> no va.

**Objetivo (el porqué):** darle al equipo de redes una herramienta donde **eligen una Voz y un Proyecto
y disparan una corrida a demanda** que les entrega N videos curados y relevantes, listos para calificar,
**sin depender del cron ni de un dev**.

**Meta (medible, cómo sabemos que sirve):** el equipo corre un proyecto puntual, obtiene N candidatos
relevantes, califica, y el sistema aprende de esa elección — todo **sin ayuda de un dev**, con Métricas
(precisión de entrega) y Costos visibles en la misma superficie.

**Para quién:**

| Usuario | Rol | Qué hace con la herramienta |
|---|---|---|
| **Majo, Jero** (equipo de redes) | operadores, no-code | eligen Voz→Proyecto→N, disparan, califican, curan referentes |
| **Mani + teammate** (devs) | construyen y mantienen | motor, archivado, superficie, schema |
| **Andrés** (jefe) | sponsor | ve progreso, precisión y costos |

**Cómo debe sentirse y verse (look & feel):**

- **Simple como Netflix:** elegir perfil (Voz) → categoría (Proyecto) → correr. Mínima fricción, cero
  jerga técnica en la superficie del equipo.
- **Claridad sobre completitud:** el equipo ve solo lo que necesita para una corrida efectiva; los knobs
  avanzados quedan escondidos (patrón `Mostrar al equipo`).
- **Imposible de romper**, con **estado legible** de cada corrida (pendiente / corriendo / lista).

**Requerimientos funcionales (qué DEBE hacer):**

| # | El equipo puede… | Componente |
|---|---|---|
| FR1 | prender/apagar una **Voz** (y verla como espina dorsal de sus proyectos) | B, C, E |
| FR2 | dentro de una Voz, elegir un **Proyecto** | B |
| FR3 | prender/apagar **referentes** por proyecto | B (ya existe) |
| FR4 | fijar **N** (cuántos videos) para esa corrida | B, C |
| FR5 | **disparar** la corrida a demanda → el motor procesa ese proyecto con ese N | B, C |
| FR6 | ver el **estado** de la corrida | B |
| FR7 | ver los **candidatos** entregados y **calificar** (🔥/👍/👎 + estado) | B (ya existe) |
| FR8 | ver **Métricas** (precisión, embudo) y **Costos** | B |
| FR9 | editar **knobs globales** (mínimos, pesos) según permiso | B (ya existe) |
| FR10 | aprobar/descartar **Referentes propuestos** | B (ya existe) |

**Requerimientos no funcionales (cómo debe comportarse):**

| # | Requisito | Por qué |
|---|---|---|
| NFR1 | **No-code / baja fricción** para el equipo | lo usan no-devs (invariante ROADMAP §1) |
| NFR2 | **Fail-open**: un servicio externo caído no vacía la entrega | invariante #1 |
| NFR3 | **Costo acotado**: `cap_top_n` gobierna los créditos | no reventar el presupuesto |
| NFR4 | Dentro de **cuotas** (Airtable free 1.000 rec/calls) o presupuesto explícito si se migra | costo |
| NFR5 | **Supabase = fuente de verdad**; la superficie es proyección regenerable | trazabilidad |
| NFR6 | Cambios de config **sin re-deploy** (o el mínimo posible) | agilidad del equipo |
| NFR7 | **Trazabilidad**: cada corrida deja rastro en `runs`/`outputs` | auditoría |
| NFR8 | **Mantenible por 2 devs**; secretos fuera de git | sostenibilidad |

**Los contratos (las interfaces que no se improvisan):**

- **Contrato de disparo** (el sync duro entre los 2 carriles, §5): **señal desnuda** — un botón en
  Airtable dispara un webhook de n8n ("correr ahora", sin payload) y **el motor lee Airtable** (toggles
  + N por proyecto) para saber qué corre. Una corrida = todos los proyectos activos, cada uno a su N.
  Fijado en [ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md).
- **Contrato de datos** (schema, componente E): `Voces(activo)` · `Proyectos(voz, activo, criterios)` ·
  `Referentes(proyecto, activo)` · el mecanismo de disparo (`Corridas(proyecto, N, estado)` o equivalente).
  Fuente: [airtable-cockpit.md](../../core/contracts/airtable-cockpit.md).
- **Contrato de entrega** (no cambia): candidatos a Airtable (`estado=nuevo`) + registro a Supabase
  (`runs`/`outputs`/`processed_items`). Fuente: [ingesta-registro.md](../../core/contracts/ingesta-registro.md).

**Fuera de alcance (para no derivar):** generación de guiones en voz (ADR-009, en pausa) · cambiar cómo
se procesa un video (transcribir/traducir/gate) · el eje keyword (retirado, ADR-019).

## 1. El norte (el modelo mental)

**Analogía Netflix** (de Mani): la herramienta es como elegir perfil en Netflix. Elegís un **perfil =
Voz** (mamá, papá, tío); cada perfil tiene sus **categorías = Proyectos** (terror, comedia, romance).
Dos perfiles pueden tener categorías muy parecidas, pero **son independientes**. Las Voces son la
**espina dorsal**: universos separados, que se prenden/apagan como unidad y agrupan varios proyectos.

**El flujo del operador:** entra → elige Voz → elige Proyecto dentro de ella → fija cuántos videos
quiere para **esa** corrida → corre. Repite por proyecto (Liderazgo → 20, Comunicación-pareja → 20,
Storytelling → 10). Ya no espera al cron semanal.

Los cambios que salieron de la reunión (el detalle de cada uno vive en su componente):

1. `Mínimo de likes` / `Mínimo de vistas` → configuración global visible al equipo.
2. Ejecución / run manual on-demand (no solo cron).
3. Jerarquía Voz → Proyecto → Referente como navegación del operador.
4. Toggles prendido/apagado a nivel Voz; referentes independientes entre voces.
5. N por corrida, por proyecto (no un N global fijo).
6. Terminar Métricas y Costos.
7. Iterar; cuando esté sólido, reunión de validación con Jero.

## 2. Modelo actual vs. lo pedido (qué ya existe, qué es nuevo)

Buena parte del andamiaje ya está. Verificado contra
[airtable-cockpit.md](../../core/contracts/airtable-cockpit.md) y el `workflow.json` del motor:

| Pieza del pedido | Estado hoy | Qué falta |
|---|---|---|
| Voces como tabla, criterios, link a proyectos | ✅ tabla `Voces`; `Proyectos.voz_default` (1 voz/proyecto) | — |
| Referente por proyecto, toggleable | ✅ `Referentes.proyecto` + `Referentes.activo` | — |
| Referentes independientes entre voces | ✅ implícito (referente → 1 proyecto → 1 voz) | confirmar en la auditoría |
| Proyecto toggleable | ✅ `Proyectos.activo` | — |
| **Voz toggleable** | ❌ no hay `Voces.activo` | campo nuevo + el motor lo respeta |
| **N por proyecto** | ❌ N es **global** (`Candidatos por corrida`=100; ADR-016 lo sacó del proyecto a propósito) | ADR-024 (cerrado): N vuelve a `Proyectos`, global = default, corte por proyecto |
| **Disparo on-demand** | 🟡 el motor tiene *Execute manual*, pero corre **todos** los proyectos activos en una pasada | ADR-023 (cerrado): botón Airtable → webhook single-flight; sigue corriendo "los activos", ahora on-demand |
| `Mínimo likes/vistas` global | 🟡 ya existen en `Ajustes` (seed 0), **sin** `Mostrar al equipo` | marcarlos team-facing |
| Métricas + Costos | 🟡 tablas y página *Costos* (borrador) existen; falta re-import + publicar | cerrar (arrastre cierres 37-39) |

**Lectura:** el trabajo real no es construir la jerarquía (ya está), es cambiar **cómo se dispara y se
parametriza una corrida** y **dónde/cómo el equipo la maneja** (Airtable vs. dashboard propio, §3).

## 3. Decisión de herramienta: Airtable vs. dashboard propio ⭐

**La pregunta que abre Mani:** el pipeline se está volviendo complejo (9 tablas, muchos campos, páginas
que no mapean 1:1 a tablas, knobs, toggles, y ahora selección+disparo por proyecto). ¿Airtable aguanta,
o conviene un **dashboard propio** (Lovable / Vercel, deployado en la web, conectado por API a Supabase
+ Airtable donde vive la data)?

**Lo que está en juego** — Airtable es hoy un **invariante** (ROADMAP §1: "Airtable es el punto de
entrada único del equipo, no-code e imposible de romper"). Cambiarlo es una decisión de arquitectura,
va a **ADR**.

| | Airtable (hoy) | Dashboard propio (Lovable/Vercel) |
|---|---|---|
| Infra | cero, ya montado | nueva superficie: build, deploy, auth del equipo, mantenimiento |
| No-code / romper | el equipo ya lo usa; imposible de romper | requiere devs; otra cosa que puede caerse |
| Flujo operador (Netflix: perfil→categoría→N→correr) | se pelea con la herramienta (filtros por UI, disparo por webhook/cola, sprawl de campos) | control total del flujo, exactamente los campos que importan, disparo a n8n por API limpio |
| Métricas/Costos | páginas de interface limitadas | lee Supabase (ya es la fuente de verdad) → dashboards ricos, read-only, bajo riesgo |
| Costo de decidir mal | bajo (seguir estirando) | alto (infra nueva con equipo de 2) |

**Mi recomendación:** **no comprometerse al dashboard propio todavía, pero evaluarlo con datos.** La
**auditoría (componente A) es justo lo que resuelve esto**: mapea campo por campo si el flujo por
proyecto y la coherencia de campos *caben* en Airtable (con una tabla `Corridas` + páginas curadas). Si
caben → estirar Airtable (barato, respeta el invariante). Si estás peleándote con la herramienta → el
dashboard propio se justifica. **No forkeás infra antes de la auditoría.**

Matiz útil: se puede **partir la superficie**. Lo *operativo* (el equipo edita configs y dispara
corridas) puede quedarse en Airtable; lo *analítico* (Métricas/Costos, read-only sobre Supabase) es el
candidato natural y de menor riesgo para un dashboard web propio si las páginas de interface se quedan
cortas. No es todo-o-nada.

→ **Decisión gated:** se toma al cerrar el componente A (auditoría), con un ADR. Default = estirar
Airtable salvo que la auditoría pruebe lo contrario.

## 4. Los componentes

> Orden (ver §5): **A.1 + A.2 primero, juntos** (de-riesgan el motor). Después **split de A** — el motor
> (C/D/E, tool-agnóstico) arranca en paralelo mientras Dev 1 termina A.3–A.5 + la decisión §3, que sólo
> gobierna la forma de B. El contrato de disparo ya está cerrado (ADR-023), así que no hay que esperarlo.
> Lo intrusivo en `workflow.json` (builder Node, validar por re-import + Execute) está en C y D.

### A. Auditoría del pipeline vivo *(cross-cutting, precondición)*

**Qué es:** el mapa verificado y sin puntos ciegos de los 3 workflows y del cockpit — cada nodo, cómo
se alimenta cada tabla/vista, para qué sirve cada campo, y que **no haya componentes sin propósito o con
uso no visto**. Es lo que Mani pidió explícito, y lo que destraba §3. Punto de partida (no arrancar de
cero): [dev-doc.md](dev-doc.md) → **verificar contra el JSON vivo, extender, flagear huérfanos**.

- [ ] **A.1** Verificar los 3 `workflow.json` contra dev-doc/guía: cada nodo existe, hace lo dicho, y
      está cableado (0 refs rotas, 0 huérfanos — reusar el chequeo de grafo de cierres 34/36).
- [ ] **A.2** Mapa **campo × tabla × quién-escribe/lee**: para cada campo de las 9 tablas, quién lo
      llena (motor/archivado/descubrimiento/equipo) y quién lo lee. **Responde las 4 preguntas de Mani:
      ¿cada campo cómo se maneja? ¿cómo influye en el workflow? ¿es necesario? ¿está estandarizado?**
      Marcar campos sin lector o sin escritor (candidatos a huérfano). Confirmar la base viva por MCP.
- [ ] **A.3** Mapa **página/vista × tabla × propósito**: cada página del interface *Cockpit Redes*, qué
      tabla lee, qué filtro, edit/solo-lectura, para qué la usa el equipo. Flagear páginas sin uso claro.
- [ ] **A.4** Reconciliar **repo ↔ live**: qué está en el repo pero **no re-importado en n8n** (M2,
      costos, contadores Apify) → lista de "vacío hasta re-import".
- [ ] **A.5** Con A.2/A.3 en mano, **cerrar la decisión de §3** (Airtable vs. dashboard propio) en un
      ADR. Es el gate de todo lo demás.

**Hecho cuando:** existe un mapa donde cada nodo, campo y página tiene propósito y dueño; los huérfanos
están listados con veredicto (podar/documentar, nunca borrar en silencio); repo↔live reconciliado; y la
decisión de herramienta está tomada en un ADR.

### B. Dashboard / Cockpit *(la superficie del equipo)*

**Qué es:** dónde el equipo de redes maneja el pipeline y dispara corridas. Hoy = Airtable. El alcance
de este componente **depende de la decisión de §3/A.5**: estirar Airtable, o construir dashboard propio.
En cualquiera de los dos casos, tiene que resolver el **flujo del operador** (Netflix: Voz→Proyecto→N→
correr) y la **racionalización de campos** que salga de la auditoría.

- [ ] **B.1** Definir el **flujo de una corrida efectiva** de punta a punta: cómo el equipo elige Voz,
      ve sus proyectos, prende/apaga referentes, fija N, dispara, y ve el resultado. Este flujo es el
      contrato que B.2 y el componente C (motor) implementan.
- [ ] **B.2** **Mecanismo de disparo** ([ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md), cerrado):
      **botón nativo de Airtable → "Run automation" → webhook de Producción de n8n**. Señal desnuda
      ("correr ahora", sin payload); el motor lee Airtable. Una corrida = todos los proyectos activos, cada
      uno a su N. Webhook **single-flight** (no arranca si ya hay una corrida). La N por proyecto y los
      toggles son la selección. (Descartado: tabla `Corridas` + cron-poll — quema cuota y deja estado colgado.)
- [ ] **B.3** **Racionalización de campos** (sale de A.2): quitar/estandarizar los campos que la
      auditoría marque innecesarios o inconsistentes; dejar la superficie coherente para el equipo.
- [ ] **B.4** `Mínimo likes/vistas` **team-facing**: marcar `Mostrar al equipo ✓` en esas 2 filas de
      `Ajustes` (probablemente el cambio completo — confirmar en la auditoría).
- [ ] **B.5** Toggle de **Voz** visible/editable para el equipo (pareja del campo de datos en E).
- [ ] **B.6** Cerrar **Métricas + Costos** (arrastre cierres 37-39): publicar *Costos*, curar *Métricas
      de Calidad* / *Salud del Sistema*, `veredicto` editable en *Descartes*, precision como %. **Candidato
      #1 a dashboard propio read-only** si se va por esa vía (lee Supabase directo).

**Hecho cuando:** el equipo puede, desde la superficie elegida, elegir una Voz y un Proyecto, fijar N,
disparar una corrida, y ver Métricas/Costos reales — con una superficie de campos coherente y sin ruido.

### C. Motor de búsqueda *(el `workflow.json` del motor)*

**Qué es:** el rework del motor para pasar de **barrer todos los proyectos activos** a **procesar el
proyecto seleccionado con su N**. Es el cambio intrusivo grande. El resto del pipeline del motor
(transcribir → traducir → gate → entregar → registrar) **no se toca**.

- [ ] **C.1** **N por proyecto** ([ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)): N vuelve a
      ser campo de `Proyectos`; el global `Candidatos por corrida` pasa a **default por proyecto**. Misma
      semántica en cron y on-demand. El **corte final pasa a ser por proyecto** (cada uno a su N por heat
      compuesto, después del gate). `cap_top_n` sigue siendo el gobernador duro (no se toca — protege el backfill).
- [ ] **C.2** **Respetar `Voces.activo`**: un proyecto cuya voz está apagada no corre (aunque el proyecto
      esté `activo`). Toca `Leer Proyectos` / `Armar plan`.
- [ ] **C.3** **Webhook trigger** (según [ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)): nuevo
      trigger de Producción con guard **single-flight**, en paralelo al cron. El motor **sigue leyendo "los
      activos"** (no gana un modo "solo este proyecto"); lo único nuevo es respetar `Voces.activo` (C.2) y la
      N por proyecto (C.1). Construir con builder Node, no a mano.
- [ ] **C.4** ~~Decidir el futuro del cron~~ **Resuelto: el cron semanal coexiste** (barrido autónomo de
      respaldo + mantiene el ritmo semanal de Métricas/salud por referente). El on-demand se suma (ROADMAP §1
      enmendado, ADR-023). Falta: confirmar que dedup (`processed_items`) hace la coexistencia limpia.

**Hecho cuando:** una corrida disparada a mano para un solo proyecto con N=20 deja ~20 candidatos de
**ese** proyecto en Airtable + rastro en Supabase, sin tocar los demás. Validado por re-import + Execute.

### D. Archivado *(el `workflow.json` del archivado)*

**Qué es:** verificar y ajustar el archivado para que no asuma "una corrida = todos los proyectos".
Corre semanal (domingo) y computa Métricas; hay que confirmar que el cambio a corridas por-proyecto no
rompe el cómputo semanal ni la salud por referente.

- [ ] **D.1** Auditar (parte de A) cómo el archivado agrega Métricas/costos y si asume el barrido total.
- [ ] **D.2** Ajustar si corridas por-proyecto cambian la forma de los `runs` que lee. Probablemente
      poco (el archivado agrega por semana, no por corrida), pero **confirmar, no asumir**.

**Hecho cuando:** tras un ciclo con corridas por-proyecto, `Métricas`/`Costos` y la salud por referente
se computan igual de bien que con el barrido semanal.

### E. Capa de datos *(schema Airtable + Supabase)*

**Qué es:** los campos/tablas nuevos que habilitan lo de arriba. `core/`, autorizado por el ADR de A.5.

- [ ] **E.1** `Voces.activo` (checkbox) — contrato + `setup-airtable.mjs`; crear en base viva por MCP.
- [ ] **E.2** Tabla/campos de disparo según B.2 (ej. `Corridas`, o campos de N+trigger en `Proyectos`).
- [ ] **E.3** Aplicar la racionalización de campos de B.3 en el contrato + schema.

**Hecho cuando:** el schema soporta Voz toggleable, N por corrida y el mecanismo de disparo, y el
contrato ([airtable-cockpit.md](../../core/contracts/airtable-cockpit.md)) refleja el estado real.

### (Descubrimiento de referentes — casi sin tocar)

El workflow de descubrimiento (ADR-020) no cambia por este refactor: propone referentes por proyecto,
que ya viven bajo una voz. Solo se **audita** (parte de A) para confirmar que no queda huérfano y que
respeta la jerarquía. Si `Voces.activo` debiera influir en qué proyectos reciben propuestas, se decide
en A.

## 5. Cómo se reparte entre 2 devs

**Primero, juntos y corto: A.1 (verificar workflows) + A.2 (mapa campo×tabla).** Son las tajadas de la
auditoría que **de-riesgan el motor**; no hace falta terminar toda A antes de construir. El contrato de
disparo ya está cerrado ([ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)), así que los dos
carriles pueden arrancar en cuanto A.1/A.2 estén.

**Split de A — el motor arranca temprano:** la decisión de herramienta §3 (A.5) sólo gobierna la **forma
de B** (la superficie); C/D/E son **tool-agnósticas** (el motor lee Airtable en cualquier caso). Así que
Dev 1 termina la auditoría + §3 mientras Dev 2 ya construye el carril del motor.

| Carril | Componentes | Foco |
|---|---|---|
| **Dev 1 — Superficie + auditoría** | A.3–A.5 + B (dashboard) + E (schema) | mapa de páginas, decisión §3, flujo del operador, campos, botón de disparo, Métricas/Costos |
| **Dev 2 — Motor** | C (motor) + D (archivado) | N por proyecto, `Voces.activo`, corte por proyecto, webhook single-flight, que el archivado no se rompa |

**Sync duro:** el **contrato de disparo** — ya fijado en ADR-023: señal desnuda (webhook "correr ahora")
+ el motor lee Airtable (toggles + N por proyecto). No hay payload que acordar; el punto de sync es que
ambos carriles respeten ese contrato.

## 6. ADRs que nacen de esto

- ✅ **[ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)** — mecanismo de disparo on-demand
  (botón Airtable → automation → webhook, señal desnuda, coexiste con cron). **Cerrado.**
- ✅ **[ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)** — N vuelve por proyecto, global =
  default, corte final por proyecto; `cap_top_n` intacto. **Cerrado.**
- ⬜ **Herramienta del cockpit** (A.5) — Airtable vs. dashboard propio. **Acotado por ADR-023:** el eje
  operativo se queda en Airtable; la pregunta queda sólo para lo analítico read-only (Métricas/Costos).
  Se cierra al terminar la auditoría, con ADR.
- El ADR de A.5 autoriza los cambios de `core/` de E que no cubran ya ADR-023/024.

## 7. Lo que NO cambia (invariantes a respetar)

- **Gates fail-open** (invariante #1): un fallo de Haiku/Supadata deja pasar, no vacía la entrega.
- **`cap_top_n` sigue siendo el gobernador de créditos duro** — el N por corrida nunca lo supera.
- **El pipeline de procesamiento** (transcribir → traducir → gate → entregar → registrar → archivar)
  **no se toca**: este refactor es sobre *qué corre, cómo se dispara y dónde se maneja*, no sobre *cómo
  se procesa un video*.
- **`core/` solo cambia con ADR.**
- ⚠️ **El invariante "Airtable es la puerta única" (ROADMAP §1)** — **acotado por ADR-023:** el eje
  **operativo** (disparo, toggles, N) se queda en Airtable; sólo lo **analítico** read-only
  (Métricas/Costos sobre Supabase) sigue bajo revisión en §3/A.5 como candidato a dashboard propio.
  Es el único invariante que este refactor puede mover, y solo vía ADR.
- **Norte enmendado (ADR-023):** "corre sola" pasa a "corre sola **y** a demanda" — el cron coexiste.
