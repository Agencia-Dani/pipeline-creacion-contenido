# ADR-036 — Los descartes del gate no se barren: `falsos_negativos` es una vista, no una proyección

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). Ejecuta para D7 la orden de
  [ADR-027](./ADR-027-postgres-fuente-unica-de-config.md) ("las tablas de Métricas no se migran: se
  borran; la app lee la fuente por vistas") y mantiene vivo el loop de auditoría de
  [ADR-021](./ADR-021-medicion-desempeno-embudo.md).

- **Contexto:** hoy el archivado, cada domingo, cuenta los `Descartes del gate` con
  `veredicto = 'era bueno'`, escribe ese número como `falsos_negativos` en la tabla `Métricas Global`
  de Airtable, y **después borra la tabla de descartes entera**. El borrado existía por una sola
  razón: la cuota de 1.000 records de Airtable.

  D7 corta los dos extremos de esa cadena — el archivado deja de escribir Métricas (ADR-027) y las
  tablas de Métricas mueren. Al medirlo contra las vistas que las reemplazan apareció el problema:
  **`app.v_embudo_semana` no tiene `falsos_negativos`, y no puede tenerlo.** Esa vista suma
  `runs.metricas`, y este número no sale de una corrida: sale de contar filas de una tabla que el
  equipo audita a mano, días después.

  O sea que D7, tal como estaba escrito, **mataba `falsos_negativos` por segunda vez.** La primera
  fue la limitación de Airtable que dejaba `veredicto` de solo-lectura, y el diagnóstico de entonces
  sigue valiendo: con el contador en 0, *"0 falsos negativos" se lee como "el gate está perfecto"*,
  que es la conclusión opuesta a la verdad. D6 acababa de resucitar el loop haciendo el campo
  editable; borrar su fuente lo habría vuelto a matar una semana después.

- **Decisión:**
  1. **`app.descartes` no se barre nunca.** En Postgres no hay cuota que lo justifique: son ~10 filas
     por corrida, ~520 al año.
  2. **`falsos_negativos` deja de ser una proyección semanal y pasa a ser una vista**
     (`app.v_auditoria_descartes`, agrupada por semana, con `expuestos` / `auditados` /
     `falsos_negativos`). Se recalcula en cada lectura sobre la fuente.
  3. **Los candidatos SÍ se siguen borrando al archivarse.** No es una inconsistencia: un candidato
     calificado ya dejó su historia entera en `outputs`, que es el histórico canónico (ADR-014) —
     verificado: `v_metricas_calidad` se computa 100% desde `outputs`, sin tocar `app.candidatos`.
     `app.candidatos` es una **cola de trabajo**, y las colas se drenan. Un descarte, en cambio, no
     se copia a ningún lado: si se borra, se pierde.

- **Consecuencias:**
  - **A favor:** una métrica se define una vez, en SQL, sobre la fuente (plan-cockpit §3.5). Y
    desaparece la peor propiedad del diseño viejo: hoy **un descarte sin auditar antes del domingo es
    una auditoría perdida para siempre**, porque el barrido no distingue entre auditado y pendiente.
    Con la tabla persistente, el `veredicto is null` sigue ahí la semana que viene y el backlog es
    visible y honesto — que es exactamente lo que el encadenamiento de D6 (auditar al terminar el
    feed) necesita para funcionar.
  - **En contra:** la cola de auditoría puede crecer si nadie la mira, y a diferencia de antes ya no
    se limpia sola. Es a propósito: un backlog visible es información, un backlog borrado es una
    mentira cómoda. Si algún día molesta, se archiva por antigüedad — pero eso es una decisión de
    producto, no una restricción de la herramienta como lo era la cuota de Airtable.
  - `app.descartes` pasa a ser la única tabla del cockpit que crece de forma monótona sin poda.

- **Alternativas descartadas:**
  - **Snapshot semanal en una tabla `app.metricas_semana`.** El archivado seguiría barriendo, pero
    dejando una fila-resumen antes. Descartada porque recrea en Postgres exactamente la proyección
    que ADR-027 mandó borrar, y reintroduce su peor propiedad: si mañana cambia la definición de la
    métrica, el histórico queda con dos definiciones distintas y ninguna forma de saber cuál es cuál.
  - **Aceptar la pérdida.** El `veredicto` quedaría como señal cualitativa que alguien mira en la
    pantalla de Descartes. Descartada: ADR-021 se queda sin su única medida de recall, y el sistema
    vuelve a no poder responder "¿cuánto bueno estamos tirando?".
