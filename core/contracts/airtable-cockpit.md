# Cockpit del equipo de redes — modelo de datos en Airtable (ADR-008)

> La superficie no-code donde el equipo de redes (Mamo, Jero) gestiona la búsqueda y **califica**
> los guiones. Airtable plan **free**: 1.000 registros/base · 1.000 API calls/mes · 5 editores.
> El motor (n8n) lee esta base cada corrida y le escribe los candidatos. Lo pesado (historial,
> dedup) vive en Supabase ([002_cockpit_y_dedup.sql](../schema/002_cockpit_y_dedup.sql)).
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

### 2. `Voces` — el eje de generación (cómo suena)
Separado del proyecto a propósito: una misma búsqueda puede generarse en varias voces.

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

### 5. `Candidatos` — los guiones a calificar (donde el equipo cura)
| Campo | Tipo | Para qué |
|---|---|---|
| `titulo` | texto (primario) | título/contexto del guion |
| `script` | texto largo | el guion generado |
| `proyecto` | link → `Proyectos` | |
| `voz` | link → `Voces` | con qué voz se escribió |
| `referente` | texto | handle del video fuente |
| `url_referente` | url | link al video original |
| `views` / `likes` / `seguidores` / `engagement` | número | métricas del fuente |
| `heat_score` | número | el ranking caliente→frío (lo calcula el motor) |
| `viral_por_tamano` | checkbox | el fuente venía de cuenta >700K |
| `categoria` | single select | tipo de guion |
| **`calificacion`** | single select | 🔥 / 👍 / 👎 — **lo pone el equipo** |
| **`estado`** | single select | nuevo / aprobado / descartado / publicado |
| `notas_equipo` | texto largo | feedback del equipo |
| `fecha` | dateTime | cuándo se generó |

---

## Cómo lo usa el motor (n8n)

1. **Lee** (inicio de corrida): Proyectos activos + sus Keywords/Referentes/Voz/filtros. Batch
   (1 page por tabla) para no gastar API calls.
2. **Escribe** los candidatos generados (estado `nuevo`) en batch (10 records/call).
3. El equipo **califica** (`calificacion` + `estado`). Una automatización/sync archiva los
   calificados a Supabase (`outputs`) y los **borra de Airtable** → así no se pasa de 1.000 registros.
4. Los `aprobado`/`publicado` forman el corpus (`v_corpus_aprobados`) que se inyecta como few-shot
   en la próxima generación de esa voz → **el sistema mejora**.

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
