# ADR-041 — La metadata del referente es derivada, no almacenada

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Toca `core/schema/`
  (migración [014](../../core/schema/014_criterios_voz_y_perillas.sql)): amplía la vista
  `app.v_salud_referentes`, sin tabla nueva ni columna nueva.

- **Contexto:** en `/curar/sugeridos` cada cuenta propuesta muestra sus seguidores, su bio y su URL —
  vienen de `app.referentes_propuestos`, que el descubrimiento llena. Al aprobarla, `crearReferente`
  inserta en `app.referentes` **solo handle, plataforma, activo y notas**: la tabla no tiene columnas
  para lo demás. La metadata se ve una vez y desaparece.

  El equipo lo notó desde el lado correcto: *"¿en los Referentes se puede ver metadata como
  seguidores, como en Sugeridos?"*. Es la misma pregunta que uno se hace al decidir si podar una
  cuenta floja: 20 mil seguidores y 200 mil no se juzgan igual.

- **Decisión:** los seguidores del referente se **derivan**, no se guardan. `app.v_salud_referentes`
  —que ya existe y ya es el lugar donde vive lo derivado de una cuenta (`videos_evaluados`,
  `tasa_gate`, `tasa_aprobacion`)— gana una columna más:

  ```
  coalesce(último visto en app.candidatos, el de app.referentes_propuestos)
  ```

  El primero es el conteo que trajo el motor la última vez que bajó un video de esa cuenta; el segundo
  cubre lo recién aprobado desde Sugeridos, que todavía no produjo ningún candidato. Los dos se
  matchean con la misma normalización de handle que la vista ya usaba
  (`lower(replace(handle, '@', ''))`).

- **Por qué no una columna en `app.referentes`:** era la opción obvia y es la equivocada. Copiar el
  número al aprobar lo congela ese día y **nadie lo refresca nunca** — a los seis meses la pantalla
  muestra un número viejo con cara de número fresco, que es peor que no mostrar nada. Guardar exige
  además inventar quién lo actualiza, y ese trabajo no existe en ningún workflow.

  Derivarlo no tiene ruta de escritura, no puede desincronizarse, y se actualiza solo con cada
  corrida. Es la misma decisión que ya se había tomado para la salud del referente en `009`, cuando el
  archivado dejó de escribirla: *"derivada — el archivado deja de escribirla al migrar"*.

- **Consecuencias:**
  - **8 de 17 cuentas muestran «—»**, y está bien. Son las que se sembraron a mano y nunca trajeron un
    candidato: el sistema no tiene el dato, y decirlo es más honesto que inventarlo.
  - El número refleja **lo que el motor vio la última vez**, no lo que Instagram dice ahora mismo. Para
    decidir si una cuenta vale la pena, alcanza y sobra.
  - `bio` y `url` **no** se traen. La bio no cambia una decisión de poda, y la URL del referente ya
    viaja por candidato. Si algún día hacen falta, entran por la misma puerta y sin migración de datos.
  - `create or replace view` en vez de `drop + create`: la columna nueva va **al final**, que es lo que
    Postgres permite reemplazar sin dropear. Nada que lea la vista se entera.

---

## Nota de implementación — el bug que apareció al verificar (migración `015`)

Al contar las filas de la vista para comprobar la columna nueva, salieron **18 para 17 referentes**.
No lo causó `seguidores`: `v_senal_seleccion` (migración `003`) agrupa por **`(referente, idioma)`** y
el `left join` de `v_salud_referentes` lo trataba como uno-a-uno desde la `009`. Cualquier cuenta que
publicara en dos idiomas se duplicaba, y «aprueban» mostraba la tasa de **un idioma elegido al azar
por el join**, no la de la cuenta.

Se arregló en [`015`](../../core/schema/015_salud_referentes_una_fila.sql) colapsando la señal por
referente antes del join. **No es una decisión nueva** —es la tasa que la pantalla siempre dijo que
mostraba— así que no lleva ADR propio.

Lo que sí deja como regla para esta vista: **todo join nuevo tiene que garantizar una fila por
referente.** Las dos CTEs de `seguidores` ya nacieron con `distinct on` por eso mismo; el fan-out
viejo se había colado justo por no aplicar ese cuidado.

