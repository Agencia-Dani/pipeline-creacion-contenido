import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";
import { leerProyectos } from "@/lib/referentes";
import { leerPendientes } from "@/lib/sugeridos";
import { Tarjeta } from "./tarjeta";

// La bandeja del descubrimiento (ADR-020). Las propuestas siguen viviendo en Airtable —las
// escribe el workflow, y las escrituras de n8n cortan en D7— pero la DECISIÓN se toma acá,
// porque aprobar ahora significa sembrar la cuenta en Postgres (corte 2/4).

export const dynamic = "force-dynamic";

export default async function SugeridosPage() {
  await exigirZona("curar");

  const [proyectos, pendientes] = await Promise.all([leerProyectos(), leerPendientes()]);
  const porAirtableId = new Map(proyectos.filter((p) => p.airtableId).map((p) => [p.airtableId!, p.id]));
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
                propuesta={{
                  ...p,
                  // El buscador propone en el idioma de Airtable; la pantalla y la escritura
                  // trabajan en uuid. Un proyecto que no exista de este lado simplemente no
                  // viene premarcado: la persona elige.
                  proyectoIdsSugeridos: p.proyectosAirtable
                    .map((a) => porAirtableId.get(a))
                    .filter((id): id is string => id !== undefined),
                }}
                proyectos={opciones}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
