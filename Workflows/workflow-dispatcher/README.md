# Dispatcher — una ejecución por instancia

Lo que convierte **un** workflow parametrizado en **N corridas aisladas**, una por empresa.
Decisión y alternativas descartadas: [ADR-050](../../docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md).
Fuente de verdad: su [`workflow.json`](./workflow.json).

```
[cron] → Config (qué pipeline, a qué webhook)
       → GET /api/engine/instancias?workflow=short-form-content
       → una fila por instancia
       → POST { instancia } al webhook del destino   ← continue-on-fail por iteración
```

## Por qué existe

Hasta la Fase 4 el motor y el archivado tenían su propio cron y `<<INSTANCE_ID>>` era una constante
del archivo: un cron sabía para quién corría porque solo había un para-quién. Con
[ADR-048](../../docs/adr/ADR-048-run-plan-v2-motor-por-instancia.md) la instancia pasa a viajar en
el payload, y **un cron no tiene payload**. Sus dos crons se mudaron acá, con su horario intacto.

**Lo que NO es:** el workflow padre que [ADR-006](../../docs/adr/ADR-006-plano-de-datos-sin-workflow-padre.md)
descartó. Ese era el centro del sistema y la única puerta; este dispara un solo pipeline, no sabe
qué pasó adentro de lo que disparó, no registra nada, y si se cae el botón ▶ del cockpit sigue
funcionando. ADR-006 lo autorizó explícitamente como C9.

## Las tres cosas que hay que entender antes de tocarlo

1. **El loop vive acá y no adentro del motor, y esa es la decisión entera.** Tres tenants en serie
   dentro del mismo Code node chocan con `N8N_RUNNERS_TASK_TIMEOUT` (900 s en el pod, mata el nodo
   completo — pasó 3 veces) y la corrida muere **sin entregar nada**, después de pagar Apify y
   Supadata. Con una ejecución por instancia, cada una conserva sus 840 s enteros.
2. **`Leer instancias` NO tiene continue-on-fail; `Disparar` SÍ.** No es una inconsistencia: si no
   se sabe quiénes corren no hay a quién disparar (fail-closed), pero un tenant que no recibe la
   señal no puede llevarse puestos a los demás (invariante #1).
3. **Motor, archivado y descubrimiento comparten instancia.** `instances` es (pipeline × empresa),
   y los tres son el mismo pipeline `short-form-content`; se distinguen por `params.workflow` en
   `runs`. Por eso `?workflow=` lleva el slug del pipeline, no el del sub-workflow.

## Placeholders del re-import

`<<DASHBOARD_URL>>` · `<<WEBHOOK_URL_MOTOR>>` · `<<WEBHOOK_URL_ARCHIVADO>>`

Los dos últimos son las **URLs completas** de los webhooks de producción (no los paths). Más las
dos credenciales `httpHeaderAuth` del runbook del [manifest](./workflow.yaml).

> ⚠️ **Antes de activarlo, apagar los crons viejos.** El motor y el archivado ya no los tienen en
> el repo, pero la instancia de n8n conserva lo que se importó: si quedó una copia vieja activa, el
> piloto corre dos veces por semana y una de las dos aborta a mitad.

## Cómo se verifica que sirvió

Con **una** instancia el resultado es idéntico al de antes, así que la corrida de verificación no
prueba nada por sí sola. Lo que lo prueba es el paso 7 de [plan §11.3](../../docs/agents/plan-multi-tenant.md):
con dos instancias, **N videos distintos por instancia y ninguno cruzado**, mirado con un `select`.
