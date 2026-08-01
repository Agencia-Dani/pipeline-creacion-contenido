import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";
import { leerProyectos } from "@/lib/referentes";
import { leerPendientes } from "@/lib/sugeridos";
import { Tarjeta } from "./tarjeta";

// La bandeja del descubrimiento (ADR-020). Desde D7 las propuestas viven en Postgres, igual que
// el banco: el buscador las escribe por PostgREST (ADR-035) y la decisión se toma acá.

export const dynamic = "force-dynamic";

export default async function SugeridosPage() {
  await exigirZona("curar");

  const [proyectos, pendientes] = await Promise.all([leerProyectos(), leerPendientes()]);
  const opciones = proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Sugeridos</h1>
        <p className="text-muted-foreground">
          Cuentas nuevas que el buscador propone cada lunes. Aprobar una la suma al banco y empieza a
          traer videos; descartarla es definitivo.
        </p>
      </div>

      {pendientes.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay propuestas pendientes. El buscador corre los lunes y deja acá lo que encuentra.
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
