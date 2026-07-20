import { timingSafeEqual } from "node:crypto";
import { armarRunPlan, armarRunPlanCompleto } from "@/domain/run-plan";
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

  // ?ambito=motor (default): filtrado como ADR-028 §2. ?ambito=completo: sin filtros,
  // para archivado (necesita todas las voces) y descubrimiento (ignora `activo`).
  // Un valor desconocido es un typo en n8n: 400 y la corrida no arranca (fail-closed).
  const ambito = new URL(request.url).searchParams.get("ambito") ?? "motor";
  if (ambito !== "motor" && ambito !== "completo") {
    return Response.json({ error: `ambito desconocido: ${ambito}` }, { status: 400 });
  }

  try {
    const crudo = await leerRunPlanCrudo(ambito);
    const plan =
      ambito === "motor" ? armarRunPlan(crudo, new Date()) : armarRunPlanCompleto(crudo, new Date());
    return Response.json(plan);
  } catch (e) {
    console.error(`[run-plan] fallo leyendo config: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "config no disponible" }, { status: 503 });
  }
}
