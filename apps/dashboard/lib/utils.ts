import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Separador de miles. Estaba copiado igual en Sugeridos, Feed e Históricos. */
export const miles = (n: number) => new Intl.NumberFormat("es-AR").format(n)
