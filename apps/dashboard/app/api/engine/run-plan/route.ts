import { autenticar, rechazar } from "@/app/api/engine/auth";
import { armarRunPlan, armarRunPlanCompleto } from "@/domain/run-plan";
import { leerRunPlanCrudo } from "@/lib/config";
import { contextoDeFachada } from "@/lib/tenant";

// La fachada de ADR-028: el motor pregunta qué correr ANTES de gastar créditos.
// De qué almacenamiento sale cada dominio lo decide lib/config.ts, y va cambiando en D5
// (Ajustes ya es Postgres) sin que el motor se entere: la forma la fija
// core/contracts/run-plan.md y no se mueve.
//
// Fail-closed a propósito: cualquier problema responde ≠200 y la corrida NO arranca
// (una corrida sin config entrega ruido; no entregar es mejor). Auth por header
// compartido, mismo patrón y mismo gestor que el webhook del motor.

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

  try {
    const crudo = await leerRunPlanCrudo(tenant.ctx, ambito);
    const plan =
      ambito === "motor" ? armarRunPlan(crudo, new Date()) : armarRunPlanCompleto(crudo, new Date());
    return Response.json(plan);
  } catch (e) {
    console.error(`[run-plan] fallo leyendo config: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "config no disponible" }, { status: 503 });
  }
}
