# core/n8n — piezas de n8n del núcleo

## `error-workflow-registro.json`

Workflow de error global del pipeline (contrato:
[`core/contracts/ingesta-registro.md`](../contracts/ingesta-registro.md) §4): cuando cualquier
workflow del pipeline falla, marca su run `en_curso` como `fallo` en el registro central (o
inserta un run de fallo si murió antes de abrirlo). Es el gancho natural para las alertas de F4.

**Instalación (una vez por instancia de n8n):**

1. Importarlo: n8n → Workflows → *Import from File*.
2. Reemplazar en sus nodos los 2 placeholders (no hay script de deploy para este — son 2 valores):
   - `<<SUPABASE_URL>>` (3 nodos HTTP) — `https://<proyecto>.supabase.co`
   - `<<INSTANCE_ID>>` (nodos *Preparar datos del fallo* e *Insertar run de fallo*)
3. Asignar la credencial **Supabase Registro** (tipo *Supabase API*: host + service_role key)
   a los 2 nodos HTTP.
4. Activarlo, y en el workflow de reels: **Settings → Error Workflow →** seleccionarlo.

**Multi-workflow (futuro):** cuando haya más de una instancia reportando, el nodo *Preparar
datos del fallo* pasa de constante a un mapa `{ nombre_del_workflow_en_n8n: instance_id }` —
está comentado en su código.
