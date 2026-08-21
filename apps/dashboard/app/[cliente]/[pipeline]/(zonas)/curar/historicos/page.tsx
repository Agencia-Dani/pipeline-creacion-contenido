import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerMarcas } from "@/lib/grabados";
import { leerHistoricoCompleto } from "@/lib/historicos";
import { leerMeta } from "@/lib/videos";
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

  // Los dos lados del registro (ADR-070). Van en paralelo porque no dependen entre sí, y el cruce
  // lo hace `armarRegistro` en el cliente — la misma función que usa el CSV, para que el archivo y
  // lo que se ve no puedan divergir.
  // La metadata comprada va en el mismo paralelo (ADR-072): es lo único que aporta miniatura, y
  // para un link cargado a mano también su título. **Sumidero:** si falla, la pantalla se dibuja sin
  // fotos en vez de no dibujarse — el histórico no depende de haber pagado ningún scrape.
  const [{ filas, truncado }, marcas, metas] = await Promise.all([
    leerHistoricoCompleto(ctx),
    leerMarcas(ctx),
    leerMeta(ctx).catch((e) => {
      console.error("[historicos] no se pudo leer la metadata comprada:", e);
      return [];
    }),
  ]);

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
          lo que transcribió pegando un enlace. El feed se vacía cada domingo; esto no.{" "}
          <strong>Marcá los que ya grabaron</strong> para llevar la cuenta de cuáles se usaron.
        </p>
      </div>

      {filas.length === 0 && marcas.size === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay nada aprobado. Lo que apruebes en el feed aparece acá el domingo, cuando
          se archiva.
        </p>
      ) : (
        <Lista
          guiones={filas}
          marcasIniciales={[...marcas.values()]}
          metas={metas}
          truncado={truncado}
        />
      )}
    </div>
  );
}
