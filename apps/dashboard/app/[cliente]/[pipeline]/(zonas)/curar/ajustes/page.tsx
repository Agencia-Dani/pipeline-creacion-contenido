import { redirect } from "next/navigation";
import { rutaDe } from "@/domain/rutas";

// Los knobs se mudaron a `ajustes/motor` (ADR-060 §1). Esta ruta queda como redirect y **no como
// 404**: el equipo tiene bookmarks, y el 404 de la Fase 3 ya cobró ese precio una vez (cierre 89).
//
// Sin guardia propia a propósito: no decide nada, y el destino tiene las tres suyas
// (`exigirPantallaDeAjustes`). Si los segmentos son basura, el que rebota es el destino — que es
// donde vive la autoridad. Duplicar la guardia acá sería un segundo lugar que puede discrepar.
export default async function CurarAjustesRedirect({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  redirect(rutaDe({ cliente, pipeline }, "ajustes/motor"));
}
