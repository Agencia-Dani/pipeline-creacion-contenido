# ADR-045 — Se borra solo lo que nunca produjo nada

- **Estado:** aceptada — 2026-08-02 (decisión de Mani, arquitecto). Solo cockpit: no toca el motor,
  ni los contratos, ni el schema. **Sin migración y sin re-import.**

- **Contexto:** hasta acá el equipo de redes podía crear y editar voces, proyectos y referentes, pero
  no borrarlos. Lo único disponible era apagar, y apagar deja la fila en la lista para siempre: un
  proyecto que se creó con el nombre mal, una cuenta cargada con un typo, la voz de un cliente que no
  arrancó. Mani pidió poder borrar los tres.

  Al mirar las FK aparecieron dos mundos distintos, no uno:

  **Los referentes salen limpios.** `app.referentes_proyectos` cascadea (migración `012`) y la
  historia de la cuenta **no se guarda por FK**: `candidatos.referente` y `descartes.referente` son
  TEXTO con el handle, y `v_senal_seleccion` sale de `outputs`, también por texto. Borrar la fila la
  saca de las próximas corridas y del banco, y no se lleva nada. Si mañana se vuelve a agregar el
  mismo handle, la salud y la señal de selección vuelven solas.

  **Las voces y los proyectos no.** `candidatos.proyecto_id`, `candidatos.voz_id`,
  `descartes.proyecto_id` y `proyectos.voz_id` son FK **sin `on delete`**: Postgres rechaza el DELETE.
  Medido el 02/08, de 6 proyectos solo *Trading Psychology* estaba libre; los otros cinco tenían entre
  10 y 60 filas colgando (*Comunicación de parejas*: 54 candidatos + 6 descartes).

  Las tres salidas posibles se pusieron sobre la mesa: (a) borrar solo lo limpio, (b) `on delete
  cascade` en candidatos y descartes, (c) `on delete set null`.

- **Decisión:** **(a) — un registro se borra solo si nunca produjo nada.** El botón está siempre; si
  hay historia colgando el servidor rechaza y dice **cuánta** («*Comunicación en empresas tiene 24
  videos en el feed. Borrar se llevaría esa historia; apagar hace lo mismo sin perderla*»).

  Por qué no la (b): el feed y los descartes son la única evidencia de qué juzgó la máquina y qué
  decidió el equipo, y desde la pantalla el botón que borra un proyecto con 54 juicios pagos es
  idéntico al que borra uno vacío. Apagar ya cubre el caso frecuente («no quiero que esto corra más»)
  sin perder nada; borrar queda para lo que nunca llegó a existir de verdad.

  Por qué no la (c): dejaría filas en el feed apuntando a un proyecto que no existe. Cambia un error
  claro de Postgres por datos que se ven bien y no significan nada, que es exactamente la familia de
  fallo que este repo viene cazando desde D7.

  **Qué NO retiene, a propósito:** los pares `referentes_proyectos` y
  `referentes_propuestos_proyectos` cascadean. Son la *asignación* (a qué proyecto alimenta esta
  cuenta), no historia: si el proyecto deja de existir, esa asignación no significa nada.

  La regla vive en `apps/dashboard/domain/borrado.ts`, con tests. El conteo arma **la frase**; la FK
  sigue siendo **la garantía** — entre contar y borrar puede entrar una corrida, y el `23503` se
  traduce a una frase legible en vez de mostrar un error de Postgres.

  En la superficie sigue ADR-039: el borrado vive **adentro del record**, nunca en la lista, a la
  izquierda del pie y lejos de Guardar. Confirma en el lugar (el botón se reemplaza por la pregunta),
  no con `window.confirm` —que se ve como un error del browser y no se puede escribir en el idioma del
  equipo— ni con un modal adentro del modal.

- **Consecuencias:**
  - Hoy, de los 6 proyectos vivos, **solo *Trading Psychology* se puede borrar**. Es lo esperado, no
    una limitación a resolver después: los otros cinco están en producción y tienen feed.
  - **El `@casper_smc` duplicado que el handoff arrastra desde el 01/08 ya se puede limpiar solo**,
    sin SQL a mano. Antes de borrar una de las dos filas hay que mirar qué proyectos tiene cada una:
    si difieren, borrar la equivocada le saca fuentes a un proyecto.
  - Borrar un proyecto puede dejar **cuentas prendidas sin destino**. El mensaje de éxito manda a
    Referentes, donde el aviso de «cuentas sin proyecto» ya existía desde antes.
  - Los tres borrados escriben en `app.eventos` **antes** del DELETE y con los criterios adentro: es
    lo único que queda del registro. `app.eventos` no tiene FK a proyecto ni a voz, así que el rastro
    sobrevive. Si el DELETE falla queda un evento de un borrado que no pasó — molesto, y mucho menos
    grave que un borrado sin rastro (mismo criterio que `sugeridos/actions.ts`).
  - El histórico canónico (`outputs`, ADR-014) **no depende de nada de esto**: no tiene FK a proyecto
    ni a voz. Lo que el sistema aprendió sobre cada referente sobrevive a cualquiera de estos borrados.
  - Si algún día hace falta borrar un proyecto con feed, la vía es un ADR nuevo con migración —
    probablemente una acción explícita de «vaciar el feed del proyecto» antes que un cascade mudo.
