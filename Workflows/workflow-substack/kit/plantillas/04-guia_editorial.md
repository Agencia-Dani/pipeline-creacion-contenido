# 04 — guia_editorial.md (Fases 4–5, Mensajes 8–10)

> **La fase más importante.** La guía editorial es la constitución del newsletter: cada decisión futura (título, párrafo, palabra) se evalúa contra ella. Co-créala parte por parte. Luego pídele al bot que la critique y cierra huecos (V1.1).

---

## Mensaje 8 — Co-crear la guía parte por parte

```
Vamos a escribir la guía editorial — la constitución del newsletter.
Define quiénes somos, a quién le hablamos, cómo escribimos y qué
nunca hacemos.

Vamos parte por parte. Por cada una, tú me haces preguntas, yo
respondo, y tú redactas. Cuando una parte está aprobada pasamos a
la siguiente.

Las 10 partes:

PARTE 1 — QUIÉNES SOMOS
  - La identidad: por qué existimos y qué hueco llenamos
  - La voz interna: filtros de calidad imaginarios que cada edición
    debe pasar (ej: "El Estratega + El Riguroso + El Escritor")
  - Cómo nos referimos a nosotros mismos

PARTE 2 — A QUIÉN LE HABLAMOS
  - El lector ideal — perfil único (quién, dónde opera)
  - Su relación con el tema hoy
  - Sus presiones reales esta semana
  - Lo que busca cuando abre el newsletter
  - La pregunta filtro de todo
  - Lo que el lector NO es

PARTE 3 — LAS EDICIONES
  - Por cada tipo de edición: qué es, cadencia, extensión,
    estructura fija (1, 2, 3... secciones)

PARTE 4 — LA VOZ
  - El tono (4-5 ejes: directo/no brusco, riguroso/no académico…)
  - El tratamiento (tú / usted / nosotros / impersonal)
  - En los momentos difíciles (cómo cubrir fracasos o errores ajenos)
  - Palabras y frases que NUNCA usamos (tabla "en lugar de X → Y")

PARTE 5 — LOS ACCIONABLES
  - Niveles de accionable (1 pregunta → 4 playbook)
  - Reglas: qué nivel mínimo va en cada tipo de edición

PARTE 6 — LAS FUENTES
  - Estándar de verificación
  - Jerarquía Tier 1 / 2 / 3
  - Regla de los dos pasos: si no llego a la fuente original en
    ≤2 pasos, no es hecho

PARTE 7 — LO QUE NUNCA PUBLICAMOS
  - Por contenido / formato / tono

PARTE 8 — EL ESTÁNDAR DE CALIDAD
  - 5 preguntas que toda edición debe responder SÍ antes de publicar

PARTE 9 — EL ECOSISTEMA
  - Qué proyecto más amplio rodea al newsletter (si aplica)

PARTE 10 — EVOLUCIÓN DE LA GUÍA
  - Cuándo se actualiza · cómo se versiona

Arrancamos con PARTE 1. Hazme las preguntas.
```

---

## Esqueleto rellenable de la guía (referencia de nivel de detalle)

> Esta es la estructura de la guía real de *AI for Executives V1.0* (~3,500 palabras, 10 partes), parametrizada. **No la copies tal cual** — es para que veas el nivel de granularidad. Rellena cada `{{LLAVE}}` y `[corchete]` con lo tuyo.

```markdown
GUÍA EDITORIAL — {{NEWSLETTER_NOMBRE}}
Documento fundacional

Esta guía es la constitución del newsletter. Cualquier decisión
editorial — un tema, un título, un párrafo, una palabra — se
evalúa contra este documento.

PARTE 1: QUIÉNES SOMOS

La identidad
{{NEWSLETTER_NOMBRE}} existe porque {{HUECO_REAL}}.
Lo que existe en el mercado hoy es:
- [contenido alternativa 1 — por qué no le sirve al lector]
- [contenido alternativa 2]
- [contenido alternativa 3]

La voz interna: el estándar de tres
Cada edición pasa por tres filtros antes de publicarse:
- [Filtro 1 — ej: El Estratega — qué garantiza]
- [Filtro 2 — ej: El Riguroso — qué garantiza]
- [Filtro 3 — ej: El Escritor — qué garantiza]
Cuando los tres están satisfechos, publicamos.

Cómo nos referimos a nosotros mismos
[Define la voz: ¿primera persona del plural? ¿impersonal? ¿autoridad
directa? Ejemplo AI4E: nunca "nosotros creemos"; voz del análisis,
no de un equipo detrás de una marca.]

PARTE 2: A QUIÉN LE HABLAMOS

El lector ideal: {{AUDIENCIA_PRECISA}}
Su relación con el tema hoy: {{LECTOR_RELACION_TEMA}}
Sus presiones reales: {{LECTOR_PRESIONES}}
Lo que busca cuando abre el newsletter: [qué se lleva de cada edición]

La pregunta que siempre nos hacemos antes de publicar:
"{{PREGUNTA_FILTRO}}"
Si la respuesta es no, no publicamos.

Lo que el lector NO es: {{LECTOR_NO_ES}}
Escribirle a cualquiera de esos perfiles es traicionar al nuestro.

PARTE 3: LAS EDICIONES

{{EDICION_LARGA_NOMBRE}} — {{EDICION_LARGA_DIA}}
Qué es: [una línea]
Extensión: {{EDICION_LARGA_PALABRAS}} palabras.
Estructura fija:
  {{ESTRUCTURA_EDICION_LARGA}}
[Repite el bloque por cada tipo de edición de tu cadencia]

PARTE 4: LA VOZ

El tono
- [eje 1 — ej: directo sin ser brusco]
- [eje 2 — ej: riguroso sin ser académico]
- [eje 3] · [eje 4]

El tratamiento
- [tú / usted / impersonal — sé explícito]

En los momentos difíciles
[Cómo cubres un fracaso o error ajeno: analítico, empático, útil.
Lo que nunca haces: criticar, moralizar, usar el error para
demostrar que sabías más.]

Palabras y frases que no usamos
| En lugar de... | Usamos... |
|---|---|
| [muletilla 1] | [reemplazo] |
| [muletilla 2] | [reemplazo] |

PARTE 5: LOS ACCIONABLES
Nivel 1 — La pregunta. [...]
Nivel 2 — El diagnóstico. [...]
Nivel 3 — La decisión. [...]
Nivel 4 — El playbook. [...]
Regla: {{EDICION_LARGA_NOMBRE}} siempre tiene Nivel 3 o 4.

PARTE 6: LAS FUENTES
El estándar de verificación: [3 condiciones por dato]
Jerarquía:
  Tier 1 — [usamos directamente]
  Tier 2 — [con verificación adicional]
  Tier 3 — [solo contexto, nunca fuente única]
La regla de los dos pasos: si un dato no se traza a su fuente
original en ≤2 pasos, no se publica como hecho.

PARTE 7: LO QUE NUNCA PUBLICAMOS
Por contenido: [...]
Por formato: [...]
Por tono: [...]

PARTE 8: EL ESTÁNDAR DE CALIDAD
Antes de publicar, estas 5 preguntas deben dar "sí":
1. ¿Puede el lector encontrar esto en otro lado?
2. ¿Hay al menos un accionable de Nivel 3 o superior?
3. ¿La apertura resuelve una tensión que el lector ya siente?
4. ¿Cada dato tiene fuente, contexto e implicación?
5. ¿Le sirve a alguien con {{LECTOR_TIEMPO}} y {{LECTOR_CONTEXTO_TIPICO}}?

PARTE 9: EL ECOSISTEMA
[Si el newsletter es parte de un proyecto más amplio ({{ORGANIZACION}}),
explícalo: cómo aparecen los stakeholders, máximo de menciones, etc.
Si no aplica, bórralo.]

PARTE 10: EVOLUCIÓN DE LA GUÍA
Documento vivo. Se actualiza cuando:
- Aprendemos algo del lector que cambia cómo le hablamos
- Identificamos un patrón que funciona y no estaba documentado
- Algo que creíamos no funciona en la práctica
- El mercado cambia y afecta nuestra propuesta de valor
Cada actualización se documenta con fecha y razón.
```

---

## Mensaje 9 — Pedir crítica honesta (Fase 5)

```
Ya pegamos la guía editorial. Antes de pasar al master prompt,
quiero que la critiques honestamente.

¿Qué le falta para ser world-class? Mira newsletters de referencia
(Morning Brew, The Hustle, Stratechery, Lenny's, Not Boring) y dime
qué tienen ellos que nosotros no.

Dame mínimo 3-5 huecos concretos. Sin floreos. Si la guía está bien
en algo, dilo también — quiero el termómetro real.

Después de tu crítica, yo decido cuáles huecos cerramos. Los que sí,
los desarrollas y los integramos a una V1.1.
```

> Huecos típicos que el bot debería detectar: métricas de éxito, guía de subject lines, workflow de producción, banco de temas, ejemplos concretos de voz (malo → corregido).

## Mensaje 10 — Cerrar huecos seleccionados

```
De los huecos que identificaste:
- SÍ desarrollar: [N° y N°]
- DESPUÉS: [N° y N°]
- NO aplica: [N° y N°]

Por cada SÍ desarrollar, redáctalo y agrégalo a la guía editorial.
Sube versión a V1.1 con un changelog al final explicando qué se
añadió y por qué.
```
