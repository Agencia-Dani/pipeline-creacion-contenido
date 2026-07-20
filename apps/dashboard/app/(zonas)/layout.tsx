import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usuarioActual } from "@/lib/auth";
import { zonasDe, type Zona } from "@/domain/roles";
import { cerrarSesion } from "./actions";

const ETIQUETAS: Record<Zona, string> = {
  operar: "Operar",
  curar: "Curar",
  entender: "Entender",
};

// El nav muestra solo las zonas del rol (la UI esconde); cada página además
// exige su zona en el servidor (el servidor impide).
export default async function ZonasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await usuarioActual();
  const zonas = zonasDe(usuario.rol);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <nav className="flex items-center gap-1">
            <span className="mr-3 text-sm font-semibold">Cockpit</span>
            {zonas.map((zona) => (
              <Button key={zona} variant="ghost" size="sm" asChild>
                <Link href={`/${zona}`}>{ETIQUETAS[zona]}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {usuario.nombre}
            </span>
            <Badge variant="secondary">{usuario.rol}</Badge>
            <form action={cerrarSesion}>
              <Button variant="ghost" size="sm" type="submit">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
