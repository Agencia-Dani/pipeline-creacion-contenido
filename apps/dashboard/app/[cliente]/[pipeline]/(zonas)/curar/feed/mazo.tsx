"use client";

import { rutaDe } from "@/domain/rutas";
import { usarCockpit } from "../../usar-cockpit";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AgregarAColeccion } from "@/components/video/agregar-a-coleccion";
import { GrillaVideos, GrupoPlegable } from "@/components/video/grupos";
import { BarraOrden, usarOrden } from "@/components/video/orden";
import { BarraSeleccion, BotonSeleccionar, usarSeleccion } from "@/components/video/seleccion";
import { BotonArchivar } from "../../operar/boton-archivar";
import { cn } from "@/lib/utils";
import {
  agrupar,
  agruparPorCorrida,
  ajustarCuentas,
  ETIQUETA_FILTRO,
  FILTRO_INICIAL,
  FILTROS,
  type Calificacion,
  type CandidatoFeed,
  type Filtro,
  type Grupo,
} from "@/domain/feed";
// 🔴 `ordenar` sale del dominio, NO del componente: `orden.tsx` no lo re-exporta.
import { ordenar, type CriterioOrden, type Faceta } from "@/domain/orden";
import { calificarCandidato, calificarSeleccion, leerMazo } from "./actions";
import { Detalle } from "./detalle";
import { Tarjeta } from "./tarjeta";

// El mazo: agrupado por proyecto, heat descendente adentro, filtro arriba, **entero**.
//
// 🔑 **La regla sigue siendo la misma: una tarjeta calificada NO se va del mazo hasta que se
// cambia de filtro o se recarga.** Lo que cambió es quién la sostiene. Antes había un congelado
// (`visibles`) que se recalculaba solo al cambiar de filtro, porque la lista se filtraba en el
// cliente y un `filter()` vivo habría hecho desaparecer la tarjeta de abajo del cursor —
// convirtiendo un misclick sobre 145 tarjetas en algo irrecuperable desde la pantalla
// (plan-cockpit §D6.4).
//
// Desde que el filtro se aplica **en la query**, ese congelado quedó sin trabajo y se borró:
// `cargados` solo cambia cuando se le pide algo al server (cambiar de filtro), y calificar no le
// pide nada. O sea que la regla dejó de depender de que alguien mantenga un `Set` sincronizado y
// pasó a ser **estructural**. Si algún día el filtro volviera al cliente, el congelado tiene que
// volver con él.
//
// Los contadores de los chips salen igual de los cuatro `head` counts del server más los cambios
// de esta sesión (`ajustarCuentas`), y no de `cargados`: el chip de "🔥" tiene que decir cuántos
// hay **en la tabla**, no cuántos hay en el filtro que está abierto.

// Los ejes de orden y filtro del mazo (ADR-076).
//
// 🔑 **A nivel de módulo**: `usarOrden` memoiza contra estas referencias.
//
// El Feed es la única de las cuatro pantallas que tiene `engagement` y `relevanciaScore` en su
// tipo, así que es la única que puede ofrecerlos. **Sin `heat`**: el mazo ya viene ordenado por
// heat descendente y ese ES el default ("Lo que muestra la pantalla"); ofrecerlo otra vez sería el
// mismo orden con otro nombre.
const CRITERIOS: readonly CriterioOrden<CandidatoFeed>[] = [
  { clave: "likes", etiqueta: "Likes", valor: (c) => c.likes },
  { clave: "views", etiqueta: "Vistas", valor: (c) => c.views },
  { clave: "seguidores", etiqueta: "Seguidores", valor: (c) => c.seguidores },
  { clave: "engagement", etiqueta: "Interacción", valor: (c) => c.engagement },
  { clave: "relevancia", etiqueta: "Relevancia", valor: (c) => c.relevanciaScore },
  { clave: "titulo", etiqueta: "Título A-Z", valor: (c) => c.titulo },
];

// 🔑 **La corrida va primero**: es la pregunta que trae a alguien a esta barra ("¿qué trajo la
// corrida de anoche?"), y el idioma es un afinado. Las dos son facetas de las que MIRAN (ADR-076
// §4): nadie edita la corrida ni el idioma de un candidato desde la pantalla, así que un `.filter()`
// vivo no puede hacer desaparecer una tarjeta de abajo del cursor.
//
// **Corrida no es criterio de ORDEN**, a propósito: el mazo ya llega ordenado por heat y una fecha
// de corrida no es una métrica del video. Y la faceta se apaga sola cuando no aporta — `usarOrden`
// sólo dibuja las que tienen 2+ valores, así que un feed de una sola corrida no muestra un control
// que no hace nada.
const FACETAS: readonly Faceta<CandidatoFeed>[] = [
  { clave: "corrida", etiqueta: "Corrida", valor: (c) => c.corrida },
  { clave: "idioma", etiqueta: "Idioma", valor: (c) => c.idioma },
];

export function Mazo({
  inicial,
  cuentas,
  descartesPendientes,
}: {
  inicial: CandidatoFeed[];
  cuentas: Record<Filtro, number>;
  descartesPendientes: number;
}) {
  const cockpit = usarCockpit();
  const seleccion = usarSeleccion();
  const [avisoSeleccion, setAvisoSeleccion] = useState<string | null>(null);
  const [cargados, setCargados] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [puestas, setPuestas] = useState<Record<string, Calificacion>>({});
  // La calificación que la fila tenía EN EL SERVER la primera vez que se la tocó en esta sesión.
  // Es lo que hace exacto el ajuste de los contadores: re-clickear tres emojis sobre la misma
  // tarjeta tiene que valer un solo delta, y el delta tiene que sobrevivir a un cambio de filtro
  // (que recarga las filas, pero no los conteos).
  const [originales, setOriginales] = useState<Record<string, Calificacion | null>>({});
  // ⚠️ `plegados` es estado propio y separado: plegar es solo dejar de dibujar un grupo, no tocar
  // qué está cargado. Arranca vacío — todo desplegado, que es el comportamiento de siempre.
  //
  // 🔑 **Las claves llevan prefijo** (`p:`, `c:`, `c:…/p:…`) desde que hay dos modos de agrupar: sin
  // eso, plegar el proyecto "Ansiedad" en un modo lo dejaría plegado en el otro, y peor, un grupo de
  // corrida y un proyecto que se llamaran igual serían el mismo estado.
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  // Agrupar por corrida es un nivel ARRIBA del proyecto, nunca en lugar de él: los criterios de
  // relevancia son por proyecto y mezclarlos vuelve inconsistente el juicio (`domain/feed.ts`).
  // Por eso esto es un modo de vista y no un criterio de la barra de orden.
  const [porCorrida, setPorCorrida] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [cargando, startCargar] = useTransition();
  // Va acá arriba con los demás hooks y no donde se calcula `grupos` (que vive justo antes del
  // `return`): ahí funcionaría hoy sólo porque no hay ningún early return por encima, y sería una
  // trampa para el próximo que agregue uno.
  const orden = usarOrden(cargados, CRITERIOS, FACETAS);

  const efectiva = (c: CandidatoFeed): Calificacion | null => puestas[c.id] ?? c.calificacion;

  const ajustadas = ajustarCuentas(
    cuentas,
    Object.entries(puestas).map(([id, despues]) => ({ antes: originales[id] ?? null, despues })),
  );

  function alternarPlegado(clave: string) {
    setPlegados((p) => {
      const s = new Set(p);
      if (!s.delete(clave)) s.add(clave);
      return s;
    });
  }

  /**
   * Cambiar de filtro es pedirle al server el mazo de ESE filtro. Sigue yendo al server aunque ya
   * no haya paginación, y es a propósito: es lo que mantiene el congelado sin escribirlo (ver la
   * nota de arriba). Filtrar `cargados` en memoria haría desaparecer del mazo la tarjeta que
   * alguien acaba de calificar.
   *
   * El chip se marca recién cuando las filas llegaron. Si se marcara antes y la carga fallara, la
   * pantalla quedaría diciendo que el filtro es uno mientras muestra las tarjetas de otro.
   */
  function cambiarFiltro(nuevo: Filtro) {
    if (nuevo === filtro || cargando) return;
    setErrorLista(null);
    startCargar(async () => {
      const r = await leerMazo(cockpit, nuevo);
      if (!r.ok) {
        setErrorLista(r.mensaje);
        return;
      }
      setFiltro(nuevo);
      setCargados(r.candidatos);
    });
  }

  function calificar(c: CandidatoFeed, calificacion: Calificacion) {
    const anterior = efectiva(c);
    // Optimista: sobre un mazo largo, esperar el ida y vuelta en cada click mata el ritmo. Si
    // falla, se revierte y la tarjeta muestra el error — nunca queda mintiendo.
    setOriginales((o) => (c.id in o ? o : { ...o, [c.id]: c.calificacion }));
    setPuestas((p) => ({ ...p, [c.id]: calificacion }));
    setErrores(({ [c.id]: _, ...resto }) => resto);
    setEnviando((e) => new Set(e).add(c.id));

    startTransition(async () => {
      const r = await calificarCandidato(cockpit, c.id, calificacion);
      setEnviando((e) => {
        const s = new Set(e);
        s.delete(c.id);
        return s;
      });
      if (!r.ok) {
        setPuestas((p) => {
          const copia = { ...p };
          if (anterior === null) delete copia[c.id];
          else copia[c.id] = anterior;
          return copia;
        });
        setErrores((e) => ({ ...e, [c.id]: r.mensaje }));
      }
    });
  }

  /**
   * Calificar lo seleccionado.
   *
   * 🔒 **La única acción del lote que pregunta**, y no por prudencia genérica: las otras tres se
   * deshacen (quitar de una colección, desmarcar un grabado) o ya preguntan (archivar). Un 👎 sobre
   * 40 videos los manda a descartes de un clic, y volver es calificar los 40 de nuevo a mano.
   */
  function calificarLote(calificacion: Calificacion) {
    const ids = seleccion.claves;
    if (ids.length === 0) return;
    if (
      calificacion === "👎" &&
      !confirm(`Vas a descartar ${ids.length} videos. Deshacerlo es calificarlos de a uno.`)
    ) {
      return;
    }

    // Mismo optimista que el botón por tarjeta, y con el mismo cuidado de `originales`: el delta de
    // los contadores tiene que valer una sola vez por tarjeta aunque se la re-califique.
    setOriginales((o) => {
      const copia = { ...o };
      for (const id of ids) {
        if (!(id in copia)) copia[id] = cargados.find((c) => c.id === id)?.calificacion ?? null;
      }
      return copia;
    });
    setPuestas((p) => {
      const copia = { ...p };
      for (const id of ids) copia[id] = calificacion;
      return copia;
    });
    seleccion.limpiar();

    startTransition(async () => {
      const r = await calificarSeleccion(cockpit, ids, calificacion);
      setAvisoSeleccion(r.mensaje);
      // Fail-loud y sin revertir a medias: en lote no se sabe **cuáles** fallaron, así que
      // inventar un rollback parcial pintaría una mentira distinta. Se le vuelve a pedir el mazo al
      // server, que es la única fuente que sabe la verdad.
      if (!r.ok) {
        setPuestas({});
        setOriginales({});
        startCargar(async () => {
          const mazo = await leerMazo(cockpit, filtro);
          if (mazo.ok) setCargados(mazo.candidatos);
        });
      }
    });
  }

  // 🔑 Se filtra ANTES de agrupar (`orden.visibles`) y se re-ordena DESPUÉS, dentro de cada grupo.
  // Son dos pasos y no uno porque `agrupar()` ordena por heat adentro de cada grupo — está en su
  // contrato y las otras pantallas dependen de eso, así que pisaría el criterio elegido. Con el
  // criterio en `null` (el default) el segundo `ordenar` no hace nada y el mazo queda como siempre.
  //
  // 🔴 Ordenar NO aplana los grupos: `domain/feed.ts` tiene escrito que los criterios de relevancia
  // son por proyecto y mezclarlos vuelve inconsistente el juicio. Un control de orden no re-litiga
  // eso (ADR-076 §6).
  const criterio = CRITERIOS.find((c) => c.clave === orden.claveCriterio) ?? null;
  const reordenar = (g: Grupo<CandidatoFeed>) => ({
    ...g,
    candidatos: ordenar(g.candidatos, criterio, orden.direccion),
  });
  const grupos = agrupar(orden.visibles).map(reordenar);
  // El agrupado por corrida delega el nivel de adentro a `agrupar()`, así que el criterio elegido
  // se aplica exactamente igual: una sola implementación del orden, en los dos modos.
  const gruposCorrida = porCorrida
    ? agruparPorCorrida(orden.visibles).map((g) => ({ ...g, proyectos: g.proyectos.map(reordenar) }))
    : [];
  const abierto = cargados.find((c) => c.id === abiertoId) ?? null;
  const pendientes = ajustadas["sin-calificar"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            disabled={cargando}
            onClick={() => cambiarFiltro(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
              filtro === f ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
            )}
          >
            {ETIQUETA_FILTRO[f]} <span className="text-muted-foreground">{ajustadas[f]}</span>
          </button>
        ))}
        {/* La barra convive con los chips de calificación y NO se unifica con ellos: aquéllos
            filtran un atributo mutable y por eso van a la query (ADR-034 / ADR-076 §4). */}
        <BarraOrden orden={orden} />
        {/* 🔑 **Agrupar y filtrar por corrida conviven, y no es redundancia.** La faceta "Corrida"
            de la barra contesta *"mostrame SOLO lo de anoche"*; el toggle contesta *"mostrame todo,
            separado por corrida"*. Son dos preguntas distintas y la segunda no se puede hacer
            filtrando. */}
        <button
          type="button"
          onClick={() => setPorCorrida((v) => !v)}
          aria-pressed={porCorrida}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            porCorrida ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
          )}
        >
          Agrupar por corrida
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {/* Archivar vive acá y en Operar, el mismo componente (ver `boton-archivar.tsx`). Acá
              porque es donde alguien termina de calificar: hasta hoy, para que lo calificado
              llegara al histórico había que esperar al domingo o descubrir que existe otra zona. */}
          <BotonArchivar variante="feed" />
          {cargados.length > 0 && <BotonSeleccionar seleccion={seleccion} />}
        </span>
      </div>

      {avisoSeleccion && (
        <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          {avisoSeleccion}
        </p>
      )}

      {cargados.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === "sin-calificar"
            ? "No queda nada por calificar. El motor deja candidatos nuevos en cada corrida."
            : "Nada en este filtro."}
        </p>
      ) : (
        (() => {
          // La grilla de un grupo de proyecto, una sola vez: la dibujan los dos modos y duplicarla
          // habría sido dos lugares donde arreglar cada cosa de la tarjeta.
          const grilla = (g: Grupo<CandidatoFeed>) => (
            <GrillaVideos>
              {g.candidatos.map((c) => (
                <Tarjeta
                  key={c.id}
                  candidato={c}
                  puesta={efectiva(c)}
                  enviando={enviando.has(c.id)}
                  error={errores[c.id] ?? null}
                  onCalificar={(cal) => calificar(c, cal)}
                  onAbrir={() => setAbiertoId(c.id)}
                  seleccion={
                    seleccion.activo
                      ? { marcado: seleccion.marcado(c.id), onAlternar: () => seleccion.alternar(c.id) }
                      : undefined
                  }
                />
              ))}
            </GrillaVideos>
          );

          if (!porCorrida) {
            return grupos.map((g) => (
              <GrupoPlegable
                key={g.proyecto}
                titulo={g.proyecto}
                conteo={g.candidatos.length}
                plegado={plegados.has(`p:${g.proyecto}`)}
                onAlternar={() => alternarPlegado(`p:${g.proyecto}`)}
              >
                {grilla(g)}
              </GrupoPlegable>
            ));
          }

          // Corrida afuera, proyecto adentro: el nivel de adentro es el de siempre, con su mismo
          // componente y su mismo orden por heat.
          return gruposCorrida.map((gc) => (
            <GrupoPlegable
              key={gc.corrida}
              titulo={gc.corrida}
              conteo={gc.total}
              plegado={plegados.has(`c:${gc.corrida}`)}
              onAlternar={() => alternarPlegado(`c:${gc.corrida}`)}
            >
              <div className="space-y-4 border-l-2 pl-3">
                {gc.proyectos.map((g) => (
                  <GrupoPlegable
                    key={g.proyecto}
                    titulo={g.proyecto}
                    conteo={g.candidatos.length}
                    plegado={plegados.has(`c:${gc.corrida}/p:${g.proyecto}`)}
                    onAlternar={() => alternarPlegado(`c:${gc.corrida}/p:${g.proyecto}`)}
                  >
                    {grilla(g)}
                  </GrupoPlegable>
                ))}
              </div>
            </GrupoPlegable>
          ));
        })()
      )}

      <BarraSeleccion seleccion={seleccion}>
        <AgregarAColeccion
          seleccion={seleccion}
          urlPorClave={(id) => cargados.find((c) => c.id === id)?.urlReferente ?? null}
          onListo={(mensaje) => setAvisoSeleccion(mensaje)}
        />
        {/* Los tres emojis y no un menú: es el mismo gesto que la tarjeta, con la misma forma.
            *Grabado* no está y no es un olvido — un candidato del Feed todavía no se grabó. */}
        {(["🔥", "👍", "👎"] as const).map((cal) => (
          <Button
            key={cal}
            type="button"
            size="sm"
            variant="outline"
            disabled={seleccion.cuantos === 0}
            onClick={() => calificarLote(cal)}
          >
            {cal}
          </Button>
        ))}
      </BarraSeleccion>

      {errorLista && <p className="text-sm text-destructive">{errorLista}</p>}

      {/* El pie ya no ofrece cargar más: están todas. Sigue diciendo el número porque es lo que
          contesta "¿cuánto me falta?" de un vistazo, y porque `cargados` y el chip pueden diferir
          por un instante mientras una calificación viaja. */}
      {cargados.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {/* 🩸 Con una faceta prendida esto decía "146 tarjetas." mostrando 2, y eso se lee como un
              bug aunque el número sea correcto. El total sigue saliendo de `cargados` —nunca de lo
              visible, que es la regla del tope de este archivo— y lo que se agrega adelante es
              cuántas de esas está dejando pasar el filtro. Sin filtro, la frase no cambia. */}
          {orden.visibles.length < cargados.length && `${orden.visibles.length} de `}
          {cargados.length} {cargados.length === 1 ? "tarjeta" : "tarjetas"}.
        </p>
      )}

      {/* El encadenamiento con los descartes. Va SIEMPRE al pie del mazo, no solo al terminar
          la cola: condicionarlo a "0 pendientes" sonaba bien y no se dispararía casi nunca —
          son 145 por semana y nadie los despacha de una sentada, así que la invitación no
          llegaría justo en las sesiones normales. Lo que cambia con la cola vacía es el énfasis,
          no la existencia. El costo de no verla es alto: 0 auditorías desde que la tabla existe,
          y el archivado las borra cada domingo. */}
      {descartesPendientes > 0 && (
        <div
          className={cn(
            "rounded-lg border p-4",
            pendientes === 0 ? "border-primary/40 bg-primary/5" : "border-dashed",
          )}
        >
          <p className="font-medium">
            {pendientes === 0
              ? `Terminaste el feed. Quedan ${descartesPendientes} descartes por auditar.`
              : `Y quedan ${descartesPendientes} descartes por auditar.`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Son los videos que el filtro mató por poco. Decir cuáles eran buenos es lo que corrige
            los criterios — y el domingo se borran.
          </p>
          <Button asChild size="sm" variant={pendientes === 0 ? "default" : "outline"} className="mt-3">
            <Link href={rutaDe(cockpit, "curar/descartes")}>Auditar los descartes</Link>
          </Button>
        </div>
      )}

      <Detalle
        candidato={abierto}
        puesta={abierto ? efectiva(abierto) : null}
        enviando={abierto ? enviando.has(abierto.id) : false}
        onCalificar={(cal) => abierto && calificar(abierto, cal)}
        onCerrar={() => setAbiertoId(null)}
      />
    </div>
  );
}
