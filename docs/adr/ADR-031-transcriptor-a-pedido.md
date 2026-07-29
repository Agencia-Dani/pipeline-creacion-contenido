# ADR-031 — Transcriptor a pedido: enlaces pegados a mano como segunda fuente, y la identidad que lo hace barato

- **Estado:** aceptada — 2026-07-28 (con Mani). Agrega una herramienta nueva al cockpit propio.
  Enmienda dos cosas ya decididas: el "Referente es la única fuente de descubrimiento" de
  [ADR-019](./ADR-019-remocion-total-eje-keyword.md), y el modelo de **tres** zonas de
  `docs/agents/plan-cockpit-propio.md` §2. No toca el motor.

- **Contexto:** el equipo de redes solo recibe videos que el motor encontró por Referente. Cuando les
  llega uno por afuera (un cliente, el jefe, un hallazgo propio), no tienen forma de sacarle el
  **script literal** sin que un dev lo corra a mano. Es el pedido que faltaba en la tabla vacía de
  `docs/onboarding-equipo-redes.md` §12.

  El requisito duro no es transcribir: eso ya lo sabe hacer el motor. Es que **un enlace pegado a
  mano entre al dedup**, para que el motor deje de recomendar algo que el equipo ya trabajó.

  Y ahí estaba el problema. El dedup del motor es `processed_items`, con clave
  `(platform, external_id)` (schema 002, blindada por
  [ADR-029](./ADR-029-dedup-blindado-fail-closed-y-feed.md)). Para Instagram, `Normalizar IG` arma
  ese `external_id` como `String(item.id || item.shortCode || ...)` — y el `item.id` de Apify es un
  **pk numérico de 19 dígitos que no aparece en la URL** que el equipo pega
  (`instagram.com/reel/DZkEokwy4jN/`). Parecía que había dos caminos, los dos caros: resolver el id
  numérico con una llamada extra a Apify por link, o tocar el dedup del motor para que compare
  también por URL — lo que obliga a un **re-import** de `workflow.json`, que es el eslabón débil
  histórico del repo.

- **El hallazgo:** el shortcode de Instagram **es** ese id numérico, escrito en base64 url-safe. No es
  una heurística: es cómo Instagram genera el shortcode. Verificado contra la base viva el 2026-07-28,
  con las **408 filas** que tenía `processed_items`:

  ```
  IG  shortcode -> external_id:  OK=381  MISMATCH=0
  TT  id de URL -> external_id:  OK=27   MISMATCH=0
  ```

  En TikTok el asunto es trivial: `Normalizar TT` usa `item.id`, que ya viaja crudo en la URL
  (`/video/<id>`).

- **Decisión:** cinco puntos.

  1. **La identidad se deriva de la URL, en el dominio.** `apps/dashboard/domain/enlace.ts` convierte
     un pegote de texto libre en `{ plataforma, external_id, url }`. Para IG, el shortcode se lee como
     base64 **con `BigInt`** — con `Number` los 19 dígitos se redondean y el dedup falla justo en los
     casos que importan. La URL se canoniza a la forma `/p/<shortcode>/`, que es la que graba el motor.

  2. **El dedup es un INSERT plano en `processed_items`.** Mismo upsert idempotente que hace el motor
     (`on_conflict=platform,external_id`, `ignoreDuplicates`). **Cero cambios en los `workflow.json`,
     cero re-import.** Esa es toda la ganancia del hallazgo.

  3. **Se marca solo si la transcripción salió bien.** Si Supadata no devuelve texto, el enlace queda
     fuera del dedup. Es sano porque se auto-corrige: si el motor lo trae después, el gate lo descarta
     duro por `sin_guion` ([ADR-030](./ADR-030-descarte-duro-sin-transcript.md)), así que no marcarlo
     casi no cuesta nada. Lo contrario —marcar al pegar— haría desaparecer para siempre un video que
     falló por un hipo de red.

  4. **Corre en la app, no en n8n.** Server Actions llaman Supadata y Haiku directo. Medido en esta
     sesión: Supadata responde en **0.8–1.7s** (el comentario de "~27s/video" del nodo quedó viejo), así
     que con pool de 8 una pasada de 45s cubre más links de los que el equipo va a pegar nunca. Y como
     cada enlace se marca apenas vuelve, una función cortada por timeout no pierde nada: la pasada
     siguiente agarra los pendientes. Eso vuelve **irrelevante** el techo de `maxDuration`, que era el
     único argumento a favor de n8n.

  5. **Es una cuarta zona, y lo que produce NO es un Candidato.** Un enlace pegado no pasó por el gate,
     no tiene heat-score, no consume la `N` de ningún proyecto y no es una dupla (video, proyecto). Va
     a su propia tabla `app.transcripciones` (schema 010), sin FK a proyectos ni voces. De cara al
     equipo la máquina se llama **el transcriptor**, siguiendo el patrón del onboarding (el motor, el
     buscador de cuentas, el archivador).

- **La invariante que queda viva (y su alarma):**

  > Para Instagram, `processed_items.external_id` == decimal de base64(shortcode de la URL).

  Si algún día alguien "arregla" `Normalizar IG` para que prefiera `item.shortCode` sobre `item.id`, el
  dedup entre las dos herramientas se rompe **en silencio**: el transcriptor seguiría escribiendo ids
  numéricos y el motor buscando shortcodes. La alarma son los **8 pares reales** clavados en
  `apps/dashboard/domain/enlace.test.ts`, que fallan en rojo antes de que eso llegue a producción.

- **Alternativas descartadas:**
  - *Resolver el id numérico llamando a Apify por cada link:* costo y latencia por link, y una
    dependencia nueva, para obtener algo que la URL ya contiene.
  - *Tocar `Heat-score v1` para que el `seen` incluya una clave derivada de `processed_items.url`:*
    funciona, pero cuesta un re-import del motor y suma una segunda forma de dedupear a un nodo que
    ADR-029 acaba de blindar. El hallazgo lo vuelve innecesario.
  - *Normalizar el `external_id` de IG a shortcode en el motor:* una línea, pero deja las 408 filas
    viejas (numéricas) huérfanas — esos videos se podrían re-recomendar una vez. La derivación es
    aditiva y no rompe nada.
  - *Un cuarto workflow n8n:* un `workflow.json` más para mantener a mano y un re-import por cambio,
    a cambio de un techo de 900s que la app no necesita.
  - *Guardar los enlaces como `Candidatos`:* rompe el término del glosario y los mete en la aritmética
    de `N`, spillover y dedup de salida ([ADR-013](./ADR-013-atribucion-multiproyecto-fan-out.md),
    [ADR-018](./ADR-018-un-candidato-por-video-dedup-salida.md)) sin haber pasado por ningún gate.
  - *Una columna en `processed_items` que marque "vino a mano":* toca el core sin necesidad; quién pegó
    qué ya vive en `app.transcripciones`.
  - *Escribir en `outputs`:* lo prohíbe [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md).
    Estas transcripciones no son histórico curado.

- **Consecuencias:**
  - (+) El equipo deja de depender de un dev para transcribir un video suelto.
  - (+) El dedup del pedido se cumple sin tocar una línea de n8n: no hay re-import en este cambio.
  - (+) `domain/enlace.ts` corre igual en el server y en el browser, así que el preview de "qué
    entendí de lo que pegaste" usa exactamente el mismo parseo que después ejecuta el servidor.
  - (−) Se rompe el modelo de tres zonas. Era un modelo, no un límite: transcribir es un verbo del
    equipo que no es ni operar la máquina ni curar su salida. El sponsor no ve la zona.
  - (−) La app pasa a portar `SUPADATA_API_KEY` y `ANTHROPIC_API_KEY`, que hasta hoy solo vivían en
    n8n. Sigue siendo el BFF el único portador (plan-cockpit C2), pero son dos secretos más en Vercel.
  - (−) `processed_items` crece con filas que no vienen de ninguna corrida (`run_id` e `instance_id` en
    NULL). La tabla tenía 408 filas y el motor la lee entera con tripwire a las 50.000: hay margen de
    sobra, pero es una fuente de crecimiento nueva que antes no existía.
  - (−) Dos personas procesando la cola a la vez pueden pagar un mismo enlace dos veces (~USD 0.014).
    Se aceptó a cambio de no meter un estado `procesando`: todas las escrituras son idempotentes.
  - (−) Los links cortos (`vm.tiktok.com`, `/t/`) no se pueden resolver sin una llamada de red y se
    rechazan con instrucción. Si molesta, se resuelve con un HEAD y redirect.
