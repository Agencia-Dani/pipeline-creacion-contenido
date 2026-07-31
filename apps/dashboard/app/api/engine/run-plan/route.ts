import { timingSafeEqual } from "node:crypto";
import { armarRunPlan, armarRunPlanCompleto } from "@/domain/run-plan";
import { leerRunPlanCrudo } from "@/lib/config";

// La fachada de ADR-028: el motor pregunta qué correr ANTES de gastar créditos.
// De qué almacenamiento sale cada dominio lo decide lib/config.ts, y va cambiando en D5
// (Ajustes ya es Postgres) sin que el motor se entere: la forma la fija
// core/contracts/run-plan.md y no se mueve.
//
// Fail-closed a propósito: cualquier problema responde ≠200 y la corrida NO arranca
// (una corrida sin config entrega ruido; no entregar es mejor). Auth por header
// compartido, mismo patrón y mismo gestor que el webhook del motor.

export const dynamic = "force-dynamic";

// Devuelve el MOTIVO, no un booleano: desde afuera "el server no tiene la credencial"
// y "el header no coincide" daban el mismo 403, y distinguirlos a ojo cuesta una sesión
// entera (pasó: la env faltaba en Vercel y el síntoma era idéntico a un header mal
// copiado). Decir cuál de los dos es no le sirve a un atacante —no acerca a adivinar el
// valor— y es el "estado legible, siempre" del plan §3.6. El fail-closed no se toca:
// los dos casos siguen siendo 403.
type Auth = "ok" | "sin_credencial_en_el_servidor" | "header_ausente_o_distinto";

function autenticar(request: Request): Auth {
  const nombre = process.env.RUN_PLAN_HEADER_NOMBRE;
  const valor = process.env.RUN_PLAN_HEADER_VALOR;
  if (!nombre || !valor) return "sin_credencial_en_el_servidor";
  const recibido = request.headers.get(nombre) ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(valor);
  // La comparación de largo va antes a propósito: timingSafeEqual tira si difieren.
  // Ojo con esto al debuggear: un espacio o newline de más en la env es largo distinto.
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? "ok" : "header_ausente_o_distinto";
}

export async function GET(request: Request) {
  const auth = autenticar(request);
  if (auth !== "ok") {
    if (auth === "sin_credencial_en_el_servidor") {
      console.error("[run-plan] faltan RUN_PLAN_HEADER_NOMBRE/_VALOR en el entorno: nadie puede autenticarse.");
    }
    return Response.json({ error: "no autorizado", motivo: auth }, { status: 403 });
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
