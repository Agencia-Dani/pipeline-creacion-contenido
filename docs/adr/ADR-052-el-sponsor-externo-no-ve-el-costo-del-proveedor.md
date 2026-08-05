# ADR-052 — El sponsor no ve lo que cuestan los proveedores

- **Estado:** aceptada — 2026-08-02. Superficie sobre [ADR-026](./ADR-026-stack-del-cockpit-propio.md);
  consecuencia directa de que las empresas de [ADR-051](./ADR-051-el-acceso-es-membresia-explicita.md)
  sean **clientes externos**. No toca datos ni el motor.

> ⚠️ **Enmienda 2026-08-05 — el público de Entender creció y este ADR ahora sostiene un supuesto.**
> El `operador` entró a la zona (plan-cockpit §2.1), así que el corte `rol !== "sponsor"` **ya no
> significa "solo la agencia ve costos"**: significa "todos menos el sponsor", y hoy eso incluye al
> equipo. Se aceptó con una razón de hecho, no de diseño: **todos los operadores son gente de
> adentro** (verificado contra las 7 membresías vivas). **El día que alguien de una empresa cliente
> reciba `operador`, este ADR queda violado sin que nada falle** — el gate falla hacia mostrar. El
> arreglo ya está escrito acá abajo y descartado por innecesario: `rol === "dev"`. Deja de ser
> innecesario ese día.

- **Contexto:** el rol `sponsor` ve **una sola zona: Entender**
  ([`domain/roles.ts`](../../apps/dashboard/domain/roles.ts)). Y Entender muestra
  `app.v_costos_semana`, que cruza `runs.metricas` contra **`app.tarifas`**: la tabla que dice
  `supadata: 0.009 USD por video transcrito`, `apify_ig: 0.0023 por result`, y así con los ocho
  servicios (migración [`008`](../../core/schema/008_entender_tarifas_y_vistas.sql)).

  Mientras las empresas eran internas eso era un detalle operativo. Con el jefe de un cliente
  externo entrando al cockpit, **la única pantalla que tiene es la que le muestra lo que te cuestan
  tus proveedores** — o sea tu margen, desglosado por servicio y por semana.

  No es un bug: la vista hace exactamente lo que se diseñó que hiciera. Es que el público cambió.

- **Decisión:** **el bloque de costos de Entender no se le muestra al rol `sponsor`.** El resto de la
  zona —el embudo, la calidad del gate, el desempeño por referente, los descartes auditados— se
  queda: es lo que le sirve y es sobre lo que quiere opinar.

  El corte va **en el servidor**, no escondiendo el bloque en React: `lib/entender.ts` no pide
  `v_costos_semana` si el rol no la puede ver. La regla de la casa es *"la UI esconde, el servidor
  impide"* (plan-cockpit §3.2), y un `display: none` sobre datos que igual viajaron al browser no
  esconde nada.

- **Alternativas descartadas:**
  - **Dejar Entender completo.** Solo tiene sentido si el modelo comercial es transparente —le
    facturás costo más fee y querés que lo vea—. No es el caso, y el default no puede ser mostrar.
  - **Mostrarle el costo que vos le facturás, no el que pagás.** Es la opción más honesta de cara al
    cliente y probablemente el destino final. Descartada por ahora porque necesita una **tarifa de
    venta por cliente** además de la de compra, y eso es una decisión comercial que todavía no está
    tomada. Cuando exista, se reabre: la vista ya está, le faltaría el otro precio.
  - **Una pantalla propia para el sponsor externo.** Lo más limpio y lo más caro: una zona nueva
    donde hoy alcanza con no servir un bloque. Si el feedback dice que Entender le queda grande o le
    queda chica, ahí sí.
  - **Sacar `app.tarifas` de la base.** No resuelve nada: el problema no es dónde vive la tarifa,
    es a quién se le muestra el resultado.

- **Consecuencias:**
  - (+) Un cliente externo puede tener login sin que eso publique la estructura de costos de la
    agencia.
  - (+) Cambio chico y reversible: es un `if` de rol en la costura donde ya se decide qué se lee.
  - (−) **El sponsor deja de ver el costo, y eso incluye al jefe de la propia agencia** si su usuario
    tiene rol `sponsor`. Con el rol viviendo en la membresía (ADR-051) se resuelve solo —en su
    empresa puede ser `dev`— pero hay que acordarse de darle ese rol y no el otro.
  - (−) `Entender` pasa a renderizar distinto según el rol, o sea que la pantalla tiene dos formas.
    Ya las tenía (los knobs `dev` de [ADR-038](./ADR-038-una-sola-perilla-de-cantidad.md)), así que
    no es un patrón nuevo — pero conviene que la de sponsor se mire una vez con ojos de cliente antes
    de darle el primer acceso.

- **Toca:** `apps/dashboard/lib/entender.ts` (no leer la vista si el rol no la puede ver) ·
  `app/[cliente]/[pipeline]/(zonas)/entender/` (el bloque y su explicación). **`app.tarifas` y
  `v_costos_semana` no cambian.**
