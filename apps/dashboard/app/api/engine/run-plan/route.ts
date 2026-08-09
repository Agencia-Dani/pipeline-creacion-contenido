import { autenticar, rechazar } from "@/app/api/engine/auth";
import { PIPELINE_LINKEDIN, PIPELINE_REELS } from "@/domain/pipelines";
import { armarRunPlan, armarRunPlanCompleto, armarRunPlanLinkedin } from "@/domain/run-plan";
import { leerRunPlanCrudo, leerRunPlanCrudoLinkedin } from "@/lib/config";
import { contextoDeFachada } from "@/lib/tenant";

// La fachada de ADR-028: el motor pregunta qué correr ANTES de gastar créditos.
// De qué almacenamiento sale cada dominio lo decide lib/config.ts, y va cambiando en D5
// (Ajustes ya es Postgres) sin que el motor se entere: la forma la fija
// core/contracts/run-plan.md y no se mueve.
//
// Fail-closed a propósito: cualquier problema responde ≠200 y la corrida NO arranca
// (una corrida sin config entrega ruido; no entregar es mejor). Auth por header
// compartido, mismo patrón y mismo gestor que el webhook del motor.
//
// 🔀 **Desde ADR-068 esto sirve a DOS pipelines, y son dos EJES, no uno** — la confusión que el
// `workflow.yaml` de LinkedIn tenía escrita (`?ambito=linkedin`, que daba 400):
//
//   · **QUÉ pipeline** → sale de la INSTANCIA, no del que pregunta. Decide qué tablas se leen.
//   · **CUÁN filtrado** (`?ambito`) → sigue siendo del que pregunta, porque es suyo: el mismo
//     pipeline lo pide filtrado desde el motor y completo desde el archivado.
//
// Colapsarlos en `ambito` habría dejado que el llamante contradiga a la base sobre algo que la base
// sabe. Ese desacuerdo NO falla: devuelve el plan del otro pipeline, bien formado.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = autenticar(request);
  if (auth !== "ok") return rechazar(auth, "run-plan");

  // ?ambito=motor (default): filtrado como ADR-028 §2. ?ambito=completo: sin filtros,
  // para archivado (necesita todas las voces) y descubrimiento (ignora `activo`).
  // Un valor desconocido es un typo en n8n: 400 y la corrida no arranca (fail-closed).
  const params = new URL(request.url).searchParams;
  const ambito = params.get("ambito") ?? "motor";
  if (ambito !== "motor" && ambito !== "completo") {
    return Response.json({ error: `ambito desconocido: ${ambito}` }, { status: 400 });
  }

  // ?instancia: de quién es la config que se pide. OBLIGATORIO desde ADR-048 (`version: 2`) —
  // ausente da 400, ajena o inexistente da 403, y en los dos casos la corrida no arranca.
  //
  // El motivo por el que no hay default: el sospechoso número uno de este sistema es un
  // placeholder sin rellenar, y un default acá convertiría "el dispatcher no mandó la instancia"
  // en "corrió la del piloto y le escribió los candidatos a la empresa equivocada", en verde.
  // Un 400 al arrancar cuesta una corrida; el default silencioso cuesta descubrirlo en los datos.
  const tenant = await contextoDeFachada(params.get("instancia") ?? undefined);
  if (!tenant.ok) {
    const status = tenant.motivo === "instancia_ausente" ? 400 : 403;
    console.error(`[run-plan] no se pudo resolver la instancia: ${tenant.motivo}`);
    return Response.json({ error: "instancia no resuelta", motivo: tenant.motivo }, { status });
  }

  // Un pipeline sin plan que servir aborta la corrida, como todo lo demás acá. Pasa si alguien crea
  // una instancia de un pipeline que existe en `workflows` pero al que nadie le escribió su rama —
  // hoy, cualquiera que no sea reels o LinkedIn. Se nombra en la respuesta porque el diagnóstico
  // desde n8n es imposible si el 400 no dice qué pipeline creyó que era.
  if (tenant.pipeline !== PIPELINE_REELS && tenant.pipeline !== PIPELINE_LINKEDIN) {
    console.error(`[run-plan] la instancia es del pipeline '${tenant.pipeline}', que no tiene plan`);
    return Response.json(
      { error: "pipeline sin plan de corrida", motivo: "pipeline_sin_plan", pipeline: tenant.pipeline },
      { status: 400 },
    );
  }

  try {
    if (tenant.pipeline === PIPELINE_LINKEDIN) {
      const crudo = await leerRunPlanCrudoLinkedin(tenant.ctx, ambito);
      return Response.json(armarRunPlanLinkedin(crudo, new Date()));
    }

    const crudo = await leerRunPlanCrudo(tenant.ctx, ambito);
    const plan =
      ambito === "motor" ? armarRunPlan(crudo, new Date()) : armarRunPlanCompleto(crudo, new Date());
    return Response.json(plan);
  } catch (e) {
    console.error(`[run-plan] fallo leyendo config: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "config no disponible" }, { status: 503 });
  }
}
