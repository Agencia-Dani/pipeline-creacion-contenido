"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { pausadoPorSuVoz } from "@/domain/proyectos";
import { guardarProyecto, guardarVoz } from "./actions";
import {
  AltaProyecto,
  AltaVoz,
  FormularioProyecto,
  FormularioVoz,
  formDeProyecto,
  formDeVoz,
  type OpcionVoz,
  type ProyectoFila,
  type VozFila,
} from "./formularios";

// Voces y proyectos con el estándar del cockpit: **la lista muestra un resumen, el record se
// abre.** Antes cada proyecto era un formulario desplegado en la lista — seis de ellos, cada uno
// con 400-650 caracteres de criterios — y encontrar algo exigía scrollear formularios ajenos.
//
// Lo único que se queda AFUERA del record es prender y apagar, porque es la acción frecuente y
// mandarla adentro le sumaría dos clicks a lo que el equipo hace todas las semanas. Y guarda al
// toque: un interruptor que necesita un botón "Guardar" al lado no es un interruptor.

type VozConProyectos = VozFila & { proyectos: ProyectoFila[] };

type Abierto =
  | { tipo: "voz"; id: string }
  | { tipo: "proyecto"; id: string }
  | { tipo: "alta-voz" }
  | { tipo: "alta-proyecto" }
  | null;

export function Pantalla({ voces }: { voces: VozConProyectos[] }) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const cerrar = () => setAbierto(null);

  const opcionesVoz: OpcionVoz[] = voces.map((v) => ({ id: v.id, nombre: v.nombre }));
  const proyectos = voces.flatMap((v) => v.proyectos);
  const huerfanas = voces.filter((v) => v.activo && v.proyectos.filter((p) => p.activo).length === 0);

  const vozAbierta = abierto?.tipo === "voz" ? voces.find((v) => v.id === abierto.id) : undefined;
  const proyectoAbierto =
    abierto?.tipo === "proyecto" ? proyectos.find((p) => p.id === abierto.id) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Voces y proyectos</h1>
          <p className="text-muted-foreground">
            Cada voz es un cliente y cada proyecto un tema suyo. Apagar una voz apaga todos sus
            proyectos. Un cambio acá aplica en la próxima corrida.
          </p>
        </div>
        {/* Crear es un botón arriba que abre un form, no una sección al pie de la página: es el
            estándar de todo el cockpit y evita que dos formularios vacíos ocupen media pantalla
            todo el tiempo, para algo que se hace una vez por trimestre. */}
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setAbierto({ tipo: "alta-voz" })}>
            Nueva voz
          </Button>
          <Button
            onClick={() => setAbierto({ tipo: "alta-proyecto" })}
            disabled={opcionesVoz.length === 0}
            title={opcionesVoz.length === 0 ? "Creá primero una voz" : undefined}
          >
            Nuevo proyecto
          </Button>
        </div>
      </div>

      {huerfanas.length > 0 && (
        <Alert>
          <AlertDescription>
            {huerfanas.map((v) => v.nombre).join(" · ")}:{" "}
            {huerfanas.length === 1 ? "está prendida" : "están prendidas"} pero sin ningún proyecto
            activo, así que no {huerfanas.length === 1 ? "entra" : "entran"} en las corridas.
            Prendé un proyecto o apagá la voz.
          </AlertDescription>
        </Alert>
      )}

      {voces.map((voz) => (
        <Card key={voz.id}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Voz</span>
                <button
                  type="button"
                  onClick={() => setAbierto({ tipo: "voz", id: voz.id })}
                  className="truncate text-lg font-semibold hover:underline"
                >
                  {voz.nombre}
                </button>
                {!voz.activo && (
                  <Badge variant="outline" title="Con la voz apagada, ninguno de sus proyectos corre.">
                    sus proyectos no corren
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Interruptor
                  etiqueta="Activa"
                  puesto={voz.activo}
                  onCambiar={(activo) => guardarVoz(voz.id, { ...formDeVoz(voz), activo })}
                />
                <Button variant="ghost" size="sm" onClick={() => setAbierto({ tipo: "voz", id: voz.id })}>
                  Ver detalle
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {voz.proyectos.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Sin proyectos todavía. Creale uno con &laquo;Nuevo proyecto&raquo;: una voz sin
                proyectos no busca nada.
              </p>
            ) : (
              // El borde de la izquierda es lo único que dice, de un vistazo, que estos cuelgan
              // de la voz de arriba: sin él, el nombre de la voz y el de un proyecto son dos
              // líneas iguales y la jerarquía —que es la regla del sistema— no se ve.
              <div className="ml-1 border-l-2 pl-4">
                <p className="pb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Sus proyectos
                </p>
                {voz.proyectos.map((p) => (
                  <FilaProyecto
                    key={p.id}
                    proyecto={p}
                    pausadoPorSuVoz={pausadoPorSuVoz(p, voz)}
                    onAbrir={() => setAbierto({ tipo: "proyecto", id: p.id })}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Modal
        abierto={vozAbierta !== undefined}
        onCerrar={cerrar}
        titulo={vozAbierta?.nombre ?? ""}
        subtitulo="Voz — lo que vale para todos sus proyectos"
      >
        {vozAbierta && <FormularioVoz voz={vozAbierta} onListo={cerrar} />}
      </Modal>

      <Modal
        abierto={proyectoAbierto !== undefined}
        onCerrar={cerrar}
        titulo={proyectoAbierto?.nombre ?? ""}
        subtitulo="Proyecto — qué busca y con qué criterios"
      >
        {proyectoAbierto && (
          <FormularioProyecto proyecto={proyectoAbierto} voces={opcionesVoz} onListo={cerrar} />
        )}
      </Modal>

      <Modal
        abierto={abierto?.tipo === "alta-voz"}
        onCerrar={cerrar}
        titulo="Nueva voz"
        subtitulo="Solo si entra un cliente nuevo. Todo lo demás cuelga de una voz que ya existe."
      >
        <AltaVoz onListo={cerrar} />
      </Modal>

      <Modal
        abierto={abierto?.tipo === "alta-proyecto"}
        onCerrar={cerrar}
        titulo="Nuevo proyecto"
        subtitulo="Un tema dentro de una voz. Después elegile referentes en Referentes."
      >
        <AltaProyecto voces={opcionesVoz} onListo={cerrar} />
      </Modal>
    </div>
  );
}

function FilaProyecto({
  proyecto,
  pausadoPorSuVoz: pausado,
  onAbrir,
}: {
  proyecto: ProyectoFila;
  pausadoPorSuVoz: boolean;
  onAbrir: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-2 last:border-b-0 ${
        proyecto.activo ? "" : "opacity-60"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={onAbrir} className="truncate font-medium hover:underline">
          {proyecto.nombre}
        </button>
        <span className="text-sm text-muted-foreground">
          pide{" "}
          <span className="tabular-nums text-foreground">
            {proyecto.n ?? "—"}
          </span>{" "}
          videos por corrida
        </span>
        {proyecto.advertencia_criterios && (
          <Badge variant="outline" title={proyecto.advertencia_criterios}>
            revisar criterios
          </Badge>
        )}
        {pausado && (
          <Badge variant="outline" title="El proyecto está activo pero su voz está apagada, así que el motor lo saltea.">
            no corre: su voz está apagada
          </Badge>
        )}
      </div>
      <Interruptor
        etiqueta="Activo"
        puesto={proyecto.activo}
        onCambiar={(activo) => guardarProyecto(proyecto.id, { ...formDeProyecto(proyecto), activo })}
      />
    </div>
  );
}

/**
 * Prender/apagar guarda al toque, sin botón intermedio. Es optimista y se revierte si el servidor
 * dice que no: el estado que se ve nunca miente sobre lo que quedó guardado.
 */
function Interruptor({
  etiqueta,
  puesto,
  onCambiar,
}: {
  etiqueta: string;
  puesto: boolean;
  onCambiar: (valor: boolean) => Promise<{ ok: boolean; mensaje: string }>;
}) {
  const [optimista, setOptimista] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const valor = optimista ?? puesto;

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm" title={error ?? undefined}>
      <input
        type="checkbox"
        checked={valor}
        disabled={enviando}
        onChange={(e) => {
          const nuevo = e.target.checked;
          setOptimista(nuevo);
          setError(null);
          startTransition(async () => {
            const r = await onCambiar(nuevo);
            if (!r.ok) {
              setOptimista(null);
              setError(r.mensaje);
            }
          });
        }}
        className="size-4 accent-primary"
      />
      {etiqueta}
      {error && <span className="text-xs text-destructive">✕</span>}
    </label>
  );
}
