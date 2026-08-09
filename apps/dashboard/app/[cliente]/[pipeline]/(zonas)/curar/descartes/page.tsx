import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerDescartes } from "@/lib/descartes";
import { leerDescartesLinkedin, TECHO } from "@/lib/candidatos-linkedin";
import { Lista } from "./lista";
import { ListaDescartesLinkedin } from "./lista-linkedin";

// La auditoría del gate (ADR-021). Es la mitad más valiosa de D6: `veredicto` está en 0
// auditorías desde que la tabla existe — no por decisión, sino porque Airtable no dejaba
// marcarlo (mapa-campos §5.1-1). Mientras siga en 0, `falsos_negativos` da siempre 0, y eso se
// lee como "el gate está perfecto".

export const dynamic = "force-dynamic";

export default async function DescartesPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("descartes", cliente, pipeline);
  const base = comoRuta(cockpit);

  // Una ruta, dos listas — el mismo ramificado que sus hermanas (ADR-049: tablas propias por
  // pipeline, así que también lectores propios).
  if (cockpit.workflowId === "linkedin") {
    const { filas, total } = await leerDescartesLinkedin(ctx);
    return (
      <div className="space-y-6">
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <ListaDescartesLinkedin descartes={filas} total={total} techo={TECHO} />
      </div>
    );
  }

  const descartes = await leerDescartes(ctx);

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Descartes</h1>
        <p className="text-muted-foreground">
          Los videos que el filtro mató <strong className="font-medium">por poco</strong> — los que
          más cerca estuvieron de pasar. Decir cuáles en realidad eran buenos es lo que corrige los
          criterios: sin eso, el sistema solo aprende de lo que dejó pasar.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Esta lista ya no se borra los domingos: lo que no marques hoy sigue acá la semana que
          viene. Marcar «era bueno» es lo único que le dice al sistema cuánto contenido útil está
          tirando el filtro.
        </AlertDescription>
      </Alert>

      {descartes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay descartes para auditar. El motor deja acá los rechazos más cerca de pasar en cada
          corrida.
        </p>
      ) : (
        <Lista descartes={descartes} />
      )}
    </div>
  );
}
