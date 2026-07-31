"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  crearProyectoNuevo,
  crearVozNueva,
  guardarProyecto,
  guardarVoz,
  type FormProyecto,
  type FormVoz,
  type Resultado,
} from "./actions";

// Mismo patrón que Ajustes y Referentes: el botón Guardar aparece SOLO cuando algo cambió. La
// validación de verdad vive en el servidor (domain/proyectos.ts); acá solo se decide qué se ve.
//
// Los criterios están plegados por default. Son el texto más largo de todo el cockpit (400–650
// caracteres cada uno) y con 6 proyectos abiertos la pantalla dejaba de ser una lista: se
// abren cuando se van a leer o editar, que no es lo habitual.

function Aviso({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;
  return (
    <p className={`text-xs ${resultado.ok ? "text-muted-foreground" : "text-destructive"}`}>
      {resultado.mensaje}
    </p>
  );
}

export function FilaVoz({
  voz,
}: {
  voz: {
    id: string;
    nombre: string;
    descripcion: string | null;
    criterios_relevancia: string | null;
    activo: boolean;
  };
}) {
  const original: FormVoz = {
    nombre: voz.nombre,
    descripcion: voz.descripcion ?? "",
    criterios_relevancia: voz.criterios_relevancia ?? "",
    activo: voz.activo,
  };
  const [form, setForm] = useState(original);
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim() ||
    form.activo !== original.activo;

  const enviar = () => startTransition(async () => setResultado(await guardarVoz(voz.id, form)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Voz</span>
          <Input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            className="h-11 w-72 text-lg font-semibold"
            aria-label="Nombre de la voz"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              disabled={enviando}
              className="size-4 accent-primary"
            />
            Activa
          </label>
          {!form.activo && (
            <Badge variant="outline" title="Con la voz apagada, ninguno de sus proyectos corre.">
              sus proyectos no corren
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAbierto((a) => !a)}>
            {abierto ? "Ocultar criterios" : "Ver criterios"}
          </Button>
          <Button size="sm" onClick={enviar} disabled={!cambiado || enviando} className={cambiado ? "" : "invisible"}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {abierto && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor={`voz-desc-${voz.id}`}>Descripción</Label>
            <Input
              id={`voz-desc-${voz.id}`}
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              disabled={enviando}
              placeholder="Quién es y de qué habla"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`voz-crit-${voz.id}`}>Criterios de la voz</Label>
            <p className="text-xs text-muted-foreground">
              Lo que vale para TODOS sus proyectos. El filtro los suma a los criterios de cada
              proyecto, no los reemplaza.
            </p>
            <Textarea
              id={`voz-crit-${voz.id}`}
              value={form.criterios_relevancia}
              onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
              disabled={enviando}
              rows={5}
            />
          </div>
        </div>
      )}

      <Aviso resultado={resultado} />
    </div>
  );
}

export function FilaProyecto({
  proyecto,
  voces,
  defaultN,
  pausadoPorSuVoz,
}: {
  proyecto: {
    id: string;
    nombre: string;
    descripcion: string | null;
    criterios_relevancia: string;
    criterios_aprendidos: string | null;
    advertencia_criterios: string | null;
    voz_id: string;
    activo: boolean;
    n: number | null;
  };
  voces: { id: string; nombre: string }[];
  defaultN: number;
  pausadoPorSuVoz: boolean;
}) {
  const original: FormProyecto = {
    nombre: proyecto.nombre,
    descripcion: proyecto.descripcion ?? "",
    criterios_relevancia: proyecto.criterios_relevancia,
    vozId: proyecto.voz_id,
    activo: proyecto.activo,
    n: proyecto.n === null ? "" : String(proyecto.n),
  };
  const [form, setForm] = useState(original);
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim() ||
    form.vozId !== original.vozId ||
    form.activo !== original.activo ||
    form.n.trim() !== original.n;

  const enviar = () => startTransition(async () => setResultado(await guardarProyecto(proyecto.id, form)));

  return (
    <div className={`space-y-3 border-b py-4 last:border-b-0 ${form.activo ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            className="w-60 font-medium"
            aria-label="Nombre del proyecto"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              disabled={enviando}
              className="size-4 accent-primary"
            />
            Activo
          </label>
          <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            hasta
            <Input
              value={form.n}
              onChange={(e) => setForm((f) => ({ ...f, n: e.target.value }))}
              disabled={enviando}
              placeholder={String(defaultN)}
              inputMode="numeric"
              className="w-20 tabular-nums"
              aria-label="Videos por corrida"
            />
            videos{form.n.trim() === "" && ` (global)`}
          </label>
          {pausadoPorSuVoz && (
            <Badge variant="outline" title="El proyecto está activo pero su voz está apagada, así que el motor lo saltea.">
              no corre: su voz está apagada
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAbierto((a) => !a)}>
            {abierto ? "Ocultar" : "Criterios"}
          </Button>
          <Button size="sm" onClick={enviar} disabled={!cambiado || enviando} className={cambiado ? "" : "invisible"}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {proyecto.advertencia_criterios && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Revisión de los criterios</p>
          <p className="text-muted-foreground">{proyecto.advertencia_criterios}</p>
        </div>
      )}

      {abierto && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor={`proy-voz-${proyecto.id}`}>Voz</Label>
            <select
              id={`proy-voz-${proyecto.id}`}
              value={form.vozId}
              onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
              disabled={enviando}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {voces.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`proy-desc-${proyecto.id}`}>Descripción</Label>
            <Input
              id={`proy-desc-${proyecto.id}`}
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              disabled={enviando}
              placeholder="De qué va este proyecto"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`proy-crit-${proyecto.id}`}>Criterios de relevancia</Label>
            <p className="text-xs text-muted-foreground">
              Qué SÍ y qué NO cuenta como relevante. Es lo que lee el filtro para decidir cada
              video: si acá no dice qué rechazar, casi todo pasa.
            </p>
            <Textarea
              id={`proy-crit-${proyecto.id}`}
              value={form.criterios_relevancia}
              onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
              disabled={enviando}
              rows={6}
            />
          </div>
          {proyecto.criterios_aprendidos && (
            <div className="space-y-1">
              <Label>Lo que el sistema aprendió</Label>
              <p className="text-xs text-muted-foreground">
                Escrito solo cada domingo a partir de lo que ustedes calificaron. El filtro lo usa
                junto con los criterios de arriba. No se edita.
              </p>
              <p className="whitespace-pre-wrap rounded-md border bg-background p-2 text-sm text-muted-foreground">
                {proyecto.criterios_aprendidos}
              </p>
            </div>
          )}
        </div>
      )}

      <Aviso resultado={resultado} />
    </div>
  );
}

export function AltaVoz() {
  const vacio: FormVoz = { nombre: "", descripcion: "", criterios_relevancia: "", activo: false };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearVozNueva(form);
      setResultado(r);
      if (r.ok) setForm(vacio);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="alta-voz-nombre">Nombre</Label>
          <Input
            id="alta-voz-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            placeholder="Nombre del cliente o del personaje"
            className="w-72"
          />
        </div>
        <Button size="sm" onClick={enviar} disabled={enviando}>
          {enviando ? "Creando…" : "Crear voz"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Nace apagada: prendela cuando tenga proyectos y referentes cargados.
      </p>
      <Aviso resultado={resultado} />
    </div>
  );
}

export function AltaProyecto({ voces }: { voces: { id: string; nombre: string }[] }) {
  const vacio: FormProyecto = {
    nombre: "",
    descripcion: "",
    criterios_relevancia: "",
    vozId: voces[0]?.id ?? "",
    activo: false,
    n: "",
  };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearProyectoNuevo(form);
      setResultado(r);
      if (r.ok) setForm({ ...vacio, vozId: form.vozId });
    });

  // El botón va ABAJO de todo, no al lado del nombre: los criterios son obligatorios y con el
  // botón arriba se clickea antes de haber visto el campo que lo va a rechazar.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="alta-proy-nombre">Nombre</Label>
          <Input
            id="alta-proy-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            placeholder="El tema del que va a traer videos"
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-proy-voz">Voz</Label>
          <select
            id="alta-proy-voz"
            value={form.vozId}
            onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
            disabled={enviando}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {voces.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="alta-proy-crit">Criterios de relevancia</Label>
        <p className="text-xs text-muted-foreground">
          Obligatorios: sin esto el filtro no sabe qué es relevante y aprueba cualquier cosa.
          Escribí también qué NO cuenta.
        </p>
        <Textarea
          id="alta-proy-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={5}
        />
      </div>
      <Button size="sm" onClick={enviar} disabled={enviando}>
        {enviando ? "Creando…" : "Crear proyecto"}
      </Button>
      <Aviso resultado={resultado} />
    </div>
  );
}
