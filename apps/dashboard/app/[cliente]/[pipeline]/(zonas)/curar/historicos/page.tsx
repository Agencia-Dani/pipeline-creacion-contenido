import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerAprobados } from "@/lib/historicos";
import { Lista } from "./lista";

// El histórico de aprobados. Lee `outputs` de Supabase, no Airtable: el archivado borra el
// record de Airtable después de archivarlo, así que ahí solo vive la semana en curso.
//
// Efecto secundario que conviene saber: esta pantalla NO muere en D7 — ya está leyendo la
// fuente definitiva.

export const dynamic = "force-dynamic";

export default async function HistoricosPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("historicos", cliente, pipeline);
  const base = comoRuta(cockpit);

  const { filas, hayMas, total } = await leerAprobados(ctx, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Históricos</h1>
        {/* El texto cambió con ADR-062: dejó de decir "todo lo que el equipo aprobó" porque una
            transcripción a pedido nunca se calificó, y desde entonces también vive acá. */}
        <p className="text-muted-foreground">
          Todo guion que el equipo quiso guardar, de todas las semanas: lo que aprobó en el feed y
          lo que transcribió pegando un enlace. El feed se vacía cada domingo; esto no.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay nada aprobado. Lo que apruebes en el feed aparece acá el domingo, cuando
          se archiva.
        </p>
      ) : (
        <Lista inicial={filas} hayMasInicial={hayMas} total={total} />
      )}
    </div>
  );
}
