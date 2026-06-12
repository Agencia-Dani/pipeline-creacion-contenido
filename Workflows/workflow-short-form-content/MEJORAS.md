# MEJORAS — qué le falta al workflow base para los specs pedidos

> **Qué es este doc:** análisis del `workflow.json` actual (nodo por nodo, 2026-06-12) contra
> las dos necesidades prioritarias: **(1) búsqueda filtrable** (views, likes, suscriptores,
> reach, hashtags, tipo de contenido, temas — el "task de JSON") y **(2) dashboard con métricas
> visuales** para uso no-code. Cada brecha tiene su mejora concreta (M1–M6).
>
> Relación con el plan: esto **adelanta** los filtros de F5 y una vista tipo-F4 a escala de
> este workflow, porque la prioridad es montarlo por aparte. Las convenciones del sistema
> siguen aplicando (contrato, validador, sin secretos).

---

## 1. Cómo funciona el workflow base (lo que hay)

```
Cron lunes 8am
  ├─► Apify IG    (scrapea 3 CUENTAS fijas, 12 posts c/u)  ─► Normalizar IG1 ─┐
  └─► Apify TikTok(scrapea 3 HASHTAGS fijos, 60 videos c/u) ─► Normalizar TT1 ─┴─► Merge
                                                                                  │
                                                    Filtrar top 25 ◄──────────────┘
                                                    (umbrales fijos + temas fijos)
                                                                                  │
                                       Supadata transcribe ─► Claude escribe guion (voz cliente)
                                                                                  │
                                                  Parser ─► Google Sheets ─► Email resumen
```

**Datos que SÍ existen después de normalizar** (por cada video encontrado):
`plataforma · username · nombre · seguidores · bio · descripcion · likes · comentarios ·
reproducciones (views) · url · perfil_url · hashtags · duracion_video · tipo_post
(Image/Video/Sidecar) · engagement_rate · fecha_publicacion`

**Cómo filtra hoy** (nodo *Filtrar referentes virales — top 25*):
- Pasa si `likes ≥ 10.000` **o** `views ≥ 100.000` **o** `seguidores ≥ 500.000` (umbrales
  hardcodeados) **y** menciona un tema (substring sobre descripción+hashtags, 5 temas fijos).
- Score de ranking: `likes + views/10 + seguidores/1000` → top 25.

---

## 2. Specs pedidos vs estado actual

| Spec (task de JSON) | ¿El dato existe? | ¿Es filtrable hoy? | Mejora |
|---|---|---|---|
| **Views** | ✅ `reproducciones` | ⚠️ Umbral fijo 100k, no elegible | M1 |
| **Likes** | ✅ `likes` | ⚠️ Umbral fijo 10k, no elegible | M1 |
| **Suscriptores/seguidores** | ✅ `seguidores` | ⚠️ Umbral fijo 500k, no elegible | M1 |
| **Reach** | ❌ **los scrapers no lo dan** — reach es dato privado de la API de insights de cada cuenta. Proxy disponible: views + engagement_rate | — | ⭐ pregunta al jefe |
| **Hashtags** | ✅ `hashtags` | ⚠️ Solo como input de TikTok; no se puede filtrar lo colectado por hashtag específico | M1 |
| **Tipo de contenido** | ✅ `tipo_post` + `duracion_video` | ❌ El filtro no lo usa en absoluto | M1 |
| **Temas** | ✅ vía texto | ⚠️ 5 temas fijos; matching ingenuo (sensible a tildes, sin sinónimos) | M1 + M5 |
| **Recencia** ("contenido de los últimos N días") | ✅ `fecha_publicacion` | ❌ No hay filtro de fecha — entra cualquier post que el scraper devuelva | M1 |
| **Bajo demanda** ("lo que se necesita en el momento") | — | ❌ Solo cron semanal; no hay forma de pedir una búsqueda ya | M2 |
| **Dashboard visual no-code** | ⚠️ ver hallazgo H2 | ❌ No existe | M3 + M4 |

## 3. Hallazgos del diseccionado (cosas que no sabíamos)

- **H1 — Bug real: la plataforma se pierde.** El nodo de filtro escribe `plataforma: 'TikTok'`
  **hardcodeado para todos los items** — un reel de Instagram queda etiquetado TikTok de ahí en
  adelante. Cualquier métrica "por plataforma" del dashboard saldría mentirosa. *(Fix en M1.)*
- **H2 — Las métricas mueren antes del Sheet.** El parser calcula `_plataforma, _autor, _likes,
  _vistas, _score`… y el nodo de Google Sheets **no las mapea** (solo escribe 8 columnas). El
  dashboard de métricas hoy no tiene materia prima. *(Fix en M3.)*
- **H3 — El Sheet recibe menos columnas de las documentadas.** El README promete 12 columnas
  pero el mapeo `defineBelow` solo escribe 8: `STATUS`, `FECHA ULTIMA REVISIÓN`, `EDITOR` y
  `FECHA DE PUBLICACION DE REFERENTE` se calculan y se descartan. *(Fix en M3.)*
- **H4 — Fragilidad de encabezados.** La columna del Sheet es `"TITULO  (contexto)"` (dos
  espacios) y el parser produce `"TITULO (contexto)"` (uno) — hoy funciona porque el mapeo lo
  puentea, pero cualquier edición manual lo rompe en silencio. *(Se corrige de paso en M3.)*
- **H5 — Volúmenes de colecta fijos.** IG trae 12 posts/cuenta y TikTok 60/hashtag,
  hardcodeados en los nodos Apify — también deberían ser parámetros. *(M1.)*

---

## 4. Las mejoras (en orden de implementación)

### M1 — Filtro parametrizado (el corazón del "task de JSON") ✅ implementada 2026-06-12

Reescribir el nodo *Filtrar referentes virales — top 25* para leer un objeto `params` en vez de
constantes, con defaults desde la config del cliente
([clients/](../../clients/README.md), claves ya declaradas en [workflow.yaml](./workflow.yaml)):

```js
const p = $('Parámetros de corrida').first().json;   // nodo Set al inicio (M2 lo alimenta)
// p = { min_likes, min_views, min_seguidores, temas[], hashtags[], tipos_contenido[],
//       dias_recencia, top_n, plataformas[] }
```

Cambios de lógica:
- Umbrales y `top_n` desde `p` (defaults = los valores actuales).
- **Conservar `d.plataforma` real** (fix H1).
- Filtro por `hashtags` (intersección con los hashtags del item), por `tipo_contenido`
  (`tipo_post` + regla short-form: `is_video && duracion ≤ 90s`), por **recencia**
  (`fecha_publicacion ≥ hoy − dias_recencia`) y por `plataformas` (ig/tiktok/ambas).
- Matching de temas con normalización de tildes/case (fix parcial; M5 lo mejora).
- Los `resultsLimit` de los nodos Apify también leen de `p` (H5).

### M2 — Entrada bajo demanda (Form Trigger) ✅ implementada 2026-06-12

Agregar un **n8n Form Trigger** en paralelo al cron — n8n genera la página web del formulario
solo, cero código, ideal para no técnicos:

- Campos del formulario = los filtros de M1 (dropdowns y números con defaults visibles).
- Cron y formulario convergen en el nodo *Parámetros de corrida* (Set): el cron pasa los
  defaults del cliente; el formulario pasa lo elegido.
- El email resumen indica con qué filtros corrió (transparencia para quien pidió la búsqueda).

### M3 — Las métricas llegan al Sheet (materia prima del dashboard) ✅ implementada 2026-06-12

Ampliar parser + mapeo de Google Sheets con las columnas que hoy se calculan y se botan:

`PLATAFORMA · AUTOR · SEGUIDORES · LIKES · VISTAS · ENGAGEMENT · SCORE · HASHTAGS` — más las 4
documentadas que no se escriben (H3): `🗂️ STATUS · FECHA ULTIMA REVISIÓN · EDITOR · FECHA DE
PUBLICACION DE REFERENTE`. De paso unificar los encabezados con espacios exactos (H4) y
actualizar el README del workflow.

### M4 — Dashboard visual no-code (Looker Studio sobre el Sheet)

Con M3 hecho, el dashboard es **conectar, no construir** (gratis, sin infra, solo-lectura —
imposible de romper):

1. [lookerstudio.google.com](https://lookerstudio.google.com) → Crear → Fuente de datos →
   **Google Sheets** → la pestaña del workflow (misma cuenta Google que ya usa el Sheet).
2. Páginas sugeridas del reporte:
   - **Producción:** guiones generados por semana · por categoría · por plataforma (ya real
     gracias a H1-fix) · embudo de STATUS (HACER GUION → publicado).
   - **Referentes:** dispersión views vs likes · top 10 por score con link · distribución de
     seguidores · hashtags más frecuentes.
   - **Operación:** fecha de última corrida · guiones por corrida · días desde el último guion.
3. Compartir como solo-lectura con quien tenga acceso al workflow.

*Alineación con el plan:* esta es la vista por-workflow inmediata; cuando exista el registro
central (F2→F4), el dashboard central lee Supabase y este Looker se re-apunta o se retira.

### M5 — (Opcional, post-montaje) Temas con scoring semántico

El substring matching de temas es la parte más débil de la calidad del filtrado. Mejora barata:
un paso previo donde Claude (una sola llamada batch, ya hay credencial) clasifica los items
colectados contra los temas/tipos pedidos — mismo patrón de scoring editorial que ya usa el
workflow de Substack. Se decide después de ver outputs reales.

### M6 — (Cuando se monte el registro, F2) Nodos de ingesta

Los 3 nodos + Error Workflow de [ingesta-registro.md](../../core/contracts/ingesta-registro.md)
— `runs.params` guardará los filtros de cada corrida y `outputs.metadata` las métricas (que el
dashboard central también filtra).

---

## 5. Para cerrar con el jefe (⭐ entra en la conversación de F0)

1. **Reach no existe en la fuente** — los scrapers públicos no lo dan (es dato privado de cada
   cuenta). ¿Le sirve views + engagement rate como proxy, o reach es indispensable? (Si es
   indispensable, cambia la herramienta de colecta y el costo.)
2. Confirmar la lista final de filtros del formulario (M1/M2) y los defaults.
3. ¿Qué gráficos del dashboard (M4) le importan más? Enseñarle el borrador con datos de la
   primera corrida real y ajustar.

## Criterio de "hecho" de este paquete

- [ ] Una búsqueda lanzada desde el formulario con filtros propios produce guiones tailored y
      el email dice con qué filtros corrió (M1+M2).
- [ ] El Sheet tiene las columnas de métricas pobladas y los 4 campos perdidos de H3 (M3).
- [ ] El dashboard de Looker Studio muestra producción/referentes/operación y lo puede abrir
      alguien sin cuenta de n8n (M4).
- [ ] `node core/scripts/validate.mjs` en verde y manifest actualizado (filtros con
      `scope: run` los que pasaron al formulario).
