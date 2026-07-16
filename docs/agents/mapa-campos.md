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
> **Estado: 🔧 EN CURSO.** Esta pasada (2026-07-16) cerró los **hallazgos** y la **reconciliación
> repo↔live**; el mapa campo por campo de las 9 tablas está **incompleto** (ver §4). Fuentes de verdad:
> los 3 `workflow.json` + `core/scripts/setup-airtable.mjs` + la base viva (`Reels Cockpit`, por MCP).

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

## 3. Pasada única de `setup-airtable.mjs` + contrato (acumulada)

Tres cosas esperan **una sola pasada** sobre `core/scripts/setup-airtable.mjs` +
[airtable-cockpit.md](../../core/contracts/airtable-cockpit.md), para no tocar campos adyacentes tres
veces (decisión de cierre 40, extendida acá). `core/` solo cambia con ADR → **autorizado por ADR-024 +
el ADR de A.5**:

1. **N por proyecto** (ADR-024): el script y el contrato todavía describen N como global. *(Pendiente
   desde cierre 40.)*
2. **Los 2 toggles del descubrimiento** faltantes en `ajustesSeed` (§2.3).
3. **La racionalización de campos** que salga de B.3 (los huérfanos de §2.1).

## 4. El mapa campo por campo (⬜ pendiente)

Falta el barrido completo de las 9 tablas con la columna *quién escribe / quién lee / veredicto* por
campo. Lo verificado a mano en esta pasada (y que **no** hay que re-derivar):

- ✅ `Candidatos.notas_equipo` — escribe equipo · lee **nadie** (§2.1).
- ✅ `Referentes.notas` — escribe **DESC** (`Preparar promoción`, al sembrar una aprobada) · lee nadie.
- ✅ `Referentes.tasa_gate` / `tasa_aprobacion` / `videos_evaluados` — escribe **ARCH**
  (`Computar salud referentes` → `PATCH Referentes salud`) · los lee el **equipo** (vista "A revisar").
- ✅ `Proyectos.criterios_aprendidos` — escribe **ARCH** (`Destilar criterios`) · lee **MOTOR**
  (`Armar plan de corrida` + `Gate de relevancia`). **El loop cierra.**
- ✅ `Proyectos.advertencia_criterios` — escribe **ARCH** (misma llamada) · lee **el equipo**; el gate
  **no** lo lee (por contrato).
- ✅ `Ajustes.Mostrar al equipo` — escribe equipo · lee **la página**, no el motor (§2.1).
- ✅ Las columnas de `Métricas Global` (`supadata_llamadas`, `haiku_lotes`, `haiku_traducciones`,
  `duracion_min`, `falsos_negativos`, `precision`, embudo, contadores Apify) — **todas** las escribe
  `Computar métricas semana`; las leen las páginas + las fórmulas de costo.

Quedan por barrer: `Proyectos` (resto), `Voces`, `Candidatos` (resto), `Referentes propuestos`,
`Descartes del gate`, `Métricas Proyectos`.
