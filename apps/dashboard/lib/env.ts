/**
 * Lee una env var obligatoria, o explota diciendo cuál falta.
 *
 * Estaba copiada **palabra por palabra** en `lib/transcribir.ts`, `lib/limpiar.ts` y `lib/ia.ts`.
 * Doce líneas idénticas en tres lugares no es un problema de tamaño: es que el día que una de las
 * tres necesite decir algo distinto (un fallback, un aviso), las otras dos se quedan atrás sin que
 * nadie se entere.
 *
 * Fail-loud a propósito: una key ausente tiene que romper al primer uso, no devolver `undefined`
 * y fallar más adelante con un 401 que no dice de dónde vino.
 */
export function leerClave(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en las env vars (gestor de contraseñas).`);
  return valor;
}
