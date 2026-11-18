BG-01 · Guardias: literales del taller y paridad de expectativas

## Contexto y autorización (Andrés, 18-nov)

Primer paso de la fase llave15 (decisión 57, `blueprints/bike-garage/FASE-BIKE-GARAGE.md`). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-01 — Guardias: literales del taller y paridad de expectativas (E1-T1)"**, y en `blueprints/bike-garage/tasks.json` (tarea `E1-T1`). Ese bloque manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Hoy `CLAUDE.md` (regla 14) dice que una prueba guardiana impide escribir el nombre del taller en `src/`, pero esa prueba no existe. Este paso la crea con una línea base de las ocurrencias actuales (que se vacía al cerrar la etapa 2), y crea el script que vuelve decidible la regla de paridad de la fase: ninguna prueba existente cambia lo que espera hasta la etapa 2.

Sin decisión nueva: es parte de la decisión 57.

## Lee antes

`AGENTS.md`; `blueprints/bike-garage/blueprint.md` (encabezado, "Paridad" y "Regla transversal", y el bloque de BG-01); `.claude/rules/shops.md`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit. Pruebas primero, en rojo; después el código; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate`, el Verify completo y el Checkpoint con el tag `bg-01`).

## Qué hacer (resumen del bloque del blueprint)

Exactamente estos cuatro archivos nuevos, ninguno más:

1. **`tests/unit/shop-literals.test.ts`**: recorre todo `src/` y cuenta por archivo las ocurrencias no superpuestas de los nueve patrones `Vector Bikes`, `Vitacura`, `Las Condes`, `Kennedy`, `vectorbikes`, `vector.bikes`, `$15.000`, `85095780`, `8509 5780` (nunca el número suelto `15000`). Falla nombrando archivo y patrón si un archivo con ocurrencias no está en la línea base o supera su conteo. Incluye un caso que escanea un directorio temporal con un archivo que contiene `Vitacura`.
2. **`tests/unit/shop-literals-baseline.json`**: `{ "src/…": n }` con el conteo actual, claves ordenadas. La suma debe igualar `grep -rFoI` con los nueve patrones sobre `src/`.
3. **`scripts/bg-expect-parity.ts`**: `[--base <ref>] [--allow <texto>]… [--skip <ruta>]…`; corre `git diff <ref, por defecto HEAD> -U0 --no-color -- tests e2e`, ignora archivos nuevos y los de `--skip`, compara los multiconjuntos de "colas de matcher" (lista exacta de matchers en el blueprint) de líneas quitadas y agregadas, descarta las que contienen un texto de `--allow`. Sale 0 iguales, 1 distintos (imprime las colas), 2 por uso o si `git` falla. Exporta la función pura `compareMatcherTails(diff, allow)`; el `main` corre solo si `import.meta.url === pathToFileURL(process.argv[1]).href`. Se ejecuta con `node` directo (Node 24 quita tipos): sin sintaxis que no sea borrable (sin `enum`, `namespace`, parameter properties) e imports relativos con extensión `.ts`.
4. **`tests/unit/bg-expect-parity.test.ts`**: prueba `compareMatcherTails` con diffs de texto (cambio de argumento de `.toBe(` → diferencia; cambio fuera del matcher → listas vacías; `allow` ignora colas) y el código 2 con un argumento inválido.

## No cambiar

- Ningún archivo de `src/`, ninguna prueba existente, `e2e/`, `drizzle/`, `package.json`, el lockfile.
- No agregar dependencias. No leer ni escribir archivos de entorno.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: el Verify completo del bloque BG-01 del blueprint y `pnpm gate` → exit 0.

## Reporte

Los cuatro archivos con sus líneas, el total de la línea base y el de `grep` (deben coincidir), la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
