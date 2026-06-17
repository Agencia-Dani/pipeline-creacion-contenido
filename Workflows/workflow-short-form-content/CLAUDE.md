# CLAUDE.md — motor de reels

Guía para trabajar en este workflow. El estado de producto vive en [ROADMAP.md](../../ROADMAP.md),
el contrato en [workflow.yaml](./workflow.yaml), el uso en [README.md](./README.md), y el porqué en
[ADR-009](../../docs/adr/ADR-009-scripts-literales-y-aprendizaje-en-scoring.md) +
[ADR-010](../../docs/adr/ADR-010-scoring-semantico-y-etapa-calidad.md).

## Qué es

Un único workflow de **n8n** (`workflow.json`, 33 nodos, 2 entradas: cron semanal + Execute manual)
que es el **motor de reels** del MVP. Lee la config del equipo en **Airtable** (Proyectos, Voces,
Keywords, Referentes) → descubre reels IG + TikTok (Apify) → prescore métrico (`Heat-score v1`) →
transcribe (Supadata) → **traduce literal al español con Claude Haiku solo si no está en español** →
**gate de relevancia** (Haiku estricto contra `criterios_relevancia`, compone el `heat_score`) →
entrega **candidatos a Airtable** (estado `nuevo`) + registra la corrida en **Supabase**
(continue-on-fail). **El motor no usa ninguna credencial de Google.** Ver el flujo de 8 etapas y el
mapa de descubrimiento en el README.

El equipo de redes (Majo, Jero) **solo toca Airtable**: arma la búsqueda (Keywords + Referentes), ve
el mapa de calor (vista 🔥), y califica/selecciona scripts. El script es **texto** (sin Google Doc —
ADR-009); el "link" es la URL del video original.

> **Construido por builder Node, no a mano.** Para cambios estructurales: cargá el JSON, mutá
> `node.parameters.*` buscando por nombre (`w.nodes.find(n => n.name === '...')`), reescribí con
> `JSON.stringify(w, null, 2)` / `json.dump(..., ensure_ascii=False, indent=2)`. No edites a mano las
> expresiones grandes `={{ ... }}` ni los `jsCode`.

## Detalles que importan

- **Claude = Haiku traductor + jurado**, no escritor. `claude-haiku-4-5`, `anthropic-version:
  2023-06-01`, en **3 Code nodes** (`Pre-trim relevancia`, `Gate de relevancia`, `Traducir`) vía
  `this.helpers.httpRequest`. La key es el placeholder `<ANTHROPIC_API_KEY>` (3 ocurrencias). Antes de
  tocar la API de Anthropic, consultá el skill `claude-api`.
- **Apify por community node** `@apify/n8n-nodes-apify.apify` (op "Run actor and get dataset", sin tope
  de 5 min). NO `httpRequest` sync. Credencial `apifyApi`.
- **Orden de ejecución:** `Abrir run en el registro` va **en serie** entre `Config` y `Leer Proyectos`
  (no en paralelo), porque `Preparar outputs Supabase` lo referencia por nombre y n8n ejecuta las ramas
  en orden de conexión. Si lo ponés en paralelo, corre **después** del pipeline y la referencia rompe
  ("hasn't been executed").
- **Gates fail-open:** si Haiku/Supadata fallan, el item pasa (invariante #1). No conviertas un fallo
  externo en dependencia de ejecución.
- **`heat_score` es composite** (ADR-010): `peso_relevancia·score_haiku + (1-peso)·percentil(prescore
  métrico)`. El gate también guarda `relevancia_score`/`relevancia_razon` (se suben a Airtable). El
  substring de tema **no existe** (salió en el refactor de relevancia).
- **Passthrough de campos:** los Code nodes intermedios hacen `Object.assign({}, d, {...})` → un campo
  agregado en `Normalizar` (ej. `thumbnail_url`) sobrevive hasta `Armar candidato`, que **reconstruye**
  el objeto (ahí hay que listarlo explícito).
- **`pinData` debe quedar `{}`** (data fija mata el scrape real).

## Convención de placeholders

Lo que se completa al importar: API keys `<ANTHROPIC_API_KEY>` / `<SUPADATA_API_KEY>` (en los Code
nodes), e IDs `<<AIRTABLE_BASE_ID>>` / `<<SUPABASE_URL>>` / `<<INSTANCE_ID>>` (en el nodo `Config`).
Listarlos:

```sh
node -e "const s=require('fs').readFileSync('workflow.json','utf8');console.log([...new Set(s.match(/<<?[A-ZÁÉÍÓÚÑ][^>]*>>?/g))].sort().join('\n'))"
```

## Validar

`cd core/scripts && npm run validate` (contrato del manifest + escaneo de secretos). No hay build ni
tests: el motor corre **en n8n**, se valida por **re-import + Execute**. Tras editar, confirmá que el
JSON parsea, `w.connections` sigue con keys, y los `jsCode` parsean (`new Function(...)`).

## Git

Commits en español, concisos, directo a `main`.
