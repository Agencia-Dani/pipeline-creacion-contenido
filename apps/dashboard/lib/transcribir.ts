// Las dos llamadas externas del transcriptor (ADR-031): Supadata para el transcript, Haiku para
// traducirlo. Viven acá y solo acá — el BFF es el único portador de secretos (plan-cockpit C2).
//
// ⚠️ INVARIANTE DE PRODUCTO: esto tiene que producir el MISMO script literal que el motor. Los
// parámetros de abajo (endpoint, tope de 6000 caracteres, modelo, y sobre todo el system prompt)
// están copiados textual de los nodos `Transcribir (Supadata)` y `Traducir (Claude Haiku)` de
// Workflows/workflow-short-form-content/workflow.json. Si allá cambian, acá también — si no, el
// equipo recibe dos traducciones distintas del mismo video según de dónde vino (ADR-009).

const TOPE_TRANSCRIPT = 6000;

export type Transcripcion = {
  texto: string; // vacío = el video no tiene voz o Supadata no pudo
  idioma: string; // código de 2 letras; "" si no se pudo detectar
};

function leerClave(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en las env vars (gestor de contraseñas).`);
  return valor;
}

export async function transcribir(url: string): Promise<Transcripcion> {
  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&text=true&mode=auto`,
    { headers: { "x-api-key": leerClave("SUPADATA_API_KEY") }, signal: AbortSignal.timeout(90_000) },
  );

  const cuerpo = await res.json().catch(() => ({}));

  // Supadata contesta 200 con {content}, o un cuerpo {error} cuando el video no tiene voz. Los dos
  // casos son "no hay transcript" y no una falla: el que decide qué hacer es quien llama.
  if (!res.ok && !cuerpo?.error) {
    throw new Error(`Supadata respondió ${res.status}`);
  }

  const texto: string =
    (typeof cuerpo.content === "string" && cuerpo.content) ||
    (typeof cuerpo.text === "string" && cuerpo.text) ||
    "";
  const idioma = String(cuerpo.lang || cuerpo.language || "")
    .toLowerCase()
    .slice(0, 2);

  return { texto: texto.trim().slice(0, TOPE_TRANSCRIPT), idioma };
}

// Copiado textual del nodo `Traducir (Claude Haiku)`. Sin tildes, igual que allá.
const SISTEMA =
  "Sos un traductor literal. Traduci el texto al espanol neutro de forma fiel y literal: sin reescribir, sin resumir, sin embellecer, sin agregar ni quitar nada; conserva el sentido y el orden. Devolve UNICAMENTE el texto traducido, sin comillas ni comentarios.";

// Fail-open igual que el motor: si la traducción falla o vuelve vacía, el script queda como el
// transcript original. Mejor entregar el texto en su idioma que no entregar nada.
export async function traducir(texto: string): Promise<string> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": leerClave("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2000,
        system: SISTEMA,
        messages: [{ role: "user", content: texto.slice(0, TOPE_TRANSCRIPT) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return texto;
    const cuerpo = await res.json();
    const traducido = String(cuerpo?.content?.[0]?.text ?? "").trim();
    return traducido || texto;
  } catch {
    return texto;
  }
}
