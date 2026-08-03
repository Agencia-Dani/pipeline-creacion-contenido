import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// El `not-found` de la raíz atrapa **toda** URL sin ruta en la app, no solo los `notFound()`
// (documentado en la doc de Next que trae el repo: `not-found.md`, «Good to know»).
//
// Es el último eslabón de la red que dejó abierta la Fase 3, no el primero: los links viejos
// (`/operar`, `/curar/feed`) tienen uno o dos segmentos, así que hoy los atrapan `[cliente]` y
// `[cliente]/[pipeline]`, que no resuelven nada y rebotan a `/`. Acá caen las URLs que ni eso:
// tres segmentos o más que no matchean ninguna zona. Sin este archivo son el 404 default de Next
// —pantalla en blanco, sin decir qué pasó y sin salida.
//
// **No redirige, a propósito.** Las rutas de arriba ya rebotan solas al que se equivocó de poco;
// el que llegó acá se equivocó de mucho, y un salto silencioso le esconde que la URL está mal en
// vez de dejar que la corrija. Además `redirect()` adentro de un `not-found` es frágil: en
// respuestas streameadas termina siendo un salto de cliente.
export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Esa dirección no existe</CardTitle>
          <CardDescription>
            El cockpit lleva la empresa y el pipeline adelante
            (<code>/retia/reels/…</code>), así que un link viejo o mal copiado
            no llega. Entrá por acá y actualizá tu marcador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">Ir a mi cockpit</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
