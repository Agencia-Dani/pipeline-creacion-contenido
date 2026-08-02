// Dominio puro: cuándo un registro de config se puede borrar (decisión de Mani, 2026-08-02).
//
// **La regla: un registro se borra solo si nunca produjo nada.** Apagar ya cubre el caso frecuente
// ("no quiero que esto corra más") sin perder nada; borrar queda para lo que nunca llegó a existir
// de verdad — el proyecto que se creó mal, la voz de un cliente que no arrancó, la cuenta repetida.
//
// Por qué no `on delete cascade`: el feed y los descartes son la única evidencia de qué juzgó la
// máquina y qué decidió el equipo. Borrar un proyecto con 54 candidatos sin leer se llevaría 54
// juicios que costaron una corrida paga, y desde la pantalla ese botón sería idéntico al que borra
// un proyecto vacío. El histórico canónico (`outputs`, ADR-014) sobrevive de todos modos: no tiene
// FK a proyecto ni a voz, y `v_senal_seleccion` sale de ahí, así que lo que el sistema aprendió
// sobre cada referente no depende de esto.
//
// Las FK de Postgres ya impiden el borrado (`candidatos.proyecto_id` y compañía no tienen
// `on delete`), pero reventarían con un `violates foreign key constraint` y sin decir CUÁNTO hay
// colgando — que es justo el dato con el que uno decide entre vaciar y apagar. Esto es la frase; la
// FK sigue siendo la garantía (ver `lib/proyectos.ts`, que traduce el 23503 igual por si acaso).
//
// Los REFERENTES no pasan por acá: nada les cuelga por FK. `referentes_proyectos` cascadea (es la
// asignación, no historia) y `candidatos.referente` / `descartes.referente` guardan el handle como
// TEXTO, así que la historia de la cuenta sobrevive a que la cuenta salga del banco.

/** Una clase de fila que cuelga del registro. `cuantos` en 0 no retiene nada. */
export type Dependencia = { cuantos: number; singular: string; plural: string };

const enumerar = (partes: string[]): string =>
  partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;

/**
 * `null` = se puede borrar. Si no, la frase que dice qué lo retiene y qué hacer en su lugar.
 *
 * Nombra las dependencias en el orden en que se pasan: primero lo que más pesa (el feed), después
 * lo accesorio. Y siempre ofrece la salida (apagar), porque un "no se puede" sin alternativa manda
 * al equipo a preguntarle a un dev.
 */
export function motivoParaNoBorrar(nombre: string, dependencias: Dependencia[]): string | null {
  const retienen = dependencias.filter((d) => d.cuantos > 0);
  if (retienen.length === 0) return null;

  const lista = enumerar(
    retienen.map((d) => `${d.cuantos} ${d.cuantos === 1 ? d.singular : d.plural}`),
  );
  return `${nombre} tiene ${lista}. Borrar se llevaría esa historia; apagar hace lo mismo sin perderla.`;
}
