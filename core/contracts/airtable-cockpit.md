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

## Las 5 tablas

### 1. `Proyectos` — la unidad de búsqueda (qué se busca)
Una temática aislada (los resultados no se cruzan entre proyectos). Ej: Comunicación, Ventas, Liderazgo.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Comunicación", "Ventas"… |
| `descripcion` | texto largo | qué cubre el proyecto |
| `voz_default` | link → `Voces` | con qué voz se generan sus guiones |
| `min_likes` / `min_views` | número | pisos *blandos* del heat-score (no cortan, ponderan) |
| `dias_recencia` | número | ventana de fetch (backfill=180, diario=1–2) |
| `top_n` | número | cuántos candidatos genera por corrida |
| `activo` | checkbox | si entra en las corridas |

### 2. `Voces` — el eje organizativo (para quién se selecciona)
Separado del proyecto a propósito. **Nota ADR-009:** el MVP no genera en voz (scripts literales),
así que los campos de generación (`few_shot`, `frase_credencial`, `cta`, `tratamiento`,
`registro`) quedan **en pausa** — no se borran: son la costura de la evolución "guiones en voz
propia". Hoy la voz organiza la selección ("5 videos para tal voz") y el histórico.

| Campo | Tipo | Para qué |
|---|---|---|
| `nombre` | texto (primario) | "Cora", "Alma", "30X institucional"… |
| `descripcion` | texto largo | quién es / autoridad |
| `frase_credencial` | texto | la frase de apertura |
| `few_shot` | texto largo | 2–4 guiones reales que anclan la voz (se enriquece con los aprobados) |
| `tratamiento` | single select | tú / usted |
| `registro` | single select | coloquial / formal |
| `cta` | texto | el CTA fijo |
| `pais_acento` | texto | "Colombia"… |

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
| `link_doc` | url | el Google Doc del script (lo crea el motor) |
| `proyecto` | link → `Proyectos` | |
| `voz` | link → `Voces` | para qué voz se selecciona |
| `referente` | texto | handle del video fuente |
| `url_referente` | url | link al video original |
| `views` / `likes` / `seguidores` / `engagement` | número | métricas del fuente |
| `heat_score` | número | el ranking caliente→frío (lo calcula el motor; pondera idioma y señal de selección) |
| `viral_por_tamano` | checkbox | el fuente venía de cuenta >700K |
| `categoria` | single select | tipo de contenido |
| **`calificacion`** | single select | 🔥 / 👍 / 👎 — **lo pone el equipo** |
| **`estado`** | single select | nuevo / aprobado / descartado / publicado |
| `fecha_calificacion` | last modified time (solo del campo `calificacion`) | **cuándo** se calificó — alimenta el tracking de selecciones |
| `notas_equipo` | texto largo | feedback del equipo |
| `fecha` | dateTime | cuándo se generó |

**Vista "🔥 Seleccionados" (el re-rank que pidió el jefe):** una vista de esta misma tabla con
filtro `estado = aprobado` + orden `heat_score` descendente — el mapa de calor "se rehace" solo
con lo elegido, sin código. Se crea a mano al armar la base (las vistas no salen por API).

---

## Cómo lo usa el motor (n8n)

1. **Lee** (inicio de corrida): Proyectos activos + sus Keywords/Referentes/Voz/filtros. Batch
   (1 page por tabla) para no gastar API calls.
2. **Transcribe y traduce** cada item que pasa el heat-score (Supadata transcribe; Claude detecta
   idioma y traduce al español solo si hace falta — literal, sin reescribir), **crea el Google
   Doc** del script, y **escribe** los candidatos (estado `nuevo`, con `idioma` y `link_doc`)
   en batch (10 records/call).
3. El equipo **califica** (`calificacion` + `estado`; `fecha_calificacion` se llena sola). El
   **workflow de archivado** (cron diario) lleva los calificados a Supabase (`outputs` con
   `calificado_en` + metadata), hace **append al Sheet "Histórico"** (exportable a Excel) y los
   **borra de Airtable** → así no se pasa de 1.000 registros.
4. Las selecciones acumuladas (`v_senal_seleccion`: tasa de selección por referente/idioma)
   alimentan el heat-score de la próxima corrida → **el sistema aprende qué priorizar**.
   *(El few-shot por voz de ADR-008 queda en pausa — ADR-009.)*

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

Devuelve el `baseId` (`app...`) → va a la credencial de Airtable en n8n. Alternativa sin compartir
token: crear las 5 tablas a mano siguiendo esta misma especificación.
