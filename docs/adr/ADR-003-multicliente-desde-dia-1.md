# ADR-003 — Multi-cliente desde el día 1

- **Estado:** aceptada — 2026-06-11
- **Contexto:** el workflow de reels ya es "una copia por cliente" (plantilla con placeholders) y
  el negocio de la agencia es servir a varios clientes. Había que decidir si el modelo de datos y
  la config central conocen la entidad "cliente" desde el inicio o se agrega después.
- **Decisión:** la entidad **`client` existe desde el día 1** en el modelo de datos (tabla
  `clients`, FK en `instances`) y en la config (`clients/<cliente>/<wf>.yaml`), aunque hoy opere
  un solo cliente. Agregar el cliente N+1 = llenar una config + duplicar el workflow en su motor
  + checklist.
- **Alternativas descartadas:**
  - *Modelar solo "contenido de la agencia" y migrar después:* retrofittear la dimensión cliente
    en datos, config, dashboard y convenciones cuesta caro; tenerla desde el inicio cuesta casi
    nada (una tabla y una carpeta).
- **Consecuencias:** (+) el dashboard y los reportes filtran por cliente desde la primera
  corrida; (+) el costo variable se atribuye por cliente (`runs` → `instances` → `clients`);
  (+) se cumple el no-negociable de no mezclar datos entre clientes; (−) una indirección extra
  (instancia = workflow × cliente) que hay que explicar en la documentación.
