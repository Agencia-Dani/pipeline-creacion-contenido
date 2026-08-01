import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// El buscador de cuentas corre **solo cuando alguien lo pide** (enmienda de ADR-020, 2026-08-01):
// el cron de los lunes salió. La razón es medida, no estética — había 8 propuestas pendientes y
// cero resueltas, o sea que la bandeja se llenaba más rápido de lo que el equipo la vacía, y cada
// corrida paga Apify y Haiku. Buscar cuando el equipo terminó de decidir sobre lo anterior es
// cuando la búsqueda vale.

const filaRun = z.object({ id: z.string(), inicio: z.string(), estado: z.string() });

/**
 * ¿Hay una búsqueda corriendo ahora?
 *
 * El motor resuelve esto con un guard single-flight adentro del workflow (ADR-023) porque su
 * corrida dura ~30 min y tiene 3 triggers. Acá alcanza con preguntar antes de disparar: hay un
 * solo camino de entrada (este botón) y el costo de un doble click es una corrida de Apify
 * repetida, no un feed duplicado. Menos nodos, mismo resultado.
 *
 * La ventana es la misma que usa el barredor de zombies: un `en_curso` más viejo que eso no es
 * una corrida viva, es una que murió sin cerrar y no tiene por qué bloquear la próxima.
 */
export async function hayBusquedaViva(ventanaMin = 60): Promise<boolean> {
  const supabase = createAdminClient();
  const desde = new Date(Date.now() - ventanaMin * 60_000).toISOString();
  const { data, error } = await supabase
    .from("runs")
    .select("id, inicio, estado")
    .eq("params->>workflow", "descubrimiento")
    .eq("estado", "en_curso")
    .gte("inicio", desde)
    .limit(1);
  // Fail-open: si no se puede saber, se deja disparar. El costo de un falso negativo es una
  // corrida de más; el de un falso positivo es que el botón no funcione y nadie sepa por qué.
  if (error) {
    console.error("[descubrimiento] no se pudo chequear si hay una búsqueda viva:", error.message);
    return false;
  }
  return z.array(filaRun).parse(data).length > 0;
}
