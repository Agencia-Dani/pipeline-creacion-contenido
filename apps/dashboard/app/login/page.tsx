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
import { enviarMagicLink, entrarConContrasena } from "./actions";

// El texto de cada estado vive acá y no en `domain/credenciales.ts` a propósito: el dominio decide
// QUÉ pasó (tres estados, sin filtrar quién existe) y la pantalla decide CÓMO se cuenta. Un dueño
// por hecho, que es la regla de docs del repo aplicada al copy.
const MENSAJES: Record<string, { titulo: string; detalle: string }> = {
  credenciales: {
    titulo: "Mail o contraseña incorrectos",
    detalle:
      "Fijate que sea el mail con el que te invitaron. Si nunca pusiste una contraseña, entrá con el link.",
  },
  espera: {
    titulo: "Demasiados intentos seguidos",
    detalle: "Esperá unos minutos y probá de nuevo. Es un límite de seguridad, no un error tuyo.",
  },
  suspendida: {
    titulo: "Esa cuenta está suspendida",
    detalle: "No podés entrar con ella. Avisale a Mani.",
  },
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
            <CardDescription>Entrá con tu mail y tu contraseña.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={entrarConContrasena} className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="password">Tu contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  // `current-password` (y no `new-password`): es lo que hace que el gestor de
                  // contraseñas ofrezca la guardada en vez de proponer una nueva.
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>

            {/* El link sigue existiendo y no es un resto: es el camino de quien todavía no tiene
                contraseña —toda alta nueva empieza así— y el de quien la olvidó. Va plegado porque
                es la excepción, no la puerta. */}
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
                No tengo contraseña, o me la olvidé
              </summary>
              <form action={enviarMagicLink} className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Te mandamos un link para entrar sin contraseña. Una vez adentro podés ponerte una
                  en <span className="font-medium">Mi cuenta</span>.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email-link">Tu mail</Label>
                  <Input
                    id="email-link"
                    name="email"
                    type="email"
                    placeholder="nombre@agencia.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full">
                  Mandame el link
                </Button>
              </form>
            </details>
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
