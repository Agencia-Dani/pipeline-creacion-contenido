# reelsdetector — plantilla para la agencia de Dani

Workflow de **n8n** que detecta automáticamente Reels de Instagram y videos de TikTok virales sobre los temas de un cliente, los transcribe, genera guiones con la **voz del cliente** usando Claude, los registra en Google Sheets y envía un resumen por email.

> **Archivo:** [`workflow.json`](./workflow.json) — importable directamente en n8n (`Workflows → Import from File`).

Este repo es una **plantilla**: todo lo específico de un cliente está marcado con placeholders `<<...>>` que hay que reemplazar antes de activar. Está pensado para **un solo cliente/voz** por workflow (para varios clientes, duplicá el workflow y completá los placeholders de cada uno).

---

## Qué hace

El workflow corre por **dos entradas** que convergen en el nodo *Parámetros de corrida*:

- **Cron — lunes 8:00 AM:** corrida semanal con los filtros default del cliente.
- **Formulario web (bajo demanda):** página que genera n8n (*Form — Búsqueda bajo demanda*), apta
  para no técnicos. Lo que se elige ahí sobreescribe los defaults **solo para esa corrida**:
  plataformas, mínimos de likes/views/seguidores, temas, hashtags, tipo de contenido, recencia
  y cuántos referentes devolver.

En cada corrida:

1. **Scrapea** Reels de Instagram y videos de TikTok vía Apify (volúmenes configurables).
2. **Normaliza** ambas fuentes a un formato común y las une.
3. **Filtra los referentes virales** (top N) según los parámetros de la corrida: umbrales de
   engagement, temas (matching insensible a tildes/mayúsculas), hashtags, tipo de contenido,
   recencia y plataforma.
4. **Transcribe** el audio de cada video con Supadata (Whisper).
5. **Genera un guion** con la voz del cliente usando **Claude** (`claude-sonnet-4-6`).
6. **Registra** los resultados en una hoja de Google Sheets — guion + métricas del referente
   (plataforma, autor, seguidores, likes, vistas, engagement, score, hashtags), materia prima
   del dashboard.
7. **Envía un email** de resumen que indica **con qué filtros corrió** y cuántos guiones quedaron.

---

## Arquitectura del flujo

```
Trigger — Lunes 8am (cron) ──────────┐
Form — Búsqueda bajo demanda (web) ──┴─► Parámetros de corrida (defaults cliente ⊕ form)
   ├─► Apify — Scrape IG Reels ─► Normalizar IG1 ─┐
   └─► Apify — Scrape TikTok   ─► Normalizar TT1 ─┴─► Merge IG + TikTok
                                                        │
                                          Filtrar referentes virales — top N
                                                        │
                                            Preparar para transcripción
                                                        ├─► Supadata Whisper — Transcribir audio ─┐
                                                        └─► Parsear transcripción Supadata ───────┴─► Merge — datos + transcripción
                                                                                                          │
                                                                                                   Loop Over Items
                                                                                                    ├─► Preservar datos referente
                                                                                                    │      └─► Claude — Agente escritor voz cliente
                                                                                                    │             └─► Parsear respuesta Claude → columnas Sheet
                                                                                                    │                    └─► Google Sheets
                                                                                                    │                           └─► Wait ─► (vuelve al Loop)
                                                                                                    └─► Resumen ejecución ─► Send a message (Gmail)
```

**21 nodos** en total. El `Loop Over Items` + `Wait` (13s) procesa los referentes de a uno para respetar rate limits de la API de Claude.

---

## Modernizaciones aplicadas (vs. la versión original)

- **Modelo Claude:** `claude-sonnet-4-20250514` (deprecado, se retira jun-2026) → **`claude-sonnet-4-6`**, el reemplazo moderno de Sonnet. Si querés máxima calidad de guion a más costo, cambialo por `claude-opus-4-8` en el nodo *Claude — Agente escritor voz cliente*.
- **Prompt caching:** el system prompt (voz + few-shot) es idéntico en los 25 ítems de cada corrida, así que ahora va en un bloque con `cache_control` (ephemeral). Se cachea en el ítem 1 y se reusa en los 24 siguientes → **~90% menos tokens de entrada** del ítem 2 en adelante. El TTL de 5 min se mantiene caliente solo porque los `Wait` de 13s entre ítems están muy por debajo de 5 min.
- **`pinData` eliminado:** la versión original traía 1.8 MB de datos de prueba scrapeados del cliente anterior pegados a un nodo. Se eliminaron — el archivo pasó de ~1.9 MB a ~47 KB y el nodo de TikTok ahora scrapea de verdad en vez de devolver data fija.

---

## Criterio de "viral" (filtro top N, parametrizado)

El nodo *Filtrar referentes virales — top N* lee los parámetros de la corrida desde
*Parámetros de corrida* (defaults del cliente, sobreescribibles desde el formulario):

- **Umbrales (pasa con al menos uno):** `likes >= min_likes` (default 10.000), `reproducciones
  >= min_views` (default 100.000), `seguidores >= min_seguidores` (default 500.000).
- **Temas:** matching sobre descripción + hashtags, insensible a tildes y mayúsculas. Default:
  `<<TEMA_1..5>>` del cliente; en el formulario, `*` = sin filtro de tema.
- **Hashtags:** si se piden, el item debe tener al menos uno (intersección exacta).
- **Tipo de contenido:** `short` (video ≤ 90 s) · `video` · `imagen` — vacío = cualquiera.
- **Recencia:** `fecha_publicacion` dentro de los últimos `dias_recencia` días (0 = sin límite).
- **Plataformas:** instagram, tiktok o ambas. La plataforma real del item se conserva hasta el
  Sheet (columna `PLATAFORMA`).

**Score de ranking:** `likes + (vistas / 10) + (seguidores / 1000)` — se ordena de mayor a menor
y se toman los `top_n` primeros (default 25).

---

## ✅ Checklist para adaptar a un cliente

Buscá cada placeholder `<<...>>` (un `Ctrl+F` en `workflow.json`, o en cada nodo dentro de n8n) y reemplazalo.

### Voz del cliente — nodo *Claude — Agente escritor voz cliente* (lo más importante)
| Placeholder | Qué poner |
|---|---|
| `<<NOMBRE_DEL_CLIENTE>>` | Nombre de la persona/marca cuya voz se imita |
| `<<DESCRIPCION_Y_CREDENCIALES_DEL_CLIENTE>>` | Quién es y por qué tiene autoridad (ej: "cofundador de X, inversionista…") |
| `<<PEGAR_AQUI_2_A_4_GUIONES_REALES_DEL_CLIENTE>>` | **2 a 4 guiones reales** del cliente, completos, en su voz. Son los few-shot que anclan la calidad — sin esto los resultados son genéricos |
| `<<FRASE_DE_CREDENCIAL_DEL_CLIENTE>>` | La frase de presentación que abre cada video |
| `<<TRATAMIENTO…>>`, `<<COLOQUIAL_O_FORMAL>>`, `<<PAIS_O_ACENTO>>` | Reglas de voz |
| `<<PALABRAS…>>`, `<<MULETILLAS_PERMITIDAS>>`, `<<CLICHES_A_EVITAR>>`, `<<CTA_DEL_CLIENTE>>` | Léxico, muletillas, clichés a evitar y CTA fijo |

### Categorías (deben coincidir en DOS nodos)
`<<CATEGORIA_1>>` … `<<CATEGORIA_5>>` aparecen en el prompt de Claude **y** en *Parsear respuesta Claude → columnas Sheet* (`const CATS`). Usá los mismos 5 valores en ambos lugares.

### Fuentes a monitorear
| Placeholder | Nodo |
|---|---|
| `<<CUENTA_REFERENTE_IG_1..3>>` | *Apify — Scrape IG Reels* (agregá las que necesites) |
| `<<HASHTAG_1..3>>` | *Apify — Scrape TikTok* |
| `<<TEMA_1..5>>` | *Parámetros de corrida* |

### Filtro y volúmenes (defaults del cliente — nodo *Parámetros de corrida*)
| Placeholder | Qué poner |
|---|---|
| `<<MIN_LIKES>>`, `<<MIN_VIEWS>>`, `<<MIN_SEGUIDORES>>` | Umbrales del filtro viral (ej: 10000, 100000, 500000) |
| `<<TOP_N>>` | Cuántos referentes pasan el filtro (ej: 25) |
| `<<DIAS_RECENCIA>>` | Solo contenido de los últimos N días (0 = sin límite) |
| `<<IG_RESULTS_LIMIT>>`, `<<TT_RESULTS_LIMIT>>` | Posts por cuenta de IG / videos por hashtag de TikTok (ej: 12 y 60) |

> Si un placeholder numérico queda sin reemplazar, el nodo usa el default de respaldo indicado
> arriba — el workflow no se rompe, pero reemplazalos igual para que la config del cliente mande.

### Destinos y datos
| Placeholder | Nodo |
|---|---|
| `<<GOOGLE_SHEET_ID>>`, `<<NOMBRE_DEL_SHEET>>`, `<<PESTAÑA_DEL_SHEET>>` | *Google Sheets* |
| `<<NOMBRE_DEL_EDITOR>>` | *Parsear respuesta Claude → columnas Sheet* |
| `<<EMAIL_DESTINATARIO>>`, `<<NOMBRE_AGENCIA>>` | *Send a message* (Gmail) y nombre del workflow |

---

## Columnas requeridas en el Google Sheet

La pestaña destino debe tener **exactamente** estos 20 encabezados (espacios simples, sin
espacios finales — los escribe el nodo *Parsear respuesta Claude → columnas Sheet*):

**Guion:** `TITULO (contexto)` · `🎯 ENLACE DE REFERENTE` · `FORMATO` · `DIFICULTAD` ·
`CATEGORIAS` · `SCRIPT` · `DURACION` · `FECHA DE PUBLICACION DE REFERENTE` · `🗂️ STATUS` ·
`FECHA ULTIMA REVISIÓN` · `EDITOR` · `COMENTARIOS`

**Métricas del referente (para el dashboard):** `PLATAFORMA` · `AUTOR` · `SEGUIDORES` ·
`LIKES` · `VISTAS` · `ENGAGEMENT` · `SCORE` · `HASHTAGS`

> `ENGAGEMENT` es numérico (porcentaje sin símbolo, ej: `2.1`). `SCORE` es el ranking del
> filtro viral. Estas 8 columnas alimentan el dashboard de Looker Studio (M4 de MEJORAS.md).

---

## Requisitos (credenciales)

| Servicio | Uso | Credencial |
|---|---|---|
| [Apify](https://apify.com) | Scraping de IG (`apify/instagram-scraper`) y TikTok (`clockworks/free-tiktok-scraper`) | API token (placeholder `<APIFY_TOKEN>` en las URLs de los nodos Apify) |
| [Anthropic](https://www.anthropic.com) | Generación de guiones con Claude | API key (placeholder `<ANTHROPIC_API_KEY>`) |
| [Supadata](https://supadata.ai) | Transcripción de audio (Whisper) | API key (placeholder `<SUPADATA_API_KEY>`) |
| Google Sheets | Almacenamiento de resultados | Credencial OAuth de n8n (`<<CREDENCIAL_GOOGLE_SHEETS>>`) |
| Gmail | Envío del email resumen | Credencial OAuth de n8n (`<<CREDENCIAL_GMAIL>>`) |

> **Recomendación:** en lugar de incrustar las API keys en el JSON, creálas como **Credentials** dentro de n8n y referencialas en cada nodo HTTP. Así no quedan expuestas en el archivo del workflow. Al importar, n8n te pedirá re-mapear las credenciales de Google Sheets y Gmail a las de tu cuenta.

---

## Uso

1. Importá `workflow.json` en n8n.
2. Configurá las credenciales (Apify, Anthropic, Supadata, Google, Gmail).
3. Reemplazá **todos** los placeholders `<<...>>` siguiendo el checklist de arriba.
4. Asegurate de que el Google Sheet tenga las 20 columnas requeridas.
5. Activá el workflow — corre cada lunes 8 AM, o usá **Execute Workflow** para una corrida manual de prueba.
6. **Búsqueda bajo demanda:** al activar, n8n publica la URL del formulario (nodo *Form —
   Búsqueda bajo demanda* → Production URL). Compartila con quien pueda pedir búsquedas: campos
   vacíos usan los defaults del cliente, y el email de resumen dice con qué filtros corrió.
