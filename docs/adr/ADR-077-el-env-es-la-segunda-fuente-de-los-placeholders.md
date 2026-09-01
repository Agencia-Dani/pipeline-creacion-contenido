# ADR-077 — El `.env` es la segunda fuente de los placeholders (y el idioma desconocido se traduce)

- **Estado:** aceptada · **construida** — 2026-08-26 (con Mani). Extiende
  [ADR-053](./ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md) (el push por API) y
  arregla un fallo mudo del nodo `Transcribir` que venía de
  [ADR-031](./ADR-031-transcriptor-a-pedido.md). **Toca `core/`:** `core/scripts/n8n-sync.mjs`.

## Contexto — dos problemas que aparecieron juntos

### 1. El motor no traducía lo que no reconocía

Salió de contestar una pregunta de Mani: *"¿el sistema soporta cuentas de referentes en cualquier
idioma?"*. **Sí las soporta** — la cadena entera es agnóstica y `Heat-score v1` hasta le da
`boost_idioma` +0.3 a todo lo no-español, o sea que las **favorece** (medido el 26/08: 207 de 209
candidatos del Feed son `en`). Pero el nodo `Transcribir (Supadata)` cerraba así:

```js
const idioma = c.lang || guessLang(c.txt) || d.idioma_guess || 'es';
```

`guessLang` es un diccionario de stopwords que sólo conoce **es/en/pt/it/fr**. A ese `|| 'es'` sólo
se llega cuando Supadata no dijo el idioma **y** el diccionario marcó **cero** coincidencias en los
cinco —español incluido—, o sea **justo cuando ya se sabe que el texto no es español**. Y como el
gate de `Traducir` es `idioma !== 'es'`, decir `'es'` ahí significaba **saltear la traducción**: al
equipo le llegaba el guion en japonés, alemán o árabe, sin un solo error en el log.

🩸 **Y rompía un invariante escrito.** `apps/dashboard/lib/transcribir.ts` abre diciendo *"esto tiene
que producir el MISMO script literal que el motor"*, pero el transcriptor de la app hace
`idioma === "es" ? texto : traducir(texto)` ⇒ con `lang` vacío **sí traducía**. El mismo video daba
dos resultados distintos según por qué puerta entró. Además la app **etiquetaba `'es'`** un guion que
acababa de traducir, que es afirmar lo contrario de lo que hizo.

### 2. Arreglarlo destapó que el nodo era imposible de empujar

`n8n-sync.mjs` aprende los placeholders **alineando el string del repo con su gemelo del live**, y
para un `jsCode` ese string es **el nodo entero**. Editar el código rompe la alineación de ese nodo.
Y `<SUPADATA_API_KEY>` aparece **1 sola vez en todo el repo**, así que no hay otro nodo del que
aprenderlo.

> **El nodo se volvía imposible de empujar exactamente cuando alguien lo quería cambiar**, que es el
> único momento en que importa. El push moría fail-closed (bien) y no ofrecía salida (mal).

## Decisión

**1. El default del idioma pasa de `'es'` a `'otro'`.** No inventa vocabulario: `'otro'` es el valor
que `normLang` (nodo `Armar candidato`) ya usa para *"fuera de los cinco"*, así que la tarjeta lo
muestra igual que hoy muestra los no reconocidos, y `Traducir` lo agarra porque su gate es
`idioma !== 'es'`.

**2. La app etiqueta `'otro'`, no `'es'`.** Traducía bien y mentía en la etiqueta. Con esto las dos
puertas producen el mismo script **y** la misma etiqueta, que es lo que el invariante de
`lib/transcribir.ts` pedía.

**3. 🔒 El contraejemplo es parte de la decisión.** Un transcript **español sin `lang`** lo sigue
cazando `guessLang` *antes* del default, así que no se traduce y no se paga Haiku para convertir
español en español. El arreglo no es un "traducí todo": es "traducí lo que no reconocés". Está
clavado en `test-nodos.mjs` como tercer caso, al lado de los dos positivos.

**4. El `.env` es la segunda fuente de los placeholders, nunca la primera.** `completarConEnv` corre
**sólo sobre los que quedaron pendientes** después de aprender del live, así que **el live sigue
mandando** y un valor aprendido jamás se pisa. Si no está en ninguno de los dos, el push **muere
igual**. Es la fuente natural: el `.env` de la raíz ya es *"el hub único"* de estas credenciales por
CLAUDE.md §Convenciones.

**5. Y lo dice en voz alta, sin decir el valor.** El push imprime en amarillo qué placeholders salieron
del `.env` y no del live. Si el `.env` estuviera desactualizado, esa línea es la única que lo delata
antes de escribir en producción.

## Alternativas descartadas

- **Dejar el `|| 'es'`.** Es el estado que se vino arreglando: un fallo que no falla.
- **Traducir siempre, sin consultar `guessLang`.** Paga Haiku por convertir español en español y
  arriesga que un literal se reescriba, contra ADR-009.
- **Un valor nuevo tipo `'desconocido'`.** Obliga a enseñarle la palabra a `normLang`, a la tarjeta y
  al equipo, para decir lo mismo que `'otro'` ya dice.
- **Editar el nodo a mano en n8n.** Es lo que ADR-053 vino a eliminar, y deja repo y live divergiendo
  en los comentarios.
- **Re-import del motor.** Crea un workflow con id nuevo y arrastra los otros 4 placeholders. Para un
  cambio de `parameters` es desproporcionado.
- **Que `sustituir` resuelva desde el `.env` siempre, antes del live.** Invierte la autoridad: el live
  es la verdad y el `.env` una copia que puede envejecer.
- **Alinear el `jsCode` por líneas en vez de por string entero**, para que aprender sobreviva a una
  edición. Es el arreglo de fondo del aprendizaje y es más grande; el `.env` lo destraba hoy sin
  tocar el aprendizaje. Queda anotado como la mejora real si vuelve a molestar.

## Consecuencias

- (+) Un video en cualquier idioma llega traducido, que es lo que el sistema decía hacer.
- (+) El motor y el transcriptor de la app vuelven a coincidir: mismo script **y** misma etiqueta.
- (+) Cualquier nodo con un placeholder único vuelve a ser empujable después de editarlo.
- (+) **Fail-closed intacto**, verificado y no asumido: `npm run n8n:test` da **15 ok · 0 fallidos**, y
  su caso de fail-closed sigue abortando porque `<<WEBHOOK_URL_MOTOR>>` **no** existe en el `.env` con
  ese nombre. La red no se aflojó.
- (−) El `.env` puede envejecer y quedar distinto del live. Mitigado por el orden (live primero) y por
  el aviso en amarillo. **Antes de este push se verificó que la `SUPADATA_API_KEY` del `.env` es
  idéntica a la del live** (comparación de igualdad, sin imprimir el valor) — o sea que la primera
  aplicación fue, para ese placeholder, provablemente un no-op.
- (−) Un video **sin habla reconocible** en un idioma raro ahora paga una llamada de Haiku que antes
  no pagaba. Es el precio de no perder el guion, y `Traducir` ya tiene presupuesto y fail-open.
- (−) La causa de fondo sigue viva: **el aprendizaje de placeholders no sobrevive a editar un
  `jsCode`**. Esto le da una salida, no la arregla.
