# core/n8n — piezas de n8n del núcleo

## El error handler global se mudó

Vive en **[`Workflows/workflow-registro-fallos/`](../../Workflows/workflow-registro-fallos/)**, con su
`workflow.json`, su `workflow.yaml` y su README, como cualquier otro workflow del repo.

El `error-workflow-registro.json` que estaba acá se borró el **2026-08-03**. Era la versión de **5
nodos**, con la rama *Insertar run de fallo* que
[ADR-054](../../docs/adr/ADR-054-cada-run-lleva-su-execution-id.md) **descarta explícitamente**:
insertar un run huérfano exigiría inventarle un tenant, y `runs.instance_id` es `not null` desde la
Capa 1 de [ADR-047](../../docs/adr/ADR-047-aislamiento-en-dos-capas.md). La versión viva tiene **3
nodos** y cierra la fila exacta por `PATCH /runs?params->>execution_id=eq.<id>`.

**Por qué se mudó, y no solo se actualizó acá.** Dos razones, y las dos aparecieron el mismo día:

1. **Era una segunda fuente de verdad.** Este archivo se quedó en la topología vieja mientras el
   workflow real cambiaba, y nada lo iba a notar: `npm run n8n:diff` compara el live contra
   `Workflows/*/workflow.json`, así que un JSON fuera de esa carpeta queda **fuera del bucle de
   feedback** por construcción.
2. **Ya no es una pieza del núcleo, es un workflow.** Desde
   [ADR-053](../../docs/adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md) se versiona,
   se compara y se parchea con las mismas herramientas que los otros cuatro (alias `errores`).

El contrato que gobierna lo que ese workflow hace sigue donde estaba:
[`core/contracts/ingesta-registro.md`](../contracts/ingesta-registro.md) §4.
