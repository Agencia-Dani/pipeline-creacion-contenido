import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerBanco, leerProyectos } from "@/lib/referentes";
import { leerBancoLinkedin } from "@/lib/referentes-linkedin";
import { Pantalla } from "./pantalla";
import { PantallaLinkedin } from "./pantalla-linkedin";

// El banco de referentes. **Una ruta, dos bancos**, y acá es donde se decide cuál.
//
// Reels: el segundo dominio que se cortó de Airtable (D5, corte 2/4). Las dos páginas de Airtable
// son una sola acá — "A revisar" no es otra tabla, es un filtro sobre la misma lista. Separarlas
// obligaba a saltar de página para apagar una cuenta floja, que es justo la acción que la lista
// existe para provocar.
//
// 🔑 **Por qué el ramificado vive en la PÁGINA y no más abajo** (Fase 5, el N+1 real):
// `TenantContext` lleva `clientId`/`instanceId`/`origen` y **no lleva el pipeline** — a propósito:
// es de tenancy, y de quién es un dato no depende de qué pipeline lo produjo. Meter el pipeline ahí
// habría hecho que las ~60 funciones de `lib/` lo recibieran para que dos lo usaran. En cambio
// `exigirTenant` ya devuelve el `cockpit`, que trae `workflowId` del registro. Así el que decide es
// el único que ya lo sabía, y cada `lib/` sigue hablando de una sola tabla.
//
// Y se keyea por `workflowId`, no por el slug de la URL — la misma regla que `domain/pipelines.ts`:
// el slug es de la INSTANCIA y dos cockpits del mismo pipeline pueden llamarse distinto.

export const dynamic = "force-dynamic";

export default async function ReferentesPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("referentes", cliente, pipeline);
  const base = comoRuta(cockpit);

  const volver = (
    <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
      ← Curar
    </Link>
  );

  if (cockpit.workflowId === "linkedin") {
    // `leerProyectos` se comparte con reels sin ceremonia, y es la mitad linda de ADR-049: los
    // proyectos son de la EMPRESA y cruzan pipelines. Lo propio de LinkedIn es el banco, no el
    // proyecto al que apunta.
    const [banco, proyectos] = await Promise.all([leerBancoLinkedin(ctx), leerProyectos(ctx)]);
    return (
      <div className="space-y-6">
        {volver}
        <PantallaLinkedin
          banco={banco}
          proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      </div>
    );
  }

  const [banco, proyectos] = await Promise.all([leerBanco(ctx), leerProyectos(ctx)]);

  return (
    <div className="space-y-6">
      {volver}
      <Pantalla
        banco={banco}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }))}
        // Plano y no un Map: cruza el borde servidor→cliente, y un Map no es serializable.
        vozPorProyecto={Object.fromEntries(proyectos.map((p) => [p.id, p.vozId]))}
      />
    </div>
  );
}
