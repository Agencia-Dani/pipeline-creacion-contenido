# ADR-048 — `run-plan` sube a v2 y el motor se parametriza por instancia: `<<INSTANCE_ID>>` deja de ser una constante

- **Estado:** aceptada — 2026-08-02. Es la decisión **C** del
  [plan multi-tenant §2](../agents/plan-multi-tenant.md) (la fase, su §7). Extiende
  [ADR-028](./ADR-028-contrato-motor-run-plan.md) usando **su propia regla de versionado**, y enmienda
  [`core/contracts/ingesta-registro.md`](../../core/contracts/ingesta-registro.md).
  Su hermano de ejecución es [ADR-050](./ADR-050-dispatcher-una-ejecucion-por-instancia.md).

  > ⚠️ **Nota de numeración, para que nadie la lea como un salto.**
  > [ADR-035](./ADR-035-contrato-de-escritura-por-postgrest.md) anunció que
  > [`run-plan.md`](../../core/contracts/run-plan.md) subía a `version: 2` por el flip de ids
  > (record id de Airtable → uuid de Postgres). **Ese bump nunca se ejecutó, y con razón:** el flip
  > terminó siendo pass-through —`fields.uuid` viajaba en paralelo y el mapa `uuidDe` quedó identidad—
  > así que **no hubo cambio de forma y no hizo falta un tercer re-import**. El contrato sigue en `1`.
  > **Este ADR es el que efectivamente lo sube a `2`**, y esta vez sí por un cambio de forma.
  > No re-litiga nada de ADR-035: su regla de escritura queda intacta y es justo la que hace que este
  > cambio cueste un re-import.

- **Contexto:** hoy **el disparo y la config son singulares por diseño**, y las tres piezas lo dicen
  cada una a su manera:

  - **`MOTOR_WEBHOOK_URL` es una env var singular.** Un webhook = una copia de workflow.
  - **`GET /api/engine/run-plan` no recibe tenant.** Sus únicos params son `?ambito=motor|completo`.
    Devuelve *la* config, en singular.
  - **`<<INSTANCE_ID>>` es, textual de `ingesta-registro.md`, *"una constante de la instancia"***,
    resuelta por `core/scripts/deploy.mjs` desde el yaml del cliente.

  Con eso, sumar una empresa es **clonar el workflow en n8n + rellenar 6 placeholders a mano + agregar
  env vars**. Lineal en trabajo manual y en superficie de error — y el error es **mudo**: la corrida
  del 2026-08-02 costó tres intentos y los dos primeros murieron por lo mismo, `<<DASHBOARD_URL>>` sin
  rellenar, con la fila de `runs` quedando en `en_curso` **para siempre**, sin `fin` ni métricas.
  Parecía una corrida lenta.

  A 3 empresas × 2 pipelines eso son **6 copias que mantener sincronizadas a mano**, cada una con su
  propio riesgo de re-import.

- **Decisión:**

  1. **[`core/contracts/run-plan.md`](../../core/contracts/run-plan.md) → `version: 2`**, con un param
     **obligatorio** `?instancia=<uuid>`. Se conserva `?ambito=motor|completo` sin cambios.

  2. **Instancia ausente, mal formada o ajena al llamante ⇒ 400/403, y la corrida no arranca.** El
     fail-closed de ADR-028 §4 **no se afloja ni un milímetro**: *"una corrida sin config entrega
     ruido; no entregar es mejor."* Una instancia equivocada es peor que ninguna config: entrega
     contenido de otra empresa, en verde.

  3. **`<<INSTANCE_ID>>` deja de ser una constante de instancia y pasa a venir del payload del
     webhook.** Es la derogación explícita de la línea de `ingesta-registro.md`: hay **una** definición
     de workflow y la instancia es un dato de la corrida, no del archivo. Los otros 5 placeholders
     siguen igual.

  4. **Nuevo `GET /api/engine/instancias?workflow=<slug>`** → las instancias activas de un pipeline.
     Misma auth de header compartido, mismo fail-closed. Lo consume el dispatcher de ADR-050.

  5. **Se aprovecha el bump para matar `fields.uuid`**, que ya es redundante (vale lo mismo que `id`) y
     que quedó anotado como *"muere en el próximo re-import que haga falta por otra cosa"*. **Este es
     ese re-import.**
     > ⚠️ Y con el matiz que quedó escrito cuando se decidió **no** aprovecharlo la vez pasada: *"son
     > cambios sin relación, y si la corrida de verificación sale mal quedan dos sospechosos."* Acá
     > corresponde porque el cambio de forma **ya** obliga al re-import — pero si la primera corrida
     > sale rara, se verifica en dos pasos: primero instancia, después limpiar `uuid`.

- **Alternativas descartadas:**
  - **Una copia del workflow por empresa** (lo que hay hoy, extendido). Sin código nuevo y sin
    re-import. Descartada porque el costo no está en construirla sino en **mantener 6 copias
    sincronizadas a mano**, y cada divergencia se descubre en producción, en silencio. Es cambiar un
    re-import coordinado por N re-imports desincronizados para siempre.
  - **Una instancia de n8n por empresa.** Aislamiento operativo real. Descartada porque es la **fase 2
    de [ADR-005](./ADR-005-hosting-n8n-managed-fase1.md) adelantada sin disparador**, y hoy **no hay
    runbooks de operación** (eso es F6, sin empezar). ADR-005 pide un disparador **medido**; este no lo
    es.
  - **Que el motor resuelva la instancia solo** (por el cliente, o por convención de nombre).
    Descartada porque le devuelve al motor conocimiento del modelo de datos que ADR-028 le sacó a
    propósito, y porque con dos instancias del mismo pipeline por empresa la convención deja de ser
    única.
  - **Pasar la instancia por header en vez de query param.** Equivalente en lo técnico. Descartada por
    diagnosticabilidad: un query param se ve en el log de la corrida y se reproduce con un `curl`; un
    header, no. En un sistema donde el modo de falla típico es un placeholder sin rellenar, eso importa
    más que la elegancia.
  - **No versionar** (agregar el param como opcional, default a la instancia piloto). Descartada
    porque un default silencioso convierte "el dispatcher no mandó la instancia" en "corrió la del
    piloto" — un fallo mudo que escribe datos en el tenant equivocado.

- **Consecuencias:**
  - (+) **Sumar una empresa pasa a ser una fila**, no una copia de workflow. Es lo que
    [PLAN §F5](../../PLAN.md) siempre pidió y lo que el invariante #3 exige.
  - (+) La regla de versionado de ADR-028 se usa por primera vez para lo que fue escrita, y el contrato
    se endurece del lado de la app: el zod del borde valida la instancia antes de gastar un crédito.
  - (−) **Obliga a un re-import.** Es el precio conocido de ADR-035 (*"n8n conoce nombres de columna del
    schema `app`"*), y se paga con los ojos abiertos. Se hace **una sola vez, coordinado, con el
    checklist de los 6 placeholders a la vista** — no son 2:
    `<<DASHBOARD_URL>>` · `<<INSTANCE_ID>>` · `<<SUPABASE_URL>>` · `<<WEBHOOK_PATH_MOTOR>>` ·
    `<ANTHROPIC_API_KEY>` · `<SUPADATA_API_KEY>`. **Los dos últimos muerden a mitad de corrida**, no al
    principio.
  - (−) **La app queda en el camino de arranque de cada corrida de cada tenant.** No es una dependencia
    nueva (ADR-028 ya la aceptó, con el matiz de que antes ese lugar lo ocupaba Airtable), pero ahora su
    caída detiene a **todos** los tenants, no a uno. El invariante #1 sigue intacto en lo suyo: el
    **registro** nunca bloquea una corrida.
  - (−) El botón ▶ del cockpit y el single-flight guard dejan de ser globales por copia de workflow y
    pasan a ser **por instancia**. Idem `buscarAhora()` / `hayBusquedaViva()`.
  - **El reflejo de verificación, textual del handoff:** *"`runs` no distingue 'colgada' de 'muerta',
    Apify sí."* Si la corrida de verificación parece lenta, se mira Apify: **cero llamadas ⇒ murió antes
    de scrapear**, y el sospechoso número uno es un placeholder sin rellenar.

- **Toca:** [`core/contracts/run-plan.md`](../../core/contracts/run-plan.md) (→ v2) ·
  [`core/contracts/ingesta-registro.md`](../../core/contracts/ingesta-registro.md) (deroga
  `<<INSTANCE_ID>>` como constante) · `apps/dashboard/app/api/engine/run-plan/route.ts` ·
  `lib/config.ts` (ya es la costura correcta; no se crea otra) · el endpoint nuevo `/api/engine/instancias` ·
  `app/(zonas)/operar/actions.ts` · el `workflow.json` del motor. **`core/scripts/deploy.mjs` sigue
  deprecado**: este ADR le saca su último trabajo pendiente.
