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
  airtable_id: string | null;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string | null;
  activo: boolean;
};

export type ProyectoGuardado = {
  id: string;
  airtable_id: string | null;
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
 * **El `id` sigue siendo el record id de Airtable, y NO se cae con este corte** (la doc decía que
 * sí; es falso y costaba caro descubrirlo en producción). Cuatro consumidores vivos lo usan como
 * record id: el motor escribe `Candidatos.proyecto`/`.voz` y `Descartes.proyecto` como LINKS de
 * Airtable, `Destilar criterios` PATCHea `Proyectos` por ese id, y esa misma destilación cruza
 * los candidatos calificados contra él. Y los links van con `typecast: true`, o sea un uuid no
 * daría error: Airtable **crearía un proyecto fantasma** con el uuid de nombre. Se cae en **D7**,
 * cuando el motor deja de escribir en Airtable.
 */
export function aRegistrosDeVoces(
  voces: VozGuardada[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return voces
    .filter((v) => ambito === "completo" || v.activo)
    .map((v) => ({
      id: v.airtable_id ?? v.id,
      fields: {
        nombre: v.nombre,
        descripcion: v.descripcion,
        criterios_relevancia: v.criterios_relevancia,
        activo: v.activo,
      },
    }));
}

/**
 * Igual que las voces, más una traducción: `voz_default` viaja como **array de un elemento** con
 * el record id de la voz, que es la forma que `Armar plan de corrida` lee (`voz_default[0]`) y
 * que `armarRunPlan` usa para cruzar contra `voces[].id`. El array de un elemento no es
 * cosmético: es el modelo nuevo hablando el idioma viejo, y sobrevive hasta D7 por lo mismo que
 * el `id`.
 *
 * `criterios_aprendidos` y `advertencia_criterios` NO salen de Postgres: los escribe el archivado
 * en Airtable cada domingo y este corte no mueve ese escritor (ADR-033). Entran acá desde
 * `destilados`, que los trae de donde su único autor los deja.
 */
export function aRegistrosDeProyectos(
  proyectos: ProyectoGuardado[],
  airtablePorVoz: Map<string, string | null>,
  destilados: Map<string, { criterios_aprendidos: string | null; advertencia_criterios: string | null }>,
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return proyectos
    .filter((p) => ambito === "completo" || p.activo)
    .map((p) => {
      const vozAirtable = airtablePorVoz.get(p.voz_id) ?? p.voz_id;
      const destilado = destilados.get(p.airtable_id ?? "");
      return {
        id: p.airtable_id ?? p.id,
        fields: {
          nombre: p.nombre,
          descripcion: p.descripcion,
          criterios_relevancia: p.criterios_relevancia,
          criterios_aprendidos: destilado?.criterios_aprendidos ?? null,
          advertencia_criterios: destilado?.advertencia_criterios ?? null,
          voz_default: [vozAirtable],
          activo: p.activo,
          N: p.n,
        },
      };
    });
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
