# 01 — whisper_config.md (Fase 1, Mensaje 3)

> **Cómo usar:** pega este bloque para forzar la instalación local de Whisper. **No le des API keys de Groq/OpenAI/Deepgram** — el bot puede instalar Whisper en su propio servidor. Tras su confirmación, mándale un audio de prueba y verifica la transcripción.

```
Voy a hablarte mucho por voz, así que necesitas transcribir audio
desde el día uno. Pero NO voy a darte API keys de terceros (Groq,
OpenAI, Deepgram). En vez de eso quiero que instales Whisper
directamente en tu servidor.

Whisper es open source de OpenAI, se instala vía pip (openai-whisper),
necesita ffmpeg en el sistema, y corre 100% local. Tú tienes acceso
a tu propio entorno — sabes cómo hacerlo.

Reglas no negociables:
1. NO me pides API keys ni credenciales de servicios pagos
2. NO me dices "no puedo" ni "necesito X de tu parte" — tú resuelves
3. Si una dependencia falla en tu entorno, encuentras la forma:
   - Otra versión del paquete
   - Modelo más liviano (whisper-tiny / whisper-base si recursos limitados)
   - Reinstalar con flags diferentes
   - Lo que haga falta
4. Cuando termines, lo validas mandándome de vuelta la transcripción
   de un audio de prueba que yo te voy a mandar después de tu confirmación
5. Guardas la configuración en whisper_config.md en el workspace
   (modelo usado, ruta del binario, comando para invocar)

Arranca ahora. Cuando termines me dices "Whisper listo, mándame
un audio para validar". Sin excusas en el medio.
```

> Si falla → recuérdale las reglas y que se autoresuelva. No retrocedas a una API key de pago.
