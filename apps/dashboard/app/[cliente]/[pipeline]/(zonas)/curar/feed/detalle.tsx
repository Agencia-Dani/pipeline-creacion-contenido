"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Calificacion, CandidatoFeed, TextosCandidato } from "@/domain/feed";
import { usarCockpit } from "../../usar-cockpit";
import { guardarNotasCandidato, textosDeCandidato } from "./actions";
import { BotonesCalificar } from "./tarjeta";

// La tarjeta ABIERTA: acá sí está todo — el script literal completo, el juicio del gate con su
// razón, y los números del video. Es lo que se mira cuando el título no alcanza para decidir.
//
// El <dialog> vive en components/ui/modal.tsx (uno solo para todo el mazo, no uno por tarjeta).
// El contenido se monta recién al abrir, así que las notas de un candidato nunca arrastran las
// del anterior sin necesidad de un efecto que las resetee.
//
// 🔑 **Los tres textos largos se piden al abrir, no vienen con el listado.** Medido el 06/08
// sobre las 165 filas de prod: `script` + `relevancia_razon` + `notas_equipo` eran 240 KB de los
// 337 que viajaban en cada carga, para dibujar tarjetas cerradas que muestran título, referente,
// vistas y heat. Los escalares (voz, idioma, likes, seguidores, engagement, url) SÍ siguen
// viniendo con la fila —son ~15 KB entre todos— así que el encabezado y los badges de este modal
// se pintan enteros al instante y lo único que espera es la prosa.

const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n);

export function Detalle({
  candidato,
  puesta,
  enviando,
  onCalificar,
  onCerrar,
}: {
  candidato: CandidatoFeed | null;
  puesta: Calificacion | null;
  enviando: boolean;
  onCalificar: (c: Calificacion) => void;
  onCerrar: () => void;
}) {
  return (
    <Modal
      abierto={candidato !== null}
      onCerrar={onCerrar}
      ancho="52rem"
      titulo={candidato?.titulo ?? ""}
      subtitulo={
        candidato && (
          <>
            {candidato.voz && `${candidato.voz} · `}
            {candidato.proyecto || "(sin proyecto)"}
            {candidato.referente && ` · ${candidato.referente}`}
            {candidato.idioma && ` · original en ${candidato.idioma}`}
          </>
        )
      }
      pie={
        <>
          <span className="text-xs text-muted-foreground">
            {puesta ? "Calificado. Clickeá otro emoji para corregir." : "¿Sirve este video?"}
          </span>
          <BotonesCalificar
            actual={puesta}
            onCalificar={onCalificar}
            enviando={enviando}
            tamano="lg"
          />
        </>
      }
    >
      {candidato && <Contenido key={candidato.id} candidato={candidato} />}
    </Modal>
  );
}

function Contenido({ candidato }: { candidato: CandidatoFeed }) {
  // El cockpit se lee acá y no baja por props: las dos acciones de este componente lo necesitan
  // para no caer en el default de `resolverContexto` (ver la cabecera de `actions.ts`), y
  // `usarCockpit` lo saca de la URL, que es de donde ya salía el de la página.
  const { cliente, pipeline } = usarCockpit();
  const [textos, setTextos] = useState<TextosCandidato | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El `key={candidato.id}` de arriba remonta este componente por candidato, así que este efecto
  // corre una vez por apertura y no hace falta resetear nada a mano. `vivo` cubre el cierre
  // rápido: sin él, una respuesta que llega tarde escribiría estado de un modal ya desmontado.
  useEffect(() => {
    let vivo = true;
    textosDeCandidato({ cliente, pipeline }, candidato.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setTextos(r.textos);
      else setError(r.mensaje);
    });
    return () => {
      vivo = false;
    };
  }, [candidato.id, cliente, pipeline]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {candidato.heat !== null && (
          <Badge variant="secondary" title="Qué tan caliente lo considera el motor, de 0 a 1.">
            heat {candidato.heat.toFixed(2)}
          </Badge>
        )}
        {candidato.relevanciaScore !== null && (
          <Badge variant="outline" title="Qué tan relevante lo juzgó el filtro contra los criterios del proyecto.">
            relevancia {candidato.relevanciaScore.toFixed(2)}
          </Badge>
        )}
        {candidato.engagement !== null && (
          <Badge variant="outline" title="Interacción sobre seguidores: qué tanto respondió la audiencia de esa cuenta.">
            engagement {candidato.engagement.toFixed(3)}
          </Badge>
        )}
        {candidato.views !== null && <span className="text-muted-foreground">{miles(candidato.views)} vistas</span>}
        {candidato.likes !== null && <span className="text-muted-foreground">{miles(candidato.likes)} likes</span>}
        {candidato.seguidores !== null && (
          <span className="text-muted-foreground">{miles(candidato.seguidores)} seguidores</span>
        )}
        {candidato.urlReferente && (
          <a
            href={candidato.urlReferente}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            ver el video ↗
          </a>
        )}
      </div>

      {/* Los tres números en cristiano. Antes vivían solo en el `title` de cada badge: invisible en
          touch, y algo que hay que descubrir por accidente. El detalle largo está en el onboarding
          §7 y no se duplica acá — esto es lo mínimo para no tener que ir a leerlo. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">heat</strong> es el orden en que llegan (mezcla vistas,
        likes, engagement y relevancia): arriba = más caliente, y el número exacto no importa.{" "}
        <strong className="text-foreground">relevancia</strong> es cuánto pega con los criterios del
        proyecto, y es la que se arregla escribiendo mejores criterios.{" "}
        <strong className="text-foreground">engagement</strong> es cuánto respondió la audiencia de
        esa cuenta, no la de ustedes. Un heat alto con relevancia baja es viral-vacío: sirve para
        entender qué funciona, no para copiarlo.
      </p>

      {error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : textos === null ? (
        <Esqueleto />
      ) : (
        <Textos candidato={candidato} textos={textos} />
      )}
    </>
  );
}

/** Lo que se ve mientras viajan los tres textos. Ocupa el alto que van a ocupar, para que el
    modal no salte cuando llegan. */
function Esqueleto() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando el guion">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className={cn("h-3 animate-pulse rounded bg-muted", i % 3 === 2 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Los tres textos largos, ya cargados. Es su propio componente por una razón concreta: monta
 * recién cuando `textos` llegó, así el `useState` de las notas arranca con el valor real. Si
 * viviera en `Contenido`, arrancaría en `""` y haría falta un efecto que lo sincronice — el
 * clásico que pisa lo que el usuario ya empezó a escribir.
 */
function Textos({ candidato, textos }: { candidato: CandidatoFeed; textos: TextosCandidato }) {
  const cockpit = usarCockpit();
  const [notas, setNotas] = useState(textos.notas ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const sucias = notas.trim() !== (textos.notas ?? "").trim();

  return (
    <>
      {textos.relevanciaRazon && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué pasó el filtro</p>
          <p className="text-sm">{textos.relevanciaRazon}</p>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Lo que se dice en el video (transcripción literal, traducida)
          </p>
          <Copiar texto={textos.script} etiqueta="Copiar guion" />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {textos.script ?? "Sin transcripción."}
        </p>
      </div>

      <div>
        <label htmlFor={`notas-${candidato.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Notas del equipo — para lo que el emoji no dice (&ldquo;bueno, pero no ahora&rdquo;)
        </label>
        <Textarea
          id={`notas-${candidato.id}`}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Opcional."
        />
        {sucias && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={guardando}
              onClick={() =>
                startTransition(async () => {
                  const r = await guardarNotasCandidato(cockpit, candidato.id, notas);
                  setAviso(r.mensaje);
                })
              }
            >
              {guardando ? "Guardando…" : "Guardar nota"}
            </Button>
            {aviso && <span className="text-xs text-muted-foreground">{aviso}</span>}
          </div>
        )}
      </div>
    </>
  );
}
