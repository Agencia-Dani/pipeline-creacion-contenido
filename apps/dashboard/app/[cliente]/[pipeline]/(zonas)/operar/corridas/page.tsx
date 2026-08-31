import Link from "next/link";
import { comoRuta, rutaDe } from "@/domain/rutas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { veCostos } from "@/domain/roles";
import { exigirTenant } from "@/lib/auth";
import { CORRIDAS_POR_PAGINA, contarCorridas, corridasDe, enlacesN8n } from "@/lib/runs";
import { Pantalla } from "./pantalla";

// **Sub-página de Operar, no una zona nueva** — y no es una decisión de comodidad.
//
// En este cockpit las zonas son VERBOS (operar, curar, transcribir, entender, ajustes) y "logs" no
// lo es: esto es la historia de lo que hace Operar. Concretamente, colgar de `operar/` significa
// que hereda `exigirTenant("operar")` y **no toca** el tipo `Zona` de `domain/roles.ts`, la tabla de
// `domain/pipelines.ts`, `domain/permisos.ts` ni sus tests — y no obliga a decidir si un `sponsor`
// (que es de la empresa cliente, no de la agencia) ve los errores crudos de n8n.
//
// Lo que sí se decide acá, y por rol: **el link a la ejecución de n8n solo existe para `dev`**
// (`veCostos`, el mismo gate). El equipo de redes no tiene cuenta en n8n; un link que pide un login
// que no tenés es peor que ningún link.

export const dynamic = "force-dynamic";

export default async function CorridasPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit, rol } = await exigirTenant("operar", cliente, pipeline);
  const base = comoRuta(cockpit);
  const esDev = veCostos(rol);

  // Cada parte falla sola, igual que en Operar: sin los conteos igual se ven las corridas del tab
  // abierto, y sin las corridas los tabs siguen diciendo cuántas hay.
  const [conteos, corridas] = await Promise.allSettled([
    contarCorridas(ctx),
    corridasDe(ctx, "motor"),
  ]);

  const filas = corridas.status === "fulfilled" ? corridas.value : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "operar")} className="text-sm text-muted-foreground hover:underline">
          ← Operar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Corridas</h1>
        <p className="text-muted-foreground">
          Cada vez que una máquina corrió, qué hizo y por qué le fue así. Elegí la máquina arriba y
          abrí una corrida para ver el detalle.
        </p>
      </div>

      {corridas.status === "rejected" && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo leer el registro de corridas</AlertTitle>
          <AlertDescription>
            Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
          </AlertDescription>
        </Alert>
      )}

      <Pantalla
        inicial={{
          workflow: "motor",
          corridas: filas,
          enlaces: enlacesN8n("motor", filas, esDev),
          hayMas: filas.length === CORRIDAS_POR_PAGINA,
        }}
        conteos={
          conteos.status === "fulfilled"
            ? conteos.value
            : {
                motor: { total: 0, fallos: 0 },
                archivado: { total: 0, fallos: 0 },
                descubrimiento: { total: 0, fallos: 0 },
                transcriptor: { total: 0, fallos: 0 },
              }
        }
        esDev={esDev}
      />
    </div>
  );
}
