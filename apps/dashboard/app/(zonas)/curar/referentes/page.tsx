import Link from "next/link";
import { exigirTenant } from "@/lib/auth";
import { leerBanco, leerProyectos } from "@/lib/referentes";
import { Pantalla } from "./pantalla";

// El banco de cuentas: el segundo dominio que se cortó de Airtable (D5, corte 2/4). Postgres es
// el dueño.
//
// Las dos páginas de Airtable son una sola acá: "A revisar" no es otra tabla, es un filtro sobre
// la misma lista. Separarlas obligaba a saltar de página para apagar una cuenta floja, que es
// justo la acción que la lista existe para provocar.
//
// Toda la interacción vive en `pantalla.tsx` (cliente): acá solo se lee.

export const dynamic = "force-dynamic";

export default async function ReferentesPage() {
  const { ctx } = await exigirTenant("curar");

  const [banco, proyectos] = await Promise.all([leerBanco(ctx), leerProyectos(ctx)]);

  return (
    <div className="space-y-6">
      <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
        ← Curar
      </Link>
      <Pantalla
        banco={banco}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }))}
        // Plano y no un Map: cruza el borde servidor→cliente, y un Map no es serializable.
        vozPorProyecto={Object.fromEntries(proyectos.map((p) => [p.id, p.vozId]))}
      />
    </div>
  );
}
