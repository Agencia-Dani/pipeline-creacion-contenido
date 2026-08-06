# `core/templates/` — los esqueletos del N+1

> **Qué es.** Lo que se copia para sumar **una empresa** o **un pipeline** sin escribir nada desde
> cero. Lo pide [PLAN §F5](../../PLAN.md) desde el diseño y nunca se había escrito.
>
> **Cómo se usa:** siempre desde su runbook, nunca suelto.
> [`docs/runbooks/agregar-cliente.md`](../../docs/runbooks/agregar-cliente.md) ·
> [`docs/runbooks/agregar-workflow.md`](../../docs/runbooks/agregar-workflow.md)
>
> ⚠️ **Esto vive bajo `core/`, así que cambia con ADR** — con una excepción que ya estaba decidida:
> **crear este directorio es ejecutar F5**, no una decisión nueva. PLAN §F5 lo nombra por su ruta
> (*"`core/templates/`: esqueleto de workflow nuevo (manifest + estructura + checklist) y de cliente
> nuevo"*). Cambiar lo que hay adentro **sí** pide ADR si cambia el contrato.

| Archivo | Para qué |
|---|---|
| [`cliente-nuevo.sql`](./cliente-nuevo.sql) | Alta de una empresa + su cockpit, en una transacción. **No toca código.** |
| [`workflow-nuevo/workflow.yaml`](./workflow-nuevo/workflow.yaml) | El manifest mínimo que pasa `npm run validate` |
| [`workflow-nuevo/CHECKLIST.md`](./workflow-nuevo/CHECKLIST.md) | Los pasos de un pipeline nuevo, incluidos **los que hoy obligan a tocar el núcleo** |

## El criterio que gobierna este directorio

[PLAN §F5](../../PLAN.md), literal:

> *"Si algún paso de la guía exige «modificar el núcleo», el diseño no está listo — se corrige la
> guía o el contrato, no se parchea a mano (invariante #3, §2.5)."*

**Al 2026-08-06 el veredicto está partido, y conviene saberlo antes de prometer nada:**

- 🟢 **Agregar una empresa PASA.** Es SQL de datos más clics en el cockpit. Cero código, cero n8n,
  cero migraciones. Lo que lo hizo posible fue el dispatcher ([ADR-050](../../docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md)):
  el motor es **un** workflow parametrizado que pregunta a la fachada qué instancias hay, así que
  una empresa nueva entra al ciclo sin que nadie toque n8n.
- 🔴 **Agregar un pipeline NO pasa todavía**, y está medido contra el caso real: LinkedIn. Lo escrito
  en `workflow-nuevo/CHECKLIST.md`, paso por paso, incluye una migración en `core/schema/` y cuatro
  archivos de `apps/dashboard/`. **No se disimula: se escribe cuáles**, para que la próxima vez se
  pueda decidir con la lista delante si eso se templatiza o se acepta.
