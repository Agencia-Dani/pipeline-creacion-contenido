import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";

export default async function OperarPage() {
  await exigirZona("operar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operar</h1>
        <p className="text-muted-foreground">
          Desde acá vas a lanzar corridas y ver cómo van, sin tocar nada técnico.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todavía no hay nada para operar</CardTitle>
          <CardDescription>
            Acá va a estar el botón ▶ Correr ahora: elegís voz, proyecto y
            cuántos guiones querés, y ves el estado de la corrida en vivo. Llega
            en la próxima etapa (D1).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
