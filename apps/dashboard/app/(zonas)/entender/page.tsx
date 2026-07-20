import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";
import { leerCalidad, leerCostos, leerEmbudo } from "@/lib/entender";
import { Calidad, Costos, Embudo, ErrorLectura } from "./secciones";

export const dynamic = "force-dynamic";

export default async function EntenderPage() {
  await exigirZona("entender");

  const [calidad, embudo, costos] = await Promise.allSettled([
    leerCalidad(),
    leerEmbudo(),
    leerCostos(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Entender</h1>
        <p className="text-muted-foreground">
          Precisión por proyecto, embudo del motor y costos de la semana. Todo sale de
          Supabase, calculado en la base — acá no se edita nada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calidad por proyecto</CardTitle>
          <CardDescription>
            Qué tan bien el filtro de cada proyecto le achica el trabajo al equipo:
            precisión = aprobados / calificados de la semana de calificación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calidad.status === "fulfilled" ? (
            <Calidad filas={calidad.value} />
          ) : (
            <ErrorLectura que="la calidad por proyecto" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Embudo y salud del motor</CardTitle>
          <CardDescription>
            De todo lo que el motor mira, cuánto sobrevive cada filtro hasta llegar al
            feed. Un embudo que se angosta mucho al principio es normal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {embudo.status === "fulfilled" ? (
            <Embudo filas={embudo.value} />
          ) : (
            <ErrorLectura que="el embudo del motor" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Costos de la semana</CardTitle>
          <CardDescription>
            Consumo real por servicio × su tarifa (viven en la tabla de tarifas de la
            base, no en fórmulas). El botón ▶ y el cron suman acá por igual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {costos.status === "fulfilled" ? (
            <Costos filas={costos.value} />
          ) : (
            <ErrorLectura que="los costos" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
