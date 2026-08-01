# ADR-039 — La lista resume, el record se abre: el estándar de interacción del cockpit

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Es una convención de superficie
  sobre [ADR-026](./ADR-026-stack-del-cockpit-propio.md); no cambia datos ni contratos.

- **Contexto:** las pantallas de config del cockpit nacieron cada una a su manera, y la primera
  versión live mostró que el patrón común que habían adoptado —**el formulario completo desplegado
  en la lista**— no escala:

  - **Voces y proyectos:** seis proyectos, cada uno un form con 400–650 caracteres de criterios.
    Encontrar algo exigía scrollear formularios ajenos.
  - **Referentes:** cada una de las 15 filas dibujaba **un checkbox por proyecto**. Con 6 proyectos
    son 90 casillas en pantalla, y el número crece con `referentes × proyectos` — o sea que cada
    proyecto nuevo empeora una pantalla que ya estaba saturada.
  - **Sugeridos:** razón + bio + semillas + la grilla de checkboxes, por cada una de las 8
    propuestas. Era la más saturada de todas.
  - **Las altas** ocupaban una tarjeta permanente al pie de la página, con el formulario siempre
    abierto, para algo que se hace una vez por trimestre.

  El síntoma que reportó el equipo no fue "falta X": fue *"no sé dónde mirar"*. Y el diseño viejo
  ya tenía la respuesta escrita en su propio código — `voces/fila.tsx` plegaba los criterios por
  default *"porque con 6 proyectos abiertos la pantalla dejaba de ser una lista"*. Faltaba llevar
  esa misma conclusión hasta el final.

- **Decisión:** las tres pantallas de config siguen la misma forma, y toda pantalla nueva también:

  1. **La lista muestra un resumen** — lo que uno viene a saber de un vistazo. En Referentes eso es
     *a qué proyectos alimenta* (texto, no casillas); en Voces, *sus proyectos y cuántos videos pide
     cada uno*; en Sugeridos, *la razón recortada a una línea y a qué proyectos entraría*.
  2. **Click en la fila abre el record**, en un `<dialog>` modal con el formulario completo.
  3. **Crear es un botón arriba** que abre ese mismo formulario vacío. Nunca una sección al pie.
  4. **La única excepción que se edita desde la lista es el interruptor de prendido/apagado**
     (`Activa` / `Activo` / `Rastrear`), porque es la acción frecuente y mandarla adentro del record
     le sumaría dos clicks a lo que el equipo hace todas las semanas. **Guarda al toque, optimista,
     y revierte si el servidor dice que no:** un interruptor que necesita un botón «Guardar» al lado
     no es un interruptor.
  5. **El modal es uno solo por lista**, no uno por fila, y su contenido se monta al abrir — así el
     estado local de un form nace limpio y no arrastra la fila anterior.

  La pieza compartida es `components/ui/modal.tsx`, que usa el **`<dialog>` nativo**: trae foco
  atrapado, cierre con Escape y backdrop sin ninguna dependencia. El patrón ya estaba escrito tres
  veces a mano (feed, descartes, históricos); ahora está una.

- **Consecuencias:**
  - **A favor:** las pantallas dejan de crecer con el producto. Referentes pasó de
    `filas × proyectos` casillas a `filas` líneas; agregar el séptimo proyecto ya no empeora nada.
  - **A favor:** un solo estándar que explicar al equipo — *«tocá la fila para ver el detalle»*— en
    vez de tres comportamientos distintos.
  - **A favor:** en Sugeridos el caso normal se resuelve **sin abrir nada**, porque el buscador ya
    viene con los proyectos sugeridos (`referentes_propuestos_proyectos`) y el botón Aprobar está en
    la fila. Abrir es para leer la razón entera o cambiar los proyectos.
  - **En contra:** editar los criterios de un proyecto ahora cuesta un click más. Es el intercambio
    buscado: se paga en la acción rara para cobrar en la frecuente.
  - **En contra:** los formularios tienen su pie de guardar `sticky` adentro del modal en vez de
    usar el slot `pie` del `<Modal>`. No es un capricho: los forms tienen hooks propios, y un padre
    que los montara partidos en dos slots rompería el orden de los hooks.
  - `components/ui/select.tsx` sale de acá: el `<select>` nativo estaba copiado a mano en cuatro
    pantallas con **dos alturas distintas**, que es lo que hacía que las columnas de controles se
    vieran como escalones (el mismo síntoma que reportó el equipo en Ajustes).

- **Alternativas descartadas:**
  - **Radix Dialog** (ya está `radix-ui` en el árbol por shadcn). Descartada: el `<dialog>` nativo
    ya da foco atrapado, Escape y backdrop, y era el patrón de la casa en tres pantallas. Una
    dependencia para algo que la plataforma hace es exactamente lo que el repo evita.
  - **Solo plegar lo que ya había.** El cambio más chico, pero no resuelve los checkboxes tirados ni
    la saturación cuando la lista crezca: mueve el problema, no lo saca.
  - **Carta 100% de solo lectura**, con hasta el interruptor adentro del record. La regla más simple
    de explicar, pero le suma un click a la acción más frecuente del equipo.
