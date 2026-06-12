# 08 — fuentes_validadas.md (Fase 8, Mensaje 15)

> La lista final de fuentes ACTIVAS — la que el cron diario realmente usa. **No incluyas credenciales reales en git.**

## Mensaje 15 — Consolidar la lista final

```
Consolida la lista final de fuentes ACTIVAS — las que realmente
vamos a usar en el cron diario.

Por cada una en formato:

[Nombre]
- URL: [...]
- Tier: [1/2/3]
- Acceso: [Directo / PDF compartido / Suscripción / Resumen
  alternativo en X fuente]
- Frecuencia esperada de hallazgos: [diaria / semanal / cada N semanas]
- Tipo de contenido que aporta: [news / análisis / caso de uso /
  reporte / señal temprana]
- Workaround si está bloqueada: [...]

Guarda como fuentes_validadas.md V1.0. Esta es la lista que el cron
diario usa. Si una fuente NO está en esta lista y aparece en tu
research, pasa por los 6 criterios antes de usarla y me avisas para
evaluarla.
```

---

## Plantilla de la lista (rellénala y mantenla versionada)

```
FUENTES VALIDADAS — {{NEWSLETTER_NOMBRE}} — [fecha] — V1.0

TIER 1 — Usamos directamente
- [Fuente] · [URL] · Acceso: [Directo] · Freq: [diaria] · Tipo: [análisis]
- ...

TIER 2 — Con verificación adicional
- [Fuente] · [URL] · Acceso: [...] · ...

TIER 3 — Solo contexto, nunca fuente única
- [LinkedIn de ejecutivos · posts X · blogs sin referencia externa]

FUENTES ESPECIALES — [contexto regional / nicho]
- [Fuente regional] · [URL] · ...

BLOQUEADAS PERO ACTIVAS (vía workaround)
- [Fuente] · Workaround: [PDF compartido — el bot avisa, yo bajo]
```
