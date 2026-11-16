# Ventana de publicación BT-V1 · Biblioteca técnica

Única ventana de la fase Biblioteca (`blueprints/vector-biblioteca/blueprint.md`). La prepara la sesión coordinadora; **publica el dueño**. Claude nunca toca producción.

## Qué trae

Etiquetas `bt-01` a `bt-24`:

- **Biblioteca** (`/taller/biblioteca`, menú "Conocimiento"): buscador por código exacto, nombre o síntoma; ocho categorías; ficha de variante con especificaciones, compatibilidad, procedimientos, documentos e historial; procedimientos paso a paso; comparador de compatibilidad por conjunto; herramientas y especificaciones con "Sin dato verificado" cuando no hay fuente; documentos según su licencia.
- **Propuestas** de cada taller y **revisión central** (`/taller/biblioteca/revision`, solo el curador): versiones inmutables, diferencia contra la versión vigente, publicación con evento y reindexación.
- **Asistente técnico** con citas, confianza y cuotas; en modo **solo fuentes** mientras `AI_PROVIDER` no sea `anthropic`.
- **Pestaña Biblioteca en cada orden**: contexto técnico de la bici, asistente con alcance de la orden y diagnóstico técnico que solo se guarda al tocar "Agregar al diagnóstico". No cambia precios, pagos, inventario, aprobaciones ni el estado de la orden.

## Migraciones

Tres migraciones, todas **aditivas** (sin `DROP`, sin `RENAME`):

| Migración | Qué hace |
|---|---|
| **`0035_huge_wild_child.sql`** | Crea las ocho tablas globales del catálogo (`manufacturers`, `component_families`, `component_models`, `component_variants`, `knowledge_sources`, `technical_documents`, `technical_specifications`, `tools_consumables`). Agrega `users.library_curator` con valor `false`. |
| **`0036_careless_junta.sql`** | Crea conocimiento, procedimientos, compatibilidad y la capa privada (`knowledge_articles`, `article_versions`, `article_variant_links`, `diagnostic_rules`, `document_chunks` con índice GIN `spanish`, `procedures`, `procedure_steps`, `procedure_specs`, `compatibility_rules`, `compatibility_rule_members`, `knowledge_proposals`, `proposal_reviews`, `publication_events`, `technical_diagnoses`, `private_technical_notes`, `ai_interactions`). |
| **`0037_fantastic_donald_blake.sql`** | Agrega `bike_components.component_variant_id` (nulo, con clave foránea a `component_variants`) y su índice. |

## Precondiciones

1. Taller cerrado: nadie usando `/taller` ni reservando en ese momento.
2. Respaldo de la base de producción del día (Replit → *Database* → puntos de restauración).
3. Fase 2 publicada (migraciones hasta `0034` aplicadas).
4. `main` en el tag `bt-24` (o posterior), con `pnpm gate` en verde en el Mac, y subido a GitHub.

## Pasos en Replit

En la pestaña **Shell** del workspace, uno por uno:

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

```bash
corepack pnpm@12.4.2 db:migrate
```

```bash
corepack pnpm@12.4.2 db:check
```

```bash
corepack pnpm@12.4.2 library:import
```

```bash
corepack pnpm@12.4.2 library:check
```

```bash
rm -rf node_modules
```

Después, **Deployments → Republish**.

## Después de publicar

1. Marcar al curador central (el dueño) en la base de producción, desde la pestaña *Database* de Replit:

   ```sql
   update users set library_curator = true where email = '<correo del dueño>';
   ```

2. Entrar a `/taller/biblioteca` y buscar `RD-M8100-SGS`: debe aparecer como coincidencia exacta.
3. Abrir `/taller/biblioteca/asistente` y hacer una pregunta: debe decir "Modo: solo fuentes" y citar el artículo importado.
4. Opcional: para usar el modelo de lenguaje, agregar en *Secrets* `AI_PROVIDER=anthropic` y `ANTHROPIC_API_KEY`, y volver a publicar.

## Reversión

La biblioteca no toca ninguna tabla existente salvo dos columnas nuevas. Para retirarla:

1. Publicar el commit anterior a `bt-01` (la app vieja ignora las tablas nuevas; no hace falta borrarlas).
2. Solo si se decide eliminarlas, en una publicación aparte y con respaldo, el dueño corre en la base:

   ```sql
   alter table bike_components drop column component_variant_id;
   drop table ai_interactions, private_technical_notes, technical_diagnoses, publication_events,
     proposal_reviews, knowledge_proposals, compatibility_rule_members, compatibility_rules,
     procedure_specs, procedure_steps, procedures, document_chunks, diagnostic_rules,
     article_variant_links, article_versions, knowledge_articles, tools_consumables,
     technical_specifications, technical_documents, knowledge_sources, component_variants,
     component_models, component_families, manufacturers;
   alter table users drop column library_curator;
   ```

   Es una contracción manual fuera de `drizzle/`: después hay que generar la migración de contracción en el repositorio para que el esquema y la base coincidan.
