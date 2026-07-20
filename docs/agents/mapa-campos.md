# Mapa del cockpit: campos y páginas (A.2 + A.3 del refactor)

> **Qué es:** el mapa de la superficie del equipo por sus dos ejes — **campo** (§4: quién lo llena,
> quién lo lee, si tiene propósito) y **página** (§5: qué tabla lee, qué edita, para qué sirve). Responde
> las 4 preguntas de Mani: *¿cada campo cómo se maneja? ¿cómo influye en el workflow? ¿es necesario?
> ¿está estandarizado?* Es el entregable de **A.2 + A.3** del
> [refactor Voces→Proyectos](./refactor-voces-proyectos.md), y lo que alimenta la racionalización de
> campos de **B.3** y la decisión de herramienta de **A.5**.
>
> **Granularidad:** el mapa **por tabla** (quién toca qué tabla) vive en [dev-doc §5](./dev-doc.md);
> este doc baja a campo y a página. No dupliques: acá el campo y la página, allá la tabla y el nodo.
>
> **Estado: ✅ COMPLETO** — A.2 (9 tablas campo por campo, §4) y A.3 (12 páginas + 1 form, §5), ambos
> 2026-07-16. Hallazgos de campo en §2, de página en §5.1. Fuentes de verdad: los 3 `workflow.json` +
> `core/scripts/setup-airtable.mjs` + la base viva (`Reels Cockpit`, por MCP).

## 1. Método (para que la próxima pasada no re-derive)

Tres fuentes, cruzadas:

1. **Schema declarado** — `core/scripts/setup-airtable.mjs` (`tables[]` + los links + las fórmulas de
   costo + `fecha_calificacion`) y [airtable-cockpit.md](../../core/contracts/airtable-cockpit.md).
2. **Uso real** — los 3 `workflow.json`, nodo por nodo.
3. **Base viva** — `list_tables_for_base` por MCP Airtable (base `Reels Cockpit`).

> ⚠️ **El grep mecánico de campos NO es confiable, no te fíes de él.** Dos trampas verificadas:
> **(a) es ciego a namespaces** — `descripcion`, `bio`, `razon` y `semillas` existen a la vez como
> campo de Airtable y como key del `content_item` interno del scrape, así que matchean en nodos que
> no tocan la tabla; **(b) falsos negativos** — en los code nodes las claves van sin comillas
> (`{ notas: '…' }`), así que un regex que exija comillas se pierde escritores reales
> (`Referentes.notas` es el caso: parece huérfano y no lo es). **Verificá cada campo leyendo el nodo.**

## 2. Hallazgos de esta pasada

### 2.1 Huérfanos confirmados (leídos por nadie)

| Qué | Dónde | Veredicto |
|---|---|---|
| `banda_descarte_min` · `banda_descarte_max` (0.35 / 0.6) | nodo `Config` del **motor** | 🔴 **Muertos.** Los dejó la enmienda 2026-07-13 que reemplazó la banda fija por el **top-K** (`cap_descartes`). Ningún nodo los lee. **Podar en C** (tocan `workflow.json`). |
| `Candidatos.notas_equipo` | tabla `Candidatos` | ✅ **Resuelto (D.3(b), Mani 2026-07-16):** `Armar filas archivado` ahora lo lleva a `outputs.metadata` — deja de morir con el record. Al Sheet no va (a propósito). Si algún día entra al destilado de criterios (la salida (a)), se decide con este corpus. Ver §2.2. |
| `Métricas Global`: `score_aprobados`, `score_descartados`, `separacion_gate`, `diagnostico` | **solo en la base viva** | 🟠 **Residuo del split del 2026-07-15.** Son campos de *calidad* (pertenecen a `Métricas Proyectos`). La tabla live es la vieja `Métricas` **renombrada**, así que arrastra sus columnas; `Métricas Proyectos` se creó nueva. `setup-airtable.mjs` **no** las declara y `Computar métricas semana` **no** las escribe en filas GLOBAL → columnas muertas en la cara del equipo. **Podar en B.3.** |
| `f.tema` · `f.link_doc` | nodo `Armar filas archivado` del **archivado** | ✅ **Podados (D.4, 2026-07-16)** — se aprovechó que D.3(b) ya tocaba ese nodo, como preveía el plan. Eran vestigiales documentados (`tema` murió con ADR-019, `link_doc` con ADR-009; archivaban `''` siempre); las filas viejas de `outputs` conservan las keys en su jsonb y `v_senal_tema` ya era inerte. Cero cambio de conducta. *(Anotado primero como 🔴 hallazgo nuevo en el cierre 43 — error mío: estaba documentado. Corregido en el 44.)* |
| `Candidatos.viral_por_tamano` | tabla `Candidatos` | ✅ **Resuelto (D.3(b), Mani 2026-07-16):** va a `outputs.metadata` junto con `notas_equipo` — "¿lo viral se aprueba más?" ya se puede responder con SQL sobre `outputs` de acá en adelante. |
| Links inversos auto-creados: `Proyectos.Referentes`, `Proyectos.Candidatos`, `Proyectos.Referentes propuestos`, `Proyectos.Descartes del gate`, `Voces.Proyectos`, `Voces.Candidatos` | base viva | 🟡 Artefacto de Airtable (todo link crea su inverso). Nadie los declaró ni los lee, pero **el equipo los ve**. Decidir en **B.3** si se ocultan de las páginas. |

**`Ajustes.Mostrar al equipo` NO es huérfano** aunque ningún workflow lo lea: es el filtro de la página
*Configuración Global*, y el contrato lo dice explícito. No lo podes.

### 2.2 `notas_equipo` y el loop de aprendizaje (decisión de diseño, no bug)

El equipo escribe su razonamiento en `Candidatos.notas_equipo` y **se pierde entero cada domingo**.
Peor: `Destilar criterios` (ADR-022 — el nodo cuyo propósito literal es *aprender de las decisiones del
equipo*) solo le manda **`titulo` + `script`** a Haiku (verificado en su `_snip`). O sea que la señal
cualitativa más rica que produce el equipo no entra al loop que existe para consumirla.

Tres salidas posibles: (a) sumar `notas_equipo` al `_snip` de `Destilar criterios` (cambia qué
consume el loop → **enmienda de ADR-022**); (b) archivarlo a `outputs.metadata` para no perderlo
aunque no se use hoy; (c) declararlo scratch-pad efímero a propósito.

→ **Decidido (D.3, Mani 2026-07-16): la (b).** Barata, reversible, y construye el corpus para decidir
(a) con datos — cuando haya semanas de `notas_equipo` en `outputs.metadata`, se puede juzgar si el
*por qué* de un 👎 mejora el destilado antes de tocar ADR-022. Implementado en `Armar filas archivado`
(pendiente de re-import del archivado).

### 2.3 Reconciliación repo ↔ live (insumo de A.4)

| Knob (`Ajustes`) | Repo (seed / Config) | Base viva | Lectura |
|---|---|---|---|
| `Días de recencia` | 7 | **100** | ✅ **No es drift** — knob del equipo, pisa el default a propósito. Ver §2.4. |
| `Resultados por cuenta de referente` | seed 20 · cap **50** | 40 | ✅ Efectivo 40 (bajo el cap). **El contrato dice cap 30 y está mal** — el JSON manda: 50. Corregido 2026-07-16. |
| `Bonus idioma extranjero` | 0.3 | 0.45 | ✅ Afinado por el equipo — es exactamente para lo que existe `Ajustes`. |
| `Descubrir en Instagram` · `Descubrir en TikTok` | 🔴 **faltan en `ajustesSeed`** | ✅ existen (creados a mano 2026-07-13) | La base viva está bien y la lectura es fail-open (defaults de Config = 1), así que **hoy no rompe nada**. Pero una base creada de cero con el script sale **sin** estos 2 toggles → el equipo no los podría apagar. Muerde en **F5 (multi-cliente)**. Fix va en la **pasada única de `setup-airtable.mjs`** (ver §3). |

**Confirmaciones que destraban el refactor:** la base viva **no tiene `Voces.activo`** (confirma **E.1**)
ni ningún campo de N en `Proyectos` (confirma **C.1**/ADR-024). La descripción de la tabla `Voces` en vivo
todavía dice *"Eje de generación (cómo suena)"* — lenguaje **pre-ADR-009** (hoy no se genera en voz);
corregir junto con B.3.

### 2.4 ✅ `Días de recencia` = 100 en la base viva — **no es un hallazgo, es el equipo usando el knob**

El default del Config y el contrato dicen **7**; la base viva está en **100** (fila creada 2026-06-24).
Con el cron semanal, el motor barre una ventana de **100 días** cada lunes en vez de la última semana.
El dedup (`processed_items`) evita re-transcribir (no quema Supadata), pero **Apify cobra los resultados
crudos igual** → ~14× la ventana de scraping por corrida.

→ **Resuelto (Mani, 2026-07-16): queda a libre elección del equipo de redes.** `Días de recencia` es un
knob team-facing (`Mostrar al equipo ✓`) y esto es exactamente para lo que existe `Ajustes`: el valor de
la base **pisa** el default y no hay drift que arreglar. **No lo "corrijas" a 7** — el default del Config
solo aplica si la fila no existe. Mismo caso que `Bonus idioma extranjero` 0.45 (§2.3).

### 2.5 ⭐ Un referente puede alimentar VARIOS proyectos — y por lo tanto varias voces

El [plan del refactor §2](./refactor-voces-proyectos.md) daba "referentes independientes entre voces"
como ✅ *implícito (referente → 1 proyecto → 1 voz)*, con un "confirmar en la auditoría". **Confirmado, y
es al revés:** `Referentes.proyecto` es un `multipleRecordLinks` (la descripción en vivo lo dice
explícito: *"podés linkear varios"*), y `Armar plan de corrida` **itera el array entero**, empujando el
handle a **cada** proyecto linkeado. Un mismo referente puede alimentar proyectos de **dos voces
distintas**.

→ **No es un bug** (el fan-out por proyecto es deliberado, ADR-013) y hoy no rompe nada. Pero la
independencia entre voces es una **convención del equipo, no una garantía del schema**: nada impide que
un referente cruce voces. Importa para el norte Netflix ("las voces son universos separados"). **Decidir
en B.1/E:** o se documenta como permitido, o el schema lo restringe. No lo toques sin decidir.

⚠️ **§2.6 vuelve esta pregunta más filosa, no menos.** Ahora que *1 proyecto = 1 voz* es regla firme, la
cadena referente → proyecto → voz es inequívoca en su segundo tramo: si un referente apunta a proyectos
de 2 voces, **cruza voces de verdad**, sin ambigüedad que lo tape. Es el único lugar que queda donde el
dato puede contradecir el norte Netflix.

### 2.6 ✅ `voz_default`: el modelo es **1 proyecto = 1 voz**, y el dato ya está limpio

Esta doc llegó a decir que *"1 proyecto = 1 voz está garantizado por el código"* porque los 3 workflows
leen `voz_default[0]`. **Era media verdad:** el código elige una, pero el **dato tenía dos** y nada lo
impedía. Encontrado en la base viva el 2026-07-16: *Comunicación para lideres* y *Comunicación en
empresas* tenían `[Milena Morales, Rosario Gomez]` → el motor usaba Milena y **Rosario no hacía nada**.

→ **Resuelto (Mani, 2026-07-16).** La regla es **firme y es la esencia del refactor**: **un proyecto
tiene UNA voz; una voz tiene VARIOS proyectos.** Mani limpió el dato en Airtable el mismo día;
verificado por MCP: los 6 proyectos con una sola voz, 2 por voz (Milena → parejas + empresas · Rosario →
Storytelling + líderes · Juan Pablo → los 2 de Trading).

*Efecto real de la limpieza:* en *Comunicación para lideres* quedó **Rosario**, y el motor venía usando
**Milena** (era `[0]`) ⇒ ese proyecto **cambia de criterios de voz** cuando se prenda (hoy está inactivo).

**Lo que queda como guarda, porque el schema no puede prohibirlo:** `voz_default` sigue siendo un
`multipleRecordLinks` (Airtable no ofrece un link "exactamente uno" por API), así que nada impide
re-romperlo. Por eso el motor **avisa por log** si vuelve a pasar
(`[Plan] ⚠️ … tiene N voces linkeadas; se usa solo la primera`) y hay un test que lo cubre. **Si ese
aviso aparece, se limpia el dato — no se toca el código.**

## 3. Pasada única de `setup-airtable.mjs` + contrato — ✅ 3 de 4 hechas

La pasada juntaba 4 cosas para no tocar campos adyacentes cuatro veces (decisión de cierre 40). **Se
desagrupó el 2026-07-16 (Mani):** las 3 decididas se hicieron ya — dejarlas esperando obligaba al
contrato a mentir (el motor pasó a leer `Proyectos.N` en C.1) y la cuarta depende de A.5, que no tiene
fecha. El motivo del bundle casi no aplicaba entre ellas: 1/2/4 tocan `Proyectos`/`Ajustes`/`Candidatos`
y (3) toca `Métricas Global` + links + `Voces`. `core/` solo cambia con ADR → **autorizado por ADR-024**.

1. ✅ **N por proyecto** (ADR-024): `setup-airtable.mjs` crea `Proyectos.N` (número, precision 0) y el
   contrato lo documenta; `Candidatos por corrida` pasó de *N total* a **default por proyecto** (en la
   descripción del seed y en el contrato). **Creado también en la base viva** por MCP el 2026-07-16
   (`fld9MCZ5y2pSWRxHc`) — vacío en todos los proyectos, o sea: conducta de hoy hasta que el equipo le
   ponga valores.
2. ✅ **Los 2 toggles del descubrimiento** (`Descubrir en Instagram`/`en TikTok`) sumados a `ajustesSeed`
   con `Mostrar al equipo ✓` (§2.3). La base viva ya los tenía a mano; ahora una base nueva también.
3. ⬜ **La racionalización de campos** que salga de B.3 (los huérfanos de §2.1) — **espera A.5**.
4. ✅ **`Candidatos.fecha`** (§4.3): resultó que la API **sí** crea campos computados (el script ya venía
   creando `fecha_calificacion`, un `lastModifiedTime`), así que ahora el script **intenta crear `fecha`**
   (`createdTime`) en vez de pedirlo por consola. Si la API lo rechaza va a una lista `pendientes` que se
   imprime fuerte al final **y sale con exit code 1** — antes era un `console.log` entre otros seis, y sin
   ese campo el barrido de `nuevo` viejos falla en silencio.

## 4. El mapa campo por campo

Actores: **MOTOR** (`workflow-short-form-content`) · **ARCH** (`workflow-archivado`) · **DESC**
(`workflow-descubrimiento-referentes`) · **equipo** (edita a mano en Airtable) · **página** (la lee una
vista del cockpit, ningún workflow).

> "Lee **nadie**" significa *ningún workflow*. Si la columna *Lee* dice **equipo**, el campo existe para
> que una persona lo mire: eso es un propósito válido, no un huérfano. Huérfano = **nadie** lo lee, ni
> máquina ni persona (o lo escribe alguien y se destruye sin que nadie lo consuma).

### 4.1 `Proyectos`

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `nombre` | equipo | MOTOR (`Armar plan`, prompt del gate) · ARCH (`Armar filas`→`outputs.metadata.proyecto`, `Computar métricas`→`ambito`, `Destilar`) · DESC (`Armar plan`) | ✅ |
| `descripcion` | equipo | **nadie** (solo el equipo lo ve) | 🟡 Contexto humano. Ningún workflow lo lee — **los criterios viven en `criterios_relevancia`**. Legítimo, pero documentar que es decorativo para que nadie espere que influya. |
| `criterios_relevancia` | equipo | MOTOR (`Gate`) · DESC (ambos `Vetting`) · ARCH (`Destilar`, para lintearlos) | ✅ El knob de relevancia de verdad. **La máquina nunca lo pisa** (ADR-022). |
| `criterios_aprendidos` | **ARCH** (`Destilar criterios`) | MOTOR (`Armar plan` + `Gate`) | ✅ El loop de ADR-022 cierra. |
| `advertencia_criterios` | **ARCH** (misma llamada) | **equipo** | ✅ Lint para el humano; el gate **no** lo lee (por contrato). |
| `activo` | equipo | MOTOR + DESC (`filterByFormula={activo}` en `Leer Proyectos`) | ✅ Gate operativo real. **ARCH no lo filtra** (archiva calificados de proyectos apagados) — correcto: no querés perder lo ya calificado. |
| `voz_default` (link) | equipo | MOTOR · ARCH · DESC (los 3 resuelven la voz por este link) | ✅ **1 proyecto = 1 voz** (regla firme, esencia del refactor). Los 3 leen `[0]`; el schema **no puede** forzar un solo link, así que el motor **avisa por log** si aparecen 2 y el dato se limpia a mano (§2.6). |
| `N` | equipo | MOTOR (`Armar plan` → `Armar candidato` corta a esta N) | ✅ **Nuevo 2026-07-16** (ADR-024/C.1). Vacío o 0 → cae al global `Candidatos por corrida`. Existe en el repo **y en la base viva**; el motor lo usa **recién tras el re-import de C**. |
| `Referentes` · `Candidatos` · `Referentes propuestos` · `Descartes del gate` (links inversos) | Airtable | nadie | 🟡 Auto-creados, el equipo los ve → **B.3** (§2.1). |

### 4.2 `Voces`

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `nombre` | equipo | MOTOR (`Armar plan`) · ARCH (`Armar filas`→`outputs.metadata.voz` + Sheet) | ✅ |
| `descripcion` | equipo | **nadie** | 🟡 Mismo caso que `Proyectos.descripcion`: contexto humano, no influye. Y la **descripción de la tabla** sigue pre-ADR-009 (§2.3) → **B.3**. |
| `criterios_relevancia` | equipo | MOTOR (`Gate`, como *ajuste de voz* que complementa al tema) · DESC (ambos `Vetting`) · ARCH (`Destilar`) | ✅ ADR-010: Proyecto ⊕ Voz. |
| `Proyectos` · `Candidatos` (links inversos) | Airtable | nadie | 🟡 → **B.3**. |
| `activo` | equipo | **MOTOR** (`Leer Voces` filtra `{activo}` server-side → `Armar plan` saltea los proyectos de una voz apagada) | ✅ **Nuevo 2026-07-16** (E.1 + C.2). En el repo **y** en la base viva (`fldqekbuBxhzgOSG1`), las 3 voces prendidas. **ARCH no lo filtra** (necesita todas las voces para resolver nombres al archivar) y **DESC tampoco** — decisión abierta. Vivo tras el re-import de C. Falta **B.5**: que el equipo lo vea en la página *Voces*. |

### 4.3 `Candidatos`

Los escribe **MOTOR** (`Preparar batch Airtable`) salvo donde diga otra cosa. **ARCH** los archiva a
`outputs` (`Armar filas archivado`) y después **borra el record**.

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `titulo` · `script` | MOTOR | ARCH → `outputs` + Sheet · `Destilar` (`_snip`) | ✅ |
| `idioma` · `views` · `likes` · `seguidores` · `heat_score` | MOTOR | ARCH → `outputs.metadata` + Sheet | ✅ |
| `engagement` | MOTOR | ARCH → `outputs.metadata` (**no** al Sheet) | ✅ Menor asimetría, deliberada o inocua. |
| `relevancia_score` | MOTOR (`Gate`) | ARCH → `outputs.metadata` + Sheet **+ `Computar métricas`** (`score_aprobados`/`separacion_gate`) | ✅ Load-bearing: alimenta el diagnóstico del criterio. |
| `relevancia_razon` | MOTOR (`Gate`) | ARCH → `outputs.metadata` + Sheet | ✅ |
| `referente` · `url_referente` | MOTOR | ARCH → `outputs.metadata` + `source_items` | ✅ |
| `thumbnail` | MOTOR | **equipo** (no se archiva) | ✅ Ayuda visual para calificar; muere con el record. |
| `viral_por_tamano` | MOTOR | ARCH → `outputs.metadata` (**D.3(b), 2026-07-16**; al Sheet no va) | ✅ Sobrevive al archivado — "¿lo viral se aprueba más?" se responde con SQL sobre `outputs`. |
| `calificacion` (🔥/👍/👎) | **equipo** | ARCH → `outputs.metadata` + Sheet · **`Destilar`** (los 🔥 son los ejemplos positivos) | ✅ La señal del equipo que **sí** entra al loop. |
| `estado` | MOTOR (`nuevo`) → **equipo** | ARCH (`filterByFormula NOT({estado}='nuevo')` = qué archivar; barrido de `nuevo` viejos; `Computar métricas`; `Destilar`) | ✅ El campo más load-bearing de la tabla. |
| `notas_equipo` | **equipo** | ARCH → `outputs.metadata` (**D.3(b), 2026-07-16**) | ✅ Deja de destruirse (§2.2); si entra al destilado (salida (a)) se decide con este corpus. |
| `proyecto` · `voz` (links) | MOTOR | ARCH (`Armar filas`, `Computar métricas`, `Destilar` agrupan por `proyecto[0]`) | ✅ |
| `fecha` (createdTime) | Airtable | **ARCH** (`Leer Candidatos nuevos viejos`: `IS_BEFORE({fecha}, -20 días)`) | ⚠️ **Load-bearing y se crea a mano.** `setup-airtable.mjs` no lo crea (la API no hace campos computados) — lo pide por consola. Base nueva sin `fecha` ⇒ el `filterByFormula` del barrido **falla** y los `nuevo` viejos se acumulan. Misma clase de bug que los toggles faltantes → **anotado en §3**. |
| `fecha_calificacion` (lastModified de `calificacion`) | Airtable | ARCH (`calificado_en` de `outputs` + Sheet) | ✅ Con fallback a `now()` si falta. |

### 4.4 `Referentes propuestos`

Los escribe **DESC** (`Armar propuestas`) salvo `estado`, que es del equipo.

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `handle` | DESC | DESC (`Armar plan`: dedup por (plataforma, handle) · `Preparar promoción`: crea el Referente) | ✅ |
| `plataforma` | DESC | DESC (dedup + promoción) | ✅ |
| `estado` | DESC (`propuesto`) → **equipo** (`aprobado`/`descartado`) → DESC (`promovido`) | DESC (`Preparar promoción` filtra `aprobado`) | ✅ El loop de ADR-020 cierra: aprobar es la única acción y se auto-siembra. |
| `proyecto` (link) | DESC | DESC (`Preparar promoción` lo copia al Referente) | ✅ El equipo puede corregirlo antes de aprobar. |
| `afinidad` · `razon` | DESC | DESC (`Preparar promoción` los concatena en `Referentes.notas`) **+ equipo** | ✅ |
| `seguidores` · `bio` · `url` · `semillas` | DESC | **equipo** | ✅ Contexto para decidir — el propósito de la tabla. |

### 4.5 `Descartes del gate`

Los escribe **MOTOR** (`Preparar batch Descartes`, top-K rechazos por score) salvo `veredicto`.

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `veredicto` | **equipo** | **ARCH** (`Computar métricas` cuenta los `era bueno` → `falsos_negativos`) | ✅ El único campo que la máquina lee. 🟠 **No es editable en la UI** → arrastre de B.6. |
| `titulo` · `script` · `referente` · `url_referente` · `relevancia_score` · `relevancia_razon` · `thumbnail` · `proyecto` | MOTOR | **equipo** | ✅ Evidencia para auditar. Se borra entero cada domingo (`Preparar borrado Descartes`) — deliberado (ADR-021). |

### 4.6 `Métricas Proyectos`

Todo lo escribe **ARCH** (`Computar métricas semana`, routeado por `_tabla`); lo lee la **página**. Tabla
solo-lectura, proyección regenerable (la verdad cruda vive en Supabase).

| Campo | Fuente | Veredicto |
|---|---|---|
| `clave` · `semana` · `ambito` | ARCH (`hoy · nombre`) | ✅ |
| `calificados` · `aprobados` · `descartados` · `precision` | de `Candidatos` calificados, agrupados por proyecto | ✅ `precision` = la métrica norte. 🟠 **falta formatearla como %** → B.6. |
| `score_aprobados` · `score_descartados` · `separacion_gate` | promedios de `relevancia_score` por estado | ✅ Acá **sí** viven (a diferencia de `Métricas Global` — §2.1). |
| `diagnostico` | ARCH (semáforo derivado de `separacion_gate` + `precision`) | ✅ Sin IA, determinista. |

**Barrido:** `Leer Metricas viejas` + `Barrer Metricas viejas` borran filas de **más de 84 días**, y
apuntan **solo a `Métricas Proyectos`**. `Métricas Global` no se barre nunca — **deliberado, guarda el
trend** (está en el contrato; no lo "arregles").

## 5. El mapa de páginas (A.3)

El interface **Cockpit Redes** (`pbdXZRaSlAAGRAPGH`) tiene **12 páginas**, más **1 form standalone que
vive fuera del interface** (§5.1-6). Leído por MCP (`list_pages_for_base` + `get_form_schema`), no por
captura de pantalla.

**Cobertura:** las 9 tablas tienen al menos una página; ninguna página quedó sin tabla. `Referentes` y
`Ajustes` tienen 2 páginas cada una (una para el equipo, otra especializada) y `Métricas Global`
también (*Salud* + *Costos*). **No hay páginas huérfanas** — el problema no es sobra de páginas, es
**qué campo muestra cada una** (§5.1).

| Página | Tabla | Edita | Propósito | Veredicto |
|---|---|---|---|---|
| **Feed de Calificación** | `Candidatos` | `calificacion`, `estado`, `notas_equipo` (+ `titulo`, `thumbnail`, `referente` ⚠️) | el loop central: el equipo califica | 🟠 edita 3 campos de la máquina (§5.1-4) |
| **Proyectos** | `Proyectos` | `nombre`, `activo`, `descripcion`, `voz_default`, `criterios_relevancia` | el equipo define qué se busca | 🔴 **no muestra `criterios_aprendidos` ni `advertencia_criterios`** (§5.1-2) |
| **Voces** | `Voces` | `nombre`, `descripcion`, `criterios_relevancia` | el eje organizativo | ✅ (le falta `activo` → **E.1** + **B.5**) |
| **Referentes** | `Referentes` | `handle`, `plataforma`, `proyecto`, `activo`, `notas` | alta y toggle de fuentes | ✅ |
| **Referentes - Revisar/Flojos** | `Referentes` | todo, incl. `tasa_gate`/`tasa_aprobacion`/`videos_evaluados` ⚠️ | la vista "A revisar" de ADR-022: podar fuentes flojas | 🟠 salud editable (§5.1-4) |
| **Referentes - Sugeridos** | `Referentes propuestos` | `handle`, `proyecto`, `estado` | aprobar/descartar propuestas del descubrimiento | ✅ diseño correcto (solo `estado` importa). 🟠 falta el filtro `estado=propuesto` (arrastre) |
| **Descartes** | `Descartes del gate` | `titulo`, `thumbnail`, `proyecto`, `referente` — **`veredicto` NO** | auditar falsos negativos (ADR-021) | 🟠 `veredicto` se marca editable recién con records en la página → después del lunes (§5.1-1) |
| **Configuración Global** | `Ajustes` | solo `valor` | los knobs del equipo (filtro `Mostrar al equipo ✓`) | ✅ **el mejor ejemplo del cockpit**: muestra `clave`+`descripcion` read-only y deja editar solo el valor |
| **Ajustes Dev-Only** | `Ajustes` | **nada** (`valor` read-only) | los knobs avanzados | 🟡 un dev no puede editar desde su propia página (§5.1-5) |
| **Calidad por Proyecto** | `Métricas Proyectos` | todo ⚠️ (tabla solo-lectura) | precisión + diagnóstico por proyecto | 🟠 editable + no muestra `separacion_gate` (§5.1-3) |
| **Salud del Sistema** | `Métricas Global` | `semana`, `clave` ⚠️ | la salud del motor | 🔴 **no muestra salud** (§5.1-3) |
| **Costos** | `Métricas Global` | — (dashboard, 9 `bigNumber` sumando las fórmulas de costo) | el gasto de la semana por servicio | 🟠 **sin publicar** (arrastre) + verificar el filtro de semana (§5.1-7) |
| *(fuera del interface)* **Nuevo Proyecto** | `Proyectos` | form de alta | crear un proyecto | 🔴 **trampa**: `criterios_relevancia` no es obligatorio (§5.1-6) |

### 5.1 Hallazgos de páginas

**1. 🟠 `veredicto` read-only ⇒ `falsos_negativos` = 0 hasta que se marque editable.**
La API lo reporta `isEditable: false`, pero **no es una decisión de diseño: la tabla está vacía**
(el archivado la barre cada domingo y el motor con código nuevo todavía no corrió) y Airtable no deja
configurar el permiso del campo sin records en la página — *Mani, 2026-07-16*. O sea que el fix es el
que ya estaba en B.6 (marcarlo editable), y la ventana para hacerlo abre **después de la corrida del
lunes**, cuando la página tenga descartes.
Lo que **sí** conviene tener presente: `veredicto` es el **único** campo de esa tabla que lee una
máquina ([§4.5](#45-descartes-del-gate)) — el archivado cuenta los `era bueno` → `falsos_negativos`.
Mientras no se pueda marcar, ese contador es **siempre 0**, y "0 falsos negativos" se lee como *el gate
está perfecto*: la conclusión opuesta a la verdad. **No leas ese 0 como dato hasta que el fix esté.**
Aparte, y esto sí es configuración: la página deja editar `titulo`, `thumbnail`, `proyecto` y
`referente` — los campos que **no** le importan a nadie (§5.1-4).

**2. 🔴 La mitad humana del loop de ADR-022 nunca llega al humano.** La página *Proyectos* no muestra
`criterios_aprendidos` **ni** `advertencia_criterios`. El problema real es `advertencia_criterios`: ese
campo existe **solo** para que una persona lo lea (el gate no lo lee, por contrato — [§4.1](#41-proyectos)).
Si no está en ninguna página, el archivado gasta una llamada a Haiku cada domingo para escribir un aviso
que **nadie ve**, salvo que abra la tabla cruda. En los hechos es un huérfano — no por el schema, por la
superficie. `criterios_aprendidos` es menos grave (el gate sí lo lee, así que funciona igual), pero el
contrato promete que el equipo puede editarlo o borrarlo, y desde el cockpit no puede.
**→ B.3/B.6: sumar los 2 campos a la página *Proyectos*.**

**3. 🔴 *Salud del Sistema* no muestra salud — el split del 2026-07-15 partió las tablas y nadie curó
las páginas.** La página lee `Métricas Global` pero muestra `calificados`, `aprobados`, `precision` y
`diagnostico`: **campos de calidad**, que después del split son el negocio de `Métricas Proyectos`. El
embudo entero (`colectados`, `pretrim`, `gate_pass`, `entregados`, `runs_ok`, `runs_fallo`,
`duracion_min`, `sin_guion`, `falsos_negativos`) **no está en ninguna página**. Peor: `diagnostico` es
una de las 4 columnas muertas de `Métricas Global` ([§2.1](#21-huérfanos-confirmados-leídos-por-nadie)) —
la página le muestra al equipo una columna que en filas GLOBAL está **siempre vacía**. Eso confirma la
poda de B.3 desde el otro lado: el huérfano no es teórico, está en la cara del equipo.
Simétrico, menor: *Calidad por Proyecto* no muestra `separacion_gate`, el número del que sale el
`diagnostico` que sí muestra. **→ B.6, y es el input más fuerte para A.5** (ver §5.2).

**4. 🟠 Campos de la máquina editables por el equipo, en 4 páginas.** *Feed* deja editar `titulo`,
`thumbnail` y `referente`; *Referentes - Revisar* deja editar `tasa_gate`, `tasa_aprobacion` y
`videos_evaluados`; las 2 páginas de Métricas dejan editar **todo**, sobre tablas que el contrato declara
**solo-lectura**. Nada se rompe (el archivado pisa esos valores el domingo siguiente, o los archiva tal
como quedaron), pero es confuso: alguien "arregla" una tasa_gate y su cambio desaparece sin explicación.
El contraste sano es *Configuración Global*, que muestra el contexto read-only y deja editar solo lo que
el equipo debe tocar. **→ B.3: pasar a read-only lo que escribe la máquina.**

**5. 🟡 *Ajustes Dev-Only* tiene `valor` read-only** — un dev no puede editar los knobs avanzados desde
la página hecha para eso; tiene que ir a la tabla cruda. O se arregla (1 clic) o se admite que la página
es solo de consulta y se documenta. Trivial, pero es de la familia "la superficie no dice la verdad".

**6. 🔴 El form *Nuevo Proyecto* es una trampa, y vive fuera del interface.** Es un form **standalone**
(`interfaceId: null`), no documentado en ningún lado hasta ahora. Dos problemas: **(a)** `criterios_relevancia`
**no es obligatorio** — y un proyecto sin criterios no es inofensivo: el gate del motor es **fail-open**
(sin criterios **deja pasar todo** y ordena por métrica), así que ese proyecto entrega ruido sin filtrar,
mientras que el descubrimiento es fail-closed y lo saltea. Crear un proyecto por este form es la forma más
fácil de romper la relevancia sin darse cuenta. **(b)** expone `Candidatos` (un **link inverso**, §2.1) como
campo a llenar en el alta, lo cual no tiene sentido: los candidatos los crea el motor.
**→ B.1/B.3: `criterios_relevancia` obligatorio, sacar `Candidatos`, y decidir si el form entra al
interface o se borra.**

**7. 🟠 *Costos*: sin publicar (arrastre conocido) + un chequeo pendiente.** Los 9 `bigNumber` suman con
`summaryFunction: sum` sobre `Métricas Global`. El subtítulo dice *"Elegí la semana arriba"*, pero el
filtro de semana **no se puede verificar por API** — si no está, la página suma **toda la historia** en
vez de la semana (y `Métricas Global` no se barre nunca, [§4.6](#46-métricas-proyectos)), así que el
número crecería para siempre. **Verificar al publicar.**

**8. 🟡 La vista "🔥 Seleccionados" no es una página.** El re-rank que pidió el jefe (ADR-008) vive como
**vista de la tabla cruda** `Candidatos`, no como página del cockpit. Funciona, pero queda fuera de la
superficie curada. Decidir en B.1 si sube a página.

### 5.2 Lo que A.3 le aporta a la decisión de A.5 (Airtable vs. dashboard propio)

> **Cerrada (2026-07-17): [ADR-025](../adr/ADR-025-cockpit-producto-propio.md)** — el cockpit migra a
> producto propio; Airtable queda como superficie **interina** curada al mínimo. El análisis de abajo
> queda como el insumo que alimentó esa decisión.

El mapa parte en dos, limpio, y **confirma el matiz de "partir la superficie"** de
[§3 del plan](./refactor-voces-proyectos.md):

- **El eje operativo funciona bien en Airtable.** *Configuración Global*, *Referentes*, *Sugeridos* y
  *Feed* hacen lo suyo; sus problemas son de **curaduría** (un permiso, un filtro, un campo de más), no
  de la herramienta. Ninguno justifica infra nueva. Esto respalda ADR-023 (el operativo se queda).
- **El eje analítico es donde se rompe.** Las 3 páginas analíticas (*Salud*, *Calidad*, *Costos*) son las
  3 con hallazgos 🔴/🟠 estructurales, y ninguno es coincidencia: el split partió tablas y las páginas
  quedaron desfasadas; el embudo entero no se muestra; *Costos* depende de fórmulas baked en Airtable y
  de un filtro que no se puede verificar por API; y **todo eso ya vive en Supabase**, que es la fuente de
  verdad (NFR5). Es exactamente el perfil de "read-only sobre Supabase, bajo riesgo" del plan.

→ **Recomendación para el ADR de A.5, sin cerrarlo acá:** estirar Airtable en lo operativo (barato,
respeta el invariante) y evaluar dashboard propio **solo** para las 3 páginas analíticas. **Antes de
decidir, ojo con el sesgo:** ninguna de esas 3 páginas fue curada después del split — o sea que estamos
comparando Airtable-mal-configurado contra un dashboard imaginario. La prueba honesta es **arreglar
*Salud del Sistema* primero** (B.6, es de horas) y recién ahí ver si Airtable se quedó corto de verdad o
si nunca le dimos la chance.

## 6. Guía de curado por página — B.6 ejecutado a mano (cierre 54)

> **Para Mani, a ejecutar en el interface designer de Airtable** (la API no edita config de páginas —
> §5.1 del handoff histórico, confirmado cierre 50). Alcance fijado por [ADR-025](../adr/ADR-025-cockpit-producto-propio.md):
> **lo mínimo para operar mientras llega el producto propio** — nada decorativo.
> Orden sugerido = el de la tabla (empieza por lo que destraba el trabajo diario).
>
> ✅ **Los textos de ayuda YA ESTÁN EN LA BASE (cierre 56, por MCP):** las 9 tablas tienen *description*
> en **todos** sus campos (53 escritas en esa pasada + las que ya existían; también se corrigió la
> descripción pre-ADR-009 de la tabla `Voces`). Al agregar un campo a una página, Airtable muestra ese
> texto en el ⓘ — **no hay que escribir helper text a mano**; §6.1 queda como referencia de los textos
> clave. Lo que resta a mano es SOLO lo de esta tabla: visibilidad, permisos y filtros por página.
> Verificado en vivo en esa misma pasada: `Métricas Proyectos.precision` **ya es tipo percent** — el
> viejo fix "(3) precision como %" de B.6 quedó sin objeto.

| # | Página | Qué hacer (pasos concretos) | Por qué |
|---|---|---|---|
| 1 | **Voces** | Sumar el campo `activo` a la página, **editable**. | B.5: el motor ya lo respeta; el equipo no lo ve. Es el interruptor maestro. |
| 2 | **Proyectos** | Sumar 3 campos: `N` (**editable**), `criterios_aprendidos` (**editable** — el contrato dice que el equipo puede corregirlo/borrarlo), `advertencia_criterios` (**solo lectura**). | El aviso semanal de Haiku hoy no lo ve nadie; la N es el knob central del flujo on-demand. |
| 3 | **Feed de Calificación** | Pasar a **solo lectura**: `titulo`, `thumbnail`, `referente`. Editables quedan solo `calificacion`, `estado`, `notas_equipo`. | Campos de la máquina editables confunden (§5.1-4). El modelo a copiar es *Configuración Global*. |
| 4 | **Descartes** | **Después de la corrida del lunes** (necesita records en la página): marcar `veredicto` **editable**; pasar a solo lectura `titulo`, `thumbnail`, `proyecto`, `referente`. | Sin `veredicto` editable, `falsos_negativos` = 0 para siempre y el loop de ADR-021 está muerto (§5.1-1). Hoy está al revés. |
| 5 | **Referentes - Revisar** | Pasar a **solo lectura**: `tasa_gate`, `tasa_aprobacion`, `videos_evaluados`. Editable queda solo `activo`. | La salud la escribe el archivado cada domingo; editarla a mano se pisa sin aviso. |
| 6 | **Referentes Buscados** (Sugeridos) | Agregar el filtro `estado = propuesto` a la página. | Que la bandeja muestre solo lo pendiente de revisar (arrastre conocido). |
| 7 | **Salud del Sistema** | **Rearmarla**: quitar `calificados`, `aprobados`, `precision`, `diagnostico` (post-split son de `Métricas Proyectos`; `diagnostico` en filas GLOBAL está siempre vacío). Mostrar el embudo, en este orden: `semana`, `colectados`, `pretrim`, `gate_pass`, `entregados`, `sin_guion`, `runs_ok`, `runs_fallo`, `duracion_min`, `falsos_negativos`. **Filtro `ambito = GLOBAL`** (la tabla también tiene filas DESCUBRIMIENTO, que en el embudo salen vacías). Orden de filas: `semana` desc. Todo **solo lectura**. | Hoy la página de salud no muestra salud (§5.1-3): el embudo entero no está en ninguna página. |
| 8 | **Calidad por Proyecto** | Sumar `separacion_gate`; pasar TODO a **solo lectura**. *(`precision` ya es percent en vivo — verificado cierre 56.)* | Se muestra el semáforo (`diagnostico`) sin el número del que sale; la tabla es solo-lectura por contrato. |
| 9 | **Costos** | Verificar a ojo que los 9 `bigNumber` tengan **filtro de semana** (subtítulo "Elegí la semana arriba"). Si no lo tienen, agregarlo. | Sin filtro suman toda la historia (`Métricas Global` no se barre nunca) y el número crece para siempre (§5.1-7). |
| 10 | **Ajustes Dev-Only** | Marcar `valor` **editable**. | Un dev no puede editar sus propios knobs desde la página hecha para eso (§5.1-5). |
| 11 | **Form "Nuevo Proyecto"** (standalone) | Hacer `criterios_relevancia` **obligatorio**; **quitar** el campo `Candidatos` (link inverso); sumar `N` como campo opcional. | Un proyecto sin criterios = gate fail-open = ruido sin filtrar (§5.1-6). Es la forma más fácil de romper la relevancia. |
| 12 | **Configuración Global** | Nada. | Ya es el modelo sano (contexto read-only + solo `valor` editable). |

### 6.1 Textos de ayuda sugeridos (copiar/pegar)

Escritos para Majo/Jero (mismo tono que el [onboarding](../onboarding-equipo-redes.md)). Solo los
campos donde el texto cambia una decisión; el resto no necesita ayuda.

| Tabla.campo | Texto de ayuda |
|---|---|
| `Voces.activo` | Interruptor maestro: destildarlo pausa TODOS los proyectos de esta voz de una. La voz apagada igual sigue recibiendo propuestas de cuentas nuevas. |
| `Proyectos.N` | Cuántos videos quieren de este tema por corrida (ej: 20). Vacío = usa la perilla global "Candidatos por corrida". Es un máximo: si el filtro encuentra menos videos buenos, llegan menos. |
| `Proyectos.criterios_relevancia` | El campo más importante: qué hace relevante a un video para este tema y qué NO. Concreto = menos basura. La máquina nunca lo pisa. |
| `Proyectos.criterios_aprendidos` | Lo que la máquina destiló de sus calificaciones (se actualiza cada domingo). Pueden corregirlo o borrarlo si dice algo raro. |
| `Proyectos.advertencia_criterios` | Aviso semanal de la máquina sobre los criterios de este proyecto. Si aparece algo acá, léanlo: sugiere cómo afinar los criterios. |
| `Candidatos.calificacion` | 🔥 excelente (le enseña a la máquina el ejemplo ideal) · 👍 sirve · 👎 no sirve. Califiquen también lo que descartan: la máquina aprende del "no". |
| `Candidatos.estado` | La decisión que cuenta: aprobado = seleccionado (va al Histórico el domingo) · descartado = no va. Lo que quede en "nuevo" más de 20 días se borra solo. |
| `Candidatos.notas_equipo` | Opcional: por qué sí o por qué no. Se archiva con el video y ayuda a mejorar el filtro. |
| `Descartes.veredicto` | ¿La máquina hizo bien en descartarlo? "bien descartado" = sí · "era bueno" = se equivocó (esta marca es oro: afina el filtro del proyecto). |
| `Referentes.activo` | Destildar = la cuenta deja de rastrearse (no hace falta borrarla). La máquina señala las flojas en "Revisar" pero nunca las apaga sola: podar es decisión de ustedes. |
| `Referentes.proyecto` | Puede alimentar más de un proyecto (de la misma voz). Cada video llega UNA sola vez, al proyecto donde mejor pega. |
| `Referentes propuestos.estado` | aprobado = el lunes se siembra sola en Referentes y empieza a traer videos · descartado = definitivo (no se vuelve a proponer; siempre pueden agregarla a mano). |

**Verificación al terminar:** entrar como miembro del equipo (o en vista previa), y chequear: (a) en el
*Feed* no se puede tocar `titulo`; (b) en *Descartes* sí se puede marcar `veredicto`; (c) *Salud del
Sistema* muestra `entregados` y `sin_guion` de la última semana; (d) *Buscados* solo muestra filas
`propuesto`; (e) el form no deja crear un proyecto sin criterios.

### 6.2 El spec por página: qué campo se muestra, en qué orden, y quién lo puede editar

El detalle campo-a-campo de la tabla de arriba, para ejecutar sin pensar. Convención: **✏️ editable** ·
**👁 solo lectura** · lo no listado se **oculta** de la página (existe en la tabla igual). El texto de
ayuda de cada campo ya vive en su *description* (base viva, cierre 56) — al agregar el campo a la
página, sale solo.

| Página | Campos, en orden (✏️ = editable, 👁 = lectura) | Ocultar |
|---|---|---|
| **Feed de Calificación** | 👁 `thumbnail` · 👁 `titulo` · 👁 `script` · 👁 `relevancia_razon` · 👁 `heat_score` · 👁 `relevancia_score` · 👁 `referente` · 👁 `url_referente` · 👁 `idioma` · 👁 `views` `likes` `seguidores` `engagement` · 👁 `viral_por_tamano` · 👁 `proyecto` · 👁 `voz` · **✏️ `calificacion` · ✏️ `estado` · ✏️ `notas_equipo`** | `fecha`, `fecha_calificacion` (plomería) |
| **Proyectos** | ✏️ `nombre` · ✏️ `activo` · ✏️ `voz_default` · ✏️ `N` · ✏️ `criterios_relevancia` · ✏️ `criterios_aprendidos` · 👁 `advertencia_criterios` · ✏️ `descripcion` | los 4 links inversos (`Referentes`, `Candidatos`, `Referentes propuestos`, `Descartes del gate`) |
| **Voces** | ✏️ `nombre` · ✏️ `activo` · ✏️ `descripcion` · ✏️ `criterios_relevancia` | los links inversos (`Proyectos`, `Candidatos`) |
| **Referentes** | ✏️ `handle` · ✏️ `plataforma` · ✏️ `proyecto` · ✏️ `activo` · ✏️ `notas` · 👁 `tasa_gate` · 👁 `tasa_aprobacion` · 👁 `videos_evaluados` | — |
| **Referentes - Revisar** | 👁 `handle` · 👁 `plataforma` · 👁 `proyecto` · 👁 `tasa_gate` · 👁 `tasa_aprobacion` · 👁 `videos_evaluados` · **✏️ `activo`** (podar es del equipo) · 👁 `notas` | — |
| **Referentes Buscados** | 👁 `handle` · 👁 `url` · 👁 `plataforma` · 👁 `afinidad` · 👁 `razon` · 👁 `bio` · 👁 `seguidores` · 👁 `semillas` · **✏️ `proyecto`** (corregible antes de aprobar) · **✏️ `estado`** — filtro `estado = propuesto` | — |
| **Descartes** | 👁 `thumbnail` · 👁 `titulo` · 👁 `script` · 👁 `relevancia_razon` · 👁 `relevancia_score` · 👁 `referente` · 👁 `url_referente` · 👁 `proyecto` · **✏️ `veredicto`** (recién con records: post-lunes) | — |
| **Configuración Global** | 👁 `clave` · 👁 `descripcion` · **✏️ `valor`** — filtro `Mostrar al equipo ✓` *(ya está así: no tocar)* | `Mostrar al equipo` |
| **Ajustes Dev-Only** | 👁 `clave` · 👁 `descripcion` · **✏️ `valor`** (el fix del paso 10) — filtro `Mostrar al equipo` destildado | — |
| **Calidad por Proyecto** | todo 👁: `semana` · `ambito` · `calificados` · `aprobados` · `descartados` · `precision` (ya percent) · `separacion_gate` · `diagnostico` — filas por `semana` desc | `clave`, `score_aprobados`, `score_descartados` (el detalle detrás de `separacion_gate`; opcional mostrarlos) |
| **Salud del Sistema** | todo 👁: `semana` · `colectados` · `pretrim` · `gate_pass` · `entregados` · `sin_guion` · `runs_ok` · `runs_fallo` · `duracion_min` · `falsos_negativos` — **filtro `ambito = GLOBAL`**, filas por `semana` desc | `clave`, los campos de calidad (`calificados`…`diagnostico`), contadores y costos (viven en *Costos*) |
| **Costos** | los 9 `bigNumber` existentes (fórmulas `costo_*`) — verificar **filtro de semana** | — |
| **Form Nuevo Proyecto** | `nombre` (requerido) · **`criterios_relevancia` (requerido — el fix)** · `voz_default` · `N` (opcional, sumar) · `activo` · `descripcion` | `Candidatos` (quitar del form) |

### 6.3 Helper text por página (copiar al armar cada elemento)

> **Qué es esto y en qué se diferencia de §6.1.** Airtable tiene **dos** textos por campo:
> la ***description* del campo en la tabla** (el ⓘ — ya cargada en la base entera, cierre 56) y el
> **helper text del elemento en la página**, que se escribe a mano al armar la vista y aparece
> **debajo del campo**. La description explica *qué es el campo* en general; el helper de página dice
> *qué hacer con él acá*. Estos son los helpers de página, redactados para Majo y Jero: cortos,
> imperativos, sin jerga.
>
> **No hace falta ponerlos todos.** Si vas con poco tiempo, cargá solo los de los campos ✏️
> (editables) — son los que guían una decisión; los 👁 ya se explican solos con el ⓘ.

**Feed de Calificación** *(la bandeja diaria)*

| Campo | Helper text |
|---|---|
| `thumbnail` | La portada, para reconocer el video de un vistazo. |
| `titulo` | De qué va. Si dice ⚠️ SIN GUION no se pudo transcribir: abrí el original y decidí ahí. |
| `script` | El video transcrito y traducido al español. Esto es lo que van a adaptar. |
| `relevancia_razon` | Por qué la máquina lo dejó pasar. Leelo primero: te ahorra abrir el video. |
| `heat_score` | Qué tan prometedor, solo para ordenar (arriba = mejor). No es una nota sobre 10. |
| `relevancia_score` | Qué tan relevante al tema lo vio la máquina, de 0 a 1. |
| `referente` | La cuenta de donde salió el video. |
| `url_referente` | Abrí el video original acá. |
| `idioma` | Idioma del video original (el script ya está en español). |
| `views` | Reproducciones del original al momento de encontrarlo. |
| `likes` | Likes del original al momento de encontrarlo. |
| `seguidores` | Seguidores de la cuenta de origen. |
| `engagement` | Interacción del video sobre su alcance. |
| `viral_por_tamano` | Venía de una cuenta muy grande (+700K). Solo marca; no lo descarta. |
| `proyecto` | El tema para el que se seleccionó. |
| `voz` | La voz para la que se seleccionó. |
| **`calificacion`** ✏️ | Tu opinión: 🔥 excelente · 👍 sirve · 👎 no sirve. El 🔥 le enseña a la máquina qué buscar. |
| **`estado`** ✏️ | La decisión que cuenta: aprobado va al Histórico, descartado no va. Marcá también lo que no sirve. |
| **`notas_equipo`** ✏️ | Opcional: por qué sí o por qué no. Se guarda y ayuda a afinar el filtro. |

**Proyectos** *(los temas que se buscan)*

| Campo | Helper text |
|---|---|
| **`nombre`** ✏️ | El tema, como lo llaman ustedes. |
| **`activo`** ✏️ | Destildá para pausarlo. Ojo: si la Voz está apagada, no corre aunque esté activo. |
| **`voz_default`** ✏️ | Una sola Voz por proyecto, y que hable del mismo mundo que el tema. |
| **`N`** ✏️ | Cuántos videos querés de este tema por corrida. Vacío = el valor global. Es un máximo, no una promesa. |
| **`criterios_relevancia`** ✏️ | Lo más importante de esta página: qué SÍ y qué NO cuenta como relevante, con ejemplos. Concreto = menos basura. |
| **`criterios_aprendidos`** ✏️ | Lo que la máquina aprendió de sus calificaciones (se actualiza los domingos). Podés corregirlo si dice algo raro. |
| `advertencia_criterios` 👁 | Aviso semanal de la máquina sobre estos criterios. Si aparece algo, vale la pena leerlo. |
| **`descripcion`** ✏️ | Contexto para el equipo. La máquina no lo lee: el filtro real son los criterios. |

**Voces** *(para quién se selecciona)*

| Campo | Helper text |
|---|---|
| **`nombre`** ✏️ | El personaje o marca para el que se cura contenido. |
| **`activo`** ✏️ | Interruptor maestro: destildá y se pausan TODOS los proyectos de esta voz de una. |
| **`descripcion`** ✏️ | Quién es y de qué tiene autoridad. Contexto para ustedes; la máquina no lo lee. |
| **`criterios_relevancia`** ✏️ | Opcional: qué le sirve a esta voz en particular. Se suma a los criterios del proyecto. |

**Referentes** *(el banco de cuentas)*

| Campo | Helper text |
|---|---|
| **`handle`** ✏️ | La cuenta con UNA sola arroba. Ej: @simonsinek. |
| **`plataforma`** ✏️ | De dónde traer sus videos: instagram o tiktok. |
| **`proyecto`** ✏️ | A qué tema alimenta. Puede ser más de uno: cada video llega una sola vez, al que mejor pega. |
| **`activo`** ✏️ | Destildá para dejar de rastrearla, sin borrarla. |
| **`notas`** ✏️ | Por qué la agregaron. El buscador escribe acá cuando siembra una cuenta aprobada. |
| `tasa_gate` 👁 | Qué proporción de sus videos pasa el filtro. Baja sostenida = candidata a podar. |
| `tasa_aprobacion` 👁 | Qué proporción de sus videos terminan aprobando ustedes. |
| `videos_evaluados` 👁 | Sobre cuántos videos se calculan esas tasas. Con pocos, no saquen conclusiones. |

**Referentes - Revisar** *(las cuentas flojas)*

| Campo | Helper text |
|---|---|
| `handle` 👁 | La cuenta que la máquina señala como floja. |
| `plataforma` 👁 | Instagram o TikTok. |
| `proyecto` 👁 | A qué tema alimenta hoy. |
| `tasa_gate` 👁 | Qué poco de lo suyo pasa el filtro: es la razón por la que está en esta lista. |
| `tasa_aprobacion` 👁 | Qué poco de lo suyo terminan aprobando ustedes. |
| `videos_evaluados` 👁 | Cuántos videos respaldan el número. Con menos de 5, dale otra semana. |
| **`activo`** ✏️ | La decisión es de ustedes: destildá para podarla. La máquina nunca apaga una cuenta sola. |
| `notas` 👁 | Por qué se había agregado, para decidir con contexto. |

**Referentes Buscados** *(propuestas del buscador)*

| Campo | Helper text |
|---|---|
| `handle` 👁 | La cuenta que propone el buscador. |
| `url` 👁 | Abrí el perfil y mirala antes de decidir. |
| `plataforma` 👁 | De dónde salió la sugerencia. |
| `afinidad` 👁 | Qué tan bien pega con el tema, de 0 a 1. Solo llegan las de 0.6 para arriba. |
| `razon` 👁 | Por qué la propone. Leelo primero: decide la mayoría de los casos. |
| `bio` 👁 | La bio de la cuenta, para confirmar de qué habla. |
| `seguidores` 👁 | Tamaño de la cuenta, como contexto. |
| `semillas` 👁 | Cuáles de SUS referentes la recomendaron. |
| **`proyecto`** ✏️ | A qué tema entraría. Es una sugerencia: cambialo antes de aprobar si va mejor en otro. |
| **`estado`** ✏️ | aprobado = el lunes se siembra sola y empieza a traer videos. descartado = definitivo, no se vuelve a proponer. |

**Descartes** *(auditar el filtro, 2 min por semana)*

| Campo | Helper text |
|---|---|
| `thumbnail` 👁 | La portada del video que la máquina descartó. |
| `titulo` 👁 | De qué era el video rechazado. |
| `script` 👁 | El texto que juzgó el filtro: la evidencia para darle el veredicto. |
| `relevancia_razon` 👁 | Por qué lo rechazó. Leelo primero: casi siempre alcanza para decidir. |
| `relevancia_score` 👁 | Su puntaje. Acá llegan los que CASI pasan: por eso vale auditarlos. |
| `referente` 👁 | De qué cuenta venía. |
| `url_referente` 👁 | Abrí el original si con el texto no te alcanza. |
| `proyecto` 👁 | El tema cuyo filtro lo rechazó. |
| **`veredicto`** ✏️ | ¿Hizo bien? "bien descartado" = sí. "era bueno" = se equivocó, y esa marca es la que afina el filtro. |

**Configuración Global** *(las perillas del equipo)*

| Campo | Helper text |
|---|---|
| `clave` 👁 | El nombre de la perilla. No lo cambien: la máquina la busca por este nombre. |
| `descripcion` 👁 | Qué hace esta perilla. |
| **`valor`** ✏️ | Lo único que se edita acá. Si lo dejan vacío o mal, la máquina usa su valor por defecto (no se rompe). |

**Ajustes Dev-Only** *(perillas avanzadas)*

| Campo | Helper text |
|---|---|
| `clave` 👁 | Perilla avanzada. Equipo de redes: avisen antes de tocar. |
| `descripcion` 👁 | Qué hace y por qué es avanzada. |
| **`valor`** ✏️ | Editable solo para devs. Todas tienen tope de seguridad: nadie puede disparar el gasto sin querer. |

**Calidad por Proyecto** *(solo lectura)*

| Campo | Helper text |
|---|---|
| `semana` 👁 | La semana que resume la fila (arranca el lunes). |
| `ambito` 👁 | El proyecto al que corresponden estos números. |
| `calificados` 👁 | Cuántos candidatos calificaron esa semana. Si es 0, la fila no dice nada. |
| `aprobados` 👁 | Cuántos aprobaron. |
| `descartados` 👁 | Cuántos descartaron. |
| `precision` 👁 | La métrica norte: de lo que les mandamos, qué % sirvió. |
| `separacion_gate` 👁 | Si el filtro distingue lo bueno de lo malo: 0.20 o más está sano; bajo o negativo pide afinar los criterios. |
| `diagnostico` 👁 | La lectura en una frase: 🟢 no toques nada · 🟡 un retoque · 🔴 reescribí los criterios del proyecto. |

**Salud del Sistema** *(solo lectura — el embudo de la máquina)*

| Campo | Helper text |
|---|---|
| `semana` 👁 | La semana que resume la fila (arranca el lunes). |
| `colectados` 👁 | Videos crudos que trajo la búsqueda, antes de filtrar. |
| `pretrim` 👁 | Los que sobrevivieron al primer filtro rápido. |
| `gate_pass` 👁 | Los que pasaron el filtro de relevancia con IA. |
| `entregados` 👁 | Los que llegaron a su bandeja para calificar. |
| `sin_guion` 👁 | Cuántos llegaron sin transcripción. Si sube mucho, avisen al equipo técnico. |
| `runs_ok` 👁 | Corridas que terminaron bien esa semana. |
| `runs_fallo` 👁 | Corridas que fallaron. Si no es 0, avisen. |
| `duracion_min` 👁 | Cuánto tardó la corrida promedio, en minutos. |
| `falsos_negativos` 👁 | Cuántos "era bueno" marcaron en Descartes: contenido útil que el filtro mató. |

**Costos** *(solo lectura — dólares de la semana)*

| Elemento | Helper text |
|---|---|
| `costo_total` | Lo que costó la semana, todo incluido. Elegí la semana arriba. |
| `costo_supadata` | Transcribir los videos (uno por video distinto). |
| `costo_haiku_lotes` | Los filtros con IA que deciden qué es relevante. |
| `costo_haiku_traducciones` | Traducir al español los videos que no venían en español. |
| `costo_apify_ig` | Traer los videos de las cuentas de Instagram. |
| `costo_apify_tt` | Traer los videos de las cuentas de TikTok. |
| `costo_perfiles_semilla` | El buscador mirando sus mejores referentes para arrancar. |
| `costo_detalle_sugeridos` | El buscador revisando a fondo las cuentas que encontró. |
| `costo_lookalikes_tt` | Buscar cuentas parecidas en TikTok. **Es el más caro por resultado: miralo primero si el total sube.** |

**Form "Nuevo Proyecto"**

| Campo | Helper text |
|---|---|
| `nombre` | El tema que van a buscar. Ej: "Comunicación para líderes". |
| **`criterios_relevancia`** (requerido) | Qué SÍ y qué NO cuenta como relevante, con ejemplos. **Sin esto el filtro deja pasar todo:** es el campo que define la calidad. |
| `voz_default` | Para qué voz es este tema. Una sola, y que hable del mismo mundo. |
| `N` | Cuántos videos querés por corrida. Vacío = el valor global. Podés cambiarlo cuando quieras. |
| `activo` | Dejalo tildado si querés que empiece a buscar ya. Antes, cargale al menos un Referente. |
| `descripcion` | Contexto para el equipo (opcional). |
