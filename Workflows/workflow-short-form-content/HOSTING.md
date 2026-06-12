# Hosting — Propuesta y pendientes

> Estado: **propuesta / pendiente de ejecutar**. Documento de planificación, no es parte del entregable.
> Fecha de investigación: 2026-06-11.

## TL;DR — la decisión

**Nos quedamos en n8n** (no reescribir a script puro ni migrar a Make/Zapier).

**Ruta de hosting elegida (en 2 fases):**

1. **Ahora → arrancar en managed self-hosted: PikaPods (~$3.80/mes) o InstaPods (~$3/mes).**
   n8n autohospedado, ejecuciones ilimitadas, persistencia incluida, **sin administrar servidor**. Ideal para nuestra carga (1 corrida/semana por cliente) y para clonar el workflow por cliente.
2. **Después → migrar a VPS Hetzner + PostgreSQL + Docker Compose** cuando haya suficientes clientes para justificar gestionar infra propia (más control, ~mismo precio, más trabajo de mantenimiento).

### Por qué esta ruta

- **El workload es minúsculo:** cron semanal (lunes 8 AM), ~25 ítems por cliente, con `Wait` de 13s entre ítems. No es tiempo real ni alto volumen. El cuello de botella son las APIs externas (Apify, Supadata, Anthropic), no el servidor.
- **n8n Cloud es ~6-8x más caro** ($24/mes mínimo, 2.500 ejecuciones) para algo que un managed self-hosted hace por ~$3-4/mes con ejecuciones ilimitadas.
- **Reescribir a script + cron** ahorraría centavos al mes a cambio de tirar trabajo ya probado. No vale la pena salvo escala grande.
- **Make/Zapier** cobran por paso → nuestro workflow tiene muchos pasos → sale 10x más caro y da menos control sobre el prompt de Claude.

---

## Comparativa de soluciones (¿n8n es lo mejor?)

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **n8n (lo que ya tenemos)** | Workflow ya existe como JSON, visual, fácil de clonar por cliente, retries/logs gratis | Necesita servidor 24/7 para un job semanal | ✅ **Elegida** |
| **Script + cron (Node/Python)** | Más barato (cron/serverless gratis), control total, versionable en git "de verdad" | Hay que reescribir toda la lógica ya funcionando | ❌ No ahora |
| **Make / Zapier** | Cero infra | Caro (cobra por paso), menos control sobre el prompt de Claude | ❌ No |

---

## Comparativa de hosting para n8n

| Opción | Precio aprox. | Persistencia | Admin de servidor | Notas |
|---|---|---|---|---|
| **PikaPods** (managed self-hosted) | ~$3.80/mes | ✅ incluida | ❌ no tocás nada | **Fase 1 — recomendado** |
| **InstaPods** (managed self-hosted) | ~$3/mes | ✅ incluida | ❌ no tocás nada | Alternativa a PikaPods |
| **VPS Hetzner CX22 / CAX11 + Docker** | ~€4-5/mes | ✅ (vos la configurás) | ✅ sí | **Fase 2** — mejor control/precio |
| **n8n Cloud (Starter)** | $24/mes (2.500 ejec.) | ✅ gestionada | ❌ no | Caro para nuestro volumen |
| **Railway** | Pay-as-you-go | Requiere plan pago para volúmenes | parcial | Facturación menos predecible |
| **Render** | $7/mes (Starter, evita spin-down) | Requiere config | parcial | Free tier hace spin-down → no sirve para cron |

⚠️ **Multi-cliente:** evitar el contenedor único con **SQLite** por defecto. Para varios clientes/workflows usar **PostgreSQL** para persistencia (en VPS o en el managed que ya lo provea). Un contenedor único con SQLite puede **perder data al redeployar**.

---

## Plan de ejecución

### Fase 1 — PikaPods / InstaPods (objetivo inmediato)

- [ ] Crear cuenta en PikaPods (o InstaPods) y levantar una instancia de n8n.
- [ ] Confirmar que el plan incluye **persistencia** y, si es posible, **PostgreSQL** (no SQLite) para soportar multi-cliente.
- [ ] Configurar dominio/subdominio + HTTPS (la mayoría de los managed lo dan out-of-the-box).
- [ ] Importar `workflow.json` (`Workflows → Import from File`).
- [ ] **Re-mapear credenciales OAuth** de Google Sheets y Gmail (no viajan en el JSON; hay que reconectarlas en la instancia nueva).
- [ ] Reemplazar los placeholders de API keys en URLs/headers: `<APIFY_TOKEN>`, `<ANTHROPIC_API_KEY>`, `<SUPADATA_KEY>`, etc.
- [ ] Completar los placeholders `<<...>>` del cliente (ver checklist del [README](./README.md)). Recordar que `<<CATEGORIA_1>>`…`<<CATEGORIA_5>>` deben **coincidir** entre el nodo de Claude y el parser.
- [ ] Verificar que `pinData` quede vacío (`{}`) — si trae pins, los nodos devuelven data fija en vez de scrapear.
- [ ] Crear/confirmar la pestaña de Google Sheets destino con los **encabezados exactos** que escribe el parser.
- [ ] Ejecutar el workflow manualmente una vez (sin esperar al cron) para validar end-to-end.
- [ ] Verificar que el **cron de lunes 8 AM** quede activo y en la zona horaria correcta.
- [ ] Confirmar que el email resumen (Gmail) llega bien.

#### Por cliente nuevo (operación recurrente)

- [ ] Duplicar el workflow.
- [ ] Completar los `<<...>>` específicos de ese cliente/voz.
- [ ] Re-mapear credenciales si usa cuentas de Google distintas.
- [ ] Crear su pestaña/sheet destino.
- [ ] Probar una corrida manual antes de activarlo.

### Fase 2 — Migración a VPS Hetzner (cuando escale)

> Disparador sugerido: cuando la cantidad de clientes/volumen justifique gestionar infra propia, o se necesite control que el managed no da.

- [ ] Contratar VPS Hetzner (CX22 o CAX11, ~€4-5/mes, ≥4GB RAM recomendable; mínimo 1GB para no crashear; ~30-50GB disco).
- [ ] Instalar Docker + Docker Compose.
- [ ] Levantar stack con **PostgreSQL** para persistencia (y Redis + workers solo si hace falta paralelizar — probablemente **no** para nuestro volumen).
- [ ] Configurar dominio + reverse proxy (Caddy/Traefik/nginx) con HTTPS.
- [ ] Configurar variables de entorno de n8n (encryption key, host, webhook URL, credenciales DB).
- [ ] Exportar workflows + credenciales de PikaPods/InstaPods e importarlos.
- [ ] **Backups automáticos** de la base PostgreSQL + del volumen de n8n.
- [ ] Plan de actualización de la imagen de n8n (cómo y cuándo actualizar versión).
- [ ] Monitoreo básico / alerta si una corrida semanal falla.

#### Requisitos de infra a tener presentes (multi-cliente)

- Un contenedor único **no** maneja bien workflows concurrentes y pierde data al redeploy.
- Arquitectura robusta: **PostgreSQL** (persistencia) + **Redis** (cola, opcional) + **workers** dedicados (paralelismo, opcional). Para 1 corrida/semana probablemente alcanza Postgres solo.
- El host **debe** soportar volúmenes persistentes (no contenedores efímeros).

---

## Pendientes / decisiones abiertas

- [ ] Elegir definitivamente entre **PikaPods vs InstaPods** (chequear cuál ofrece Postgres y mejor backup en el plan barato).
- [ ] Definir política de **backups** desde Fase 1 (¿el managed los hace? ¿exportamos workflows a git periódicamente?).
- [ ] Definir **zona horaria** del cron (lunes 8 AM, ¿de qué huso?).
- [ ] Estimar costo total mensual cuando haya N clientes (¿una instancia compartida con varios workflows, o una por cliente?).
- [ ] (Opción a evaluar) Versionar/exportar los workflows a este repo de forma periódica como respaldo.

---

## Fuentes (investigación 2026-06-11)

- [n8n Pricing 2026: Cloud vs Self-Hosted | InstaPods](https://instapods.com/blog/n8n-pricing/)
- [The Real Cost of Self-Hosting n8n in 2026 — ExpressTech](https://expresstech.io/the-real-cost-of-self-hosting-n8n-in-2026/)
- [How to Self-Host n8n in 2026 (4 Methods Compared) — ExpressTech](https://expresstech.io/how-to-self-host-n8n-in-2026-4-methods-compared/)
- [How to self-host n8n: setup, architecture, pricing (2026) — Northflank](https://northflank.com/blog/how-to-self-host-n8n-setup-architecture-and-pricing-guide)
- [6 Best Servers to Host n8n in 2026 — Flowlyn](https://flowlyn.com/blog/best-servers-to-host-n8n)
- [Best Cloud Providers for Self-Hosted n8n in 2026 — Sliplane](https://sliplane.io/blog/what-cloud-provider-should-you-use-for-self-hosted-n8n)
- [Self-Hosting n8n: Production-Ready Architecture on Render](https://render.com/articles/self-hosting-n8n-a-production-ready-architecture-on-render)
- [n8n VPS Comparison: Hostinger vs Railway vs DigitalOcean vs Render — DEV](https://dev.to/thesohailjafri/n8n-vps-comparison-hostinger-vs-railway-vs-digitalocean-vs-render-3phn)
