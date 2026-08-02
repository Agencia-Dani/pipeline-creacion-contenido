# ADR-043 — El techo se muestra, la entrega no se promete

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Solo superficie: no toca datos,
  contratos ni el motor.

- **Contexto:** ADR-038 dejó el `N` del proyecto como la única perilla de cantidad, obligatoria. Lo
  que no resolvió es que **el equipo puede escribir cualquier número sin ninguna señal de si es
  alcanzable**. Un proyecto con 3 referentes que pide 50 videos por corrida no está pidiendo mucho:
  está pidiendo algo que la máquina no puede darle, y se entera una semana después, cuando la corrida
  entrega 10.

  Las tres corridas medidas dicen `razon_faltante: supply` en todos los proyectos. El cuello no es
  ninguno de los cortes: es cuántas cuentas hay. Y la palanca más barata está sin usar — al escribir
  esto hay **6 cuentas propuestas esperando aprobación** en `/curar/sugeridos`.

  La tentación obvia es pronosticar: *"con 3 cuentas te van a llegar ~12"*. **Eso ya se descartó**, y
  el razonamiento está escrito en `domain/corrida.ts`:

  > *"Los tres números son medidos, ninguno es un pronóstico. Es a propósito: `n` es un techo duro y la
  > entrega es best-effort sobre el supply real, así que mostrar solo `pide 15` sería prometer algo que
  > la máquina no puede cumplir, y eso es peor que decir «hasta»."*

  Una estimación basada en tasas de gate históricas es ruidosa (con pocas corridas, muy ruidosa), y en
  cuanto el equipo la lea como promesa vuelve el problema que ADR-038 cerró al sacar la palabra
  «hasta» de Operar.

- **Decisión:** se muestra **el techo de lo crudo**, que no es un pronóstico sino una multiplicación:

  ```
  cuentas activas del proyecto × «Resultados por cuenta de referente» = videos crudos que la corrida mira
  ```

  Con 3 cuentas y el knob en 40 son **120**. Pedir 50 de 120 es pedir que pase el filtro el 42%, y las
  tasas reales por cuenta están a la vista en `/curar/referentes`. El número no predice nada: es un
  límite superior aritmético, verdadero por construcción, y dice todo lo que hace falta saber.

  Va en los tres momentos en que importa, **y en ninguna página nueva**:

  1. **Debajo del campo `N`**, en vivo mientras se escribe. Es el único momento en que la decisión se
     está tomando.
  2. **En `/operar`**, al lado de `pide · cuentas · la última entregó`. Es lo que vuelve legible a
     `cuentas`, que ADR-038 puso ahí justamente como *"la palanca con la que se cambia esa realidad"*.
  3. **En `/entender`**, un bloque que explica el embudo al lado de los números del embudo que ya se
     renderizan ahí.

  **Avisa, no bloquea.** Un `N` alto puede ser deliberado (se van a sumar cuentas la semana que viene),
  y convertir una heurística en una regla dejaría al equipo trabado por un referente nuevo que todavía
  no tiene historia. El aviso lleva las dos palancas como links: Sugeridos, diciendo cuántas hay
  esperando, y Referentes.

- **Consecuencias:**
  - Varios proyectos van a mostrar el aviso apenas esto salga. **No es un bug de la pantalla: es el
    estado real**, el mismo que ADR-038 ya anticipó cuando sacó la palabra «hasta».
  - No hay página de recomendaciones. Una página así se lee una vez y después nadie vuelve, y el
    momento en que hace falta saberlo es cuando se está escribiendo el número. El detalle largo del
    embudo ya existe en [el onboarding §7](../onboarding-equipo-redes.md) — un hecho, un dueño.
  - El techo ignora el dedup y el fan-out, así que **sobreestima**. Es lo correcto para un límite
    superior: si ni siquiera el techo alcanza, la conclusión es segura.
  - Si alguien más adelante quiere el pronóstico de verdad, la solución de fondo ya está identificada
    en ADR-038 (escalar lo que se le pide a Apify por proyecto: `ceil(N / (referentes × tasa))`). Eso
    hace que `N` sea vinculante en vez de solo informado, y es un ADR propio con re-import.
