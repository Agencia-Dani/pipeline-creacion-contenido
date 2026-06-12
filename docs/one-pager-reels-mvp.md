# Herramienta de Reels — Qué es y qué te da (una página)

> **Para:** Andrés · **De:** Mani · **v2 — actualizada con lo acordado en la conversación del
> visto bueno (2026-06-12;
> [transcripción](./transcripciones/2026-06-12-visto-bueno-workflow.md)). La v1 presentada vive
> en el historial del repo. Versión no técnica; los términos de máquina van *(entre paréntesis)*.

---

## La idea en una frase

Una herramienta que **encuentra los mejores videos de referentes en nuestros temas — sobre todo
en otros idiomas —, los ordena de "más caliente a más frío", te entrega cada uno transcrito al
español tal cual es, y deja que el equipo elija los que sirven — aprendiendo de esa elección
para priorizar mejor cada vez.**

No es "buscar referentes a mano cada vez". Es un **banco de contenido que se acumula, queda
registrado y mejora solo**.

## Cómo funciona, en pasos

1. **El equipo arma su tablero** *(Airtable, gratis, imposible de romper)*: los **proyectos**
   (comunicación, ventas, liderazgo…), las **palabras clave**, los **perfiles referentes** y las
   **voces** (a cuál va dirigido cada contenido). Majo y Jero lo manejan solos, y pueden crear o
   cambiar voces cuando quieran — sin depender de un técnico.
2. **La máquina busca sola** *(n8n en un servidor)*: la primera vez trae lo de los **últimos 6
   meses**; después corre cada día y trae **solo lo nuevo, sin repetir lo ya analizado**.
   **Prioriza creadores en inglés, portugués, italiano y francés** — lo que todavía no circula
   en español.
3. **Ordena por "mapa de calor", no por corte:** combina **likes, vistas y engagement**, el tema,
   el idioma, y **lo que el equipo ha venido eligiendo**. *(Los videos de cuentas gigantes —más
   de ~700K seguidores— se marcan aparte: son virales por tamaño y distorsionan el análisis.)*
4. **Entrega cada video transcrito al español, tal cual** *(traducción literal si está en otro
   idioma — **no** reescribe ni inventa)*: cada script queda en un **documento con su link**,
   junto al link del video original y sus métricas.
5. **El equipo elige los que sirven** *(Majo y Jero califican en el tablero)*. El mapa de calor
   **se rehace solo con los elegidos**, y el sistema **aprende qué priorizar** la próxima vez.
6. **Todo queda en un histórico descargable** *(Google Sheets → Excel)*: qué se seleccionó,
   cuándo, para qué voz — con sus links y métricas. Se puede medir efectividad de verdad.

## Qué te da a ti

- **Una máquina que corre sola** y mejora con el uso — la "máquina escalable que no depende de
  una persona" que pediste.
- **El equipo es autónomo:** maneja referentes, temas y voces, y elige contenido sin tocar nada técnico.
- **Todo medible:** el histórico dice qué se procesó, qué se eligió y qué funciona — no a ojo.

## Qué cuesta

- **Fijo: ~$7 USD/mes** *(el servidor del automatizador)*. El tablero *(Airtable)*, la base de
  datos *(Supabase)* y el histórico *(Sheets)* van en **plan gratis**.
- **Variable por uso** *(scraping, transcripción, traducción)*: ya existe hoy; ahora se **mide
  por proyecto** — y bajó, porque ya no se generan guiones con IA, solo se traduce cuando hace falta.

## Qué NO hace (para que quede claro)

- **No publica solo.** El equipo elige, adapta y publica — el filtro humano es parte de la calidad.
- **No reescribe el contenido.** Entrega el material tal cual es; la creatividad queda en el equipo.

## Lo único pendiente de ti

**¿Con qué voz/proyecto arrancamos?** *(Cora, Alma, 30X institucional — el equipo puede
cambiarla o sumar más después, cuando quiera.)*

---

*Detalle técnico (si interesa): la ejecución vive en el repositorio (`ROADMAP.md`), las
decisiones en `docs/adr/` y el diseño en `PLAN.md`.*
