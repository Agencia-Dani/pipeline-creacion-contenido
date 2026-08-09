import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { leerAjustes } from "@/lib/ajustes";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerResultadosPorCuenta } from "@/lib/config";
import { leerVocesConProyectos } from "@/lib/proyectos";
import { cuentasPorProyecto } from "@/lib/referentes";
import { leerPendientes } from "@/lib/sugeridos";
import { leerVocesConPerfil } from "@/lib/voces-linkedin";
import { Pantalla } from "./pantalla";
import { PantallaVocesLinkedin } from "./pantalla-linkedin";

// Voces y proyectos: el tercer dominio que se cortó de Airtable (D5, corte 3/4). Postgres es el
// dueño.
//
// Una sola pantalla y no dos, por la misma razón que *A revisar* vive dentro de Referentes: la
// voz es la espina dorsal (PLAN §2.5) y apagarla apaga sus proyectos sin tocarlos. Con dos
// páginas, la consecuencia de un click quedaba en la otra.
//
// Toda la interacción vive en `pantalla.tsx` (cliente): acá solo se lee.
//
// Se leen los ajustes de nuevo, pero por otra razón que antes: no para resolver un default global
// del N (ese knob murió con ADR-042), sino para calcular el **techo de crudos** que el campo N
// muestra mientras se escribe (ADR-043). Junto con las cuentas por proyecto y la bandeja de
// sugeridos, es lo que deja decir "pedís 50 y la corrida mira 120" sin pronosticar nada.

export const dynamic = "force-dynamic";

export default async function VocesPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("voces", cliente, pipeline);
  const base = comoRuta(cockpit);

  const volver = (
    <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
      ← Curar
    </Link>
  );

  // **Una ruta, dos pantallas** — el mismo ramificado que `curar/referentes`, y por la misma razón:
  // el `TenantContext` no lleva el pipeline a propósito, pero `exigirPantallaDeCurar` ya devuelve el
  // `cockpit`, que trae el `workflowId` del registro. Decide el único que ya lo sabía.
  //
  // Y son dos pantallas y no una parametrizada porque **no configuran lo mismo**: la de reels es la
  // voz con sus proyectos, su N y sus criterios de relevancia; la de LinkedIn es cómo habla y cuándo
  // publica. Comparten la fila de `app.voces` y nada más (ADR-049: con dos pipelines, un componente
  // genérico prematuro cuesta más que la duplicación).
  if (cockpit.workflowId === "linkedin") {
    const voces = await leerVocesConPerfil(ctx);
    return (
      <div className="space-y-6">
        {volver}
        <PantallaVocesLinkedin voces={voces} />
      </div>
    );
  }

  const [voces, ajustes, cuentas, propuestas] = await Promise.all([
    leerVocesConProyectos(ctx),
    leerAjustes(ctx),
    cuentasPorProyecto(ctx),
    leerPendientes(ctx),
  ]);

  return (
    <div className="space-y-6">
      {volver}
      <Pantalla
        voces={voces}
        cuentasPorProyecto={Object.fromEntries(cuentas)}
        resultadosPorCuenta={leerResultadosPorCuenta(ajustes)}
        sugeridosPendientes={propuestas.length}
      />
    </div>
  );
}
