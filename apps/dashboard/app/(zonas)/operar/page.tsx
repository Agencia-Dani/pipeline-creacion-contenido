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
  ultimoEmbudo,
  type Corrida,
  type VistaOperar,
} from "@/domain/corrida";
import { leerConfigOperar } from "@/lib/airtable";
import { exigirZona } from "@/lib/auth";
import { ultimasCorridasMotor } from "@/lib/runs";
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

export default async function OperarPage() {
  await exigirZona("operar");

  // Cada mitad falla sola: sin Airtable igual se ven las corridas, y al revés.
  const [config, corridas] = await Promise.allSettled([
    leerConfigOperar(),
    ultimasCorridasMotor(),
  ]);

  const vista: VistaOperar | null =
    config.status === "fulfilled"
      ? armarVistaOperar(config.value.voces, config.value.proyectos, config.value.defaultN)
      : null;
  const runs = corridas.status === "fulfilled" ? corridas.value : null;
  const ahora = new Date();
  const corridaViva = runs ? hayCorridaViva(runs, ahora) : false;
  const embudo = runs ? ultimoEmbudo(runs) : null;

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
            Una corrida busca para todos los proyectos activos de voces activas, cada uno
            hasta su N. Esto se edita por ahora en Airtable; acá se dispara y se mira.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!vista ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo leer la config de Airtable</AlertTitle>
              <AlertDescription>
                Se puede disparar igual (el motor lee Airtable por su cuenta), pero
                revisá antes qué está activo. Si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : vista.porVoz.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay ningún proyecto activo con voz activa: una corrida ahora no
              entregaría nada. Prendé algo en Airtable primero.
            </p>
          ) : (
            vista.porVoz.map(({ voz, proyectos }) => (
              <div key={voz.id} className="space-y-1">
                <p className="text-sm font-medium">{voz.nombre}</p>
                <ul className="space-y-1">
                  {proyectos.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm text-muted-foreground"
                    >
                      <span>{p.nombre}</span>
                      <span>
                        hasta {p.n} candidatos{p.nEsDefault && " (default global)"}
                      </span>
                    </li>
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

      {embudo && (
        <Card>
          <CardHeader>
            <CardTitle>Última corrida, por proyecto</CardTitle>
            <CardDescription>
              De {haceCuanto(embudo.corrida.inicio, ahora)}: cuánto entregó cada proyecto
              de su meta, qué tan estricto fue su filtro, y por qué faltó (si faltó).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {embudo.filas.map((f) => {
                const corto = f.entregados < f.nObjetivo;
                return (
                  <li key={f.nombre} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="font-medium">{f.nombre}</span>
                      <span className={corto ? "text-muted-foreground" : ""}>
                        entregó {f.entregados} de {f.nObjetivo}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        filtro:{" "}
                        {f.tasaGate == null
                          ? "sin datos"
                          : `pasó el ${Math.round(f.tasaGate * 100)}% de ${f.evaluados} evaluados`}
                      </span>
                      {f.sinGuion > 0 && <span>· {f.sinGuion} sin guion (descartados)</span>}
                      {corto && f.razonFaltante && (
                        <Badge variant="outline">{RAZON_FALTANTE_LEGIBLE[f.razonFaltante]}</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

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
