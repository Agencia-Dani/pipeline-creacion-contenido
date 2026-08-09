// Dominio puro (C3): el vocabulario del pipeline de LinkedIn y las reglas de su banco de
// referentes. Sin IO — lo que pega contra Postgres vive en `lib/referentes-linkedin.ts`.
//
// Gobernado por ADR-055 (el pipeline) y ADR-049 (por qué tiene tablas propias en vez de columnas
// nuevas en las de reels). Los dos enums son los de la migración `020` §1, y están replicados acá
// **a propósito**: son el vocabulario que la UI dibuja y que los server actions validan, y un
// `check` de Postgres no se puede importar desde TypeScript. Si divergen, el insert falla ruidoso
// (22P02, invalid input value for enum) — que es el modo de falla correcto para esto.

/**
 * El carril del que salió la pieza (ADR-055 §2). No es una etiqueta descriptiva: los dos carriles
 * tienen umbrales distintos y trabajos distintos en producción.
 */
export const CARRILES = ["personal", "copiable"] as const;
export type Carril = (typeof CARRILES)[number];

export const esCarril = (v: unknown): v is Carril =>
  typeof v === "string" && (CARRILES as readonly string[]).includes(v);

/**
 * De dónde salió. Deliberadamente NO es `app.plataforma`: son universos distintos y ADR-049 §3
 * prohíbe explícitamente tocar aquel enum, que describe el pipeline de reels.
 */
export const FUENTES = ["pinterest", "linkedin", "web", "archivo"] as const;
export type Fuente = (typeof FUENTES)[number];

export const esFuente = (v: unknown): v is Fuente =>
  typeof v === "string" && (FUENTES as readonly string[]).includes(v);

/** Cómo se nombra cada fuente en pantalla, y qué se espera escribir en `consulta` para cada una. */
export const ETIQUETA_FUENTE: Record<Fuente, string> = {
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  web: "Web",
  archivo: "Archivo propio",
};

export const AYUDA_FUENTE: Record<Fuente, string> = {
  pinterest: "Un filtro de búsqueda: mindset, AI, productividad. Es la fuente principal del carril copiable.",
  linkedin: "El handle de una cuenta: @alguien.",
  web: "Un blog, una newsletter o una página suelta que alguien trajo.",
  archivo: "El material propio de la voz — podcasts, blogs, transcripciones. Es el carril personal.",
};

/** De qué carril viene cada fuente. `archivo` es el único personal (ADR-055 §2). */
export function carrilDeFuente(fuente: Fuente): Carril {
  return fuente === "archivo" ? "personal" : "copiable";
}

// ─────────────────────────── El banco de referentes ───────────────────────────

export type ReferenteLinkedin = {
  id: string;
  fuente: Fuente;
  consulta: string;
  idioma: string | null;
  proyectoId: string | null;
  activo: boolean;
  notas: string | null;
};

/**
 * 🔑 La normalización que hace que el unique de la base signifique algo.
 *
 * La `020` §2 declara `unique (instance_id, fuente, consulta)` con este motivo escrito: *"dos veces
 * la misma consulta a la misma fuente en el mismo cockpit es un duplicado que paga dos veces el
 * scrape y mete la misma pieza dos veces al feed"*. Pero el unique corre sobre **el texto tal
 * cual**: `"Mindset"`, `"mindset "` y `"  mindset"` son tres filas distintas para Postgres y la
 * misma búsqueda para Pinterest. Sin normalizar en la escritura, la restricción no protege de nada
 * y el duplicado que dice evitar entra igual.
 *
 * Qué hace, y por qué cada parte:
 *   · `trim` + colapsar espacios internos — el copy/paste trae espacios; `"AI  tools"` y
 *     `"AI tools"` son la misma consulta.
 *   · `toLowerCase` — Pinterest no distingue mayúsculas al buscar, y un handle tampoco.
 *   · sacar el `@` inicial — `"@alguien"` y `"alguien"` son la misma cuenta. Se guarda sin arroba y
 *     la pantalla lo vuelve a dibujar; guardar las dos formas es el mismo duplicado con otra cara.
 *
 * ⚠️ Es normalización para DEDUP, no saneamiento de seguridad. Lo que va a la query lo escapa
 * PostgREST; esto decide identidad.
 */
export function normalizarConsulta(consulta: string): string {
  return consulta.trim().replace(/^@+/, "").replace(/\s+/g, " ").toLowerCase();
}

/** Cómo se muestra: los handles se dibujan con su arroba, los filtros de búsqueda no. */
export function mostrarConsulta(fuente: Fuente, consulta: string): string {
  return fuente === "linkedin" ? `@${consulta}` : consulta;
}

/**
 * El banco → los registros `{id, fields}` del plan de corrida de LinkedIn (ADR-068).
 *
 * Dos decisiones de forma que **no** copian a reels, y las dos a conciencia:
 *
 *   · **`carril` viaja resuelto.** Sale de `carrilDeFuente`, o sea que ya se puede derivar del
 *     `fuente` que va al lado. Se manda igual porque es lo que decide **qué umbral se le aplica a la
 *     pieza** (ADR-055 §2) y esa regla no puede vivir duplicada en un code node de n8n: el día que
 *     una fuente cambie de carril, el JSON del workflow no se entera y el umbral se aplica al revés,
 *     en verde.
 *   · **`proyecto_id` es un string o `null`, NO un array de un elemento.** En reels
 *     `referentes[].fields.proyecto` es un array porque un referente alimenta N proyectos (ADR-032)
 *     y porque venía de un campo *link* de Airtable. Acá la `020` §2 declara un `proyecto_id`
 *     nullable simple: envolverlo en un array sería arrastrar la forma heredada de una base que ya
 *     no existe a un contrato que todavía no tiene un solo consumidor que romper.
 */
export function aRegistrosDeBancoLinkedin(
  banco: readonly ReferenteLinkedin[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return banco
    .filter((r) => ambito === "completo" || r.activo)
    .map((r) => ({
      id: r.id,
      fields: {
        fuente: r.fuente,
        carril: carrilDeFuente(r.fuente),
        consulta: r.consulta,
        idioma: r.idioma,
        proyecto_id: r.proyectoId,
        activo: r.activo,
      },
    }));
}

export type FormReferenteLinkedin = {
  fuente: string;
  consulta: string;
  idioma: string;
  proyectoId: string;
  notas: string;
};

/**
 * Valida el alta/edición y devuelve los errores por campo. Vacío = válido.
 *
 * Vive en el dominio y no en el server action porque la pantalla lo corre **antes** de mandar (para
 * no hacer viajar un formulario que ya sabemos malo) y el action lo corre **de nuevo** al recibir.
 * Es la misma regla evaluada dos veces, así que tiene que ser una sola función: dos copias divergen,
 * y la que se relaja siempre es la del server, que es la única que importa.
 */
export function validarReferente(
  form: FormReferenteLinkedin,
): Partial<Record<keyof FormReferenteLinkedin, string>> {
  const errores: Partial<Record<keyof FormReferenteLinkedin, string>> = {};

  if (!esFuente(form.fuente)) {
    errores.fuente = "Elegí de dónde sale.";
  }

  const consulta = normalizarConsulta(form.consulta);
  if (consulta === "") {
    errores.consulta = "Escribí la cuenta o el filtro de búsqueda.";
  } else if (consulta.length > 200) {
    errores.consulta = "Es muy largo (máximo 200 caracteres).";
  }

  // El idioma es opcional, pero si está tiene que ser un código corto y no una frase: es lo que el
  // arbitraje de tiempo del carril copiable usa para buscar (ADR-055: un formato agotado en inglés
  // puede estar fresco en español), así que "inglés, a veces español" no le sirve a nadie.
  if (form.idioma.trim() !== "" && form.idioma.trim().length > 20) {
    errores.idioma = "Poné un idioma, no una descripción (ej: es, en).";
  }

  if (form.notas.length > 2000) {
    errores.notas = "La nota es muy larga (máximo 2000 caracteres).";
  }

  return errores;
}

/** Si `validarReferente` no encontró nada. Azúcar, para que los llamadores no cuenten claves. */
export const esValido = (errores: Record<string, string | undefined>): boolean =>
  Object.keys(errores).length === 0;

/**
 * El orden del banco en pantalla: **lo apagado primero dentro de cada fuente, no al final.**
 *
 * Es al revés de lo que uno escribiría por reflejo, y sale del mismo razonamiento que la pantalla de
 * reels: la lista existe para provocar la acción de prender o apagar, y una cuenta apagada es la
 * que espera una decisión. Enterrarla abajo es esconder justamente el trabajo pendiente.
 *
 * Empate por consulta para que el orden sea estable — la lección del corte 3/4: un orden que
 * depende de cómo vino la lista se reacomoda solo mientras alguien la recorre.
 */
export function ordenarBanco<T extends { fuente: Fuente; consulta: string; activo: boolean }>(
  banco: readonly T[],
): T[] {
  return [...banco].sort(
    (a, b) =>
      FUENTES.indexOf(a.fuente) - FUENTES.indexOf(b.fuente) ||
      Number(a.activo) - Number(b.activo) ||
      a.consulta.localeCompare(b.consulta, "es"),
  );
}
