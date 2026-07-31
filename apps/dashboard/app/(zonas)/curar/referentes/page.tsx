import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MIN_MUESTRA_PARA_SENALAR,
  UMBRAL_TASA_GATE_FLOJO,
  cruzaVoces,
  esFlojo,
} from "@/domain/referentes";
import { exigirZona } from "@/lib/auth";
import { leerBanco, leerProyectos } from "@/lib/referentes";
import { AltaReferente, FilaReferente } from "./fila";

// El banco de cuentas: el segundo dominio que se corta de Airtable (D5, corte 2/4). Postgres es
// el dueño; las páginas *Referentes* y *Referentes - Revisar* quedan congeladas.
//
// Las dos páginas de Airtable son una sola acá: "A revisar" no es otra tabla, es un filtro sobre
// la misma lista. Separarlas obligaba a saltar de página para apagar una cuenta floja, que es
// justo la acción que la lista existe para provocar.

export const dynamic = "force-dynamic";

export default async function ReferentesPage() {
  await exigirZona("curar");

  const [banco, proyectos] = await Promise.all([leerBanco(), leerProyectos()]);
  const vozPorProyecto = new Map(proyectos.map((p) => [p.id, p.vozId]));
  const opciones = proyectos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));

  const flojos = banco.filter((r) => r.activo && esFlojo(r.salud, UMBRAL_TASA_GATE_FLOJO, MIN_MUESTRA_PARA_SENALAR));
  // Una cuenta prendida que no alimenta a nadie es trabajo que no se hace: el motor recorre sus
  // proyectos y no encuentra ninguno. Pasa si se borra un proyecto (la puente cascadea).
  const sinProyecto = banco.filter((r) => r.activo && r.proyectoIds.length === 0);

  const fila = (r: (typeof banco)[number]) => (
    <FilaReferente
      key={r.id}
      referente={r}
      proyectos={opciones}
      avisoCruzaVoces={cruzaVoces(r.proyectoIds, vozPorProyecto)}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Referentes</h1>
        <p className="text-muted-foreground">
          Las cuentas de las que el motor trae videos. Un cambio acá aplica en la próxima corrida.
        </p>
      </div>

      {sinProyecto.length > 0 && (
        <Alert>
          <AlertDescription>
            Hay {sinProyecto.length} cuenta(s) prendidas que no alimentan ningún proyecto: el motor
            no les pide nada. Elegiles un proyecto o apagalas.
          </AlertDescription>
        </Alert>
      )}

      {flojos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>A revisar</CardTitle>
            <CardDescription>
              Traen videos pero casi nada pasa el filtro (menos del{" "}
              {Math.round(UMBRAL_TASA_GATE_FLOJO * 100)}%, con al menos {MIN_MUESTRA_PARA_SENALAR} videos
              evaluados). Podar es decisión de ustedes: el sistema nunca apaga una cuenta solo.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">{flojos.map(fila)}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>El banco</CardTitle>
          <CardDescription>
            {banco.filter((r) => r.activo).length} cuentas rastreándose de {banco.length}. Una cuenta puede
            alimentar más de un proyecto: cada video llega una sola vez, al que mejor pega.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {banco.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Todavía no hay cuentas. Agregá la primera acá abajo, o aprobá una de las que propone el
              buscador en <Link href="/curar/sugeridos" className="underline">Sugeridos</Link>.
            </p>
          ) : (
            banco.map(fila)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar una cuenta</CardTitle>
          <CardDescription>
            Va solo el nombre de usuario, no el link. Elegí a qué proyectos alimenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AltaReferente proyectos={opciones} />
        </CardContent>
      </Card>
    </div>
  );
}
