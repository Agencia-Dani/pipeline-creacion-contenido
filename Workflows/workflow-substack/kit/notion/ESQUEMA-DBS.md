# Esquema de las 2 databases de Notion

> Fases 10. Pega cada bloque al bot pidiéndole que cree la DB. **Antes de crear cada una, pídele que te muestre las columnas para confirmar.** Después de crearla, pídele el ID y guárdalo en `plantillas/10-notion_config.md`.

---

## DB 1 — "Banco de Research"

Es el repositorio de todo lo que pasa el filtro (score 5+) en el research diario.

```
Crea una database en mi Notion llamada "Banco de Research" con
estas columnas EXACTAS:

1. Título — el hook editorial (texto, con fuente + hora debajo)
2. Score — número del 5 al 10
3. Fuente — nombre de la fuente
4. Tipo de contenido — Select: News / Análisis / Caso de uso /
   Reporte / Señal temprana / Entrevista
5. Formato sugerido — Select: {{EDICION_LARGA_NOMBRE}} /
   [otros tipos de edición de tu cadencia] / Múltiple
6. Resumen ejecutivo — 2-3 líneas: qué pasó + implicación
7. Estado — Select: Nuevo / Seleccionado / En producción /
   Publicado / Descartado

Antes de crearla, muéstrame las columnas para confirmar.
Después de crearla, dame el ID y guárdalo en notion_config.md.
```

### Referencia de la tabla

| Columna | Tipo | Valores |
|---|---|---|
| Título | Text | Hook + fuente + hora |
| Score | Number | 5–10 |
| Fuente | Text | Nombre de la fuente |
| Tipo de contenido | Select | News · Análisis · Caso de uso · Reporte · Señal temprana · Entrevista |
| Formato sugerido | Select | `{{EDICION_LARGA_NOMBRE}}` · … · Múltiple |
| Resumen ejecutivo | Text | 2–3 líneas |
| Estado | Select | Nuevo · Seleccionado · En producción · Publicado · Descartado |

---

## DB 2 — "Pipeline de Contenido"

Es el flujo de producción. **El borrador del artículo va DENTRO de la página**, no en una columna.

```
Crea una segunda database llamada "Pipeline de Contenido" para
el flujo de producción.

Columnas:
- Título
- Tipo de edición
- Estado: Brief / Borrador / Listo para revisión / Aprobado /
  Publicado
- Día de publicación
- Relación con "Banco de Research" (qué entradas se usaron como
  fuente)

El borrador del artículo va DENTRO de la página (no en una columna).
Yo abro el título y todo está adentro listo para leer y editar.

Dame el ID. Guárdalo en notion_config.md.
```

### Referencia de la tabla

| Columna | Tipo | Valores |
|---|---|---|
| Título | Text | — |
| Tipo de edición | Select | `{{EDICION_LARGA_NOMBRE}}` · … |
| Estado | Select | Brief · Borrador · Listo para revisión · Aprobado · Publicado |
| Día de publicación | Date | — |
| Relación con Banco de Research | Relation → DB 1 | Entradas usadas como fuente |
