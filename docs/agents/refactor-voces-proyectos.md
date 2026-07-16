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
| Referentes independientes entre voces | ⚠️ **convención, no garantía** — `Referentes.proyecto` es multi-link y el motor itera el array entero: un referente puede alimentar proyectos de 2 voces ([mapa-campos §2.5](./mapa-campos.md)) | decidir en B.1/E: documentar como permitido, o restringir |
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
- [x] **A.2** ✅ Mapa **campo × tabla × quién-escribe/lee** de las 9 tablas → entregable completo en
      **[mapa-campos.md](./mapa-campos.md)** (§4 el mapa, §2 los hallazgos). Responde las 4 preguntas de
      Mani. Base viva confirmada por MCP. **Huérfanos con veredicto, todos enganchados a su componente:**
      `banda_descarte_min`/`max` → C.5 · `tema`/`link_doc` vestigiales (ya documentados) → D.4 · `notas_equipo` y
      `viral_por_tamano` → D.3 · las 4 columnas de calidad de `Métricas Global`, los links inversos y la
      descripción pre-ADR-009 de `Voces` → B.3 · `Candidatos.fecha` manual → pasada única (§3 del mapa).
      **Lo que abre:** el multi-link de `Referentes.proyecto` cruza voces ([§2.5](./mapa-campos.md)) → B.1/E.
- [x] **A.3** ✅ Mapa **página/vista × tabla × propósito** → **[mapa-campos.md §5](./mapa-campos.md)**
      (12 páginas + 1 form standalone, leídas por MCP). **No hay páginas huérfanas** — las 9 tablas
      tienen página y ninguna página quedó sin tabla; el problema es **qué campo muestra cada una**.
      **3 hallazgos 🔴 → B.6/B.3:** `veredicto` read-only mata el loop de ADR-021 (`falsos_negativos`
      siempre 0) · la página *Proyectos* no muestra `advertencia_criterios` (el archivado escribe cada
      domingo un aviso que nadie ve) · *Salud del Sistema* no muestra salud (el split partió tablas y
      nadie curó la página) · el form *Nuevo Proyecto* permite proyectos sin criterios ⇒ gate fail-open
      = ruido sin filtrar. **Aporte a A.5 en [§5.2](./mapa-campos.md)**: el eje operativo aguanta; el
      analítico es donde se rompe — pero curar *Salud* primero, o la comparación es tramposa.
- [x] **A.4** Reconciliar **repo ↔ live**: ✅ **el gap de workflows se cerró solo — Mani re-importó los 3
      `workflow.json` el 2026-07-16** (M2, costos, contadores Apify y `normLang` ya viven en n8n), así que
      la lista de "vacío hasta re-import" quedó sin objeto. Lo que **sí** queda de A.4 es la reconciliación
      de **config**, ya hecha y documentada en [mapa-campos.md §2.3](./mapa-campos.md) (`Ajustes` live vs.
      seed: `Días de recencia`=100 y `Bonus idioma`=0.45 son el equipo usando sus knobs, no drift; los 2
      toggles del descubrimiento faltan en `ajustesSeed` → pasada única de `setup-airtable.mjs`).
      ⚠️ **Verificación real pendiente:** el primer ciclo completo cierra el **26/07** (ver §Ciclo del
      [handoff](./handoff.md)) — hasta ahí no hay prueba viva de que el re-import quedó bien.
- [ ] **A.5** Con A.2/A.3 en mano, **cerrar la decisión de §3** (Airtable vs. dashboard propio) en un
      ADR. Es el gate de todo lo demás. **Insumo listo en [mapa-campos §5.2](./mapa-campos.md):** el eje
      operativo aguanta en Airtable (sus problemas son de curaduría), el analítico es donde se rompe.
      ⚠️ **Precondición para no decidir con sesgo:** hacer B.6(2) (curar *Salud del Sistema*) **antes** —
      las 3 páginas analíticas nunca se curaron después del split del 2026-07-15, así que hoy la
      comparación sería contra un Airtable mal configurado.

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
      **3 decisiones que le abrió la auditoría** ([mapa-campos §2.5 y §5.1](./mapa-campos.md)): el alta
      de proyecto (el form *Nuevo Proyecto* vive fuera del interface y permite proyectos **sin
      criterios** ⇒ gate fail-open = ruido: hacerlo obligatorio, sacarle el link inverso `Candidatos`, y
      decidir si entra al interface o se borra) · si un referente puede **cruzar voces** (hoy el schema
      lo permite y el motor lo ejecuta; la independencia es convención, no garantía) · si la vista
      "🔥 Seleccionados" sube de vista cruda a página del cockpit.
- [ ] **B.2** **Mecanismo de disparo** ([ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md), cerrado):
      **botón nativo de Airtable → "Run automation" → webhook de Producción de n8n**. Señal desnuda
      ("correr ahora", sin payload); el motor lee Airtable. Una corrida = todos los proyectos activos, cada
      uno a su N. Webhook **single-flight** (no arranca si ya hay una corrida). La N por proyecto y los
      toggles son la selección. (Descartado: tabla `Corridas` + cron-poll — quema cuota y deja estado colgado.)
- [ ] **B.3** **Racionalización de campos** (sale de A.2): quitar/estandarizar los campos que la
      auditoría marque innecesarios o inconsistentes; dejar la superficie coherente para el equipo.
      **Ya en la lista** ([mapa-campos.md §2.1](./mapa-campos.md)): las 4 columnas de calidad que
      `Métricas Global` arrastra del split (`score_aprobados`/`score_descartados`/`separacion_gate`/
      `diagnostico`, muertas en filas GLOBAL) · los links inversos auto-creados que el equipo ve
      (`Proyectos.Referentes`/`.Candidatos`/…, `Voces.Proyectos`/`.Candidatos`) · la descripción de la
      tabla `Voces` en vivo, todavía pre-ADR-009 ("Eje de generación (cómo suena)").
      **Suma A.3** ([mapa-campos §5.1](./mapa-campos.md)): pasar a **read-only** lo que escribe la
      máquina y hoy el equipo puede pisar (*Feed*: `titulo`/`thumbnail`/`referente` · *Referentes -
      Revisar*: `tasa_gate`/`tasa_aprobacion`/`videos_evaluados` · las 2 páginas de Métricas: **todo**,
      sobre tablas que el contrato declara solo-lectura). El modelo a copiar es *Configuración Global*.
- [ ] **B.4** `Mínimo likes/vistas` **team-facing**: marcar `Mostrar al equipo ✓` en esas 2 filas de
      `Ajustes` (probablemente el cambio completo — confirmar en la auditoría).
- [ ] **B.5** Toggle de **Voz** visible/editable para el equipo (pareja del campo de datos en E).
- [ ] **B.6** Cerrar **Métricas + Costos** (arrastre cierres 37-39), ahora con el diagnóstico preciso de
      [mapa-campos §5.1](./mapa-campos.md): **(1)** `veredicto` **editable** en *Descartes* — **no es
      cosmético**: es el único campo que lee una máquina ahí, y read-only deja `falsos_negativos` en 0
      para siempre (se lee como "el gate está perfecto"). **(2)** curar *Salud del Sistema*: hoy muestra
      campos de calidad y una columna muerta (`diagnostico` en filas GLOBAL) y **no muestra el embudo**
      (`colectados`/`pretrim`/`gate_pass`/`entregados`/`runs_ok`/`runs_fallo`/`duracion_min`/`sin_guion`/
      `falsos_negativos` no están en ninguna página). **(3)** *Calidad por Proyecto*: sumar
      `separacion_gate`, `precision` como %. **(4)** publicar *Costos* + verificar que el filtro de
      semana exista (sin él suma toda la historia). **(5)** sumar `advertencia_criterios` +
      `criterios_aprendidos` a la página *Proyectos*. **Hacer (2) antes de A.5** — es la prueba honesta
      de si Airtable se queda corto ([§5.2](./mapa-campos.md)).

**Hecho cuando:** el equipo puede, desde la superficie elegida, elegir una Voz y un Proyecto, fijar N,
disparar una corrida, y ver Métricas/Costos reales — con una superficie de campos coherente y sin ruido.

### C. Motor de búsqueda *(el `workflow.json` del motor)*

**Qué es:** el rework del motor para pasar de **barrer todos los proyectos activos** a **procesar el
proyecto seleccionado con su N**. Es el cambio intrusivo grande. El resto del pipeline del motor
(transcribir → traducir → gate → entregar → registrar) **no se toca**.

- [x] **C.1** ✅ **N por proyecto** ([ADR-024](../adr/ADR-024-enmienda-adr016-n-por-proyecto.md)) — hecho en
      el `workflow.json` del motor (2026-07-16): `Armar plan de corrida` lee `Proyectos.N` con fallback al
      global; `Armar candidato` corta **por proyecto**. `cap_top_n` intacto (ya muerde antes, en `Heat-score v1`).
      **Decisión que el ADR no fijaba, resuelta acá:** el **orden** entre corte y dedup (ADR-018). Ahora
      **dedup primero, corte después** — al revés, 2 proyectos que pescan el mismo video colisionan y los
      **dos** quedan cortos (N sería un techo, no una entrega). Con este orden N se cumple exacto.
      **Probado** fuera de n8n con `$` mockeado (10 casos: N por proyecto, fallback al global, el video
      disputado, PISO, `_descarte`, + regresiones de `normLang` y ⚠️ SIN GUION).
      ⚠️ **Falta para que sirva de verdad:** (a) crear el campo `N` en `Proyectos` (base viva + la pasada
      única de `core/`, §3 de [mapa-campos](./mapa-campos.md)) y (b) **re-importar**. El motor **tolera que
      `N` no exista** (cae al global = conducta de hoy), así que el re-import no depende de (a).
- [x] **C.2** ✅ **Respetar `Voces.activo`** (2026-07-16): `Leer Voces` del motor filtra **server-side**
      (`filterByFormula={activo}`, mismo patrón que `Leer Proyectos`) y `Armar plan` saltea los proyectos
      cuya voz no llegó, logueando cuál. Proyecto **sin** voz: no gateado. **Server-side y no en el code
      node porque Airtable omite los checkbox destildados** del payload → ahí "destildado" y "el campo no
      existe" son indistinguibles. El gate corta **antes del scrape** (un proyecto salteado no se paga en
      Apify — probado). Probado con [test-nodos.mjs](../../Workflows/workflow-short-form-content/test-nodos.mjs).
      **Abre una decisión:** el **descubrimiento** no respeta `Voces.activo` → hoy propondría referentes
      para proyectos de una voz apagada. Barato pero incoherente. Ver §Descubrimiento.
- [x] **C.5** ✅ **Podados los 2 knobs muertos del `Config` del motor** (2026-07-16): `banda_descarte_min`
      (0.35) y `banda_descarte_max` (0.6), muertos desde la enmienda del 2026-07-13 (banda fija → top-K
      `cap_descartes`). Config: 21 → **19 knobs**. Verificado que ningún nodo los lee. Cero cambio de
      conducta. Se arrastra con el re-import de C.
- [x] **C.3** ✅ **Webhook trigger** ([ADR-023](../adr/ADR-023-disparo-on-demand-boton-airtable.md)) —
      hecho en el `workflow.json` (2026-07-16, builder Node): nodo `Disparo on-demand (webhook)` (POST,
      path `<<WEBHOOK_PATH_MOTOR>>`, responde 200 inmediato) en paralelo al cron/manual. **El "cómo" del
      guard quedó en la enmienda C.3 del ADR** (decidido con Mani): guard **para los 3 triggers** (si no,
      el cron del lunes pisa una on-demand viva = doble Apify); vivo vs. zombie por `ventana_corrida_min`
      (Config, 120); el barredor zombie se movió **antes** del guard (un zombie nunca traba el motor) y
      gana umbral de edad; check-then-act con ventana residual de ~1-2 s aceptada; fail-open con Supabase
      caído; click bloqueado no abre run (no ensucia `runs_fallo`). Bonus: `Abrir run` registra el
      `trigger_type` real (`on_demand`/`manual`/`cron` — antes todo era `'cron'`). Motor 33 → **37 nodos**.
      Grafo 0 problemas, `test-nodos.mjs` verde, validador OK. **Sin re-importar** (va con el re-import
      de C). El motor **sigue leyendo "los activos"** (no ganó un modo "solo este proyecto").
- [x] **C.4** ~~Decidir el futuro del cron~~ **Resuelto: el cron semanal coexiste** (barrido autónomo de
      respaldo + mantiene el ritmo semanal de Métricas/salud por referente). El on-demand se suma (ROADMAP §1
      enmendado, ADR-023). ✅ **Dedup confirmado a nivel repo (2026-07-16):** la coexistencia secuencial es
      limpia por diseño — `unique(platform, external_id)` en `processed_items` (002) + `Prefer:
      ignore-duplicates` + `Leer procesados`/`Heat-score v1` descartan lo visto sin importar el trigger
      (quien corre primero se lleva el video). El archivado tampoco filtra por `trigger_type` ⇒ las
      corridas on-demand entran solas a Métricas (adelanto de D.2). **2 matices documentados:** un
      segundo click re-paga scrape+pre-trim aunque entregue poco (contrato §Disparo) · dentro de la
      ventana residual de ~1-2 s del guard la salida puede duplicarse esa vez (enmienda ADR-023).
      ⚠️ La confirmación **en vivo** llega con la V-run post re-import (corrida botón + cron de la
      misma semana sin candidatos repetidos).

**Hecho cuando:** una corrida disparada a mano para un solo proyecto con N=20 deja ~20 candidatos de
**ese** proyecto en Airtable + rastro en Supabase, sin tocar los demás. Validado por re-import + Execute.

### D. Archivado *(el `workflow.json` del archivado)*

**Qué es:** verificar y ajustar el archivado para que no asuma "una corrida = todos los proyectos".
Corre semanal (domingo) y computa Métricas; hay que confirmar que el cambio a corridas por-proyecto no
rompe el cómputo semanal ni la salud por referente.

- [ ] **D.1** Auditar (parte de A) cómo el archivado agrega Métricas/costos y si asume el barrido total.
- [ ] **D.2** Ajustar si corridas por-proyecto cambian la forma de los `runs` que lee. Probablemente
      poco (el archivado agrega por semana, no por corrida), pero **confirmar, no asumir**.
- [ ] ⭐ **D.3 (a revisar — lo abre A.2):** **`notas_equipo` no entra al loop de aprendizaje y se destruye.**
      El equipo escribe su razonamiento en `Candidatos.notas_equipo`; **ningún workflow lo lee** (no va a
      `outputs.metadata` ni al Sheet) y el archivado borra el record cada domingo. Y `Destilar criterios`
      (ADR-022 — el nodo que existe para *aprender de las decisiones del equipo*) solo le manda
      `titulo`+`script` a Haiku. **Puede ser la señal más valiosa que produce el equipo** (el *por qué*
      de un 👎, que ni el script ni el score capturan) y hoy se tira a la basura. Revisar las 3 salidas
      de [mapa-campos.md §2.2](./mapa-campos.md): (a) sumarlo al `_snip` de `Destilar criterios`;
      (b) archivarlo a `outputs.metadata` para dejar de perderlo aunque no se use aún; (c) declararlo
      scratch-pad efímero. **(a) cambia qué consume el loop → va con enmienda de ADR-022.** (b) es barato
      y reversible, y de paso construye el corpus para decidir (a) con datos.
      **Se le suma `viral_por_tamano`** ([mapa-campos §2.1](./mapa-campos.md)): mismo patrón (lo escribe
      el motor, no va a `outputs.metadata` ni al Sheet, muere con el record) → nunca se va a poder medir
      si lo viral se aprueba más. La salida (b) los cubre a los dos de una.
- [ ] **D.4** *(opcional, cosmético)* **Podar 2 lecturas vestigiales del archivado**
      ([mapa-campos §2.1](./mapa-campos.md)): `Armar filas archivado` lee `f.tema` y `f.link_doc`, que no
      existen en `Candidatos` → archiva `''` siempre. **Ya está documentado como deliberado** (dev-doc §8:
      `tema` fail-safe, `link_doc` vestigial), así que esto es sacar ruido, no arreglar un bug. Cero
      cambio de conducta. Solo vale la pena **si D.3 va por (b)** y ya se va a tocar ese nodo.

**Hecho cuando:** tras un ciclo con corridas por-proyecto, `Métricas`/`Costos` y la salud por referente
se computan igual de bien que con el barrido semanal.

### E. Capa de datos *(schema Airtable + Supabase)*

**Qué es:** los campos/tablas nuevos que habilitan lo de arriba. `core/`, autorizado por el ADR de A.5.

- [x] **E.1** ✅ `Voces.activo` (checkbox) — contrato + `setup-airtable.mjs` + **creado en la base viva**
      por MCP (`fldqekbuBxhzgOSG1`, 2026-07-16). **Gotcha que casi muerde y vale para E.2/cualquier
      toggle nuevo:** crear un checkbox deja **todos los records existentes destildados**, y como el gate
      de C.2 filtra server-side por `{activo}`, desplegarlo así habría dejado **cero voces activas ⇒ el
      motor entregando nada**. Se prendieron las 3 voces vivas a mano por MCP en la misma pasada. Un
      campo nuevo + un filtro nuevo = **siempre poblar el dato antes**.
- [x] **E.2** ✅ en su mitad-repo (2026-07-16): con la **señal desnuda** de ADR-023 no hay tabla
      `Corridas` ni campos de datos nuevos — el disparo son el botón + la automation, documentados en
      [airtable-cockpit.md §Disparo on-demand](../../core/contracts/airtable-cockpit.md) (y el checklist
      de `setup-airtable.mjs`). **Lo que queda es manual y de superficie** (la API no crea botones ni
      automations): crear en la base viva el botón "▶ Correr ahora" + la automation con el POST al
      webhook → va con **B.2** (carril de Mani), después del re-import de C.
- [ ] **E.3** Aplicar la racionalización de campos de B.3 en el contrato + schema.

**Hecho cuando:** el schema soporta Voz toggleable, N por corrida y el mecanismo de disparo, y el
contrato ([airtable-cockpit.md](../../core/contracts/airtable-cockpit.md)) refleja el estado real.

### (Descubrimiento de referentes — casi sin tocar)

El workflow de descubrimiento (ADR-020) no cambia por este refactor: propone referentes por proyecto,
que ya viven bajo una voz. Solo se **audita** (parte de A) para confirmar que no queda huérfano y que
respeta la jerarquía.

⚠️ **Decisión abierta que dejó C.2 (2026-07-16):** `Voces.activo` ya existe y **el motor lo respeta**,
pero el **descubrimiento no** — su `Leer Voces` sigue trayendo todas y su `Leer Proyectos` filtra solo
por `Proyectos.activo`. O sea: una voz apagada **no corre en el motor pero sí recibe propuestas de
referentes** cada semana. Es barato (el descubrimiento no es lo caro) pero incoherente con "la voz se
prende/apaga como unidad". **El fix es 1 línea** (copiar el `filterByFormula={activo}` en su `Leer
Voces` y saltear igual que `Armar plan de corrida`), pero cambia conducta y hay que decidirlo, no
asumirlo: quizá quieras seguir descubriendo referentes para una voz pausada, justamente para tenerlos
listos cuando la prendas.

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
