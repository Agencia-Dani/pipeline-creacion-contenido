# Mapa campo × tabla × quién escribe/lee (A.2 del refactor)

> **Qué es:** el mapa por **campo** de las 9 tablas del cockpit: quién lo llena, quién lo lee, y si
> tiene propósito. Responde las 4 preguntas de Mani: *¿cada campo cómo se maneja? ¿cómo influye en el
> workflow? ¿es necesario? ¿está estandarizado?* Es el entregable de **A.2** del
> [refactor Voces→Proyectos](./refactor-voces-proyectos.md), y lo que alimenta la racionalización de
> campos de **B.3**.
>
> **Granularidad:** el mapa **por tabla** (quién toca qué tabla) vive en [dev-doc §5](./dev-doc.md);
> este doc baja a campo. No dupliques: acá el campo, allá la tabla y el nodo.
>
> **Estado: ✅ COMPLETO** (2026-07-16). Las 9 tablas barridas campo por campo (§4), hallazgos en §2.
> Fuentes de verdad: los 3 `workflow.json` + `core/scripts/setup-airtable.mjs` + la base viva
> (`Reels Cockpit`, por MCP).

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
| `Candidatos.notas_equipo` | tabla `Candidatos` | 🟠 **Write-only del equipo, y se destruye.** Ningún workflow lo lee: no va al `metadata` de `outputs`, no va al Sheet, y el archivado borra el record cada domingo. Ver §2.2. |
| `Métricas Global`: `score_aprobados`, `score_descartados`, `separacion_gate`, `diagnostico` | **solo en la base viva** | 🟠 **Residuo del split del 2026-07-15.** Son campos de *calidad* (pertenecen a `Métricas Proyectos`). La tabla live es la vieja `Métricas` **renombrada**, así que arrastra sus columnas; `Métricas Proyectos` se creó nueva. `setup-airtable.mjs` **no** las declara y `Computar métricas semana` **no** las escribe en filas GLOBAL → columnas muertas en la cara del equipo. **Podar en B.3.** |
| `f.tema` · `f.link_doc` | nodo `Armar filas archivado` del **archivado** | 🔴 **Lecturas fantasma.** El nodo lee `f.tema` y `f.link_doc` de cada Candidato para llenar `outputs.metadata` — **esos campos no existen** en `Candidatos` (ni declarados ni en la base viva). Resuelven a `''` siempre ⇒ `metadata.tema` y `metadata.link_doc` son cadenas vacías en **todos** los outputs archivados. Residuo pre-ADR-009 (cuando el pipeline generaba docs). Cero conducta rota; es ruido en el registro. **Podar en D** (toca `workflow.json`, se arrastra con el re-import). |
| `Candidatos.viral_por_tamano` | tabla `Candidatos` | 🟠 **Marca write-only que no sobrevive.** La escribe el motor, la ve el equipo, pero **no va a `outputs.metadata` ni al Sheet** → cuando el archivado borra el record, se pierde. Nunca vas a poder preguntar "¿lo viral se aprueba más?". Mismo patrón y mismo fix barato que `notas_equipo` (b) → **D.3**. |
| Links inversos auto-creados: `Proyectos.Referentes`, `Proyectos.Candidatos`, `Proyectos.Referentes propuestos`, `Proyectos.Descartes del gate`, `Voces.Proyectos`, `Voces.Candidatos` | base viva | 🟡 Artefacto de Airtable (todo link crea su inverso). Nadie los declaró ni los lee, pero **el equipo los ve**. Decidir en **B.3** si se ocultan de las páginas. |

**`Ajustes.Mostrar al equipo` NO es huérfano** aunque ningún workflow lo lea: es el filtro de la página
*Configuración Global*, y el contrato lo dice explícito. No lo podes.

### 2.2 `notas_equipo` y el loop de aprendizaje (decisión de diseño, no bug)

El equipo escribe su razonamiento en `Candidatos.notas_equipo` y **se pierde entero cada domingo**.
Peor: `Destilar criterios` (ADR-022 — el nodo cuyo propósito literal es *aprender de las decisiones del
equipo*) solo le manda **`titulo` + `script`** a Haiku (verificado en su `_snip`). O sea que la señal
cualitativa más rica que produce el equipo no entra al loop que existe para consumirla.

Tres salidas posibles, **sin decidir**: (a) sumar `notas_equipo` al `_snip` de `Destilar criterios`
(cambia qué consume el loop → **enmienda de ADR-022**); (b) archivarlo a `outputs.metadata` para
no perderlo aunque no se use hoy (barato, reversible, y construye el corpus para decidir (a) con datos);
(c) declararlo scratch-pad efímero a propósito y documentarlo.

→ **En el plan como [D.3](./refactor-voces-proyectos.md) (Mani, 2026-07-16): a revisar** — puede ser la
señal más valiosa que produce el equipo (el *por qué* de un 👎, que ni el script ni el score capturan).

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

Contraste útil: `Proyectos.voz_default` también es multi-link, pero los 3 workflows leen `[0]` e ignoran
el resto → **1 proyecto = 1 voz** sí está garantizado por el código.

→ **No es un bug** (el fan-out por proyecto es deliberado, ADR-013) y hoy no rompe nada. Pero la
independencia entre voces es una **convención del equipo, no una garantía del schema**: nada impide que
un referente cruce voces. Importa para el norte Netflix ("las voces son universos separados"). **Decidir
en B.1/E:** o se documenta como permitido, o el schema lo restringe. No lo toques sin decidir.

## 3. Pasada única de `setup-airtable.mjs` + contrato (acumulada)

Cuatro cosas esperan **una sola pasada** sobre `core/scripts/setup-airtable.mjs` +
[airtable-cockpit.md](../../core/contracts/airtable-cockpit.md), para no tocar campos adyacentes cuatro
veces (decisión de cierre 40, extendida acá). `core/` solo cambia con ADR → **autorizado por ADR-024 +
el ADR de A.5**:

1. **N por proyecto** (ADR-024): el script y el contrato todavía describen N como global. *(Pendiente
   desde cierre 40.)*
2. **Los 2 toggles del descubrimiento** faltantes en `ajustesSeed` (§2.3).
3. **La racionalización de campos** que salga de B.3 (los huérfanos de §2.1).
4. **`Candidatos.fecha` es load-bearing y hoy es un paso manual** (§4.3): el archivado barre los `nuevo`
   viejos con `IS_BEFORE({fecha}, -20 días)`. La API no crea campos computados, así que el script solo
   lo **pide por consola** — una base nueva sale sin `fecha` y ese barrido falla en silencio. Al menos
   subir el aviso a error duro / verificarlo post-creación. Misma clase que (2): muerde en **F5**.

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
| `voz_default` (link) | equipo | MOTOR · ARCH · DESC (los 3 resuelven la voz por este link) | ✅ **1 sola voz por proyecto** (los 3 leen `[0]` e ignoran el resto). |
| `Referentes` · `Candidatos` · `Referentes propuestos` · `Descartes del gate` (links inversos) | Airtable | nadie | 🟡 Auto-creados, el equipo los ve → **B.3** (§2.1). |

### 4.2 `Voces`

| Campo | Escribe | Lee | Veredicto |
|---|---|---|---|
| `nombre` | equipo | MOTOR (`Armar plan`) · ARCH (`Armar filas`→`outputs.metadata.voz` + Sheet) | ✅ |
| `descripcion` | equipo | **nadie** | 🟡 Mismo caso que `Proyectos.descripcion`: contexto humano, no influye. Y la **descripción de la tabla** sigue pre-ADR-009 (§2.3) → **B.3**. |
| `criterios_relevancia` | equipo | MOTOR (`Gate`, como *ajuste de voz* que complementa al tema) · DESC (ambos `Vetting`) · ARCH (`Destilar`) | ✅ ADR-010: Proyecto ⊕ Voz. |
| `Proyectos` · `Candidatos` (links inversos) | Airtable | nadie | 🟡 → **B.3**. |
| **`activo`** | — | — | 🔴 **No existe.** Lo crea **E.1**; lo respeta **C.2**. |

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
| `viral_por_tamano` | MOTOR | **nadie** — ni `outputs`, ni Sheet, ni Métricas | 🟠 **Marca visual write-only.** Sirve al equipo mientras el record vive, pero **no sobrevive al archivado**: no se puede analizar después si lo viral se aprueba más. Barato de arreglar (sumarlo a `outputs.metadata`, mismo caso (b) que `notas_equipo`) → **D.3**. |
| `calificacion` (🔥/👍/👎) | **equipo** | ARCH → `outputs.metadata` + Sheet · **`Destilar`** (los 🔥 son los ejemplos positivos) | ✅ La señal del equipo que **sí** entra al loop. |
| `estado` | MOTOR (`nuevo`) → **equipo** | ARCH (`filterByFormula NOT({estado}='nuevo')` = qué archivar; barrido de `nuevo` viejos; `Computar métricas`; `Destilar`) | ✅ El campo más load-bearing de la tabla. |
| `notas_equipo` | **equipo** | **nadie** | 🟠 Huérfano y se destruye (§2.1/§2.2) → **D.3**. |
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
