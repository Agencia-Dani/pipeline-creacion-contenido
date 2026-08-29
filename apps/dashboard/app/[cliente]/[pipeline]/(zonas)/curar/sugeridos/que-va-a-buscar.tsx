import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { VistaBuscador } from "@/domain/buscador";

// La card «Qué va a buscar» (ADR-079 §3): lo que la búsqueda va a hacer, ANTES de gastar créditos.
//
// Vive en Sugeridos y no en Operar a propósito. Operar muestra el alcance —para quién— que desde
// ADR-079 es el mismo para las dos máquinas y por eso es una sola card compartida. Lo de acá son
// los números PROPIOS del buscador (el cap de semillas, el tope de propuestas, la afinidad), y
// meterlos allá habría vuelto a mezclar dos cosas que la card compartida acaba de separar.

const porcentaje = (n: number | null) => (n === null ? "sin señal" : `${Math.round(n * 100)}%`);

export function QueVaABuscar({ vista, rutaReferentes }: { vista: VistaBuscador; rutaReferentes: string }) {
  const afuera = vista.elegibles - vista.semillas.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué va a buscar</CardTitle>
        <CardDescription>
          El buscador parte de las cuentas que ya tenés y busca parecidas. No usa todas: se queda
          con las <strong>{vista.cap} mejores</strong> por tasa de aprobación, y trae hasta{" "}
          <strong>{vista.propuestasMax} propuestas</strong> con afinidad mínima{" "}
          <strong>{vista.afinidadMinima}</strong>. Nunca re-propone una cuenta que ya esté en{" "}
          <Link href={rutaReferentes} className="underline">
            Referentes
          </Link>
          , prendida o apagada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {vista.semillas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ⚠️ Ninguna cuenta puede sembrar la búsqueda ahora mismo, así que apretar
            &laquo;Buscar&raquo; no va a traer nada. Necesitás al menos una cuenta de Instagram
            prendida en{" "}
            <Link href={rutaReferentes} className="underline">
              Referentes
            </Link>{" "}
            que alimente un proyecto activo de voz activa.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Siembran estas {vista.semillas.length}, de mejor a peor:
            </p>
            <ul className="flex flex-wrap gap-2">
              {vista.semillas.map((s) => (
                <li key={s.handle}>
                  <Badge variant="secondary" className="font-normal">
                    @{s.handle}
                    <span className="ml-1 text-muted-foreground">
                      · {porcentaje(s.tasa)}
                      {s.calificados > 0 && ` de ${s.calificados}`}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* El dato que el botón nunca dijo y explica media pantalla vacía: tener 28 cuentas
            prendidas no significa que 28 siembren. */}
        {afuera > 0 && (
          <p className="text-sm text-muted-foreground">
            Quedan afuera <strong>{afuera}</strong> cuenta{afuera === 1 ? "" : "s"} más que también
            calificaban: el tope es {vista.cap} por corrida, para no dispararle a Apify de más.
          </p>
        )}

        {vista.sinSembrarPorPlataforma > 0 && (
          <p className="text-sm text-muted-foreground">
            ⚠️ {vista.sinSembrarPorPlataforma} cuenta{vista.sinSembrarPorPlataforma === 1 ? "" : "s"}{" "}
            de TikTok no siembra{vista.sinSembrarPorPlataforma === 1 ? "" : "n"} nada: el buscador
            solo descubre en Instagram. Traen videos igual — esto es solo sobre proponer cuentas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
