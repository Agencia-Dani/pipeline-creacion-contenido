/**
 * Corre una server action y convierte un **rechazo** en el mismo `{ ok: false }` que la action
 * devuelve cuando falla adentro.
 *
 * 🩸 **El agujero que tapa, medido el 2026-08-31.** Todas las server actions de este cockpit tienen
 * la misma forma:
 *
 * ```ts
 * const { usuario, ctx } = await exigirTenant(...);   // ← FUERA del try
 * try { ...la escritura... } catch (e) { return { ok: false, mensaje: "..." }; }
 * ```
 *
 * `exigirTenant` va a Supabase **antes** del `try`, y tiene que quedar afuera: adentro se tragaría
 * el `redirect()` de Next, que funciona tirando un error especial. O sea que no es un descuido, es
 * una restricción del framework — y por eso el arreglo va acá, del lado del cliente, y no moviendo
 * el `try` allá.
 *
 * La consecuencia era que si esa primera llamada fallaba por infra (un parpadeo de Supabase, no
 * "no hay sesión"), la action **rechazaba** en vez de devolver `{ok:false}`, y los call sites que
 * ya habían pintado la UI optimista solo revertían con `!r.ok`. `mazo.tsx` lo prometía por escrito
 * —*"si falla, se revierte y la tarjeta muestra el error — nunca queda mintiendo"*— y era
 * justamente lo que no pasaba: la tarjeta quedaba calificada, el spinner nunca se apagaba, no
 * aparecía ningún error, y **no se había escrito nada**. Al refrescar volvía a "sin calificar",
 * indistinguible de que nadie la hubiera tocado.
 *
 * Pega en el clic más usado del sistema: calificar es el **52%** de todos los eventos.
 */
export async function intentar<T extends { ok: boolean }>(
  accion: () => Promise<T>,
  mensaje = "No se pudo guardar. Probá de nuevo.",
): Promise<T | { ok: false; mensaje: string }> {
  try {
    return await accion();
  } catch (e) {
    // La consola del browser es el único lugar donde esto se puede ver; el usuario ve `mensaje`.
    console.error("[accion] la server action rechazó en vez de devolver {ok:false}:", e);
    return { ok: false, mensaje };
  }
}
