# ADR-033 — Un dueño por CAMPO, no por tabla, mientras n8n siga escribiendo en Airtable

- **Estado:** aceptada — 2026-07-31 (decisión de Mani, arquitecto). Refina
  [ADR-027](./ADR-027-postgres-fuente-unica-de-config.md) para el corte 3/4 de
  [D5](../agents/plan-cockpit-propio.md#d5--corte-de-la-config-dominio-por-dominio-sin-tocar-n8n)
  y fija hasta cuándo vive la traducción de ids que arrastran los cortes 2/4 y 3/4.

- **Contexto:** los cortes de D5 mueven un dominio entero de Airtable a Postgres. Con *Ajustes* y
  *Referentes* eso funcionó porque **todos** los campos de esas tablas los escribía una persona.
  *Proyectos* rompe el patrón: de sus 8 campos, **2 no los escribe nadie del equipo**.

  `Destilar criterios` del archivado le pide a Haiku, cada domingo, que resuma lo que el equipo
  calificó, y PATCHea `criterios_aprendidos` + `advertencia_criterios` en la tabla `Proyectos` de
  Airtable ([ADR-022](./ADR-022-loop-aprendizaje-criterios.md)). El motor lee `criterios_aprendidos`
  por la fachada y lo suma al prompt del gate. **Ese escritor está en n8n y no se mueve hasta D7.**

  Cortar *Proyectos* entero a Postgres habría dejado el loop así: el archivado escribe en una tabla
  congelada, el motor lee otra fuente, y lo destilado no llega nunca. **Sin un solo error**, y
  encima estrenando la pantalla que existía justamente para mostrar `advertencia_criterios` — que
  hoy no muestra ninguna superficie (el archivado gasta un Haiku cada domingo escribiendo un aviso
  que nadie lee, [plan-cockpit §D5](../agents/plan-cockpit-propio.md)).

  Al medir el dato vivo apareció el segundo hecho, que la documentación negaba: **`proyectos[].id`
  y `voces[].id` no pueden dejar de ser record ids de Airtable en este corte.** Cuatro consumidores
  vivos los usan como tales — `Preparar batch Airtable` escribe `Candidatos.proyecto`/`.voz` como
  *links*, `Preparar batch Descartes` escribe `Descartes.proyecto`, `Destilar criterios` PATCHea
  `Proyectos` por ese id, y esa misma destilación cruza los candidatos calificados contra él. Y los
  POST van con **`typecast: true`**, o sea un uuid **no daría error**: Airtable crearía un proyecto
  fantasma con el uuid de nombre, y el candidato quedaría enlazado a él. El contrato y
  `lib/referentes.ts` decían que estas traducciones "se caen en el corte 4/4". Es falso.

- **Decisión:**
  1. **La unidad de propiedad es el campo, no la tabla.** `app.proyectos` es el dueño de lo que
     edita una persona (nombre, descripción, criterios, voz, activo, N). `criterios_aprendidos` y
     `advertencia_criterios` **siguen siendo de Airtable** mientras su único escritor viva en n8n:
     la fachada los lee de ahí y los mezcla al servir (`lib/airtable.ts::leerCriteriosDestilados`),
     y la pantalla los muestra **read-only**.

     Esto no afloja el principio de ADR-027 §1 —"si un valor se puede editar en dos lados, uno de
     los dos está mal"— lo aplica al pie: son datos distintos, con un escritor cada uno, y cada uno
     se lee de donde su escritor lo deja. Lo que estaría mal es copiarlos a Postgres y tener dos.
  2. **Esa lectura es fail-open.** Si Airtable no responde, la corrida sale con los criterios
     manuales en vez de no salir. Lo aprendido mejora el gate, no es la condición para juzgar
     (plan-cockpit §3.7). El fail-closed del contrato lo sostienen los campos que sí son config.
  3. **La traducción de ids muere en D7, no en el corte 4/4.** Mientras el motor escriba Candidatos
     y Descartes en Airtable, `voces[].id`, `proyectos[].id` y `referentes[].fields.proyecto`
     viajan en record ids. Se cae sola cuando D7 saque esas escrituras — no antes, y no por partes.
  4. **Un proyecto o una voz que nace en la app acuña su record id en Airtable** (`crearRegistro`,
     con el nombre y nada más). Es la consecuencia obligada de (3): sin record id, sus candidatos
     se escribirían con `typecast` y un uuid, que es el proyecto fantasma de arriba. La llamada es
     ~15 líneas y se borra en D7 junto con el resto.

- **Consecuencias:**
  - **A favor:** el loop de ADR-022 sigue vivo durante toda la coexistencia, y por primera vez
    tiene lectura humana. El corte no obliga a re-importar (el plan concentra los re-imports en D4
    y D7 a propósito). Las 3 llamadas que quedan a Airtable mueren juntas, en D7, y el orden de
    apagado no depende de recordar nada.
  - **En contra:** `lib/airtable.ts` no se vacía en este corte, que era la expectativa. Una lectura
    de más por armado de plan. Y hay que aguantar la incomodidad de que la página *Proyectos* de
    Airtable quede congelada **para personas** pero siga recibiendo escrituras de la máquina — es
    exactamente lo que hay que decirle al equipo, y por eso el paso manual del corte no es "poner
    en solo-lectura" sino "poner en solo-lectura Y explicar que la máquina todavía escribe ahí".
  - **La regla que queda para el corte 4/4 y para D7:** *antes de cortar un dominio, listá quién
    ESCRIBE cada uno de sus campos.* El corte 2/4 agregó "medí el dato vivo contra el schema que lo
    va a recibir" porque el modelo estaba mal; este agrega la otra mitad, que es el modelo de
    escritura. Un diff no puede ver ninguna de las dos.

- **Alternativas descartadas:**
  - **Que el archivado PATCHee `app.proyectos` por PostgREST.** Más limpio a largo plazo y es lo
    que va a pasar en D7 de todos modos, pero obliga a re-importar el archivado ahora — el eslabón
    histórico más frágil del sistema, que el plan concentra en dos momentos justamente para no
    pagarlo por dominio.
  - **Aceptar que el loop muere hasta D7.** Congela lo destilado en el valor de hoy (los 4
    proyectos activos tienen cero) y deja la pantalla mostrando una advertencia que ya no se
    actualiza. El corte negaría uno de sus propios objetivos.
  - **Alta sin record id de Airtable.** Descartada por el proyecto fantasma: `typecast` convierte
    el bug en datos malos en vez de en un error.
  - **No permitir crear voces ni proyectos hasta D7.** Con la página de Airtable congelada, el
    equipo se quedaba sin ningún lugar donde crear. Se crearon 6 proyectos en toda la vida del
    producto, así que el costo de soportarlo es bajo — pero el de no soportarlo es un callejón.
