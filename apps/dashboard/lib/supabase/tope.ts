/**
 * El tope duro de filas de PostgREST, y el guard que evita que truncar sea invisible.
 *
 * 🩸 **Por qué existe, medido el 2026-08-31.** Tres artefactos de este repo afirmaban por escrito
 * que este proyecto **no** tiene `db-max-rows` puesto: el comentario de `curar/feed/actions.ts`, el
 * `handoff.md`, y el README del archivado (que documentaba un techo de 5.000). Los tres salían de
 * una sola medición del 03/08 hecha sobre 175 filas — o sea por debajo del tope, que es justo el
 * caso en el que el tope no se puede ver. La medición no probaba que no hubiera techo: probaba que
 * no lo tocaba.
 *
 * Medido de nuevo contra prod sobre una tabla de 1.936 filas: `limit=1500`, `limit=5000`,
 * `limit=50000` y *sin* `limit` devuelven **las mismas 1.000**.
 *
 * 🔑 **El modo de falla es el peor de este sistema: truncar es indistinguible de "no había más".**
 * Una lectura de `app.grabados` cortada en 1.000 no muestra un error — le dice al equipo *"este
 * video no está grabado"* sobre uno que sí lo está, y alguien lo vuelve a grabar. Por eso el guard
 * **aborta ruidoso** en vez de loguear: es el mismo criterio que ADR-029 ya eligió para el dedup
 * del motor (abortar antes que re-pagar callado), y el mismo que el guard de `Preparar procesados`.
 *
 * No puede dispararse hoy: la tabla más grande de las tres tiene ~300 filas. Cuando dispare, el
 * mensaje dice exactamente qué hacer.
 */
export const TOPE_POSTGREST = 1000;

/**
 * Aborta si una lectura "traé todo" volvió justo con el tope: eso significa que puede estar
 * cortada. Se llama DESPUÉS del `error` de Supabase y ANTES de usar los datos.
 *
 * @param filas  cuántas filas volvieron
 * @param queSeLeia  qué se estaba leyendo, para que el error diga dónde mirar
 */
export function abortarSiTruncado(filas: number, queSeLeia: string): void {
  if (filas < TOPE_POSTGREST) return;
  throw new Error(
    `Leyendo ${queSeLeia} volvieron ${filas} filas, que es el tope de PostgREST (${TOPE_POSTGREST}): ` +
      `la lectura puede estar TRUNCADA y no hay forma de distinguirlo de "no había más". ` +
      `Hay que paginar, con el mismo patrón que usan 'Leer procesados' y 'Leer feed vivo' del motor ` +
      `(offset de a ${TOPE_POSTGREST} hasta que una página vuelva incompleta).`,
  );
}
