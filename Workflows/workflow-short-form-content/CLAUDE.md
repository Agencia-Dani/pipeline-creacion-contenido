# CLAUDE.md

Guía para trabajar en este repo. Leé también el [README.md](./README.md) (uso y checklist de adaptación).

## Qué es

Un único workflow de **n8n** (`workflow.json`) con dos entradas — cron lunes 8 AM y un **Form
Trigger** de búsqueda bajo demanda — que convergen en el nodo *Parámetros de corrida* (defaults
del cliente; el form los sobreescribe por corrida):
scrapea Reels de IG + videos de TikTok (Apify) → normaliza y une → filtra top N virales según
los params (umbrales, temas, hashtags, tipo, recencia, plataformas) → transcribe
(Supadata/Whisper) → **Claude escribe un guion en la voz de un cliente** → Google Sheets
(guion + métricas del referente) → email resumen con los filtros usados (Gmail).

Es una **plantilla**: todo lo específico de un cliente está como placeholder `<<...>>`. Pensada para **un cliente/voz por workflow**.

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
