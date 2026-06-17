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

## Las 6 tablas

### 1. `Proyectos` — la unidad de búsqueda (qué se busca)
Una temática aislada (los resultados no se cruzan entre proyectos). Ej: Comunicación, Ventas, Liderazgo.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Comunicación", "Ventas"… |
| `descripcion` | texto largo | qué cubre el proyecto |
| `criterios_relevancia` | texto largo | **qué hace relevante a un video para este proyecto** — lo edita el equipo, lo lee el motor para juzgar relevancia (no solo virales). Ver ADR-010 + [refactor-relevancia](../../docs/agents/refactor-relevancia.md) |
| `voz_default` | link → `Voces` | con qué voz se generan sus guiones |
| `dias_recencia` | número | ventana de fetch (backfill=180, diario=1–2) |
| `top_n` | número | cuántos candidatos genera por corrida |
| `activo` | checkbox | si entra en las corridas |
| `Buscar en Instagram por cuentas` / `Buscar en Instagram por palabras clave` / `Buscar en TikTok por palabras clave` / `Buscar en TikTok por cuentas` | checkbox | **ejes de descubrimiento** del proyecto. Si **ninguno** está marcado → corren los 4 (default retrocompatible); marcá solo los que quieras para acotar. Evita gastar Apify en ejes vacíos |

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

### 3. `Keywords` — banco de palabras clave (acumula)
| Campo | Tipo | Para qué |
|---|---|---|
| `termino` | texto (primario) | la palabra/frase de búsqueda |
| `proyecto` | link → `Proyectos` | a qué proyecto pertenece |
| `activo` | checkbox | si se usa en la búsqueda |

### 4. `Referentes` — banco de perfiles (la fuente propia)
| Campo | Tipo | Para qué |
|---|---|---|
| `handle` | texto (primario) | @cuenta |
| `plataforma` | single select | instagram / tiktok |
| `proyecto` | link → `Proyectos` | a qué proyecto alimenta |
| `seguidores` | número | lo llena el motor al verlo |
| `flag_viral` | checkbox | true si seguidores > ~700K (lo marca el motor / una automatización de Airtable) — **marca, no excluye** |
| `activo` | checkbox | si se rastrea |
| `notas` | texto largo | por qué se agregó |

### 5. `Candidatos` — los scripts a calificar (donde el equipo cura)
| Campo | Tipo | Para qué |
|---|---|---|
| `titulo` | texto (primario) | título/contexto del video fuente |
| `script` | texto largo | **la transcripción del video, en español** (traducida si el original no lo está — literal, ADR-009) |
| `idioma` | single select | idioma del original: es / en / pt / it / fr / otro |
| `thumbnail` | attachment | portada del video (la llena el motor con la `coverUrl` de Apify) — el equipo escanea sin clickear afuera |
| `proyecto` | link → `Proyectos` | |
| `voz` | link → `Voces` | para qué voz se selecciona |
| `referente` | texto | handle del video fuente (lo llena el motor: el `username` del poster) |
| `tema` | texto | el **keyword/hashtag** que matcheó el candidato (vacío si entró por referente) — alimenta la señal de aprendizaje por tema (ADR-012); lo llena el motor |
| `url_referente` | url | link al video original |
| `views` / `likes` / `seguidores` / `engagement` | número | métricas del fuente |
| `heat_score` | número | el ranking compuesto (relevancia ⊕ métricas — ADR-010); caliente→frío |
| `relevancia_score` | número (0-1) | el juicio semántico **limpio** del gate Haiku, separado del heat compuesto |
| `relevancia_razon` | texto largo | **por qué** el gate dejó pasar el video — ayuda al equipo a curar rápido |
| `viral_por_tamano` | checkbox | el fuente venía de cuenta >700K |
| **`calificacion`** | single select | 🔥 / 👍 / 👎 — **lo pone el equipo** |
| **`estado`** | single select | nuevo / aprobado / descartado / publicado |
| `fecha_calificacion` | last modified time (solo del campo `calificacion`) | **cuándo** se calificó — alimenta el tracking de selecciones |
| `notas_equipo` | texto largo | feedback del equipo |
| `fecha` | created time | cuándo llegó el candidato (campo nativo de Airtable, manual: la API no crea computados) |

**Vista "🔥 Seleccionados" (el re-rank que pidió el jefe):** una vista de esta misma tabla con
filtro `estado = aprobado` + orden `heat_score` descendente — el mapa de calor "se rehace" solo
con lo elegido, sin código. Se crea a mano al armar la base (las vistas no salen por API).

### 6. `Ajustes` — los knobs del scoring (clave→valor, ADR-011)
Donde el equipo afina cómo rankea el motor **sin tocar n8n**, en **español claro**. Una fila por knob;
el equipo edita el `valor`. El motor (`Armar plan`) **traduce cada `clave` amigable a su parámetro
interno** (mapa `AJUSTE_MAP`) y la aplica **sobre los defaults del nodo Config**: si la tabla está
vacía, un knob falta, o la `clave` no está en el mapa, usa el default. Lectura **fail-open**.

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | texto (primario) | el nombre del knob, en español (debe coincidir con `AJUSTE_MAP`) |
| `valor` | número (precisión 2) | el valor que sobrescribe el default |
| `descripcion` | texto largo | qué hace el knob (para el equipo) |

**Knobs (semilla por defecto):** `Peso de vistas` 0.4 · `Peso de likes` 0.4 · `Peso de interacción`
0.2 (pesos del prescore métrico) · `Peso de relevancia` 0.7 (IA vs. métricas en el orden final) ·
`Bonus idioma extranjero` 0.3 (premia no-español) · `Seguidores para marcar viral` 700000 (marca, no
filtra) · `Candidatos por proyecto` 25 (si el Proyecto no fija `top_n`) · `Mínimo de vistas` 0 /
`Mínimo de likes` 0 (**piso duro** pre-`top_n`; 0 = nada corta) · `Resultados Instagram por corrida` 8
/ `Resultados TikTok por corrida` 30 (**volumen/costo** por llamada Apify) · `Relevancia mínima` 0
(**umbral** del gate; 0 = nada corta). En Config quedan solo los **IDs**
(`airtable_base_id`/`supabase_url`/`instance_id`, dev-only). Detección de idioma: dev-only.

---

## Cómo lo usa el motor (n8n)

1. **Lee** (inicio de corrida): Proyectos activos + sus Keywords/Referentes/Voz/filtros +
   `criterios_relevancia`, **y la tabla `Ajustes`** (nodo `Leer Ajustes`). Batch (1 page por tabla)
   para no gastar API calls. Los `criterios` y los `ajustes` viajan en el plan de corrida (nodo
   `Armar plan`); los criterios alimentan el gate de relevancia (Haiku, ADR-010) y los ajustes caen
   sobre los defaults de Config en `Heat-score v1` y `Gate de relevancia`.
2. **Transcribe y traduce** cada item que pasa el heat-score (Supadata transcribe; Claude detecta
   idioma y traduce al español solo si hace falta — literal, sin reescribir), pasa por el **gate de
   relevancia** (Haiku) que produce `relevancia_score`/`relevancia_razon`, y **escribe** los
   candidatos (estado `nuevo`, con `idioma`, `thumbnail` y la razón) en batch (10 records/call).
   El script vive como **texto** (sin Google Doc — ADR-009); el "link" es la URL del video original.
3. El equipo **califica** (`calificacion` + `estado`; `fecha_calificacion` se llena sola). El
   **workflow de archivado** (cron diario) lleva los calificados a Supabase (`outputs` con
   `calificado_en` + metadata), hace **append al Sheet "Histórico"** (exportable a Excel) y los
   **borra de Airtable** → así no se pasa de 1.000 registros.
4. Las selecciones acumuladas alimentan el heat-score de la próxima corrida → **el sistema aprende
   qué priorizar**, en **dos ejes** (ADR-012): por **referente** (`v_senal_seleccion`) y por
   **keyword/tema** (`v_senal_tema`, vía `Candidatos.tema`). *(El few-shot por voz de ADR-008 queda en
   pausa — ADR-009.)*

## Reglas para no salir del plan free

- **Retención:** Candidatos calificados se archivan a Supabase y se limpian de Airtable. Proyectos,
  Voces, Keywords y Referentes son chicos y permanentes (no crecen sin control).
- **Batching:** toda lectura/escritura de n8n agrupa registros (10/call). Un cron diario con
  batching entra cómodo bajo 1.000 calls/mes.
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
`Ajustes`. Alternativa sin compartir token: crear las 6 tablas a mano siguiendo esta misma
especificación.
