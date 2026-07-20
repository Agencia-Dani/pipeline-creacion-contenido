import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";

export default async function EntenderPage() {
  await exigirZona("entender");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Entender</h1>
        <p className="text-muted-foreground">
          Precisión por proyecto, embudo del motor y costos de la semana.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todavía no hay métricas</CardTitle>
          <CardDescription>
            Las tres vistas analíticas (calidad, embudo, costos) llegan en la
            etapa D2, leyendo directo de Supabase. Nada que configurar acá.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
