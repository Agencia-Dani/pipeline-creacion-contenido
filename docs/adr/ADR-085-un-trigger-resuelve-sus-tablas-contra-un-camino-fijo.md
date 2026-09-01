# ADR-085 — Un trigger resuelve sus tablas contra un camino fijo, no contra el de quien lo dispara

- **Estado:** aceptada — 2026-08-31, durante la revisión completa del pipeline (cierre 130).

- **Contexto:** `get_advisors` de Supabase venía tirando 9 avisos de seguridad y nadie los había
  leído de cerca. Se leyeron los 9, uno por uno, y **6 son falsos positivos**: marcan
  `clientes_visibles()`, `instancias_visibles()`, `ve_costos()` y `autores_de_tandas()` por ser
  `SECURITY DEFINER` alcanzables desde `/rest/v1/rpc/`. Leyendo las cuatro definiciones, **las
  cuatro filtran por `auth.uid()`** y devuelven exactamente lo que quien llama ya podía ver por RLS,
  y **las cuatro ya fijan `search_path`**. No hay nada que ganar llamándolas por RPC. Son el patrón
  estándar para que una policy no se llame a sí misma.

  Los otros dos sí eran reales: `app.clients_sin_ciclos()` y `app.outputs_hereda_instancia()`, los
  dos triggers `plpgsql` del esquema, **no fijan `search_path`** y adentro nombran `clients` y
  `runs` **sin calificar el esquema**.

- **Decisión:** los dos triggers fijan `search_path` **y** califican sus tablas
  (`public.clients`, `public.runs`). Cinturón y tirantes, porque cada uno tapa una mitad distinta:
  el `search_path` fija dónde busca, la calificación explícita dice qué encontrar aunque alguien
  cambie el camino. La lógica no se toca: los cuerpos son los mismos.

- **Por qué importa aunque hoy no muerda.** No hay explotación conocida en este proyecto y estos
  triggers solo los dispara la app. Pero un trigger corre con los privilegios del dueño y en el
  contexto del que escribe: **cuál tabla resuelve no es una decisión que deba tomar el llamador.**
  Es una línea por función, no cambia comportamiento, y lo verifica un lint que ya corre.

- **Lo que este ADR también decide, y es la mitad más útil:** **queda escrito por qué los otros 6
  avisos no se van a arreglar.** Un lint con falsos positivos que nadie documenta se vuelve ruido, y
  el ruido termina en que tampoco se miran los verdaderos. La próxima sesión que corra
  `get_advisors` tiene que poder distinguir en 30 segundos qué es señal y qué no.

- **Alternativas descartadas:**
  - *Revocar `EXECUTE` a `authenticated` sobre las cuatro `*_visibles()`* — es lo que sugiere el
    linter, y **rompería RLS**: las policies las llaman en nombre del usuario. El aviso está mal
    calibrado para este uso, no el código.
  - *Pasarlas a `SECURITY INVOKER`* — vuelve la recursión que `SECURITY DEFINER` existe para evitar.
  - *Silenciar el linter* — se pierde la señal el día que aparezca una de verdad.

- **Verificación:** por efecto y no por haber corrido, como el resto de las migraciones de este
  repo. `pg_proc.proconfig` tiene que pasar de `null` a `search_path=app, public, pg_temp` en las
  dos; el trigger de ciclos tiene que seguir rebotando un cliente que se declare su propio padre; y
  `get_advisors` tiene que bajar de 9 avisos a 7. Los pasos exactos están en
  [`core/schema/035_search_path_triggers.sql`](../../core/schema/035_search_path_triggers.sql).

- **Consecuencias:** ninguna sobre el comportamiento. La migración `035` **espera el Run de Mani en
  el SQL Editor** (gate humano, como todas), así que hasta entonces `get_advisors` sigue en 9.
