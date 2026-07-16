# Cockpit del equipo de redes — modelo de datos en Airtable (ADR-008 + ADR-009)

> La superficie no-code donde el equipo de redes (Majo, Jero) gestiona la búsqueda y **califica**
> los scripts. Airtable plan **free**: 1.000 registros/base · 1.000 API calls/mes · 5 editores.
> El motor (n8n) lee esta base cada corrida y le escribe los candidatos. Lo pesado (historial,
> dedup, selecciones) vive en Supabase ([002](../schema/002_cockpit_y_dedup.sql) +
> [003](../schema/003_seleccion_e_historico.sql)).
>
> **Actualización ADR-009 (2026-06-12):** el script de cada candidato es la **transcripción
> literal del video, traducida al español si hace falta** — no una reescritura en voz. Ver
> [ROADMAP §1](../../ROADMAP.md).
>
> **Setup:** `node core/scripts/setup-airtable.mjs` crea esta base entera por API (ver abajo).

---

## Las 9 tablas

### 1. `Proyectos` — la unidad de búsqueda (qué se busca)
Una temática aislada (los resultados no se cruzan entre proyectos). Ej: Comunicación, Ventas, Liderazgo.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Comunicación", "Ventas"… |
| `descripcion` | texto largo | qué cubre el proyecto |
| `criterios_relevancia` | texto largo | **qué hace relevante a un video para este proyecto** — lo edita el equipo, lo lee el motor para juzgar relevancia (no solo virales). Ver ADR-010 |
| `criterios_aprendidos` | texto largo | **patrones destilados de las decisiones reales del equipo** (2-3 de lo que sí / lo que no, con ejemplos) — los escribe el archivado cada semana con Haiku, priorizando los 🔥; el gate los lee **junto a** los manuales. La máquina **nunca pisa** `criterios_relevancia`; el equipo puede editar o borrar este campo (ADR-022/M2) |
| `advertencia_criterios` | texto largo | **lint de los criterios manuales** (criterio vago / sin lista negativa / Voz incoherente) — lo escribe la **misma** llamada de destilación; visible al equipo, el gate **NO lo lee** (ADR-022/M2) |
| `voz_default` | link → `Voces` | la **única** voz del proyecto (un proyecto = una voz; una voz puede servir a varios proyectos). Afina el filtro de relevancia por encima del tema (ADR-010) |
| `activo` | checkbox | si entra en las corridas |
| `N` | número (entero) | **cuántos candidatos entrega ESTE proyecto en una corrida** (ADR-024). Vacía o 0 → usa el global `Candidatos por corrida` de `Ajustes` como default. El corte final va **por proyecto**, cada uno a su N, por heat compuesto tras el gate. Nunca supera `cap_top_n` (techo duro de transcripción **total**: si muerde antes, algún proyecto queda por debajo de su N — el cap manda) |

> **Cambio ADR-015/016:** `dias_recencia`, `top_n` y los 4 toggles de eje salieron del Proyecto. La
> ventana y los resultados por referente son **globales** (tabla `Ajustes`); la plataforma de búsqueda
> la da `Referente.plataforma` y el descubrimiento es solo por referente.
>
> **Enmienda ADR-024 (2026-07-15):** el **N vuelve al Proyecto** (campo `N` arriba) — ADR-016 lo había
> sacado a propósito para que el costo de la corrida fuera predecible; la reunión con redes del
> 2026-07-15 dio información nueva (el flujo on-demand es por proyecto) y reabrió la decisión. El global
> `Candidatos por corrida` pasa de *N total* a **default por proyecto**. Trade aceptado a conciencia: se
> cambió costo-predecible por control por proyecto, con `cap_top_n` de cinturón.

### 2. `Voces` — el eje organizativo (para quién se selecciona)
Separado del proyecto a propósito. **Nota ADR-009:** el MVP no genera en voz (scripts literales),
así que los campos de generación (`few_shot`, `frase_credencial`, `cta`, `tratamiento`, `registro`,
`pais_acento`) **se quitaron del cockpit** para no meter ruido mientras no haya generación. Son la
costura de la evolución "guiones en voz propia": se re-agregan (vía ADR) cuando esa fase llegue. Hoy
la voz organiza la selección ("5 videos para tal voz") + el histórico, y afina el gate de relevancia.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Cora", "Alma", "30X institucional"… |
| `descripcion` | texto largo | quién es / autoridad |
| `criterios_relevancia` | texto largo | **qué le sirve a este cliente puntual** (fit de persona/audiencia) — afina el gate de relevancia por encima del tema del Proyecto. Opcional; el Proyecto filtra el tema, la Voz el cliente (ADR-010) |
| `activo` | checkbox | si esta voz **y todos sus proyectos** entran en las corridas. La voz es la espina dorsal: se prende/apaga como unidad. **Un proyecto `activo` cuya voz está apagada NO corre.** El motor lo filtra server-side (`filterByFormula={activo}` en `Leer Voces`) — como `Proyectos.activo`, porque Airtable omite los checkbox destildados del payload y del lado del código "destildado" y "el campo no existe" son indistinguibles. Solo lo lee el **motor**: el archivado necesita todas las voces para resolver nombres al archivar, y el descubrimiento hoy **no** lo respeta (decisión abierta) |

> ⚠️ **`voz_default`: la regla es 1 proyecto = 1 voz, y el schema no puede hacerla cumplir.** *Un
> proyecto tiene UNA voz; una voz tiene VARIOS proyectos* — es la esencia del modelo (Mani, 2026-07-16),
> y los 3 workflows leen `voz_default[0]` (nombre, criterios y el gate de `activo`). Pero Airtable no
> ofrece un link "exactamente uno" por API, así que nada impide linkear dos, y si pasa **la segunda se
> ignora en silencio**. *Ya pasó en vivo* (2 proyectos, limpiados el 2026-07-16 — cierre 46). Guarda: el
> motor lo **avisa por log** (`[Plan] ⚠️ … tiene N voces linkeadas`) y hay test. **Si el aviso aparece,
> se limpia el dato — no se toca el código.**

### 3. `Referentes` — banco de perfiles (**la única fuente de descubrimiento**, ADR-019)
| Campo | Tipo | Para qué |
|---|---|---|
| `handle` | texto (primario) | @cuenta |
| `plataforma` | single select | instagram / tiktok |
| `proyecto` | link → `Proyectos` | a qué proyecto alimenta |
| `activo` | checkbox | si se rastrea |
| `notas` | texto largo | por qué se agregó |
| `tasa_gate` | número (0-1) | **salud de la fuente**: gate_pass / evaluados del desglose por referente de `runs.metricas` de la semana. La escribe el archivado con mínimo de muestra (ADR-022/M2) |
| `tasa_aprobacion` | número (0-1) | seleccionados / calificados acumulado (de `v_senal_seleccion`). La escribe el archivado con mínimo de muestra (ADR-022/M2) |
| `videos_evaluados` | número | cuántos videos distintos de esta cuenta evaluó el gate esta semana (denominador de `tasa_gate`) |

> **Salud por referente (ADR-022/M2):** el archivado actualiza los 3 campos de arriba cada semana
> (mínimo de muestra `min_muestra_referente`=10 para no juzgar con pocos videos). Una vista **"A revisar"**
> (filtro `tasa_gate` o `tasa_aprobacion` bajas + `videos_evaluados` ≥ mínimo) señala cuentas a podar.
> **La poda es siempre del equipo** (destildar `activo`) — simetría con la promoción de ADR-020.

### 4. `Candidatos` — los scripts a calificar (donde el equipo cura)
| Campo | Tipo | Para qué |
|---|---|---|
| `titulo` | texto (primario) | título/contexto del video fuente |
| `script` | texto largo | **la transcripción del video, en español** (traducida si el original no lo está — literal, ADR-009) |
| `idioma` | single select | idioma del original: es / en / pt / it / fr / otro |
| `thumbnail` | attachment | portada del video (la llena el motor con la `coverUrl` de Apify) — el equipo escanea sin clickear afuera |
| `proyecto` | link → `Proyectos` | |
| `voz` | link → `Voces` | para qué voz se selecciona |
| `referente` | texto | handle del video fuente (lo llena el motor: el `username` del poster) |
| `url_referente` | url | link al video original |
| `views` / `likes` / `seguidores` / `engagement` | número | métricas del fuente |
| `heat_score` | número | el ranking compuesto (relevancia ⊕ métricas — ADR-010); caliente→frío |
| `relevancia_score` | número (0-1) | el juicio semántico **limpio** del gate Haiku, separado del heat compuesto |
| `relevancia_razon` | texto largo | **por qué** el gate dejó pasar el video — ayuda al equipo a curar rápido |
| `viral_por_tamano` | checkbox | el fuente venía de cuenta >700K |
| **`calificacion`** | single select | 🔥 / 👍 / 👎 — **lo pone el equipo** |
| **`estado`** | single select | **nuevo / aprobado / descartado** — binario tras calificar; `publicado` se retiró (era idéntico a aprobado y el record se borra al archivar) |
| `fecha_calificacion` | last modified time (solo del campo `calificacion`) | **cuándo** se calificó — alimenta el tracking de selecciones |
| `notas_equipo` | texto largo | feedback del equipo |
| `fecha` | created time | cuándo llegó el candidato (campo nativo de Airtable, manual: la API no crea computados) |

**Vista "🔥 Seleccionados" (el re-rank que pidió el jefe):** una vista de esta misma tabla con
filtro `estado = aprobado` + orden `heat_score` descendente — el mapa de calor "se rehace" solo
con lo elegido, sin código. Se crea a mano al armar la base (las vistas no salen por API).

### 5. `Ajustes` — los knobs del scoring (clave→valor, ADR-011)
Donde el equipo afina cómo rankea el motor **sin tocar n8n**, en **español claro**. Una fila por knob;
el equipo edita el `valor`. El motor (`Armar plan`) **traduce cada `clave` amigable a su parámetro
interno** (mapa `AJUSTE_MAP`) y la aplica **sobre los defaults del nodo Config**: si la tabla está
vacía, un knob falta, o la `clave` no está en el mapa, usa el default. Lectura **fail-open**.

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | texto (primario) | el nombre del knob, en español (debe coincidir con `AJUSTE_MAP`) |
| `valor` | número (precisión 2) | el valor que sobrescribe el default |
| `descripcion` | texto largo | qué hace el knob (para el equipo) |
| `Mostrar al equipo` | checkbox | si está marcado, el knob sale en la página **Configuración Global** (la que edita el equipo); sin marcar, solo en **Ajustes Dev-Only**. Es el filtro de esa página (una condición `= ✓`), no lo lee el motor. Marcados: los knobs globales de ADR-016/017 (recencia, candidatos, resultados por referente, los 2 toggles); sin marcar: los pesos/mínimos del scoring (avanzados). |

**Knobs (semilla por defecto):** `Peso de vistas` 0.4 · `Peso de likes` 0.4 · `Peso de interacción`
0.2 (pesos del prescore métrico) · `Peso de relevancia` 0.7 (IA vs. métricas en el orden final) ·
`Bonus idioma extranjero` 0.3 (premia no-español) · `Seguidores para marcar viral` 700000 (marca, no
filtra) · `Mínimo de vistas` 0 / `Mínimo de likes` 0 (**piso duro**; 0 = nada corta) · `Relevancia
mínima` 0 (**umbral** del gate; 0 = nada corta).

**Knobs de ejecución globales (ADR-016)** — los que el equipo edita en la **página Global** del
dashboard: `Candidatos por corrida` 100 (**default por proyecto** desde ADR-024 — ya **no** es N total
por corrida: es cuántos entrega un proyecto que no tiene su propia `N`; contados como videos distintos,
el corte va por heat compuesto tras el gate, **por proyecto**) · `Días de recencia` 7 (ventana única de
fetch) · `Resultados por cuenta de referente` 20 (videos por cuenta de referente por corrida).

**Toggles de eje (ADR-017; el eje keyword se removió — ADR-019)** — también en la página Global:
`Buscar por referentes en Instagram` 1 · `Buscar por referentes en TikTok` 1 (1=on/0=off; default
ambos on).

**Knobs del descubrimiento de referentes (ADR-020)** — los lee el workflow de descubrimiento (no el
motor): `Propuestas por corrida` 10 (cap de propuestas semanales) · `Afinidad mínima de propuesta`
0.6 (umbral del vetting Haiku, 0-1). **Toggles de eje del descubrimiento** (también página Global,
como los del motor): `Descubrir en Instagram` 1 · `Descubrir en TikTok` 1 (1=on/0=off; default ambos
on; off = ese eje no genera semillas y su rama no corre). El eje TikTok igual necesita referentes TT
sembrados para producir algo.

**Topes de costo (dev-only, en Config — no editables por el equipo):** `cap_resultados_referente` **50**
(techo de `Resultados por cuenta de referente`; el motor usa `min(valor_equipo, cap)`) · `cap_top_n`
100 (techo duro de transcripción por corrida; protege el backfill — es el gobernador de créditos real)
· `cap_descartes` 10 (tope de rechazos top-K por score que se
exponen al equipo — ADR-021, enmienda 2026-07-13) · `presupuesto_transcribir_s` 780 (si el loop de
transcripción lo excede, el resto de la corrida sigue sin transcript en vez de morir por el watchdog
de n8n) · `cap_lookalikes_tt` 15 (techo de lookalikes TikTok por corrida en el descubrimiento; control
de costo, $0.20/resultado — ADR-020).
En Config quedan además los **IDs** (`airtable_base_id`/`supabase_url`/`instance_id`) y los defaults de
los toggles (`buscar_referente_ig`/`buscar_referente_tiktok`, ambos 1). Detección de idioma: dev-only.

### 6. `Referentes propuestos` — la bandeja del descubrimiento (ADR-020)
Cuentas candidatas a Referente que propone el **workflow de descubrimiento** cada semana
(sugeridos del propio Instagram a partir de los referentes que mejor convierten, veteados con
Haiku). El equipo revisa y marca `estado`; los `aprobado` se **promueven solos** a `Referentes`
(activo ✓) en la corrida siguiente y quedan `promovido`. **El motor de reels NO lee esta tabla.**

| Campo | Tipo | Para qué |
|---|---|---|
| `handle` | texto (primario) | @cuenta propuesta |
| `plataforma` | single select | instagram / tiktok (v1 solo propone instagram) |
| `proyecto` | link → `Proyectos` | a qué proyecto(s) alimentaría |
| `afinidad` | número (0-1) | juicio Haiku contra los criterios del proyecto |
| `razon` | texto largo | por qué la propone (en español, para decidir rápido) |
| `seguidores` / `bio` / `url` | número / texto largo / url | contexto de la cuenta para revisar sin salir de Airtable |
| `semillas` | texto | qué referentes activos la sugirieron |
| **`estado`** | single select | **propuesto / aprobado / descartado / promovido** — propuesto lo pone el workflow; aprobado/descartado el equipo; promovido el workflow al sembrarla |

Un handle propuesto una vez **no se re-propone** (dedup contra esta tabla en cualquier estado y
contra `Referentes`): descartar es definitivo salvo alta manual.

### 7. `Descartes del gate` — los rechazos más "cerca de pasar" para auditar (ADR-021)
Videos que el gate de relevancia rechazó **después de transcribirlos**. Se exponen los **top-K por
score de Haiku** (los near-miss: los que más cerca estuvieron de pasar = los más probables falsos
negativos). *(Enmienda 2026-07-13: la banda fija `[0.35,0.6]` nunca se poblaba porque Haiku rechaza
decisivo/bimodal; se reemplazó por top-K.)* **No son Candidatos** (nunca esperaron
calificación). El motor sube como máximo ~10 por corrida (knob dev-only `cap_descartes` 10 en Config);
el equipo los audita en 2 minutos y marca
`veredicto`; el archivado cuenta los "era bueno" como **falsos negativos** en `Métricas` y **limpia
la tabla** al cerrar la semana (no se acumulan).

| Campo | Tipo | Para qué |
|---|---|---|
| `titulo` | texto (primario) | contexto del video (caption recortado) |
| `script` | texto largo | el transcript que juzgó el gate (la evidencia para auditar) |
| `referente` | texto | handle del video fuente |
| `url_referente` | url | link al video original |
| `proyecto` | link → `Proyectos` | contra qué criterios se juzgó |
| `relevancia_score` | número (0-1) | el score del gate (siempre en la banda borderline) |
| `relevancia_razon` | texto largo | por qué el gate lo rechazó |
| `thumbnail` | attachment | portada, para escanear rápido |
| **`veredicto`** | single select | **bien descartado / era bueno** — lo pone el equipo; "era bueno" = falso negativo |

### 8. `Métricas Proyectos` + `Métricas Global` — el desempeño semanal, solo-lectura (ADR-021)
**Las escribe solo el archivado** (domingo, al cerrar la semana), routeando cada fila por `_tabla`.
**Split 2026-07-15:** antes era una sola tabla `Métricas` y las dos páginas del cockpit (*Métricas de
Calidad* y *Salud del Sistema*) la compartían, así que no podían mostrar campos distintos sin pisarse.
Ahora son dos tablas, una entidad cada una:

- **`Métricas Proyectos`** — una fila por (semana × proyecto) con la **calidad**. La lee la página *Métricas de Calidad*.
- **`Métricas Global`** — una fila `GLOBAL` (salud del motor) + una `DESCUBRIMIENTO` (embudo del buscador,
  ADR-021 bis) + **todos los costos**. La leen *Salud del Sistema* y *Costos*.

Ambas son **proyección derivada y regenerable** — la verdad cruda vive en Supabase (`runs.metricas` +
`outputs`), solo-lectura a propósito. La página *Costos* **existe como borrador sin publicar**
(`pagjPe0IcSIx5TGXh`) y lee `Métricas Global`. La "semana" es la **semana de calificación** (el ciclo
que cierra el archivado), no la de entrega.

**`Métricas Proyectos`:**

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | texto (primario) | `YYYY-MM-DD · <proyecto>` |
| `semana` | fecha | el lunes de la semana de calificación |
| `ambito` | texto | nombre del proyecto |
| `calificados` / `aprobados` / `descartados` | número | lo que el equipo decidió esa semana |
| `precision` | número (0-1) | **precisión de entrega** = aprobados / calificados (la métrica norte) |
| `score_aprobados` / `score_descartados` | número (0-1) | score medio del gate en cada grupo |
| `separacion_gate` | número | la resta de los dos: baja = los criterios del proyecto no discriminan |
| `diagnostico` | texto largo | **lectura legible del criterio**: 🟢 sano / 🟡 mejorable / 🔴 flojo o invertido + qué hacer, derivado de `separacion_gate`+`precision` (regla, sin IA — enmienda ADR-021 2026-07-14). El *lint de forma* con IA llega en ADR-022/M2 y convive con este |

**`Métricas Global`:**

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | texto (primario) | `YYYY-MM-DD · <GLOBAL \| DESCUBRIMIENTO>` |
| `semana` | fecha | el lunes del cierre |
| `ambito` | texto | `GLOBAL` o `DESCUBRIMIENTO` |
| `calificados` / `aprobados` / `descartados` / `precision` | número | totales de la semana (fila GLOBAL) |
| `entregados` / `colectados` / `pretrim` / `gate_pass` | número | el embudo de la semana (fila GLOBAL, suma de los runs del motor) |
| `apify_ig` / `apify_tt` | número | **resultados crudos de Apify por plataforma** en el motor (`instagram-scraper` / `free-tiktok-scraper`); GLOBAL. Alimentan el costo Apify |
| `sin_guion` / `descartes_expuestos` / `falsos_negativos` | número | salud del contenido (GLOBAL) |
| `runs_ok` / `runs_fallo` / `duracion_min` | número | salud del motor (GLOBAL; `runs_ok`/`runs_fallo` también en DESCUBRIMIENTO) |
| `semillas` / `sugeridos_unicos` / `propuestos` / `promovidos` | número | **embudo del descubrimiento** (fila DESCUBRIMIENTO — ADR-020/021 bis) |
| `perfiles_semilla` / `detalle_sugeridos` / `lookalikes_tt` | número | **resultados crudos de Apify por actor** en el descubrimiento (`instagram-profile-scraper` ×2 + `tiktok-lookalike-search`); DESCUBRIMIENTO. Alimentan el costo Apify |
| `supadata_llamadas` / `haiku_lotes` / `haiku_traducciones` | número | **conteo de llamadas** por servicio (GLOBAL), que alimentan las columnas de costo |
| `costo_supadata` / `costo_haiku_lotes` / `costo_haiku_traducciones` / `costo_apify_ig` / `costo_apify_tt` / `costo_perfiles_semilla` / `costo_detalle_sugeridos` / `costo_lookalikes_tt` / `costo_total` | fórmula ($) | **costo en $ de la semana** = `tarifa × conteo` (ADR-021 bis). La tarifa vive **baked en la fórmula**, editable en la UI sin re-import. `costo_total` suma todo y es correcto **por fila** (GLOBAL suma motor; DESCUBRIMIENTO suma su Apify). Tarifas (Mani 2026-07-14): Supadata `$0.009`/crédito, Haiku lote `$0.004`, Haiku traducción `$0.005`, Apify IG/perfiles `$0.0023`, Apify TikTok `$0.005`, lookalikes TikTok `$0.20`. *(La precisión decimal se fija a mano en la UI — la API no la setea en fórmulas. Las 5 columnas Apify quedaron en precisión 0: subir a 2.)* |

### Tarifas de Apify por actor

Apify se factura **por resultado**. Los 4 actores en uso en el pipeline (verificado en los `workflow.json`; tarifas confirmadas por Mani 2026-07-14):

| Actor (`actorId`) | Nodo · workflow | Tarifa |
|---|---|---|
| `apify~instagram-scraper` | `Apify — IG Reels` · motor de reels | `$2.30`/1.000 = **$0.0023**/result |
| `clockworks~free-tiktok-scraper` | `Apify — TikTok Perfil` · motor de reels | `$5`/1.000 = **$0.005**/item |
| `apify~instagram-profile-scraper` | `Apify — Perfiles semilla` + `Apify — Detalle sugeridos` · descubrimiento | `$2.30`/1.000 = **$0.0023**/result |
| `dataovercoffee~tiktok-lookalike-search` | `Apify — Lookalikes TikTok` · descubrimiento | **$0.20**/result |

> **Contadores de Apify (implementado 2026-07-14, aplica al re-importar):** el motor cuenta los
> resultados crudos de cada actor en `runs.metricas` (`apify_ig` / `apify_tt`); el descubrimiento cuenta
> los suyos (`perfiles_semilla` / `detalle_sugeridos` / `lookalikes_tt`) y ya proyecta su embudo a la
> fila `DESCUBRIMIENTO`. El archivado (nodo *Computar métricas semana* + lectura *Leer runs
> descubrimiento*) los lleva a las columnas de `Métricas Global`, que alimentan las columnas-fórmula de costo
> Apify. **Los 3 `workflow.json` cambiaron → los valores aparecen recién tras re-importar** los tres
> workflows en n8n y correr un ciclo (motor + descubrimiento + archivado). Hasta entonces las columnas
> Apify quedan vacías (costo $0).

---

## Cómo lo usa el motor (n8n)

1. **Lee** (inicio de corrida): Proyectos activos + sus Referentes/Voz +
   `criterios_relevancia`, **y la tabla `Ajustes`** (nodo `Leer Ajustes`). Batch (1 page por tabla)
   para no gastar API calls. Los `criterios` y los `ajustes` viajan en el plan de corrida (nodo
   `Armar plan`); los criterios (manuales **+** `criterios_aprendidos`, ADR-022/M2) alimentan el gate
   de relevancia (Haiku, ADR-010) y los ajustes caen sobre los defaults de Config en `Heat-score v1`
   y `Gate de relevancia`.
2. **Transcribe y traduce** cada item que pasa el heat-score (Supadata transcribe; Claude detecta
   idioma y traduce al español solo si hace falta — literal, sin reescribir), pasa por el **gate de
   relevancia** (Haiku) que produce `relevancia_score`/`relevancia_razon`, y **escribe** los
   candidatos (estado `nuevo`, con `idioma`, `thumbnail` y la razón) en batch (10 records/call).
   El script vive como **texto** (sin Google Doc — ADR-009); el "link" es la URL del video original.
3. El motor también sube la **banda borderline de descartes del gate** a `Descartes del gate`
   (ADR-021) — como máximo ~10 por corrida, para que el equipo audite falsos negativos.
4. El equipo **califica** (`calificacion` + `estado`; `fecha_calificacion` se llena sola) y marca
   `veredicto` en los descartes expuestos. El **workflow de archivado** (cron semanal, domingo 6pm)
   lleva los calificados a Supabase (`outputs` con `calificado_en` + metadata, **incluida la
   relevancia** — ADR-021), hace **append al Sheet "Histórico"** (exportable a Excel), los
   **borra de Airtable** (así no se pasa de 1.000 registros), **computa las filas semanales de
   `Métricas Proyectos` + `Métricas Global`** (routea por `_tabla`) y **limpia `Descartes del gate`**. Además (ADR-022/M2, dos sub-cadenas fail-soft):
   **destila** los calificados de cada proyecto a `criterios_aprendidos` + `advertencia_criterios`
   (Haiku, prioriza los 🔥), y **actualiza la salud por referente** (`tasa_gate`/`tasa_aprobacion`/
   `videos_evaluados`). Ambos escritos nunca pisan lo que el equipo edita a mano.
5. Las selecciones acumuladas alimentan el heat-score de la próxima corrida → **el sistema aprende
   qué priorizar**, por **referente** (`v_senal_seleccion`). *(La señal por keyword/tema —
   `v_senal_tema`, ADR-012 — quedó **inerte** al removerse el eje keyword, ADR-019; la vista sigue en
   Supabase sin lectores. El few-shot por voz de ADR-008 queda en pausa — ADR-009.)*

## Reglas para no salir del plan free

- **Retención:** Candidatos calificados se archivan a Supabase y se limpian de Airtable. Proyectos,
  Voces y Referentes son chicos y permanentes (no crecen sin control). **Dos barridos del archivado
  cierran fugas lentas** (enmienda 2026-07-14, colgados de `Cerrar run`, fail-soft — no bloquean el
  cierre del run):
  - **Candidatos `nuevo` sin calificar > 20 días:** el archivado solo borraba los *decididos*; los
    `nuevo` que nadie calificó se apilaban en el feed. Se purgan a los 20 días (no van al histórico:
    nunca hubo decisión). Mantiene limpia la pestaña "Nuevos".
  - **`Métricas Proyectos` > 12 semanas (84 días):** crece ~7 filas/semana (la tabla monótona). Se
    capa a 12 semanas de historia *visible*; el histórico largo y canónico queda en Supabase
    (`runs.metricas` + `outputs`) y el Sheet, de donde es regenerable. `Métricas Global` **no se barre**
    (crece ~2 filas/semana: GLOBAL + DESCUBRIMIENTO; conviene guardar más trend de costos/salud). Subir el cap si el
    jefe quiere más trend en el cockpit.
- **Batching:** toda lectura/escritura de n8n agrupa registros (10/call). Con cadencia semanal
  (motor lunes + archivado domingo) y batching entra cómodo bajo 1.000 calls/mes. Con los dos
  barridos, ninguna tabla amenaza el tope de 1.000 registros.
- **Secreto:** el Personal Access Token (PAT) de Airtable vive en n8n + gestor de contraseñas,
  jamás en git. El validador escanea el patrón `pat...`.

## Setup por API (`setup-airtable.mjs`)

Airtable no tiene CLI de gestión, pero su **API de metadata** crea bases/tablas/campos. El script
arma esta base entera de un comando:

```bash
export AIRTABLE_PAT='pat...'              # PAT con scopes schema.bases:write, data.records:read/write
export AIRTABLE_WORKSPACE_ID='wsp...'     # del URL del workspace en airtable.com
node core/scripts/setup-airtable.mjs      # crea la base y devuelve el baseId
```

Devuelve el `baseId` (`app...`) → va a la credencial de Airtable en n8n, y siembra los defaults de
`Ajustes`. Alternativa sin compartir token: crear las 9 tablas a mano siguiendo esta misma
especificación.
