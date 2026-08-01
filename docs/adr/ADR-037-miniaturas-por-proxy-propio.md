# ADR-037 — Las miniaturas se sirven desde nuestro origen: proxy propio + copia en Supabase Storage

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Cierra el **hallazgo 2 de D7**
  ("medir cuánto viven las URLs de miniatura"), y lo cierra con un diagnóstico distinto del que la
  hipótesis esperaba.

- **Contexto:** hasta D7 las miniaturas las **re-hosteaba Airtable**: el motor le mandaba la URL del
  CDN, Airtable descargaba la imagen y servía una copia propia. Al cortar Airtable
  ([ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md)), `candidatos.thumbnail_url` pasó a
  guardar **la URL cruda del CDN de Instagram/TikTok** y la tarjeta la puso directo en un `<img>`.

  El resultado en la primera versión live fue que **ningún** video mostraba miniatura. La hipótesis
  registrada en el handoff era el vencimiento de la URL firmada. Medido contra prod el 2026-08-01,
  la causa resultó ser otra y más dura:

  > `curl -I` sobre las dos URLs vivas devuelve **`200 OK`** y **`cross-origin-resource-policy:
  > same-origin`** (los dos hosts: `scontent-*.cdninstagram.com` y `*.fna.fbcdn.net`).

  O sea: la imagen está ahí y el servidor la entrega, pero **el browser la bloquea** por CORP al
  embeberla desde otro origen. `curl` no aplica CORP; un `<img>` sí. Es un anti-hotlinking
  deliberado de Meta, no un problema de frescura: **un `<img>` directo al CDN no va a funcionar
  nunca**, con la URL recién scrapeada o vencida.

  El vencimiento existe igual y es el segundo problema: `oe=6A7407DD` sobre un scrape del 2026-08-01
  vence el **2026-08-06**, o sea **~5 días, menos que la cadencia semanal**. Un proxy que solo pasa
  bytes arregla el bloqueo pero deja la imagen muriendo antes de la corrida siguiente.

- **Decisión:** las miniaturas se sirven **desde nuestro propio origen**, por
  `GET /api/miniatura?u=<url>` (`apps/dashboard/app/api/miniatura/route.ts`), que hace tres cosas:
  1. **Valida el host contra una allowlist por sufijo** (`.cdninstagram.com`, `.fbcdn.net`,
     `.tiktokcdn.com`, `.tiktokcdn-us.com`) y exige `https`. **No es cosmético: es lo que impide que
     el endpoint sea un SSRF.** Sin eso, `?u=http://169.254.169.254/…` lo pediría el servidor.
  2. **Cachea en Supabase Storage** (bucket `miniaturas`, público) la primera vez que alguien mira
     una imagen. La clave es `sha256(pathname) + .jpg` — del **pathname**, no de la URL entera,
     porque el path trae el id estable del asset y la query es la firma: hasheando la URL completa,
     cada re-scrape guardaría otra copia de la misma imagen.
  3. **En los siguientes pedidos redirige a Storage** (302) en vez de pasar bytes, así la carga no
     vuelve a ejecutar la función.

  La auth la aporta `proxy.ts` (solo `/api/engine` es ruta pública), así que sin sesión la ruta
  devuelve 307 a `/login` y la tarjeta cae a su placeholder.

- **Consecuencias:**
  - **A favor:** las miniaturas se ven, y una vez copiadas **dejan de depender del CDN de nadie** —
    ni de la firma, ni del expiry, ni de que Meta cambie su política de hotlinking. Verificado en
    prod: 200 `image/jpeg` 1080×1920, redirigiendo a Storage; 307 sin sesión; 400 al host fuera de
    la allowlist.
  - **A favor:** no toca n8n. La alternativa "que el motor suba la imagen al escribir el candidato"
    era más limpia de datos pero costaba un re-import (o sea una corrida pagada) y ponía la
    descarga de imágenes adentro del camino crítico del motor.
  - **En contra:** una imagen que **nadie mire en 5 días** se pierde igual, porque el cacheo es
    perezoso (se dispara al verla). Es aceptable: si nadie la miró, nadie la necesitaba — y el feed
    se recorre entero cada semana.
  - **En contra:** cada miniatura no cacheada es una invocación de función en Vercel. Con ~150
    candidatos por semana es despreciable, y solo pasa la primera vez.
  - `app.descartes` ya no es la única cosa que crece sin poda: **el bucket `miniaturas` tampoco se
    barre**. ~150 imágenes/semana × ~120 KB ≈ 18 MB/semana. Si algún día molesta, se poda por
    antigüedad contra `outputs`; hoy no vale el código.
  - **Los 145 candidatos arrastrados de Airtable siguen sin miniatura**, y está bien: eran adjuntos
    que murieron con el record, `thumbnail_url` es `null` y no hay nada que proxear.

- **Alternativas descartadas:**
  - **`referrerPolicy="no-referrer"` en el `<img>`.** Es el fix del anti-hotlinking *por Referer*.
    No sirve acá: CORP se evalúa por **origen del documento**, no por el header `Referer`, y no hay
    atributo del lado del cliente que lo desactive. Probado: el header viaja igual con y sin Referer.
  - **Proxy sin Storage** (solo pass-through con `Cache-Control` largo). Diez líneas menos, arregla
    el bloqueo, pero la imagen muere a los ~5 días en cuanto el CDN de Vercel evicte la respuesta —
    y el histórico de un candidato dura mucho más que eso.
  - **`next/image`.** El optimizador tampoco puede leer una URL firmada de un tercero, y además
    reintroduce el problema de la firma en el momento de la re-optimización.
  - **Sacar las miniaturas del feed.** Es la opción honesta si la imagen no aportara, pero la
    miniatura es lo que deja despachar los fáciles sin abrir la tarjeta: sin ella, calificar 147
    videos obliga a leer 147 títulos.
