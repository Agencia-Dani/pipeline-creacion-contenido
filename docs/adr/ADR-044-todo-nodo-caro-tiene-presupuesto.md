# ADR-044 — Todo nodo caro tiene presupuesto, y la concurrencia es la palanca

- **Estado:** aceptada — 2026-08-02 (decisión de Mani, arquitecto). Toca dos Code nodes del motor y
  el `Config`. **Obliga a re-importar** `workflow-short-form-content`. No toca contratos ni datos.

- **Contexto:** Mani pidió sacar `cap_top_n` (el techo de videos a transcribir por corrida): los
  planes pagos de Apify, Supadata y la API de Claude no llegan ni a la mitad de su cupo mensual y el
  cupo se resetea, así que frenar por costo estaba dejando plata sin usar. Al revisar qué pasaría con
  el techo en 0 aparecieron tres cosas que no se sabían.

  **1. `Traducir (Claude Haiku)` era el techo real, y el único nodo caro sin red.** Corría SERIAL con
  `sleep(1000)` entre llamadas: una llamada por video distinto no-español, y los referentes son casi
  todos ingleses — la corrida del 31/07 16:28 hizo **170 traducciones sobre 191 transcritos (89%)** y
  duró 31 min. `Transcribir` tenía presupuesto (`presupuesto_transcribir_s = 840`) justamente porque
  el watchdog del task runner (`N8N_RUNNERS_TASK_TIMEOUT`, 900 s en el pod) **mata el nodo entero** y
  la corrida muere sin entregar nada; pasó 3 veces el 07-10. `Traducir` no tenía ninguno. Al doble de
  volumen ese nodo se lleva la corrida puesta, y es el modo de falla más caro que tiene el motor:
  se paga Apify, se paga Supadata, y no llega un solo candidato.

  **2. El presupuesto de `Transcribir` no posterga: QUEMA.** El orden en serie es
  `Heat-score v1 → Preparar procesados → POST processed_items → Transcribir` (ADR-029, enmienda del
  31/07), o sea que **el video se marca como procesado ANTES de transcribirse**. El que se queda sin
  presupuesto vuelve con transcript vacío, el gate lo descarta duro como `sin_guion` (ADR-030), y como
  ya está en la memoria de dedup **no se reintenta nunca**. El corte de `cap_top_n`, en cambio, pasa
  *adentro* de `Heat-score v1`, antes de ese POST: lo capado vuelve la corrida siguiente. **El cap es
  seguro; el presupuesto es destructivo.** Sacar el uno sin mover el otro cambia un aplazamiento por
  una pérdida permanente.

  **3. Con `CONCURRENCIA = 8` y ~27 s/video, 840 s dan ~250 videos** — casualmente el mismo número que
  `cap_top_n = 250`. El techo de gasto y el techo de tiempo estaban calibrados al mismo punto, así que
  bajar uno no destrabaría nada.

  Y el aire que había sin usar era grande: el plan pago de Supadata da **10 req/s** y 8 en vuelo a
  27 s/video inician **~0.3 req/s**, treinta veces por debajo del límite.

- **Decisión:** tres cambios, ninguno de ellos un cap nuevo.

  1. **`Traducir` pasa a pool con presupuesto**, mismo patrón que `Transcribir`
     (`concurrencia_traducir = 8`, `presupuesto_traducir_s = 840`). **La asimetría es deliberada y es
     la parte importante de este ADR:** este presupuesto **degrada, no pierde**. Lo que queda afuera
     sale con el transcript en su idioma original y el gate lo juzga igual (Haiku lee inglés); el de
     `Transcribir` mata el video. Un presupuesto que degrada puede ser generoso; uno que quema, no.
  2. **La concurrencia de `Transcribir` sube de 8 a 24** (~0.9 req/s, todavía 11× por debajo del
     límite de Supadata). Con 24 en vuelo, los mismos 840 s cubren ~745 videos. **Esta es la única
     palanca de throughput que queda**, porque el presupuesto no puede pasar de ~880 s sin chocar con
     el watchdog de 900 s.
  3. **Las tres perillas salen de `Config`** (`concurrencia_transcribir`, `concurrencia_traducir`,
     `presupuesto_traducir_s`). `Config` se edita a mano en n8n, así que tunear el throughput deja de
     costar un re-import — y el handoff ya documenta que un re-import cuesta corridas muertas por
     placeholders sin rellenar.

  El `catch` mudo de `Traducir` pasa a contar y loguear. Una tanda entera podía fallar y la corrida
  salía verde con los scripts en inglés, indistinguible de *"casi todo era español"*.

- **Consecuencias:**
  - **`cap_top_n` se puede poner en 0 desde `/curar/ajustes` sin re-importar** (`pick` resuelve
    ajustes > Config y el nodo hace `if (CAP > 0)`), pero **recién después** de que el motor
    re-importado tenga estos dos nodos. Antes, la corrida muere en `Traducir`.
  - **`cap_top_n` sigue existiendo y sigue cortando GLOBAL, no por proyecto.** Medido en la corrida
    `191ddc8b` del 02/08 con el techo en 10: `Trading fast tips` se llevó los 10 lugares y los cuatro
    proyectos de comunicación quedaron en `evaluados: 0`. Mientras esté en un valor que muerda, mata
    proyectos enteros en vez de recortar parejo. Repartirlo por proyecto sería otro ADR; con el techo
    en 0 el problema no se plantea.
  - **Esto no acerca ningún proyecto a su `N`.** El cuello es el supply, no los cortes: todos los
    proyectos, en todas las corridas medidas, reportan `razon_faltante: supply` (ADR-043 §Contexto).
    Lo que esto compra es que sacar el techo **no rompa** la corrida ni queme videos. La palanca de
    verdad sigue siendo sumar referentes.
  - `runs.metricas.llamadas.haiku_traducciones` pasa a ser una **cota superior**: cuenta los videos
    no-español que entraron, y con presupuesto agotado algunos no se llamaron. La métrica ya estaba
    documentada como estimada; se deja así.
  - Si algún día 24 en vuelo empieza a dar 429 de Supadata, la respuesta es bajar
    `concurrencia_transcribir` desde `Config`, no volver a serializar el nodo.

- **Qué mirar después del primer re-import:** `[Traducir] Loop completo en …ms` en los logs de n8n, y
  que no aparezca `[Traducir] PRESUPUESTO agotado`. Si aparece con volúmenes normales, el techo real
  pasó a ser Anthropic y hay que subir `concurrencia_traducir`.
