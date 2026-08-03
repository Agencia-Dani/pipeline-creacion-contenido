// Dominio puro (C3): de quién es cada cosa. Sin IO, sin React, sin supabase — la misma
// disciplina que `domain/roles.ts`, y por la misma razón: el server tiene que poder hacer
// cumplir la regla, y la regla tiene que poder testearse sin base.
//
// Gobernado por ADR-046 (doble grano + `clients.parent_id`) y ADR-047 (la Capa 1).
//
// La distinción que ordena todo el archivo, y que es la decisión B de ADR-046:
//   · **cliente** = la EMPRESA. Cruza pipelines: la voz, el proyecto y el banco de referentes son
//     los mismos para reels y para LinkedIn.
//   · **instancia** = un PIPELINE de esa empresa. Los knobs de reels no son los de LinkedIn.
//
// El rol dice QUÉ zona ve alguien (`roles.ts`); el tenant dice DE QUIÉN son los datos que ve.
// Son ortogonales y se componen: hace falta pasar los dos.

/** El contexto que atraviesa todo `lib/`. Sin esto no se puede construir una query (ADR-047). */
export type TenantContext = {
  /** El cliente al que pertenece el usuario. */
  clientId: string;
  /** `clientId` + sus descendientes. Es contra esta lista que se filtra el grano empresa. */
  visibles: readonly string[];
  /** La instancia del cockpit abierto: (empresa × pipeline). */
  instanceId: string;
};

/** Una fila de `clients`, reducida a lo que la regla necesita. */
export type NodoCliente = { id: string; parentId: string | null };

/** Una fila de `instances`, reducida a lo que la regla necesita. */
export type InstanciaVisible = { id: string; clientId: string };

/**
 * Tope de profundidad del árbol de clientes.
 *
 * ⚠️ No es un límite de producto: es el cinturón del cinturón-y-tirantes de ADR-046. El trigger de
 * la migración `016` rechaza el ciclo al escribir, pero un ciclo que entre por otra vía (un
 * restore, un `alter table ... disable trigger`) colgaría ESTE recorrido en cada request. Un tope
 * convierte "la app no responde" en "la app devuelve de más y se nota". 10 niveles de agencias
 * anidadas es varias veces más de lo que el negocio puede sostener.
 */
export const PROFUNDIDAD_MAXIMA = 10;

/**
 * Los clientes que ve alguien de `clientId`: el suyo y sus descendientes.
 *
 * Baja por el árbol, no sube: un usuario de Retia ve a los clientes de Retia; uno de un cliente de
 * Retia no ve a Retia ni a sus hermanos. Es la regla de visibilidad de ADR-046, y es la que hace
 * que sumar un sub-cliente sea una fila y no una migración.
 *
 * Tolera ciclos por diseño (ver `PROFUNDIDAD_MAXIMA`): visita cada id una sola vez y corta por
 * profundidad. Un árbol corrupto devuelve un resultado acotado en vez de colgar el request.
 */
export function visiblesDesde(clientId: string, clientes: readonly NodoCliente[]): string[] {
  const hijosDe = new Map<string, string[]>();
  for (const c of clientes) {
    if (c.parentId === null || c.parentId === c.id) continue;
    hijosDe.set(c.parentId, [...(hijosDe.get(c.parentId) ?? []), c.id]);
  }

  const visibles: string[] = [];
  const vistos = new Set<string>();
  let frontera = [clientId];

  for (let nivel = 0; nivel <= PROFUNDIDAD_MAXIMA && frontera.length > 0; nivel++) {
    const siguiente: string[] = [];
    for (const id of frontera) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      visibles.push(id);
      siguiente.push(...(hijosDe.get(id) ?? []));
    }
    frontera = siguiente;
  }

  return visibles;
}

/** ¿Este contexto alcanza a este cliente? */
export function puedeVerCliente(ctx: TenantContext, clientId: string): boolean {
  return ctx.visibles.includes(clientId);
}

/**
 * ¿Este contexto alcanza a esta instancia?
 *
 * Se pregunta por el CLIENTE de la instancia, no por `ctx.instanceId`: un usuario puede tener el
 * cockpit abierto en una instancia y tener derecho a otra (el selector de empresa/pipeline de la
 * Fase 3). Confundir "la que está abierta" con "las que puede abrir" sería un bug de navegación
 * disfrazado de bug de permisos.
 */
export function puedeVerInstancia(ctx: TenantContext, instancia: InstanciaVisible): boolean {
  return puedeVerCliente(ctx, instancia.clientId);
}

/**
 * Arma el contexto, o dice por qué no puede.
 *
 * Devuelve `null` en vez de tirar: el llamador (`lib/tenant.ts`) sabe si eso es un `redirect` (una
 * página) o un 403 (la fachada), y esa decisión no es del dominio.
 */
export function armarContexto(
  clientId: string,
  instancia: InstanciaVisible,
  clientes: readonly NodoCliente[],
): TenantContext | null {
  const visibles = visiblesDesde(clientId, clientes);
  if (!visibles.includes(instancia.clientId)) return null;
  return { clientId, visibles, instanceId: instancia.id };
}

/**
 * Las instancias que este usuario puede abrir, para el selector de la Fase 3.
 *
 * Vive acá y no en la pantalla porque es la misma regla de visibilidad: si la pantalla la
 * reimplementara, habría dos definiciones de "sus empresas" y una de las dos se quedaría vieja.
 */
export function instanciasVisibles<T extends InstanciaVisible>(
  ctx: TenantContext,
  instancias: readonly T[],
): T[] {
  return instancias.filter((i) => puedeVerInstancia(ctx, i));
}
