import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { BotonBuscar } from "@/components/boton-buscar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { armarVistaBuscador } from "@/domain/buscador";
import { armarVistaOperar, proyectosDelPlan } from "@/domain/corrida";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerDatosDelBuscador } from "@/lib/buscador";
import { leerConfigOperar } from "@/lib/config";
import { leerProyectos } from "@/lib/referentes";
import { leerPendientes } from "@/lib/sugeridos";
import { QueVaABuscar } from "./que-va-a-buscar";
import { Tarjeta } from "./tarjeta";

// La bandeja del descubrimiento (ADR-020). Desde D7 las propuestas viven en Postgres, igual que
// el banco: el buscador las escribe por PostgREST (ADR-035) y la decisión se toma acá.

export const dynamic = "force-dynamic";

export default async function SugeridosPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("sugeridos", cliente, pipeline);
  const base = comoRuta(cockpit);

  const [proyectos, pendientes, config, datosBuscador] = await Promise.all([
    leerProyectos(ctx),
    leerPendientes(ctx),
    // Cada parte falla sola, igual que en Operar: si no se puede armar el plan del buscador, la
    // bandeja de propuestas se sigue pudiendo trabajar. La card es contexto, no es la pantalla.
    leerConfigOperar(ctx).catch(() => null),
    leerDatosDelBuscador(ctx).catch(() => null),
  ]);
  const opciones = proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));

  // El alcance sale de la MISMA función que lo pinta en Operar (ADR-079 §3): un solo cruce
  // "proyecto activo de voz activa" para las dos máquinas y las dos pantallas.
  const vistaBuscador =
    config && datosBuscador
      ? armarVistaBuscador(
          datosBuscador.referentes,
          proyectosDelPlan(armarVistaOperar(config.voces, config.proyectos, config.resultadosPorCuenta)),
          datosBuscador.senal,
          datosBuscador.knobs,
        )
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
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

      {vistaBuscador && (
        <QueVaABuscar vista={vistaBuscador} rutaReferentes={rutaDe(base, "curar/referentes")} />
      )}

      {pendientes.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay propuestas pendientes. Apretá &laquo;▶ Buscar referentes&raquo; cuando quieras
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
