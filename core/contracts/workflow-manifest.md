# Contrato de workflow — especificación del `workflow.yaml` (v1)

> **Qué es:** el manifest que TODO workflow debe tener en la raíz de su carpeta
> (`Workflows/workflow-<id>/workflow.yaml`). Describe el workflow **por fuera** — qué hace, qué
> necesita, qué produce, cómo se opera — sin importar la máquina por dentro (ADR-001).
> Lo verifica `core/scripts/validate.mjs`; lo que el validador no pueda verificar, se cumple
> por convención escrita acá.
>
> **Regla de oro:** si para describir tu workflow el contrato se queda corto, se discute y se
> versiona el contrato (con ADR) — no se inventa un campo ad-hoc.

---

## Ejemplo anotado (todos los campos)

```yaml
contract_version: 1               # versión de ESTE contrato que cumple el manifest

id: short-form-content            # slug estable, kebab-case. Es la key en el registro central.
                                  # La carpeta DEBE llamarse workflow-<id>. No se renombra jamás
                                  # (si hace falta, se retira el workflow y se crea otro).
name: "Detector de referentes virales → guiones short form"
description: >
  Una a tres líneas: qué hace de punta a punta, en lenguaje de negocio.
engine: n8n                       # n8n | openclaw | script
status: draft                     # draft | active | paused | inactive | retired
owner: mani                       # quién responde por este workflow

triggers:                         # cómo arranca una corrida (uno o varios)
  - type: cron                    # cron | form | webhook | conversation | manual
    schedule: "0 8 * * 1"         #   si type=cron: expresión cron…
    timezone: America/Bogota      #   …y timezone OBLIGATORIA (incidente real: ver master guía)

inputs:
  client_config: "clients/{cliente}/short-form-content.yaml"   # patrón de ruta de la config
  filters:                        # parámetros que aceptan las corridas / la config del cliente
    - key: min_likes              #   key en snake_case
      type: number                #   number | string | list | object | boolean
      scope: client               #   client = vive en la config del cliente
      default: 10000              #   run    = se pasa por corrida (formulario/dispatcher)
      desc: "Umbral de likes del filtro viral"
  credentials:                    # SOLO NOMBRES de credenciales (los valores viven en el motor)
    - apify_token
    - anthropic_api_key

stages:                           # mapeo a las 8 etapas canónicas (PLAN.md §2.4)
  colectar: "Apify — IG Reels + TikTok"          # texto: qué implementa la etapa
  normalizar: "Nodos 'Normalizar IG1/TT1' → content_item"
  filtrar_scorear: "Filtro viral top 25"
  enriquecer: "Supadata Whisper (transcripción)"
  generar: "Claude — perfil guion_reel, voz del cliente"
  calidad: n/a                                    # n/a si el workflow no implementa la etapa
  entregar: "Google Sheets"
  notificar: "Email resumen (Gmail)"

outputs:                          # qué produce cada corrida
  - type: guion_reel              # tipo del catálogo de outputs (borrador hasta validar c/ jefe)
    destination_native: google_sheets   # dónde cae para trabajarse
    registered: pending           # pending | yes — si ya reporta al registro central (F2/F3)

runbook:                          # cómo se opera (texto corto o link a doc)
  setup: "Ver HOSTING.md + checklist del README"
  start: "Activar el workflow en n8n"
  stop: "Desactivar el workflow en n8n"
  test: "Execute Workflow manual; verificar Sheet + registro"
  docs:
    - README.md

cost_per_run: "por medir en F2"   # estimado o 'por medir en <etapa>'
```

## Campos obligatorios vs opcionales

| Campo | Obligatorio | Verificado por el validador |
|---|---|---|
| `contract_version, id, name, description, engine, status, owner` | ✅ | presencia + enums + `id` == sufijo de la carpeta |
| `triggers` | ✅ (≥1) | tipo válido; si `cron` → `schedule` + `timezone` |
| `inputs.client_config` | ✅ | presencia |
| `inputs.filters` | ✅ (puede ser `[]`) | cada uno con `key/type/scope` válidos |
| `inputs.credentials` | ✅ (puede ser `[]`) | solo nombres snake_case — nunca valores |
| `stages` | ✅ | exactamente las 8 keys canónicas, sin vacíos (`n/a` permitido) |
| `outputs` | ✅ (≥1) | cada uno con `type` + `destination_native` |
| `runbook` | ✅ | presencia de `setup/start/stop/test` |
| `cost_per_run` | ✅ | presencia (vale "por medir en …") |

## Convenciones que este contrato fija

1. **Placeholders — convención única (unifica `<<...>>` y `{{LLAVES}}`):**
   - Las **claves de configuración** se llaman en `snake_case` y viven en
     `clients/<cliente>/<workflow-id>.yaml` (ver [clients/README.md](../../clients/README.md)).
   - Cuando una plantilla necesita interpolación, usa `{{snake_case_key}}`.
   - Los `<<PLACEHOLDERS>>` del JSON de n8n y las `{{LLAVES}}` del kit Substack **migran a este
     esquema cuando se configure el cliente real** (F2/F3): el repo guarda la plantilla con
     claves nuevas; el artefacto deployado lleva los valores ya resueltos.
2. **Secretos:** jamás en el repo. En manifests y configs solo *nombres* de credenciales.
   El validador escanea todo el repo versionado buscando patrones de keys reales.
3. **`scope` de los filtros** es la frontera config-vs-corrida: `client` = identidad estable del
   cliente (voz, cuentas, temas); `run` = lo que el jefe elige en el formulario para una búsqueda
   concreta. Mover un filtro de `client` a `run` es una decisión por workflow (F5 lo hace con
   los umbrales del workflow de reels).
4. **`id` y tipos de output son keys del registro central** — estables, en snake/kebab-case,
   nunca se renombran sin migración.

## Schemas de datos asociados

- [`schemas/content_item.schema.yaml`](./schemas/content_item.schema.yaml) — la "pieza encontrada"
  (interfaz entre COLECTAR/NORMALIZAR y el resto).
- [`schemas/output.schema.yaml`](./schemas/output.schema.yaml) — la "pieza producida"
  (interfaz con el registro central).

Ambos en **v0 borrador**: el catálogo definitivo de tipos y campos se cierra con la taxonomía
de outputs que se valide con el jefe (PLAN.md §3.2).

## Cómo correr el validador

```bash
cd core/scripts && npm install   # una sola vez (instala la lib yaml)
node core/scripts/validate.mjs   # desde cualquier directorio del repo
```

Verifica: manifests completos y consistentes (incl. carpeta == `workflow-<id>` y timezone
obligatoria en crons) · configs de `clients/` bien formadas y sin claves fuera de convención ·
**escaneo de secretos** en todos los archivos versionados (y los nuevos sin commitear).
Correrlo antes de cada commit que toque manifests, configs o `core/`.
