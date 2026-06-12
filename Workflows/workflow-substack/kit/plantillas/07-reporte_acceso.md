# 07 — reporte_acceso.md (Fase 8, Mensajes 13–14) ⭐

> **La fase que la mayoría salta — y por eso su sistema falla en la semana 2.** Una lista hermosa de 14 fuentes no sirve si 5 bloquean y 3 tienen paywall. Aquí el bot prueba el acceso real y resuelven los bloqueos uno por uno.

## Mensaje 13 — Reporte de acceso real

```
Ahora la prueba dura. Por cada fuente de fuentes_candidatas.md,
intenta entrar AHORA mismo y dame un reporte de acceso real:

✅ ACCESO COMPLETO — entras sin restricción
⚠️ ACCESO PARCIAL — paywall, bot detection, Cloudflare, pero hay vuelta
❌ BLOQUEADO — no entras ni con vuelta

Por cada una incluye:
- Estado de acceso ahora
- Si está bloqueada → razón técnica (Cloudflare 403, paywall,
  timeout, bot detection)
- Alcance real de cobertura (cuánto contenido nuevo publican por
  semana en mi tema)
- Última fecha que pudiste ver contenido nuevo

Y una columna extra: ¿qué puedo hacer YO para desbloquearte?
(suscripción, registro gratis, compartirte cookies, mandarte PDFs,
darte credenciales, etc.)

Guarda el reporte como reporte_acceso.md V1.0.
```

## Mensaje 14 — Resolver los bloqueos uno por uno

```
De las fuentes bloqueadas, tomemos decisiones:

[Para cada fuente bloqueada]
FUENTE: [nombre]
DECISIÓN:
  ( ) Suscribirme — vale la pena por [X razón]
  ( ) PDF compartido — yo te mando reportes cuando salgan
  ( ) Credenciales — te paso usuario/contraseña de registro gratis
  ( ) Fuente de respaldo — usamos resúmenes en [otra fuente]
  ( ) Descartar — no compensa el costo/fricción

Después de mis decisiones, propónme el flujo concreto para cada
fuente bloqueada que SÍ vamos a usar. Si elijo "PDF compartido",
¿cómo funciona? ¿Tú detectas que salió el reporte? ¿Cómo me avisas?
```

> **El flujo "PDF compartido" que funcionó** (verbatim): el bot vigila vía fuentes accesibles (Reuters, MIT Sloan, HBR) cuándo sale un reporte de una fuente bloqueada (McKinsey/BCG), te avisa con el link, tú lo bajas en 2 min y se lo mandas, él extrae los datos. Tú no monitoreas nada — él vigila, tú ejecutas solo cuando vale la pena. (McKinsey/BCG publican reportes relevantes cada 2-3 meses.)
