import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cerrarSesion } from "@/app/(zonas)/actions";
import { Button } from "@/components/ui/button";

// Sesión válida pero sin fila en app.usuarios: entró al edificio pero nadie le dio escritorio.
export default function SinRolPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Falta un paso</CardTitle>
          <CardDescription>
            Tu mail está invitado pero todavía no tenés rol asignado. Avisale a
            Mani y volvé a entrar cuando te confirme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={cerrarSesion}>
            <Button variant="outline" type="submit">
              Salir
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
