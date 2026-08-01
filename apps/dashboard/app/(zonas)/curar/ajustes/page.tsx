import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATALOGO, ajustesVisibles } from "@/domain/ajustes";
import { leerAjustes } from "@/lib/ajustes";
import { exigirZona } from "@/lib/auth";
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

export default async function AjustesPage() {
  const usuario = await exigirZona("curar");
  const filas = ajustesVisibles(await leerAjustes(), usuario.rol);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
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
        GRUPOS.map((grupo) => {
          const delGrupo = filas.filter((f) => CATALOGO[f.clave].consume === grupo.consume);
          if (delGrupo.length === 0) return null;
          return (
            <Card key={grupo.consume}>
              <CardHeader>
                <CardTitle>{grupo.titulo}</CardTitle>
                <CardDescription>{grupo.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {delGrupo.map((fila) => (
                  <Knob
                    key={fila.clave}
                    clave={fila.clave}
                    valor={fila.valor}
                    descripcion={fila.descripcion}
                    tipo={CATALOGO[fila.clave].tipo}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
