import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirTenant } from "@/lib/auth";
import { leerProyectos } from "@/lib/proyectos";
import {
  leerAuditoria,
  leerCalidad,
  leerCostos,
  leerDescubrimiento,
  leerEmbudo,
  leerEventos,
} from "@/lib/entender";
import { Actividad, Auditoria, Calidad, Costos, Descubrimiento, Embudo, ErrorLectura } from "./secciones";

export const dynamic = "force-dynamic";

export default async function EntenderPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { usuario, ctx, rol } = await exigirTenant("entender", cliente, pipeline);
  const esDev = rol === "dev";
  // ADR-052: el `sponsor` NO ve lo que nos cuestan los proveedores. Con clientes externos
  // logueándose, `v_costos_semana` (consumo × `app.tarifas`) es el margen de la agencia, y la
  // única zona que un sponsor ve es justamente esta. El corte va acá, en el servidor: esconder la
  // tarjeta en React dejaría los números viajando igual al browser.
  //
  // 🩸 **Desde el 2026-08-05 esta línea apoya un supuesto, y conviene saber cuál.** El `operador`
  // entró a Entender, así que "todos menos sponsor" ahora **incluye al operador**: ve los costos.
  // Se decidió así porque **hoy todos los operadores son gente de adentro** — confirmado contra las
  // 7 membresías vivas. El día que alguien de una empresa cliente reciba `operador`, esta línea le
  // publica el margen, y **falla hacia MOSTRAR**: no rompe nada, no avisa, filtra. Si eso pasa, el
  // arreglo es `rol === "dev"`, que es lo que ADR-052 dejó escrito y descartado por innecesario.
  const veCostos = rol !== "sponsor";

  // `allSettled` y no `all`: una vista que falle apaga su tarjeta, no la página entera.
  const [calidad, embudo, auditoria, descubrimiento, costos, eventos, proyectos] =
    await Promise.allSettled([
      leerCalidad(ctx),
      leerEmbudo(ctx),
      leerAuditoria(ctx),
      leerDescubrimiento(ctx),
      veCostos ? leerCostos(ctx) : Promise.resolve([]),
      esDev ? leerEventos(ctx) : Promise.resolve([]),
      leerProyectos(ctx),
    ]);

  // Si no se pueden leer los proyectos, la card cae a mostrar solo los que tienen datos (el
  // comportamiento viejo). Se degrada, no se apaga: la mitad medida sigue sirviendo.
  const activos =
    proyectos.status === "fulfilled"
      ? proyectos.value.filter((p) => p.activo).map((p) => p.nombre)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Entender</h1>
        <p className="text-muted-foreground">
          Precisión por proyecto, embudo del motor y costos de la semana. Todo sale de
          Supabase, calculado en la base — acá no se edita nada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calidad por proyecto</CardTitle>
          <CardDescription>
            Qué tan bien el filtro de cada proyecto le achica el trabajo al equipo:
            precisión = aprobados / calificados de la semana de calificación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calidad.status === "fulfilled" ? (
            <Calidad filas={calidad.value} activos={activos} />
          ) : (
            <ErrorLectura que="la calidad por proyecto" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Embudo y salud del motor</CardTitle>
          <CardDescription>
            De todo lo que el motor mira, cuánto sobrevive cada filtro hasta llegar al
            feed. Un embudo que se angosta mucho al principio es normal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {embudo.status === "fulfilled" ? (
            <Embudo filas={embudo.value} />
          ) : (
            <ErrorLectura que="el embudo del motor" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuánto bueno estamos tirando</CardTitle>
          <CardDescription>
            De los rechazos que el motor dejó para revisar, cuántos el equipo marcó como
            &laquo;era bueno&raquo;. Es lo único que mide si el filtro se pasa de exigente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditoria.status === "fulfilled" ? (
            <Auditoria filas={auditoria.value} />
          ) : (
            <ErrorLectura que="la auditoría de descartes" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buscador de cuentas</CardTitle>
          <CardDescription>
            Cuántas cuentas nuevas encontró el descubrimiento y cuántas terminaron alimentando
            proyectos. Si nunca se aprueba nada, las semillas no están sirviendo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {descubrimiento.status === "fulfilled" ? (
            <Descubrimiento filas={descubrimiento.value} />
          ) : (
            <ErrorLectura que="el embudo del buscador" />
          )}
        </CardContent>
      </Card>

      {veCostos && (
      <Card>
        <CardHeader>
          <CardTitle>Costos de la semana</CardTitle>
          <CardDescription>
            Consumo real por servicio × su tarifa (viven en la tabla de tarifas de la
            base, no en fórmulas). El botón ▶ y el cron suman acá por igual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {costos.status === "fulfilled" ? (
            <Costos filas={costos.value} />
          ) : (
            <ErrorLectura que="los costos" />
          )}
        </CardContent>
      </Card>
      )}

      {esDev && (
        <Card>
          <CardHeader>
            <CardTitle>Actividad</CardTitle>
            <CardDescription>
              Quién cambió qué, y cuándo. Solo para dev: al equipo no le sirve, pero cuando algo
              cambió solo esto es lo que responde por qué.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventos.status === "fulfilled" ? (
              <Actividad filas={eventos.value} />
            ) : (
              <ErrorLectura que="la actividad" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
