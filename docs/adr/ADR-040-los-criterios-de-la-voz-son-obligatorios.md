# ADR-040 — Los criterios de la voz son obligatorios

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Toca `core/schema/`
  (migración [014](../../core/schema/014_criterios_voz_y_perillas.sql)) y la validación de servidor.

- **Contexto:** `proyectos.criterios_relevancia` es `not null` desde la migración `009` y el form lo
  exige desde antes del corte. `voces.criterios_relevancia`, en cambio, nació nullable y opcional: el
  alta de voz lo etiquetaba literalmente *"Criterios de la voz (opcional)"* y `validarVoz` solo
  chequeaba el nombre.

  La asimetría no tenía razón de ser, y es peligrosa por cómo se usan los dos campos. **Los criterios
  de la voz se SUMAN a los del proyecto**, no los reemplazan — el helper de la pantalla ya lo dice:
  *"Lo que vale para TODOS sus proyectos. El filtro los suma a los criterios de cada proyecto"*. O sea
  que la voz es la mitad del juicio de relevancia de cada uno de sus proyectos.

  Una voz sin criterios no rompe nada. El gate corre igual, la corrida sale verde, y el filtro juzga
  con la mitad del contexto que debería. **Es exactamente la forma de los cuatro hallazgos de D7:** no
  falla, sale en verde, y deja un número peor de lo que debería sin que nadie se entere. La diferencia
  es que acá el síntoma no es un cero, es basura que pasa el filtro — más difícil de ver todavía.

  Y el dato refuerza que el campo no es opcional en la práctica: **las 3 voces vivas tienen entre 545
  y 649 caracteres de criterios**. Nadie lo dejó vacío nunca. Lo que estaba abierto era la puerta.

- **Decisión:** los criterios de la voz son obligatorios, **al crear y al editar**, y en las dos capas:

  1. **Validación de servidor** — `validarVoz` (`domain/proyectos.ts`) rechaza vacío o solo espacios,
     con un mensaje en el idioma del equipo y no de la constraint. Igual que `validarProyecto` ya
     hacía con los suyos.
  2. **`not null` en Postgres** — porque la fachada `/api/engine/run-plan` sirve ese campo al motor, y
     una escritura que no pase por el cockpit (un `UPDATE` a mano, un import) no debe poder abrir el
     agujero de nuevo. El tipo de TypeScript deja de ser `string | null`.

  El label pierde el "(opcional)" y el botón de crear se deshabilita hasta que haya criterios, igual
  que ya hace el alta de proyecto.

- **Consecuencias:**
  - Para n8n el campo pasa de "a veces null" a "siempre string". Es un **aflojamiento** del contrato,
    no un cambio: ningún consumidor puede romperse por recibir menos nulls. No hace falta re-importar.
  - Una voz vieja sin criterios quedaría trabada al editar hasta llenarlos. **Hoy no existe ninguna**,
    y la migración corre limpia; si algún día apareciera, trabarla es el comportamiento correcto.
  - No se toca `voces.descripcion`, que sigue siendo opcional. Es a propósito: la descripción es para
    el equipo y el filtro no la lee. El helper text nuevo lo aclara, porque los dos campos se
    confundían.

- **Alternativa descartada:** exigirlo solo al crear. Deja abierta la puerta por la que se pierde el
  dato (borrar el contenido al editar), y el costo de cerrarla era cero: no hay ninguna fila que
  quedaría trabada.
