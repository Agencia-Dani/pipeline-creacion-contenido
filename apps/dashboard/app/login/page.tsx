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
import { enviarMagicLink } from "./actions";

const MENSAJES: Record<string, { titulo: string; detalle: string }> = {
  enviado: {
    titulo: "Revisá tu mail",
    detalle: "Te mandamos un link para entrar. Vale por un rato; si expira, pedí otro.",
  },
  "no-enviado": {
    titulo: "No pudimos mandarte el link",
    detalle:
      "Fijate que sea el mail con el que te invitaron. Si el problema sigue, avisale a Mani.",
  },
  "email-invalido": {
    titulo: "Ese mail no parece válido",
    detalle: "Escribilo completo, por ejemplo nombre@agencia.com.",
  },
  "link-invalido": {
    titulo: "El link ya no sirve",
    detalle: "Los links de acceso vencen. Pedí uno nuevo acá abajo.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const mensaje = estado ? MENSAJES[estado] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cockpit de contenido</CardTitle>
            <CardDescription>
              Entrá con tu mail. Sin contraseña: te llega un link y listo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={enviarMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Tu mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nombre@agencia.com"
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full">
                Mandame el link
              </Button>
            </form>
          </CardContent>
        </Card>
        {mensaje && (
          <Alert>
            <AlertTitle>{mensaje.titulo}</AlertTitle>
            <AlertDescription>{mensaje.detalle}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
