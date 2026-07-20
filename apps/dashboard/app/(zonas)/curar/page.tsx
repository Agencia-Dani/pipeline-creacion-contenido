import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";

export default async function CurarPage() {
  await exigirZona("curar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curar</h1>
        <p className="text-muted-foreground">
          Acá vas a calificar candidatos y mantener referentes, voces y proyectos.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todavía no hay nada para curar</CardTitle>
          <CardDescription>
            Mientras tanto, el feed de calificación sigue en Airtable como hasta
            ahora. Esta pantalla lo reemplaza más adelante (D5–D6), cuando esté a
            la altura.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
