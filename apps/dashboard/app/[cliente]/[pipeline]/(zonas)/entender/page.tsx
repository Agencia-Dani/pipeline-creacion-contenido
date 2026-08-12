import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { veCostos } from "@/domain/roles";
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
import { Auditoria, Calidad, Costos, Descubrimiento, Embudo, ErrorLectura } from "./secciones";
import { ActividadConMas } from "./actividad-con-mas";

export const dynamic = "force-dynamic";

export default async function EntenderPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { usuario, ctx, rol } = await exigirTenant("entender", cliente, pipeline);
  // 🔑 **Actividad y Costos NO son el mismo gate**, y confundirlos era el estado hasta ADR-063 §2.
  // El log de quién tocó qué es el trabajo de un jefe de equipo, así que lo ve también el `sponsor`;
  // los costos son el margen de la agencia y siguen siendo solo del `dev` (abajo).
  const veActividad = rol === "dev" || rol === "sponsor";
  // ADR-052 + ADR-060: los costos de proveedor (`v_costos_semana` = consumo × `app.tarifas`) son
  // el margen de la agencia, y desde el 2026-08-06 los ve **solo el `dev`**. La regla vive en
  // `domain/roles.ts` con su test, no acá: es una decisión de quién ve qué, no de esta pantalla.
  //
  // El corte va en el servidor, y eso sí es de esta pantalla: esconder la tarjeta en React dejaría
  // los números viajando igual al browser. Por eso gobierna también el `leerCostos` de abajo.
  const puedeVerCostos = veCostos(rol);

  // `allSettled` y no `all`: una vista que falle apaga su tarjeta, no la página entera.
  const [calidad, embudo, auditoria, descubrimiento, costos, eventos, proyectos] =
    await Promise.allSettled([
      leerCalidad(ctx),
      leerEmbudo(ctx),
      leerAuditoria(ctx),
      leerDescubrimiento(ctx),
      puedeVerCostos ? leerCostos(ctx) : Promise.resolve([]),
      veActividad ? leerEventos(ctx) : Promise.resolve({ filas: [], hayMas: false }),
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
        {/* 🩸 El "y costos de la semana" iba SUELTO acá y la tarjeta sí estaba gateada, así que a un
            operador esta bajada le prometía algo que la pantalla no le iba a mostrar. No era una
            fuga —los números nunca viajaron, `leerCostos` ni se llama— pero es la familia de la
            `015`: texto que describe algo ausente. Lo encontró la verificación #4 del 2026-08-12,
            que quedó AMBIGUA por esto: "¿ves costos?" tiene dos respuestas distintas según si el
            que mira lee la bajada o la tarjeta. Una prueba de fuga que se puede contestar mal por
            una frase decorativa es una prueba rota. */}
        <p className="text-muted-foreground">
          Precisión por proyecto, embudo del motor
          {puedeVerCostos ? " y costos de la semana" : ""}. Todo sale de Supabase, calculado en la
          base — acá no se edita nada.
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

      {puedeVerCostos && (
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

      {veActividad && (
        <Card>
          <CardHeader>
            <CardTitle>Actividad</CardTitle>
            <CardDescription>
              Quién cambió qué, y cuándo. Cuando algo cambió, solo esto responde por qué.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventos.status === "fulfilled" ? (
              <ActividadConMas inicial={eventos.value.filas} hayMasInicial={eventos.value.hayMas} />
            ) : (
              <ErrorLectura que="la actividad" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
