# Herramienta de Reels — Qué es y qué te da (una página)

> **Para:** Andrés · **De:** Mani · **Fecha:** 2026-06 · **Pide:** visto bueno + 2 confirmaciones.
> Versión no técnica; los términos de máquina van *(entre paréntesis)* por si interesan.

---

## La idea en una frase

Una herramienta que **encuentra los mejores videos de referentes en nuestros temas, te los
ordena de "más caliente a más frío", escribe varios borradores de guion en la voz que elijamos,
y deja que el equipo elija los que sirven — y aprende de esa elección para mejorar cada vez.**

No es "buscar referentes a mano cada vez". Es un **banco de conocimiento que se acumula y mejora solo**.

---

## Cómo funciona, en pasos

1. **El equipo arma su tablero** *(una hoja tipo Airtable, gratis, imposible de romper)*: ahí
   guardan los **proyectos** (comunicación, ventas, liderazgo…), las **palabras clave**, los
   **perfiles referentes** que les sirven, y las **voces** (Cora, Alma, 30X…). Esto lo manejan
   ellos mismos, sin depender de mí.

2. **La máquina busca sola** *(un automatizador, n8n, corriendo en un servidor)*: la primera vez
   trae lo de los **últimos 6 meses**; después corre cada día (o cada dos) y trae **solo lo nuevo,
   sin repetir lo que ya analizó**.

3. **Ordena por "mapa de calor", no por corte.** No es "5.000 likes pasa y 4.999 no". Ordena de lo
   más caliente a lo más frío combinando **views, likes, qué tan bueno es el tema, y lo que el
   equipo ha venido eligiendo**. *(Los videos de cuentas gigantes —más de ~700K seguidores— se
   marcan aparte, porque son virales por tamaño y distorsionan el análisis.)*

4. **Escribe varios guiones candidatos** *(con IA, Claude, en la voz elegida)* — no uno, **muchos**.

5. **El equipo elige los que sirven** *(Mamo y Jero califican en el tablero)*. De esas elecciones
   el sistema **aprende qué priorizar y cómo escribir mejor** la próxima vez.

---

## Qué te da a ti

- **Una máquina que corre sola** y mejora con el uso — exactamente la "máquina escalable que no
  depende de una persona" que pediste.
- **El equipo es autónomo:** maneja referentes, temas y elige guiones sin tocar nada técnico.
- **Todo queda registrado** *(una base de datos, Supabase)*: qué se buscó, qué se eligió, qué
  funciona — para medir efectividad de verdad, no a ojo.

## Qué cuesta

- **Fijo: ~$7 USD/mes** *(el servidor donde vive el automatizador, InstaPods)*. El tablero del
  equipo *(Airtable)* y la base de datos *(Supabase)* van en **plan gratis**.
- **Variable por uso** *(scraping de videos, transcripción, IA)*: ya existe hoy; la novedad es que
  ahora se **mide por proyecto**.

## Qué NO hace (para que quede claro)

- **No publica solo.** El equipo elige y publica — el filtro humano es parte de la calidad.
- **No reemplaza al equipo:** les quita lo aburrido (buscar y escribir borradores), no la decisión.

---

## Lo que necesito de ti

1. **Visto bueno** para construirlo así (tablero del equipo + máquina que aprende).
2. **Dos confirmaciones:**
   - El **umbral del flag viral** *(¿~700K seguidores está bien como punto de corte para marcar
     "viral por tamaño"?)*.
   - Las **voces reales** con las que arrancamos *(¿Cora, Alma, 30X institucional? ¿cuál primero?)*.

---

*Detalle técnico (si interesa): arquitectura, decisiones y plan por etapas viven en el repositorio
del proyecto (`PLAN.md`, `docs/adr/`, `core/contracts/airtable-cockpit.md`).*
