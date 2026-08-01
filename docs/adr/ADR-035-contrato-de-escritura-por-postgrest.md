# ADR-035 — n8n escribe sus resultados por PostgREST directo, no por un endpoint de la app

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Cierra la decisión abierta de
  [plan-cockpit §8](../agents/plan-cockpit-propio.md) *"Contrato de escritura del motor (D7) —
  endpoint de la app vs. insert directo a Postgres desde n8n"*.
  Es el hermano de **escritura** de [ADR-028](./ADR-028-contrato-motor-run-plan.md) (lectura), y
  mata a [ADR-033](./ADR-033-dueno-por-campo-durante-la-coexistencia.md), que existía solo mientras
  el escritor de los criterios destilados viviera en Airtable.

  > ⚠️ **Nota de numeración.** plan-cockpit §8 decía que esta decisión se cerraría "con ADR-029". Ese
  > número terminó usándose para [dedup blindado](./ADR-029-dedup-blindado-fail-closed-y-feed.md) el
  > 24/07. La referencia quedó obsoleta; el contrato de escritura es **este** ADR.

- **Contexto:** en D7 el motor deja de escribir `Candidatos` y `Descartes del gate`, el archivado
  deja de escribir `Métricas` y la salud de referentes, y el descubrimiento deja de escribir
  `Referentes propuestos`. Todo eso pasa a Postgres. La pregunta era **por qué canal**.

  El planteo original suponía simetría con ADR-028: si el motor *lee* su config por un endpoint de la
  app, debería *escribir* por otro. Esa simetría es falsa, y el propio sistema ya lo demuestra:

  1. **n8n ya escribe Postgres directo, desde el día 1.** `runs`, `outputs` y `processed_items` se
     escriben por `POST {supabase}/rest/v1/...` con la credencial nativa `Supabase Registro`
     (service_role), y eso está especificado en [`core/contracts/ingesta-registro.md`](../../core/contracts/ingesta-registro.md)
     desde ADR-002/ADR-014. Escribir `app.candidatos` por el mismo canal no es un patrón nuevo: es
     el patrón existente aplicado a dos tablas más.
  2. **"El motor no conoce el schema" (ADR-028) siempre fue una afirmación sobre la *config*, no
     sobre el registro.** El motor conoce el schema de `runs` y `outputs` desde que existe.
  3. **La infraestructura ya está.** `supabase-js` accede al schema `app` con `.schema("app")` en
     toda la app, o sea PostgREST ya lo expone; y la migración `011` ya otorgó `all privileges` al
     `service_role` más `alter default privileges` para las tablas futuras. Costo de infra: cero.

  Y hay una asimetría de riesgo que la simetría de diseño escondía: **la lectura de config puede ser
  fail-closed y la entrega no.** Si la fachada no responde, la corrida no arranca y no se gastó nada
  (ADR-028, a propósito). Si el canal de *escritura* no responde, la corrida ya gastó Apify, Supadata
  y Haiku, y los 145 candidatos se pierden. Meter la app en ese camino agrega un punto de falla justo
  donde el sistema tiene su principio inverso: *fail-closed en config, fail-open en entrega*
  ([plan-cockpit §3.7](../agents/plan-cockpit-propio.md)).

- **Decisión:** n8n escribe por **PostgREST directo**, con la credencial `Supabase Registro` que ya
  tiene y el header `Content-Profile: app` para las tablas del schema `app`.

  **La regla que queda, y que cubre los tres workflows y los que vengan:**

  > **n8n LEE su config por la fachada (ADR-028). ESCRIBE sus resultados por PostgREST
  > (`ingesta-registro.md`).**

  El contrato de escritura no se inventa: se **extiende** el de `ingesta-registro.md`, que ya era el
  dueño de "cómo un workflow reporta lo que produjo". Ahí se documentan las tablas nuevas y el header.

- **Consecuencias:**
  - **A favor:** cero código nuevo de BFF (PostgREST da gratis el insert en batch, el
    `on conflict do nothing` vía `Prefer: resolution=ignore-duplicates` y el delete con filtro). La
    entrega no depende de que la app esté viva. Y desaparece la clase de bug del *proyecto fantasma*:
    sin `typecast`, un id mal formado es un error de FK, no datos malos silenciosos.
  - **En contra, y es real:** n8n vuelve a conocer nombres de columna del schema `app`. Un `alter
    table ... rename` rompe un workflow y obliga a re-importar. Se mitiga con lo que ya existe —
    `Workflows/auditar-workflows.mjs` y el contrato escrito— pero no se elimina. Es el precio de no
    poner la app en el camino de la entrega, y se paga con los ojos abiertos.
  - El `id` que sirve la fachada deja de ser el record id de Airtable y pasa a ser el uuid de
    Postgres: `core/contracts/run-plan.md` sube a `version: 2`.

- **Alternativas descartadas:**
  - **Endpoint de escritura en la app (`POST /api/engine/entregas`).** Es la opción "linda": la app
    dueña de su schema, Zod en el borde, ids resueltos server-side. Descartada porque hace que la
    entrega dependa de la disponibilidad de la app, contra el principio §3.7, y porque son ~200
    líneas de BFF para replicar lo que PostgREST ya hace. Si algún día hiciera falta validación de
    dominio en la escritura (hoy no la hay: el motor ya validó), se reabre.
  - **Mixto por criticidad** (entrega por PostgREST, escrituras "de dominio" por endpoint).
    Descartada porque deja dos mecanismos para el mismo actor sin una regla obvia de cuál usar:
    todo el valor de esta decisión es que la regla se pueda decir en una línea.
