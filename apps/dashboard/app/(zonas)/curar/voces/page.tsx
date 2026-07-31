import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pausadoPorSuVoz } from "@/domain/proyectos";
import { leerAjustes } from "@/lib/ajustes";
import { exigirZona } from "@/lib/auth";
import { leerVocesConProyectos } from "@/lib/proyectos";
import { AltaProyecto, AltaVoz, FilaProyecto, FilaVoz } from "./fila";

// Voces y proyectos: el tercer dominio que se corta de Airtable (D5, corte 3/4). Postgres es el
// dueño; las páginas *Voces* y *Proyectos* quedan congeladas.
//
// Una sola pantalla y no dos, por la misma razón que *A revisar* vive dentro de Referentes: la
// voz es la espina dorsal (PLAN §2.5) y apagarla apaga sus proyectos sin tocarlos. Con dos
// páginas, la consecuencia del click quedaba en la otra.

export const dynamic = "force-dynamic";

const DEFAULT_CANDIDATOS = 100; // fail-open, el mismo del AJUSTE_MAP del motor

export default async function VocesPage() {
  await exigirZona("curar");

  const [voces, ajustes] = await Promise.all([leerVocesConProyectos(), leerAjustes()]);
  const valorGlobal = ajustes.find((a) => a.clave === "Candidatos por corrida")?.valor;
  const defaultN = typeof valorGlobal === "number" && valorGlobal > 0 ? valorGlobal : DEFAULT_CANDIDATOS;

  const opcionesVoz = voces.map((v) => ({ id: v.id, nombre: v.nombre }));
  const huerfanas = voces.filter((v) => v.activo && v.proyectos.filter((p) => p.activo).length === 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Voces y proyectos</h1>
        <p className="text-muted-foreground">
          Cada voz es un cliente y cada proyecto un tema suyo. Apagar una voz apaga todos sus
          proyectos. Un cambio acá aplica en la próxima corrida.
        </p>
      </div>

      {huerfanas.length > 0 && (
        <Alert>
          <AlertDescription>
            {huerfanas.map((v) => v.nombre).join(" · ")}: {huerfanas.length === 1 ? "está prendida" : "están prendidas"}{" "}
            pero sin ningún proyecto activo, así que no {huerfanas.length === 1 ? "entra" : "entran"} en las
            corridas. Prendé un proyecto o apagá la voz.
          </AlertDescription>
        </Alert>
      )}

      {voces.map((voz) => (
        <Card key={voz.id}>
          <CardHeader>
            <FilaVoz voz={voz} />
          </CardHeader>
          <CardContent className="pt-0">
            {voz.proyectos.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Sin proyectos todavía. Creale uno abajo: una voz sin proyectos no busca nada.
              </p>
            ) : (
              // El borde de la izquierda es lo único que dice, de un vistazo, que estos cuelgan
              // de la voz de arriba: sin él, el nombre de la voz y el de un proyecto son dos
              // inputs iguales y la jerarquía —que es la regla del sistema— no se ve.
              <div className="ml-1 space-y-0 border-l-2 pl-4">
                <p className="pt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Sus proyectos
                </p>
                {voz.proyectos.map((p) => (
                  <FilaProyecto
                    key={p.id}
                    proyecto={p}
                    voces={opcionesVoz}
                    defaultN={defaultN}
                    pausadoPorSuVoz={pausadoPorSuVoz(p, voz)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Agregar un proyecto</CardTitle>
          <CardDescription>
            Un proyecto es un tema dentro de una voz. Nace apagado; después elegile referentes en{" "}
            <Link href="/curar/referentes" className="underline">
              Referentes
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {opcionesVoz.length === 0 ? (
            <p className="text-sm text-muted-foreground">Creá primero una voz.</p>
          ) : (
            <AltaProyecto voces={opcionesVoz} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar una voz</CardTitle>
          <CardDescription>
            Solo si entra un cliente nuevo. Todo lo demás (temas, referentes, criterios) cuelga de
            una voz que ya existe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AltaVoz />
        </CardContent>
      </Card>
    </div>
  );
}
