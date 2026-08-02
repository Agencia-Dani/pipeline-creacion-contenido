"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { miles } from "@/lib/utils";
import {
  MIN_MUESTRA_PARA_SENALAR,
  PLATAFORMAS,
  UMBRAL_TASA_GATE_FLOJO,
  cruzaVoces,
  esFlojo,
  type Salud,
} from "@/domain/referentes";
import { borrar, crear, guardar, type FormReferente, type Resultado } from "./actions";

// El banco de cuentas con el estándar del cockpit: la fila muestra un resumen y el record se
// abre. Lo que cambió respecto de la primera versión live y por qué:
//
//  · **Los checkboxes de proyectos salieron de la lista.** Eran una grilla de N casillas por cada
//    una de las 15 filas: con 6 proyectos ya costaba encontrar el dato, y no escala — cada
//    proyecto nuevo agrega 15 casillas a la pantalla. Ahora la fila muestra a QUIÉN alimenta (que
//    es lo que uno viene a saber) y cambiarlo se hace adentro del record.
//  · **Agregar es un botón arriba**, no una tarjeta al pie con un formulario siempre abierto.
//  · Lo único que se queda afuera es el interruptor de rastrear: es la acción frecuente.

export type ReferenteFila = {
  id: string;
  handle: string;
  plataforma: string;
  activo: boolean;
  notas: string | null;
  proyectoIds: string[];
  salud: Salud;
};

export type ProyectoOpcion = { id: string; nombre: string; activo: boolean };

const formDe = (r: ReferenteFila): FormReferente => ({
  handle: r.handle,
  plataforma: r.plataforma,
  proyectoIds: r.proyectoIds,
  activo: r.activo,
  notas: r.notas ?? "",
});

const porcentaje = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function Pantalla({
  banco,
  proyectos,
  vozPorProyecto,
}: {
  banco: ReferenteFila[];
  proyectos: ProyectoOpcion[];
  vozPorProyecto: Record<string, string>;
}) {
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);

  const nombrePorId = new Map(proyectos.map((p) => [p.id, p.nombre]));
  const mapaVoces = new Map(Object.entries(vozPorProyecto));
  const abierto = banco.find((r) => r.id === abiertoId) ?? null;

  const flojos = banco.filter(
    (r) => r.activo && esFlojo(r.salud, UMBRAL_TASA_GATE_FLOJO, MIN_MUESTRA_PARA_SENALAR),
  );
  // Una cuenta prendida que no alimenta a nadie es trabajo que no se hace: el motor recorre sus
  // proyectos y no encuentra ninguno. Pasa si se borra un proyecto (la puente cascadea).
  const sinProyecto = banco.filter((r) => r.activo && r.proyectoIds.length === 0);

  const fila = (r: ReferenteFila) => (
    <Fila
      key={r.id}
      referente={r}
      nombrePorId={nombrePorId}
      avisoCruzaVoces={cruzaVoces(r.proyectoIds, mapaVoces)}
      onAbrir={() => setAbiertoId(r.id)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Referentes</h1>
          <p className="text-muted-foreground">
            Las cuentas de las que el motor trae videos. Un cambio acá aplica en la próxima corrida.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setAltaAbierta(true)}>
          Agregar cuenta
        </Button>
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
              {Math.round(UMBRAL_TASA_GATE_FLOJO * 100)}%, con al menos {MIN_MUESTRA_PARA_SENALAR}{" "}
              videos evaluados). Podar es decisión de ustedes: el sistema nunca apaga una cuenta solo.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">{flojos.map(fila)}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>El banco</CardTitle>
          <CardDescription>
            {banco.filter((r) => r.activo).length} cuentas rastreándose de {banco.length}. Una
            cuenta puede alimentar más de un proyecto: cada video llega una sola vez, al que mejor
            pega. Tocá una cuenta para cambiar sus proyectos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {banco.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Todavía no hay cuentas. Agregá la primera con el botón de arriba, o aprobá una de las
              que propone el buscador en{" "}
              <Link href="/curar/sugeridos" className="underline">
                Sugeridos
              </Link>
              .
            </p>
          ) : (
            banco.map(fila)
          )}
        </CardContent>
      </Card>

      <Modal
        abierto={abierto !== null}
        onCerrar={() => setAbiertoId(null)}
        titulo={abierto?.handle ?? ""}
        subtitulo="Cuenta de referente — a qué proyectos alimenta"
      >
        {abierto && (
          <Formulario
            referente={abierto}
            proyectos={proyectos}
            onListo={() => setAbiertoId(null)}
          />
        )}
      </Modal>

      <Modal
        abierto={altaAbierta}
        onCerrar={() => setAltaAbierta(false)}
        titulo="Agregar una cuenta"
        subtitulo="Va solo el nombre de usuario, no el link."
      >
        <Formulario proyectos={proyectos} onListo={() => setAltaAbierta(false)} />
      </Modal>
    </div>
  );
}

function Fila({
  referente,
  nombrePorId,
  avisoCruzaVoces,
  onAbrir,
}: {
  referente: ReferenteFila;
  nombrePorId: Map<string, string>;
  avisoCruzaVoces: boolean;
  onAbrir: () => void;
}) {
  const { salud } = referente;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3 last:border-b-0 ${
        referente.activo ? "" : "opacity-60"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={onAbrir} className="font-medium hover:underline">
          {referente.handle}
        </button>
        <Badge variant="secondary">{referente.plataforma}</Badge>
        {/* Se veían en Sugeridos y se perdían al aprobar. Ahora se derivan (ADR-041): es lo último
            que vio el motor, y «—» cuando el sistema no tiene el dato. */}
        {salud.seguidores !== null && (
          <span
            className="text-xs text-muted-foreground"
            title="Seguidores que vio el motor la última vez que trajo un video de esta cuenta."
          >
            {miles(salud.seguidores)} seguidores
          </span>
        )}
        {avisoCruzaVoces && (
          <Badge variant="outline" title="Alimenta proyectos de más de una voz. El motor lo permite: cada video llega una sola vez, al proyecto que mejor pega.">
            cruza voces
          </Badge>
        )}
        {/* A quién alimenta, de un vistazo. Reemplaza la grilla de checkboxes que había acá. */}
        {referente.proyectoIds.length === 0 ? (
          <span className="text-xs text-destructive">sin proyecto: no le pide nada a nadie</span>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            {referente.proyectoIds.map((id) => nombrePorId.get(id) ?? "?").join(" · ")}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex gap-3 text-xs tabular-nums text-muted-foreground">
          <span title="Qué proporción de sus videos pasa el filtro.">
            pasa <strong className="text-foreground">{porcentaje(salud.tasa_gate)}</strong>
          </span>
          <span title="Qué proporción de sus videos terminan aprobando ustedes.">
            aprueban <strong className="text-foreground">{porcentaje(salud.tasa_aprobacion)}</strong>
          </span>
          <span title="Sobre cuántos videos se calculan esas tasas. Con pocos, no saquen conclusiones.">
            sobre <strong className="text-foreground">{salud.videos_evaluados ?? 0}</strong>
          </span>
        </div>
        <Interruptor referente={referente} />
      </div>
    </div>
  );
}

/** Rastrear guarda al toque: es la acción frecuente y no merece un botón intermedio. */
function Interruptor({ referente }: { referente: ReferenteFila }) {
  const [optimista, setOptimista] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm" title={error ?? undefined}>
      <input
        type="checkbox"
        checked={optimista ?? referente.activo}
        disabled={enviando}
        onChange={(e) => {
          const activo = e.target.checked;
          setOptimista(activo);
          setError(null);
          startTransition(async () => {
            const r = await guardar(referente.id, { ...formDe(referente), activo });
            if (!r.ok) {
              setOptimista(null);
              setError(r.mensaje);
            }
          });
        }}
        className="size-4 accent-primary"
      />
      Rastrear
      {error && <span className="text-xs text-destructive">✕</span>}
    </label>
  );
}

/**
 * El record: uno solo para editar y para crear. Son el mismo formulario con el mismo validador
 * del lado del servidor; separarlos era duplicar el picker de proyectos, que es la parte que más
 * crece.
 */
function Formulario({
  referente,
  proyectos,
  onListo,
}: {
  referente?: ReferenteFila;
  proyectos: ProyectoOpcion[];
  onListo: () => void;
}) {
  const vacio: FormReferente = {
    handle: "",
    plataforma: "instagram",
    proyectoIds: [],
    activo: true,
    notas: "",
  };
  const original = referente ? formDe(referente) : vacio;
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const mismosProyectos =
    form.proyectoIds.length === original.proyectoIds.length &&
    form.proyectoIds.every((p) => original.proyectoIds.includes(p));
  const cambiado = referente
    ? form.handle.trim() !== original.handle ||
      form.plataforma !== original.plataforma ||
      form.notas.trim() !== original.notas.trim() ||
      !mismosProyectos
    : form.handle.trim() !== "";

  const alternar = (id: string) =>
    setForm((f) => ({
      ...f,
      proyectoIds: f.proyectoIds.includes(id)
        ? f.proyectoIds.filter((p) => p !== id)
        : [...f.proyectoIds, id],
    }));

  const enviar = () =>
    startTransition(async () => {
      const r = referente ? await guardar(referente.id, form) : await crear(form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ref-handle">Cuenta</Label>
          <Input
            id="ref-handle"
            value={form.handle}
            onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
            disabled={enviando}
            placeholder="@simonsinek"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ref-plataforma">Plataforma</Label>
          <Select
            id="ref-plataforma"
            value={form.plataforma}
            onChange={(e) => setForm((f) => ({ ...f, plataforma: e.target.value }))}
            disabled={enviando}
          >
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>A qué proyectos alimenta</Label>
        <p className="text-xs text-muted-foreground">
          Al menos uno: una cuenta sin proyecto no la busca nadie. Los pausados se pueden elegir
          igual — empiezan a recibir cuando se prendan.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {proyectos.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={form.proyectoIds.includes(p.id)}
                onChange={() => alternar(p.id)}
                disabled={enviando}
                className="size-4 accent-primary"
              />
              <span className={p.activo ? "" : "text-muted-foreground"}>
                {p.nombre}
                {p.activo ? "" : " (pausado)"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ref-notas">Notas</Label>
        <p className="text-xs text-muted-foreground">
          Para ustedes: el motor no las lee. Sirven para acordarse de por qué entró la cuenta.
        </p>
        {/* Era un <Input> de una línea, y aprobar un sugerido escribe acá una nota automática de
            ~250 caracteres: el texto se corría de lado en vez de bajar de renglón. El Textarea
            trae `field-sizing-content`, así que además crece con lo que haya. */}
        <Textarea
          id="ref-notas"
          value={form.notas}
          onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
          disabled={enviando}
          rows={3}
          placeholder="Por qué la agregaron"
        />
      </div>

      {/* Borrar solo existe editando, nunca en el alta, y va lejos de Guardar: es la única acción
          de esta pantalla que no se deshace. Apagar («Rastrear») sigue siendo lo correcto para
          «no la busques más»; borrar es para la fila que no debería existir — la repetida, la del
          typo. Lo que la cuenta ya trajo no se toca: la historia se guarda por handle, no por FK. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-card px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {referente && (
            <BotonBorrar
              etiqueta="Borrar la cuenta"
              advertencia="Sale del banco; lo que ya trajo se queda. No se puede deshacer."
              deshabilitado={enviando}
              onBorrar={() => borrar(referente.id)}
              onResultado={(r) => {
                setResultado(r);
                if (r.ok) onListo();
              }}
            />
          )}
          <p className={`text-xs ${resultado?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
            {resultado?.mensaje ?? (cambiado ? "Hay cambios sin guardar." : "")}
          </p>
        </div>
        <Button onClick={enviar} disabled={!cambiado || enviando}>
          {enviando ? "Guardando…" : referente ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </>
  );
}
