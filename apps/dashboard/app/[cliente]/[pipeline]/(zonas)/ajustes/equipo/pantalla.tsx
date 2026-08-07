"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Rol } from "@/domain/roles";
import type { Miembro } from "@/lib/equipo";
import { usarCockpit } from "../../usar-cockpit";
import { cambiarRol, invitar, quitarAcceso, type Resultado } from "./actions";

// La pantalla de equipo. **Todo lo que decide acá es cosmética**: el `<select>` no ofrece `dev` a
// un sponsor, pero quien manda es la Server Action (ADR-060 §4). Si las dos discreparan, el
// servidor gana y la pantalla muestra su mensaje.

const ETIQUETA: Record<Rol, string> = {
  operador: "Operador — califica el feed y opera el motor",
  sponsor: "Sponsor — todo lo del operador, y además da y quita accesos",
  dev: "Dev — todo, incluidos los costos de proveedor",
};

const CORTO: Record<Rol, string> = {
  operador: "Operador",
  sponsor: "Sponsor",
  dev: "Dev",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

export function Equipo({
  miembros,
  otorgables,
  yo,
}: {
  miembros: Miembro[];
  otorgables: readonly Rol[];
  yo: string;
}) {
  return (
    <div className="space-y-6">
      <Invitar otorgables={otorgables} />

      <Card>
        <CardHeader>
          <CardTitle>Quiénes entran</CardTitle>
          <CardDescription>
            {miembros.length === 1
              ? "Una persona con acceso a esta empresa."
              : `${miembros.length} personas con acceso a esta empresa.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {miembros.map((m) => (
            <Fila key={m.usuarioId} miembro={m} otorgables={otorgables} soyYo={m.usuarioId === yo} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Invitar({ otorgables }: { otorgables: readonly Rol[] }) {
  const cockpit = usarCockpit();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>(otorgables[0] ?? "operador");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () => {
    startTransition(async () => {
      const r = await invitar(cockpit, { nombre, email, rol });
      setResultado(r);
      if (r.ok) {
        setNombre("");
        setEmail("");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitar a alguien</CardTitle>
        <CardDescription>
          Le llega un mail con un link para entrar. Queda en <strong>esta</strong> empresa: no hay
          dónde elegirla, así que no hay dónde equivocarse.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="equipo-nombre">Nombre</Label>
            <Input
              id="equipo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="María José"
              disabled={enviando}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="equipo-email">Mail</Label>
            <Input
              id="equipo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@empresa.com"
              disabled={enviando}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="equipo-rol">Rol</Label>
          <select
            id="equipo-rol"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            disabled={enviando}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {otorgables.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={enviar} disabled={enviando || !nombre.trim() || !email.trim()}>
            {enviando ? "Invitando…" : "Invitar"}
          </Button>
          {resultado && (
            <p className={`text-sm ${resultado.ok ? "text-muted-foreground" : "text-destructive"}`}>
              {resultado.mensaje}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Fila({
  miembro,
  otorgables,
  soyYo,
}: {
  miembro: Miembro;
  otorgables: readonly Rol[];
  soyYo: boolean;
}) {
  const cockpit = usarCockpit();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, startTransition] = useTransition();

  // Si su rol actual no está entre los que puedo otorgar, no puedo tocárselo: bajarle el rol a un
  // dev y no poder devolvérselo sería una puerta de un solo sentido.
  const puedoTocar = otorgables.includes(miembro.rol);

  const accion = (fn: () => Promise<Resultado>) =>
    startTransition(async () => {
      setResultado(await fn());
      setConfirmando(false);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {miembro.nombre}
          {soyYo && <span className="ml-2 text-xs text-muted-foreground">(vos)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {miembro.email ?? "sin mail visible"} · desde {fecha(miembro.desde)}
        </p>
        {resultado && (
          <p className={`text-xs ${resultado.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {resultado.mensaje}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {puedoTocar && !soyYo ? (
          <select
            value={miembro.rol}
            onChange={(e) => accion(() => cambiarRol(cockpit, miembro.usuarioId, e.target.value))}
            disabled={enviando}
            className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs"
          >
            {otorgables.map((r) => (
              <option key={r} value={r}>
                {CORTO[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">{CORTO[miembro.rol]}</span>
        )}

        {/* Quitar el acceso no se deshace con Ctrl+Z: dos clics, como el borrado de ADR-045. */}
        {!soyYo && puedoTocar && (
          confirmando ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={enviando}
                onClick={() => accion(() => quitarAcceso(cockpit, miembro.usuarioId))}
              >
                Confirmar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                No
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
              Quitar
            </Button>
          )
        )}
      </div>
    </div>
  );
}
