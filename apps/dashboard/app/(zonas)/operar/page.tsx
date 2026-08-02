import Link from "next/link";
import { BotonBuscar } from "@/components/boton-buscar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DISPARO_LEGIBLE,
  ESTADO_LEGIBLE,
  RAZON_FALTANTE_LEGIBLE,
  armarVistaOperar,
  duracionLegible,
  entregaLegible,
  haceCuanto,
  hayCorridaViva,
  pideMasQueElTecho,
  ultimoEmbudo,
  type Corrida,
  type ProyectoDelPlan,
  type VistaOperar,
} from "@/domain/corrida";
import { leerConfigOperar } from "@/lib/config";
import { exigirZona } from "@/lib/auth";
import { cuentasPorProyecto } from "@/lib/referentes";
import { ultimasCorridasMotor } from "@/lib/runs";
import { leerPendientes } from "@/lib/sugeridos";
import { AutoRefresh } from "./auto-refresh";
import { BotonCorrer } from "./boton-correr";

export const dynamic = "force-dynamic";

const BADGE_POR_ESTADO: Record<
  Corrida["estado"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  en_curso: "default",
  ok: "secondary",
  fallo: "destructive",
  parcial: "outline",
};

// Una línea por proyecto, con los TRES datos juntos: lo que pide, con qué cuenta, y lo que
// entregó la última vez.
//
// Antes esto eran dos cards separadas —«Qué va a correr» decía «hasta 15 candidatos» y «Última
// corrida» decía «entregó 1»— y había que cruzarlas de memoria. Peor: «hasta» le pedía al equipo
// que adivinara. El número de la izquierda es un pedido y el de la derecha es un hecho; ponerlos
// juntos es lo único que hace que el pedido se lea como lo que es.
function FilaProyecto({ p }: { p: ProyectoDelPlan }) {
  const quedaCorto = p.ultimaEntrega !== null && p.ultimaEntrega < p.pide;
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{p.nombre}</span>
        <span className="text-muted-foreground">
          pide <span className="font-medium text-foreground tabular-nums">{p.pide}</span> ·{" "}
          <span title="Videos crudos que la corrida llega a mirar para este proyecto: sus cuentas por los resultados que baja de cada una.">
            {p.cuentas === 1 ? "1 cuenta" : `${p.cuentas} cuentas`} (mira {p.techo})
          </span>{" "}
          ·{" "}
          {p.ultimaEntrega === null ? (
            // No es lo mismo que "entregó 0": puede que la corrida ni lo haya mirado. Se dice lo
            // que sabemos —que no hay dato— y no una interpretación que podría ser falsa.
            "sin datos de la última corrida"
          ) : (
            <>
              la última entregó{" "}
              <span className={quedaCorto ? "" : "font-medium text-foreground"}>
                {p.ultimaEntrega}
              </span>
            </>
          )}
        </span>
      </div>
      {p.cuentas === 0 ? (
        <p className="text-xs text-muted-foreground">
          ⚠️ Sin cuentas que lo alimenten no va a traer nada.{" "}
          <Link href="/curar/referentes" className="underline">
            Asignale referentes
          </Link>
          .
        </p>
      ) : pideMasQueElTecho(p.pide, p.techo) ? (
        // Este aviso gana sobre el de abajo, y no es lo mismo: aquel mira la corrida pasada, este
        // es aritmética sobre la próxima. Si el proyecto pide más videos de los que la corrida
        // llega a MIRAR, ningún ajuste de criterios lo arregla — faltan cuentas (ADR-043).
        <p className="text-xs text-amber-700 dark:text-amber-500">
          ⚠️ Pide {p.pide} de {p.techo} videos crudos que llega a mirar: no le alcanza ni en el mejor
          caso.{" "}
          <Link href="/curar/referentes" className="underline">
            Sumá cuentas
          </Link>{" "}
          o bajale el número en{" "}
          <Link href="/curar/voces" className="underline">
            Voces y proyectos
          </Link>
          .
        </p>
      ) : (
        // Sin razón diagnosticada no hay palanca que recomendar: los números ya cuentan la
        // historia y una sugerencia inventada sería peor que el silencio.
        quedaCorto &&
        p.razonFaltante !== null && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <Badge variant="outline">{RAZON_FALTANTE_LEGIBLE[p.razonFaltante]}</Badge>
            {/* La palanca sale de la razón que ya diagnosticó el motor, no de una corazonada:
                `supply` se arregla con más cuentas, `gate` con criterios menos estrictos, y
                `mixta` es las dos cosas. */}
            <span>
              Para acercarse a {p.pide}
              {p.razonFaltante !== "gate" && (
                <>
                  {" "}
                  sumá cuentas en{" "}
                  <Link href="/curar/referentes" className="underline">
                    Referentes
                  </Link>
                </>
              )}
              {p.razonFaltante === "mixta" && " y"}
              {p.razonFaltante !== "supply" && (
                <>
                  {" "}
                  aflojá los criterios en{" "}
                  <Link href="/curar/voces" className="underline">
                    Voces y proyectos
                  </Link>
                </>
              )}
              .
            </span>
          </p>
        )
      )}
    </li>
  );
}

export default async function OperarPage() {
  await exigirZona("operar");

  // Cada parte falla sola: si no se puede leer la config igual se ven las corridas, y al revés.
  const [config, corridas, cuentas, propuestas] = await Promise.allSettled([
    leerConfigOperar(),
    ultimasCorridasMotor(),
    cuentasPorProyecto(),
    leerPendientes(),
  ]);

  const runs = corridas.status === "fulfilled" ? corridas.value : null;
  const embudo = runs ? ultimoEmbudo(runs) : null;

  const vista: VistaOperar | null =
    config.status === "fulfilled"
      ? armarVistaOperar(
          config.value.voces,
          config.value.proyectos,
          config.value.resultadosPorCuenta,
          cuentas.status === "fulfilled" ? cuentas.value : new Map(),
          embudo?.filas ?? [],
        )
      : null;

  const ahora = new Date();
  const corridaViva = runs ? hayCorridaViva(runs, ahora) : false;
  const pendientes = propuestas.status === "fulfilled" ? propuestas.value.length : 0;

  return (
    <div className="space-y-6">
      <AutoRefresh activo={corridaViva} />
      <div>
        <h1 className="text-2xl font-semibold">Operar</h1>
        <p className="text-muted-foreground">
          Lo que va a correr, el botón para correrlo, y cómo vienen las corridas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qué va a correr</CardTitle>
          <CardDescription>
            Cada proyecto activo de voz activa pide su número de videos.{" "}
            {embudo
              ? `Al lado, lo que entregó de verdad la corrida de ${haceCuanto(embudo.corrida.inicio, ahora)}: el pedido es un techo, y lo que llega depende de cuántas cuentas lo alimenten.`
              : "Cuando haya una corrida, al lado va a aparecer lo que entregó de verdad."}{" "}
            El número se edita en{" "}
            <Link href="/curar/voces" className="underline">
              Voces y proyectos
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!vista ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo leer la configuración</AlertTitle>
              <AlertDescription>
                No dispares hasta que vuelva: el motor lee la misma fuente, así que ahora mismo
                la corrida no arrancaría. Si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : vista.porVoz.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay ningún proyecto activo con voz activa: una corrida ahora no entregaría nada.
              Prendé algo en{" "}
              <Link href="/curar/voces" className="underline">
                Voces y proyectos
              </Link>{" "}
              primero.
            </p>
          ) : (
            vista.porVoz.map(({ voz, proyectos }) => (
              <div key={voz.id} className="space-y-2">
                <p className="text-sm font-medium">{voz.nombre}</p>
                <ul className="space-y-2 border-l-2 pl-3">
                  {proyectos.map((p) => (
                    <FilaProyecto key={p.id} p={p} />
                  ))}
                </ul>
              </div>
            ))
          )}
          {vista && vista.noCorren.length > 0 && (
            <p className="text-sm text-muted-foreground">
              ⚠️ No corren (activos pero su voz está apagada o sin voz):{" "}
              {vista.noCorren.join(" · ")}
            </p>
          )}
          <Separator />
          <BotonCorrer deshabilitado={corridaViva} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buscar cuentas nuevas</CardTitle>
          <CardDescription>
            La otra máquina: en vez de traer videos, propone cuentas de referente nuevas a partir
            de las que ya funcionan. Ya no corre sola los lunes — se aprieta acá.
            {pendientes > 0 && (
              <>
                {" "}
                Hay{" "}
                <Link href="/curar/sugeridos" className="underline">
                  {pendientes} propuesta{pendientes === 1 ? "" : "s"} esperando
                </Link>
                : conviene resolverlas antes de pedir más.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotonBuscar pendientes={pendientes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corridas recientes</CardTitle>
          <CardDescription>
            La de cada lunes 08:00 es el cron; las del botón aparecen al toque.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!runs ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo leer el registro de corridas</AlertTitle>
              <AlertDescription>
                Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay corridas registradas.</p>
          ) : (
            <ul className="space-y-3">
              {runs.map((corrida) => (
                <li key={corrida.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Badge variant={BADGE_POR_ESTADO[corrida.estado]}>
                    {ESTADO_LEGIBLE[corrida.estado]}
                  </Badge>
                  <span>{haceCuanto(corrida.inicio, ahora)}</span>
                  <span className="text-muted-foreground">
                    {DISPARO_LEGIBLE[corrida.trigger_type] ?? corrida.trigger_type} · duró{" "}
                    {duracionLegible(corrida.inicio, corrida.fin, ahora)}
                    {entregaLegible(corrida) && <> · {entregaLegible(corrida)}</>}
                  </span>
                  {corrida.estado === "fallo" && corrida.error && (
                    <span className="w-full text-xs text-destructive">{corrida.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
