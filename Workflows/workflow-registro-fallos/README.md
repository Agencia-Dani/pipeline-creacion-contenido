# Registro — Error Workflow (fallos → Supabase)

La red de seguridad del registro. Cuando cualquier workflow del pipeline termina en excepción,
n8n dispara este, y su trabajo es que la caída **quede escrita**: un run que muere a mitad no
puede quedarse en `en_curso` para siempre, porque entonces "se cayó" y "todavía está corriendo"
se ven igual en el cockpit.

Es infraestructura de la instancia, no un pipeline: no colecta, no transcribe, no cuesta plata.

## Cómo funciona

```
Error Trigger                     ← lo invoca n8n cuando otro workflow falla
  → Preparar datos del fallo      ← execution_id + "[workflow] mensaje · nodo: X · url"
  → Marcar run como fallo           PATCH runs?params->>execution_id=eq.<id>
```

La llave es la **ejecución**, no la instancia. `instance_id` identifica al tenant, y el motor, el
archivado y el descubrimiento comparten instancia: con el dispatcher dando una ejecución por
instancia ([ADR-050](../../docs/adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md)), buscar
"algún run en_curso de este tenant" toca la fila equivocada o varias. Cada `Abrir run` graba
`params.execution_id = $execution.id`, y el Error Trigger recibe ese mismo id
([ADR-054](../../docs/adr/ADR-054-cada-run-lleva-su-execution-id.md), medido contra la instancia).

El PATCH **no** filtra por `estado`: si la corrida ya se había cerrado como `ok` y se cae después,
igual pasa a `fallo` con su mensaje. `metricas` no se pisa, así que queda la foto completa —hasta
dónde llegó y con qué murió— en lugar de un `ok` que miente. El nodo va con
`onError: continueRegularOutput`: el error handler nunca debe fallar y disparar otro error.

**Lo que NO cubre:** caerse *antes* de abrir el run (`Config`, barrer zombies, leer corridas vivas,
guard single-flight). Ahí no hay fila que cerrar, y crear una exigiría inventar un `instance_id`,
que es `not null references instances(id)` y es la Capa 1 de
[ADR-047](../../docs/adr/ADR-047-aislamiento-en-dos-capas.md). Dos de esos 4 nodos ya son requests
a Supabase, así que el modo de falla dominante de esa ventana es "Supabase no responde" — y ahí
tampoco se podría escribir la fila del fallo. Esas caídas las levanta `Barrer runs zombie` en la
corrida siguiente, que además sigue siendo la única red para cuando se cae el propio n8n (pod
reiniciado, OOM) y no hay Error Trigger que dispare.

## Estado: **funcionando** desde 2026-08-03

Re-importado y verificado end-to-end contra la instancia: se forzó una excepción en un workflow
desechable que lo tenía como Error Workflow, y el handler se disparó, capturó el `execution_id` de
la ejecución caída y ejecutó su PATCH contra Supabase sin error (0 filas, porque esa ejecución
nunca abrió un run). Los cuatro workflows lo tienen en `settings.errorWorkflow`.

> **Se rompió dos veces por lo mismo, y las dos veces en silencio.** La copia original y el
> re-import del 2026-08-03 quedaron los dos con `<<SUPABASE_URL>>` literal en la URL: `<<…>>` no
> es sintaxis de expresión de n8n, así que se manda tal cual y el request muere — y como el nodo
> va con `onError: continueRegularOutput`, la ejecución termina en verde igual. **Es el modo de
> falla que justifica correr `npm run n8n:diff` después de cada import**, que es lo que lo
> encontró la segunda vez. Ese re-import además creó un workflow con id NUEVO
> (`gBcKmzxc4EgXMwzv`); el original quedó inactivo y conviene archivarlo.

## Si hay que volver a importarlo

⚠️ **El orden importa.** Busca por `params.execution_id`, así que los tres `Abrir run` tienen que
estar escribiéndolo antes (ya lo hacen). Placeholder único: `<<SUPABASE_URL>>`. Credencial:
`supabaseApi` → *Supabase account*, en `Marcar run como fallo`.

**Importar crea un workflow con id nuevo**, así que hay que actualizar `N8N_WF_ERRORES` en el
`.env` y volver a apuntar los cuatro workflows. Y correr el diff inmediatamente después, que es
lo que agarra el placeholder sin resolver:

```bash
cd core/scripts && npm run n8n:diff -- errores
```

Si marca drift en la url, se arregla sin volver al editor:

```bash
npm run n8n:push -- errores --nodos "Marcar run como fallo" --apply
```

Y apuntarlo desde cada workflow que deba reportar: **Settings → Error Workflow**. Hoy lo tienen
los cuatro (motor, descubrimiento, archivado y dispatcher). Ese binding vive solo en la instancia
(`settings.errorWorkflow`), no en el repo, así que no hay quien avise si alguno se queda afuera:
se verifica a mano contra la API.

```bash
cd core/scripts && node -e 'process.loadEnvFile("../../.env");
for (const a of ["MOTOR","DESCUBRIMIENTO","ARCHIVADO","DISPATCHER"]) {
  const r = await fetch(`${process.env.N8N_BASE_URL}/api/v1/workflows/${process.env["N8N_WF_"+a]}`,
    { headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY } }).then(r => r.json());
  console.log(r.settings?.errorWorkflow === process.env.N8N_WF_ERRORES ? `✓ ${a}` : `✗ ${a}`);
}'
```
