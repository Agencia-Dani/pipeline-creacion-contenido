# 14 — crons_activos.md (Fase 12, Mensajes 22–23) — CRÍTICA

> **Trampa real:** la expresión cron se interpreta en la **timezone configurada**, no en UTC. `0 6 * * * @ {{TIMEZONE}}` = 6am local. Valida explícitamente antes de activar o el cron correrá a la hora equivocada.

## Mensaje 22 — Cron diario de Research

```
Configura el cron diario de Research:

- Nombre: "Research diario + Nugget"
- Schedule: 0 6 * * *
- Timezone: {{TIMEZONE}}
- Resultado esperado: corre a las 6:00am {{CIUDAD}} exacto

QUÉ HACE A LAS 6AM:
[Pegar pasos del playbook_research.md]

ANTES DE ACTIVAR — VALIDACIÓN OBLIGATORIA:
Antes de marcarlo activo, respóndeme estas 3 preguntas:

1. Si la timezone es {{TIMEZONE}}, ¿a qué hora UTC corre exactamente
   este cron? (Calcula explícitamente — no solo confirmes que "está
   configurada").
2. ¿Cuándo es la próxima ejecución? Dame fecha y hora local Y UTC.
3. La expresión "0 6 * * *" ¿significa 6:00am en la timezone
   configurada o 6:00am UTC?

Solo cuando las tres respuestas sean coherentes con "6am hora local"
→ activamos.

Después de activar, dame el ID del cron y guárdalo en crons_activos.md.
```

## Mensaje 23 — Cron de arranque de edición larga (opcional)

```
Configura un cron semanal para arrancar la edición larga:

- Nombre: "Arranque {{EDICION_LARGA_NOMBRE}}"
- Schedule: 30 6 * * [día] (ej: lunes = 1)
- Timezone: {{TIMEZONE}}

Acción: revisar el "Banco de Research", ordenar por score, y mandarme
el top 3 con tensión del lector, por qué publicarlo esta semana, y TU
RECOMENDACIÓN de cuál elegir.

REGLA: si no hay material score 8+ en el banco → me avisas, NO inventas.

Misma validación: dame el cron en hora local Y UTC y la próxima
ejecución antes de activar.
```

---

## Registro de crons activos (lo llena el bot)

```
CRONS ACTIVOS — {{NEWSLETTER_NOMBRE}}

1. Research diario + Nugget
   Schedule: 0 6 * * * @ {{TIMEZONE}}   (= [HH] UTC)
   ID: [...]   Próxima ejecución: [local / UTC]

2. Arranque {{EDICION_LARGA_NOMBRE}}
   Schedule: 30 6 * * [día] @ {{TIMEZONE}}
   ID: [...]
```

> Moraleja del incidente real: configurar `0 11 * * * @ America/Bogota` pensando "6am Colombia = 11 UTC" hace que corra a las **11am Bogotá**. Lo correcto es `0 6 * * * @ America/Bogota`.
