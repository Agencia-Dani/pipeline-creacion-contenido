# ADR-008 — Airtable como cockpit del equipo de redes (revisa ADR-004/D4)

- **Estado:** aceptada — 2026-06-12
- **Contexto:** la conversación con el jefe (2026-06-12) elevó el alcance del workflow de reels.
  Ya no es "una corrida que escribe ~25 guiones a un Sheet": el **equipo de redes** (Majo, Jero)
  debe poder **gestionar referentes, palabras clave y proyectos**, y **calificar** los guiones
  candidatos — y el sistema debe **aprender de esas elecciones** para mejorar (ver
  [one-pager](../one-pager-reels-mvp.md)). Esto reabre la decisión D4/ADR-004,
  que había **diferido** una UI para el usuario no técnico: ahora una superficie editable para el
  equipo entra al MVP, no como extensión futura.
- **Decisión:** el equipo de redes opera sobre un **cockpit en Airtable** (plan free):
  - **Airtable = superficie editable del equipo** (5 tablas: Proyectos, Voces, Keywords,
    Referentes, Candidatos). No-code, hasta 5 editores, imposible de romper. Ahí se gestiona la
    búsqueda y se **califican** los candidatos. Modelo: [`core/contracts/airtable-cockpit.md`](../../core/contracts/airtable-cockpit.md).
  - **Supabase = almacén pesado** (registro de corridas/outputs + `processed_items` para el dedup
    + corpus de aprobados que realimenta el few-shot). Schema: [`core/schema/002_cockpit_y_dedup.sql`](../../core/schema/002_cockpit_y_dedup.sql).
  - **n8n = motor**: lee la config de Airtable, deduplica contra Supabase, **scorea por "heat"
    (no corte binario)**, genera N candidatos y los escribe a Airtable + registra en Supabase.
  - El reparto lo dictan los límites del free de Airtable (**1.000 registros/base, 1.000 API
    calls/mes, 5 editores**): lo liviano y curado vive en Airtable; lo que se acumula, en Supabase.
- **Alternativas descartadas:**
  - *Supabase + UI propia (Retool/app):* más sostenible y relacional, pero hay UI que construir y
    hostear → MVP más lento. Se mantiene como evolución futura (la costura queda: el dato ya vive
    estructurado).
  - *Todo en n8n (Forms + Data Tables):* un solo tool, pero la UI de n8n no es amigable para el
    equipo no técnico y acopla la config al motor (viola el contrato config-fuera-del-motor).
  - *Seguir con Google Sheets:* no modela bien las relaciones (proyectos↔keywords↔referentes) ni
    las vistas de calificación; Airtable lo hace no-code y sigue gratis.
- **Consecuencias:**
  - (+) El equipo es autónomo sobre la búsqueda y la curación — cumple "máquina que no depende de
    una persona" y el no-negociable de "lo que el equipo toca es no-code e imposible de romper".
  - (+) El dato de curación queda capturado desde el día 1 → habilita el loop de mejora.
  - (+) Cero costo nuevo (Airtable free); el único fijo sigue siendo el servidor de n8n (~$7/mes).
  - (−) Hay que respetar los topes del free: **retención** (archivar candidatos calificados a
    Supabase para no pasar 1.000 registros) y **batching** de las llamadas n8n↔Airtable (no pasar
    1.000 API calls/mes). Documentado en el modelo de datos.
  - (−) El PAT de Airtable es un secreto nuevo → vive en n8n + gestor, jamás en git (el validador
    escanea el patrón `pat...`).
  - (−) Separar el eje **proyecto** (qué se busca) del eje **voz** (cómo suena) cambia el modelo
    de config: parte de lo que vivía en `clients/<cliente>/short-form-content.yaml` se muda a las
    tablas de Airtable. El yaml del piloto queda como *smoke-test del motor*, no como config final.
