import Link from "next/link";
import { comoRuta, rutaDe } from "@/domain/rutas";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerColecciones } from "@/lib/colecciones";
import { Indice } from "./indice";

// Colecciones (ADR-073): el sustantivo que faltaba para decir "estos videos, juntos, para hacerles
// algo". Acepta los tres orígenes porque apunta a la llave del video y no a la fila de ninguna
// tabla de contenido — que es también lo que la hace sobrevivir al barrido del archivado.

export const dynamic = "force-dynamic";

export default async function ColeccionesPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("colecciones", cliente, pipeline);
  const base = comoRuta(cockpit);

  const colecciones = await leerColecciones(ctx);

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Colecciones</h1>
        <p className="text-muted-foreground">
          Apartá los videos que vas a trabajar juntos. Una colección puede mezclar lo que trajo el
          motor, lo que transcribiste pegando un enlace y links sueltos.{" "}
          <strong>Nada de lo que entra acá se borra el domingo</strong>: la colección guarda el video,
          no la fila del feed.
        </p>
      </div>

      <Indice colecciones={colecciones} />
    </div>
  );
}
