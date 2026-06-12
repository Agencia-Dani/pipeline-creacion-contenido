# clients/ — configuración por cliente (fuente de verdad)

> Una carpeta por cliente; adentro, **un yaml por workflow que ese cliente usa**, con el nombre
> exacto del workflow: `clients/<cliente>/<workflow-id>.yaml`. Esto unifica los `<<PLACEHOLDERS>>`
> del workflow de reels y las `{{LLAVES}}` del kit Substack en una sola convención
> (ver [core/contracts/workflow-manifest.md](../core/contracts/workflow-manifest.md)).

## Reglas

1. **Claves en `snake_case`**, declaradas en el `filters:` del manifest del workflow (más las
   claves de identidad/voz propias de cada workflow).
2. **Cero secretos.** Tokens y API keys viven en el motor (credentials de n8n / workspace del
   bot). El validador escanea y falla si encuentra algo con pinta de key.
3. Los valores de `scope: client` viven acá; los de `scope: run` se eligen por corrida (el
   formulario los sobreescribe solo esa vez — acá pueden tener su default).
4. Las carpetas que empiezan con `_` (como `_ejemplo/`) son plantillas/documentación — el
   validador no las trata como clientes reales.

## Ejemplo

Ver [`_ejemplo/short-form-content.yaml`](./_ejemplo/short-form-content.yaml). El flujo para un
cliente nuevo (detalle en `docs/runbooks/agregar-cliente.md`, se escribe en F5):

1. Copiar la carpeta `_ejemplo/` → `clients/<cliente>/`.
2. Llenar los yaml de los workflows que usará.
3. Aplicar la config en el motor (duplicar workflow en n8n y resolver valores / correr kit OpenClaw).
4. Registrar la instancia (workflow × cliente) en el registro central.
5. `node core/scripts/validate.mjs` en verde + corrida de prueba antes de activar.
