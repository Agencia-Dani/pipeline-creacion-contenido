import { timingSafeEqual } from "node:crypto";

// La auth de la fachada, en un solo lugar. La comparten `run-plan` (ADR-028) e `instancias`
// (ADR-048 §4): mismo header compartido, misma credencial, mismo fail-closed. Vive acá y no en
// `lib/` porque no es IO ni sabe de tenants — es el portero de los dos endpoints que n8n consume,
// y sus únicos consumidores son sus vecinos de carpeta.
//
// Estaba adentro de `run-plan/route.ts` hasta la Fase 4. Se sacó al aparecer el segundo endpoint:
// dos copias de una comparación de credenciales son dos copias que se desincronizan, y la que se
// quede vieja no falla ruidosamente — sigue devolviendo 200.

// Devuelve el MOTIVO, no un booleano: desde afuera "el server no tiene la credencial" y "el header
// no coincide" daban el mismo 403, y distinguirlos a ojo cuesta una sesión entera (pasó: la env
// faltaba en Vercel y el síntoma era idéntico a un header mal copiado). Decir cuál de los dos es
// no le sirve a un atacante —no acerca a adivinar el valor— y es el "estado legible, siempre" del
// plan §3.6. El fail-closed no se toca: los dos casos siguen siendo 403.
export type Auth = "ok" | "sin_credencial_en_el_servidor" | "header_ausente_o_distinto";

export function autenticar(request: Request): Auth {
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

/** El 403 común. `endpoint` solo entra al log, para no tener que adivinar cuál de los dos rebotó. */
export function rechazar(auth: Exclude<Auth, "ok">, endpoint: string): Response {
  if (auth === "sin_credencial_en_el_servidor") {
    console.error(`[${endpoint}] faltan RUN_PLAN_HEADER_NOMBRE/_VALOR en el entorno: nadie puede autenticarse.`);
  }
  return Response.json({ error: "no autorizado", motivo: auth }, { status: 403 });
}
