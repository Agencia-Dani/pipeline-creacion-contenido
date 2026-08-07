import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { haceCuanto } from "@/domain/corrida";
import { exigirTenant } from "@/lib/auth";
import { leerFallidas, leerTranscripciones, type Transcripcion } from "@/lib/transcripciones";
import { Copiar } from "./copiar";
import { PegarEnlaces } from "./pegar-enlaces";
import { Procesador } from "./procesador";
import { Reintentar } from "./reintentar";

export const dynamic = "force-dynamic";
// Aplica a las Server Actions de esta página (docs de Next, route-segment-config). Alcanza de
// sobra: cada pasada se corta sola a los 45s y lo que quede lo agarra la siguiente.
export const maxDuration = 60;

// 🩸 `sin_transcript` decía **"Sin voz"** hasta el 2026-08-07, y **"Voz" ya significa otra cosa en
// este sistema**: el personaje o marca para quien se cura contenido (context.md). La misma app usa
// las dos acepciones en dos pantallas — `operar/page.tsx` dice *"su voz está apagada o sin voz"*
// hablando de la entidad. Un operador leyó "Sin voz" en Transcribir y preguntó si la herramienta
// devolvía una Voz: la ambigüedad es real y la cazó un humano leyendo la pantalla.
// "Sin transcripción" además es más honesto: el estado no distingue *"el video no tiene habla"* de
// *"Supadata no pudo"*, y el nombre viejo afirmaba lo primero.
const ESTADO_LEGIBLE: Record<Transcripcion["estado"], string> = {
  pendiente: "En cola",
  listo: "Listo",
  sin_transcript: "Sin transcripción",
  fallo: "Falló",
};

const BADGE_POR_ESTADO: Record<
  Transcripcion["estado"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendiente: "default",
  listo: "secondary",
  sin_transcript: "outline",
  fallo: "destructive",
};

function Fila({ t, ahora }: { t: Transcripcion; ahora: Date }) {
  return (
    <li className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge variant={BADGE_POR_ESTADO[t.estado]}>{ESTADO_LEGIBLE[t.estado]}</Badge>
        <a
          href={t.url}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all underline underline-offset-4"
        >
          {t.url}
        </a>
        <span className="text-muted-foreground">
          {haceCuanto(t.creado_en, ahora)}
          {t.idioma && t.idioma !== "es" && ` · original en ${t.idioma}`}
        </span>
      </div>

      {t.script && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Ver el script ({t.script.length} caracteres)
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{t.script}</p>
          <div className="mt-2">
            <Copiar texto={t.script} />
          </div>
        </details>
      )}

      {t.error && <p className="text-xs text-muted-foreground">{t.error}</p>}

      {/* Sin esto un enlace que falló quedaba clavado para siempre: el procesador solo levanta
          `pendiente`, y volver a pegar el link tampoco servía porque el encolado lo descarta como
          duplicado. Con Supadata devolviendo transcripciones vacías, no es un caso raro. */}
      {(t.estado === "fallo" || t.estado === "sin_transcript") && <Reintentar id={t.id} />}
    </li>
  );
}

export default async function TranscribirPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx } = await exigirTenant("transcribir", cliente, pipeline);

  const lista = await leerTranscripciones(ctx).catch((e) => {
    console.error("[transcribir] no se pudo leer la lista:", e);
    return null;
  });

  // 🩸 Las fallidas se traen aparte porque en la lista no se encuentran (medido el 2026-08-07): una
  // tanda de 52 links pegados juntos comparte `creado_en` al segundo, y la única fallada del día
  // cayó en la posición 49 de 50, indistinguible entre 49 `Listo`. El desempate entre timestamps
  // iguales es arbitrario, así que el pegote siguiente la empuja fuera de la ventana y el botón
  // `Reintentar` se vuelve inalcanzable: la fila queda clavada, que es el bug que ese botón mata.
  const fallidas = await leerFallidas(ctx).catch((e) => {
    console.error("[transcribir] no se pudieron leer las fallidas:", e);
    return [];
  });
  const enLista = new Set(fallidas.map((f) => f.id));

  const pendientes = lista?.filter((t) => t.estado === "pendiente").length ?? 0;
  const ahora = new Date();

  return (
    <div className="space-y-6">
      <Procesador pendientes={pendientes} />
      <div>
        <h1 className="text-2xl font-semibold">Transcribir</h1>
        <p className="text-muted-foreground">
          Pegá links de videos y recibí el script en español. Lo que pases acá deja de
          aparecer en las búsquedas del motor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pegá los links</CardTitle>
          <CardDescription>
            Instagram (reels y posts de video) y TikTok. El script es literal: es lo que
            dice el video, traducido, sin adaptar a ninguna voz — esa parte la hacen ustedes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PegarEnlaces />
        </CardContent>
      </Card>

      {fallidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {fallidas.length === 1
                ? "1 no salió"
                : `${fallidas.length} no salieron`}
            </CardTitle>
            <CardDescription>
              Estas se quedan acá hasta que las reintentes: el guion no existe todavía y volver a
              pegar el link no las destraba. Reintentar no cuesta nada si vuelve a fallar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {fallidas.map((t) => (
                <Fila key={t.id} t={t} ahora={ahora} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transcripciones</CardTitle>
          <CardDescription>
            {pendientes > 0
              ? `Trabajando en ${pendientes} — esto se actualiza solo, podés quedarte mirando.`
              : "Las últimas 50, de la más nueva a la más vieja."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!lista ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo leer la lista</AlertTitle>
              <AlertDescription>
                Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no pediste ninguna transcripción.
            </p>
          ) : (
            <ul className="space-y-4">
              {/* Las fallidas ya tienen su tarjeta arriba: repetirlas acá pondría dos botones
                  `Reintentar` para la misma fila. */}
              {lista
                .filter((t) => !enLista.has(t.id))
                .map((t) => (
                  <Fila key={t.id} t={t} ahora={ahora} />
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
