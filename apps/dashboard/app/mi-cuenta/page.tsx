import Link from "next/link";
import { cambiarContrasena } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LARGO_MINIMO } from "@/domain/credenciales";
import { usuarioActual } from "@/lib/auth";

// Vive en la raíz de `app/` y no colgando de un cockpit, por la misma razón que `cerrarSesion`: la
// contraseña es de la persona, no de la empresa. Un usuario con dos membresías tiene una sola.
export default async function MiCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; error?: string }>;
}) {
  // La sesión y la ficha, con el mismo gate que toda página protegida. El proxy ya rebota al que no
  // tiene sesión; esto además cubre la ficha a medias (redirige a /sin-rol).
  const usuario = await usuarioActual();
  const { estado, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Mi cuenta</CardTitle>
            <CardDescription>
              {usuario.nombre} · {usuario.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={cambiarContrasena} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña nueva</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={LARGO_MINIMO}
                  autoComplete="new-password"
                />
                <p className="text-sm text-muted-foreground">
                  Al menos {LARGO_MINIMO} caracteres. Guardala en el gestor de contraseñas del
                  equipo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="repetida">Repetila</Label>
                <Input
                  id="repetida"
                  name="repetida"
                  type="password"
                  required
                  minLength={LARGO_MINIMO}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full">
                Guardar contraseña
              </Button>
            </form>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">Volver</Link>
            </Button>
          </CardContent>
        </Card>
        {estado === "lista" && (
          <Alert>
            <AlertTitle>Contraseña guardada</AlertTitle>
            <AlertDescription>
              Ya podés entrar con tu mail y esta contraseña, sin esperar ningún correo.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert>
            <AlertTitle>No se guardó</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
