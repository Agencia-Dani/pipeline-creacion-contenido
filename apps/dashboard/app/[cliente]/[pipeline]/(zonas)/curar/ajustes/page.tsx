import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATALOGO, ajustesVisibles } from "@/domain/ajustes";
import { leerAjustes } from "@/lib/ajustes";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { Knob } from "./knob";

// La pantalla de Ajustes: el primer dominio que se corta de Airtable (D5). Postgres es el
// dueño; la tabla `Ajustes` de Airtable queda congelada. El motor y el descubrimiento leen
// estos mismos valores por la fachada, así que lo que se toque acá manda en la próxima corrida.

export const dynamic = "force-dynamic";

const GRUPOS = [
  {
    consume: "motor" as const,
    titulo: "Búsqueda de candidatos",
    descripcion:
      "Gobiernan qué videos acepta el motor y cómo los ordena. Cuántos trae cada proyecto NO se decide acá: eso es el número de cada proyecto en Voces y proyectos.",
  },
  {
    consume: "descubrimiento" as const,
    titulo: "Descubrimiento de referentes",
    descripcion: "Gobiernan las cuentas nuevas que se proponen cada semana.",
  },
];

// Por qué existe este corte: `ajustesVisibles` ya le da al operador solo los de `equipo`, pero al
// dev le da los 18 SIN NINGUNA MARCA. Mezclados con los del equipo, un knob dev-only parece una
// perilla más — y esa confusión es la que hizo que `Candidatos por corrida` siguiera llamando la
// atención cuando ya estaba inerte (ADR-042). La regla de servidor no cambia: esto es presentación.
const AVANZADO = {
  titulo: "Avanzado (solo devs)",
  descripcion:
    "El equipo de redes no ve estos. Tocan el costo y la forma en que el motor ordena: un cambio acá se siente en la factura y en la calidad de lo que llega.",
};

export default async function AjustesPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { usuario, ctx, cockpit, rol } = await exigirPantallaDeCurar("ajustes", cliente, pipeline);
  const base = comoRuta(cockpit);
  const filas = ajustesVisibles(await leerAjustes(ctx), rol);

  // Un operador nunca recibe filas `dev` (lo filtra `ajustesVisibles`), así que para él este
  // reparto deja `deDev` vacío y el bloque de abajo no se renderiza.
  const deEquipo = filas.filter((f) => f.visibilidad === "equipo");
  const deDev = filas.filter((f) => f.visibilidad !== "equipo");

  const knob = (fila: (typeof filas)[number]) => (
    <Knob
      key={fila.clave}
      clave={fila.clave}
      valor={fila.valor}
      descripcion={fila.descripcion}
      tipo={CATALOGO[fila.clave].tipo}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Ajustes</h1>
        <p className="text-muted-foreground">
          Las perillas del sistema. Un cambio acá aplica en la próxima corrida, no en la que
          esté en curso.
        </p>
      </div>

      {filas.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay ajustes que puedas editar con tu rol. Si necesitás mover uno, pedíselo a un dev.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {GRUPOS.map((grupo) => {
            const delGrupo = deEquipo.filter((f) => CATALOGO[f.clave].consume === grupo.consume);
            if (delGrupo.length === 0) return null;
            return (
              <Card key={grupo.consume}>
                <CardHeader>
                  <CardTitle>{grupo.titulo}</CardTitle>
                  <CardDescription>{grupo.descripcion}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">{delGrupo.map(knob)}</CardContent>
              </Card>
            );
          })}

          {deDev.length > 0 && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {AVANZADO.titulo}
                  <Badge variant="outline">dev</Badge>
                </CardTitle>
                <CardDescription>{AVANZADO.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">{deDev.map(knob)}</CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
