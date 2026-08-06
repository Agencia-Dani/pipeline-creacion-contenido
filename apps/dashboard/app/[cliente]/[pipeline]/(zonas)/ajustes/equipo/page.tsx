import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { rolesQuePuedeOtorgar } from "@/domain/permisos";
import { comoRuta, rutaDe } from "@/domain/rutas";
import { exigirPantallaDeAjustes } from "@/lib/auth";
import { leerEquipo } from "@/lib/equipo";
import { Equipo } from "./pantalla";

// La pantalla de accesos que la `021` dejó anotada como deuda en su línea 216 y que ADR-060
// construyó: *"quiénes entran a mi empresa"*.
//
// 🔑 **La agencia no aparece acá, y no lo hace esta página**: lo hace la policy de la `025`
// (`app.usuarios_visibles()` excluye `es_dueno`). ADR-051 §3 lo puso como propiedad del sistema, y
// una propiedad del sistema implementada en el render dura hasta la próxima pantalla que se olvide.
// Si algún día un dueño asomara en esta lista, el bug está en la base, no acá.

export const dynamic = "force-dynamic";

export default async function EquipoPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  // Las tres condiciones (zona, pipeline y rol) las contesta la guardia. Un operador que llegue a
  // esta URL a mano sale rebotado al índice de Ajustes.
  const { usuario, ctx, cockpit, rol } = await exigirPantallaDeAjustes("equipo", cliente, pipeline);
  const base = comoRuta(cockpit);

  const otorgables = rolesQuePuedeOtorgar(rol, usuario.esDueno);

  let miembros;
  try {
    miembros = await leerEquipo(ctx);
  } catch (e) {
    console.error("[equipo] no se pudo leer el equipo:", e);
    miembros = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "ajustes")} className="text-sm text-muted-foreground hover:underline">
          ← Ajustes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Equipo</h1>
        <p className="text-muted-foreground">
          Quiénes entran a esta empresa y con qué permisos. Invitar manda un mail con el acceso;
          quitarlo corta la entrada en el próximo click de esa persona.
        </p>
      </div>

      {miembros === null ? (
        <Alert>
          <AlertDescription>
            No se pudo leer el equipo. Recargá la página; si sigue, avisale a un dev.
          </AlertDescription>
        </Alert>
      ) : (
        <Equipo miembros={miembros} otorgables={otorgables} yo={usuario.id} />
      )}
    </div>
  );
}
