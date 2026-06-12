# 13 — playbook_nuggets.md (Fase 11, Mensaje 21)

> Alertas cortas (2–5 líneas) que se disparan solo con score 9–10. Pégala al bot para que la guarde como `playbook_nuggets.md`.

```markdown
PLAYBOOK DE NUGGETS

QUÉ ES UN NUGGET
Una alerta corta — 2 a 5 líneas — que se manda cuando aparece una
noticia score 9-10. Contenido independiente del newsletter largo;
mantiene la conversación entre ediciones y refuerza autoridad editorial.

CUÁNDO SE DISPARA
Solo cuando una pieza nueva del research diario llega a score 9 o 10.
Nunca para score ≤ 8.

PRIORIDAD
Si un día tiene Research + Nugget + arranque de borrador largo:
1° Nugget   2° Borrador

ESTRUCTURA DEL NUGGET
Hook (1 línea): el dato concreto que cambia algo
Contexto (1-2 líneas): por qué importa para el lector
Implicación (1 línea opcional): qué decisión cambia esto
Fuente: [nombre] · [link] · [fecha]

CRITERIOS NO NEGOCIABLES
- Cero adjetivos vacíos
- Cero predicciones
- Sí o sí fuente Tier 1
- Aplica el Master Prompt completo aunque sea corto

FLUJO
1. Detecto score 9-10 en el research diario
2. Escribo el borrador del nugget
3. Mando por Telegram al editor: el borrador + fuente + link
4. Editor aprueba con "ok" o pide ajuste
5. Una vez aprobado, queda guardado en Notion con tag "Nugget"
6. Editor lo publica donde corresponda ({{PLATAFORMA}} notes,
   comunidad, redes)
```
