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

## Las 8 tablas

### 1. `Proyectos` — la unidad de búsqueda (qué se busca)
Una temática aislada (los resultados no se cruzan entre proyectos). Ej: Comunicación, Ventas, Liderazgo.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Comunicación", "Ventas"… |
| `descripcion` | texto largo | qué cubre el proyecto |
| `criterios_relevancia` | texto largo | **qué hace relevante a un video para este proyecto** — lo edita el equipo, lo lee el motor para juzgar relevancia (no solo virales). Ver ADR-010 + [refactor-relevancia](../../docs/agents/refactor-relevancia.md) |
| `voz_default` | link → `Voces` | la **única** voz del proyecto (un proyecto = una voz; una voz puede servir a varios proyectos). Afina el filtro de relevancia por encima del tema (ADR-010) |
| `activo` | checkbox | si entra en las corridas |

> **Cambio ADR-015/016:** `dias_recencia`, `top_n` y los 4 toggles de eje salieron del Proyecto. La
> ventana, el N por corrida y los resultados por referente son ahora **globales** (tabla `Ajustes`); la
> plataforma de búsqueda la da `Referente.plataforma` y el descubrimiento es solo por referente.

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

### 3. `Referentes` — banco de perfiles (**la única fuente de descubrimiento**, ADR-019)
| Campo | Tipo | Para qué |
|---|---|---|
| `handle` | texto (primario) | @cuenta |
| `plataforma` | single select | instagram / tiktok |
| `proyecto` | link → `Proyectos` | a qué proyecto alimenta |
| `activo` | checkbox | si se rastrea |
| `notas` | texto largo | por qué se agregó |

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
dashboard: `Candidatos por corrida` 100 (**N total por corrida**, contados como videos distintos; el
corte final va por heat compuesto tras el gate) · `Días de recencia` 7 (ventana única de fetch) ·
`Resultados por cuenta de referente` 20 (videos por cuenta de referente por corrida).

**Toggles de eje (ADR-017; el eje keyword se removió — ADR-019)** — también en la página Global:
`Buscar por referentes en Instagram` 1 · `Buscar por referentes en TikTok` 1 (1=on/0=off; default
ambos on).

**Knobs del descubrimiento de referentes (ADR-020)** — los lee el workflow de descubrimiento (no el
motor): `Propuestas por corrida` 10 (cap de propuestas semanales) · `Afinidad mínima de propuesta`
0.6 (umbral del vetting Haiku, 0-1).

**Topes de costo (dev-only, en Config — no editables por el equipo):** `cap_resultados_referente` 30
(techo de `Resultados por cuenta de referente`; el motor usa `min(valor_equipo, cap)`) · `cap_top_n`
100 (techo duro de transcripción por corrida; protege el backfill — es el gobernador de créditos real)
· `banda_descarte_min` 0.35 / `banda_descarte_max` 0.6 / `cap_descartes` 10 (la banda borderline de
descartes que se expone al equipo — ADR-021) · `presupuesto_transcribir_s` 780 (si el loop de
transcripción lo excede, el resto de la corrida sigue sin transcript en vez de morir por el watchdog
de n8n).
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

### 7. `Descartes del gate` — la banda borderline para auditar (ADR-021)
Videos que el gate de relevancia rechazó **después de transcribirlos**, con score en la banda
borderline (donde viven los errores del jurado). **No son Candidatos** (nunca esperaron
calificación). El motor sube como máximo ~10 por corrida (knobs dev-only `banda_descarte_min` 0.35 /
`banda_descarte_max` 0.6 / `cap_descartes` 10 en Config); el equipo los audita en 2 minutos y marca
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

### 8. `Métricas` — el desempeño semanal, solo-lectura (ADR-021)
**La escribe solo el archivado** (domingo, al cerrar la semana): una fila por (semana × proyecto)
con la calidad + una fila `GLOBAL` con la salud del motor. Es una **proyección derivada y
regenerable** — la verdad cruda vive en Supabase (`runs.metricas` + `outputs`). El equipo y el jefe
la ven en las páginas *Métricas — Calidad* y *Métricas — Salud* (solo-lectura, a propósito). La
"semana" es la **semana de calificación** (el ciclo que cierra el archivado), no la de entrega.

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | texto (primario) | `YYYY-MM-DD · <proyecto \| GLOBAL>` |
| `semana` | fecha | el domingo del cierre |
| `ambito` | texto | nombre del proyecto, o `GLOBAL` |
| `calificados` / `aprobados` / `descartados` | número | lo que el equipo decidió esa semana |
| `precision` | número (0-1) | **precisión de entrega** = aprobados / calificados (la métrica norte) |
| `score_aprobados` / `score_descartados` | número (0-1) | score medio del gate en cada grupo |
| `separacion_gate` | número | la resta de los dos: baja = los criterios del proyecto no discriminan |
| `entregados` / `colectados` / `pretrim` / `gate_pass` | número | el embudo de la semana (solo fila GLOBAL, suma de los runs del motor) |
| `sin_guion` / `descartes_expuestos` / `falsos_negativos` | número | salud del contenido (GLOBAL) |
| `runs_ok` / `runs_fallo` / `duracion_min` | número | salud del motor (GLOBAL) |
| `supadata_llamadas` / `haiku_lotes` / `haiku_traducciones` | número | **conteo de llamadas** por servicio (GLOBAL; el costo en $ queda como multiplicador futuro) |

---

## Cómo lo usa el motor (n8n)

1. **Lee** (inicio de corrida): Proyectos activos + sus Referentes/Voz +
   `criterios_relevancia`, **y la tabla `Ajustes`** (nodo `Leer Ajustes`). Batch (1 page por tabla)
   para no gastar API calls. Los `criterios` y los `ajustes` viajan en el plan de corrida (nodo
   `Armar plan`); los criterios alimentan el gate de relevancia (Haiku, ADR-010) y los ajustes caen
   sobre los defaults de Config en `Heat-score v1` y `Gate de relevancia`.
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
   **borra de Airtable** (así no se pasa de 1.000 registros), **computa la fila semanal de
   `Métricas`** y **limpia `Descartes del gate`**.
5. Las selecciones acumuladas alimentan el heat-score de la próxima corrida → **el sistema aprende
   qué priorizar**, por **referente** (`v_senal_seleccion`). *(La señal por keyword/tema —
   `v_senal_tema`, ADR-012 — quedó **inerte** al removerse el eje keyword, ADR-019; la vista sigue en
   Supabase sin lectores. El few-shot por voz de ADR-008 queda en pausa — ADR-009.)*

## Reglas para no salir del plan free

- **Retención:** Candidatos calificados se archivan a Supabase y se limpian de Airtable. Proyectos,
  Voces y Referentes son chicos y permanentes (no crecen sin control).
- **Batching:** toda lectura/escritura de n8n agrupa registros (10/call). Con cadencia semanal
  (motor lunes + archivado domingo) y batching entra cómodo bajo 1.000 calls/mes. `Métricas` crece
  ~6 filas/semana y `Descartes del gate` se limpia cada domingo: ninguna amenaza el tope de registros.
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
`Ajustes`. Alternativa sin compartir token: crear las 8 tablas a mano siguiendo esta misma
especificación.
