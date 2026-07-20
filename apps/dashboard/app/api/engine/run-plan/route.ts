import { timingSafeEqual } from "node:crypto";
import { armarRunPlan } from "@/domain/run-plan";
import { leerRunPlanCrudo } from "@/lib/airtable";

// La fachada de ADR-028: el motor pregunta qué correr ANTES de gastar créditos.
// Hoy lee Airtable por dentro (D4); en D5 la fuente pasa a Postgres dominio por
// dominio sin que el motor se entere (la forma la fija core/contracts/run-plan.md).
//
// Fail-closed a propósito: cualquier problema responde ≠200 y la corrida NO arranca
// (una corrida sin config entrega ruido; no entregar es mejor). Auth por header
// compartido, mismo patrón y mismo gestor que el webhook del motor.

export const dynamic = "force-dynamic";

function headerValido(request: Request): boolean {
  const nombre = process.env.RUN_PLAN_HEADER_NOMBRE;
  const valor = process.env.RUN_PLAN_HEADER_VALOR;
  if (!nombre || !valor) return false; // sin config no hay acceso, nunca abierto
  const recibido = request.headers.get(nombre) ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(valor);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!headerValido(request)) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }

  try {
    const crudo = await leerRunPlanCrudo();
    return Response.json(armarRunPlan(crudo, new Date()));
  } catch (e) {
    console.error(`[run-plan] fallo leyendo config: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "config no disponible" }, { status: 503 });
  }
}
