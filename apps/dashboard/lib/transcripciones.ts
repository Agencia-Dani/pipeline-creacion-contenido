import { z } from "zod";
import type { EnlaceVideo } from "@/domain/enlace";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// IO del transcriptor (ADR-031): la cola en `app.transcripciones` y la marca en `processed_items`.
// Todo por `scoped()`: desde el flip de la Capa 2 (ADR-058) las pantallas entran con la sesión del
// usuario y las policies de la `021` se evalúan. El filtro de tenant sigue haciendo falta igual —
// RLS acota a las empresas del usuario, `scoped()` al cockpit abierto.
//
// 🚨 **Los dos `onConflict` de este archivo cambiaron con la migración `016`, y no es cosmético.**
// PostgREST exige que el arbiter del upsert coincida con un unique existente: si no, tira `42P10` y
// el insert muere entero. La `016` reemplazó `unique (plataforma, external_id)` de
// `app.transcripciones` por uno con la instancia adentro, así que **este archivo no se puede
// deployar antes de aplicarla** (el orden está en plan-multi-tenant §11.3, y es el mismo motivo por
// el que la `014` tenía que ir antes del deploy de su código).

const filaTranscripcion = z.object({
  id: z.string(),
  plataforma: z.enum(["instagram", "tiktok"]),
  external_id: z.string(),
  url: z.string(),
  estado: z.enum(["pendiente", "listo", "sin_transcript", "fallo", "abandonado"]),
  script: z.string().nullable(),
  idioma: z.string().nullable(),
  error: z.string().nullable(),
  creado_en: z.string(),
  procesado_en: z.string().nullable(),
  // ADR-069: ortogonal a `estado`. NULL = no grabado, que es el estado normal de casi toda fila.
  grabado_en: z.string().nullable(),
});
export type Transcripcion = z.infer<typeof filaTranscripcion>;

const COLUMNAS =
  "id, plataforma, external_id, url, estado, script, idioma, error, creado_en, procesado_en, grabado_en";

/** Los dos estados de los que solo se sale por el botón `Reintentar`. */
export const ESTADOS_FALLIDOS = ["fallo", "sin_transcript"] as const;

/**
 * Las filas de UNA tanda. Es lo que baja cuando alguien la abre (ADR-064 §3).
 *
 * 🩸 **Reemplaza a `leerTranscripciones(limite = 50)`, y el límite era el bug.** Esa función traía
 * las últimas 50 filas **con sus `script`** y no había nada en la pantalla que dijera que había más:
 * al 2026-08-07, con 110 en la base, **ocultaba más de la mitad de lo que existe**. Sin ventana acá
 * porque el recorte ya lo hace la tanda: se paga el `script` de lo que alguien abrió a propósito.
 */
export async function leerFilasDeTanda(
  ctx: TenantContext,
  tandaId: string,
): Promise<Transcripcion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.transcripciones", COLUMNAS)
    .eq("tanda_id", tandaId)
    .order("creado_en", { ascending: false });
  if (error)
    throw new Error(`Supabase respondió con error leyendo la tanda: ${error.message}`);
  return z.array(filaTranscripcion).parse(data ?? []);
}

/**
 * Las que no quedaron en ninguna tanda. **Es un canario, no una categoría.**
 *
 * Tiene que dar siempre cero: el backfill de la `027` metió las 110 viejas en sus 9 tandas y el
 * encolado asigna la suya. Pero `asignarTanda` es best-effort a propósito (el registro es sumidero,
 * invariante #1), así que un fallo suyo dejaría filas fuera de toda cabecera — o sea **guiones ya
 * pagados invisibles en la pantalla**, que es peor que el techo de 50 que esto vino a arreglar.
 * La tarjeta solo se dibuja si aparece alguna.
 */
export async function leerSueltas(ctx: TenantContext): Promise<Transcripcion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.transcripciones", COLUMNAS)
    .is("tanda_id", null)
    .order("creado_en", { ascending: false });
  if (error)
    throw new Error(`Supabase respondió con error leyendo las sueltas: ${error.message}`);
  return z.array(filaTranscripcion).parse(data ?? []);
}

/**
 * Las que fallaron, aparte y sin límite de ventana.
 *
 * 🩸 **Por qué no alcanza con filtrar la lista de arriba** (medido el 2026-08-07): esa lista trae
 * las últimas 50 por `creado_en`, y una tanda de 52 links pegados de una sola vez comparte el mismo
 * timestamp al segundo. La única fila fallada del día cayó en la posición **49 de 50**, indistinguible
 * a simple vista entre 49 `Listo` — el operador no la encontró. Y el desempate entre timestamps
 * iguales es arbitrario, así que **el siguiente pegote la empuja fuera de la ventana**: el botón
 * `Reintentar` se vuelve inalcanzable y la fila queda clavada, que es exactamente el bug que ese
 * botón existe para matar.
 *
 * Son pocas por definición (las que fallaron y nadie reintentó todavía), así que traerlas enteras
 * es más barato que paginar la lista.
 */
export async function leerFallidas(ctx: TenantContext): Promise<Transcripcion[]> {
  const { data, error } = await (await scoped(ctx))
    .select("app.transcripciones", COLUMNAS)
    .in("estado", [...ESTADOS_FALLIDOS])
    .order("creado_en", { ascending: false });
  if (error)
    throw new Error(`Supabase respondió con error leyendo las fallidas: ${error.message}`);
  return z.array(filaTranscripcion).parse(data);
}

/**
 * `ids` son **los que de verdad entraron**, no los que se mandaron: el `ignoreDuplicates` decide, y
 * hasta que Postgres no responde nadie sabe cuántos eran nuevos. Los usa `asignarTanda` para
 * ponerles su pegote — ver ahí por qué la tanda se crea después y no antes.
 */
export type ResultadoEncolar = { nuevos: number; yaEstaban: number; ids: string[] };

// Inserta los enlaces como pendientes. El unique hace el trabajo: `ignoreDuplicates` deja pasar los
// que ya se pidieron antes en vez de volver a pagarlos.
//
// Y ahora es **por instancia**: que otra empresa haya pedido este video no significa que esta ya lo
// tenga. El script vive en su fila, no en la de al lado.
// ⚠️ Ya no recibe `pedidoPor`. `transcripciones.pedido_por` se escribía y no la leía nadie, así que
// la dropea la `023` (ADR-059) y este insert tiene que dejar de mandarla antes — un body con una
// columna inexistente es `PGRST204` y se lleva el encolado entero. **Quién pidió qué no se pierde**:
// el acto queda en `app.eventos`, que es donde vive la auditoría.
export async function encolarEnlaces(
  ctx: TenantContext,
  enlaces: EnlaceVideo[],
): Promise<ResultadoEncolar> {
  if (enlaces.length === 0) return { nuevos: 0, yaEstaban: 0, ids: [] };
  const { data, error } = await (await scoped(ctx))
    .upsert(
      "app.transcripciones",
      enlaces.map((e) => ({
        plataforma: e.plataforma,
        external_id: e.external_id,
        url: e.url,
      })),
      { onConflict: "instance_id,plataforma,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error encolando transcripciones: ${error.message}`);
  const ids = z.array(z.object({ id: z.string() })).parse(data ?? []).map((f) => f.id);
  return { nuevos: ids.length, yaEstaban: enlaces.length - ids.length, ids };
}

/**
 * Cuánto vale un reclamo antes de que otra pasada pueda quedarse con el enlace.
 *
 * 🔑 **3 minutos porque el techo real son 60 segundos, no porque suene prudente.** La pantalla
 * declara `maxDuration = 60`, así que Vercel mata la función a los 60 s pase lo que pase: ningún
 * enlace puede seguir en vuelo más allá de eso, ni siquiera el peor caso teórico (90 s de Supadata
 * + 60 s de Haiku, que la plataforma nunca deja llegar). Con 3× ese techo, **un reclamo vencido
 * significa siempre que el trabajador murió**, nunca que está tardando.
 *
 * El precio de pasarse para arriba es que la cola parezca trabada un rato tras una función muerta;
 * el de quedarse corto es pagar el video dos veces, que es justo lo que esto existe para evitar.
 * Por eso el error se comete hacia arriba.
 */
const RECLAMO_VENCE_MS = 3 * 60_000;

/**
 * Toma hasta `limite` pendientes **reclamándolos**, para que dos pasadas en paralelo no trabajen
 * sobre los mismos enlaces.
 *
 * 🩸 El bug que arregla: `tomarPendientes` era un `select` puro, y la pantalla **arranca sola** al
 * cargar. Dos personas con la pestaña abierta no competían por un enlace suelto: `order creado_en
 * limit 64` les daba a las dos **el mismo lote entero**, así que se transcribían y se pagaban los
 * 64 dos veces (~USD 0,014 c/u). El comentario viejo lo minimizaba como *"pueden agarrar el mismo
 * enlace"*.
 *
 * 🔑 **El reclamo es un solo UPDATE, y ahí está toda la atomicidad.** No hay lock ni tabla de
 * colas: el `where` incluye la condición de "libre", así que la segunda pasada no matchea las
 * filas que la primera acaba de marcar y se las lleva 0. `select()` devuelve exactamente las que
 * este llamador ganó.
 *
 * ⏱️ **El reclamo vence solo**, así que no hace falta un barrido: si una función de Vercel muere a
 * mitad, sus filas vuelven a estar libres a los 3 minutos por la misma condición del `where`.
 *
 * ponytail: el reclamo se marca en `procesado_en` en vez de un estado `procesando` propio, porque
 * lo segundo pide un valor de enum nuevo ⇒ migración en `core/schema/` ⇒ ADR, y esto es un
 * problema de ~USD 0,90 por cola duplicada. El techo: mientras la fila está `pendiente`,
 * `procesado_en` significa *"reclamada en"*, y al terminar `marcarResultado` lo pisa con la hora
 * real de fin. Nadie más lee esa columna (verificado: 3 referencias, las 3 en este archivo, y la
 * pantalla muestra `creado_en`). Si algún día hace falta distinguir *reclamada* de *terminada* —
 * por ejemplo para mostrar "procesando…" en la lista— eso ya es un estado de verdad y va con ADR.
 */
export async function reclamarPendientes(
  ctx: TenantContext,
  limite: number,
): Promise<Transcripcion[]> {
  const s = await scoped(ctx);
  const vencido = new Date(Date.now() - RECLAMO_VENCE_MS).toISOString();

  // Primero los candidatos, solo para acotar el UPDATE a un lote: quién se los queda lo decide el
  // `where` de abajo, no esta lectura.
  const { data: candidatos, error: errorLectura } = await s
    .select("app.transcripciones", "id")
    .eq("estado", "pendiente")
    .or(`procesado_en.is.null,procesado_en.lt.${vencido}`)
    .order("creado_en", { ascending: true })
    .limit(limite);
  if (errorLectura)
    throw new Error(`Supabase respondió con error leyendo la cola: ${errorLectura.message}`);

  const ids = z.array(z.object({ id: z.string() })).parse(candidatos ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  const { data, error } = await (await scoped(ctx))
    .update("app.transcripciones", { procesado_en: new Date().toISOString() })
    .in("id", ids)
    .eq("estado", "pendiente")
    .or(`procesado_en.is.null,procesado_en.lt.${vencido}`)
    .select(COLUMNAS);
  if (error)
    throw new Error(`Supabase respondió con error reclamando la cola: ${error.message}`);

  return z.array(filaTranscripcion).parse(data ?? []);
}

/**
 * Devuelve un enlace terminado-en-mal a la cola.
 *
 * 🩸 Hasta el 2026-08-07 no existía, y era el hueco más caro de los tres: `reclamarPendientes` solo
 * levanta filas `pendiente`, así que una que quedó en `fallo` o `sin_transcript` **no se
 * reintentaba nunca**; y volver a pegar el link tampoco servía, porque el `ignoreDuplicates` del
 * encolado lo descartaba como repetido. La fila quedaba clavada para siempre salvo borrarla por
 * SQL. Con el 65% de transcripciones vacías que viene marcando Supadata, eso no es un caso raro.
 *
 * 🔒 El `.in("estado", …)` no es decoración: sin él, esto reencola un `listo` y **se vuelve a
 * pagar** un video cuyo guion ya tenemos. La pantalla solo dibuja el botón en los dos estados
 * malos, pero la pantalla esconde y el servidor impide.
 *
 * `procesado_en: null` lo devuelve al estado "libre" que mira el reclamo; sin eso quedaría
 * invisible hasta que venciera el reclamo fantasma de su corrida anterior.
 */
export async function reencolar(ctx: TenantContext, id: string): Promise<boolean> {
  const { data, error } = await (await scoped(ctx))
    .update("app.transcripciones", {
      estado: "pendiente",
      script: null,
      idioma: null,
      error: null,
      procesado_en: null,
    })
    .eq("id", id)
    .in("estado", ["fallo", "sin_transcript"])
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error reencolando: ${error.message}`);
  // 0 filas = o no existe, o no es de este cockpit, o ya estaba `listo`. Las tres se contestan
  // igual, y ninguna es un error del servidor.
  return (data?.length ?? 0) > 0;
}

/**
 * De un lote de enlaces, cuáles **ya están en la cola de este cockpit** (en cualquier estado) y
 * cuáles **ya los vio el motor**. Devuelve claves de `claveDe`, listas para `repartirEnlaces`.
 *
 * Se pregunta por `external_id` y la plataforma se compara después, en la clave: PostgREST no tiene
 * una forma cómoda de filtrar por tuplas, y traer las dos columnas y armar la clave en memoria es
 * más barato que dos queries por plataforma.
 *
 * Se trocea de a 200 por la misma razón que el archivado: 400 links en un `in.()` arman una URL de
 * varios KB, y el límite del que se entera uno es el 414 en producción.
 */
async function clavesConocidas(
  ctx: TenantContext,
  tabla: "app.transcripciones" | "public.processed_items",
  externalIds: string[],
): Promise<Set<string>> {
  // Las dos tablas nombran distinto la misma columna: `plataforma` la nuestra, `platform` la del
  // motor. Se normaliza acá para que `claveDe` reciba siempre la misma forma.
  const filaClave =
    tabla === "app.transcripciones"
      ? z.object({ plataforma: z.string(), external_id: z.string() })
      : z
          .object({ platform: z.string(), external_id: z.string() })
          .transform((f) => ({ plataforma: f.platform, external_id: f.external_id }));
  const columnas = tabla === "app.transcripciones" ? "plataforma, external_id" : "platform, external_id";

  const s = await scoped(ctx);
  const claves = new Set<string>();

  for (let i = 0; i < externalIds.length; i += 200) {
    const { data, error } = await s
      .select(tabla, columnas)
      .in("external_id", externalIds.slice(i, i + 200));
    if (error)
      throw new Error(`Supabase respondió con error consultando ${tabla}: ${error.message}`);
    for (const fila of z.array(filaClave).parse(data ?? [])) {
      claves.add(`${fila.plataforma}:${fila.external_id}`);
    }
  }
  return claves;
}

export async function cualesEnCola(ctx: TenantContext, ids: string[]): Promise<Set<string>> {
  return ids.length === 0 ? new Set() : clavesConocidas(ctx, "app.transcripciones", ids);
}

/**
 * Cuáles de esos links están en la cola **pero terminaron mal**.
 *
 * Es un subconjunto de `cualesEnCola`, no una alternativa: los dos se consultan y `repartirEnlaces`
 * les da precedencia a estos. Sin esta pregunta, la pantalla anuncia *"viene en camino"* sobre un
 * link que no viene.
 */
export async function cualesFallidas(ctx: TenantContext, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const s = await scoped(ctx);
  const claves = new Set<string>();

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await s
      .select("app.transcripciones", "plataforma, external_id")
      .in("external_id", ids.slice(i, i + 200))
      .in("estado", [...ESTADOS_FALLIDOS]);
    if (error)
      throw new Error(`Supabase respondió con error consultando las fallidas: ${error.message}`);
    for (const fila of z
      .array(z.object({ plataforma: z.string(), external_id: z.string() }))
      .parse(data ?? []))
      claves.add(`${fila.plataforma}:${fila.external_id}`);
  }
  return claves;
}

/**
 * Cuáles de esos links **ya se grabaron** (ADR-069).
 *
 * 🔑 **Es la única de las cuatro preguntas que responde "no lo vuelvas a mandar".** Las otras tres
 * describen dónde está el link (en la cola, fallado, visto por el motor) y todas admiten un "pero
 * transcribilo igual" razonable. Esta no: el guion ya se usó. Por eso `repartirEnlaces` le da
 * precedencia sobre las tres.
 *
 * Pregunta por `grabado_en is not null` y no por una columna booleana: la marca guarda **cuándo**,
 * porque es la pregunta que sigue siempre a "¿ya se grabó?" y cuesta lo mismo.
 *
 * Mismo troceo de 200 que sus hermanas: 400 links en un `in.()` arman una URL de varios KB y el
 * límite del que se entera uno es el 414 en producción.
 */
export async function cualesGrabadas(ctx: TenantContext, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const s = await scoped(ctx);
  const claves = new Set<string>();

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await s
      .select("app.transcripciones", "plataforma, external_id")
      .in("external_id", ids.slice(i, i + 200))
      .not("grabado_en", "is", null);
    if (error)
      throw new Error(`Supabase respondió con error consultando las grabadas: ${error.message}`);
    for (const fila of z
      .array(z.object({ plataforma: z.string(), external_id: z.string() }))
      .parse(data ?? []))
      claves.add(`${fila.plataforma}:${fila.external_id}`);
  }
  return claves;
}

export async function cualesVistosPorElMotor(
  ctx: TenantContext,
  ids: string[],
): Promise<Set<string>> {
  return ids.length === 0 ? new Set() : clavesConocidas(ctx, "public.processed_items", ids);
}

export async function contarPendientes(ctx: TenantContext): Promise<number> {
  const { count, error } = await (await scoped(ctx))
    .select("app.transcripciones", "id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error)
    throw new Error(`Supabase respondió con error contando la cola: ${error.message}`);
  return count ?? 0;
}

export async function marcarResultado(
  ctx: TenantContext,
  id: string,
  campos: { estado: Transcripcion["estado"]; script?: string; idioma?: string; error?: string },
): Promise<void> {
  const { error } = await (await scoped(ctx))
    .update("app.transcripciones", { ...campos, procesado_en: new Date().toISOString() })
    .eq("id", id);
  if (error)
    throw new Error(`Supabase respondió con error marcando la transcripción: ${error.message}`);
}

// La razón de ser de toda la herramienta: dejar el enlace en la memoria del dedup para que el
// motor no lo vuelva a recomendar. Mismo INSERT idempotente que hace el nodo `POST
// processed_items` — el external_id ya viene con la forma exacta que graba el motor (ADR-031).
//
// Solo se llama cuando la transcripción salió bien (decisión de Mani): si no hubo transcript, el
// enlace queda libre. No se pierde gran cosa — si el motor lo trae, el gate lo descarta duro por
// sin_guion (ADR-030).
export async function registrarEnDedup(ctx: TenantContext, enlace: EnlaceVideo): Promise<void> {
  const { error } = await (await scoped(ctx)).upsert(
    "public.processed_items",
    [
      {
        // Solo la clave del dedup. `url` y `flag_viral` se escribían y no las leía nadie: se van
        // en la `023` (ADR-059), y este upsert deja de mandarlas antes para no comerse un PGRST204
        // — que acá sería peor que en el motor, porque el enlace quedaría fuera de la memoria.
        platform: enlace.plataforma,
        external_id: enlace.external_id,
      },
    ],
    // El arbiter nuevo de la `016`. El viejo (`platform,external_id`) sigue existiendo hasta la
    // `017`, así que los dos funcionan hoy — pero escribir el viejo acá dejaría este archivo roto
    // el día que se corra el cierre, y ese día nadie va a estar mirando este upsert.
    { onConflict: "instance_id,platform,external_id", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`Supabase respondió con error registrando el dedup: ${error.message}`);
}

/**
 * Cierra un enlace que **nunca va a dar un script** — el caso que la pidió es un video sin voz.
 *
 * 🔑 **Abandonar no es descartar** (ADR-062 §4). En este dominio *descartar* es siempre un juicio de
 * mérito: el gate rechazó el video, o el equipo le puso 👎. Esto dice que el **insumo está roto**, y
 * por eso no alimenta ningún aprendizaje.
 *
 * 🩸 **La fila queda, y ese es el punto.** Es la memoria de que el link ya se pidió: sin ella, el
 * `ignoreDuplicates` de `encolarEnlaces` no tiene contra qué chocar y el mismo link se vuelve a
 * colar, se vuelve a pagar y vuelve a fallar.
 *
 * 🔒 El `.in("estado", ESTADOS_FALLIDOS)` es el mismo guardia que `reencolar`, y por el mismo
 * motivo: sin él, un POST a mano abandona un `listo` y **borra del histórico un guion que ya se
 * pagó**. La pantalla solo dibuja el botón en los dos estados malos; la pantalla esconde y el
 * servidor impide.
 */
export async function abandonar(ctx: TenantContext, id: string): Promise<boolean> {
  const { data, error } = await (await scoped(ctx))
    .update("app.transcripciones", { estado: "abandonado" })
    .eq("id", id)
    .in("estado", [...ESTADOS_FALLIDOS])
    .select("id");
  if (error) throw new Error(`Supabase respondió con error abandonando: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Prende o apaga la marca de "ya se grabó" (ADR-069 §5).
 *
 * 🔓 **Las dos direcciones en la misma función, y sin guardia de estado.** Es deliberado y es lo
 * contrario de `abandonar` y `reencolar`, que sí filtran por `estado`: ahí el `.in(...)` impide que
 * un POST a mano destruya un guion pagado. Acá no hay nada que destruir — desmarcar devuelve el
 * estado exacto de antes — así que una guardia solo agregaría un modo de falla ("no se pudo marcar")
 * sobre un acto que no tiene consecuencias.
 *
 * Tampoco filtra por `estado = 'listo'`: marcar un `pendiente` como grabado es raro pero no es un
 * error del sistema. Si alguien grabó el video antes de que llegara su transcripción, la herramienta
 * no tiene por qué discutírselo.
 *
 * Devuelve `false` cuando no tocó ninguna fila: o no existe, o no es de este cockpit (el filtro de
 * `scoped` entra en el `update`). Las dos se contestan igual, y ninguna es un error del servidor.
 */
export async function marcarGrabado(
  ctx: TenantContext,
  id: string,
  grabado: boolean,
): Promise<boolean> {
  const { data, error } = await (await scoped(ctx))
    .update("app.transcripciones", { grabado_en: grabado ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error)
    throw new Error(`Supabase respondió con error marcando lo grabado: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
