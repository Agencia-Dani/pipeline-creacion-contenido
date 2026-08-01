# Ingesta al registro central — cómo reporta un workflow de n8n (adaptador C4)

> Especifica el patrón estándar con el que **cualquier** workflow n8n reporta sus corridas y
> outputs a Supabase. El workflow de reels lo implementa en F2; el dispatcher y todo workflow
> n8n futuro usan el mismo patrón. (El workflow de Substack NO usa esto: su ingesta es el sync
> Notion → registro de F3, `core/sync/`.)
>
> **Estado (2026-06-23, ADR-014):** el motor de reels reporta corridas con *Abrir run en el registro*
> + *Cerrar run en el registro* (Continue On Fail); **ya no escribe filas por-item a `outputs`** (se
> quitaron *Preparar outputs Supabase* / *Reportar outputs al registro*). El **archivado** es el dueño
> de `outputs`. El error workflow vive en [`core/n8n/error-workflow-registro.json`](../n8n/README.md).

> **Estado (2026-08-01, [ADR-035](../../docs/adr/ADR-035-contrato-de-escritura-por-postgrest.md)):**
> este contrato dejó de cubrir solo `runs`/`outputs`. Desde D7 **todo lo que n8n escribe va por acá**,
> incluidas las tablas del schema `app` que antes vivían en Airtable. La regla que lo resume:
>
> > **n8n LEE su config por la fachada ([run-plan.md](./run-plan.md), ADR-028). ESCRIBE sus
> > resultados por PostgREST (este contrato).**
>
> Ver §5 para las tablas del schema `app` y el header que las habilita.

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

> **Quién escribe `outputs` (ADR-014).** `outputs` es el **histórico canónico**: una fila por pieza
> que el equipo realmente seleccionó. En el MVP de reels lo escribe **solo el archivado** (al
> calificar); el **motor reporta solo `runs`** (su tracking por corrida vive en `runs.metricas`, no
> en filas `draft` por-candidato). Un workflow puede legítimamente reportar `runs` y delegar
> `outputs` a otro. Lo de abajo es el patrón completo para el workflow que sí es dueño de `outputs`.

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

---

## 5. El schema `app`: lo que antes se escribía en Airtable (D7, ADR-035)

Hasta D7 el motor entregaba sus candidatos en Airtable y el archivado escribía ahí las métricas y
la salud de referentes. Ahora todo eso es Postgres, por el mismo canal que `runs`/`outputs` y con la
**misma credencial** (`Supabase Registro`, service_role). No hace falta infra nueva: la migración
`011` ya otorgó los privilegios y dejó `alter default privileges` para las tablas futuras.

### El único detalle que lo diferencia: el header de schema

PostgREST expone `public` por defecto. Para el schema `app` hay que decírselo en cada request:

| Operación | Header |
|---|---|
| GET | `Accept-Profile: app` |
| POST · PATCH · DELETE | `Content-Profile: app` |

Olvidarlo no da un error claro: PostgREST busca la tabla en `public`, no la encuentra, y responde
**404**. Si un nodo nuevo devuelve 404 contra una tabla que existe, es esto.

### Las escrituras, por workflow

| Workflow | Nodo | Verbo | Tabla | `Prefer` | Si falla |
|---|---|---|---|---|---|
| Motor | `POST Candidatos` | POST | `app.candidatos` | `resolution=ignore-duplicates` | **stop-on-fail** — sin entrega, la corrida falló y tiene que verse |
| Motor | `POST Descartes` | POST | `app.descartes` | `return=minimal` | continue-on-fail (es auditoría, no entrega) |
| Archivado | `Borrar candidatos` | DELETE | `app.candidatos?id=in.(…)` | `return=minimal` | stop-on-fail |
| Archivado | `Barrer candidatos sin calificar` | DELETE | `app.candidatos?estado=eq.nuevo&creado_en=lt.…` | `return=minimal` | continue-on-fail (higiene) |
| Archivado | `PATCH Proyectos criterios` | PATCH | `app.proyectos?id=eq.<uuid>` | `return=minimal` | continue-on-fail (ADR-022 es fail-soft) |
| Descubrimiento | `POST Propuestos` | POST | `app.referentes_propuestos` | `return=representation` | stop-on-fail (es la entrega del workflow) |
| Descubrimiento | `POST Puente propuestas` | POST | `app.referentes_propuestos_proyectos` | `resolution=ignore-duplicates` | continue-on-fail |

**`return=representation` no es opcional en `POST Propuestos`:** el uuid de la propuesta lo acuña el
insert, y sin conocerlo no se puede llenar la tabla puente. Es la única escritura del sistema que
necesita leer su propia respuesta.

### Tres cosas que el corte hizo más seguras, y conviene no deshacer

1. **Se acabó `typecast`.** En Airtable los links iban con `typecast: true`, así que un id mal
   formado **no fallaba**: creaba un registro fantasma con el uuid de nombre. En Postgres eso es
   una violación de foreign key — un error, que es lo que uno quiere.
2. **El dedup es estructural.** `app.candidatos.external_id` tiene `UNIQUE`, así que
   `resolution=ignore-duplicates` hace cumplir por la base lo que antes era una comparación en JS
   (ADR-029). La defensa procedural (`Leer feed vivo`) **se conserva igual**: el constraint atrapa
   el duplicado *después* de pagar la transcripción, el nodo lo mata *antes*.
3. **Los lotes de 10 murieron.** Eran el límite de la API de Airtable. PostgREST acepta el array
   entero, y borra por filtro en vez de por lista de ids.

### Lo que NO cambió

El principio de arriba sigue mandando: **el registro es sumidero, no dependencia.** La única
escritura que puede tumbar una corrida es la **entrega** (`POST Candidatos`), y es a propósito:
una corrida que gastó Apify, Supadata y Haiku y no entregó nada no puede salir `ok`.
