# Archivado de curación — carril C (C2)

> Workflow de **n8n** que cierra el loop de curación del MVP de reels. Corre **diario por cron**:
> toma los `Candidatos` que el equipo (Majo/Jero) ya calificó en Airtable, los manda al histórico
> permanente (Supabase + Google Sheet) y los **borra de Airtable** para no reventar el plan free
> (1.000 records). Es el complemento del motor B3 (`../workflow-short-form-content/`).
>
> Estado real del MVP: [ROADMAP §3 carril C](../../ROADMAP.md) · [handoff.md](../../docs/agents/handoff.md).

## Qué hace (flujo)

```
Cron diario 9am ─┐
Ejecutar manual ─┴─► Config ─► Abrir run (Supabase, continue-on-fail)
   └─► Leer Proyectos ─► Leer Voces ─► Leer Candidatos calificados ─► IF ¿hay?
          ├─ no ─────────────────────────────────────────────► Cerrar run
          └─ sí ─► Armar filas ─► Registrar outputs (Supabase, continue-on-fail)
                       └─► Append al Sheet Histórico ─► Borrar de Airtable ─► Cerrar run
```

- **Lee** `Candidatos` con `calificacion` puesta (`filterByFormula: NOT({calificacion} = '')`).
- **Resuelve nombres**: `proyecto`/`voz` en `Candidatos` son campos *link* (ids), así que lee
  `Proyectos` y `Voces` y mapea id→nombre (igual que el motor).
- **Registra en Supabase** `outputs` (tipo `guion_reel`): `contenido_o_link` = **texto del script**,
  `calificado_en` = `fecha_calificacion`, `external_id` = **id del record de Airtable**,
  `metadata` completa (proyecto, voz, referente, idioma, métricas, heat_score, `calificacion`).
  Estos alimentan `v_historico_seleccionados`, `v_selecciones_por_dia` y `v_senal_seleccion` (003).
- **Append al Google Sheet "Histórico"** (las 13 columnas de la vista — ver abajo).
- **Borra de Airtable** los records archivados (batch de 10 por DELETE).

## Orden e idempotencia (lo que importa)

- **Supabase es sumidero** (invariante #1): `Abrir run`, `Registrar outputs` y `Cerrar run` van con
  *Continue On Fail*. Si Supabase no responde, el Sheet igual se escribe y Airtable igual se limpia.
- **El Sheet NO es continue-on-fail a propósito**: si el append falla, el workflow **corta antes de
  borrar de Airtable** → no se pierde la curación del equipo; reintenta al otro día.
- **Idempotencia por borrado**: en operación normal un record se procesa una vez porque se borra de
  Airtable al final. El índice único parcial `outputs.external_id` (001) es el backstop contra
  doble-insert en un reintento tras falla parcial. *(No se usa upsert `on_conflict`: el índice es
  parcial — `where external_id is not null` — y PostgREST no lo soporta limpio.)*

## Requisitos previos

1. **`004_historico_script_texto.sql` aplicado** en Supabase (la vista expone el **texto** del
   script, no `link_doc`). Correr en orden tras 001–003.
2. **Sheet "Histórico" creado** (C1) con la pestaña y las 13 columnas exactas (encabezados, fila 1):
   `FECHA CALIFICACION · PROYECTO · VOZ · TITULO · URL ORIGINAL · SCRIPT · IDIOMA · VIEWS · LIKES ·
   SEGUIDORES · HEAT SCORE · CALIFICACION · ESTADO`. El append mapea por nombre de encabezado
   (`autoMapInputData`) → deben coincidir **exactos**.
3. Corre en **la misma instancia de n8n** que el motor (B1) y reusa sus credenciales nativas
   `Airtable PAT` y `Supabase Registro`.

## Placeholders a completar al importar

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `<<AIRTABLE_BASE_ID>>` | nodo *Config* | `baseId` de la base Reels Cockpit (`app...`) |
| `<<SUPABASE_URL>>` | nodo *Config* | `https://<proyecto>.supabase.co` |
| `<<INSTANCE_ID>>` | nodo *Config* | el `instance_id` de la instancia piloto (mismo que el motor) |
| `<<GOOGLE_SHEET_ID>>` | nodo *Config* | id del Sheet Histórico (de la URL) |
| `<<NOMBRE_PESTANA_SHEET>>` | nodo *Config* | nombre de la pestaña destino |
| `<<CREDENCIAL_GOOGLE_SHEETS>>` | nodo *Append al Sheet* | credencial OAuth de Google Sheets en n8n |

> Los IDs no son secretos pero **no se commitean** (van al gestor). Las API keys de Airtable/Supabase
> NO viven acá: son credenciales nativas de n8n (`Airtable PAT`, `Supabase Registro`).

## Credenciales en n8n

| Servicio | Credencial | Uso |
|---|---|---|
| Airtable | `Airtable PAT` (`airtableTokenApi`) | leer Proyectos/Voces/Candidatos + borrar |
| Supabase | `Supabase Registro` (`supabaseApi`, service_role) | runs + outputs |
| Google Sheets | OAuth (`googleSheetsOAuth2Api`) | append al histórico — **única dependencia de Google del pipeline** |

> OAuth de Google en n8n self-host: la cuenta dueña del Sheet entra como *test user* del OAuth
> client (ver riesgo en ROADMAP §6). Documentar al configurarlo.

## Limitaciones conocidas (MVP)

- **Sin paginación**: lee 1 página (hasta 100 candidatos calificados / corrida). Con cron diario y
  `top_n` chico entra cómodo; si se acumulan >100, agregar loop de `offset`.
- **El motor deja una fila `outputs` "draft"** por candidato producido (sin `calificado_en`); este
  workflow crea la fila **archivada** (con `calificado_en`). Las vistas del histórico filtran por
  `calificado_en is not null`, así que solo aparece la archivada. Las draft quedan como rastro de
  "producido"; limpieza opcional a futuro.

## Validar (C3)

Tras una corrida con al menos un candidato calificado de prueba:

```sql
select * from v_historico_seleccionados limit 30;   -- fila con su script (texto), por voz
select * from v_selecciones_por_dia;                -- "el lunes X seleccionaron N para tal voz"
```

Y verificar: fila nueva en el Sheet con su script · el record salió de Airtable.
