// Dominio puro (C3): voces y proyectos, para el corte 3/4 de D5.
//
// Por qué van juntos y en una sola pantalla: la voz es la espina dorsal (PLAN §2.5). Un proyecto
// pertenece a UNA voz (`voz_id` es FK not null desde la migración `009`) y apagar la voz apaga
// sus proyectos sin tocarlos — `Armar plan de corrida` saltea el proyecto cuya voz no vino. Con
// dos pantallas, la consecuencia de un click quedaba en la otra.
//
// Las dos reglas que Airtable no podía hacer cumplir y acá son validación de servidor:
//  · 1 proyecto = 1 voz. En Airtable `voz_default` es un link MÚLTIPLE y el motor usa `[0]`
//    avisando por consola — o sea el dato podía romperse en silencio y el aviso lo leía nadie.
//  · `criterios_relevancia` obligatorio. Sin criterios el gate no tiene con qué juzgar y aprueba
//    o rechaza por ruido; el form de Airtable dejaba crear el proyecto igual (mapa-campos §5.1-6).

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

const limpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const opcional = (v: unknown): string | null => (limpio(v) === "" ? null : limpio(v));

export type DatosVoz = {
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string | null;
  activo: boolean;
};

export function validarVoz(entrada: {
  nombre: unknown;
  descripcion: unknown;
  criterios_relevancia: unknown;
  activo: unknown;
}): Validacion<DatosVoz> {
  const nombre = limpio(entrada.nombre);
  if (nombre === "") return { ok: false, error: "Ponele un nombre a la voz." };

  return {
    ok: true,
    valor: {
      nombre,
      descripcion: opcional(entrada.descripcion),
      criterios_relevancia: opcional(entrada.criterios_relevancia),
      activo: entrada.activo === true,
    },
  };
}

export type DatosProyecto = {
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string;
  vozId: string;
  activo: boolean;
  n: number | null;
};

/**
 * `vocesValidas` son los uuid que existen: una voz inventada no se filtra en silencio, se
 * rechaza. La FK ya lo impediría, pero reventaría con un error de Postgres en vez de con una
 * frase que el equipo de redes pueda leer.
 *
 * `n` vacío o 0 significa "usá el default global" (ADR-024), y se guarda como null: un 0 en la
 * columna diría lo mismo con dos representaciones, que es la clase de ambigüedad que después
 * alguien "arregla" al revés.
 */
export function validarProyecto(
  entrada: {
    nombre: unknown;
    descripcion: unknown;
    criterios_relevancia: unknown;
    vozId: unknown;
    activo: unknown;
    n: unknown;
  },
  vocesValidas: Set<string>,
): Validacion<DatosProyecto> {
  const nombre = limpio(entrada.nombre);
  if (nombre === "") return { ok: false, error: "Ponele un nombre al proyecto." };

  const criterios = limpio(entrada.criterios_relevancia);
  if (criterios === "") {
    return {
      ok: false,
      error: "Escribí los criterios: sin eso el filtro no sabe qué es relevante para este proyecto.",
    };
  }

  if (typeof entrada.vozId !== "string" || !vocesValidas.has(entrada.vozId)) {
    return { ok: false, error: "Elegí a qué voz pertenece el proyecto." };
  }

  const nCrudo = entrada.n;
  const n = nCrudo === "" || nCrudo === null || nCrudo === undefined ? null : Number(nCrudo);
  if (n !== null && (!Number.isInteger(n) || n < 0)) {
    return { ok: false, error: "Los videos por corrida van en número entero (o dejalo vacío para usar el global)." };
  }

  return {
    ok: true,
    valor: {
      nombre,
      descripcion: opcional(entrada.descripcion),
      criterios_relevancia: criterios,
      vozId: entrada.vozId,
      activo: entrada.activo === true,
      n: n === 0 ? null : n,
    },
  };
}

// ── La forma del contrato ────────────────────────────────────────────────────

export type VozGuardada = {
  id: string;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string | null;
  activo: boolean;
};

export type ProyectoGuardado = {
  id: string;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string;
  criterios_aprendidos: string | null;
  advertencia_criterios: string | null;
  voz_id: string;
  activo: boolean;
  n: number | null;
};

/**
 * Postgres → los registros `{id, fields}` de `core/contracts/run-plan.md`.
 *
 * **`id` es el uuid de Postgres — paso 3 (y último) del expand/contract de D7.** Durante los
 * pasos 1 y 2 fue el record id de Airtable, porque cuatro nodos vivos lo escribían como *link*
 * con `typecast: true` y un uuid ahí no fallaba: creaba un proyecto **fantasma** con el uuid de
 * nombre. D7 movió esos cuatro a PostgREST, el gate del paso 3 era una corrida completa verde, y
 * la del 2026-08-01 lo cumplió: candidatos y descartes escritos con `proyecto_id`/`voz_id` como
 * FK de verdad.
 *
 * 🔀 **`fields.uuid` sigue viajando, y ya no significa nada: es igual al `id`.** No se borra acá
 * porque los cuatro consumidores en n8n resuelven el uuid con `uuidDe[x.id] = x.fields.uuid`, y
 * con los dos ids iguales ese mapa queda **identidad** — o sea el flip no necesita re-import.
 * Sacarlo sí lo necesitaría, así que muere en el próximo re-import que haga falta por otra cosa,
 * junto con el `uuidDe` que quedó sin trabajo. Un campo redundante cuesta menos que una corrida.
 */
export function aRegistrosDeVoces(
  voces: VozGuardada[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return voces
    .filter((v) => ambito === "completo" || v.activo)
    .map((v) => ({
      id: v.id,
      fields: {
        uuid: v.id,
        nombre: v.nombre,
        descripcion: v.descripcion,
        criterios_relevancia: v.criterios_relevancia,
        activo: v.activo,
      },
    }));
}

/**
 * Igual que las voces, más una forma heredada: `voz_default` viaja como **array de un elemento**
 * con el id de la voz, que es como `Armar plan de corrida` lo lee (`voz_default[0]`) y como
 * `armarRunPlan` lo cruza contra `voces[].id`. El contenido del array ya es el uuid (paso 3); el
 * array de un elemento se queda porque cambiarlo sí obligaría a re-importar, y que la regla
 * "1 proyecto = 1 voz" sea una FK not null no cambia la forma del contrato.
 *
 * `criterios_aprendidos` y `advertencia_criterios` **salen de Postgres desde D7**, como todo lo
 * demás. Durante la coexistencia venían de Airtable porque su único escritor —`Destilar criterios`
 * del archivado— vivía ahí (ADR-033: un dueño por CAMPO, no por tabla). D7 movió ese escritor a
 * PostgREST, así que el campo y su autor volvieron a estar en el mismo lugar y ADR-033 se cumplió
 * entera: era una regla con fecha de vencimiento, y esta es la fecha.
 */
export function aRegistrosDeProyectos(
  proyectos: ProyectoGuardado[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return proyectos
    .filter((p) => ambito === "completo" || p.activo)
    .map((p) => ({
      id: p.id,
      fields: {
        uuid: p.id, // redundante desde el paso 3 — ver aRegistrosDeVoces
        nombre: p.nombre,
        descripcion: p.descripcion,
        criterios_relevancia: p.criterios_relevancia,
        criterios_aprendidos: p.criterios_aprendidos,
        advertencia_criterios: p.advertencia_criterios,
        voz_default: [p.voz_id],
        activo: p.activo,
        N: p.n,
      },
    }));
}

// ── Lecturas que la pantalla necesita ────────────────────────────────────────

/**
 * Un proyecto activo cuya voz está apagada NO corre, y en ningún lado se ve: el motor lo saltea
 * con un `console.log` que vive en los logs de n8n. Es la trampa de la espina dorsal — el equipo
 * prende el proyecto, la corrida no lo trae, y no hay nada que mirar. Acá se dice.
 */
export function pausadoPorSuVoz(proyecto: { activo: boolean }, voz: { activo: boolean }): boolean {
  return proyecto.activo && !voz.activo;
}
