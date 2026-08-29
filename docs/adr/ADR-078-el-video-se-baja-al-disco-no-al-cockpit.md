# ADR-078 — El video se baja al disco, no al cockpit

- **Estado:** aceptada · **construida** — 2026-08-29 (con Mani). **No toca `core/`**, no tiene
  migración y no toca n8n. Extiende
  [ADR-072](./ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md) (la llave del video) y
  [ADR-073](./ADR-073-la-coleccion-es-una-bolsa-de-videos.md) (la colección es donde se paga el
  scrape, y es el punto de entrada de esto).

## Contexto

Pedido que salió del onboarding de Dani (2026-08-28) y que llegó **dos veces con motivos distintos**:

| Quién | Cómo lo dijo | Qué quería |
|---|---|---|
| Mani (nota de la reunión) | *"descargar videos por si lo desmontan (JP Vieira)"* | respaldo ante un takedown |
| Majo (WhatsApp 15:58, textual) | *"Revisar como poner la opción de descargar videos de gráficas en colección para editores"* | operativo: que el editor lo tenga |

**"Videos de gráficas" quedó sin interpretar durante un día y era la pieza que faltaba.** Aclarado
por Mani el 29/08: son los videos que, **además del script, tienen explicaciones visuales** (el
ejemplo que dio Majo son los de trading). Un guion así **no se sostiene solo con el texto**: si el
creador baja el post, el editor queda con un script sin fundamento.

O sea que los dos motivos eran **uno**, y ninguna de las dos frases lo decía entera. *El pedido
textual del cliente manda sobre la lista escrita de memoria — y a veces hace falta preguntar igual.*

**Lo que Majo hace hoy:** `savefrom.net` y `sssinstagram.com`, un video por vez, fuera de la
herramienta. Eso es lo que mide el trabajo manual que esto reemplaza.

### 📏 Lo que se midió contra prod (2026-08-29)

Tres medidas, y **cada una descarta un diseño**:

1. **`videoUrl` ya vuelve del actor que ya se paga.** `apify~instagram-scraper` lo devuelve al lado
   de los 9 campos que ADR-072 documentó; simplemente nadie lo había mirado. ⇒ **no hace falta un
   proveedor nuevo ni un `yt-dlp` en ningún lado.**
2. 🔴 **La firma vence en ~38 horas** (`oe=6A94F4CF` → 31/08 03:28 UTC). La miniatura dura ~5 días y
   por eso allá se cachea. ⇒ **no se puede guardar en `app.videos_meta`**: una columna con esa URL
   estaría muerta antes de la próxima corrida semanal. Se compra al bajar, cada vez. **Y por eso
   esto no necesita migración.**
3. **~33 MB por video** (32.981.910 bytes exactos, un reel de 93 s, `200` + ISO MP4 válido). ⇒ una
   colección de 57 son **~1,9 GB**: no hay ZIP en una función de Vercel, ni con memoria ni con los
   60 s de `maxDuration`.

Y una cuarta que corrige un supuesto: el CDN sirve los mp4 con
`cross-origin-resource-policy: **cross-origin**`, al revés que las imágenes (`same-origin`). El
proxy de video **no existe por la misma razón** que el de miniaturas.

## Decisión

**1. 🔴 El video se baja al disco de quien lo pide. El cockpit no lo guarda.**

La alternativa —copiarlo a Supabase Storage como hace `/api/miniatura`— es lo único que sería un
respaldo *del sistema*, y se descartó por costo: ~1,9 GB por colección de 57, con una decisión de
retención y de quién paga que nadie tomó.

**La consecuencia hay que decirla y está escrita en el código: esto NO protege un video que nadie
bajó.** Si Instagram lo tumba mañana y el archivo no está en el disco de un editor, se perdió igual.
Lo que cambia respecto de hoy no es esa propiedad —Majo ya guarda en su disco— sino los pasos: deja
de salir de la herramienta, de pegar links en una página de terceros y de bajarlos de a uno.

**2. La URL del mp4 se compra en el momento, y no se persiste nunca.** Lo decide la medida 2, no el
gusto. Un lote de N videos es **una sola corrida** del actor (el costo dominante es arrancarlo), con
el tope de 50 que ya usa el enriquecimiento; lo que pasa del tope **se dice**, no se recorta en
silencio.

**3. Se baja de a uno, sin ZIP.** Lo decide la medida 3. El modo selección ya existe
(`usarSeleccion`), así que "varios" es seleccionar varios y el browser encola las descargas. El
respiro de 400 ms entre clicks no es cosmético: sin él Chrome descarta todas menos la primera.

**4. Pasa por un proxy nuestro (`/api/video`), en streaming.**

No por CORP —los mp4 vienen `cross-origin`— sino porque **el atributo `download` de un `<a>` lo
ignora el browser cuando el href es de otro origen**: un link directo al CDN abriría el video en una
pestaña y el editor tendría que hacer "guardar como", que es el paso manual que esto viene a sacar.
Sirviéndolo desde nuestro origen, el `Content-Disposition` manda.

**Streaming y no `arrayBuffer`**: 33 MB materializados por request es lo que volvería esto un
problema de la función.

**5. El allowlist de SSRF sale de la route y pasa a `domain/cdn.ts`, con tests.**

Vivía adentro de `/api/miniatura`. Con dos routes usándolo, un control de seguridad duplicado es el
que alguien endurece en un lado y no en el otro. La lista **no cambió** al sumar los videos: el mp4
sale del mismo `.cdninstagram.com` que ya estaba permitido.

**6. 📸 Solo Instagram, y se dice.** El actor es `instagram-scraper`. TikTok es **2 de 424** videos
(medido en ADR-072), y lo que no se pudo traer se cuenta y se avisa, en vez de dejar tarjetas que no
responden.

## Alternativas descartadas

- **Copiar los mp4 a Storage (respaldo real).** Es el único diseño que cumple el motivo *"por si lo
  desmontan"* de verdad. Se descartó **por ahora** por el costo medido y porque necesita su propia
  decisión de retención. Si el equipo pide *"que el sistema los tenga"*, esto es un ADR nuevo, no un
  parche a éste: cambia quién paga y quién poda.
- **Guardar `video_url` en `app.videos_meta`.** Una columna que guarda un link muerto a las 38 h.
  Habría costado una migración y `core/` para empeorar la cosa.
- **ZIP del lote en el server.** No entra: ~1,9 GB contra 60 s y la memoria de la función.
- **Cola en Storage con job en segundo plano.** Es lo único que escala a una colección entera, pero
  pide infraestructura que el cockpit no tiene (cron/job propio) para un pedido que hoy es *"que el
  editor tenga el video del guion que está por grabar"*.
- **`fetch()` en el browser → blob → `<a download>`** (el patrón que ya usa la descarga del Word).
  No sirve: el CDN no manda `Access-Control-Allow-Origin`, así que el fetch cross-origin rebota.
- **Bajar desde el Feed, Transcribir e Históricos.** El punto de entrada es la colección, que es lo
  que Majo pidió y donde el editor ya trabaja. Sumar el botón a las otras tres pantallas es fácil el
  día que alguien lo pida; hacerlo antes son tres superficies que nadie verificó.

## Consecuencias

- **Un canario nuevo, y esta vez nace limpio:** `app.eventos` con `accion = 'colecciones.bajar_videos'`
  cuenta quién bajó, cuántos pidió y cuántos volvieron. La pregunta que contesta no es *"¿funciona?"*
  sino *"¿alguien que no lo construyó lo usó?"* — que es la que ADR-069/070 aprendió a hacer por las
  malas. **Cero es cero: acá no hay verificaciones propias contaminando la cuenta, porque probar esto
  no escribe eventos desde el server local.**
- **Cada descarga le paga a Apify** una corrida por lote, incluso de videos cuya metadata ya se
  compró. Es el precio de la medida 2 y no hay forma de evitarlo sin persistir un link que vence.
- **Si el post ya no está, la descarga falla — que es exactamente el caso que el pedido teme.** No es
  un bug del cockpit: es el recordatorio de que esto no es un respaldo. El aviso lo dice.
