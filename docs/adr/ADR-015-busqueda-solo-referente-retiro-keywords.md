# ADR-015 — Búsqueda solo por referente; eje keyword dormante (no removido)

- **Estado:** aceptada — 2026-06-24 (grilling con Mani sobre las mejoras post-producción). **Deja
  dormante** la señal de [ADR-012](./ADR-012-senal-de-aprendizaje-bi-eje.md) (por tema) y **simplifica
  en la práctica** [ADR-013](./ADR-013-atribucion-multiproyecto-fan-out.md) (mientras el eje keyword esté
  apagado, el fan-out es solo por referente).
- **Contexto:** el motor descubría contenido por **dos ejes**: cuentas de **referente** (sembradas por
  el equipo) y **keywords/hashtags**. En las corridas reales el eje keyword salió caro y desparejo: el
  **IG-hashtag** trae basura sin métricas confiables (los items no traen `followersCount`/`videoViewCount`)
  y se apagó hace rato (F2, cierre 15); el **TikTok-hashtag** en cambio traía contenido on-topic con
  métricas reales. En paralelo el **filtro de relevancia maduró**: el gate (ADR-010) ya juzga cada video
  contra los `criterios_relevancia` del **Proyecto** (principal) ⊕ los de la **Voz** asignada
  (complemento), así que para curar hoy no se necesita el hashtag como proxy. Pero Mani quiere
  **conservar la opción de volver** al eje TikTok-keyword (tenía valor) y, más adelante, montar un motor
  de recomendación que lo aproveche (ver Consecuencias). Borrarlo entero sería difícil de retomar.
- **Decisión:**
  1. **Búsqueda referente-only por ahora, en ambas plataformas.** El motor descubre desde las cuentas de
     `Referentes` (Instagram por `directUrls`, TikTok por `profiles`). El eje keyword **no corre**.
  2. **El eje TikTok-keyword queda DORMANTE tras un flag global, default OFF** (`buscar_keyword_tiktok`
     en `Config`/`Ajustes`). Toda su cablería (`Leer Keywords`, `kw_to_proj`, `tt_hashtags`, el reclamo
     por tema en `Asignar`, `signalTema`, `v_senal_tema`) se conserva **inerte** — son no-op condicionales
     cuando el flag está off / no hay keywords. Retomar = prender el flag + mostrar la página. **El
     IG-keyword se retira de verdad** (confirmado muerto; no es "futuro").
  3. **El filtro de contenido es criterios de Proyecto ⊕ Voz, y nada más** (ADR-010). El Proyecto fija
     el tema (base); la Voz le da el enfoque del cliente (complemento, no manda). Sin refuerzo de keyword.
  4. **Se conserva la tabla `Keywords`** (Airtable), pero se **oculta su página del dashboard** para que
     el equipo no la use mientras el eje está dormante. Se **retiran los 4 toggles de eje del Proyecto**
     (los reemplaza el flag global; con referente-only la plataforma la da `Referente.plataforma` y el
     pausado su `activo`).
  5. **La señal por tema queda INERTE, no revertida:** sin escribir `Candidatos.tema`, `v_senal_tema`
     devuelve vacío y el boost por tema es 0. **No se borra** — es el substrato del futuro motor de
     recomendación. **Queda el aprendizaje por referente** (`v_senal_seleccion`), el eje que de hecho
     acumula señal (el referente reaparece corrida a corrida).
  6. **Fan-out (ADR-013) sin cambios de código:** mientras el flag esté off, un video lo reclama solo
     el/los referente(s) dueños → sigue saliendo como (video, proyecto) múltiple cuando un referente
     está ligado a varios proyectos activos. Al prender el flag, vuelve el reclamo por keyword.
- **Alternativas descartadas:**
  - *Borrar el eje keyword entero (tabla + código + schema):* lo más limpio para el JSON de hoy, pero
    difícil de retomar y quema el substrato del motor de recomendación. Dado que el código keyword ya es
    condicional (no-op cuando no hay keywords), dejarlo dormante cuesta **menos** que removerlo y es más
    reversible. Se prefiere dormante.
  - *Dejar el TikTok-keyword activo ya:* sigue gastando Apify/Supadata/Claude en descubrimiento ciego
    cuando el objetivo de esta etapa es ahorrar créditos y la fuente curada (referente) rinde más por
    crédito. Se apaga por ahora, reversible.
  - *Conservar también el IG-keyword dormante:* no aporta (basura sin métricas, confirmado en 2 runs);
    mantenerlo solo agrega cablería muerta. Se retira.
- **Consecuencias:**
  - (+) Menos crédito quemado: el motor solo procesa lo que viene de cuentas elegidas a mano.
  - (+) Modelo más simple en operación (un solo eje activo, un solo filtro), sin perder la opción de
    volver al TikTok-keyword (un flag) ni el substrato de aprendizaje por tema.
  - (+) **Habilita una fase futura (post-MVP): motor de recomendación / discovery asistido.** Leería el
    histórico de candidatos **aprobados** (referente, métricas, tema, transcript) para proponer (a)
    **referentes nuevos** parecidos a los activos y (b) **keywords/frases TikTok** que describan el
    contenido que el equipo viene aceptando → cierra el loop de aprendizaje. Es un workflow aparte que
    corre sobre `outputs`; **no se construye en este refactor**, solo se preserva su substrato. Anotado
    en ROADMAP como dirección futura.
  - (−) El `workflow.json` carga nodos dormidos (peso cognitivo). Aceptable: son no-op condicionales y
    el flag documenta el estado.
  - (−) Una tabla `Keywords` vacía/oculta puede confundir si alguien la encuentra. Mitigación: página
    escondida del dashboard + esta ADR como referencia.
  - (−) Se pierde el descubrimiento de cuentas nuevas vía hashtag mientras el eje esté off. Mitigación:
    el equipo agrega referentes a mano (más confiable); a futuro, el motor de recomendación los propone.
- **Toca `core/`:** `core/contracts/airtable-cockpit.md` (saca `Candidatos.tema` del flujo activo y los
  4 toggles; nota la tabla `Keywords` como dormante), `setup-airtable.mjs` (no crea los 4 toggles; el
  flag `buscar_keyword_tiktok`), `core/schema/006_senal_tema_bieje.sql` (se nota dormante, **no se borra**).
  El glosario `docs/agents/context.md` (Keyword pasa a dormante; Referente = fuente activa). El motor:
  `Config`/`Armar plan` (flag `buscar_keyword_tiktok`, off ⇒ no arma hashtags ni lee keywords),
  `Asignar`/`Heat-score` quedan igual (las ramas keyword se vuelven no-op). **Pendiente manual en la base
  viva:** ocultar la página `Keywords` del dashboard, borrar los 4 toggles del Proyecto, retirar la rama
  IG-keyword. *(Supabase queda inerte: `v_senal_tema` sin tocar; histórico viejo intacto.)*
