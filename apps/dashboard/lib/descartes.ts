import { esVeredicto, ordenarDescartes, type DescarteFeed, type Veredicto } from "@/domain/feed";
import { leerTabla, parchearRegistro, urlDeMiniatura } from "@/lib/airtable";
import { leerProyectos } from "@/lib/referentes";

// Los descartes del gate (ADR-021): los top-K rechazos por score de cada corrida, o sea los
// near-miss. El equipo dice si la máquina hizo bien en matarlos, y los "era bueno" son los
// **falsos negativos** que `Computar métricas semana` cuenta al cerrar la semana.
//
// 🚨 Por qué esta pantalla es la mitad más valiosa de D6: `veredicto` está en 0 auditorías
// desde que la tabla existe. No era una decisión de diseño — Airtable no deja configurar el
// permiso de un campo sin records en la página (mapa-campos §5.1-1), así que el equipo nunca
// pudo marcarlo. La API sí lo escribe. Mientras esté en 0, `falsos_negativos` da siempre 0 y
// "0 falsos negativos" se lee como *el gate está perfecto*: la conclusión opuesta a la verdad.
//
// ⚠️ La tabla se BORRA ENTERA cada domingo (`Preparar borrado Descartes`), y es deliberado
// (ADR-021). O sea la ventana de auditoría es de una semana: un descarte sin marcar es una
// auditoría perdida para siempre, no postergada. De ahí que la pantalla vaya encadenada al
// final del feed, cuando el operador ya está calibrado.

export const TABLA = "Descartes del gate";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

function primerLink(v: unknown): string | null {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
}

export async function leerDescartes(): Promise<DescarteFeed[]> {
  const [registros, proyectos] = await Promise.all([leerTabla(TABLA, ""), leerProyectos()]);
  const nombrePorAirtableId = new Map(
    proyectos.filter((p) => p.airtableId).map((p) => [p.airtableId!, p.nombre]),
  );

  const descartes = registros.map((r) => {
    const f = r.fields;
    const proyectoId = primerLink(f.proyecto);
    return {
      id: r.id,
      titulo: texto(f.titulo) ?? "(sin título)",
      script: texto(f.script),
      thumbnail: urlDeMiniatura(f.thumbnail),
      proyecto: (proyectoId && nombrePorAirtableId.get(proyectoId)) ?? "",
      referente: texto(f.referente),
      urlReferente: texto(f.url_referente),
      relevanciaScore: numero(f.relevancia_score),
      relevanciaRazon: texto(f.relevancia_razon),
      veredicto: esVeredicto(f.veredicto) ? f.veredicto : null,
    } satisfies DescarteFeed;
  });

  return ordenarDescartes(descartes);
}

export async function marcarVeredicto(id: string, veredicto: Veredicto): Promise<void> {
  await parchearRegistro(TABLA, id, { veredicto });
}
