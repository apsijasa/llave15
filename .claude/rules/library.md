---
description: Biblioteca técnica compartida, asistente con citas y diagnósticos en la orden
paths:
  - "src/server/library/**"
  - "src/pages/taller/biblioteca/**"
  - "src/pages/taller/ordenes/[id]/biblioteca.astro"
  - "src/components/taller/library/**"
  - "src/data/library/**"
  - "scripts/library-*.ts"
---

# Biblioteca técnica

- Decisiones en `blueprints/vector-biblioteca/BIBLIOTECA.md` (BT-D1 a BT-D17).
- **Dos capas.** Las tablas del conocimiento global (catálogo, artículos, versiones, procedimientos, compatibilidad, documentos, fuentes, `document_chunks`, revisiones y eventos de publicación) no llevan `branch_id` (BT-D1). Las privadas (`knowledge_proposals`, `technical_diagnoses`, `private_technical_notes`, `ai_interactions`) llevan `branch_id NOT NULL` y toda consulta filtra por `actor.branchId`.
- Del contenido global solo se muestra lo publicado: artículo `publicado` y su `current_version_id`. Una propuesta nunca aparece en búsqueda, fichas ni asistente.
- **Versiones inmutables.** Nunca `update` sobre una fila de `article_versions`: publicar crea la versión siguiente, deja `publication_events` y reindexa en la misma transacción (`publish.ts`). `document_chunks` es un índice derivado: se borra y se regenera (`chunks.ts`, `reindexAll`).
- **Curador** = `can(role, "library.curate")` y `users.library_curator` (`canCurate` en `access.ts`). La cola y el detalle de revisión nunca devuelven sucursal, autor ni datos del taller.
- **Asistente.** El proveedor se inyecta (`ai-provider.ts`: `none` o `anthropic`); las pruebas usan uno falso. Cuota antes de recuperar; recuperación con alcance antes del modelo (`retrieval.ts`); la política va en `system` y las fuentes como datos escapados; ninguna llamada de red dentro de una transacción; la pregunta y la respuesta se guardan redactadas. Una cifra con unidad que no está en las fuentes citadas baja la confianza a `no_verificada`.
- **Nada de valores técnicos sin fuente.** Una especificación `verificado` exige documento (CHECK); sin dato se muestra "Sin dato verificado". La compatibilidad nunca se infiere por número de velocidades.
- **La biblioteca nunca escribe en la orden**: ni `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10). El diagnóstico se guarda solo por un POST explícito, con referencias versionadas.
- Documentos: enlace por defecto; el archivo de una copia autorizada se sirve solo por `/taller/biblioteca/documentos/<id>/archivo` (BT-D16).
- Propuestas: `detectPii` marca teléfono, RUT, correo y patente; aprobar con datos personales exige confirmar la revisión.
- Pantallas: ninguna isla, solo tokens, estados con forma y texto, `SITE.name`.
