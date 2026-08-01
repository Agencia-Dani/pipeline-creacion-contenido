import { cn } from "@/lib/utils";

// El `<select>` nativo con la caja del `<Input>`. Estaba escrito a mano en cuatro pantallas con
// la misma tira de clases y dos alturas distintas (h-9 acá, h-8 allá), que es lo que hacía que
// las columnas de controles se vieran como escalones.
//
// Nativo a propósito: trae teclado, búsqueda por tipeo y el picker del sistema operativo en
// móvil. Un combobox de librería tendría que reimplementar las tres para verse igual.
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
