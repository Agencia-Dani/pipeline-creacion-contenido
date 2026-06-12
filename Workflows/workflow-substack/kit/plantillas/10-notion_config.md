# 10 — notion_config.md (Fases 1 y 10, Mensajes 4, 17–18)

> ⚠️ **NUNCA commitees el token real a git.** Este archivo es solo la plantilla del mensaje. El `NOTION_TOKEN` vive en el workspace del bot, no en el repo.

## Mensaje 4 — Dar acceso a Notion (Fase 1)

```
Mi NOTION_TOKEN es: secret_xxxxxxxxxxx
Mi página HQ es: [URL_DE_NOTION]

Antes de crear nada, lista las páginas a las que tienes acceso
para verificar que la integración está bien conectada.
Guarda el token en notion_config.md.
```

> Pasos previos (una vez): crea el token en `notion.so/my-integrations → New`. Crea la página HQ → Share → Add connection (conéctala con tu integración).

---

## Registro de IDs (lo llena el bot tras crear las DBs en Fase 10)

```
NOTION — {{NEWSLETTER_NOMBRE}}

Token: [guardado en el workspace del bot — NO en git]
Página HQ: [URL]

DB 1 — Banco de Research
  ID: [lo da el bot al crearla]

DB 2 — Pipeline de Contenido
  ID: [lo da el bot al crearla]
```

> El esquema completo de las dos databases está en [`../notion/ESQUEMA-DBS.md`](../notion/ESQUEMA-DBS.md).
