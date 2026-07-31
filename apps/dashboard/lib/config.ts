import type { Proyecto, Voz } from "@/domain/corrida";
import { leerConfigAirtable, leerTabla } from "@/lib/airtable";
import { leerAjustes, leerAjustesComoRegistros } from "@/lib/ajustes";

// La costura del corte de D5: acá, y solo acá, se decide de qué almacenamiento sale cada
// dominio de la config. Hoy Ajustes ya vive en Postgres y Voces/Proyectos/Referentes siguen
// en Airtable; cada corte que falta mueve UNA línea de este archivo (más su pantalla).
//
// Lo que no cambia nunca es la FORMA: la fachada devuelve `{id, fields}` (contrato
// core/contracts/run-plan.md), así que ningún corte obliga a re-importar workflows.

export async function leerRunPlanCrudo(ambito: "motor" | "completo" = "motor") {
  const [airtable, ajustes] = await Promise.all([
    leerConfigAirtable(ambito),
    leerAjustesComoRegistros(), // ← Postgres (D5, corte 1/4)
  ]);
  return { ...airtable, ajustes };
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

export async function leerConfigOperar(): Promise<{
  voces: Voz[];
  proyectos: Proyecto[];
  defaultN: number;
}> {
  const [vocesRaw, proyectosRaw, ajustes] = await Promise.all([
    leerTabla("Voces", "{activo}"),
    leerTabla("Proyectos", "{activo}"),
    leerAjustes(),
  ]);

  const voces = vocesRaw.map((r) => ({ id: r.id, nombre: texto(r.fields.nombre) }));

  const proyectos = proyectosRaw.map((r) => {
    const n = r.fields.N;
    const vozLink = r.fields.voz_default;
    return {
      id: r.id,
      nombre: texto(r.fields.nombre),
      n: typeof n === "number" ? n : null,
      // El motor lee voz_default[0]; si hay más de una, la segunda se ignora (contrato §2).
      vozId: Array.isArray(vozLink) && typeof vozLink[0] === "string" ? vozLink[0] : null,
    };
  });

  // Fail-open como el motor (ADR-011): sin fila o valor vacío → default del AJUSTE_MAP.
  const valor = ajustes.find((a) => a.clave === "Candidatos por corrida")?.valor;
  const defaultN = typeof valor === "number" && valor > 0 ? valor : 100;

  return { voces, proyectos, defaultN };
}
