import { autenticar, rechazar } from "@/app/api/engine/auth";
import { instanciasDePipeline } from "@/lib/tenant";

// El segundo endpoint de la fachada (ADR-048 §4), y el único consumidor es el dispatcher de
// ADR-050: le dice QUIÉNES corren, para que después dispare una ejecución por cada uno.
//
// Es de solo lectura y no sabe de sesiones: misma auth de header compartido que `run-plan`, mismo
// fail-closed. Devuelve `id` (lo que viaja en el payload del webhook) y la identidad legible, que
// no la usa el dispatcher pero sí quien mira una ejecución fallida y necesita saber de quién era.
//
// Por qué acá y no una query directa de n8n a PostgREST: el motor dejó de conocer el schema de la
// config en ADR-028 y esto es la misma regla. Si mañana "instancia activa" deja de ser
// `estado = 'active'`, cambia la app y ningún workflow se entera.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = autenticar(request);
  if (auth !== "ok") return rechazar(auth, "instancias");

  // `workflow` es obligatorio a propósito: sin él la respuesta serían TODAS las instancias de
  // todos los pipelines, y el dispatcher del motor terminaría disparándole el webhook del motor a
  // una instancia de LinkedIn. Un filtro que se puede olvidar es un filtro que se olvida.
  const workflow = new URL(request.url).searchParams.get("workflow");
  if (!workflow) {
    return Response.json({ error: "falta el parámetro workflow" }, { status: 400 });
  }

  try {
    const instancias = await instanciasDePipeline(workflow);
    // Lista vacía es 200, no 404: un pipeline sin instancias activas es un estado legítimo (nadie
    // lo contrató todavía, o se pausaron todas) y el dispatcher tiene que poder no disparar nada
    // sin que eso parezca un error. El 404 lo mandaría a su rama de fallo por un caso normal.
    return Response.json({
      workflow,
      instancias: instancias.map((i) => ({
        id: i.id,
        cliente: i.clientId,
        slug: i.slug,
        nombre: i.nombre,
      })),
    });
  } catch (e) {
    console.error(`[instancias] fallo leyendo el registro: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "registro no disponible" }, { status: 503 });
  }
}
