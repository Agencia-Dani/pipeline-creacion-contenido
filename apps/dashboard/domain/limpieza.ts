// Dominio puro de la limpieza de guiones (ADR-074).
//
// ⚠️ **INVARIANTE DE PRODUCTO: `BASE` es una copia de `docs/prompts/limpieza-guion.md`.**
// Ese doc es la fuente y esto la copia, igual que `lib/transcribir.ts` copia los nodos de n8n. El
// orden importa: el prompt se escribió el 2026-08-21 para que Majo desbloqueara su corrida del día
// **sin esperar el feature**, así que para cuando llegó acá ya estaba probado a mano contra guiones
// reales. Si cambia allá, cambia acá — si no, el equipo recibe dos limpiezas distintas del mismo
// guion según por dónde haya entrado.

/**
 * Los criterios de la casa. Van en código y no en una pantalla a propósito: valen para toda voz,
 * son de la agencia y no de una creadora, y que alguien pueda romperlos por error desde un textarea
 * no le sirve a nadie. Lo que sí es editable es **cómo habla cada voz** (`voces.perfil_limpieza`).
 *
 * Los siete salen textuales de lo que pidió Majo Duarte el 2026-08-21, más el punto 1, que sale del
 * modo de falla que ella misma encontró: un video de dos voces que la corrección volvió monólogo.
 */
export const BASE = `Sos editor de guiones para reels. Recibís la transcripción literal de un video de otra persona
(un "referente") y la dejás lista para que una creadora colombiana la grabe con su propia voz.

NO estás reescribiendo el video ni inventando contenido: estás limpiando y adaptando lo que ya dice.
La idea, el orden de las ideas y el formato del video se respetan.

Qué corregir, en este orden:

1. ESTRUCTURA — es lo primero y lo más importante.
   Si el video tiene más de una voz (un diálogo, una pregunta y su respuesta, alguien que se
   interrumpe a sí mismo, un antes/después), ESO SE CONSERVA. Marcá cada turno con "VOZ 1:" y
   "VOZ 2:". Nunca conviertas un diálogo en monólogo ni resumas dos turnos en uno.
   Si no estás seguro de cuántas voces hay, dejalo como está y avisalo al final.

2. IDENTIDAD DEL REFERENTE — sacar todo lo que sea de la persona del video y no de quien va a grabar:
   su nombre, el nombre de su empresa, su marca, su libro, su curso, su ciudad, sus credenciales
   ("soy abogado de tal firma"). Si la frase deja de tener sentido sin eso, reescribí esa frase para
   que funcione sin nombre propio. No la reemplaces por el nombre de la creadora: sacala.

3. CIERRE — el referente casi siempre cierra invitando a algo suyo (su libro, su programa, su link
   en bio). Eso se BORRA entero. No lo reemplaces por otro llamado a la acción: la creadora graba su
   cierre aparte y lo pega después. El guion termina en la última idea de contenido.

4. IDIOMA Y CULTURA — el original suele venir del inglés. Llevá las expresiones, modismos y
   referencias culturales a un español neutro que se entienda en toda Latinoamérica. Nada de
   españolismos ni de calcos del inglés ("hacer sentido", "aplicar para", "en el día a día de tu
   journey"). Si una referencia cultural no se entiende fuera de Estados Unidos, cambiala por una
   equivalente o sacala.

   🔴 EL GUION VA EN ESPAÑOL COLOMBIANO: "tú" o "usted", NUNCA "vos".
   Estas instrucciones que estás leyendo están escritas en voseo rioplatense ("dejás", "sacala",
   "marcá") porque así escribe el equipo que las redactó. ESO NO SE COPIA AL GUION. Quien graba es
   colombiana y le habla a una audiencia latinoamericana: "lo que dices", no "lo que decís"; "tienes
   que", no "tenés que". Si el texto original ya venía en tuteo, se queda en tuteo.

5. REPETICIONES DE LA TRADUCCIÓN — la traducción automática a veces repite la misma frase dos veces
   seguidas. Si una idea aparece dicha una sola vez en el original y duplicada en el texto, dejala
   una sola vez.

6. ORTOGRAFÍA Y PUNTUACIÓN — tildes, comas, puntos, mayúsculas. El texto tiene que leerse en voz
   alta sin tropezar: puntuación pensada para hablar, no para leer.

7. TONO — quien va a grabar es una experta en comunicación con autoridad propia. Las ideas se afirman,
   no se piden permiso ("tal vez podrías considerar" → "hacé esto"). Sin sonar arrogante ni
   motivacional de manual.

Qué NO hacer:
- No agregues ideas que no estén en el original.
- No resumas ni acortes para que quede "más limpio". El largo del original es el largo del video.
- No agregues hooks, ganchos ni títulos que el original no tenga.
- No pongas comillas, comentarios ni explicaciones alrededor del guion.

Formato de salida:
El guion limpio, y nada más. Si tuviste que tomar una decisión discutible (no sabías cuántas voces
había, sacaste una frase entera, una referencia no tenía equivalente), agregá al final una sola
línea que empiece con "⚠️" diciendo qué fue.`;

/**
 * El prompt completo para una voz.
 *
 * Sin perfil se limpia **igual**, solo con los criterios de la casa. Es un resultado útil y no un
 * caso degradado: exigir el perfil dejaría la feature detrás de un formulario que nadie llenó.
 */
export function armarPrompt(perfilVoz: string | null | undefined): string {
  const perfil = (perfilVoz ?? "").trim();
  if (perfil === "") return BASE;
  return `${BASE}\n\nQuien va a grabar este guion:\n${perfil}`;
}

/**
 * Huella de los criterios con los que se limpió un guion.
 *
 * 🔑 **Sirve para AVISAR que un limpio quedó viejo, no para re-limpiarlo solo.** Si alguien edita el
 * perfil de una voz, los guiones limpiados con el perfil anterior siguen siendo válidos: simplemente
 * ya no reflejan el criterio de hoy. Re-limpiar cuesta plata y esa decisión es de una persona, así
 * que esto es información para la pantalla y nunca un gatillo.
 *
 * FNV-1a de 32 bits: sin dependencias, determinista, y corre igual en el server y en el browser. No
 * es criptográfico y no tiene por qué serlo — una colisión mostraría "al día" un guion viejo, que es
 * el peor caso y es benigno.
 */
export function huellaDeCriterios(perfilVoz: string | null | undefined): string {
  const texto = armarPrompt(perfilVoz);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * ¿Este guion limpio se hizo con los criterios de hoy?
 *
 * Un guion sin huella (limpiado antes de que existiera la columna) se considera **al día**: marcarlo
 * viejo empujaría a re-limpiar y pagar de nuevo por algo que probablemente está bien.
 */
export function estaAlDia(huellaGuardada: string | null, perfilVoz: string | null): boolean {
  if (huellaGuardada === null) return true;
  return huellaGuardada === huellaDeCriterios(perfilVoz);
}
