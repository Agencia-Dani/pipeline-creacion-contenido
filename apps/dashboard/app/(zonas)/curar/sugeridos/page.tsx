import Link from "next/link";
import { BotonBuscar } from "@/components/boton-buscar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirTenant } from "@/lib/auth";
import { leerProyectos } from "@/lib/referentes";
import { leerPendientes } from "@/lib/sugeridos";
import { Tarjeta } from "./tarjeta";

// La bandeja del descubrimiento (ADR-020). Desde D7 las propuestas viven en Postgres, igual que
// el banco: el buscador las escribe por PostgREST (ADR-035) y la decisión se toma acá.

export const dynamic = "force-dynamic";

export default async function SugeridosPage() {
  const { ctx } = await exigirTenant("curar");

  const [proyectos, pendientes] = await Promise.all([leerProyectos(ctx), leerPendientes(ctx)]);
  const opciones = proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Sugeridos</h1>
        <p className="text-muted-foreground">
          Cuentas nuevas que propone el buscador. Aprobar una la suma al banco y empieza a traer
          videos; descartarla es definitivo.
        </p>
      </div>

      {/* El botón va arriba y no al pie: se aprieta mirando la bandeja, que es cuando se siente
          la falta. El mismo botón está en Operar, que es donde se disparan las máquinas. */}
      <BotonBuscar pendientes={pendientes.length} />

      {pendientes.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay propuestas pendientes. Apretá &laquo;Buscar cuentas nuevas&raquo; cuando quieras
            más: el buscador ya no corre solo los lunes.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{pendientes.length} para revisar</CardTitle>
            <CardDescription>
              Ordenadas por afinidad. Leé la razón primero: decide la mayoría de los casos.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {pendientes.map((p) => (
              <Tarjeta
                key={p.id}
                // Desde D7 los ids ya son uuid de los dos lados: se acabó la traducción de record
                // ids que hacía esta pantalla mientras el buscador escribía en Airtable.
                propuesta={{ ...p, proyectoIdsSugeridos: p.proyectoIds }}
                proyectos={opciones}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
