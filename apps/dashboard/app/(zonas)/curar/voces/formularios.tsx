"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

// Los cuatro formularios de esta pantalla. Viven adentro del modal del record (o del de alta):
// la lista de afuera muestra un resumen y nada más. Con seis proyectos desplegados, cada uno con
// 400-650 caracteres de criterios, la pantalla dejaba de ser una lista.
//
// Cada uno es un componente COMPLETO (cuerpo + pie), no un par de nodos que el padre acomoda:
// tienen hooks adentro, y un padre que los montara condicionalmente en dos slots distintos
// rompería el orden de los hooks. Por eso el pie va pegado abajo con `sticky` en vez de ir al
// `pie` del <Modal>.
//
// La validación de verdad está en el servidor (domain/proyectos.ts). Acá solo se decide qué se ve.

export type VozFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string | null;
  activo: boolean;
};

export type ProyectoFila = {
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

export type OpcionVoz = { id: string; nombre: string };

export const formDeVoz = (v: VozFila): FormVoz => ({
  nombre: v.nombre,
  descripcion: v.descripcion ?? "",
  criterios_relevancia: v.criterios_relevancia ?? "",
  activo: v.activo,
});

export const formDeProyecto = (p: ProyectoFila): FormProyecto => ({
  nombre: p.nombre,
  descripcion: p.descripcion ?? "",
  criterios_relevancia: p.criterios_relevancia,
  vozId: p.voz_id,
  activo: p.activo,
  n: p.n === null ? "" : String(p.n),
});

/** El pie del formulario: guarda solo si algo cambió, y no se va con el scroll. */
function Pie({
  cambiado,
  enviando,
  resultado,
  onGuardar,
  etiqueta = "Guardar",
}: {
  cambiado: boolean;
  enviando: boolean;
  resultado: Resultado | null;
  onGuardar: () => void;
  etiqueta?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-4 border-t bg-card px-4 py-3">
      <p className={`text-xs ${resultado?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
        {resultado?.mensaje ?? (cambiado ? "Hay cambios sin guardar." : "")}
      </p>
      <Button onClick={onGuardar} disabled={!cambiado || enviando}>
        {enviando ? "Guardando…" : etiqueta}
      </Button>
    </div>
  );
}

/**
 * El número de videos por corrida. Es el ÚNICO knob de cantidad que ve el equipo: los tres
 * globales que competían con él (`Candidatos por corrida`, `Días de recencia`, `Resultados por
 * cuenta de referente`) pasaron a `visibilidad = 'dev'`. Por eso ya no tiene placeholder que
 * diga "si lo dejás vacío usa el global": vacío ahora es un error del servidor.
 */
function CampoN({
  valor,
  onChange,
  enviando,
}: {
  valor: string;
  onChange: (v: string) => void;
  enviando: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="proy-n">Videos por corrida</Label>
      <Input
        id="proy-n"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={enviando}
        inputMode="numeric"
        className="w-24 tabular-nums"
      />
    </div>
  );
}

// ── El record de una voz ─────────────────────────────────────────────────────

export function FormularioVoz({ voz, onListo }: { voz: VozFila; onListo: () => void }) {
  const original = formDeVoz(voz);
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim();

  const enviar = () =>
    startTransition(async () => {
      const r = await guardarVoz(voz.id, form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="voz-nombre">Nombre</Label>
        <Input
          id="voz-nombre"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          disabled={enviando}
          className="w-72"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="voz-desc">Descripción</Label>
        <Input
          id="voz-desc"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          disabled={enviando}
          placeholder="Quién es y de qué habla"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="voz-crit">Criterios de la voz</Label>
        <p className="text-xs text-muted-foreground">
          Lo que vale para TODOS sus proyectos. El filtro los suma a los criterios de cada
          proyecto, no los reemplaza.
        </p>
        <Textarea
          id="voz-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={6}
        />
      </div>
      <Pie cambiado={cambiado} enviando={enviando} resultado={resultado} onGuardar={enviar} />
    </>
  );
}

// ── El record de un proyecto ─────────────────────────────────────────────────

export function FormularioProyecto({
  proyecto,
  voces,
  onListo,
}: {
  proyecto: ProyectoFila;
  voces: OpcionVoz[];
  onListo: () => void;
}) {
  const original = formDeProyecto(proyecto);
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim() ||
    form.vozId !== original.vozId ||
    form.n.trim() !== original.n;

  const enviar = () =>
    startTransition(async () => {
      const r = await guardarProyecto(proyecto.id, form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      {proyecto.advertencia_criterios && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Revisión de los criterios</p>
          <p className="text-muted-foreground">{proyecto.advertencia_criterios}</p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="proy-nombre">Nombre</Label>
          <Input
            id="proy-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="proy-voz">Voz</Label>
          <Select
            id="proy-voz"
            value={form.vozId}
            onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
            disabled={enviando}
          >
            {voces.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Select>
        </div>
        <CampoN
          valor={form.n}
          onChange={(n) => setForm((f) => ({ ...f, n }))}
          enviando={enviando}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="proy-desc">Descripción</Label>
        <Input
          id="proy-desc"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          disabled={enviando}
          placeholder="De qué va este proyecto"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="proy-crit">Criterios de relevancia</Label>
        <p className="text-xs text-muted-foreground">
          Qué SÍ y qué NO cuenta como relevante. Es lo que lee el filtro para decidir cada video:
          si acá no dice qué rechazar, casi todo pasa.
        </p>
        <Textarea
          id="proy-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={7}
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
      <Pie cambiado={cambiado} enviando={enviando} resultado={resultado} onGuardar={enviar} />
    </>
  );
}

// ── Las altas ────────────────────────────────────────────────────────────────

export function AltaVoz({ onListo }: { onListo: () => void }) {
  const vacio: FormVoz = { nombre: "", descripcion: "", criterios_relevancia: "", activo: false };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearVozNueva(form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
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
      <div className="space-y-1">
        <Label htmlFor="alta-voz-crit">Criterios de la voz (opcional)</Label>
        <Textarea
          id="alta-voz-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={4}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Nace apagada: prendela cuando tenga proyectos y referentes cargados.
      </p>
      <Pie
        cambiado={form.nombre.trim() !== ""}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        etiqueta="Crear voz"
      />
    </>
  );
}

export function AltaProyecto({ voces, onListo }: { voces: OpcionVoz[]; onListo: () => void }) {
  // Arranca con un número puesto, no vacío: el N es obligatorio y un campo en blanco haría
  // rebotar el alta por lo único que nadie espera tener que completar.
  const vacio: FormProyecto = {
    nombre: "",
    descripcion: "",
    criterios_relevancia: "",
    vozId: voces[0]?.id ?? "",
    activo: false,
    n: "15",
  };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearProyectoNuevo(form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="alta-proy-nombre">Nombre</Label>
          <Input
            id="alta-proy-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            placeholder="El tema del que va a traer videos"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-proy-voz">Voz</Label>
          <Select
            id="alta-proy-voz"
            value={form.vozId}
            onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
            disabled={enviando}
          >
            {voces.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Select>
        </div>
        <CampoN valor={form.n} onChange={(n) => setForm((f) => ({ ...f, n }))} enviando={enviando} />
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
          rows={6}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Nace apagado: prendelo cuando tenga referentes asignados.
      </p>
      <Pie
        cambiado={form.nombre.trim() !== ""}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        etiqueta="Crear proyecto"
      />
    </>
  );
}
