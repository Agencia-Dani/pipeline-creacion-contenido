# CLAUDE.md

Guía para trabajar en este repo. El estado real y los contratos viven en
[ROADMAP.md](../../ROADMAP.md) + [workflow.yaml](./workflow.yaml). **El [README.md](./README.md)
todavía describe el template VIEJO (en voz → Sheets) y está pendiente de reescribir.**

## Qué es (post-rework B3 — ADR-009, 2026-06-14)

Un único workflow de **n8n** (`workflow.json`) con dos entradas — cron semanal + Execute manual —
que es el **motor de reels** del MVP: lee la config del equipo en **Airtable** (Proyectos, Voces,
Keywords, Referentes) → scrapea Reels IG + TikTok (Apify) → normaliza y une → ordena con el
**heat-score v1** (percentil de views/likes/eng × boosts de tema/idioma/selección) → **dedup**
contra `processed_items` (Supabase) → top_n por proyecto → transcribe (Supadata) → **traduce
literal al español con Claude Haiku SOLO si el original no está en español** (si ya está en
español, el script es la transcripción tal cual) → entrega **candidatos a Airtable** (tabla
Candidatos, estado `nuevo`) + registra la corrida en **Supabase** (sumidero, continue-on-fail).
**El motor no usa ninguna credencial de Google.**

El equipo de redes (Majo, Jero) **solo toca Airtable**: arma la búsqueda (input), ve el mapa de
calor (vista 🔥), califica/selecciona scripts. El script se guarda como **campo de texto** (sin
Google Doc — ver ADR-009 nota 2026-06-14); el "link" es la URL del video original.

> **Construido por script, no a mano.** El rework se generó con un builder Node que carga el JSON,
> arma nodos por nombre y reescribe con `JSON.stringify`. Para cambios estructurales seguí ese
> patrón (no edites a mano las expresiones grandes `={{ ... }}`).

Único cliente/voz por copia sigue siendo el modelo; la multi-instancia real es F5.

## Archivos

- `workflow.json` — el workflow de n8n, importable (`Workflows → Import from File`). Único entregable real.
- `README.md` — uso + checklist de los placeholders.
- `CLAUDE.md` — este archivo.

No hay build, tests ni dependencias: es JSON de configuración.

## Convención de placeholders

Todo lo que un cliente debe completar está marcado `<<NOMBRE_EN_MAYUSCULAS>>`. Para listarlos:

```sh
node -e "const s=require('fs').readFileSync('workflow.json','utf8');console.log([...new Set(s.match(/<<[A-ZÁÉÍÓÚÑ][^>]*>>/g))].sort().join('\n'))"
```

(El regex exige mayúscula inicial porque el código del nodo *Parámetros de corrida* contiene el
literal `'<<'` — con `<<[^>]+>>` a secas salen falsos positivos.)

Las **categorías** (`<<CATEGORIA_1>>`…`<<CATEGORIA_5>>`) aparecen en DOS nodos y deben coincidir: el prompt de Claude (*Claude — Agente escritor voz cliente*) y el parser (*Parsear respuesta Claude → columnas Sheet*, `const CATS`).

## Cómo editar el workflow

El archivo es JSON de n8n válido. **No edites a mano la string gigante del nodo de Claude** (el `jsonBody` es una expresión n8n `={{ {...} }}` con JS y escapes anidados). Para cambios no triviales, cargá el JSON en Node, mutá `node.parameters.*` por nombre de nodo, y reescribilo con `JSON.stringify(w, null, 2)`. Buscá nodos con `w.nodes.find(n => n.name === '...')`.

Después de editar, validá:
1. Que el JSON parsea y `w.connections` sigue con keys.
2. Que la expresión del nodo Claude evalúa como JS: extraé el interior de `={{ … }}` y corré `new Function('$json','return ('+inner+')')(stub)`.

## Detalles que importan

- **Modelo Claude:** `claude-sonnet-4-6` (en el `jsonBody` del nodo Claude). Para más calidad a más costo: `claude-opus-4-8`. Antes de tocar nada de la API de Anthropic, consultá el skill `claude-api`.
- **Prompt caching:** el `system` del nodo Claude es un array con `cache_control` (ephemeral). El bloque de voz/few-shot es idéntico en los 25 ítems → se cachea. El TTL de 5 min se sostiene porque los `Wait` de 13s entre ítems son << 5 min. No metas nada variable (timestamps, IDs) en el `system` o se rompe el caché.
- **`pinData` debe quedar vacío** (`{}`). Tenía 1.8 MB de data de prueba del cliente original; reintroducir pins hace que los nodos devuelvan data fija en vez de scrapear.
- **Loop + Wait:** el `Loop Over Items` procesa de a uno con `Wait` de 13s para respetar rate limits de Claude. Si subís el volumen, ajustá ahí.
- **Columnas del Sheet:** el parser escribe encabezados exactos (ver README). La pestaña destino debe tenerlos igual.
- **Credenciales:** API keys de Apify/Anthropic/Supadata son placeholders (`<APIFY_TOKEN>`, etc.) en las URLs/headers; Google Sheets y Gmail usan credenciales OAuth de n8n (a re-mapear al importar).

## Git

Repo personal; los commits van directo a `main`. Mensajes de commit en español, concisos.
