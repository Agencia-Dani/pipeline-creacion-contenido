import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectorCockpit, type OpcionCockpit } from "@/components/selector-cockpit";
import { usuarioActual } from "@/lib/auth";
import { cockpitsDe, resolverContexto } from "@/lib/tenant";
import { comoRuta, rutaZona } from "@/domain/rutas";
import { zonasDe, type Zona } from "@/domain/roles";
import { cerrarSesion } from "@/app/actions";

const ETIQUETAS: Record<Zona, string> = {
  operar: "Operar",
  curar: "Curar",
  transcribir: "Transcribir",
  entender: "Entender",
};

// El nav muestra solo las zonas del rol (la UI esconde); cada página además exige su zona **y su
// tenant** en el servidor (el servidor impide).
//
// ⚠️ **Este layout NO es la guardia de las páginas, y no hay que leerlo así:** en el App Router el
// layout y la página renderizan en paralelo, así que un chequeo acá no llega a tiempo para
// proteger a nadie. Valida para lo suyo —no dibujar el nav de un cockpit que no existe— y cada
// `page.tsx` valida lo suyo con `exigirTenant`. Es la misma división que ya tenía `proxy.ts`:
// chequeo optimista arriba, autoridad en cada página.
export default async function ZonasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const usuario = await usuarioActual();

  const sesion = await resolverContexto(usuario, cliente, pipeline);
  // Un cockpit que no existe o que no es suyo sale por el mismo lado: a la raíz, que lo rebota al
  // que sí le toca. Sin decir cuál de las dos cosas fue (`lib/tenant.ts`).
  if (!sesion) redirect("/");

  const zonas = zonasDe(sesion.rol);
  const cockpits = await cockpitsDe(usuario);
  // Del cockpit RESUELTO, no de los segmentos crudos: la URL es entrada, no verdad. Si lo que vino
  // no es exactamente lo que se resolvió, el nav tiene que apuntar a lo que se resolvió — si no, la
  // pantalla muestra los datos de un cockpit y los links de otro.
  const enRuta = comoRuta(sesion.cockpit);

  const opciones: OpcionCockpit[] = cockpits.map((c) => ({
    cliente: c.clientId,
    pipeline: c.slug,
    etiqueta: `${c.clientId} · ${c.nombre ?? c.slug}`,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <nav className="flex items-center gap-1">
            <span className="mr-3 text-sm font-semibold">Cockpit</span>
            {zonas.map((zona) => (
              <Button key={zona} variant="ghost" size="sm" asChild>
                <Link href={rutaZona(enRuta, zona)}>{ETIQUETAS[zona]}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {/* Solo si hay a dónde saltar: con un cockpit el selector es ruido, y un operador de
                una empresa no tiene por qué enterarse de que existen las otras. */}
            {opciones.length > 1 && (
              <SelectorCockpit cockpits={opciones} actual={enRuta} />
            )}
            <span className="text-sm text-muted-foreground">
              {usuario.nombre}
            </span>
            <Badge variant="secondary">{sesion.rol}</Badge>
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
