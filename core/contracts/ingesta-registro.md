# Ingesta al registro central — cómo reporta un workflow de n8n (adaptador C4)

> Especifica el patrón estándar con el que **cualquier** workflow n8n reporta sus corridas y
> outputs a Supabase. El workflow de reels lo implementa en F2; el dispatcher y todo workflow
> n8n futuro usan el mismo patrón. (El workflow de Substack NO usa esto: su ingesta es el sync
> Notion → registro de F3, `core/sync/`.)
>
> **Estado (2026-06-12):** implementado en el template del wf de reels (nodos *Abrir run en el
> registro* / *Preparar reporte de outputs* / *Reportar outputs al registro* / *Cerrar run en el
> registro*, todos Continue On Fail) y el error workflow en
> [`core/n8n/error-workflow-registro.json`](../n8n/README.md).

## Principio innegociable

**El registro es sumidero, no dependencia** (no-negociable #1): todos los nodos de reporte van
con **"Continue On Fail" activado**. Si Supabase no responde, la corrida sigue, el Sheet se
escribe y el email sale — la reconciliación se hace después. Un workflow jamás falla por no
poder reportar.

## Credencial en n8n (una sola vez)

Credencial nativa de n8n tipo **Supabase API** llamada `Supabase Registro` (host del proyecto +
service_role key). Los nodos HTTP la usan como *Predefined Credential Type* → manda sola los dos
headers que Supabase exige (`apikey` y `Authorization: Bearer`). *(Corrección 2026-06-12: antes
este contrato decía Header Auth, pero esa credencial solo soporta UN header.)*

La service role key bypassa RLS — vive SOLO en n8n (y en el gestor de contraseñas). Base URL:
`https://<proyecto>.supabase.co/rest/v1`.

## El patrón: 3 nodos + workflow de error

```
[Trigger] → [Set: contexto registro] → ...workflow normal... → [Reportar outputs] → [Cerrar run]
     └────────── al inicio ──────────┐
                          [Abrir run en el registro]
```

### 1. Abrir run (al inicio, después del trigger)

`POST {base}/rest/v1/runs` · header extra `Prefer: return=representation`

```json
{
  "instance_id": "{{ $json.instance_id }}",
  "trigger_type": "cron",
  "estado": "en_curso",
  "params": {}
}
```

- `instance_id` es una **constante de la instancia**: se obtiene del registro al crear la
  instancia (insert de F2) y entra como placeholder `<<INSTANCE_ID>>` que resuelve
  `core/scripts/deploy.mjs` desde la config del cliente (`instance_id` en el yaml).
- `params`: en corridas cron va vacío o con los defaults; en corridas `on_demand` lleva lo que
  el formulario pidió.
- La respuesta trae el `id` del run → se conserva en el flujo para los pasos 2 y 3.

### 2. Reportar outputs (uno por pieza producida, o batch)

`POST {base}/rest/v1/outputs` — acepta un **array** (una sola llamada con las ~25 piezas):

```json
[{
  "run_id": "{{ run_id }}",
  "tipo": "guion_reel",
  "titulo": "{{ titulo }}",
  "contenido_o_link": "{{ link_a_la_fila_del_sheet_o_texto }}",
  "estado": "draft",
  "source_items": [{ "platform": "instagram", "url": "{{ url_referente }}" }],
  "metadata": { "views": 0, "likes": 0, "followers": 0, "hashtags": [] }
}]
```

`metadata` lleva las métricas del referente (las del `content_item`) — son las que el dashboard
usa para filtrar por views/likes/seguidores.

### 3. Cerrar run (último nodo del flujo feliz)

`PATCH {base}/rest/v1/runs?id=eq.{{ run_id }}`

```json
{
  "fin": "{{ $now }}",
  "estado": "ok",
  "costo_estimado": 0,
  "metricas": { "colectados": 0, "filtrados": 0, "outputs": 0 }
}
```

### 4. Workflow de error (n8n Error Workflow, global)

Un workflow aparte con **Error Trigger**, configurado como error workflow de todos los
workflows del pipeline: hace el mismo `PATCH` con `estado: "fallo"` y `error: <mensaje>`.
Si la corrida murió antes de abrir el run, inserta uno nuevo con `estado: "fallo"`.
(Este mismo workflow es el gancho natural para la alerta por email/Telegram de F4.)

## Verificación

Tras una corrida: `select * from v_outputs_recientes limit 30;` en el SQL Editor de Supabase —
deben aparecer las piezas con su cliente, workflow, corrida y metadata.
