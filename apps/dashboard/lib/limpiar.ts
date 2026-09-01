import { armarPrompt } from "@/domain/limpieza";
import { leerClave } from "@/lib/env";

// La llamada que pule un guion (ADR-074). El BFF es el único portador de secretos.
//
// ⚠️ **INVARIANTE: los parámetros son los mismos que el resto del sistema.** `claude-haiku-4-5`,
// `anthropic-version: 2023-06-01`, fetch a mano sin SDK (no hay ninguno instalado y los 7
// call-sites del sistema arman el suyo). Si el modelo se sube a Sonnet, se sube acá y se anota en
// `guiones_limpios.modelo`, que existe justamente para poder comparar después.

export const MODELO = "claude-haiku-4-5";

/** El mismo tope que el traductor y que el nodo `Traducir` del motor. */
const TOPE = 6000;

/**
 * 🔴 **Fail-CLOSED, y es la diferencia con `traducir()`.**
 *
 * El traductor es fail-open: si Haiku falla, devuelve el texto en su idioma original, porque *"mejor
 * entregar el texto en su idioma que no entregar nada"*. Acá esa lógica se rompe: devolver el crudo
 * como si fuera el limpio le mostraría a alguien una pestaña "Limpio" **idéntica al crudo** y le
 * haría creer que el modelo lo revisó y no encontró nada que cambiar. Eso es peor que no tener
 * limpio, porque no se distingue de un éxito.
 *
 * Entonces: si falla, `null`, y la pantalla dice que no se pudo. El crudo sigue intacto donde
 * siempre estuvo y no se perdió nada.
 */
export async function limpiar(
  script: string,
  perfilVoz: string | null,
): Promise<string | null> {
  const texto = script.trim();
  if (texto === "") return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": leerClave("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        // Más que el traductor (2000) porque el limpio puede quedar **más largo** que la entrada:
        // el punto 1 del prompt manda marcar los turnos con "VOZ 1:" / "VOZ 2:", y el aviso ⚠️ del
        // final también suma. Con 2000 un guion largo saldría cortado a la mitad, que es la peor
        // falla posible acá: se ve como un guion terminado.
        max_tokens: 4000,
        system: armarPrompt(perfilVoz),
        messages: [{ role: "user", content: texto.slice(0, TOPE) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error(`[limpiar] Anthropic respondió ${res.status}`);
      return null;
    }
    const cuerpo = await res.json();

    // 🩸 Si el modelo se quedó sin tokens, lo que vuelve es un guion cortado a la mitad **que se ve
    // terminado**. Es la única falla de acá que no se nota mirando. Se descarta.
    if (cuerpo?.stop_reason === "max_tokens") {
      console.error("[limpiar] la respuesta se cortó por max_tokens: se descarta.");
      return null;
    }

    const limpio = String(cuerpo?.content?.[0]?.text ?? "").trim();
    return limpio === "" ? null : limpio;
  } catch (e) {
    console.error("[limpiar] no se pudo limpiar el guion:", e);
    return null;
  }
}

