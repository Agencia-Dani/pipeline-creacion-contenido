// Dominio puro (C3): las reglas del banco de referentes, para el corte 2/4 de D5.
//
// Por qué existe: en Airtable el `handle` era texto libre y la plataforma un single-select
// sin validar contra el motor. El motor normaliza al leer (`String(f.handle).trim().replace(/^@/,'')`)
// y clasifica la plataforma por substring (`indexOf('insta')` / `indexOf('tik')`), así que
// "@@juan", " juan " o "Instagram " funcionaban de casualidad. Acá la normalización pasa a ser
// explícita y del lado del servidor: lo que se guarda ya está limpio.
//
// La otra mitad son las lecturas que la pantalla necesita y que no son ni UI ni SQL: cuándo una
// cuenta cuenta como floja (ADR-022) y cuándo un referente cruza voces (el motor lo permite y
// avisa — ADR-032 §4; acá se calcula el aviso).

export const PLATAFORMAS = ["instagram", "tiktok"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const esPlataforma = (v: unknown): v is Plataforma =>
  typeof v === "string" && (PLATAFORMAS as readonly string[]).includes(v);

/**
 * El handle canónico: sin arrobas, sin espacios, en minúscula. Es la clave con la que el
 * motor pide videos y con la que `v_salud_referentes` matchea la historia, así que dos
 * escrituras distintas de la misma cuenta partirían su salud en dos.
 * Devuelve null si no queda nada utilizable (el motor hace `if (!handle) return;`, o sea
 * una cuenta sin handle se ignora **en silencio**: acá se rechaza antes de guardarla).
 *
 * Recorta los bordes pero NO toca el interior: "Simon Sinek" no se convierte en "simonsinek"
 * a la fuerza, porque esa cuenta puede no existir y el error aparecería recién en la factura
 * de Apify. Lo rechaza `validarReferente`, que es donde se decide.
 */
export function normalizarHandle(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().replace(/^@+/, "").trim().toLowerCase();
  return limpio === "" ? null : limpio;
}

/**
 * Cómo se muestra Y cómo se guarda: con UNA arroba, igual que en Airtable. Guardar la misma
 * forma que guardaba Airtable es deliberado — el motor (`replace(/^@/, '')`) y la vista de
 * salud (`replace(handle, '@', '')`) normalizan al leer, así que cambiar la forma almacenada
 * no ganaría nada y arriesgaría partir la historia de una cuenta en dos.
 */
export const conArroba = (handle: string): string => `@${handle}`;

// Lo que Instagram y TikTok permiten en un nombre de usuario. La validación existe para el
// caso real: alguien pega la URL del perfil en vez del handle, y el motor termina pidiéndole
// a Apify una cuenta que no existe — gasto silencioso y cero videos, sin ningún error.
const CARACTERES_DE_HANDLE = /^[a-z0-9._]+$/;

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export type DatosReferente = {
  handle: string;
  plataforma: Plataforma;
  proyectoIds: string[];
  activo: boolean;
  notas: string | null;
};

/**
 * Valida lo que llega de un form antes de tocar la base. Mensajes para el equipo de redes,
 * no para un dev. `proyectosValidos` son los ids que existen: un id inventado no se filtra
 * en silencio, se rechaza (si no, el referente se guardaría alimentando a nadie).
 */
export function validarReferente(
  entrada: {
    handle: unknown;
    plataforma: unknown;
    proyectoIds: unknown;
    activo: unknown;
    notas: unknown;
  },
  proyectosValidos: Set<string>,
): Validacion<DatosReferente> {
  const handle = normalizarHandle(entrada.handle);
  if (!handle) return { ok: false, error: "Escribí el nombre de la cuenta, por ejemplo @simonsinek." };
  if (!CARACTERES_DE_HANDLE.test(handle)) {
    return { ok: false, error: "Va solo el nombre de usuario (@simonsinek), no el link ni el nombre completo." };
  }

  if (!esPlataforma(entrada.plataforma)) {
    return { ok: false, error: "Elegí instagram o tiktok." };
  }

  const ids = Array.isArray(entrada.proyectoIds) ? entrada.proyectoIds.filter((i) => typeof i === "string") : [];
  if (ids.length === 0) {
    return { ok: false, error: "Elegí al menos un proyecto: un referente sin proyecto no lo busca nadie." };
  }
  const desconocido = ids.find((i) => !proyectosValidos.has(i));
  if (desconocido) return { ok: false, error: "Uno de los proyectos elegidos ya no existe. Recargá la página." };

  const notas = typeof entrada.notas === "string" && entrada.notas.trim() !== "" ? entrada.notas.trim() : null;

  return {
    ok: true,
    valor: { handle, plataforma: entrada.plataforma, proyectoIds: [...new Set(ids)], activo: entrada.activo === true, notas },
  };
}

// ── La forma del contrato ────────────────────────────────────────────────────

export type ReferenteGuardado = {
  id: string;
  handle: string;
  plataforma: string;
  activo: boolean;
  notas: string | null;
  proyectoIds: string[];
};

/**
 * Postgres → los registros `{id, fields}` de `core/contracts/run-plan.md`. Vive en el dominio y
 * no en `lib/` por una razón concreta: el script del corte lo usa para comparar, registro por
 * registro, lo que la fachada va a servir contra lo que Airtable servía. Si la transformación
 * viviera en la capa de IO, el A/B tendría que reimplementarla y compararía dos escrituras del
 * mismo autor en vez de comparar mundos.
 *
 * Desde el paso 3 de D7 acá no queda ninguna traducción: `id` es el uuid y `fields.proyecto` son
 * los uuid de los proyectos. Las dos tenían que caer **juntas** — el motor cruza
 * `referentes[].fields.proyecto` contra `proyectos[].id`, así que mientras hablen el mismo idioma
 * el cruce funciona, y si una sola hubiera flipeado, todo referente se habría quedado sin
 * proyecto y el motor sin nada que buscar. `referentes[].id`, además, ya no lo consume nadie: su
 * único lector era `Computar salud referentes`, que D7 borró.
 */
export function aRegistrosDelPlan(
  banco: ReferenteGuardado[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return banco
    .filter((r) => ambito === "completo" || r.activo)
    .map((r) => ({
      id: r.id,
      fields: {
        handle: r.handle,
        plataforma: r.plataforma,
        proyecto: r.proyectoIds,
        activo: r.activo,
        notas: r.notas,
      },
    }));
}

// ── Lecturas que la pantalla necesita ────────────────────────────────────────

export type Salud = {
  tasa_gate: number | null;
  tasa_aprobacion: number | null;
  videos_evaluados: number | null;
};

/**
 * El umbral de la vista *A revisar* (ADR-022 §4 pedía "una vista que filtra los de tasa baja" y
 * nunca fijó el número). Medido contra `app.v_salud_referentes` el 2026-07-31: de las 7 cuentas
 * con historia, las tasas son 0.19 · 0.47 · 0.49 · 0.68 · 0.83 · 0.88 · 0.97. Con 0.20 se señala
 * exactamente el outlier y ninguna sana — un umbral más alto convertiría la lista en ruido y
 * nadie la miraría. **No es un knob a propósito:** ningún workflow lo lee, así que meterlo en
 * `app.ajustes` costaría una migración y una entrada en el AJUSTE_MAP del motor para nada.
 */
export const UMBRAL_TASA_GATE_FLOJO = 0.2;

/**
 * Cuántos videos hacen falta para señalar. Es el mismo número que el `min_muestra_referente` del
 * `Config` del archivado (10), pero NO es el mismo dato: aquel decide qué salud se **escribe**,
 * este decide qué se **destaca**. Si algún día divergen, no se rompe nada.
 */
export const MIN_MUESTRA_PARA_SENALAR = 10;

/**
 * Una cuenta "floja" es la que trae mucho y pasa poco: la vista *A revisar* de ADR-022.
 * Dos condiciones, las dos necesarias:
 *  - **muestra suficiente** (`min_muestra_referente`, el mismo knob que usa el archivado): con
 *    3 videos evaluados no se juzga a nadie. La vista SQL a propósito NO aplica el mínimo
 *    (plan §4) — se aplica acá, donde se decide qué mostrar.
 *  - **tasa de gate por debajo del umbral.**
 * Nunca apaga nada: podar es decisión del equipo (mapa-campos §6.3). Esto solo señala.
 */
export function esFlojo(salud: Salud, umbralTasaGate: number, minMuestra: number): boolean {
  const evaluados = salud.videos_evaluados ?? 0;
  if (evaluados < minMuestra) return false;
  return salud.tasa_gate !== null && salud.tasa_gate < umbralTasaGate;
}

/**
 * Los referentes que alimentan proyectos de más de una voz. El motor lo PERMITE y lo avisa
 * (ADR-032 §4): el dedup de `Armar candidato` le da el video al proyecto que lo juzgó más
 * relevante, así que no hay doble entrega — pero el equipo tiene que saberlo, porque las
 * voces son universos separados y una cuenta compartida las mezcla.
 */
export function cruzaVoces(proyectoIds: string[], vozPorProyecto: Map<string, string>): boolean {
  const voces = new Set<string>();
  for (const id of proyectoIds) {
    const voz = vozPorProyecto.get(id);
    if (voz) voces.add(voz);
  }
  return voces.size > 1;
}
